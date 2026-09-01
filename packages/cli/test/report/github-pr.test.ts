import { afterEach, describe, it, expect, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  // --- Task 2.2: PR screenshot thumbnails --------------------------------
  it('embeds image thumbnails when upload URLs are present', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 8,
        route: { path: '/pricing' },
        baselineImageUrl: 'https://cdn.test/baseline.png',
        currentImageUrl: 'https://cdn.test/current.png',
        diffImageUrl: 'https://cdn.test/diff.png',
      }),
    ]);
    const comment = reporter.generateComment(result);
    expect(comment).toContain('<table>');
    expect(comment).toContain('<img src="https://cdn.test/baseline.png" width="280"');
    expect(comment).toContain('https://cdn.test/current.png');
    expect(comment).toContain('https://cdn.test/diff.png');
    expect(comment).toContain('<th>Baseline</th>');
  });

  it('falls back to text summary when no image URLs present', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({ status: 'regression', diffPercentage: 8, route: { path: '/pricing' } }),
    ]);
    const comment = reporter.generateComment(result);
    expect(comment).not.toContain('<table>');
    expect(comment).toContain('📸 **Baseline → Current**');
  });

  it('shows AI classification badge for regressions', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 8,
        route: { path: '/x' },
        aiAnalysis: {
          classification: 'regression',
          explanation: 'broken',
          severity: 'critical',
          confidence: 0.95,
        },
      }),
    ]);
    const comment = reporter.generateComment(result);
    expect(comment).toContain('🔴 Regression');
  });

  it('keeps comment under 60KB even with image URLs', () => {
    const reporter = new GitHubPRReporter();
    const diffs: DiffResult[] = [];
    for (let i = 0; i < 200; i++) {
      diffs.push(
        makeDiff({
          status: 'regression',
          diffPercentage: 5,
          route: { path: `/route-${i}` },
          baselineImageUrl: `https://cdn.test/b-${i}.png`,
          currentImageUrl: `https://cdn.test/c-${i}.png`,
          diffImageUrl: `https://cdn.test/d-${i}.png`,
        }),
      );
    }
    const comment = reporter.generateComment(makeRunResult(diffs));
    expect(comment.length).toBeLessThanOrEqual(60_000);
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

  it('shows each browser status in the route matrix without masking failures', () => {
    const reporter = new GitHubPRReporter();
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

    const comment = reporter.generateComment(result);

    expect(comment).toContain('| Route | Browser | 1440px |');
    expect(comment).toContain('| `/dashboard` | chromium | ✓ |');
    expect(comment).toContain('| `/dashboard` | firefox | ✘ |');
    expect(comment).toContain('| `/dashboard` | webkit | ✘ |');
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
    expect(comment).toContain('require baseline acceptance');
    expect(comment).not.toContain('All visual tests passed');
    expect(comment).toContain('frontguard update-baselines');
    expect(comment).not.toContain('saved as the new baseline');
  });

  it('labels explicit baseline-update results as accepted', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult(
      [makeDiff({ status: 'new', route: { path: '/accepted' } })],
      { baselineUpdate: true },
    );
    const comment = reporter.generateComment(result);

    expect(comment).toContain('explicitly accepted');
    expect(comment).toContain('1 baseline explicitly accepted');
    expect(comment).not.toContain('no accepted baseline yet');
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
    expect(comment).toContain('Report directory: `/tmp/frontguard-test-report`');
  });

  it('uses the GitHub Enterprise API URL from the Actions environment', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'token');
    vi.stubEnv('GITHUB_API_URL', 'https://github.example.com/api/v3');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const reporter = new GitHubPRReporter({ owner: 'test', repo: 'repo', prNumber: 1 });

    await reporter.postComment('report');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://github.example.com/api/v3/repos/test/repo/issues/1/comments?per_page=100&page=1',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://github.example.com/api/v3/repos/test/repo/issues/1/comments',
    );
  });

  it('does not recommend executing fork code through a privileged PR event', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'read-only-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Resource not accessible by integration', { status: 403 })),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = new GitHubPRReporter({ owner: 'test', repo: 'repo', prNumber: 1 });

    await expect(reporter.postComment('report')).rejects.toThrow('403');

    const output = logged.mock.calls.flat().join(' ');
    expect(output).toContain('fork PR comments are unsupported');
    expect(output).toContain('separate privileged workflow');
    expect(output).not.toContain('use `pull_request_target`');
  });

  it('finds an existing Frontguard comment after the first page', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'token');
    const firstPage = Array.from({ length: 100 }, (_, id) => ({ id, body: 'other' }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 101, body: '<!-- frontguard-report -->' }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const reporter = new GitHubPRReporter({ owner: 'test', repo: 'repo', prNumber: 1 });

    await reporter.postComment('updated report');

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.github.com/repos/test/repo/issues/1/comments?per_page=100&page=2',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://api.github.com/repos/test/repo/issues/comments/101',
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('aborts GitHub API requests after the configured timeout', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'token');
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason ?? new Error('aborted')),
            { once: true },
          );
        }),
      ),
    );
    const reporter = new GitHubPRReporter({
      owner: 'test',
      repo: 'repo',
      prNumber: 1,
      requestTimeoutMs: 5,
    });

    await expect(reporter.postComment('report')).rejects.toThrow();
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

describe('GitHubPRReporter — perf ↔ visual correlation', () => {
  it('annotates a regressed diff with its perf-budget violation', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult(
      [makeDiff({ status: 'regression', diffPercentage: 8, route: { path: '/home' }, viewport: 1440 })],
      {
        perf: [
          {
            route: '/home',
            viewport: 1440,
            metrics: { lcp: 3200 },
            violations: [{ metric: 'lcp', actual: 3200, budget: 2500, unit: 'ms' }],
          },
        ],
      },
    );
    const comment = reporter.generateComment(result);
    // Inline correlation inside the regression block.
    expect(comment).toContain('⚡ **Performance**');
    expect(comment).toContain('lcp 3.20s > 2.50s');
    // Standalone summary section.
    expect(comment).toContain('## ⚡ Performance');
    expect(comment).toContain('1 budget violation');
  });

  it('surfaces a run-over-run perf regression inline and in the summary', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult(
      [makeDiff({ status: 'regression', diffPercentage: 8, route: { path: '/home' }, viewport: 1440 })],
      {
        perf: [
          {
            route: '/home',
            viewport: 1440,
            metrics: { ttfb: 540 },
            violations: [],
            regressions: [{ metric: 'ttfb', previous: 400, current: 540, deltaPct: 0.35, unit: 'ms' }],
          },
        ],
      },
    );
    const comment = reporter.generateComment(result);
    expect(comment).toContain('regressed since last run: ttfb +35%');
    expect(comment).toContain('1 regression since last run');
  });

  it('omits perf output when there are no violations', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult(
      [makeDiff({ status: 'regression', diffPercentage: 8, route: { path: '/home' }, viewport: 1440 })],
      {
        perf: [{ route: '/home', viewport: 1440, metrics: { lcp: 1200 }, violations: [] }],
      },
    );
    const comment = reporter.generateComment(result);
    expect(comment).not.toContain('Performance');
  });

  it('renders a third-party scripts section when origins changed', () => {
    const reporter = new GitHubPRReporter();
    const result = makeRunResult(
      [makeDiff({ status: 'regression', diffPercentage: 8, route: { path: '/home' }, viewport: 1440 })],
      {
        thirdPartyScripts: [
          { route: '/home', viewport: 1440, added: ['https://ads.example.com'], removed: [], current: ['https://ads.example.com'] },
        ],
      },
    );
    const comment = reporter.generateComment(result);
    expect(comment).toContain('## 🧩 Third-party scripts');
    expect(comment).toContain('https://ads.example.com');
  });
});
