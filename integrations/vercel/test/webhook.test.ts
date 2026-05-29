import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyVercelSignature,
  timingSafeEqual,
  decideFromWebhook,
  triggerRun,
  type VercelWebhookPayload,
} from '../src/webhook.js';
import { createVercelApp } from '../src/handler.js';

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

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    await expect(
      triggerRun({ apiBaseUrl: 'x', apiKey: 'k', previewUrl: 'u' }, fakeFetch),
    ).rejects.toThrow(/500/);
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
    // No secret configured → signature check skipped; stub global fetch.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'run_9', statusUrl: '/v1/runs/run_9' }), { status: 202 })) as typeof fetch;
    try {
      const res = await app.request(
        '/api/webhook',
        { method: 'POST', body },
        { FRONTGUARD_API_URL: 'https://api.frontguard.dev', FRONTGUARD_API_KEY: 'fg_x' },
      );
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.runId).toBe('run_9');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
