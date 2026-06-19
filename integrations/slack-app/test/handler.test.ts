import { describe, it, expect } from 'vitest';
import { createSlackApp } from '../src/handler.js';
import type { KVNamespace } from '../src/storage.js';
import { signSlack } from './helpers.js';

const SECRET = 'shhh-signing-secret';
const env = { SLACK_SIGNING_SECRET: SECRET };

function signedHeaders(_body: string, ts: string, sig: string): Record<string, string> {
  return {
    'x-slack-request-timestamp': ts,
    'x-slack-signature': sig,
    'content-type': 'application/json',
  };
}

function memoryKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k)! : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      store.delete(k);
    },
  };
}

describe('createSlackApp', () => {
  const app = createSlackApp();

  it('serves a health check', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', integration: 'slack-app' });
  });

  it('echoes the url_verification challenge for a signed request', async () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'chal-xyz' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);
    const res = await app.request(
      '/slack/events',
      { method: 'POST', headers: signedHeaders(body, ts, sig), body },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('chal-xyz');
  });

  it('rejects an unsigned events request with 401', async () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'x' });
    const res = await app.request(
      '/slack/events',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('responds to a signed slash command with help text', async () => {
    const body = new URLSearchParams({
      command: '/frontguard',
      text: '',
      user_id: 'U1',
      channel_id: 'C1',
      team_id: 'T1',
      response_url: '',
    }).toString();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);
    const res = await app.request(
      '/slack/commands',
      {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': ts,
          'x-slack-signature': sig,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('/frontguard status');
  });

  it('returns 500 when the signing secret is unconfigured', async () => {
    const res = await app.request('/slack/events', { method: 'POST', body: '{}' }, {});
    expect(res.status).toBe(500);
  });
});

describe('/slack/commands — status subcommand', () => {
  const app = createSlackApp();

  async function postStatus(args: {
    url: string;
    apiUrl?: string;
    apiKey?: string;
    fetchSpy?: (input: string, init?: RequestInit) => Promise<Response>;
  }): Promise<Response> {
    const body = new URLSearchParams({
      command: '/frontguard',
      text: `status ${args.url}`,
      user_id: 'U1',
      channel_id: 'C1',
      team_id: 'T1',
      response_url: 'https://hooks.slack.com/r/X',
    }).toString();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);

    const orig = globalThis.fetch;
    if (args.fetchSpy) globalThis.fetch = args.fetchSpy as typeof fetch;
    try {
      return await app.request(
        '/slack/commands',
        {
          method: 'POST',
          headers: {
            'x-slack-request-timestamp': ts,
            'x-slack-signature': sig,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
        },
        {
          SLACK_SIGNING_SECRET: SECRET,
          FRONTGUARD_API_URL: args.apiUrl,
          FRONTGUARD_API_KEY: args.apiKey,
        },
      );
    } finally {
      globalThis.fetch = orig;
    }
  }

  it('warns when the cloud API is not configured', async () => {
    const res = await postStatus({ url: 'https://example.com' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('FRONTGUARD_API_URL');
  });

  it('submits a run to the cloud API and acks with the run id', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fakeFetch = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.endsWith('/v1/run')) {
        return new Response(
          JSON.stringify({ id: 'run_abc', status: 'queued', statusUrl: '/v1/runs/run_abc' }),
          { status: 202 },
        );
      }
      // Background poll + delayed response — return whatever; the handler does not block on it.
      if (url.includes('/v1/runs/')) {
        return new Response(JSON.stringify({ id: 'run_abc', status: 'completed', results: [] }), {
          status: 200,
        });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await postStatus({
      url: 'https://example.com',
      apiUrl: 'https://api.frontguard.dev',
      apiKey: 'fg_x',
      fetchSpy: fakeFetch as unknown as typeof fetch & ((...a: unknown[]) => unknown),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('run_abc');
    expect(json.text).toContain('https://example.com');
    // The Cloud API was called with the bearer token + url.
    const submit = calls.find((c) => c.url.endsWith('/v1/run'));
    expect(submit).toBeTruthy();
    expect(JSON.parse(submit!.body!)).toEqual({ url: 'https://example.com' });
  });

  it('reports a cloud-api failure back to the user', async () => {
    const fakeFetch = (async (input: string) => {
      const url = String(input);
      if (url.endsWith('/v1/run')) return new Response('limit', { status: 402 });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const res = await postStatus({
      url: 'https://example.com',
      apiUrl: 'https://api.frontguard.dev',
      apiKey: 'fg_x',
      fetchSpy: fakeFetch as unknown as typeof fetch & ((...a: unknown[]) => unknown),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('Could not submit');
    expect(json.text).toContain('402');
  });
});

describe('/slack/oauth/callback — install persistence', () => {
  const app = createSlackApp();

  function envWith(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      SLACK_CLIENT_ID: 'cid',
      SLACK_CLIENT_SECRET: 'csecret',
      SLACK_REDIRECT_URI: 'https://slack.frontguard.dev/slack/oauth/callback',
      ...extra,
    };
  }

  async function startSlackOAuth(): Promise<{ state: string; cookie: string }> {
    const res = await app.request('/slack/oauth/callback', {}, envWith({}));
    const loc = res.headers.get('location')!;
    const state = new URL(loc).searchParams.get('state')!;
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/fg_slack_oauth_state=([^;]+)/);
    return { state, cookie: `fg_slack_oauth_state=${match ? match[1] : state}` };
  }

  it('redirects to Slack authorize with a CSRF state cookie when no code is present', async () => {
    const res = await app.request('/slack/oauth/callback', {}, envWith({}));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('https://slack.com/oauth/v2/authorize');
    expect(loc).toMatch(/state=/);
    expect(res.headers.get('set-cookie')).toMatch(/fg_slack_oauth_state=/);
  });

  it('returns 500 when OAuth env is not configured', async () => {
    const res = await app.request('/slack/oauth/callback', {}, {});
    expect(res.status).toBe(500);
  });

  it('rejects the callback when OAuth state is missing or mismatched', async () => {
    const res = await app.request('/slack/oauth/callback?code=abc&state=forged', {}, envWith({}));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Invalid OAuth state/);
  });

  it('persists the install to KV keyed by team id', async () => {
    const kv = memoryKV();
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          access_token: 'xoxb-secret',
          scope: 'chat:write,commands',
          bot_user_id: 'B1',
          team: { id: 'T01', name: 'Acme' },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const { state, cookie } = await startSlackOAuth();
      const res = await app.request(
        `/slack/oauth/callback?code=abc&state=${state}`,
        { headers: { Cookie: cookie } },
        envWith({ SLACK_TEAMS: kv }),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { team: string; persisted: boolean };
      expect(json.team).toBe('T01');
      expect(json.persisted).toBe(true);

      const stored = JSON.parse(kv.store.get('team:T01')!);
      expect(stored.accessToken).toBe('xoxb-secret');
      expect(stored.teamName).toBe('Acme');
      expect(stored.botUserId).toBe('B1');
      expect(stored.scope).toBe('chat:write,commands');
      expect(typeof stored.installedAt).toBe('string');

      // The token must NEVER leak through the response.
      expect(JSON.stringify(json)).not.toContain('xoxb-secret');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('handles install fine without a KV binding (persistence no-ops)', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ ok: true, access_token: 'xoxb-1', team: { id: 'T02' } }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const { state, cookie } = await startSlackOAuth();
      const res = await app.request(
        `/slack/oauth/callback?code=abc&state=${state}`,
        { headers: { Cookie: cookie } },
        envWith({}),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { team: string; persisted: boolean };
      expect(json.team).toBe('T02');
      expect(json.persisted).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('returns 400 when Slack rejects the OAuth exchange', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), { status: 200 })) as typeof fetch;
    try {
      const { state, cookie } = await startSlackOAuth();
      const res = await app.request(
        `/slack/oauth/callback?code=bad&state=${state}`,
        { headers: { Cookie: cookie } },
        envWith({}),
      );
      expect(res.status).toBe(400);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
