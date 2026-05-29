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
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionSecret,
} from '../auth/session.js';

type Variables = { store: Store };

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
  // Remember a post-login redirect (e.g. the dashboard) across the round-trip.
  const redirect = c.req.query('redirect');
  if (redirect) {
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
      email: ghUser.email ?? undefined,
      plan: 'free',
      createdAt: new Date().toISOString(),
    };
    await store.createUser(user);
  }

  // Mint an initial API key (plaintext shown once).
  const apiKey = generateApiKey();
  await store.createApiKey({
    keyHash: await hashKey(apiKey),
    userId: user.id,
    name: 'Default (created via GitHub login)',
    createdAt: new Date().toISOString(),
  });

  // If this login was initiated for the browser dashboard, set a session cookie
  // and redirect there instead of returning JSON. The redirect target is read
  // from the query param or the short-lived cookie set in GET /auth/github.
  const redirect = c.req.query('redirect') ?? getCookie(c, REDIRECT_COOKIE);
  if (redirect && redirect.startsWith('/dashboard')) {
    deleteCookie(c, REDIRECT_COOKIE, { path: '/' });
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

  return c.json({
    user: { id: user.id, login: ghUser.login, email: user.email },
    apiKey,
    note: 'Store this key securely — it will not be shown again.',
    mode: isProduction(c.env) ? 'production' : 'dev',
  });
});
