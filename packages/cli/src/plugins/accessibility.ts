/**
 * Accessibility audit plugin (Task 5.1).
 *
 * Runs `@axe-core/playwright` against each rendered route, in the same browser
 * pass timeframe as visual regression. Reports WCAG violations with rule id,
 * impact, affected element, and remediation guidance — surfaced in console,
 * HTML, and PR reports.
 *
 * Design:
 * - `@axe-core/playwright` is an **optional** peer dependency. If it (or
 *   Playwright) is unavailable, the plugin warns once and skips — it never
 *   fails the run for a missing dependency.
 * - By default a11y violations are reported as warnings and do **not** fail the
 *   run. Set `failOnViolation: true` to make `serious`/`critical` violations
 *   fail the build.
 * - Results are stored on the plugin context metadata under
 *   {@link ACCESSIBILITY_RESULTS_KEY} so reporters can read them.
 *
 * @module plugins/accessibility
 */

import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type {
  AccessibilityResult,
  AccessibilityViolation,
  AccessibilityImpact,
  ScreenshotResult,
  RunResult,
} from '../core/types.js';
import { logger } from '../utils/logger.js';

/** Metadata key under which a11y results are stored on the context. */
export const ACCESSIBILITY_RESULTS_KEY = 'accessibility:results';

/** Ordered impact levels (ascending severity). */
const IMPACT_ORDER: AccessibilityImpact[] = ['minor', 'moderate', 'serious', 'critical'];

/** Configuration for {@link createAccessibilityPlugin}. */
export interface AccessibilityConfig {
  /**
   * Minimum impact level to report. Violations below this are dropped.
   * Default: `'minor'` (report everything).
   */
  impact?: AccessibilityImpact;
  /** Axe rule ids to include (allowlist). If set, only these run. */
  rules?: string[];
  /** Axe rule ids to exclude (denylist). */
  excludeRules?: string[];
  /**
   * Fail the run when violations at/above `impact` are found.
   * Default: `false` (report as warnings only).
   */
  failOnViolation?: boolean;
}

/** Raw axe results shape (subset we consume). */
export interface RawAxeResults {
  violations: Array<{
    id: string;
    impact?: string | null;
    description: string;
    help: string;
    helpUrl: string;
    nodes: Array<{
      target?: unknown;
      failureSummary?: string;
      html?: string;
    }>;
  }>;
  passes?: unknown[];
  incomplete?: unknown[];
}

/** Returns true if `impact` is at or above the `min` threshold. */
export function meetsImpactThreshold(
  impact: AccessibilityImpact,
  min: AccessibilityImpact,
): boolean {
  return IMPACT_ORDER.indexOf(impact) >= IMPACT_ORDER.indexOf(min);
}

/** Normalises an axe impact string to our enum (defaults to 'minor'). */
export function normalizeImpact(impact?: string | null): AccessibilityImpact {
  return (IMPACT_ORDER as string[]).includes(impact ?? '')
    ? (impact as AccessibilityImpact)
    : 'minor';
}

/**
 * Pure transform: raw axe results → a structured {@link AccessibilityResult},
 * applying the configured impact threshold. Exposed for unit testing.
 */
export function parseAxeResults(
  raw: RawAxeResults,
  route: string,
  viewport: number,
  config: AccessibilityConfig = {},
): AccessibilityResult {
  const min = config.impact ?? 'minor';
  const violations: AccessibilityViolation[] = [];

  for (const v of raw.violations ?? []) {
    const impact = normalizeImpact(v.impact);
    if (!meetsImpactThreshold(impact, min)) continue;
    if (config.rules && !config.rules.includes(v.id)) continue;
    if (config.excludeRules && config.excludeRules.includes(v.id)) continue;

    violations.push({
      id: v.id,
      impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: (v.nodes ?? []).map((n) => ({
        target: Array.isArray(n.target) ? n.target.map(String) : [],
        failureSummary: n.failureSummary,
        html: n.html,
      })),
    });
  }

  return {
    route,
    viewport,
    violations,
    passes: Array.isArray(raw.passes) ? raw.passes.length : 0,
    incomplete: Array.isArray(raw.incomplete) ? raw.incomplete.length : 0,
  };
}

/**
 * Determines whether a set of results should fail the run, given config.
 * Returns the count of run-failing violations (0 = don't fail).
 */
export function countFailingViolations(
  results: AccessibilityResult[],
  config: AccessibilityConfig,
): number {
  if (!config.failOnViolation) return 0;
  const min = config.impact ?? 'serious';
  let count = 0;
  for (const r of results) {
    for (const v of r.violations) {
      if (meetsImpactThreshold(v.impact, min)) count++;
    }
  }
  return count;
}

/**
 * Dynamically loads `@axe-core/playwright`. Returns `null` if unavailable.
 */
async function loadAxe(): Promise<unknown | null> {
  try {
    const mod = await import('@axe-core/playwright');
    return (mod as { default?: unknown }).default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Dynamically loads Playwright. Returns `null` if unavailable.
 */
async function loadPlaywright(): Promise<typeof import('playwright') | null> {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

/**
 * Runs an axe audit against a single URL using a fresh Playwright page.
 * Exposed (non-exported) helper kept small for clarity.
 */
async function auditUrl(
  AxeBuilder: new (args: { page: unknown }) => {
    withRules?: (r: string[]) => unknown;
    disableRules?: (r: string[]) => unknown;
    analyze: () => Promise<RawAxeResults>;
  },
  pw: typeof import('playwright'),
  url: string,
  viewport: number,
  config: AccessibilityConfig,
): Promise<RawAxeResults> {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: viewport, height: 900 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    let builder = new AxeBuilder({ page });
    if (config.rules && builder.withRules) builder = builder.withRules(config.rules) as typeof builder;
    if (config.excludeRules && builder.disableRules) {
      builder = builder.disableRules(config.excludeRules) as typeof builder;
    }
    const results = await builder.analyze();
    await context.close();
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * Creates the accessibility plugin.
 *
 * @param config - Plugin configuration.
 * @returns A {@link FrontguardPlugin}.
 */
export function createAccessibilityPlugin(config: AccessibilityConfig = {}): FrontguardPlugin {
  let axeAvailable = false;
  // Results collected during `afterRender`, surfaced onto the RunResult in
  // `afterRun`. Kept in closure scope so `afterRun` is the canonical delivery
  // path regardless of how the pipeline later reads plugin metadata.
  let collected: AccessibilityResult[] = [];

  return {
    name: 'accessibility',

    async setup(ctx: PluginContext): Promise<void> {
      const axe = await loadAxe();
      const pw = await loadPlaywright();
      axeAvailable = !!axe && !!pw;
      if (!axeAvailable) {
        logger.warn(
          'Accessibility plugin: "@axe-core/playwright" not installed — skipping a11y audits. ' +
            'Install it: npm install -D @axe-core/playwright',
        );
      }
      collected = [];
      ctx.metadata.set(ACCESSIBILITY_RESULTS_KEY, [] as AccessibilityResult[]);
    },

    async afterRender(screenshots: ScreenshotResult[], ctx: PluginContext): Promise<void> {
      if (!axeAvailable) return;
      const axe = (await loadAxe()) as {
        default?: unknown;
        AxeBuilder?: unknown;
      } | null;
      const pw = await loadPlaywright();
      if (!axe || !pw) return;

      // `@axe-core/playwright` default export is the AxeBuilder class.
      const AxeBuilder = (axe as { default?: unknown }).default ?? axe;
      const baseUrl = ctx.config.baseUrl;
      const results: AccessibilityResult[] = [];

      // De-duplicate by route+viewport (browsers don't change a11y outcome).
      const seen = new Set<string>();
      for (const shot of screenshots) {
        const key = `${shot.route.path}:${shot.viewport}`;
        if (seen.has(key)) continue;
        seen.add(key);

        try {
          const url = new URL(shot.route.path, baseUrl).href;
          const raw = await auditUrl(
            AxeBuilder as never,
            pw,
            url,
            shot.viewport,
            config,
          );
          results.push(parseAxeResults(raw, shot.route.path, shot.viewport, config));
        } catch (err) {
          logger.debug(
            `Accessibility audit failed for ${shot.route.path}@${shot.viewport}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      // Keep the closure copy in sync so `afterRun` can surface them onto the
      // RunResult, and retain the metadata write for backward compatibility.
      collected = results;
      ctx.metadata.set(ACCESSIBILITY_RESULTS_KEY, results);

      const totalViolations = results.reduce((n, r) => n + r.violations.length, 0);
      if (totalViolations > 0) {
        logger.info(
          `♿ Accessibility: ${totalViolations} violation(s) across ${results.length} page(s)`,
        );
        const failing = countFailingViolations(results, config);
        if (failing > 0) {
          throw new Error(
            `Accessibility check failed: ${failing} violation(s) at or above the configured impact threshold.`,
          );
        }
      } else {
        logger.debug('Accessibility: no violations found');
      }
    },

    /**
     * Canonical delivery path (Task 5.1): attach the collected
     * {@link AccessibilityResult}s directly onto the {@link RunResult} so
     * reporters can render them without depending on plugin-metadata reads.
     *
     * Falls back to the context metadata if `afterRender` did not run in the
     * same plugin instance (e.g. when the metadata was populated externally),
     * keeping backward compatibility. Idempotent — assigns rather than appends,
     * so there is no double-counting.
     */
    afterRun(result: RunResult, ctx: PluginContext): void {
      let results = collected;
      if (results.length === 0) {
        const fromMeta = ctx.metadata.get(ACCESSIBILITY_RESULTS_KEY);
        if (Array.isArray(fromMeta) && fromMeta.length > 0) {
          results = fromMeta as AccessibilityResult[];
        }
      }
      if (results.length > 0) {
        result.accessibility = results;
      }
    },
  };
}
