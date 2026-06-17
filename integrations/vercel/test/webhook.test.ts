import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyVercelSignature,
  timingSafeEqual,
  decideFromWebhook,
  triggerRun,
  buildGitHubLinkage,
  isAllowedPreviewUrl,
  type VercelWebhookPayload,
} from '../src/webhook.js';
import { createVercelApp, parseRoutesEnv, type KVNamespace } from '../src/handler.js';

/** Minimal in-memory KV stub for tests. */
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
  };
}

const SECRET = 'test-secret';

function sign(body: string): string {
  return createHmac('sha1', SECRET).update(body).digest('hex');
}

function previewPayload(over: Partial<VercelWebhookPayload['payload']['deployment']> = {}): VercelWebhookPayload {
  return {
    type: 'deployment.succeeded',
    payload: {
      deployment: {
        id: 'dpl_1',
        url: 'my-app-abc123.vercel.app',
        target: null,
        meta: {
          githubCommitSha: 'abc123',
          githubPrId: '42',
          githubOrg: 'acme',
          githubRepo: 'web',
        },
        ...over,
      },
    },
  };
}

describe('timingSafeEqual', () => {
  it('matches equal strings and rejects others', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('isAllowedPreviewUrl', () => {
  it('allows https *.vercel.app hosts (no authorization required)', () => {
    expect(isAllowedPreviewUrl('https://my-app-abc123.vercel.app')).toBe(true);
    expect(isAllowedPreviewUrl('https://vercel.app')).toBe(true);
  });
  it('rejects non-https schemes', () => {
    expect(isAllowedPreviewUrl('http://my-app.vercel.app')).toBe(false);
    expect(isAllowedPreviewUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedPreviewUrl('http://preview.acme.com', { authorizedProject: true })).toBe(false);
  });
  it('rejects custom domains when project is NOT authorized', () => {
    expect(isAllowedPreviewUrl('https://preview.acme.com')).toBe(false);
    expect(isAllowedPreviewUrl('https://staging.shop.io')).toBe(false);
    expect(isAllowedPreviewUrl('https://vercel.app.evil.com')).toBe(false);
  });
  it('accepts custom domains when the project IS authorized', () => {
    expect(isAllowedPreviewUrl('https://preview.acme.com', { authorizedProject: true })).toBe(true);
    expect(isAllowedPreviewUrl('https://feature-x--shop.netlify.app', { authorizedProject: true })).toBe(true);
    expect(isAllowedPreviewUrl('https://branch--app.pages.dev', { authorizedProject: true })).toBe(true);
  });
  it('always blocks private/loopback/link-local hosts (SSRF, even when authorized)', () => {
    for (const url of [
      'https://169.254.169.254', // EC2 / GCE metadata
      'https://127.0.0.1',
      'https://10.0.0.5',
      'https://192.168.1.1',
      'https://172.16.0.1',
      'https://172.31.255.255',
      'https://localhost',
      'https://metadata.google.internal',
      'https://[::1]',
    ]) {
      expect(isAllowedPreviewUrl(url, { authorizedProject: true })).toBe(false);
      expect(isAllowedPreviewUrl(url)).toBe(false);
    }
  });
  it('rejects empty/invalid input', () => {
    expect(isAllowedPreviewUrl(undefined)).toBe(false);
    expect(isAllowedPreviewUrl('not a url')).toBe(false);
  });
});

describe('verifyVercelSignature', () => {
  it('accepts a valid HMAC-SHA1 signature', async () => {
    const body = JSON.stringify(previewPayload());
    expect(await verifyVercelSignature(body, sign(body), SECRET)).toBe(true);
  });
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(previewPayload());
    expect(await verifyVercelSignature(body + 'x', sign(body), SECRET)).toBe(false);
  });
  it('rejects a missing signature', async () => {
    expect(await verifyVercelSignature('body', null, SECRET)).toBe(false);
  });
});

describe('decideFromWebhook', () => {
  it('triggers on preview deployment.succeeded', () => {
    const d = decideFromWebhook(previewPayload());
    expect(d.trigger).toBe(true);
    expect(d.previewUrl).toBe('https://my-app-abc123.vercel.app');
    expect(d.git?.commitSha).toBe('abc123');
    expect(d.git?.repoOwner).toBe('acme');
    expect(d.git?.pullRequestId).toBe('42');
    expect(d.git?.repoSlug).toBe('web');
  });
  it('extracts the git branch from the commit ref', () => {
    const d = decideFromWebhook(
      previewPayload({ meta: { githubCommitRef: 'feature/x', githubCommitSha: 'abc123' } }),
    );
    expect(d.git?.branch).toBe('feature/x');
  });
  it('skips production deployments', () => {
    const d = decideFromWebhook(previewPayload({ target: 'production' }));
    expect(d.trigger).toBe(false);
    expect(d.reason).toMatch(/production/);
  });
  it('ignores unrelated event types', () => {
    const d = decideFromWebhook({ type: 'deployment.created', payload: {} });
    expect(d.trigger).toBe(false);
  });
  it('skips when no URL present', () => {
    const d = decideFromWebhook(previewPayload({ url: '' }));
    expect(d.trigger).toBe(false);
  });
  it('preserves https URLs as-is', () => {
    const d = decideFromWebhook(previewPayload({ url: 'https://already.vercel.app' }));
    expect(d.previewUrl).toBe('https://already.vercel.app');
  });
});

describe('buildGitHubLinkage', () => {
  it('maps webhook git metadata to the API github object', () => {
    const linkage = buildGitHubLinkage({
      commitSha: 'abc123',
      pullRequestId: '42',
      repoOwner: 'acme',
      repoSlug: 'web',
      branch: 'feature/x',
    });
    expect(linkage).toEqual({
      owner: 'acme',
      repo: 'web',
      prNumber: 42,
      commitSha: 'abc123',
      branch: 'feature/x',
    });
  });
  it('returns undefined when no git metadata is present', () => {
    expect(buildGitHubLinkage(undefined)).toBeUndefined();
    expect(buildGitHubLinkage({})).toBeUndefined();
  });
  it('omits prNumber when not numeric', () => {
    const linkage = buildGitHubLinkage({ pullRequestId: 'main', repoOwner: 'acme' });
    expect(linkage?.prNumber).toBeUndefined();
    expect(linkage?.owner).toBe('acme');
  });
});

describe('triggerRun', () => {
  it('POSTs to the cloud API and returns the run id', async () => {
    let captured: { url: string; body: string; auth: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = {
        url,
        body: init.body as string,
        auth: (init.headers as Record<string, string>).Authorization,
      };
      return new Response(JSON.stringify({ id: 'run_1', statusUrl: '/v1/runs/run_1' }), { status: 202 });
    }) as unknown as typeof fetch;

    const res = await triggerRun(
      { apiBaseUrl: 'https://api.frontguard.dev', apiKey: 'fg_x', previewUrl: 'https://p.vercel.app', routes: ['/', '/about'] },
      fakeFetch,
    );
    expect(res.id).toBe('run_1');
    expect(captured!.url).toBe('https://api.frontguard.dev/v1/run');
    expect(captured!.auth).toBe('Bearer fg_x');
    expect(JSON.parse(captured!.body).routes).toEqual([{ path: '/' }, { path: '/about' }]);
  });

  it('forwards git metadata as a github object in the run payload', async () => {
    let body: any = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: 'run_2', statusUrl: '/v1/runs/run_2' }), { status: 202 });
    }) as unknown as typeof fetch;

    await triggerRun(
      {
        apiBaseUrl: 'https://api.frontguard.dev',
        apiKey: 'fg_x',
        previewUrl: 'https://p.vercel.app',
        git: { commitSha: 'sha1', pullRequestId: '7', repoOwner: 'acme', repoSlug: 'web', branch: 'feat' },
      },
      fakeFetch,
    );
    expect(body.github).toEqual({
      owner: 'acme',
      repo: 'web',
      prNumber: 7,
      commitSha: 'sha1',
      branch: 'feat',
    });
  });

  it('omits the github object when no git metadata is provided', async () => {
    let body: any = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: 'run_3', statusUrl: '/v1/runs/run_3' }), { status: 202 });
    }) as unknown as typeof fetch;

    await triggerRun(
      { apiBaseUrl: 'https://api.frontguard.dev', apiKey: 'fg_x', previewUrl: 'https://p.vercel.app' },
      fakeFetch,
    );
    expect(body.github).toBeUndefined();
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    await expect(
      triggerRun({ apiBaseUrl: 'x', apiKey: 'k', previewUrl: 'u' }, fakeFetch),
    ).rejects.toThrow(/500/);
  });
});

describe('parseRoutesEnv', () => {
  it('parses a comma-separated list', () => {
    expect(parseRoutesEnv('/,/about, /pricing ')).toEqual(['/', '/about', '/pricing']);
  });
  it('returns undefined for empty/missing values', () => {
    expect(parseRoutesEnv(undefined)).toBeUndefined();
    expect(parseRoutesEnv('')).toBeUndefined();
    expect(parseRoutesEnv('  ,  ')).toBeUndefined();
  });
});

describe('webhook HTTP handler', () => {
  it('health check', async () => {
    const app = createVercelApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect((await res.json()).integration).toBe('vercel');
  });

  it('rejects an invalid signature', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    const res = await app.request('/api/webhook', {
      method: 'POST',
      body,
      headers: { 'x-vercel-signature': 'bad' },
    } , { VERCEL_CLIENT_SECRET: SECRET });
    expect(res.status).toBe(401);
  });

  it('returns triggered:false when API not configured but signature valid', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    const res = await app.request(
      '/api/webhook',
      { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
      { VERCEL_CLIENT_SECRET: SECRET },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.triggered).toBe(false);
    expect(json.reason).toMatch(/not configured/);
  });

  it('triggers a run when fully configured', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    // Secret configured + valid signature (fail-closed); stub global fetch.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'run_9', statusUrl: '/v1/runs/run_9' }), { status: 202 })) as typeof fetch;
    try {
      const res = await app.request(
        '/api/webhook',
        { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
        { VERCEL_CLIENT_SECRET: SECRET, FRONTGUARD_API_URL: 'https://api.frontguard.dev', FRONTGUARD_API_KEY: 'fg_x' },
      );
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.runId).toBe('run_9');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('forwards git metadata + configured routes to the cloud API end-to-end', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    let captured: any = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: 'run_10', statusUrl: '/v1/runs/run_10' }), { status: 202 });
    }) as typeof fetch;
    try {
      const res = await app.request(
        '/api/webhook',
        { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
        {
          VERCEL_CLIENT_SECRET: SECRET,
          FRONTGUARD_API_URL: 'https://api.frontguard.dev',
          FRONTGUARD_API_KEY: 'fg_x',
          FRONTGUARD_ROUTES: '/,/about',
        },
      );
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(captured.url).toBe('https://my-app-abc123.vercel.app');
      expect(captured.routes).toEqual([{ path: '/' }, { path: '/about' }]);
      expect(captured.github).toEqual({
        owner: 'acme',
        repo: 'web',
        prNumber: 42,
        commitSha: 'abc123',
        branch: undefined,
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // FIX V1: fail-closed signature verification.
  it('fails closed (500) when the webhook secret is not configured', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    const res = await app.request(
      '/api/webhook',
      { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
      {},
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/secret not configured/i);
  });

  it('accepts a valid signature when the secret is configured', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload());
    const res = await app.request(
      '/api/webhook',
      { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
      { VERCEL_CLIENT_SECRET: SECRET },
    );
    // Valid signature → proceeds; API not configured → triggered:false.
    expect(res.status).toBe(200);
    expect((await res.json()).triggered).toBe(false);
  });

  // SSRF: custom-domain previews are rejected when the project has not been
  // authorized via the install flow (no KV install record).
  it('rejects a custom-domain preview when project is NOT authorized', async () => {
    const app = createVercelApp();
    const body = JSON.stringify(previewPayload({ url: 'https://preview.acme.com' }));
    const res = await app.request(
      '/api/webhook',
      { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
      { VERCEL_CLIENT_SECRET: SECRET, FRONTGUARD_API_URL: 'https://api.frontguard.dev', FRONTGUARD_API_KEY: 'fg_x' },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not allowed/i);
  });

  // T10: accept custom-domain previews when the project is authorized
  // (KV has an integration record for the owning team).
  it('accepts a custom-domain preview when the project IS authorized via KV', async () => {
    const app = createVercelApp();
    const kv = memoryKV();
    // Simulate a prior install: integration + team records present.
    kv.store.set(
      'integration:icfg_acme',
      JSON.stringify({ accessToken: 'tok', teamId: 'team_acme', configurationId: 'icfg_acme', installedAt: 'x' }),
    );
    kv.store.set('team:team_acme', JSON.stringify({ configurationId: 'icfg_acme', installedAt: 'x' }));

    const payload: VercelWebhookPayload = {
      type: 'deployment.succeeded',
      payload: {
        deployment: {
          id: 'dpl_acme',
          url: 'preview-feature-x.acme.com',
          target: null,
          meta: { githubCommitSha: 'sha_acme', githubOrg: 'acme', githubRepo: 'web' },
        },
        project: { id: 'prj_acme' },
        team: { id: 'team_acme' },
      },
    };
    const body = JSON.stringify(payload);

    let captured: { url: string } | null = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: 'run_x', statusUrl: '/v1/runs/run_x' }), { status: 202 });
    }) as typeof fetch;
    try {
      const res = await app.request(
        '/api/webhook',
        { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
        {
          VERCEL_CLIENT_SECRET: SECRET,
          FRONTGUARD_API_URL: 'https://api.frontguard.dev',
          FRONTGUARD_API_KEY: 'fg_x',
          KV: kv,
        },
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.triggered).toBe(true);
      expect(json.runId).toBe('run_x');
      expect(captured!.url).toBe('https://preview-feature-x.acme.com');
      // Project was lazy-registered for future O(1) lookups.
      expect(kv.store.has('project:prj_acme')).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // SSRF: even with an authorized project, private/loopback hosts must be rejected.
  it('rejects a private/loopback host even when the project is authorized', async () => {
    const app = createVercelApp();
    const kv = memoryKV();
    kv.store.set('team:team_acme', JSON.stringify({ configurationId: 'icfg_x', installedAt: 'x' }));
    const payload: VercelWebhookPayload = {
      type: 'deployment.succeeded',
      payload: {
        deployment: { id: 'dpl_bad', url: 'http://169.254.169.254/latest/meta-data/', target: null },
        project: { id: 'prj_acme' },
        team: { id: 'team_acme' },
      },
    };
    const body = JSON.stringify(payload);
    const res = await app.request(
      '/api/webhook',
      { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
      { VERCEL_CLIENT_SECRET: SECRET, FRONTGUARD_API_URL: 'https://api.frontguard.dev', FRONTGUARD_API_KEY: 'fg_x', KV: kv },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not allowed/i);
  });

  // FIX V5: idempotency / duplicate-delivery protection via KV.
  it('short-circuits duplicate deliveries when an event id + KV are present', async () => {
    const app = createVercelApp();
    const kv = memoryKV();
    const payload = previewPayload();
    (payload as VercelWebhookPayload).id = 'evt_dup_1';
    const body = JSON.stringify(payload);
    const env = {
      VERCEL_CLIENT_SECRET: SECRET,
      FRONTGUARD_API_URL: 'https://api.frontguard.dev',
      FRONTGUARD_API_KEY: 'fg_x',
      KV: kv,
    };
    let calls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: 'run_d', statusUrl: '/v1/runs/run_d' }), { status: 202 });
    }) as typeof fetch;
    try {
      const first = await app.request(
        '/api/webhook',
        { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
        env,
      );
      expect((await first.json()).triggered).toBe(true);

      const second = await app.request(
        '/api/webhook',
        { method: 'POST', body, headers: { 'x-vercel-signature': sign(body) } },
        env,
      );
      const json = await second.json();
      expect(json.triggered).toBe(false);
      expect(json.reason).toMatch(/duplicate/i);
      // The Cloud API was only called once.
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
