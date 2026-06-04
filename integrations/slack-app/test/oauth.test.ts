import { describe, it, expect } from 'vitest';
import { buildSlackAuthorizeUrl, exchangeSlackCode, type SlackOAuthConfig } from '../src/oauth.js';

const config: SlackOAuthConfig = {
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'https://example.com/slack/oauth/callback',
  scopes: ['chat:write', 'commands'],
};

describe('buildSlackAuthorizeUrl', () => {
  it('builds an authorize URL with scopes and redirect', () => {
    const url = new URL(buildSlackAuthorizeUrl(config, 'state123'));
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('scope')).toBe('chat:write,commands');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('state')).toBe('state123');
  });
});

describe('exchangeSlackCode', () => {
  it('returns the install on an ok response', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ ok: true, access_token: 'xoxb-1', scope: 'chat:write', bot_user_id: 'B1', team: { id: 'T1', name: 'Acme' } }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const install = await exchangeSlackCode(config, 'code-1', fakeFetch);
    expect(install).toEqual({ accessToken: 'xoxb-1', teamId: 'T1', teamName: 'Acme', botUserId: 'B1', scope: 'chat:write' });
  });

  it('throws on a non-ok Slack response', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid_code' }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeSlackCode(config, 'bad', fakeFetch)).rejects.toThrow('invalid_code');
  });
});
