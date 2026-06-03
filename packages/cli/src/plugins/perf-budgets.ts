/**
 * Performance Budgets Plugin
 *
 * Collects performance metrics during rendering and enforces budget
 * thresholds. Fails the run (optionally) when budgets are exceeded.
 *
 * @module plugins/perf-budgets
 */

import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type {
  ScreenshotResult,
  DiffResult,
  RunResult,
  FrontguardConfig,
  Route,
  PerfReport,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PerfBudgetConfig {
  /** Performance budgets per metric. */
  budgets: {
    /** Largest Contentful Paint in ms. */
    lcp?: number;
    /** Cumulative Layout Shift. */
    cls?: number;
    /** First Input Delay in ms. */
    fid?: number;
    /** Total Blocking Time in ms. */
    tbt?: number;
    /** Time to First Byte in ms. */
    ttfb?: number;
    /** Max page weight in KB. */
    maxPageWeight?: number;
    /** Max number of requests. */
    maxRequests?: number;
  };
  /** Fail the run if budgets are exceeded (vs just warning). */
  failOnBudgetExceeded?: boolean;
}

// ---------------------------------------------------------------------------
// Metric Types
// ---------------------------------------------------------------------------

export interface PerfMetrics {
  /** Number of resource requests. */
  resources: number;
  /** Total page weight in bytes. */
  pageWeight: number;
  /** Time to First Byte in ms. */
  ttfb: number;
  /** DOM Content Loaded time in ms. */
  domContentLoaded: number;
  /** Largest Contentful Paint in ms (estimated from DOM snapshot). */
  lcp?: number;
  /** Cumulative Layout Shift (estimated). */
  cls?: number;
}

export interface BudgetCheckResult {
  route: string;
  viewport: number;
  metrics: PerfMetrics;
  violations: BudgetViolation[];
  passed: boolean;
}

export interface BudgetViolation {
  metric: string;
  actual: number;
  budget: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Perf Script (injected via metadata for the renderer to pick up)
// ---------------------------------------------------------------------------

/**
 * Script injected into pages to collect performance metrics.
 * Results are stored in a hidden DOM element for extraction from domSnapshot.
 */
export const PERF_COLLECTION_SCRIPT = `
  (function() {
    try {
      var entries = performance.getEntriesByType('resource');
      var navEntries = performance.getEntriesByType('navigation');
      var nav = navEntries[0] || {};
      
      var metrics = {
        resources: entries.length,
        pageWeight: entries.reduce(function(s, r) { return s + (r.transferSize || 0); }, 0),
        ttfb: nav.responseStart ? nav.responseStart - nav.requestStart : 0,
        domContentLoaded: nav.domContentLoadedEventEnd ? nav.domContentLoadedEventEnd - nav.navigationStart : 0,
      };
      
      window.__frontguard_perf = metrics;
      
      var el = document.createElement('script');
      el.type = 'application/json';
      el.id = '__frontguard_perf_data';
      el.textContent = JSON.stringify(metrics);
      document.body.appendChild(el);
    } catch(e) {
      // Silently fail — perf collection is best-effort
    }
  })();
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract perf metrics from a DOM snapshot string.
 */
export function extractMetricsFromSnapshot(domSnapshot: string): PerfMetrics | null {
  const markerStart = 'id="__frontguard_perf_data">';
  const idx = domSnapshot.indexOf(markerStart);
  if (idx === -1) return null;

  const jsonStart = idx + markerStart.length;
  const jsonEnd = domSnapshot.indexOf('</script>', jsonStart);
  if (jsonEnd === -1) return null;

  try {
    return JSON.parse(domSnapshot.slice(jsonStart, jsonEnd)) as PerfMetrics;
  } catch {
    return null;
  }
}

/**
 * Check collected metrics against budget thresholds.
 */
export function checkBudgets(
  metrics: PerfMetrics,
  budgets: PerfBudgetConfig['budgets'],
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  if (budgets.ttfb !== undefined && metrics.ttfb > budgets.ttfb) {
    violations.push({ metric: 'ttfb', actual: metrics.ttfb, budget: budgets.ttfb, unit: 'ms' });
  }

  if (budgets.lcp !== undefined && metrics.lcp !== undefined && metrics.lcp > budgets.lcp) {
    violations.push({ metric: 'lcp', actual: metrics.lcp, budget: budgets.lcp, unit: 'ms' });
  }

  if (budgets.cls !== undefined && metrics.cls !== undefined && metrics.cls > budgets.cls) {
    violations.push({ metric: 'cls', actual: metrics.cls, budget: budgets.cls, unit: '' });
  }

  if (budgets.tbt !== undefined) {
    // TBT is estimated from domContentLoaded — rough proxy
    const estimatedTbt = Math.max(0, metrics.domContentLoaded - 200);
    if (estimatedTbt > budgets.tbt) {
      violations.push({ metric: 'tbt', actual: estimatedTbt, budget: budgets.tbt, unit: 'ms' });
    }
  }

  if (budgets.maxPageWeight !== undefined) {
    const weightKB = metrics.pageWeight / 1024;
    if (weightKB > budgets.maxPageWeight) {
      violations.push({ metric: 'maxPageWeight', actual: weightKB, budget: budgets.maxPageWeight, unit: 'KB' });
    }
  }

  if (budgets.maxRequests !== undefined && metrics.resources > budgets.maxRequests) {
    violations.push({ metric: 'maxRequests', actual: metrics.resources, budget: budgets.maxRequests, unit: 'reqs' });
  }

  return violations;
}

/**
 * Format a metric value for display.
 */
function _formatMetric(value: number | undefined, unit: string): string {
  if (value === undefined) return '-';
  if (unit === 'KB') return `${value.toFixed(0)}KB`;
  if (unit === 'ms' || unit === 's') return `${(value / 1000).toFixed(1)}s`;
  if (unit === 'reqs') return `${value}`;
  return `${value.toFixed(2)}`;
}

function metricKey(routePath: string, viewport: number): string {
  return `${routePath}@${viewport}`;
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a performance budgets plugin.
 *
 * Extracts performance metrics from DOM snapshots in afterRender,
 * checks them against configured budgets in afterCompare, and
 * optionally fails the run when budgets are exceeded.
 *
 * @param config - Performance budget configuration
 * @returns A FrontguardPlugin instance
 */
export function createPerfBudgetPlugin(config: PerfBudgetConfig): FrontguardPlugin {
  const metricsMap = new Map<string, PerfMetrics>();
  const budgetResults: BudgetCheckResult[] = [];
  let hasBudgetFailures = false;

  return {
    name: 'frontguard-perf-budgets',

    // ----- setup -----
    setup(ctx: PluginContext): void {
      const budgetCount = Object.values(config.budgets).filter((v) => v !== undefined).length;

      if (budgetCount === 0) {
        ctx.logger.warn('[frontguard-perf-budgets] no budgets configured — plugin will have no effect');
      }

      // Store perf script in metadata so the renderer can inject it
      ctx.metadata.set('perf:script', PERF_COLLECTION_SCRIPT);
      ctx.metadata.set('perf:budgets', config.budgets);
    },

    // ----- beforeRender — inject perf collection script into config -----
    beforeRender(input: { routes: Route[]; config: FrontguardConfig }): { routes: Route[]; config: FrontguardConfig } {
      return {
        routes: input.routes,
        config: {
          ...input.config,
          _perfScript: PERF_COLLECTION_SCRIPT,
        } as FrontguardConfig & { _perfScript: string },
      };
    },

    // ----- afterRender -----
    afterRender(screenshots: ScreenshotResult[], ctx: PluginContext): void {
      for (const shot of screenshots) {
        const metrics = extractMetricsFromSnapshot(shot.domSnapshot);
        if (metrics) {
          const key = metricKey(shot.route.path, shot.viewport);
          metricsMap.set(key, metrics);
        }
      }

      // Store metrics in shared metadata
      ctx.metadata.set('perf:metrics', new Map(metricsMap));
    },

    // ----- afterCompare -----
    afterCompare(diffs: DiffResult[], ctx: PluginContext): void {
      budgetResults.length = 0;
      hasBudgetFailures = false;

      for (const diff of diffs) {
        const key = metricKey(diff.route.path, diff.viewport);
        const metrics = metricsMap.get(key);

        if (!metrics) continue;

        const violations = checkBudgets(metrics, config.budgets);
        const passed = violations.length === 0;

        if (!passed) hasBudgetFailures = true;

        budgetResults.push({
          route: diff.route.path,
          viewport: diff.viewport,
          metrics,
          violations,
          passed,
        });
      }

      // Store results in metadata
      ctx.metadata.set('perf:results', [...budgetResults]);
      ctx.metadata.set('perf:hasBudgetFailures', hasBudgetFailures);
    },

    // ----- afterRun -----
    afterRun(result: RunResult, ctx: PluginContext): void {
      const total = budgetResults.length;
      const failed = budgetResults.filter((r) => !r.passed).length;

      // Surface results onto the RunResult so reporters can correlate perf
      // budget violations with the visual diff for the same route × viewport
      // (canonical-delivery pattern, mirroring the a11y plugin).
      if (budgetResults.length > 0) {
        result.perf = budgetResults.map(
          (r): PerfReport => ({
            route: r.route,
            viewport: r.viewport,
            metrics: {
              lcp: r.metrics.lcp,
              cls: r.metrics.cls,
              ttfb: r.metrics.ttfb,
              pageWeight: r.metrics.pageWeight,
              resources: r.metrics.resources,
            },
            violations: r.violations,
          }),
        );
      }

      // Store summary in metadata for reporters
      ctx.metadata.set('perf:summary', { total, passed: total - failed, failed });

      if (hasBudgetFailures && config.failOnBudgetExceeded) {
        // Set exit code to indicate failure
        process.exitCode = 1;
      }
    },
  };
}
