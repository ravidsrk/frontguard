import { describe, it, expect, beforeEach } from 'vitest';
import { createSlackApp, clearEventDedupCache } from '../src/handler.js';
import type { KVNamespace } from '../src/storage.js';
import { signSlack, stubPublicDnsFetch } from './helpers.js';

beforeEach(() => clearEventDedupCache());

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

  it('rejects metadata/private URLs before any cloud-api fetch (SSRF)', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (input: string) => {
      calls.push(String(input));
      return new Response('unexpected', { status: 500 });
    }) as unknown as typeof fetch;

    const res = await postStatus({
      url: 'https://169.254.169.254/',
      apiUrl: 'https://api.frontguard.dev',
      apiKey: 'fg_x',
      fetchSpy: fakeFetch as unknown as typeof fetch & ((...a: unknown[]) => unknown),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('private');
    expect(calls.some((u) => u.endsWith('/v1/run'))).toBe(false);
  });

  it('submits a run to the cloud API and acks with the run id', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fakeFetch = stubPublicDnsFetch(async (input: string, init?: RequestInit) => {
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
    });

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
    const fakeFetch = stubPublicDnsFetch(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/v1/run')) return new Response('limit', { status: 402 });
      return new Response('ok', { status: 200 });
    });

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

  it('uses the workspace token stored in SLACK_TEAMS KV when handling app_mention events', async () => {
    const kv = memoryKV();
    await kv.put(
      'team:T_MULTI',
      JSON.stringify({
        teamId: 'T_MULTI',
        teamName: 'MultiTeam',
        accessToken: 'xoxb-multi-workspace-token',
        installedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    const orig = globalThis.fetch;
    let slackAuthHeader: string | undefined;
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      if (String(input).includes('slack.com/api/chat.postMessage')) {
        slackAuthHeader = (init?.headers as Record<string, string>)?.Authorization;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('ok', { status: 200 });
    }) as typeof fetch;
    try {
      const body = JSON.stringify({
        type: 'event_callback',
        team_id: 'T_MULTI',
        event: { type: 'app_mention', channel: 'C_MULTI', text: '<@U1> help' },
      });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = await signSlack(body, ts, SECRET);
      const res = await app.request(
        '/slack/events',
        { method: 'POST', headers: signedHeaders(body, ts, sig), body },
        { SLACK_SIGNING_SECRET: SECRET, SLACK_TEAMS: kv },
      );
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 10));
      expect(slackAuthHeader).toBe('Bearer xoxb-multi-workspace-token');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('handles ?error=access_denied cleanly with HTTP 400 (no OAuth redirect loop)', async () => {
    const res = await app.request('/slack/oauth/callback?error=access_denied', {}, envWith({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain('access_denied');
  });

  it('deletes KV bot token on app_uninstalled and tokens_revoked events', async () => {
    const kv = memoryKV();
    await kv.put(
      'team:T_REVOKE',
      JSON.stringify({
        teamId: 'T_REVOKE',
        accessToken: 'xoxb-revoked',
        installedAt: '2026-06-15T00:00:00.000Z',
      }),
    );

    const body = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev_uninst_1',
      team_id: 'T_REVOKE',
      event: { type: 'app_uninstalled' },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);
    const res = await app.request(
      '/slack/events',
      { method: 'POST', headers: signedHeaders(body, ts, sig), body },
      { SLACK_SIGNING_SECRET: SECRET, SLACK_TEAMS: kv },
    );
    expect(res.status).toBe(200);
    expect(kv.store.has('team:T_REVOKE')).toBe(false);

    // Re-insert and verify tokens_revoked also purges KV.
    await kv.put(
      'team:T_REVOKE',
      JSON.stringify({
        teamId: 'T_REVOKE',
        accessToken: 'xoxb-revoked-2',
        installedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    const revokeBody = JSON.stringify({
      type: 'event_callback',
      event_id: 'Ev_revoke_1',
      team_id: 'T_REVOKE',
      event: { type: 'tokens_revoked' },
    });
    const revokeSig = await signSlack(revokeBody, ts, SECRET);
    const revokeRes = await app.request(
      '/slack/events',
      { method: 'POST', headers: signedHeaders(revokeBody, ts, revokeSig), body: revokeBody },
      { SLACK_SIGNING_SECRET: SECRET, SLACK_TEAMS: kv },
    );
    expect(revokeRes.status).toBe(200);
    expect(kv.store.has('team:T_REVOKE')).toBe(false);
  });

  it('deduplicates Slack retries and repeated event_ids', async () => {
    const kv = memoryKV();
    await kv.put(
      'team:T_DEDUP',
      JSON.stringify({
        teamId: 'T_DEDUP',
        accessToken: 'xoxb-dedup',
        installedAt: '2026-06-15T00:00:00.000Z',
      }),
    );
    let postCount = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      postCount += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    try {
      const body = JSON.stringify({
        type: 'event_callback',
        event_id: 'Ev_dup_99',
        team_id: 'T_DEDUP',
        event: { type: 'app_mention', channel: 'C1', text: 'hi' },
      });
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = await signSlack(body, ts, SECRET);
      const first = await app.request(
        '/slack/events',
        { method: 'POST', headers: signedHeaders(body, ts, sig), body },
        { SLACK_SIGNING_SECRET: SECRET, SLACK_TEAMS: kv },
      );
      expect(first.status).toBe(200);

      const second = await app.request(
        '/slack/events',
        {
          method: 'POST',
          headers: { ...signedHeaders(body, ts, sig), 'x-slack-retry-num': '1' },
          body,
        },
        { SLACK_SIGNING_SECRET: SECRET, SLACK_TEAMS: kv },
      );
      expect(second.status).toBe(200);
      expect((await second.json()).deduplicated).toBe(true);
      await new Promise((r) => setTimeout(r, 10));
      expect(postCount).toBe(1);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('rejects slash commands from uninstalled teams when SLACK_TEAMS KV is bound', async () => {
    const kv = memoryKV();
    const body = new URLSearchParams({
      command: '/frontguard',
      text: 'status https://example.com',
      user_id: 'U1',
      channel_id: 'C1',
      team_id: 'T_UNINSTALLED',
      response_url: 'https://hooks.slack.com/r/X',
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
      {
        SLACK_SIGNING_SECRET: SECRET,
        SLACK_TEAMS: kv,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).text).toMatch(/not installed/i);
  });

  it('rejects oversized Slack webhook payloads with 413', async () => {
    const huge = 'x'.repeat(1_048_577);
    const res = await app.request(
      '/slack/events',
      { method: 'POST', body: huge },
      { SLACK_SIGNING_SECRET: SECRET },
    );
    expect(res.status).toBe(413);
  });
});
