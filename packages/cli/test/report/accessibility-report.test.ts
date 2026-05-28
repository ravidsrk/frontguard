import { describe, it, expect, vi } from 'vitest';
import { GitHubPRReporter } from '../../src/report/github-pr.js';
import { JSONReporter } from '../../src/report/json.js';
import { HTMLReporter } from '../../src/report/html.js';
import type { RunResult, FrontguardConfig, AccessibilityResult } from '../../src/core/types.js';

function makeConfig(): FrontguardConfig {
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
    outputDir: '/tmp/frontguard-test-report',
  } as unknown as FrontguardConfig;
}

const a11y: AccessibilityResult[] = [
  {
    route: '/home',
    viewport: 1440,
    passes: 10,
    incomplete: 0,
    violations: [
      {
        id: 'color-contrast',
        impact: 'serious',
        description: 'Contrast too low',
        help: 'Increase contrast',
        helpUrl: 'https://example.com/cc',
        nodes: [{ target: ['.btn'] }],
      },
    ],
  },
];

function makeResult(): RunResult {
  return {
    summary: { total: 1, passed: 1, regressions: 0, warnings: 0, newPages: 0, errors: 0 },
    diffs: [
      {
        route: { path: '/home' },
        viewport: 1440,
        browser: 'chromium',
        status: 'pass',
        diffPercentage: 0,
      } as unknown as RunResult['diffs'][number],
    ],
    timing: { discovery: 1, render: 1, compare: 1, ai: 0, total: 3 },
    config: makeConfig(),
    accessibility: a11y,
  };
}

describe('Accessibility reporting', () => {
  it('GitHub PR comment includes an accessibility section', () => {
    const comment = new GitHubPRReporter().generateComment(makeResult());
    expect(comment).toContain('♿ Accessibility');
    expect(comment).toContain('color-contrast');
    expect(comment).toContain('serious');
    expect(comment).toContain('https://example.com/cc');
  });

  it('JSON output includes accessibility array', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new JSONReporter().onComplete(makeResult());
    const json = JSON.parse(spy.mock.calls[0][0] as string);
    spy.mockRestore();
    expect(json.accessibility).toHaveLength(1);
    expect(json.accessibility[0].violations[0].id).toBe('color-contrast');
  });

  it('HTML report includes an accessibility section', () => {
    const html = new HTMLReporter().generateReport(makeResult());
    expect(html).toContain('a11y-section');
    expect(html).toContain('color-contrast');
    expect(html).toContain('Accessibility');
  });
});
