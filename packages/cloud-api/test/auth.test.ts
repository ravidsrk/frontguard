import { describe, it, expect } from 'vitest';
import { generateApiKey, hashKey, isApiKeyFormat, KEY_PREFIX } from '../src/auth/keys.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
} from '../src/auth/github.js';
import { splitStatements } from '../src/db/migrate.js';

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

describe('migration splitter', () => {
  it('splits schema into statements and strips comments', () => {
    const sql = `-- comment\nCREATE TABLE a (id TEXT);\n-- another\nCREATE TABLE b (id TEXT);`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE a');
    expect(stmts.every((s) => !s.includes('--'))).toBe(true);
  });
});
