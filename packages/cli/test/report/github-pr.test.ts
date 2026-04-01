import { describe, it, expect } from 'vitest';
import { GitHubPRReporter } from '../../src/report/github-pr.js';
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
    outputDir: '/tmp/frontguard-test-report',
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
    timing: { discovery: 100, render: 500, compare: 200, ai: 0, total: 800 },
    config: makeConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubPRReporter', () => {
  it('generateComment produces valid markdown with marker', () => {
    const reporter = new GitHubPRReporter({ owner: 'test', repo: 'repo', prNumber: 1 });
    const result = makeRunResult([
      makeDiff({ status: 'regression', diffPercentage: 5.0, route: { path: '/broken' } }),
    ]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('<!-- frontguard-report -->');
    expect(comment).toContain('Frontguard');
  });

  it('comment contains the frontguard marker', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([makeDiff()]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('<!-- frontguard-report -->');
  });

  it('all passing results produce clean badge message', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({ status: 'pass' }),
      makeDiff({ status: 'pass', route: { path: '/about' } }),
      makeDiff({ status: 'pass', route: { path: '/contact' } }),
    ]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('<!-- frontguard-report -->');
    expect(comment).toContain('All 3 pages match baselines');
    // Should NOT have the regressions section or summary table
    expect(comment).not.toContain('Regressions');
    expect(comment).not.toContain('Route Summary');
  });

  it('empty results produce a clean output without crash', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('<!-- frontguard-report -->');
    // With 0 total and 0 regressions, should still produce valid output
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);
  });

  it('regression results include regression details', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 12.5,
        route: { path: '/checkout' },
        aiAnalysis: {
          classification: 'regression',
          explanation: 'Button moved 20px to the left',
          severity: 'critical',
          confidence: 0.9,
          suggestedFix: 'Check flex layout changes',
        },
      }),
    ]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('/checkout');
    expect(comment).toContain('12.50%');
    expect(comment).toContain('Button moved 20px to the left');
    expect(comment).toContain('Check flex layout changes');
  });

  it('uses consistent status icons in summary table', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({ status: 'pass', route: { path: '/a' } }),
      makeDiff({ status: 'regression', route: { path: '/b' }, diffPercentage: 5.0 }),
      makeDiff({ status: 'changed', route: { path: '/c' }, diffPercentage: 1.0 }),
      makeDiff({ status: 'new', route: { path: '/d' } }),
    ]);
    const comment = reporter.generateComment(result);

    // Check the summary table uses consistent icons
    expect(comment).toContain('✓');   // pass
    expect(comment).toContain('✘');   // regression
    expect(comment).toContain('⚠');   // warning/changed
    expect(comment).toContain('★');   // new
  });

  it('includes warning section for changed pages', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({ status: 'changed', diffPercentage: 0.5, route: { path: '/subtle-change' } }),
    ]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('Warnings');
    expect(comment).toContain('/subtle-change');
  });

  it('includes new pages section', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({ status: 'new', route: { path: '/new-feature' } }),
    ]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('New Pages');
    expect(comment).toContain('/new-feature');
  });

  it('large results are truncated under 60KB', () => {
    const reporter = new GitHubPRReporter();
    // Generate many regression diffs with verbose AI analyses
    const diffs: DiffResult[] = [];
    for (let i = 0; i < 500; i++) {
      diffs.push(
        makeDiff({
          status: 'regression',
          diffPercentage: Math.random() * 50,
          route: { path: `/page-${i}-with-a-very-long-route-name-that-adds-bulk` },
          aiAnalysis: {
            classification: 'regression',
            explanation: `This is a very long explanation for regression ${i}. `.repeat(10),
            severity: 'critical',
            confidence: 0.8,
            suggestedFix: `Fix the issue in component-${i}.tsx by reverting the CSS changes that were introduced in the latest commit.`,
          },
        }),
      );
    }
    const result = makeRunResult(diffs);
    const comment = reporter.generateComment(result);

    expect(comment.length).toBeLessThanOrEqual(60_000);
    expect(comment).toContain('<!-- frontguard-report -->');
  });

  it('includes footer with timing info', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([makeDiff()]);
    const comment = reporter.generateComment(result);

    expect(comment).toContain('Frontguard visual regression test');
    expect(comment).toContain('0.8s');
  });

  it('can be instantiated without options', () => {
    const reporter = new GitHubPRReporter();
    expect(reporter).toBeDefined();
  });

  it('can be instantiated with explicit options', () => {
    const reporter = new GitHubPRReporter({
      owner: 'myorg',
      repo: 'myrepo',
      prNumber: 42,
    });
    expect(reporter).toBeDefined();
  });
});
