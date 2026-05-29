import { describe, it, expect } from 'vitest';
import {
  decideRun,
  parseGitHubRepo,
  triggerRun,
  pollRun,
  postPrComment,
  renderSummary,
  isFailingRun,
} from '../lib/core.js';

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
      const status = calls < 2 ? 'running' : 'passed';
      return new Response(JSON.stringify({ status }), { status: 200 });
    };
    const r = await pollRun({ apiUrl: 'https://api', apiKey: 'k', runId: 'r' }, fakeFetch, noSleep);
    expect(r.status).toBe('passed');
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

describe('renderSummary', () => {
  it('renders a passing summary', () => {
    const s = renderSummary({ status: 'passed', results: { total: 5, changed: 0 } }, 'https://p');
    expect(s).toContain('✅');
    expect(s).toContain('https://p');
    expect(s).toContain('Screenshots:** 5');
  });
  it('includes a report link when present', () => {
    const s = renderSummary({ status: 'failed', reportUrl: 'https://report' }, 'https://p');
    expect(s).toContain('⚠️');
    expect(s).toContain('https://report');
  });
});

describe('isFailingRun', () => {
  it('is true for failed/error', () => {
    expect(isFailingRun({ status: 'failed' })).toBe(true);
    expect(isFailingRun({ status: 'error' })).toBe(true);
  });
  it('is true when changes detected', () => {
    expect(isFailingRun({ status: 'completed', results: { changed: 3 } })).toBe(true);
  });
  it('is false when passed with no changes', () => {
    expect(isFailingRun({ status: 'passed', results: { changed: 0 } })).toBe(false);
  });
});
