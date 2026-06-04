/**
 * Performance Budgets Plugin
 *
 * Collects performance metrics during rendering and enforces budget
 * thresholds. Fails the run (optionally) when budgets are exceeded.
 *
 * @module plugins/perf-budgets
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
  /**
   * Track run-over-run regressions: persist this run's metrics and flag any
   * metric that degraded beyond {@link regressionThreshold} since the last run.
   * Surfaces "↑ since last run" deltas in reports, in addition to static budgets.
   */
  trackRegressions?: boolean;
  /** Directory where per-run metrics are persisted. Default `.frontguard/perf-history`. */
  historyDir?: string;
  /**
   * Relative increase that counts as a regression (0.2 = 20% worse than the
   * previous run). Default `0.2`.
   */
  regressionThreshold?: number;
}

/** Persisted metrics keyed by `route@viewport`, for run-over-run comparison. */
type MetricsHistory = Record<string, PerfMetrics>;

const METRICS_HISTORY_FILE = 'metrics.json';

/** Metrics compared run-over-run. All are "lower is better". */
const TRACKED_METRICS: Array<{
  key: string;
  unit: string;
  /** Returns the comparable value (e.g. bytes → KB), or undefined if absent. */
  valueOf: (m: PerfMetrics) => number | undefined;
}> = [
  { key: 'lcp', unit: 'ms', valueOf: (m) => m.lcp },
  { key: 'cls', unit: '', valueOf: (m) => m.cls },
  { key: 'ttfb', unit: 'ms', valueOf: (m) => m.ttfb },
  { key: 'pageWeight', unit: 'KB', valueOf: (m) => (m.pageWeight !== undefined ? m.pageWeight / 1024 : undefined) },
];

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

/**
 * Computes run-over-run regressions: tracked metrics whose value increased by
 * more than `threshold` (a fraction) relative to the previous run. Pure function,
 * exposed for testing. Metrics absent on either run, or with a non-positive
 * previous value, are skipped (no meaningful baseline to compare against).
 */
export function computePerfRegressions(
  prev: PerfMetrics,
  curr: PerfMetrics,
  threshold: number,
): NonNullable<PerfReport['regressions']> {
  const regressions: NonNullable<PerfReport['regressions']> = [];
  for (const t of TRACKED_METRICS) {
    const prevV = t.valueOf(prev);
    const currV = t.valueOf(curr);
    if (prevV === undefined || currV === undefined || prevV <= 0) continue;
    const deltaPct = (currV - prevV) / prevV;
    if (deltaPct > threshold) {
      regressions.push({ metric: t.key, previous: prevV, current: currV, deltaPct, unit: t.unit });
    }
  }
  return regressions;
}

function loadMetricsHistory(historyDir: string): MetricsHistory {
  const path = join(historyDir, METRICS_HISTORY_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as MetricsHistory;
  } catch {
    return {};
  }
}

function saveMetricsHistory(historyDir: string, history: MetricsHistory): void {
  mkdirSync(historyDir, { recursive: true });
  writeFileSync(join(historyDir, METRICS_HISTORY_FILE), JSON.stringify(history, null, 2));
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

      // Run-over-run regression tracking: load the previous run's metrics so we
      // can flag any metric that degraded since last time, then persist this
      // run's metrics for the next comparison.
      const trackRegressions = config.trackRegressions ?? false;
      const historyDir = config.historyDir ?? '.frontguard/perf-history';
      const regressionThreshold = config.regressionThreshold ?? 0.2;
      const prevMetrics = trackRegressions ? loadMetricsHistory(historyDir) : {};
      const nextMetrics: MetricsHistory = trackRegressions ? { ...prevMetrics } : {};

      // Surface results onto the RunResult so reporters can correlate perf
      // budget violations with the visual diff for the same route × viewport
      // (canonical-delivery pattern, mirroring the a11y plugin).
      if (budgetResults.length > 0) {
        result.perf = budgetResults.map((r): PerfReport => {
          const key = metricKey(r.route, r.viewport);
          const report: PerfReport = {
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
          };
          if (trackRegressions) {
            const prev = prevMetrics[key];
            if (prev) {
              const regressions = computePerfRegressions(prev, r.metrics, regressionThreshold);
              if (regressions.length > 0) report.regressions = regressions;
            }
            nextMetrics[key] = r.metrics;
          }
          return report;
        });
      }

      // Persist this run's metrics after results are built (transactional —
      // a run that aborts before afterRun won't advance the baseline).
      if (trackRegressions) saveMetricsHistory(historyDir, nextMetrics);

      // Store summary in metadata for reporters
      ctx.metadata.set('perf:summary', { total, passed: total - failed, failed });

      if (hasBudgetFailures && config.failOnBudgetExceeded) {
        // Set exit code to indicate failure
        process.exitCode = 1;
      }
    },
  };
}
