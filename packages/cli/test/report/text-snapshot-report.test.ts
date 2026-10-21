import { describe, expect, it, vi } from 'vitest';
import { ConsoleReporter } from '../../src/report/console.js';
import { GitHubPRReporter } from '../../src/report/github-pr.js';
import { HTMLReporter } from '../../src/report/html.js';
import { JSONReporter } from '../../src/report/json.js';
import type { DiffResult, FrontguardConfig, RunResult } from '../../src/core/types.js';

function config(): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: false,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: '/tmp/frontguard-text-report',
  };
}

function result(status: 'pass' | 'regression', text: 'match' | 'mismatch'): RunResult {
  const diff: DiffResult = {
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    status,
    diffPercentage: status === 'regression' ? 4 : 0,
    comparisonMethod: 'pixelmatch',
  };
  return {
    summary: {
      total: 1,
      passed: status === 'pass' ? 1 : 0,
      regressions: status === 'regression' ? 1 : 0,
      warnings: 0,
      newPages: 0,
      errors: 0,
    },
    diffs: [diff],
    timing: { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 },
    config: config(),
    textSnapshots: [{
      route: '/',
      viewport: 1440,
      browser: 'chromium',
      kind: 'aria',
      status: text,
      ...(text === 'mismatch' ? { excerpt: 'was Save now Cancel' } : {}),
    }],
  };
}

describe('text snapshot reports', () => {
  it('prints a mismatch beside an unchanged pixel pass', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new ConsoleReporter().onComplete(result('pass', 'mismatch'));
    const text = spy.mock.calls.map((call) => String(call[0])).join('\n');
    spy.mockRestore();

    expect(text).toContain('TEXT SNAPSHOTS — not a pixel result');
    expect(text).toContain('aria mismatch: / @ 1440px [chromium]');
    expect(text).toContain('was Save now Cancel');
    expect(text).toContain('does not pass or fail the pixel comparison');
    expect(text).toContain('All pages match baselines');
  });

  it('includes the mismatch in JSON without changing the pixel status', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new JSONReporter().onComplete(result('regression', 'mismatch'));
    const parsed = JSON.parse(String(spy.mock.calls[0][0])) as {
      diffs: Array<{ status: string; comparisonMethod: string }>;
      textSnapshots: Array<{ status: string }>;
    };
    spy.mockRestore();

    expect(parsed.diffs[0]?.status).toBe('regression');
    expect(parsed.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(parsed.textSnapshots[0]?.status).toBe('mismatch');
    expect(parsed.textSnapshots[0]).toMatchObject({ excerpt: 'was Save now Cancel' });
  });

  it('adds a GitHub section that does not change the pixel result', () => {
    const comment = new GitHubPRReporter().generateComment(result('pass', 'mismatch'));

    expect(comment).toContain('## Text snapshots');
    expect(comment).toContain('do not change the pixel result');
    expect(comment).toContain('aria: mismatch');
    expect(comment).toContain('was Save now Cancel');
    expect(comment).toContain('All 1 pages match baselines');
    expect(comment).not.toContain('## ❌ Regressions');
  });

  it('renders the HTML section separately from the pixel status', () => {
    const html = new HTMLReporter().generateReport(result('regression', 'mismatch'));

    expect(html).toContain('id="text-snapshots"');
    expect(html).toContain('axe-core remains the accessibility check');
    expect(html).toContain('aria mismatch');
    expect(html).toContain('was Save now Cancel');
    expect(html).toContain('Regressions (1)');
  });
});
