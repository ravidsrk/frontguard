import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl,
  parseInstallCallback,
  exchangeCodeForToken,
  safeNextRedirect,
  type VercelOAuthConfig,
} from '../src/install.js';
import { createVercelApp, type KVNamespace } from '../src/handler.js';

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

const CONFIG: VercelOAuthConfig = {
  clientId: 'oac_test',
  clientSecret: 'sec_test',
  redirectUri: 'https://fg.example.com/api/install',
};

describe('buildAuthorizeUrl', () => {
  it('builds a Vercel authorize URL with client_id and redirect_uri', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG));
    expect(url.origin + url.pathname).toBe('https://vercel.com/integrations/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('oac_test');
    expect(url.searchParams.get('redirect_uri')).toBe('https://fg.example.com/api/install');
  });
  it('includes state when provided', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, 'xyz'));
    expect(url.searchParams.get('state')).toBe('xyz');
  });
});

describe('parseInstallCallback', () => {
  it('parses the code and optional params', () => {
    const cb = parseInstallCallback({
      code: 'abc',
      configurationId: 'icfg_1',
      teamId: 'team_1',
      next: 'https://vercel.com/dashboard',
    });
    expect(cb.code).toBe('abc');
    expect(cb.configurationId).toBe('icfg_1');
    expect(cb.teamId).toBe('team_1');
    expect(cb.next).toBe('https://vercel.com/dashboard');
  });
  it('throws when code is missing', () => {
    expect(() => parseInstallCallback({})).toThrow(/Missing OAuth code/);
  });
});

describe('safeNextRedirect', () => {
  it('allows same-origin relative paths', () => {
    expect(safeNextRedirect('/dashboard')).toBe('/dashboard');
    expect(safeNextRedirect('/a/b?x=1')).toBe('/a/b?x=1');
  });
  it('allows allowlisted vercel.com hosts', () => {
    expect(safeNextRedirect('https://vercel.com/dashboard')).toBe('https://vercel.com/dashboard');
    expect(safeNextRedirect('https://app.vercel.com/x')).toBe('https://app.vercel.com/x');
  });
  it('rejects protocol-relative, backslash, and ASCII control-char redirect tricks', () => {
    expect(safeNextRedirect('//evil.com')).toBe('/');
    expect(safeNextRedirect('/\\evil.com')).toBe('/');
    expect(safeNextRedirect('/\t/evil.example')).toBe('/');
    expect(safeNextRedirect('/%09/evil.example')).toBe('/');
    expect(safeNextRedirect('/\n/evil.example')).toBe('/');
    expect(safeNextRedirect('/%0a/evil.example')).toBe('/');
    expect(safeNextRedirect('/%5cevil.example')).toBe('/');
    expect(safeNextRedirect('https://vercel.com@evil.example/')).toBe('/');
  });
  it('rejects off-allowlist absolute URLs and non-https', () => {
    expect(safeNextRedirect('https://evil.com')).toBe('/');
    expect(safeNextRedirect('https://vercel.com.evil.com')).toBe('/');
    expect(safeNextRedirect('http://vercel.com')).toBe('/');
    expect(safeNextRedirect('javascript:alert(1)')).toBe('/');
  });
  it('uses the fallback for empty input', () => {
    expect(safeNextRedirect(undefined)).toBe('/');
    expect(safeNextRedirect('', '/home')).toBe('/home');
  });
});

describe('exchangeCodeForToken', () => {
  it('exchanges a code for an access token (success)', async () => {
    let captured: { url: string; body: string; contentType: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = {
        url,
        body: init.body as string,
        contentType: (init.headers as Record<string, string>)['Content-Type'],
      };
      return new Response(
        JSON.stringify({ access_token: 'tok_123', installation_id: 'icfg_1', user_id: 'user_1', team_id: 'team_1' }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await exchangeCodeForToken(CONFIG, 'code_abc', fakeFetch);
    expect(result.accessToken).toBe('tok_123');
    expect(result.installationType).toBe('team');
    expect(result.userId).toBe('user_1');
    expect(result.teamId).toBe('team_1');
    expect(result.installationId).toBe('icfg_1');
    expect(captured!.url).toBe('https://api.vercel.com/v2/oauth/access_token');
    expect(captured!.contentType).toBe('application/x-www-form-urlencoded');
    // Form-encoded body carries the credentials and code.
    const params = new URLSearchParams(captured!.body);
    expect(params.get('client_id')).toBe('oac_test');
    expect(params.get('client_secret')).toBe('sec_test');
    expect(params.get('code')).toBe('code_abc');
    expect(params.get('redirect_uri')).toBe('https://fg.example.com/api/install');
  });

  it('marks installationType "user" when no team_id', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ access_token: 'tok_u', user_id: 'user_2' }), { status: 200 })) as unknown as typeof fetch;
    const result = await exchangeCodeForToken(CONFIG, 'c', fakeFetch);
    expect(result.installationType).toBe('user');
    expect(result.teamId).toBeUndefined();
  });

  it('throws on a non-ok HTTP status', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCodeForToken(CONFIG, 'c', fakeFetch)).rejects.toThrow(/400/);
  });

  it('throws when the response carries an error', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCodeForToken(CONFIG, 'c', fakeFetch)).rejects.toThrow(/invalid_grant/);
  });

  it('throws when no access_token is returned', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCodeForToken(CONFIG, 'c', fakeFetch)).rejects.toThrow(/no access_token/);
  });
});

describe('install HTTP handler', () => {
  const OAUTH_ENV = {
    VERCEL_CLIENT_ID: 'oac_test',
    VERCEL_CLIENT_SECRET: 'sec_test',
    VERCEL_REDIRECT_URI: 'https://fg.example.com/api/install',
  };

  async function startVercelOAuth(
    app: ReturnType<typeof createVercelApp>,
    extraEnv: Record<string, unknown> = {},
  ): Promise<{ state: string; cookie: string; setCookie: string; location: string }> {
    const res = await app.request('/api/install', {}, { ...OAUTH_ENV, ...extraEnv });
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    const state = new URL(location).searchParams.get('state')!;
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/fg_vercel_oauth_state=([^;]+)/);
    return {
      state,
      cookie: `fg_vercel_oauth_state=${match ? match[1] : state}`,
      setCookie,
      location,
    };
  }

  it('redirects to Vercel authorize URL with CSRF state cookie when no code present', async () => {
    const app = createVercelApp();
    const { location, setCookie, state } = await startVercelOAuth(app);
    expect(location).toContain('https://vercel.com/integrations/oauth/authorize');
    expect(location).toContain('client_id=oac_test');
    expect(state).toBeTruthy();
    expect(setCookie).toMatch(/fg_vercel_oauth_state=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it('returns 500 when OAuth env or VERCEL_REDIRECT_URI is not configured', async () => {
    const app = createVercelApp();
    const res = await app.request('/api/install', {}, {});
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not configured/);

    const missingRedirect = await app.request(
      '/api/install',
      {},
      { VERCEL_CLIENT_ID: 'oac_test', VERCEL_CLIENT_SECRET: 'sec_test' },
    );
    expect(missingRedirect.status).toBe(500);
  });

  it('returns 400 cleanly when Vercel sends an OAuth ?error= param (no redirect loop)', async () => {
    const app = createVercelApp();
    const res = await app.request('/api/install?error=access_denied', {}, OAUTH_ENV);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.installed).toBe(false);
    expect(json.error).toContain('access_denied');
  });

  it('rejects callback with missing or mismatched OAuth state (403)', async () => {
    const app = createVercelApp();
    const noState = await app.request('/api/install?code=code_abc', {}, OAUTH_ENV);
    expect(noState.status).toBe(403);

    const wrongState = await app.request(
      '/api/install?code=code_abc&state=forged',
      { headers: { Cookie: 'fg_vercel_oauth_state=expected' } },
      OAUTH_ENV,
    );
    expect(wrongState.status).toBe(403);
  });

  it('exchanges the code and reports installed (no next URL)', async () => {
    const app = createVercelApp();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ access_token: 'tok_123', installation_id: 'icfg_9', team_id: 'team_9' }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const { state, cookie } = await startVercelOAuth(app);
      const res = await app.request(
        `/api/install?code=code_abc&state=${state}&configurationId=icfg_9`,
        { headers: { Cookie: cookie } },
        OAUTH_ENV,
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.installed).toBe(true);
      expect(json.installationType).toBe('team');
      expect(json.configurationId).toBe('icfg_9');
      // The access token must never be leaked in the response.
      expect(JSON.stringify(json)).not.toContain('tok_123');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('redirects to the next URL after a successful exchange', async () => {
    const app = createVercelApp();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: 'tok_123', user_id: 'u1' }), { status: 200 })) as typeof fetch;
    try {
      const { state, cookie } = await startVercelOAuth(app);
      const res = await app.request(
        `/api/install?code=code_abc&state=${state}&next=${encodeURIComponent('https://vercel.com/dashboard')}`,
        { headers: { Cookie: cookie } },
        OAUTH_ENV,
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://vercel.com/dashboard');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('returns 502 when the token exchange fails', async () => {
    const app = createVercelApp();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('bad', { status: 400 })) as typeof fetch;
    try {
      const { state, cookie } = await startVercelOAuth(app);
      const res = await app.request(
        `/api/install?code=bad_code&state=${state}`,
        { headers: { Cookie: cookie } },
        OAUTH_ENV,
      );
      expect(res.status).toBe(502);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // FIX V2: open-redirect rejection — an off-allowlist or control-char `next` falls back to '/'.
  it('falls back to "/" for open-redirect and ASCII-tab next URLs', async () => {
    const app = createVercelApp();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: 'tok_123', user_id: 'u1' }), { status: 200 })) as typeof fetch;
    try {
      for (const badNext of ['https://evil.com/phish', '/\t/evil.example', '/%09/evil.example']) {
        const { state, cookie } = await startVercelOAuth(app);
        const res = await app.request(
          `/api/install?code=code_abc&state=${state}&next=${encodeURIComponent(badNext)}`,
          { headers: { Cookie: cookie } },
          OAUTH_ENV,
        );
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // FIX V3 + #414: persists to KV strictly under Vercel token response installation_id,
  // ignoring untrusted query-string configurationId so one tenant cannot overwrite another.
  it('derives configurationId strictly from token exchange response (ignores spoofed query param)', async () => {
    const app = createVercelApp();
    const kv = memoryKV();
    kv.store.set(
      'integration:icfg_victim',
      JSON.stringify({ accessToken: 'tok_victim', configurationId: 'icfg_victim', installedAt: 'orig' }),
    );
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ access_token: 'tok_secret', installation_id: 'icfg_9', team_id: 'team_9' }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const { state, cookie } = await startVercelOAuth(app, { KV: kv });
      const res = await app.request(
        `/api/install?code=code_abc&state=${state}&configurationId=icfg_victim`,
        { headers: { Cookie: cookie } },
        { ...OAUTH_ENV, KV: kv },
      );
      expect(res.status).toBe(200);
      // Victim record untouched!
      expect(JSON.parse(kv.store.get('integration:icfg_victim')!).accessToken).toBe('tok_victim');
      // Authoritative installation_id written instead!
      const stored = kv.store.get('integration:icfg_9');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.accessToken).toBe('tok_secret');
      expect(parsed.teamId).toBe('team_9');
      expect(parsed.configurationId).toBe('icfg_9');
      expect(typeof parsed.installedAt).toBe('string');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('installs fine without a KV binding (persistence no-ops)', async () => {
    const app = createVercelApp();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: 'tok_123', installation_id: 'icfg_1' }), { status: 200 })) as typeof fetch;
    try {
      const { state, cookie } = await startVercelOAuth(app);
      const res = await app.request(
        `/api/install?code=code_abc&state=${state}`,
        { headers: { Cookie: cookie } },
        OAUTH_ENV,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).installed).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
