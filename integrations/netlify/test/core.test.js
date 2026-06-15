import { describe, it, expect } from 'vitest';
import {
  decideRun,
  parseGitHubRepo,
  triggerRun,
  pollRun,
  postPrComment,
  renderSummary,
  isFailingRun,
  summarizeResults,
} from '../lib/core.js';

// Sample cloud-api responses modelled on packages/cloud-api/src/types.ts.
// `Run.status` is one of `queued | running | completed | failed`.
// `RunResult.status` is one of `passed | regression | changed | warning |
// new_baseline | failed`. These fixtures are reused across the tests below.
const FIXTURE_PASSING = {
  id: 'run_pass',
  status: 'completed',
  results: [
    { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
    { route: '/pricing', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
  ],
  reportUrl: 'https://api.frontguard.dev/v1/reports/run_pass',
};

const FIXTURE_FAILING = {
  id: 'run_fail',
  status: 'completed',
  results: [
    { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
    { route: '/pricing', viewport: 1440, status: 'regression', diffPercentage: 3.4, timestamp: 't' },
    { route: '/about', viewport: 1440, status: 'warning', diffPercentage: 0.2, timestamp: 't' },
  ],
  reportUrl: 'https://api.frontguard.dev/v1/reports/run_fail',
};

describe('decideRun', () => {
  it('runs on deploy-preview with DEPLOY_PRIME_URL', () => {
    const d = decideRun({ CONTEXT: 'deploy-preview', DEPLOY_PRIME_URL: 'https://p.netlify.app', REVIEW_ID: '42' });
    expect(d.run).toBe(true);
    expect(d.previewUrl).toBe('https://p.netlify.app');
    expect(d.reviewId).toBe('42');
  });

  it('runs on branch-deploy', () => {
    expect(decideRun({ CONTEXT: 'branch-deploy', DEPLOY_URL: 'https://b.netlify.app' }).run).toBe(true);
  });

  it('skips production by default', () => {
    const d = decideRun({ CONTEXT: 'production', URL: 'https://site.com' });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/production/i);
  });

  it('runs production when productionToo is set', () => {
    expect(decideRun({ CONTEXT: 'production', URL: 'https://site.com' }, { productionToo: true }).run).toBe(true);
  });

  it('skips when no URL is available', () => {
    expect(decideRun({ CONTEXT: 'deploy-preview' }).run).toBe(false);
  });

  it('prefers DEPLOY_PRIME_URL over DEPLOY_URL and URL', () => {
    const d = decideRun({
      CONTEXT: 'deploy-preview',
      DEPLOY_PRIME_URL: 'https://prime',
      DEPLOY_URL: 'https://deploy',
      URL: 'https://prod',
    });
    expect(d.previewUrl).toBe('https://prime');
  });

  // P2-9 — CONTEXT is set by Netlify on every real build. Missing CONTEXT
  // means the plugin is running inside a local build or another tool's
  // harness and should not invoke cloud-api.
  it('skips when CONTEXT is undefined (no Netlify build env)', () => {
    const d = decideRun({ DEPLOY_PRIME_URL: 'https://p.netlify.app' });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/CONTEXT/i);
  });

  it('skips when CONTEXT is the empty string', () => {
    expect(decideRun({ CONTEXT: '', DEPLOY_PRIME_URL: 'https://p' }).run).toBe(false);
  });
});

describe('parseGitHubRepo', () => {
  it('parses https URLs', () => {
    expect(parseGitHubRepo('https://github.com/acme/web')).toEqual({ owner: 'acme', repo: 'web' });
  });
  it('parses https URLs with .git', () => {
    expect(parseGitHubRepo('https://github.com/acme/web.git')).toEqual({ owner: 'acme', repo: 'web' });
  });
  it('parses ssh URLs', () => {
    expect(parseGitHubRepo('git@github.com:acme/web.git')).toEqual({ owner: 'acme', repo: 'web' });
  });
  it('returns null for non-GitHub and empty', () => {
    expect(parseGitHubRepo('https://gitlab.com/a/b')).toBeNull();
    expect(parseGitHubRepo(undefined)).toBeNull();
  });
});

describe('triggerRun', () => {
  it('POSTs url + routes and returns the run id', async () => {
    let captured;
    const fakeFetch = async (url, init) => {
      captured = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
      return new Response(JSON.stringify({ id: 'run_1', statusUrl: '/v1/runs/run_1' }), { status: 200 });
    };
    const r = await triggerRun({ apiUrl: 'https://api', apiKey: 'k', previewUrl: 'https://p', routes: ['/', '/x'] }, fakeFetch);
    expect(r.id).toBe('run_1');
    expect(captured.url).toBe('https://api/v1/run');
    expect(captured.body.routes).toEqual([{ path: '/' }, { path: '/x' }]);
    expect(captured.auth).toBe('Bearer k');
  });

  it('defaults routes to ["/"]', async () => {
    let body;
    const fakeFetch = async (_u, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'r' }), { status: 200 });
    };
    await triggerRun({ apiUrl: 'https://api', apiKey: 'k', previewUrl: 'https://p' }, fakeFetch);
    expect(body.routes).toEqual([{ path: '/' }]);
  });

  it('throws on non-ok response', async () => {
    const fakeFetch = async () => new Response('nope', { status: 500 });
    await expect(triggerRun({ apiUrl: 'https://api', apiKey: 'k', previewUrl: 'https://p' }, fakeFetch)).rejects.toThrow(/500/);
  });
});

describe('pollRun', () => {
  const noSleep = async () => {};
  it('returns when a terminal status is reached', async () => {
    let calls = 0;
    const fakeFetch = async () => {
      calls += 1;
      const status = calls < 2 ? 'running' : 'completed';
      return new Response(
        JSON.stringify({ status, results: FIXTURE_PASSING.results }),
        { status: 200 },
      );
    };
    const r = await pollRun({ apiUrl: 'https://api', apiKey: 'k', runId: 'r' }, fakeFetch, noSleep);
    expect(r.status).toBe('completed');
    expect(calls).toBe(2);
  });

  it('returns timeout when deadline passes', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ status: 'running' }), { status: 200 });
    const r = await pollRun({ apiUrl: 'https://api', apiKey: 'k', runId: 'r', timeoutMs: 0 }, fakeFetch, noSleep);
    expect(r.status).toBe('timeout');
  });
});

describe('postPrComment', () => {
  it('returns true on success', async () => {
    const fakeFetch = async (url, init) => {
      expect(url).toContain('/repos/acme/web/issues/42/comments');
      expect(JSON.parse(init.body).body).toContain('hi');
      return new Response('{}', { status: 201 });
    };
    const ok = await postPrComment({ token: 't', owner: 'acme', repo: 'web', prNumber: '42', body: 'hi' }, fakeFetch);
    expect(ok).toBe(true);
  });

  it('returns false (no throw) on network error', async () => {
    const fakeFetch = async () => {
      throw new Error('boom');
    };
    expect(await postPrComment({ token: 't', owner: 'a', repo: 'b', prNumber: '1', body: 'x' }, fakeFetch)).toBe(false);
  });
});

describe('summarizeResults', () => {
  it('counts regressions, warnings, failed, passed', () => {
    const s = summarizeResults([
      { status: 'passed' },
      { status: 'regression' },
      { status: 'changed' },
      { status: 'warning' },
      { status: 'failed' },
      { status: 'new_baseline' },
    ]);
    expect(s.total).toBe(6);
    expect(s.regressions).toBe(2); // regression + changed
    expect(s.warnings).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.passed).toBe(2); // passed + new_baseline
  });

  it('returns zeros for null/undefined results', () => {
    expect(summarizeResults(null)).toEqual({ total: 0, regressions: 0, warnings: 0, failed: 0, passed: 0 });
    expect(summarizeResults(undefined)).toEqual({ total: 0, regressions: 0, warnings: 0, failed: 0, passed: 0 });
  });

  it('returns zeros for non-array input (defensive)', () => {
    expect(summarizeResults(/** @type {any} */ ({ changed: 3 })).regressions).toBe(0);
  });
});

describe('renderSummary', () => {
  it('renders a passing summary from the real cloud-api shape', () => {
    const s = renderSummary(FIXTURE_PASSING, 'https://p');
    expect(s).toContain('✅');
    expect(s).toContain('https://p');
    expect(s).toContain('Screenshots:** 2');
    expect(s).not.toContain('Regressions:');
  });

  it('renders a failing summary with regression count', () => {
    const s = renderSummary(FIXTURE_FAILING, 'https://p');
    expect(s).toContain('❌');
    expect(s).toContain('Screenshots:** 3');
    expect(s).toContain('Regressions:** 1');
    expect(s).toContain('Warnings:** 1');
  });

  it('includes a report link when present', () => {
    const s = renderSummary({ status: 'failed', reportUrl: 'https://report', results: null }, 'https://p');
    expect(s).toContain('❌');
    expect(s).toContain('https://report');
  });

  // FIX N1: a timed-out run shows ❌.
  it('shows ❌ for a timeout status', () => {
    const s = renderSummary({ status: 'timeout', results: null }, 'https://p');
    expect(s).toContain('❌');
  });
});

describe('isFailingRun', () => {
  it('is true when top-level status is failed', () => {
    expect(isFailingRun({ status: 'failed', results: null })).toBe(true);
  });

  it('is true when top-level status is error (legacy alias)', () => {
    expect(isFailingRun({ status: 'error', results: null })).toBe(true);
  });

  // FIX N1: a timed-out run must fail the build.
  it('is true for a timeout status', () => {
    expect(isFailingRun({ status: 'timeout', results: null })).toBe(true);
  });

  it('is true when any per-result status is regression (real cloud-api shape)', () => {
    expect(isFailingRun(FIXTURE_FAILING)).toBe(true);
  });

  it('is true when any per-result status is changed', () => {
    expect(isFailingRun({
      status: 'completed',
      results: [{ route: '/', viewport: 1440, status: 'changed', diffPercentage: 1, timestamp: 't' }],
    })).toBe(true);
  });

  it('is true when any per-result status is failed (defensive — widened type)', () => {
    expect(isFailingRun({
      status: 'completed',
      results: [{ route: '/', viewport: 1440, status: 'failed', diffPercentage: 0, timestamp: 't' }],
    })).toBe(true);
  });

  it('is false for the all-passed cloud-api response', () => {
    expect(isFailingRun(FIXTURE_PASSING)).toBe(false);
  });

  it('is false when results is null (no results, no regressions)', () => {
    expect(isFailingRun({ status: 'completed', results: null })).toBe(false);
  });

  it('is false for a results array with only passed + new_baseline + warning entries', () => {
    expect(isFailingRun({
      status: 'completed',
      results: [
        { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
        { route: '/x', viewport: 1440, status: 'new_baseline', diffPercentage: 0, timestamp: 't' },
        { route: '/y', viewport: 1440, status: 'warning', diffPercentage: 0.1, timestamp: 't' },
      ],
    })).toBe(false);
  });

  // P0-11 regression — old code read `run.results.changed`, which cloud-api
  // never returns. That bug made every build green. This guards against it.
  it('does NOT trust a non-array `results.changed` field (old buggy shape)', () => {
    const fakeOldShape = { status: 'completed', results: /** @type {any} */ ({ changed: 5 }) };
    expect(isFailingRun(fakeOldShape)).toBe(false);
  });
});
