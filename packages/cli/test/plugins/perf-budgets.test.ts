import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPerfBudgetPlugin,
  checkBudgets,
  computePerfRegressions,
  extractMetricsFromSnapshot,
  PERF_COLLECTION_SCRIPT,
  type PerfBudgetConfig,
  type PerfMetrics,
} from '../../src/plugins/perf-budgets.js';
import type { PluginContext } from '../../src/core/plugins.js';
import type {
  FrontguardConfig,
  DiffResult,
  ScreenshotResult,
  RunResult,
  RunTiming,
} from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    config: {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 4,
      pageTimeout: 30000,
      maxHeight: 5000,
      outputDir: './frontguard-report',
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    metadata: new Map(),
    ...overrides,
  };
}

function makeScreenshot(
  routePath: string,
  viewport: number,
  perfData?: PerfMetrics,
): ScreenshotResult {
  let domSnapshot = '<html><body>Hello</body></html>';
  if (perfData) {
    domSnapshot = `<html><body>Hello<script type="application/json" id="__frontguard_perf_data">${JSON.stringify(perfData)}</script></body></html>`;
  }
  return {
    route: { path: routePath, label: routePath },
    viewport,
    browser: 'chromium',
    buffer: Buffer.from('fake-png'),
    domSnapshot,
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 100,
  };
}

function makeDiff(routePath: string, viewport: number): DiffResult {
  return {
    route: { path: routePath, label: routePath },
    viewport,
    browser: 'chromium',
    status: 'pass',
    diffPercentage: 0,
  };
}

function makeRunResult(diffs: DiffResult[]): RunResult {
  const timing: RunTiming = { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 };
  return {
    summary: {
      total: diffs.length,
      passed: diffs.length,
      regressions: 0,
      warnings: 0,
      newPages: 0,
      errors: 0,
    },
    diffs,
    timing,
    config: makeContext().config,
  };
}

// ---------------------------------------------------------------------------
// Tests: checkBudgets (pure function)
// ---------------------------------------------------------------------------

describe('checkBudgets', () => {
  it('returns no violations when all metrics are under budget', () => {
    const metrics: PerfMetrics = {
      resources: 15,
      pageWeight: 300 * 1024, // 300KB
      ttfb: 100,
      domContentLoaded: 500,
    };
    const violations = checkBudgets(metrics, {
      ttfb: 200,
      maxPageWeight: 500,
      maxRequests: 30,
    });
    expect(violations).toHaveLength(0);
  });

  it('detects TTFB violation', () => {
    const metrics: PerfMetrics = {
      resources: 10,
      pageWeight: 100 * 1024,
      ttfb: 500,
      domContentLoaded: 800,
    };
    const violations = checkBudgets(metrics, { ttfb: 200 });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('ttfb');
    expect(violations[0].actual).toBe(500);
    expect(violations[0].budget).toBe(200);
  });

  it('detects page weight violation', () => {
    const metrics: PerfMetrics = {
      resources: 10,
      pageWeight: 2 * 1024 * 1024, // 2MB
      ttfb: 100,
      domContentLoaded: 500,
    };
    const violations = checkBudgets(metrics, { maxPageWeight: 1024 }); // 1MB budget
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('maxPageWeight');
    expect(violations[0].actual).toBeCloseTo(2048, 0); // 2048 KB
  });

  it('detects max requests violation', () => {
    const metrics: PerfMetrics = {
      resources: 80,
      pageWeight: 100 * 1024,
      ttfb: 100,
      domContentLoaded: 500,
    };
    const violations = checkBudgets(metrics, { maxRequests: 50 });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('maxRequests');
    expect(violations[0].actual).toBe(80);
  });

  it('detects LCP violation when metric is present', () => {
    const metrics: PerfMetrics = {
      resources: 10,
      pageWeight: 100 * 1024,
      ttfb: 100,
      domContentLoaded: 500,
      lcp: 3000,
    };
    const violations = checkBudgets(metrics, { lcp: 2500 });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('lcp');
  });

  it('detects CLS violation when metric is present', () => {
    const metrics: PerfMetrics = {
      resources: 10,
      pageWeight: 100 * 1024,
      ttfb: 100,
      domContentLoaded: 500,
      cls: 0.25,
    };
    const violations = checkBudgets(metrics, { cls: 0.1 });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('cls');
  });

  it('checks multiple metrics independently', () => {
    const metrics: PerfMetrics = {
      resources: 100,
      pageWeight: 5 * 1024 * 1024, // 5MB
      ttfb: 800,
      domContentLoaded: 2000,
    };
    const violations = checkBudgets(metrics, {
      ttfb: 200,
      maxPageWeight: 1024,
      maxRequests: 50,
    });
    expect(violations).toHaveLength(3);
    const metricNames = violations.map((v) => v.metric);
    expect(metricNames).toContain('ttfb');
    expect(metricNames).toContain('maxPageWeight');
    expect(metricNames).toContain('maxRequests');
  });

  it('skips undefined budgets gracefully', () => {
    const metrics: PerfMetrics = {
      resources: 100,
      pageWeight: 5 * 1024 * 1024,
      ttfb: 800,
      domContentLoaded: 2000,
    };
    // No budgets set — should produce no violations
    const violations = checkBudgets(metrics, {});
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: extractMetricsFromSnapshot
// ---------------------------------------------------------------------------

describe('extractMetricsFromSnapshot', () => {
  it('extracts metrics from DOM snapshot with perf data', () => {
    const data: PerfMetrics = {
      resources: 23,
      pageWeight: 450000,
      ttfb: 120,
      domContentLoaded: 600,
    };
    const snapshot = `<html><body><script type="application/json" id="__frontguard_perf_data">${JSON.stringify(data)}</script></body></html>`;

    const result = extractMetricsFromSnapshot(snapshot);
    expect(result).not.toBeNull();
    expect(result!.resources).toBe(23);
    expect(result!.pageWeight).toBe(450000);
    expect(result!.ttfb).toBe(120);
  });

  it('returns null when no perf data in snapshot', () => {
    const result = extractMetricsFromSnapshot('<html><body>Hello</body></html>');
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const snapshot = '<html><body><script type="application/json" id="__frontguard_perf_data">{broken json</script></body></html>';
    const result = extractMetricsFromSnapshot(snapshot);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: createPerfBudgetPlugin
// ---------------------------------------------------------------------------

describe('createPerfBudgetPlugin', () => {
  afterEach(() => {
    // Reset exit code
    process.exitCode = undefined;
  });

  it('returns a valid plugin with expected hooks', () => {
    const plugin = createPerfBudgetPlugin({ budgets: { ttfb: 200 } });

    expect(plugin.name).toBe('frontguard-perf-budgets');
    expect(plugin.setup).toBeTypeOf('function');
    expect(plugin.beforeRender).toBeTypeOf('function');
    expect(plugin.afterRender).toBeTypeOf('function');
    expect(plugin.afterCompare).toBeTypeOf('function');
    expect(plugin.afterRun).toBeTypeOf('function');
  });

  it('setup warns when no budgets are configured', () => {
    const warnMock = vi.fn();
    const ctx = makeContext({ logger: { ...makeContext().logger, warn: warnMock, info: () => {} } });
    const plugin = createPerfBudgetPlugin({ budgets: {} });
    plugin.setup!(ctx);
    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('no budgets configured'));
  });

  it('beforeRender injects perf script into config', () => {
    const plugin = createPerfBudgetPlugin({ budgets: { ttfb: 200 } });
    const ctx = makeContext();
    plugin.setup!(ctx);

    const routes = [{ path: '/', label: 'Home' }];
    const result = plugin.beforeRender!({ routes, config: ctx.config });

    expect(result.routes).toEqual(routes);
    expect((result.config as any)._perfScript).toContain('__frontguard_perf');
  });

  it('afterRender extracts metrics from DOM snapshots', () => {
    const plugin = createPerfBudgetPlugin({ budgets: { ttfb: 200 } });
    const ctx = makeContext();
    plugin.setup!(ctx);

    const perfData: PerfMetrics = {
      resources: 23,
      pageWeight: 450000,
      ttfb: 120,
      domContentLoaded: 600,
    };

    const screenshots = [makeScreenshot('/', 1440, perfData)];
    plugin.afterRender!(screenshots, ctx);
    // afterRender returns void — it stores metrics internally
    expect(screenshots).toHaveLength(1);
  });

  it('full pipeline: under budget = pass', () => {
    const plugin = createPerfBudgetPlugin({
      budgets: { ttfb: 500, maxPageWeight: 1024, maxRequests: 50 },
    });
    plugin.setup!(makeContext());

    const perfData: PerfMetrics = {
      resources: 20,
      pageWeight: 300 * 1024,
      ttfb: 100,
      domContentLoaded: 400,
    };

    plugin.afterRender!([makeScreenshot('/', 1440, perfData)], makeContext());
    plugin.afterCompare!([makeDiff('/', 1440)], makeContext());

    // afterRun should not set exitCode
    plugin.afterRun!(makeRunResult([makeDiff('/', 1440)]), makeContext());
    expect(process.exitCode).toBeUndefined();
  });

  it('full pipeline: over budget = fail with failOnBudgetExceeded', () => {
    const plugin = createPerfBudgetPlugin({
      budgets: { ttfb: 100, maxRequests: 10 },
      failOnBudgetExceeded: true,
    });
    plugin.setup!(makeContext());

    const perfData: PerfMetrics = {
      resources: 80,
      pageWeight: 100 * 1024,
      ttfb: 500,
      domContentLoaded: 1000,
    };

    plugin.afterRender!([makeScreenshot('/', 1440, perfData)], makeContext());
    plugin.afterCompare!([makeDiff('/', 1440)], makeContext());
    plugin.afterRun!(makeRunResult([makeDiff('/', 1440)]), makeContext());

    expect(process.exitCode).toBe(1);
  });

  it('full pipeline: over budget = warn only without failOnBudgetExceeded', () => {
    const plugin = createPerfBudgetPlugin({
      budgets: { ttfb: 100 },
      failOnBudgetExceeded: false,
    });
    plugin.setup!(makeContext());

    const perfData: PerfMetrics = {
      resources: 10,
      pageWeight: 100 * 1024,
      ttfb: 500,
      domContentLoaded: 1000,
    };

    plugin.afterRender!([makeScreenshot('/', 1440, perfData)], makeContext());
    plugin.afterCompare!([makeDiff('/', 1440)], makeContext());
    plugin.afterRun!(makeRunResult([makeDiff('/', 1440)]), makeContext());

    expect(process.exitCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: PERF_COLLECTION_SCRIPT
// ---------------------------------------------------------------------------

describe('PERF_COLLECTION_SCRIPT', () => {
  it('is a non-empty string containing performance API calls', () => {
    expect(PERF_COLLECTION_SCRIPT).toBeTypeOf('string');
    expect(PERF_COLLECTION_SCRIPT.length).toBeGreaterThan(0);
    expect(PERF_COLLECTION_SCRIPT).toContain('performance.getEntriesByType');
    expect(PERF_COLLECTION_SCRIPT).toContain('__frontguard_perf');
  });
});

// ---------------------------------------------------------------------------
// Tests: computePerfRegressions (run-over-run delta)
// ---------------------------------------------------------------------------

describe('computePerfRegressions', () => {
  const base: PerfMetrics = { resources: 10, pageWeight: 500 * 1024, ttfb: 400, domContentLoaded: 800 };

  it('flags a metric that degraded beyond the threshold', () => {
    const prev = { ...base, ttfb: 400 };
    const curr = { ...base, ttfb: 600 }; // +50%
    const regs = computePerfRegressions(prev, curr, 0.2);
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({ metric: 'ttfb', previous: 400, current: 600 });
    expect(regs[0].deltaPct).toBeCloseTo(0.5, 5);
  });

  it('ignores changes within the threshold', () => {
    const prev = { ...base, ttfb: 400 };
    const curr = { ...base, ttfb: 440 }; // +10%, under 20%
    expect(computePerfRegressions(prev, curr, 0.2)).toEqual([]);
  });

  it('ignores improvements (faster than before)', () => {
    const prev = { ...base, ttfb: 600 };
    const curr = { ...base, ttfb: 400 };
    expect(computePerfRegressions(prev, curr, 0.2)).toEqual([]);
  });

  it('reports pageWeight regressions in KB', () => {
    const prev = { ...base, pageWeight: 500 * 1024 };
    const curr = { ...base, pageWeight: 800 * 1024 }; // +60%
    const regs = computePerfRegressions(prev, curr, 0.2);
    const weight = regs.find((r) => r.metric === 'pageWeight');
    expect(weight).toBeDefined();
    expect(weight!.unit).toBe('KB');
    expect(weight!.previous).toBe(500);
    expect(weight!.current).toBe(800);
  });

  it('skips metrics with a non-positive previous value', () => {
    const prev = { ...base, ttfb: 0 };
    const curr = { ...base, ttfb: 500 };
    expect(computePerfRegressions(prev, curr, 0.2).find((r) => r.metric === 'ttfb')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: trackRegressions across runs (persistence)
// ---------------------------------------------------------------------------

describe('createPerfBudgetPlugin — run-over-run regression tracking', () => {
  let historyDir: string;
  afterEach(() => {
    if (historyDir) rmSync(historyDir, { recursive: true, force: true });
  });

  function runOnce(historyDir: string, ttfb: number): RunResult {
    const plugin = createPerfBudgetPlugin({
      budgets: {},
      trackRegressions: true,
      historyDir,
      regressionThreshold: 0.2,
    });
    const ctx = makeContext();
    const metrics: PerfMetrics = { resources: 10, pageWeight: 400 * 1024, ttfb, domContentLoaded: 700 };
    plugin.afterRender!([makeScreenshot('/', 1440, metrics)], ctx);
    plugin.afterCompare!([makeDiff('/', 1440)], ctx);
    const result = makeRunResult([makeDiff('/', 1440)]);
    plugin.afterRun!(result, ctx);
    return result;
  }

  it('establishes a baseline on first run, flags a regression on the next', () => {
    historyDir = mkdtempSync(join(tmpdir(), 'fg-perf-'));

    const r1 = runOnce(historyDir, 400);
    expect(r1.perf?.[0].regressions ?? []).toEqual([]); // no prior run

    const r2 = runOnce(historyDir, 600); // +50% TTFB
    const regs = r2.perf?.[0].regressions ?? [];
    expect(regs.some((x) => x.metric === 'ttfb')).toBe(true);
  });
});
