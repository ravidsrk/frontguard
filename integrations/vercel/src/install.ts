/**
 * Vercel integration install / OAuth flow (Task 7.1).
 *
 * Vercel integrations use an OAuth2-style install flow. When a user adds the
 * integration, Vercel redirects the browser to the integration's "Redirect URL"
 * with `code`, `configurationId`, `teamId?` and `next` query params. The
 * integration exchanges the `code` for an access token via Vercel's token
 * endpoint, then sends the user on to the `next` URL to finish setup.
 *
 * This module contains the pure, testable core: building the authorize URL,
 * exchanging the code for a token, and parsing/validating the callback params.
 * The HTTP shell lives in `handler.ts`.
 *
 * Secrets (`VERCEL_CLIENT_SECRET`, access tokens) are never logged.
 *
 * @module install
 */

/** Vercel OAuth configuration (from integration settings / env). */
export interface VercelOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Where Vercel redirects back to (must match the integration settings). */
  redirectUri: string;
}

/** The query params Vercel sends to the integration's redirect URL. */
export interface VercelInstallCallback {
  code: string;
  /** Identifies this specific integration configuration. */
  configurationId?: string;
  /** Present when installed on a team. */
  teamId?: string;
  /** Where to send the user after setup completes. */
  next?: string;
}

/** The integration configuration we persist after a successful install. */
export interface VercelIntegrationConfig {
  accessToken: string;
  /** "user" or "team". */
  installationType?: string;
  userId?: string;
  teamId?: string;
  configurationId?: string;
  installationId?: string;
}

/** Vercel's token endpoint response (subset we use). */
interface VercelTokenResponse {
  access_token?: string;
  installation_id?: string;
  user_id?: string;
  team_id?: string | null;
  error?: string;
  error_description?: string;
}

/**
 * Builds Vercel's OAuth authorize URL to redirect the user to.
 *
 * Used when the integration is opened without a `code` (e.g. a "Connect" button
 * on the marketing site) — kicks off the install flow.
 */
export function buildAuthorizeUrl(config: VercelOAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });
  if (state) params.set('state', state);
  return `https://vercel.com/integrations/oauth/authorize?${params.toString()}`;
}

/**
 * Parses and validates the Vercel install callback query params.
 *
 * @throws if the required `code` param is missing.
 */
export function parseInstallCallback(query: Record<string, string | undefined>): VercelInstallCallback {
  const code = query.code;
  if (!code) throw new Error('Missing OAuth code in install callback');
  return {
    code,
    configurationId: query.configurationId,
    teamId: query.teamId,
    next: query.next,
  };
}

const OAUTH_TIMEOUT_MS = 15_000;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const ENCODED_CONTROL_OR_BACKSLASH_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i;

/**
 * Validates the `next` redirect target supplied by Vercel to prevent
 * open-redirect attacks. A target is considered safe when it is either:
 * - a same-origin relative path (starts with a single `/`, no control chars,
 *   whitespace, backslashes, or encoded control/backslash tricks, and resolves
 *   strictly to the same origin under WHATWG URL parsing), or
 * - an absolute `https:` URL on an allowlisted host (`vercel.com` / `*.vercel.com`)
 *   with no embedded credentials.
 *
 * Anything else falls back to the provided default (`/` by default).
 *
 * @param next - The untrusted `next` query param.
 * @param fallback - Safe default to return for invalid input.
 */
export function safeNextRedirect(next: string | undefined, fallback = '/'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (
    CONTROL_CHARS_RE.test(next) ||
    /\s/.test(next) ||
    next.includes('\\') ||
    ENCODED_CONTROL_OR_BACKSLASH_RE.test(next)
  ) {
    return fallback;
  }

  // Relative path: must start with a single '/' and resolve strictly to the
  // sentinel origin so browser/WHATWG URL parsing cannot reinterpret it as an
  // external host (e.g. via tab/newline stripping or backslash tricks).
  if (next.startsWith('/')) {
    if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
    try {
      const sentinel = 'https://frontguard.invalid';
      const resolved = new URL(next, sentinel);
      if (resolved.origin !== sentinel) return fallback;
      if (!resolved.pathname.startsWith('/') || resolved.pathname.startsWith('//')) return fallback;
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return fallback;
    }
  }

  // Absolute URL: only allow https on an allowlisted Vercel host without creds.
  try {
    const url = new URL(next);
    if (url.protocol !== 'https:') return fallback;
    if (url.username || url.password) return fallback;
    const host = url.hostname.toLowerCase();
    if (host === 'vercel.com' || host.endsWith('.vercel.com')) {
      return url.href;
    }
  } catch {
    // Not a valid absolute URL.
  }
  return fallback;
}

/**
 * Exchanges a Vercel OAuth `code` for an access token.
 *
 * Vercel expects an `application/x-www-form-urlencoded` body at
 * `https://api.vercel.com/v2/oauth/access_token`.
 *
 * @throws if Vercel returns an error or no token.
 */
export async function exchangeCodeForToken(
  config: VercelOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VercelIntegrationConfig> {
  const res = await fetchImpl('https://api.vercel.com/v2/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Vercel token exchange failed: ${res.status}`);
  const data = (await res.json()) as VercelTokenResponse;
  if (data.error || !data.access_token) {
    throw new Error(`Vercel token exchange error: ${data.error ?? 'no access_token'}`);
  }
  return {
    accessToken: data.access_token,
    installationType: data.team_id ? 'team' : 'user',
    userId: data.user_id,
    teamId: data.team_id ?? undefined,
    configurationId: data.installation_id,
    installationId: data.installation_id,
  };
}
