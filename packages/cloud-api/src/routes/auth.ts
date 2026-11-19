/**
 * GitHub OAuth routes (Task 5.3).
 *
 * - `GET /auth/github`          → redirects to GitHub's authorize page.
 * - `GET /auth/github/callback` → exchanges the code, upserts the user, mints
 *   an initial API key, and returns it (shown once).
 *
 * These routes are mounted before the `/v1/*` auth guard so a brand-new user
 * can bootstrap their first key.
 *
 * @module routes/auth
 */

import { Hono } from 'hono';
import type { Bindings } from '../db/factory.js';
import { getStore, isProduction } from '../db/factory.js';
import type { Store } from '../db/store.js';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  type GitHubOAuthConfig,
} from '../auth/github.js';
import { generateApiKey, hashKey } from '../auth/keys.js';
import {
  createSessionCookie,
  CSRF_FIELD,
  CSRF_HEADER,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionSecret,
  verifyCsrfToken,
  verifySessionCookie,
} from '../auth/session.js';
import { clientIpFromHeaders, enforceRateLimit } from '../rate-limit.js';

type Variables = { store: Store };

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Rate limit auth endpoints per client IP to throttle OAuth / logout abuse.
authRoutes.use('*', async (c, next) => {
  const ip = clientIpFromHeaders((name) => c.req.header(name));
  const blocked = enforceRateLimit(c, `auth:${ip}`);
  if (blocked) return blocked;
  await next();
});

/** Validates that a post-login redirect target stays strictly under `/dashboard`. */
function isSafeDashboardRedirect(value: string | undefined): value is string {
  if (!value) return false;
  if (value !== '/dashboard' && !value.startsWith('/dashboard/')) return false;
  if (value.startsWith('//') || value.includes('\\') || /[\r\n\x00-\x1f]/.test(value)) return false;
  return true;
}

/** Resolves OAuth config from env, or null if not configured. */
function oauthConfig(env: Bindings | undefined): GitHubOAuthConfig | null {
  if (!env?.GITHUB_CLIENT_ID || !env?.GITHUB_CLIENT_SECRET) return null;
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: `${env.API_BASE_URL ?? ''}/auth/github/callback`,
  };
}

/** Short-lived cookie that remembers a post-login redirect target. */
const REDIRECT_COOKIE = 'fg_oauth_redirect';
/** Short-lived cookie holding the OAuth `state` for CSRF verification. */
const STATE_COOKIE = 'fg_oauth_state';

// GET /auth/github — kick off the OAuth flow.
authRoutes.get('/github', (c) => {
  const config = oauthConfig(c.env);
  if (!config) return c.json({ error: 'GitHub OAuth is not configured' }, 501);
  // A random state mitigates CSRF. We persist it in an httpOnly cookie and
  // require an exact match on the callback to reject forged/replayed logins.
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
    secure: isProduction(c.env),
  });
  // Remember a validated post-login redirect (e.g. the dashboard) across the round-trip.
  const redirect = c.req.query('redirect');
  if (isSafeDashboardRedirect(redirect)) {
    setCookie(c, REDIRECT_COOKIE, redirect, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
      secure: isProduction(c.env),
    });
  }
  return c.redirect(buildAuthorizeUrl(config, state));
});

// GET /auth/github/callback — complete the flow and mint a key.
authRoutes.get('/github/callback', async (c) => {
  const config = oauthConfig(c.env);
  if (!config) return c.json({ error: 'GitHub OAuth is not configured' }, 501);

  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code parameter' }, 400);

  // CSRF: the returned state must match the cookie we set in GET /auth/github.
  const returnedState = c.req.query('state');
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/' });
  if (!expectedState || !returnedState || returnedState !== expectedState) {
    return c.json({ error: 'Invalid OAuth state' }, 403);
  }

  let token: string;
  let ghUser;
  try {
    token = await exchangeCodeForToken(config, code);
    ghUser = await fetchGitHubUser(token);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'OAuth failed' }, 502);
  }

  const store = getStore(c.env);
  const githubId = String(ghUser.id);
  let user = await store.getUserByGithubId(githubId);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      githubId,
      githubLogin: ghUser.login,
      email: ghUser.email ?? undefined,
      plan: 'free',
      createdAt: new Date().toISOString(),
    };
    await store.createUser(user);
  } else {
    await store.updateUserIdentity(user.id, {
      githubLogin: ghUser.login,
      email: user.email ?? ghUser.email ?? undefined,
    });
    user = {
      ...user,
      githubLogin: ghUser.login,
      email: user.email ?? ghUser.email ?? undefined,
    };
  }

  // If this login was initiated for the browser dashboard, set a session cookie
  // and redirect there instead of returning JSON. The redirect target is read
  // from the query param or the short-lived cookie set in GET /auth/github.
  const redirect = c.req.query('redirect') ?? getCookie(c, REDIRECT_COOKIE);
  deleteCookie(c, REDIRECT_COOKIE, { path: '/' });
  if (isSafeDashboardRedirect(redirect)) {
    const value = await createSessionCookie(user.id, sessionSecret(c.env));
    setCookie(c, SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: isProduction(c.env),
    });
    return c.redirect(redirect, 302);
  }

  // JSON/CLI bootstrap: mint at most one default key per user. Dashboard
  // sessions rely on the HMAC cookie — no throwaway keys on browser login.
  const existingKeys = await store.listApiKeys(user.id);
  let apiKey: string | undefined;
  if (existingKeys.length === 0) {
    apiKey = generateApiKey();
    await store.createApiKey({
      keyHash: await hashKey(apiKey),
      userId: user.id,
      name: 'Default (created via GitHub login)',
      createdAt: new Date().toISOString(),
    });
  }

  return c.json({
    user: { id: user.id, login: ghUser.login, email: user.email },
    ...(apiKey
      ? {
          apiKey,
          note: 'Store this key securely — it will not be shown again.',
        }
      : {
          note: 'You already have an API key. Use your existing key or create one via POST /v1/keys.',
        }),
    mode: isProduction(c.env) ? 'production' : 'dev',
  });
});

// POST /auth/logout — clear the browser session cookie (CSRF-protected).
authRoutes.post('/logout', async (c) => {
  const secFetchSite = c.req.header('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return c.json({ error: 'Cross-site logout request rejected' }, 403);
  }
  const origin = c.req.header('origin');
  if (origin) {
    const reqOrigin = new URL(c.req.url).origin;
    let apiOrigin: string | null = null;
    if (c.env?.API_BASE_URL) {
      try {
        apiOrigin = new URL(c.env.API_BASE_URL).origin;
      } catch {
        apiOrigin = null;
      }
    }
    if (origin !== reqOrigin && origin !== apiOrigin) {
      return c.json({ error: 'Cross-origin logout request rejected' }, 403);
    }
  }

  const sessionCookie = getCookie(c, SESSION_COOKIE);
  if (sessionCookie) {
    const secret = sessionSecret(c.env);
    const uid = await verifySessionCookie(sessionCookie, secret);
    if (uid) {
      let csrfToken = c.req.header(CSRF_HEADER);
      if (!csrfToken) {
        const ct = c.req.header('content-type') ?? '';
        if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
          const body = await c.req.parseBody().catch(() => ({}));
          const raw = (body as Record<string, unknown>)[CSRF_FIELD];
          if (typeof raw === 'string') csrfToken = raw;
        } else if (ct.includes('application/json')) {
          const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
          if (typeof body[CSRF_FIELD] === 'string') csrfToken = body[CSRF_FIELD];
        }
      }
      if (!csrfToken || !(await verifyCsrfToken(sessionCookie, csrfToken, secret))) {
        return c.json({ error: 'Invalid or missing CSRF token' }, 403);
      }
    }
  }

  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProduction(c.env),
  });

  const accept = c.req.header('accept') ?? '';
  if (accept.includes('application/json')) {
    return c.json({ loggedOut: true });
  }
  return c.redirect('/dashboard', 302);
});
