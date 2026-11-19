import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import {
  verifyGitHubSignature,
  timingSafeEqual,
  decidePullRequest,
  decideInstallation,
  buildCheckRunPayload,
  type PullRequestEvent,
  type InstallationEvent,
} from '../src/webhook.js';
import {
  createGitHubApp,
  clearPreviewUrlCache,
  recallCheckRunBinding,
  type KVNamespace,
} from '../src/handler.js';

const SECRET = 'webhook-secret';
const CALLBACK_SECRET = 'callback-secret';
const VALID_SHA = 'deadbeef0123456789abcdef0123456789abcdef';

// App credentials for handler tests that exercise the GitHub API code paths.
const APP_ID = '424242';
const APP_PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
}) as string;
const APP_ENV = { GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: APP_PEM };

function memoryKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function stubPublicDnsFetch(
  inner: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('cloudflare-dns.com/dns-query')) {
      const isAaaa = /[?&]type=(28|AAAA)(?:&|$)/i.test(urlStr);
      const body = isAaaa ? { Answer: [] } : { Answer: [{ type: 1, data: '93.184.216.34' }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/dns-json' },
      });
    }
    return inner(String(url), init);
  }) as typeof fetch;
}

function installEvent(action = 'created'): InstallationEvent {
  return {
    action,
    installation: { id: 123, account: { login: 'acme' } },
  };
}

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

function prEvent(action = 'opened'): PullRequestEvent {
  return {
    action,
    number: 7,
    pull_request: {
      head: { sha: VALID_SHA, ref: 'feature', repo: { full_name: 'acme/web', fork: false } },
      base: { ref: 'main', repo: { full_name: 'acme/web' } },
      html_url: 'https://github.com/acme/web/pull/7',
    },
    repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    installation: { id: 123 },
  };
}

beforeEach(() => clearPreviewUrlCache());

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
      expect(d.commitSha).toBe(VALID_SHA);
      expect(d.owner).toBe('acme');
      expect(d.baseRef).toBe('main');
      expect(d.installationId).toBe(123);
    }
  });
  it('ignores closed/labeled', () => {
    expect(decidePullRequest(prEvent('closed')).trigger).toBe(false);
    expect(decidePullRequest(prEvent('labeled')).trigger).toBe(false);
  });
  it('rejects fork PRs and deleted/missing head repos by default', () => {
    const fork = prEvent('opened');
    fork.pull_request.head.repo = { full_name: 'attacker/web', fork: true };
    expect(decidePullRequest(fork).trigger).toBe(false);

    const diffName = prEvent('opened');
    diffName.pull_request.head.repo = { full_name: 'other/web', fork: false };
    expect(decidePullRequest(diffName).trigger).toBe(false);

    const deletedFork = prEvent('opened');
    deletedFork.pull_request.head.repo = null;
    expect(decidePullRequest(deletedFork).trigger).toBe(false);

    expect(decidePullRequest(fork, { allowForkPrs: true }).trigger).toBe(true);
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

/**
 * Posts a signed webhook with the secret configured. Merges any extra env so
 * tests can add app credentials etc. Webhooks now fail closed without a secret.
 */
async function postWebhook(
  app: ReturnType<typeof createGitHubApp>,
  event: string,
  body: string,
  extraEnv: Record<string, unknown> = {},
): Promise<Response> {
  return app.request(
    '/webhook',
    { method: 'POST', body, headers: { 'x-github-event': event, 'x-hub-signature-256': sign(body) } },
    { GITHUB_WEBHOOK_SECRET: SECRET, ...extraEnv },
  );
}

describe('GitHub App handler', () => {
  it('health check', async () => {
    const res = await createGitHubApp().request('/health');
    expect(res.status).toBe(200);
    expect((await res.json()).integration).toBe('github-app');
  });

  it('responds to ping', async () => {
    const app = createGitHubApp();
    const res = await postWebhook(app, 'ping', '{}');
    expect((await res.json()).pong).toBe(true);
  });

  it('fails closed (500) when the webhook secret is not configured', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent());
    const res = await app.request(
      '/webhook',
      { method: 'POST', body, headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(body) } },
      {},
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/secret not configured/i);
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
    const res = await postWebhook(app, 'pull_request', JSON.stringify(prEvent('closed')));
    const json = await res.json();
    expect(json.triggered).toBe(false);
  });

  it('triggers a run when API configured (no app creds → skips check run)', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent('opened'));
    const orig = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;
    let sentHeaders: Record<string, string> | null = null;
    globalThis.fetch = stubPublicDnsFetch(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(init!.body as string);
      sentHeaders = (init!.headers as Record<string, string>) ?? {};
      return new Response(JSON.stringify({ id: 'run_x' }), { status: 202 });
    });
    try {
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
        FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET,
        // Template fallback so the run can be triggered without a deployment
        // event having fired first. Without this we'd correctly skip.
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
      });
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.runId).toBe('run_x');
      // Service-to-service callback secret header is forwarded to cloud-api.
      expect(sentHeaders?.['X-Frontguard-Callback-Secret']).toBe(CALLBACK_SECRET);
      // The github linkage is forwarded as a nested object the Cloud API accepts.
      expect((sentBody as { github?: { owner?: string } } | null)?.github?.owner).toBe('acme');
      // Preview URL must NOT be the github.com PR URL.
      const runBody = sentBody as { url?: string } | null;
      expect(runBody?.url).not.toContain('github.com');
      expect(runBody?.url).toBe('https://pr-7.preview.example.com');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('refuses to share a global FRONTGUARD_API_KEY without single-tenant binding or per-installation credentials', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent('opened'));
    const orig = globalThis.fetch;
    let runCalled = false;
    globalThis.fetch = stubPublicDnsFetch(async () => {
      runCalled = true;
      return new Response(JSON.stringify({ id: 'run_x' }), { status: 202 });
    });
    try {
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_global_secret',
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
      });
      const json = await res.json();
      expect(json.triggered).toBe(false);
      expect(json.reason).toMatch(/tenant API credential/i);
      expect(runCalled).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('returns 502 instead of triggered:true when cloud-api /v1/run returns non-ok', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(prEvent('opened'));
    const orig = globalThis.fetch;
    globalThis.fetch = stubPublicDnsFetch(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    try {
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
      });
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.triggered).toBe(false);
      expect(json.error).toContain('boom');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('rejects oversized webhook payloads with 413', async () => {
    const app = createGitHubApp();
    const huge = 'x'.repeat(1_048_577);
    const res = await app.request(
      '/webhook',
      { method: 'POST', body: huge, headers: { 'x-github-event': 'ping', 'x-hub-signature-256': 'sha256=abc' } },
      { GITHUB_WEBHOOK_SECRET: SECRET },
    );
    expect(res.status).toBe(413);
  });
});

describe('decideInstallation', () => {
  it('bootstraps on created/added', () => {
    for (const action of ['created', 'added']) {
      const d = decideInstallation(installEvent(action));
      expect(d.bootstrap).toBe(true);
      expect(d.installationId).toBe(123);
      expect(d.account).toBe('acme');
    }
  });
  it('ignores deleted/removed', () => {
    expect(decideInstallation(installEvent('deleted')).bootstrap).toBe(false);
    expect(decideInstallation(installEvent('removed')).bootstrap).toBe(false);
  });
  it('skips when no installation id', () => {
    const d = decideInstallation({ action: 'created', installation: { id: 0 as unknown as number, account: { login: 'a' } } });
    expect(d.bootstrap).toBe(false);
  });
});

/** Routes a GitHub API path to a Response for handler integration tests. */
function ghRouter(handlers: Array<{ test: (url: string, init?: RequestInit) => boolean; res: (url: string, init?: RequestInit) => Response }>) {
  return stubPublicDnsFetch(async (url: string, init?: RequestInit) => {
    const u = String(url);
    // Installation token exchange is common to all app-cred flows.
    if (u.includes('/access_tokens')) return new Response(JSON.stringify({ token: 'ghs_test' }), { status: 201 });
    const h = handlers.find((x) => x.test(u, init));
    if (!h) throw new Error(`Unhandled fetch in test: ${(init?.method ?? 'GET')} ${u}`);
    return h.res(u, init);
  });
}

describe('GitHub App handler — installation bootstrap', () => {
  it('opens a config PR for a repo lacking config', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(installEvent('created'));
    const orig = globalThis.fetch;
    let prOpened = false;
    globalThis.fetch = ghRouter([
      {
        test: (u) => u.includes('/installation/repositories'),
        res: () =>
          new Response(
            JSON.stringify({ repositories: [{ name: 'web', owner: { login: 'acme' }, full_name: 'acme/web', default_branch: 'main' }] }),
            { status: 200 },
          ),
      },
      { test: (u, i) => u.includes('/contents/') && (i?.method ?? 'GET') === 'GET', res: () => new Response('no', { status: 404 }) },
      { test: (u) => u.includes('/git/ref/heads/main'), res: () => new Response(JSON.stringify({ object: { sha: 'base' } }), { status: 200 }) },
      { test: (u, i) => u.includes('/git/refs') && i?.method === 'POST', res: () => new Response('{}', { status: 201 }) },
      { test: (u, i) => u.includes('/contents/frontguard.config.ts') && i?.method === 'PUT', res: () => new Response('{}', { status: 201 }) },
      // Workflow file is also planted alongside the config.
      { test: (u, i) => u.includes('/contents/') && u.includes('frontguard.yml') && i?.method === 'PUT', res: () => new Response('{}', { status: 201 }) },
      {
        test: (u, i) => u.includes('/pulls') && i?.method === 'POST',
        res: () => {
          prOpened = true;
          return new Response(JSON.stringify({ number: 1, html_url: 'https://github.com/acme/web/pull/1' }), { status: 201 });
        },
      },
    ]);
    try {
      const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': sign(body) } }, { GITHUB_WEBHOOK_SECRET: SECRET, ...APP_ENV });
      const json = await res.json();
      expect(json.bootstrapped).toBe(true);
      expect(json.opened).toEqual(['acme/web']);
      expect(json.skipped).toEqual([]);
      expect(prOpened).toBe(true);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('skips bootstrap when config already present', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(installEvent('created'));
    const orig = globalThis.fetch;
    const b64 = Buffer.from('export default {}\n').toString('base64');
    let prOpened = false;
    globalThis.fetch = ghRouter([
      {
        test: (u) => u.includes('/installation/repositories'),
        res: () =>
          new Response(
            JSON.stringify({ repositories: [{ name: 'web', owner: { login: 'acme' }, full_name: 'acme/web', default_branch: 'main' }] }),
            { status: 200 },
          ),
      },
      { test: (u) => u.includes('/contents/frontguard.config.ts'), res: () => new Response(JSON.stringify({ sha: 's', content: b64, encoding: 'base64' }), { status: 200 }) },
      { test: (u, i) => u.includes('/pulls') && i?.method === 'POST', res: () => { prOpened = true; return new Response('{}', { status: 201 }); } },
    ]);
    try {
      const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': sign(body) } }, { GITHUB_WEBHOOK_SECRET: SECRET, ...APP_ENV });
      const json = await res.json();
      expect(json.bootstrapped).toBe(true);
      expect(json.skipped).toEqual(['acme/web']);
      expect(json.opened).toEqual([]);
      expect(prOpened).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('does nothing on a deleted installation', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify(installEvent('deleted'));
    const res = await app.request('/webhook', { method: 'POST', body, headers: { 'x-github-event': 'installation', 'x-hub-signature-256': sign(body) } }, { GITHUB_WEBHOOK_SECRET: SECRET, ...APP_ENV });
    const json = await res.json();
    expect(json.bootstrapped).toBe(false);
  });
});

describe('GitHub App handler — per-repo config in run trigger', () => {
  it('reads repo config strictly from base.ref (not head.ref) and binds checkRunId on trigger', async () => {
    const app = createGitHubApp();
    const kv = memoryKV();
    await kv.put('installation:123:credentials', JSON.stringify({ apiKey: 'fg_tenant_123' }));
    const body = JSON.stringify(prEvent('opened'));
    const orig = globalThis.fetch;
    const yml = Buffer.from('threshold: 0.05\n').toString('base64');
    const contentUrls: string[] = [];
    let runRequestBody: Record<string, unknown> | null = null;
    let runAuthHeader: string | undefined;
    globalThis.fetch = ghRouter([
      { test: (u, i) => u.includes('/check-runs') && i?.method === 'POST', res: () => new Response(JSON.stringify({ id: 777 }), { status: 201 }) },
      {
        test: (u) => u.includes('/contents/frontguard.config.ts'),
        res: (u) => {
          contentUrls.push(u);
          return new Response('no', { status: 404 });
        },
      },
      {
        test: (u) => u.includes('/contents/.github/frontguard.yml'),
        res: (u) => {
          contentUrls.push(u);
          return new Response(JSON.stringify({ sha: 's', content: yml, encoding: 'base64' }), { status: 200 });
        },
      },
      {
        test: (u) => u.includes('/v1/run'),
        res: (_u, i) => {
          runRequestBody = JSON.parse((i!.body as string) ?? '{}');
          runAuthHeader = (i!.headers as Record<string, string>)?.Authorization;
          return new Response(JSON.stringify({ id: 'run_cfg' }), { status: 202 });
        },
      },
    ]);
    try {
      const env = {
        GITHUB_WEBHOOK_SECRET: SECRET,
        ...APP_ENV,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET,
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
        KV: kv,
      };
      const res = await app.request(
        '/webhook',
        { method: 'POST', body, headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(body) } },
        env,
      );
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.checkRunId).toBe(777);
      expect(json.config).toBe('.github/frontguard.yml');
      expect(runAuthHeader).toBe('Bearer fg_tenant_123');
      expect((runRequestBody!.config as { path: string }).path).toBe('.github/frontguard.yml');
      expect(runRequestBody!.checkRunId).toBe(777);
      // Config MUST be read from base.ref (`main`), never head.ref (`feature`).
      expect(contentUrls.length).toBe(2);
      expect(contentUrls.every((u) => u.endsWith('?ref=main'))).toBe(true);
      // Preview URL was forwarded from the template, not the PR html_url.
      expect(runRequestBody!.url).toBe('https://pr-7.preview.example.com');
      // Server-side Check Run binding recorded in memory & KV.
      const binding = await recallCheckRunBinding(777, env);
      expect(binding).toMatchObject({
        runId: 'run_cfg',
        owner: 'acme',
        repo: 'web',
        commitSha: VALID_SHA,
        installationId: 123,
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('GitHub App handler — check run completion callback', () => {
  function completeBody(extra: Record<string, unknown> = {}) {
    return JSON.stringify({ owner: 'acme', repo: 'web', commitSha: VALID_SHA, installationId: 123, ...extra });
  }

  it('completes with success conclusion', async () => {
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let patched: Record<string, unknown> | null = null;
    globalThis.fetch = ghRouter([
      {
        test: (u, i) => u.includes('/check-runs/555') && i?.method === 'PATCH',
        res: (_u, i) => {
          patched = JSON.parse((i!.body as string) ?? '{}');
          return new Response(JSON.stringify({ id: 555 }), { status: 200 });
        },
      },
    ]);
    try {
      const res = await app.request(
        '/runs/555/complete',
        { method: 'POST', body: completeBody({ conclusion: 'success', total: 4 }), headers: { authorization: `Bearer ${CALLBACK_SECRET}` } },
        { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET },
      );
      const json = await res.json();
      expect(json.completed).toBe(true);
      expect(json.conclusion).toBe('success');
      expect(patched!.status).toBe('completed');
      expect(patched!.conclusion).toBe('success');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('completes with failure conclusion and custom summary', async () => {
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let patched: Record<string, unknown> | null = null;
    globalThis.fetch = ghRouter([
      {
        test: (u, i) => u.includes('/check-runs/555') && i?.method === 'PATCH',
        res: (_u, i) => {
          patched = JSON.parse((i!.body as string) ?? '{}');
          return new Response(JSON.stringify({ id: 555 }), { status: 200 });
        },
      },
    ]);
    try {
      const res = await app.request(
        '/runs/555/complete',
        { method: 'POST', body: completeBody({ conclusion: 'failure', regressions: 3, total: 5, summary: 'Custom summary text' }), headers: { authorization: `Bearer ${CALLBACK_SECRET}` } },
        { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET },
      );
      const json = await res.json();
      expect(json.completed).toBe(true);
      expect(json.conclusion).toBe('failure');
      expect(patched!.conclusion).toBe('failure');
      expect((patched!.output as { summary: string }).summary).toBe('Custom summary text');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('rejects an invalid checkRunId', async () => {
    const app = createGitHubApp();
    const res = await app.request('/runs/abc/complete', { method: 'POST', body: completeBody(), headers: { authorization: `Bearer ${CALLBACK_SECRET}` } }, { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields', async () => {
    const app = createGitHubApp();
    const res = await app.request('/runs/555/complete', { method: 'POST', body: JSON.stringify({ owner: 'acme' }), headers: { authorization: `Bearer ${CALLBACK_SECRET}` } }, { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET });
    expect(res.status).toBe(400);
  });

  it('fails closed (500) when the callback secret is not configured', async () => {
    const app = createGitHubApp();
    const res = await app.request('/runs/555/complete', { method: 'POST', body: completeBody() }, APP_ENV);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Callback secret not configured/i);
  });

  it('rejects an unauthenticated / wrong-secret caller (401)', async () => {
    const app = createGitHubApp();
    const env = { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET };
    const noAuth = await app.request('/runs/555/complete', { method: 'POST', body: completeBody() }, env);
    expect(noAuth.status).toBe(401);
    const wrong = await app.request(
      '/runs/555/complete',
      { method: 'POST', body: completeBody(), headers: { authorization: 'Bearer wrong' } },
      env,
    );
    expect(wrong.status).toBe(401);
  });

  it('rejects invalid owner/repo/commitSha/installationId/detailsUrl with 400', async () => {
    const app = createGitHubApp();
    const env = { ...APP_ENV, FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET };
    const authHeaders = { authorization: `Bearer ${CALLBACK_SECRET}` };

    for (const bad of [
      completeBody({ owner: '../evil' }),
      completeBody({ repo: 'a/b' }),
      completeBody({ commitSha: 'shortsha' }),
      completeBody({ installationId: -1 }),
      completeBody({ detailsUrl: 'http://insecure.example/report' }),
      completeBody({ detailsUrl: 'javascript:alert(1)' }),
    ]) {
      const res = await app.request('/runs/555/complete', { method: 'POST', body: bad, headers: authHeaders }, env);
      expect(res.status, bad).toBe(400);
    }
  });

  it('enforces server-side checkRunId binding and rejects mismatches with 403', async () => {
    const app = createGitHubApp();
    const kv = memoryKV();
    await kv.put('installation:123:credentials', JSON.stringify({ apiKey: 'fg_tenant_123' }));
    const orig = globalThis.fetch;
    globalThis.fetch = ghRouter([
      { test: (u, i) => u.includes('/check-runs') && i?.method === 'POST', res: () => new Response(JSON.stringify({ id: 901 }), { status: 201 }) },
      { test: (u) => u.includes('/contents/'), res: () => new Response('no', { status: 404 }) },
      { test: (u) => u.includes('/v1/run'), res: () => new Response(JSON.stringify({ id: 'run_bound' }), { status: 202 }) },
      { test: (u, i) => u.includes('/check-runs/901') && i?.method === 'PATCH', res: () => new Response(JSON.stringify({ id: 901 }), { status: 200 }) },
    ]);
    try {
      const env = {
        GITHUB_WEBHOOK_SECRET: SECRET,
        ...APP_ENV,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_CALLBACK_SECRET: CALLBACK_SECRET,
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
        KV: kv,
      };
      // Trigger PR so checkRunId 901 is bound to acme/web @ VALID_SHA / install 123 / run_bound.
      const trig = await postWebhook(app, 'pull_request', JSON.stringify(prEvent('opened')), env);
      expect((await trig.json()).triggered).toBe(true);

      const authHeaders = { authorization: `Bearer ${CALLBACK_SECRET}` };
      // Wrong repo -> 403
      const wrongRepo = await app.request(
        '/runs/901/complete',
        { method: 'POST', body: completeBody({ repo: 'other-repo' }), headers: authHeaders },
        env,
      );
      expect(wrongRepo.status).toBe(403);

      // Wrong installationId -> 403
      const wrongInst = await app.request(
        '/runs/901/complete',
        { method: 'POST', body: completeBody({ installationId: 999 }), headers: authHeaders },
        env,
      );
      expect(wrongInst.status).toBe(403);

      // Wrong runId -> 403
      const wrongRun = await app.request(
        '/runs/901/complete',
        { method: 'POST', body: completeBody({ runId: 'run_forged' }), headers: authHeaders },
        env,
      );
      expect(wrongRun.status).toBe(403);

      // Unknown checkRunId when durable KV is active -> 403
      const unknownCheck = await app.request(
        '/runs/9999/complete',
        { method: 'POST', body: completeBody(), headers: authHeaders },
        env,
      );
      expect(unknownCheck.status).toBe(403);

      // Matching binding -> 200
      const ok = await app.request(
        '/runs/901/complete',
        { method: 'POST', body: completeBody({ runId: 'run_bound', conclusion: 'success', detailsUrl: 'https://reports.example.com/r/1' }), headers: authHeaders },
        env,
      );
      expect(ok.status).toBe(200);
      expect((await ok.json()).completed).toBe(true);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
