/**
 * Frontguard Slack app — HTTP shell (Hono).
 *
 * Routes:
 * - `GET  /health`               — liveness.
 * - `POST /slack/events`         — Events API (signed); handles the
 *                                  `url_verification` handshake and events.
 * - `POST /slack/commands`       — `/frontguard` slash command (signed).
 * - `GET  /slack/oauth/callback` — OAuth v2 install callback.
 *
 * All Slack-originating POSTs are signature-verified before processing. Mirrors
 * the GitHub App / Vercel integration handlers.
 *
 * @module handler
 */

import { Hono } from 'hono';
import { verifySlackSignature } from './verify.js';
import { parseSlackEnvelope, parseSlashCommand, buildCommandResponse } from './events.js';
import { buildSlackAuthorizeUrl, exchangeSlackCode, type SlackOAuthConfig } from './oauth.js';

export interface SlackAppEnv {
  SLACK_SIGNING_SECRET?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_REDIRECT_URI?: string;
  /** Bot scopes (comma-separated). Defaults to `chat:write,commands`. */
  SLACK_SCOPES?: string;
  FRONTGUARD_API_URL?: string;
  FRONTGUARD_API_KEY?: string;
}

const TS_HEADER = 'x-slack-request-timestamp';
const SIG_HEADER = 'x-slack-signature';

async function verified(c: { req: { header: (n: string) => string | undefined } }, raw: string, secret: string): Promise<boolean> {
  return verifySlackSignature(raw, c.req.header(TS_HEADER) ?? null, c.req.header(SIG_HEADER) ?? null, secret);
}

export function createSlackApp() {
  const app = new Hono<{ Bindings: SlackAppEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'slack-app' }));

  // ----- Events API -----------------------------------------------------------
  app.post('/slack/events', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_SIGNING_SECRET) return c.json({ error: 'Signing secret not configured' }, 500);

    const raw = await c.req.text();
    if (!(await verified(c, raw, env.SLACK_SIGNING_SECRET))) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const decision = parseSlackEnvelope(body);
    if (decision.kind === 'url_verification') {
      // Slack expects the challenge in a JSON response body.
      return c.json({ challenge: decision.challenge });
    }
    // Events are acknowledged immediately; real processing would be queued.
    return c.json({ ok: true });
  });

  // ----- Slash command --------------------------------------------------------
  app.post('/slack/commands', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_SIGNING_SECRET) return c.json({ error: 'Signing secret not configured' }, 500);

    const raw = await c.req.text();
    if (!(await verified(c, raw, env.SLACK_SIGNING_SECRET))) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const cmd = parseSlashCommand(new URLSearchParams(raw));
    return c.json(buildCommandResponse(cmd));
  });

  // ----- OAuth install --------------------------------------------------------
  app.get('/slack/oauth/callback', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) {
      return c.json({ error: 'OAuth not configured' }, 500);
    }
    const config: SlackOAuthConfig = {
      clientId: env.SLACK_CLIENT_ID,
      clientSecret: env.SLACK_CLIENT_SECRET,
      redirectUri: env.SLACK_REDIRECT_URI,
      scopes: (env.SLACK_SCOPES ?? 'chat:write,commands').split(',').map((s) => s.trim()),
    };

    const code = c.req.query('code');
    const error = c.req.query('error');
    if (error) {
      // User denied authorization or OAuth error occurred.
      return c.json({ error: `OAuth failed: ${error}` }, 400);
    }
    if (!code) {
      // No code yet → kick off the authorize flow.
      return c.redirect(buildSlackAuthorizeUrl(config, c.req.query('state')));
    }
    try {
      const install = await exchangeSlackCode(config, code);
      // A real deployment persists `install` (token per team) to a store here.
      return c.json({ ok: true, team: install.teamId });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'OAuth exchange failed' }, 400);
    }
  });

  return app;
}
