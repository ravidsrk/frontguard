import { describe, it, expect, afterEach } from 'vitest';
import { generateApiKey, hashKey, isApiKeyFormat, KEY_PREFIX } from '../src/auth/keys.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
} from '../src/auth/github.js';
import { splitStatements } from '../src/db/migrate.js';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';

describe('API keys', () => {
  it('generates keys with the fg_ prefix and valid format', () => {
    const key = generateApiKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(isApiKeyFormat(key)).toBe(true);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });

  it('hashes keys deterministically with SHA-256 hex', async () => {
    const key = generateApiKey();
    const h1 = await hashKey(key);
    const h2 = await hashKey(key);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashKey('different')).not.toBe(h1);
  });

  it('rejects malformed keys', () => {
    expect(isApiKeyFormat('sk_abc')).toBe(false);
    expect(isApiKeyFormat('fg_short')).toBe(false);
  });
});

describe('GitHub OAuth', () => {
  const config = {
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'https://api.frontguard.dev/auth/github/callback',
  };

  it('builds an authorize URL with required params', () => {
    const url = buildAuthorizeUrl(config, 'state123');
    expect(url).toContain('https://github.com/login/oauth/authorize?');
    expect(url).toContain('client_id=cid');
    expect(url).toContain('state=state123');
    expect(url).toContain('scope=read%3Auser');
  });

  it('exchanges a code for a token', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ access_token: 'tok_abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const token = await exchangeCodeForToken(config, 'code123', fakeFetch);
    expect(token).toBe('tok_abc');
  });

  it('throws when token exchange returns an error', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'bad_verification_code' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    await expect(exchangeCodeForToken(config, 'bad', fakeFetch)).rejects.toThrow(/bad_verification_code/);
  });

  it('fetches the GitHub user and falls back to emails endpoint', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 42, login: 'octocat', email: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify([{ email: 'octo@github.com', primary: true, verified: true }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const user = await fetchGitHubUser('tok', fakeFetch);
    expect(user.id).toBe(42);
    expect(user.login).toBe('octocat');
    expect(user.email).toBe('octo@github.com');
    expect(calls.some((u) => u.endsWith('/user/emails'))).toBe(true);
  });
});

describe('/auth/github routes', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetMemoryStore();
  });

  const oauthEnv = {
    GITHUB_CLIENT_ID: 'cid',
    GITHUB_CLIENT_SECRET: 'secret',
    API_BASE_URL: 'https://api.frontguard.dev',
  };

  /**
   * Performs the CSRF state handshake: hits GET /auth/github to obtain the
   * state value + cookie, then returns the query suffix and Cookie header to
   * use on the callback so the state check passes.
   */
  async function startOAuth(): Promise<{ state: string; cookie: string }> {
    const res = await app.request('/auth/github', {}, oauthEnv);
    const loc = res.headers.get('location')!;
    const state = new URL(loc).searchParams.get('state')!;
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/fg_oauth_state=([^;]+)/);
    return { state, cookie: `fg_oauth_state=${match ? match[1] : state}` };
  }

  it('GET /auth/github returns 501 when OAuth is not configured', async () => {
    const res = await app.request('/auth/github');
    expect(res.status).toBe(501);
    expect((await res.json()).error).toMatch(/not configured/);
  });

  it('GET /auth/github redirects to GitHub authorize with state', async () => {
    const res = await app.request('/auth/github', {}, oauthEnv);
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('github.com/login/oauth/authorize');
    expect(loc).toContain('client_id=cid');
    expect(loc).toMatch(/state=/);
  });

  it('GET /auth/github/callback 501 when not configured', async () => {
    const res = await app.request('/auth/github/callback?code=x');
    expect(res.status).toBe(501);
  });

  it('GET /auth/github/callback 400 when code is missing', async () => {
    const res = await app.request('/auth/github/callback', {}, oauthEnv);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing code/);
  });

  it('GET /auth/github/callback 403 when state is missing/mismatched', async () => {
    const res = await app.request('/auth/github/callback?code=x&state=forged', {}, oauthEnv);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Invalid OAuth state/);
  });

  it('GET /auth/github/callback 502 when token exchange fails', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const { state, cookie } = await startOAuth();
    const res = await app.request(
      `/auth/github/callback?code=bad&state=${state}`,
      { headers: { Cookie: cookie } },
      oauthEnv,
    );
    expect(res.status).toBe(502);
  });

  it('GET /auth/github/callback creates a new user and mints a key', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_tok' }), { status: 200 });
      }
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 42, login: 'octocat', email: 'octo@x.com' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }) as typeof fetch;

    const { state, cookie } = await startOAuth();
    const res = await app.request(
      `/auth/github/callback?code=good&state=${state}`,
      { headers: { Cookie: cookie } },
      oauthEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.login).toBe('octocat');
    expect(body.apiKey).toMatch(/^fg_/);
    expect(body.mode).toBe('dev');
    expect(body.note).toMatch(/not be shown again/);
  });

  it('GET /auth/github/callback sets a session cookie and redirects when redirect=/dashboard', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_tok' }), { status: 200 });
      }
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 99, login: 'dashuser', email: 'd@x.com' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }) as typeof fetch;

    const { state, cookie } = await startOAuth();
    const res = await app.request(
      `/auth/github/callback?code=good&redirect=/dashboard&state=${state}`,
      { headers: { Cookie: cookie } },
      oauthEnv,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dashboard');
    expect(res.headers.get('set-cookie')).toMatch(/fg_session=/);
  });

  it('GET /auth/github/callback reuses an existing user by githubId', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      }
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 7, login: 'reuse', email: null }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }) as typeof fetch;
    globalThis.fetch = fetchImpl;

    const h1 = await startOAuth();
    const first = await (
      await app.request(`/auth/github/callback?code=a&state=${h1.state}`, { headers: { Cookie: h1.cookie } }, oauthEnv)
    ).json();
    const h2 = await startOAuth();
    const second = await (
      await app.request(`/auth/github/callback?code=b&state=${h2.state}`, { headers: { Cookie: h2.cookie } }, oauthEnv)
    ).json();
    // Same underlying user id across logins.
    expect(first.user.id).toBe(second.user.id);
    // SEC-3: repeat JSON logins do not mint additional keys.
    expect(first.apiKey).toMatch(/^fg_/);
    expect(second.apiKey).toBeUndefined();
    const store = getMemoryStore();
    const user = await store.getUserByGithubId('7');
    expect((await store.listApiKeys(user!.id)).length).toBe(1);
  });

  // SEC-3: dashboard OAuth login must not create orphaned api_keys rows.
  it('GET /auth/github/callback dashboard logins do not create api_keys rows', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_tok' }), { status: 200 });
      }
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ id: 55, login: 'dashrepeat', email: 'd@x.com' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }) as typeof fetch;

    const store = getMemoryStore();
    const countKeys = async () => {
      const user = await store.getUserByGithubId('55');
      return user ? (await store.listApiKeys(user.id)).length : 0;
    };

    const h1 = await startOAuth();
    const first = await app.request(
      `/auth/github/callback?code=one&redirect=/dashboard&state=${h1.state}`,
      { headers: { Cookie: h1.cookie } },
      oauthEnv,
    );
    expect(first.status).toBe(302);
    expect(await countKeys()).toBe(0);

    const h2 = await startOAuth();
    const second = await app.request(
      `/auth/github/callback?code=two&redirect=/dashboard&state=${h2.state}`,
      { headers: { Cookie: h2.cookie } },
      oauthEnv,
    );
    expect(second.status).toBe(302);
    expect(await countKeys()).toBe(0);
  });
});

describe('migration splitter', () => {
  it('splits schema into statements and strips comments', () => {
    const sql = `-- comment\nCREATE TABLE a (id TEXT);\n-- another\nCREATE TABLE b (id TEXT);`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE a');
    expect(stmts.every((s) => !s.includes('--'))).toBe(true);
  });
});
