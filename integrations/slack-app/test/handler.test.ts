import { describe, it, expect } from 'vitest';
import { createSlackApp } from '../src/handler.js';
import { signSlack } from './helpers.js';

const SECRET = 'shhh-signing-secret';
const env = { SLACK_SIGNING_SECRET: SECRET };

function signedHeaders(body: string, ts: string, sig: string): Record<string, string> {
  return {
    'x-slack-request-timestamp': ts,
    'x-slack-signature': sig,
    'content-type': 'application/json',
  };
}

describe('createSlackApp', () => {
  const app = createSlackApp();

  it('serves a health check', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', integration: 'slack-app' });
  });

  it('echoes the url_verification challenge for a signed request', async () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'chal-xyz' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);
    const res = await app.request('/slack/events', { method: 'POST', headers: signedHeaders(body, ts, sig), body }, env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ challenge: 'chal-xyz' });
  });

  it('rejects an unsigned events request with 401', async () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'x' });
    const res = await app.request(
      '/slack/events',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('responds to a signed slash command with help text', async () => {
    const body = new URLSearchParams({ command: '/frontguard', text: '', user_id: 'U1', channel_id: 'C1', team_id: 'T1', response_url: '' }).toString();
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signSlack(body, ts, SECRET);
    const res = await app.request(
      '/slack/commands',
      { method: 'POST', headers: { 'x-slack-request-timestamp': ts, 'x-slack-signature': sig, 'content-type': 'application/x-www-form-urlencoded' }, body },
      env,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string };
    expect(json.text).toContain('/frontguard status');
  });

  it('returns 500 when the signing secret is unconfigured', async () => {
    const res = await app.request('/slack/events', { method: 'POST', body: '{}' }, {});
    expect(res.status).toBe(500);
  });
});
