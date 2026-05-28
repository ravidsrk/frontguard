import { describe, it, expect, vi } from 'vitest';
import { GitHubPRReporter } from '../../src/report/github-pr.js';
import { JSONReporter } from '../../src/report/json.js';
import { HTMLReporter } from '../../src/report/html.js';
import type { RunResult, DiffResult, FrontguardConfig, SuggestedFix } from '../../src/core/types.js';

/** Captures the JSON string the reporter writes to stdout. */
function renderJSON(result: RunResult): string {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  new JSONReporter().onComplete(result);
  const out = spy.mock.calls[0][0] as string;
  spy.mockRestore();
  return out;
}

/** Renders HTML via the reporter. */
function renderHTML(result: RunResult): string {
  return new HTMLReporter().generateReport(result);
}

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

const fix: SuggestedFix = {
  fixType: 'css',
  category: 'overflow-fix',
  patch: '.card {\n  overflow: hidden;\n  text-overflow: ellipsis;\n}',
  confidence: 0.87,
  explanation: 'The card text overflowed its container on mobile.',
  target: '.card',
};

function regressionWithFix(overrides?: Partial<DiffResult>): DiffResult {
  return {
    route: { path: '/dashboard', label: 'Dashboard' },
    viewport: 375,
    browser: 'chromium',
    status: 'regression',
    diffPercentage: 2.34,
    suggestedFix: fix,
    aiAnalysis: {
      classification: 'regression',
      explanation: 'Sidebar overlaps content.',
      severity: 'critical',
      confidence: 0.94,
    },
    ...overrides,
  } as unknown as DiffResult;
}

function makeResult(diffs: DiffResult[]): RunResult {
  return {
    summary: {
      total: diffs.length,
      passed: 0,
      regressions: diffs.filter((d) => d.status === 'regression').length,
      warnings: 0,
      newPages: 0,
      errors: 0,
    },
    diffs,
    timing: { discovery: 1, render: 1, compare: 1, ai: 1, fix: 1, total: 5 },
    config: makeConfig(),
  };
}

describe('GitHub PR reporter — fix presentation', () => {
  it('renders the structured fix with patch in a diff code block', () => {
    const comment = new GitHubPRReporter().generateComment(makeResult([regressionWithFix()]));
    expect(comment).toContain('🔧 Suggested fix');
    expect(comment).toContain('overflow-fix');
    expect(comment).toContain('87% confidence');
    expect(comment).toContain('```diff');
    expect(comment).toContain('+ .card {');
    expect(comment).toContain('Target: `.card`');
  });

  it('marks verified fixes distinctly', () => {
    const diff = regressionWithFix({ fixVerification: { fixApplied: true, diffPercentage: 0.05, verified: true } });
    const comment = new GitHubPRReporter().generateComment(makeResult([diff]));
    expect(comment).toContain('✅ **Verified**');
  });

  it('marks unverified fixes distinctly', () => {
    const diff = regressionWithFix({ fixVerification: { fixApplied: true, diffPercentage: 5, verified: false } });
    const comment = new GitHubPRReporter().generateComment(makeResult([diff]));
    expect(comment).toContain('⚠️ Unverified');
  });
});

describe('JSON reporter — fix presentation', () => {
  it('includes structured suggestedFix and fixVerification', () => {
    const diff = regressionWithFix({ fixVerification: { fixApplied: true, diffPercentage: 0.05, verified: true } });
    const json = JSON.parse(renderJSON(makeResult([diff])));
    const d = json.diffs[0];
    expect(d.suggestedFix.category).toBe('overflow-fix');
    expect(d.suggestedFix.patch).toContain('overflow: hidden');
    expect(d.suggestedFix.confidence).toBe(0.87);
    expect(d.fixVerification.verified).toBe(true);
  });

  it('omits fix fields when no fix present', () => {
    const diff = regressionWithFix({ suggestedFix: undefined });
    const json = JSON.parse(renderJSON(makeResult([diff])));
    expect(json.diffs[0].suggestedFix).toBeUndefined();
  });
});

describe('HTML reporter — fix presentation', () => {
  it('renders a fix panel with copy button and escaped patch', () => {
    const html = renderHTML(makeResult([regressionWithFix()]));
    expect(html).toContain('fix-panel');
    expect(html).toContain('Suggested Fix');
    expect(html).toContain('copy-fix-btn');
    expect(html).toContain('overflow: hidden');
  });

  it('applies verified class for verified fixes', () => {
    const diff = regressionWithFix({ fixVerification: { fixApplied: true, diffPercentage: 0.05, verified: true } });
    const html = renderHTML(makeResult([diff]));
    expect(html).toContain('fix-verified');
    expect(html).toContain('✓ Verified');
  });
});
