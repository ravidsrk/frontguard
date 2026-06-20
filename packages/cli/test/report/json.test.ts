import { describe, it, expect, vi } from 'vitest';
import { JSONReporter } from '../../src/report/json.js';
import type { RunResult, DiffResult, FrontguardConfig } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Test helpers
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
    outputDir: '/tmp/frontguard-test',
    ...overrides,
  };
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
    summary: {
      total: diffs.length,
      passed,
      regressions,
      warnings,
      newPages,
      errors,
    },
    diffs,
    timing: { discovery: 150, render: 800, compare: 300, ai: 50, total: 1300 },
    config: makeConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JSONReporter', () => {
  it('generates valid JSON output', () => {
    const reporter = new JSONReporter();
    const result = makeRunResult([makeDiff()]);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    expect(spy).toHaveBeenCalledOnce();

    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
    spy.mockRestore();
  });

  it('contains summary with correct counts', () => {
    const reporter = new JSONReporter();
    const diffs = [
      makeDiff({ status: 'pass' }),
      makeDiff({ route: { path: '/about' }, status: 'regression', diffPercentage: 5.2 }),
      makeDiff({ route: { path: '/pricing' }, status: 'new', diffPercentage: 100 }),
      makeDiff({ route: { path: '/error' }, status: 'error', error: 'timeout' }),
    ];
    const result = makeRunResult(diffs);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    expect(parsed.summary.total).toBe(4);
    expect(parsed.summary.passed).toBe(1);
    expect(parsed.summary.regressions).toBe(1);
    expect(parsed.summary.newPages).toBe(1);
    expect(parsed.summary.errors).toBe(1);
    spy.mockRestore();
  });

  it('contains timing data', () => {
    const reporter = new JSONReporter();
    const result = makeRunResult([makeDiff()]);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    expect(parsed.timing).toBeDefined();
    expect(parsed.timing.discovery).toBe(150);
    expect(parsed.timing.render).toBe(800);
    expect(parsed.timing.compare).toBe(300);
    expect(parsed.timing.ai).toBe(50);
    expect(parsed.timing.total).toBe(1300);
    spy.mockRestore();
  });

  it('handles empty diffs array', () => {
    const reporter = new JSONReporter();
    const result = makeRunResult([]);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    expect(parsed.diffs).toEqual([]);
    expect(parsed.summary.total).toBe(0);
    expect(parsed.summary.passed).toBe(0);
    expect(parsed.summary.regressions).toBe(0);
    spy.mockRestore();
  });

  it('strips image buffers from diff output', () => {
    const reporter = new JSONReporter();
    const diffs = [
      makeDiff({
        baselineImage: Buffer.from('fake-baseline'),
        currentImage: Buffer.from('fake-current'),
        diffImage: Buffer.from('fake-diff'),
      }),
    ];
    const result = makeRunResult(diffs);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    const diff = parsed.diffs[0];
    // Should have boolean flags instead of actual buffers
    expect(diff.hasBaselineImage).toBe(true);
    expect(diff.hasCurrentImage).toBe(true);
    expect(diff.hasDiffImage).toBe(true);
    // Should NOT have raw buffer data
    expect(diff.baselineImage).toBeUndefined();
    expect(diff.currentImage).toBeUndefined();
    expect(diff.diffImage).toBeUndefined();
    spy.mockRestore();
  });

  it('preserves comparedAgainstBaseline after pipeline buffer disposal (val-5)', () => {
    const reporter = new JSONReporter();
    const diffs = [
      makeDiff({
        status: 'pass',
        diffPercentage: 0,
        comparisonMethod: 'pixelmatch',
        comparedAgainstBaseline: true,
      }),
    ];
    const result = makeRunResult(diffs);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    const diff = parsed.diffs[0];
    expect(diff.hasBaselineImage).toBe(true);
    expect(diff.comparisonMethod).toBe('pixelmatch');
    spy.mockRestore();
  });

  it('includes AI analysis when present', () => {
    const reporter = new JSONReporter();
    const diffs = [
      makeDiff({
        status: 'regression',
        diffPercentage: 3.5,
        aiAnalysis: {
          classification: 'regression',
          explanation: 'Header font changed',
          severity: 'warning',
          confidence: 0.85,
          suggestedFix: 'Check typography CSS',
        },
      }),
    ];
    const result = makeRunResult(diffs);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    const ai = parsed.diffs[0].aiAnalysis;
    expect(ai).toBeDefined();
    expect(ai.classification).toBe('regression');
    expect(ai.explanation).toBe('Header font changed');
    expect(ai.severity).toBe('warning');
    expect(ai.confidence).toBe(0.85);
    expect(ai.suggestedFix).toBe('Check typography CSS');
    spy.mockRestore();
  });

  it('includes config metadata in output', () => {
    const reporter = new JSONReporter();
    const result = makeRunResult([makeDiff()], {
      config: makeConfig({
        baseUrl: 'https://example.com',
        viewports: [375, 1440],
        browsers: ['chromium', 'firefox'],
        threshold: 0.05,
        ai: { provider: 'openai', model: 'gpt-4o' },
      }),
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reporter.onComplete(result);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    expect(parsed.config.baseUrl).toBe('https://example.com');
    expect(parsed.config.viewports).toEqual([375, 1440]);
    expect(parsed.config.browsers).toEqual(['chromium', 'firefox']);
    expect(parsed.config.threshold).toBe(0.05);
    expect(parsed.config.ai).toEqual({ provider: 'openai', model: 'gpt-4o' });
    spy.mockRestore();
  });

  it('onError outputs error JSON', () => {
    const reporter = new JSONReporter();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    reporter.onError(new Error('Something went wrong'));
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);

    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('Something went wrong');
    expect(parsed.stack).toBeDefined();
    spy.mockRestore();
  });

  it('stage callbacks are no-ops (do not throw)', () => {
    const reporter = new JSONReporter();
    expect(() => reporter.onStageStart('discover', 'test')).not.toThrow();
    expect(() => reporter.onStageProgress('render', 1, 10, 'test')).not.toThrow();
    expect(() => reporter.onStageComplete('compare', 'test')).not.toThrow();
  });
});
