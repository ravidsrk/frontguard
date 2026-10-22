import { describe, expect, it, vi } from 'vitest';
import { ConsoleReporter } from '../../src/report/console.js';
import { HTMLReporter } from '../../src/report/html.js';
import { JSONReporter } from '../../src/report/json.js';
import { comparisonExitCode } from '../../src/cli/exit-code.js';
import type { FrontguardConfig, RunResult } from '../../src/core/types.js';

function config(): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [800],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: false,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: '/tmp/frontguard-overflow-report',
  };
}

function result(): RunResult {
  return {
    summary: { total: 1, passed: 1, regressions: 0, warnings: 0, newPages: 0, errors: 0 },
    diffs: [{
      route: { path: '/pricing' },
      viewport: 800,
      browser: 'chromium',
      status: 'pass',
      diffPercentage: 0,
      comparisonMethod: 'pixelmatch',
    }],
    timing: { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 },
    config: config(),
    horizontalOverflow: [
      {
        route: '/pricing',
        viewport: 800,
        browser: 'chromium',
        innerWidth: 800,
        scrollWidth: 1400,
        flagged: true,
        elements: [{ selector: '[data-testid="wide"]', overflowPx: 600 }],
      },
      {
        route: '/ghost',
        viewport: 800,
        browser: 'chromium',
        innerWidth: 800,
        scrollWidth: 1400,
        flagged: false,
        elements: [],
      },
    ],
  };
}

describe('horizontal overflow reports', () => {
  it('prints a flagged row beside a pixel pass and skips the transparent row', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new ConsoleReporter().onComplete(result());
    const text = spy.mock.calls.map((call) => String(call[0])).join('\n');
    spy.mockRestore();

    expect(text).toContain('All pages match baselines');
    expect(text).toContain('HORIZONTAL OVERFLOW — not a pixel result');
    expect(text).toContain('/pricing @ 800px [chromium]');
    expect(text).toContain('[data-testid="wide"] 600px');
    expect(text).toContain('does not change the exit code');
    expect(text).not.toContain('/ghost');
    expect(comparisonExitCode(result().summary)).toBe(0);
  });

  it('includes both rows in JSON and leaves the pixel status as pass', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new JSONReporter().onComplete(result());
    const parsed = JSON.parse(String(spy.mock.calls[0][0])) as {
      diffs: Array<{ status: string; comparisonMethod: string }>;
      summary: { regressions: number };
      horizontalOverflow: Array<{ route: string; flagged: boolean }>;
    };
    spy.mockRestore();

    expect(parsed.diffs[0]?.status).toBe('pass');
    expect(parsed.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(parsed.summary.regressions).toBe(0);
    expect(parsed.horizontalOverflow.map((row) => [row.route, row.flagged])).toEqual([
      ['/pricing', true],
      ['/ghost', false],
    ]);
  });

  it('renders only flagged rows in HTML', () => {
    const html = new HTMLReporter().generateReport(result());
    expect(html).toContain('Horizontal overflow');
    expect(html).toContain('does not change the pixel result');
    expect(html).toContain('data-testid=&quot;wide&quot;');
    expect(html).toContain('600px past the right edge');
    expect(html).not.toContain('/ghost');
    expect(html).toContain('icon-pass');
  });
});
