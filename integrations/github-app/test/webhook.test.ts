import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyGitHubSignature,
  timingSafeEqual,
  decidePullRequest,
  buildCheckRunPayload,
  type PullRequestEvent,
} from '../src/webhook.js';
import { createGitHubApp } from '../src/handler.js';

const SECRET = 'webhook-secret';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

function prEvent(action = 'opened'): PullRequestEvent {
  return {
    action,
    number: 7,
    pull_request: {
      head: { sha: 'deadbeef', ref: 'feature' },
      base: { ref: 'main' },
      html_url: 'https://github.com/acme/web/pull/7',
    },
    repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    installation: { id: 123 },
  };
}

describe('timingSafeEqual', () => {
  it('compares correctly', () => {
    expect(timingSafeEqual('x', 'x')).toBe(true);
    expect(timingSafeEqual('x', 'y')).toBe(false);
  });
});

describe('verifyGitHubSignature', () => {
  it('accepts a valid sha256 signature', async () => {
    const body = JSON.stringify(prEvent());
    expect(await verifyGitHubSignature(body, sign(body), SECRET)).toBe(true);
  });
  it('rejects a wrong signature', async () => {
    const body = JSON.stringify(prEvent());
    expect(await verifyGitHubSignature(body, 'sha256=deadbeef', SECRET)).toBe(false);
  });
  it('rejects a missing or malformed header', async () => {
    expect(await verifyGitHubSignature('b', null, SECRET)).toBe(false);
    expect(await verifyGitHubSignature('b', 'sha1=abc', SECRET)).toBe(false);
  });
});

describe('decidePullRequest', () => {
  it('triggers on opened/synchronize/reopened/ready_for_review', () => {
    for (const action of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
      const d = decidePullRequest(prEvent(action));
      expect(d.trigger).toBe(true);
      expect(d.commitSha).toBe('deadbeef');
      expect(d.owner).toBe('acme');
      expect(d.installationId).toBe(123);
    }
  });
  it('ignores closed/labeled', () => {
    expect(decidePullRequest(prEvent('closed')).trigger).toBe(false);
    expect(decidePullRequest(prEvent('labeled')).trigger).toBe(false);
  });
});

describe('buildCheckRunPayload', () => {
  it('builds an in-progress check', () => {
    const p = buildCheckRunPayload({ commitSha: 'abc', status: 'in_progress' });
    expect(p.status).toBe('in_progress');
    expect(p.started_at).toBeDefined();
    expect(p.name).toBe('Frontguard Visual Regression');
  });
  it('concludes failure when regressions present', () => {
    const p = buildCheckRunPayload({ commitSha: 'abc', status: 'completed', regressions: 2, total: 5 });
    expect(p.conclusion).toBe('failure');
    expect((p.output as { title: string }).title).toMatch(/2 visual regression/);
  });
  it('concludes neutral for warnings only', () => {
    const p = buildCheckRunPayload({ commitSha: 'abc', status: 'completed', warnings: 1, total: 3 });
    expect(p.conclusion).toBe('neutral');
  });
  it('concludes success when clean', () => {
    const p = buildCheckRunPayload({ commitSha: 'abc', status: 'completed', total: 4 });
    expect(p.conclusion).toBe('success');
  });
});

describe('GitHub App handler', () => {
  it('health check', async () => {
    const res = await createGitHubApp().request('/health');
    expect(res.status).toBe(200);
    expect((await res.json()).integration).toBe('github-app');
  });

  it('responds to ping', async () => {
    const app = createGitHubApp();
    const res = await app.request(
      '/webhook',
      { method: 'POST', body: '{}', headers: { 'x-github-event': 'ping' } },
      {},
    );
    expect((await res.json()).pong).toBe(true);
  });

  it('rejects invalid signature when secret configured', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent());
    const res = await app.request(
      '/webhook',
      { method: 'POST', body, headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': 'sha256=bad' } },
      { GITHUB_WEBHOOK_SECRET: SECRET },
    );
    expect(res.status).toBe(401);
  });

  it('ignores non-trigger PR actions', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent('closed'));
    const res = await app.request(
      '/webhook',
      { method: 'POST', body, headers: { 'x-github-event': 'pull_request' } },
      {},
    );
    const json = await res.json();
    expect(json.triggered).toBe(false);
  });

  it('triggers a run when API configured (no app creds → skips check run)', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent('opened'));
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'run_x' }), { status: 202 })) as typeof fetch;
    try {
      const res = await app.request(
        '/webhook',
        { method: 'POST', body, headers: { 'x-github-event': 'pull_request' } },
        { FRONTGUARD_API_URL: 'https://api.frontguard.dev', FRONTGUARD_API_KEY: 'fg_x' },
      );
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.runId).toBe('run_x');
    } finally {
      globalThis.fetch = orig;
    }
  });
});
