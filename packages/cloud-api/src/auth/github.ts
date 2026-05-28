/**
 * GitHub OAuth flow (Task 5.3).
 *
 * Minimal, dependency-free OAuth implementation suitable for Cloudflare
 * Workers. Exchanges an OAuth code for an access token, then fetches the
 * GitHub user profile.
 *
 * @module auth/github
 */

/** GitHub OAuth configuration (from Worker secrets). */
export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Where GitHub redirects back to (must match the app settings). */
  redirectUri: string;
}

/** A GitHub user profile (subset we use). */
export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
}

/** Builds the GitHub authorize URL to redirect the user to. */
export function buildAuthorizeUrl(config: GitHubOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an OAuth `code` for an access token.
 *
 * @throws if GitHub returns an error or no token.
 */
export async function exchangeCodeForToken(
  config: GitHubOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange error: ${data.error ?? 'no access_token'}`);
  }
  return data.access_token;
}

/**
 * Fetches the authenticated GitHub user's profile. Resolves a primary email
 * via the `/user/emails` endpoint when the profile email is hidden.
 */
export async function fetchGitHubUser(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubUser> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'frontguard-cloud-api',
  };
  const res = await fetchImpl('https://api.github.com/user', { headers });
  if (!res.ok) throw new Error(`GitHub user fetch failed: ${res.status}`);
  const profile = (await res.json()) as { id: number; login: string; email: string | null };

  let email = profile.email;
  if (!email) {
    try {
      const emailsRes = await fetchImpl('https://api.github.com/user/emails', { headers });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
      }
    } catch {
      /* email is optional */
    }
  }
  return { id: profile.id, login: profile.login, email };
}
