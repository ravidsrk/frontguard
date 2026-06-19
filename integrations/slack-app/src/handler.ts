/**
 * Frontguard Slack app — HTTP shell (Hono).
 *
 * Routes:
 * - `GET  /health`               — liveness.
 * - `POST /slack/events`         — Events API (signed); handles the
 *                                  `url_verification` handshake and events.
 * - `POST /slack/commands`       — `/frontguard` slash command (signed).
 * - `GET  /slack/oauth/callback` — OAuth v2 install callback (persists install).
 *
 * All Slack-originating POSTs are signature-verified before processing. Mirrors
 * the GitHub App / Vercel integration handlers.
 *
 * Deployed as a Cloudflare Worker (see `wrangler.toml`); the `SLACK_TEAMS` KV
 * binding stores `{ team_id → bot token + scope }`.
 *
 * @module handler
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verifySlackSignature } from './verify.js';
import {
  parseSlackEnvelope,
  parseSlashCommand,
  buildCommandResponse,
  decideCommand,
} from './events.js';
import { buildSlackAuthorizeUrl, exchangeSlackCode, type SlackOAuthConfig } from './oauth.js';
import { putTeamInstall, type KVNamespace } from './storage.js';
import { submitCloudRun, deliverRunResult } from './runs.js';

export type { KVNamespace } from './storage.js';

/**
 * Cloudflare execution context shape (subset). Declared locally to avoid a
 * `@cloudflare/workers-types` dependency. `waitUntil` keeps async work
 * (cloud-api poll + delayed Slack response) alive past the immediate ack.
 */
export interface ExecutionContextLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface SlackAppEnv {
  /** Slack signing secret used to verify request signatures. */
  SLACK_SIGNING_SECRET?: string;
  /** Slack app client id (OAuth v2). */
  SLACK_CLIENT_ID?: string;
  /** Slack app client secret (OAuth v2). */
  SLACK_CLIENT_SECRET?: string;
  /** Public OAuth redirect URL — must exactly match the manifest. */
  SLACK_REDIRECT_URI?: string;
  /** Bot scopes (comma-separated). Defaults to `chat:write,commands`. */
  SLACK_SCOPES?: string;
  /** Frontguard Cloud API base URL (e.g. `https://api.frontguard.dev`). */
  FRONTGUARD_API_URL?: string;
  /** Frontguard API key used to submit runs on behalf of the workspace. */
  FRONTGUARD_API_KEY?: string;
  /** KV namespace holding one record per installed Slack team. */
  SLACK_TEAMS?: KVNamespace;
}

const TS_HEADER = 'x-slack-request-timestamp';
const SIG_HEADER = 'x-slack-signature';
/** Short-lived cookie holding the OAuth `state` for CSRF verification. */
const STATE_COOKIE = 'fg_slack_oauth_state';

function oauthCookieSecure(c: { req: { url: string } }): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

async function verified(
  c: { req: { header: (n: string) => string | undefined } },
  raw: string,
  secret: string,
): Promise<boolean> {
  return verifySlackSignature(
    raw,
    c.req.header(TS_HEADER) ?? null,
    c.req.header(SIG_HEADER) ?? null,
    secret,
  );
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
      // Slack expects the challenge echoed back verbatim.
      return c.text(decision.challenge);
    }
    // Events are acknowledged immediately; real processing would be queued.
    return c.json({ ok: true });
  });

  // ----- Slash command --------------------------------------------------------
  // Returns an immediate ephemeral ack (must be within 3 s); for a valid
  // `/frontguard status <url>`, submits a run to the Cloud API and schedules
  // a follow-up message via the command's `response_url` once the run
  // reaches a terminal state.
  app.post('/slack/commands', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_SIGNING_SECRET) return c.json({ error: 'Signing secret not configured' }, 500);

    const raw = await c.req.text();
    if (!(await verified(c, raw, env.SLACK_SIGNING_SECRET))) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const cmd = parseSlashCommand(new URLSearchParams(raw));
    const ack = buildCommandResponse(cmd);
    const decision = decideCommand(cmd);

    if (decision.kind === 'status') {
      const apiUrl = env.FRONTGUARD_API_URL;
      const apiKey = env.FRONTGUARD_API_KEY;
      if (!apiUrl || !apiKey) {
        return c.json({
          response_type: 'ephemeral',
          text: ':warning: Slack app is missing FRONTGUARD_API_URL / FRONTGUARD_API_KEY — ask an admin to finish setup.',
        });
      }

      // Submit synchronously so we can surface 4xx errors (auth, plan limit)
      // in the ack response. The follow-up message is delivered later.
      try {
        const run = await submitCloudRun({ apiBaseUrl: apiUrl, apiKey, url: decision.url });
        // `executionCtx` is a getter in Hono that throws when no Workers context
        // is attached (e.g. in tests / Node). Read it defensively.
        let ctx: ExecutionContextLike | undefined;
        try {
          ctx = c.executionCtx as ExecutionContextLike | undefined;
        } catch {
          ctx = undefined;
        }
        const work = deliverRunResult({
          apiBaseUrl: apiUrl,
          apiKey,
          runId: run.id,
          url: decision.url,
          responseUrl: cmd.responseUrl,
        });
        // On Workers, waitUntil keeps the request lifetime open. Outside of
        // Workers we just fire-and-forget — `.catch` so an unhandled rejection
        // can't take down the process.
        if (ctx?.waitUntil) ctx.waitUntil(work);
        else void work.catch(() => undefined);

        return c.json({
          response_type: 'ephemeral',
          text: `🔍 Queued visual check \`${run.id}\` for \`${decision.url}\`. I'll post the result here when it's done.`,
        });
      } catch (err) {
        return c.json({
          response_type: 'ephemeral',
          text: `:warning: Could not submit the run: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return c.json(ack);
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
      scopes: (env.SLACK_SCOPES ?? 'chat:write,commands').split(','),
    };

    const code = c.req.query('code');
    if (!code) {
      // A random state mitigates CSRF. Persist it in an httpOnly cookie and
      // require an exact match on the callback to reject forged/replayed installs.
      const state = crypto.randomUUID();
      setCookie(c, STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 600,
        secure: oauthCookieSecure(c),
      });
      return c.redirect(buildSlackAuthorizeUrl(config, state));
    }

    // CSRF: the returned state must match the cookie we set before redirecting.
    const returnedState = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      return c.json({ error: 'Invalid OAuth state' }, 403);
    }

    try {
      const install = await exchangeSlackCode(config, code);

      // Persist the install (bot token, scope, team) to KV keyed by team id.
      // The token is never echoed in the response or logged.
      if (env.SLACK_TEAMS && install.teamId) {
        await putTeamInstall(env.SLACK_TEAMS, {
          teamId: install.teamId,
          teamName: install.teamName,
          accessToken: install.accessToken,
          botUserId: install.botUserId,
          scope: install.scope,
          installedAt: new Date().toISOString(),
        });
      }

      return c.json({
        ok: true,
        team: install.teamId,
        teamName: install.teamName,
        persisted: Boolean(env.SLACK_TEAMS && install.teamId),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'OAuth exchange failed' }, 400);
    }
  });

  return app;
}
