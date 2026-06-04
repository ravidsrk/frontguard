/**
 * Slack OAuth v2 install flow (pure core).
 *
 * When a workspace admin clicks "Add to Slack", Slack redirects to the app's
 * redirect URL with a `code`, which we exchange for a bot token via
 * `oauth.v2.access`. Secrets (`SLACK_CLIENT_SECRET`, tokens) are never logged.
 *
 * @module oauth
 */

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Bot scopes to request. */
  scopes: string[];
}

/** What we persist after a successful install. */
export interface SlackInstall {
  accessToken: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  scope?: string;
}

interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  scope?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  error?: string;
}

/** Builds the Slack OAuth authorize URL to redirect the admin to. */
export function buildSlackAuthorizeUrl(config: SlackOAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes.join(','),
    redirect_uri: config.redirectUri,
  });
  if (state) params.set('state', state);
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchanges an OAuth `code` for a bot token via `oauth.v2.access`. Throws on a
 * non-ok Slack response.
 */
export async function exchangeSlackCode(
  config: SlackOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SlackInstall> {
  const res = await fetchImpl('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }).toString(),
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.access_token) {
    throw new Error(`Slack OAuth failed: ${data.error ?? `HTTP ${res.status}`}`);
  }
  return {
    accessToken: data.access_token,
    teamId: data.team?.id,
    teamName: data.team?.name,
    botUserId: data.bot_user_id,
    scope: data.scope,
  };
}
