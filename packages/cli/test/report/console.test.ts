/**
 * Unit tests for the ConsoleReporter.
 *
 * We spy on console.log / console.error to capture output and verify
 * the reporter emits the correct icons, labels, and counts for every
 * result category.
 */

import { ConsoleReporter } from '../../src/report/console.js';
import type { DiffResult, FrontguardConfig, RunResult, RunTiming, AIAnalysis } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<FrontguardConfig>): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    workers: 4,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: '/tmp/fg-test',
    ...overrides,
  };
}

function makeTiming(overrides?: Partial<RunTiming>): RunTiming {
  return { discovery: 100, render: 500, compare: 200, ai: 0, total: 800, ...overrides };
}

function makeDiff(overrides?: Partial<DiffResult>): DiffResult {
  return {
    route: { path: '/home', label: 'Home' },
    viewport: 1440,
    browser: 'chromium',
    status: 'pass',
    diffPercentage: 0,
    ...overrides,
  };
}

function makeRunResult(diffs: DiffResult[], overrides?: Partial<RunResult>): RunResult {
  const passed = diffs.filter((d) => d.status === 'pass').length;
  const regressions = diffs.filter((d) => d.status === 'regression').length;
  const warnings = diffs.filter((d) => d.status === 'changed').length;
  const newPages = diffs.filter((d) => d.status === 'new').length;
  const errors = diffs.filter((d) => d.status === 'error').length;

  return {
    summary: { total: diffs.length, passed, regressions, warnings, newPages, errors },
    diffs,
    timing: makeTiming(),
    config: makeConfig(),
    ...overrides,
  };
}

/** Collect all console.log output (strip ANSI) into a single string. */
function collectOutput(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .map((args) => args.map(String).join(' '))
    .join('\n')
    // Strip ANSI escape codes for easier matching
    .replace(/\u001b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConsoleReporter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Instantiation
  // -----------------------------------------------------------------------

  it('can be instantiated without crashing', () => {
    const reporter = new ConsoleReporter();
    expect(reporter).toBeInstanceOf(ConsoleReporter);
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it('prints "No routes were tested" when diffs array is empty', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('No routes were tested');
  });

  // -----------------------------------------------------------------------
  // All-passing results
  // -----------------------------------------------------------------------

  it('prints celebratory message when all diffs pass', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/' }, status: 'pass' }),
      makeDiff({ route: { path: '/about' }, status: 'pass' }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('All pages match baselines');
  });

  it('shows pass icon (✓) in route table for passing diffs', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/' }, status: 'pass' }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('✓');
  });

  it('does not report new pages as matching or saved baselines', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([makeDiff({ route: { path: '/new' }, status: 'new' })]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).not.toContain('All pages match baselines');
    expect(output).toContain('were not accepted as baselines');
    expect(output).toContain('frontguard update-baselines');
  });

  it('reports explicit baseline updates as accepted and committed', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult(
      [makeDiff({ route: { path: '/new' }, status: 'new' })],
      { baselineUpdate: true },
    );

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('BASELINES UPDATED');
    expect(output).toContain('accepted and committed locally');
    expect(output).toContain('git push origin frontguard-baselines');
    expect(output).not.toContain('were not accepted as baselines');
  });

  // -----------------------------------------------------------------------
  // Regressions
  // -----------------------------------------------------------------------

  it('shows regression icon (✘) and REGRESSIONS header for regressions', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/broken' }, status: 'regression', diffPercentage: 15.5 }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('✘');
    expect(output).toContain('REGRESSIONS');
    expect(output).toContain('/broken');
    expect(output).toContain('15.50%');
  });

  it('does NOT show celebratory message when regressions exist', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/' }, status: 'regression', diffPercentage: 5 }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).not.toContain('All pages match baselines');
  });

  it('prints AI analysis details for regressions when present', () => {
    const aiAnalysis: AIAnalysis = {
      classification: 'regression',
      explanation: 'Button color changed from blue to red',
      severity: 'critical',
      confidence: 0.95,
      suggestedFix: 'Revert CSS change',
    };

    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({
        route: { path: '/dashboard' },
        status: 'regression',
        diffPercentage: 12,
        aiAnalysis,
      }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('Button color changed from blue to red');
    expect(output).toContain('critical');
    expect(output).toContain('Revert CSS change');
    expect(output).toContain('95%'); // confidence displayed as 95%
  });

  // -----------------------------------------------------------------------
  // Warnings
  // -----------------------------------------------------------------------

  it('shows WARNINGS header for changed (warning) diffs', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/settings' }, status: 'changed', diffPercentage: 2.5 }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('WARNINGS');
    expect(output).toContain('/settings');
  });

  // -----------------------------------------------------------------------
  // Mixed results — correct counts
  // -----------------------------------------------------------------------

  it('shows correct counts for mixed results', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/' }, status: 'pass' }),
      makeDiff({ route: { path: '/about' }, status: 'pass' }),
      makeDiff({ route: { path: '/broken' }, status: 'regression', diffPercentage: 10 }),
      makeDiff({ route: { path: '/minor' }, status: 'changed', diffPercentage: 1 }),
      makeDiff({ route: { path: '/new-page' }, status: 'new' }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    // Summary line: "1 regression · 1 warning · 2 passed · 1 new"
    expect(output).toContain('1 regression');
    expect(output).toContain('1 warning');
    expect(output).toContain('2 passed');
    expect(output).toContain('1 new');
  });

  it('pluralises counts correctly (regressions, warnings, errors)', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/a' }, status: 'regression', diffPercentage: 5 }),
      makeDiff({ route: { path: '/b' }, status: 'regression', diffPercentage: 8 }),
      makeDiff({ route: { path: '/c' }, status: 'error', error: 'timeout' }),
      makeDiff({ route: { path: '/d' }, status: 'error', error: 'crash' }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('2 regressions');
    expect(output).toContain('2 errors');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('onError prints error message to stderr when no spinner', () => {
    const reporter = new ConsoleReporter();
    reporter.onError(new Error('Something broke'));

    const output = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
      .replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('Something broke');
  });

  // -----------------------------------------------------------------------
  // Stage lifecycle (smoke tests)
  // -----------------------------------------------------------------------

  it('onStageStart / onStageComplete do not throw', () => {
    const reporter = new ConsoleReporter();
    expect(() => reporter.onStageStart('render', 'Chromium 1440px')).not.toThrow();
    expect(() => reporter.onStageComplete('render', 'done')).not.toThrow();
  });

  it('onStageProgress does not throw', () => {
    const reporter = new ConsoleReporter();
    reporter.onStageStart('render');
    expect(() => reporter.onStageProgress('render', 3, 10, '/about')).not.toThrow();
    reporter.onStageComplete('render');
  });

  // -----------------------------------------------------------------------
  // Timing & report path
  // -----------------------------------------------------------------------

  it('shows timing breakdown and report path in summary', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult(
      [makeDiff({ route: { path: '/' }, status: 'pass' })],
      { timing: makeTiming({ render: 2500, total: 4000 }) },
    );

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('report.html');
    expect(output).toContain('4.0s');
  });

  // -----------------------------------------------------------------------
  // Multiple viewports in route table
  // -----------------------------------------------------------------------

  it('shows multiple viewport columns in route table', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/' }, viewport: 375, status: 'pass' }),
      makeDiff({ route: { path: '/' }, viewport: 1440, status: 'regression', diffPercentage: 5 }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('375px');
    expect(output).toContain('1440px');
  });

  it('shows each browser status in the route matrix without masking failures', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/dashboard' }, browser: 'chromium', status: 'pass' }),
      makeDiff({
        route: { path: '/dashboard' },
        browser: 'firefox',
        status: 'regression',
        diffPercentage: 8,
      }),
      makeDiff({
        route: { path: '/dashboard' },
        browser: 'webkit',
        status: 'error',
        error: 'capture failed',
      }),
    ]);

    reporter.onComplete(result);

    const rows = collectOutput(logSpy).split('\n').filter((line) => line.includes('/dashboard'));
    expect(rows.find((line) => line.includes('chromium'))).toContain('✓');
    expect(rows.find((line) => line.includes('firefox'))).toContain('✘');
    expect(rows.find((line) => line.includes('webkit'))).toContain('✘');
  });

  it('renders judgements summary when result.judgements is non-empty and diffs is empty', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([], {
      summary: { total: 2, passed: 1, regressions: 1, warnings: 0, newPages: 0, errors: 0 },
      judgements: [
        {
          route: { path: '/', label: 'Home' },
          viewport: 1440,
          browser: 'chromium',
          pass: true,
          confidence: 0.92,
          issues: [],
          withDesignReference: false,
        },
        {
          route: { path: '/pricing', label: 'Pricing' },
          viewport: 375,
          browser: 'chromium',
          pass: false,
          confidence: 0.88,
          issues: [
            {
              category: 'overflow',
              severity: 'critical',
              description: 'CTA button overflows viewport',
              suggestion: 'Add max-width: 100%',
            },
          ],
          withDesignReference: true,
        },
      ],
    });

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).not.toContain('No routes were tested');
    expect(output).toContain('JUDGE VERDICTS');
    expect(output).toContain('/pricing');
    expect(output).toContain('CTA button overflows viewport');
  });

  it('prints cluster metrics and unsettled frame warning for regressions and warnings', () => {
    const reporter = new ConsoleReporter();
    const result = makeRunResult([
      makeDiff({
        route: { path: '/checkout' },
        viewport: 1440,
        status: 'regression',
        diffPercentage: 4.5,
        ssim: 0.912,
        clusters: [
          {
            id: 1,
            bbox: { x: 24, y: 48, width: 120, height: 40 },
            rawDiffPixels: 960,
            area: 4800,
            density: 0.2,
            centroid: { x: 84, y: 68 },
            chromaSSIM: 0.543,
            cwSSIM: 0.721,
          },
        ],
        stability: {
          settled: false,
          attempts: 4,
          unstableRatio: 0.0215,
          motionClusters: [
            {
              id: 1,
              bbox: { x: 100, y: 200, width: 300, height: 80 },
              rawDiffPixels: 400,
              area: 24000,
              density: 0.016,
              centroid: { x: 250, y: 240 },
            },
          ],
        },
      }),
    ]);

    reporter.onComplete(result);

    const output = collectOutput(logSpy);
    expect(output).toContain('Diff: 4.50% pixels changed');
    expect(output).toContain('Metrics: SSIM 91.2% · 1 cluster — largest (24, 48) 120×40px [Chroma SSIM 54.3%, CW-SSIM 72.1%]');
    expect(output).toContain('⚠ Unsettled frame: 2.15% motion variance after 4 attempts — primary motion at (100, 200) 300×80px');
  });
});
