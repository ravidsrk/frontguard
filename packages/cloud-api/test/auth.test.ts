import { describe, it, expect, afterEach } from 'vitest';
import { generateApiKey, hashKey, isApiKeyFormat, KEY_PREFIX } from '../src/auth/keys.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
} from '../src/auth/github.js';
import { splitStatements } from '../src/db/migrate.js';
import { app } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';

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

  it('GET /auth/github/callback 502 when token exchange fails', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const res = await app.request('/auth/github/callback?code=bad', {}, oauthEnv);
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

    const res = await app.request('/auth/github/callback?code=good', {}, oauthEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.login).toBe('octocat');
    expect(body.apiKey).toMatch(/^fg_/);
    expect(body.mode).toBe('dev');
    expect(body.note).toMatch(/not be shown again/);
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

    const first = await (await app.request('/auth/github/callback?code=a', {}, oauthEnv)).json();
    const second = await (await app.request('/auth/github/callback?code=b', {}, oauthEnv)).json();
    // Same underlying user id across logins.
    expect(first.user.id).toBe(second.user.id);
    // But a fresh key is minted each time.
    expect(first.apiKey).not.toBe(second.apiKey);
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
