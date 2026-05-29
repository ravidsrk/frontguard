import { describe, it, expect } from 'vitest';
import { deriveOutcome, completeCheckRun } from '../src/github-callback.js';
import type { Run } from '../src/types.js';

function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    status: 'completed',
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.01,
    ai: null,
    createdAt: 'now',
    results: [],
    reportUrl: null,
    github: { owner: 'acme', repo: 'web', prNumber: 7, commitSha: 'abc123' },
    checkRunId: 42,
    installationId: 99,
    ...over,
  };
}

describe('deriveOutcome', () => {
  it('reports success when there are no regressions', () => {
    const out = deriveOutcome(makeRun({ results: [{ route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 'now' }] }));
    expect(out.conclusion).toBe('success');
    expect(out.regressions).toBe(0);
    expect(out.total).toBe(1);
  });

  it('reports failure when a regression is present', () => {
    const out = deriveOutcome(makeRun({ results: [
      { route: '/', viewport: 1440, status: 'regression', diffPercentage: 12, timestamp: 'now' },
      { route: '/x', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 'now' },
    ] }));
    expect(out.conclusion).toBe('failure');
    expect(out.regressions).toBe(1);
    expect(out.total).toBe(2);
  });

  it('reports neutral when the run itself failed', () => {
    expect(deriveOutcome(makeRun({ status: 'failed', error: 'boom' })).conclusion).toBe('neutral');
  });
});

describe('completeCheckRun', () => {
  const env = {
    GITHUB_APP_URL: 'https://gh-app.example.com',
    FRONTGUARD_CALLBACK_SECRET: 'shhh',
    PUBLIC_BASE_URL: 'https://api.frontguard.dev',
  };

  it('posts to the completion endpoint with the bearer secret and outcome', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const ok = await completeCheckRun(env, makeRun({ results: [{ route: '/', viewport: 1440, status: 'regression', diffPercentage: 9, timestamp: 'now' }] }), fakeFetch);
    expect(ok).toBe(true);
    expect(captured!.url).toBe('https://gh-app.example.com/runs/42/complete');
    expect((captured!.init.headers as Record<string, string>).authorization).toBe('Bearer shhh');
    const body = JSON.parse(captured!.init.body as string);
    expect(body.conclusion).toBe('failure');
    expect(body.owner).toBe('acme');
    expect(body.commitSha).toBe('abc123');
    expect(body.installationId).toBe(99);
    expect(body.detailsUrl).toContain('/v1/reports/run-1');
  });

  it('no-ops when linkage is incomplete', async () => {
    let called = false;
    const fakeFetch = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    // No github linkage.
    expect(await completeCheckRun(env, makeRun({ github: undefined }), fakeFetch)).toBe(false);
    // No commit SHA.
    expect(await completeCheckRun(env, makeRun({ github: { owner: 'a', repo: 'b' } }), fakeFetch)).toBe(false);
    expect(called).toBe(false);
  });

  it('no-ops when callback secret/url are not configured', async () => {
    let called = false;
    const fakeFetch = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await completeCheckRun({}, makeRun(), fakeFetch)).toBe(false);
    expect(called).toBe(false);
  });
});
