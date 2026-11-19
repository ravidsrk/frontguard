/**
 * Frontguard Slack app — HTTP shell (Hono).
 *
 * Routes:
 * - `GET  /health`                   — liveness.
 * - `POST /slack/events`             — Events API (signed, deduped); handles
 *                                      `url_verification`, `app_mention`,
 *                                      `app_uninstalled`, and `tokens_revoked`.
 * - `POST /slack/commands`           — `/frontguard` slash command (signed);
 *                                      ack-path I/O bounded under 2s, follow-up
 *                                      delivery bounded for Cloudflare Workers.
 * - `POST /slack/runs/:runId/complete` — optional authenticated event-driven
 *                                      completion webhook from Cloud API.
 * - `GET  /slack/oauth/callback`     — OAuth v2 install callback (CSRF state +
 *                                      clean `?error=` handling).
 *
 * @module handler
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { verifySlackSignature, timingSafeEqual } from './verify.js';
import {
  parseSlackEnvelope,
  parseSlashCommand,
  buildCommandResponse,
  decideCommand,
  HELP_TEXT,
} from './events.js';
import { buildSlackAuthorizeUrl, exchangeSlackCode, type SlackOAuthConfig } from './oauth.js';
import {
  getTeamInstall,
  putTeamInstall,
  deleteTeamInstall,
  type KVNamespace,
} from './storage.js';
import {
  submitCloudRun,
  deliverRunResult,
  assertSafeRunUrl,
  buildFollowUpResponse,
  postSlackResponse,
  DEFAULT_DNS_TIMEOUT_MS,
  DEFAULT_SUBMIT_TIMEOUT_MS,
  type CloudRunStatus,
} from './runs.js';
import {
  postSlackMessage,
  escapeSlackMrkdwn,
  escapeSlackCodeSpan,
} from './slack-api.js';
import { SafeRenderTargetError } from '@frontguard/cloud-api/render-target';

export type { KVNamespace } from './storage.js';

/**
 * Cloudflare execution context shape (subset). Declared locally to avoid a
 * `@cloudflare/workers-types` dependency.
 */
export interface ExecutionContextLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Optional Cloudflare Queue binding for offloading run polling out of waitUntil. */
export interface QueueLike {
  send(message: unknown): Promise<void>;
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
  /** Optional static bot token fallback for single-workspace deployments. */
  SLACK_BOT_TOKEN?: string;
  /** Frontguard Cloud API base URL (your self-hosted deployment). */
  FRONTGUARD_API_URL?: string;
  /** Frontguard API key used to submit runs on behalf of the workspace. */
  FRONTGUARD_API_KEY?: string;
  /** Optional shared bearer secret for event-driven `/slack/runs/:runId/complete` callbacks. */
  FRONTGUARD_CALLBACK_SECRET?: string;
  /** KV namespace holding one record per installed Slack team. */
  SLACK_TEAMS?: KVNamespace;
  /** Optional Cloudflare Queue binding for asynchronous run follow-up. */
  RUN_POLL_QUEUE?: QueueLike;
}

const TS_HEADER = 'x-slack-request-timestamp';
const SIG_HEADER = 'x-slack-signature';
const RETRY_HEADER = 'x-slack-retry-num';
/** Short-lived cookie holding the OAuth `state` for CSRF verification. */
const STATE_COOKIE = 'fg_slack_oauth_state';
const MAX_BODY_BYTES = 1_048_576; // 1 MiB
const MAX_EVENT_DEDUP_ENTRIES = 1_000;
const EVENT_DEDUP_TTL_MS = 5 * 60_000;
const EVENT_DEDUP_TTL_SEC = 5 * 60;
const PENDING_RUN_TTL_SEC = 30 * 60;

/** Bounded in-memory event deduplication map (evicts expired / oldest entries). */
const seenEvents = new Map<string, number>();

export function clearEventDedupCache(): void {
  seenEvents.clear();
}

async function isDuplicateEvent(env: SlackAppEnv, eventId: string): Promise<boolean> {
  const now = Date.now();
  const existing = seenEvents.get(eventId);
  if (existing !== undefined && existing > now) {
    return true;
  }
  if (env.SLACK_TEAMS) {
    const kvSeen = await env.SLACK_TEAMS.get(`event:${eventId}`);
    if (kvSeen) {
      seenEvents.set(eventId, now + EVENT_DEDUP_TTL_MS);
      return true;
    }
  }
  return false;
}

async function markEventProcessed(env: SlackAppEnv, eventId: string): Promise<void> {
  const now = Date.now();
  if (seenEvents.size >= MAX_EVENT_DEDUP_ENTRIES) {
    for (const [k, exp] of seenEvents) {
      if (exp <= now) seenEvents.delete(k);
    }
  }
  while (seenEvents.size >= MAX_EVENT_DEDUP_ENTRIES) {
    const oldest = seenEvents.keys().next().value;
    if (oldest === undefined) break;
    seenEvents.delete(oldest);
  }
  seenEvents.set(eventId, now + EVENT_DEDUP_TTL_MS);
  if (env.SLACK_TEAMS) {
    await env.SLACK_TEAMS.put(`event:${eventId}`, '1', { expirationTtl: EVENT_DEDUP_TTL_SEC });
  }
}

/** Reads a request body up to `maxBytes`; returns `null` if the limit is exceeded. */
async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string | null> {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) return null;
  }
  if (!req.body) {
    const text = await req.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Resolves the workspace bot token for a given `teamId` from the `SLACK_TEAMS`
 * KV store (populated during OAuth install), falling back to `SLACK_BOT_TOKEN`.
 */
export async function resolveBotToken(
  env: SlackAppEnv,
  teamId?: string,
): Promise<string | undefined> {
  if (env.SLACK_TEAMS && teamId) {
    const install = await getTeamInstall(env.SLACK_TEAMS, teamId);
    if (install?.accessToken) return install.accessToken;
  }
  return env.SLACK_BOT_TOKEN;
}

/**
 * When multi-team KV storage (`SLACK_TEAMS`) is bound without a static
 * `SLACK_BOT_TOKEN` fallback, verify the incoming `teamId` is an installed
 * workspace so uninstalled/revoked teams cannot invoke commands or events.
 */
async function isAuthorizedWorkspace(env: SlackAppEnv, teamId?: string): Promise<boolean> {
  if (!env.SLACK_TEAMS) return true;
  if (teamId) {
    const install = await getTeamInstall(env.SLACK_TEAMS, teamId);
    if (install?.accessToken) return true;
  }
  return Boolean(env.SLACK_BOT_TOKEN);
}

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

    const raw = await readBodyWithLimit(c.req.raw, MAX_BODY_BYTES);
    if (raw === null) return c.json({ error: 'Payload too large' }, 413);

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
    if (decision.kind === 'event') {
      // Slack retry / event_id deduplication.
      const isRetry = Boolean(c.req.header(RETRY_HEADER));
      if (decision.eventId) {
        if (await isDuplicateEvent(env, decision.eventId)) {
          return c.json({ ok: true, deduplicated: true });
        }
        await markEventProcessed(env, decision.eventId);
      } else if (isRetry) {
        return c.json({ ok: true, deduplicated: true });
      }

      // Clean up stored workspace credentials on uninstall / token revocation.
      if (
        decision.eventType === 'app_uninstalled' ||
        decision.eventType === 'tokens_revoked'
      ) {
        if (env.SLACK_TEAMS && decision.teamId) {
          await deleteTeamInstall(env.SLACK_TEAMS, decision.teamId);
        }
        return c.json({ ok: true, revoked: true });
      }

      if (!(await isAuthorizedWorkspace(env, decision.teamId))) {
        return c.json({ ok: true, ignored: 'workspace not installed' });
      }

      const botToken = await resolveBotToken(env, decision.teamId);
      if (botToken && decision.channel && decision.eventType === 'app_mention') {
        let ctx: ExecutionContextLike | undefined;
        try {
          ctx = c.executionCtx as ExecutionContextLike | undefined;
        } catch {
          ctx = undefined;
        }
        const work = postSlackMessage(botToken, decision.channel, [], HELP_TEXT);
        if (ctx?.waitUntil) ctx.waitUntil(work);
        else void work.catch(() => undefined);
      }
      return c.json({ ok: true });
    }
    return c.json({ ok: true });
  });

  // ----- Slash command --------------------------------------------------------
  // Returns an immediate ephemeral ack (strictly bounded under Slack's 3s
  // deadline); for `/frontguard status <url>`, submits to the Cloud API with
  // tight ack-path timeouts (< 2s combined) and schedules a Workers-safe
  // follow-up (via Queue, event-driven callback, or bounded <= 20s poll).
  app.post('/slack/commands', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_SIGNING_SECRET) return c.json({ error: 'Signing secret not configured' }, 500);

    const raw = await readBodyWithLimit(c.req.raw, MAX_BODY_BYTES);
    if (raw === null) return c.json({ error: 'Payload too large' }, 413);

    if (!(await verified(c, raw, env.SLACK_SIGNING_SECRET))) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const cmd = parseSlashCommand(new URLSearchParams(raw));
    if (!(await isAuthorizedWorkspace(env, cmd.teamId))) {
      return c.json({
        response_type: 'ephemeral',
        text: ':warning: This Slack workspace is not installed. Please reinstall the Frontguard app first.',
      });
    }

    const ack = buildCommandResponse(cmd);
    const decision = decideCommand(cmd);
    const botToken = await resolveBotToken(env, cmd.teamId);

    if (decision.kind === 'status') {
      const apiUrl = env.FRONTGUARD_API_URL;
      const apiKey = env.FRONTGUARD_API_KEY;
      if (!apiUrl || !apiKey) {
        return c.json({
          response_type: 'ephemeral',
          text: ':warning: Slack app is missing FRONTGUARD_API_URL / FRONTGUARD_API_KEY — ask an admin to finish setup.',
        });
      }

      // Bound total ack-path I/O (DoH + submit) strictly under 2s so we always
      // meet Slack's 3-second response deadline.
      try {
        const startedAt = Date.now();
        await assertSafeRunUrl(decision.url, { dnsTimeoutMs: DEFAULT_DNS_TIMEOUT_MS });
        const elapsed = Date.now() - startedAt;
        const submitBudget = Math.max(300, Math.min(DEFAULT_SUBMIT_TIMEOUT_MS, 1_800 - elapsed));
        const run = await submitCloudRun({
          apiBaseUrl: apiUrl,
          apiKey,
          url: decision.url,
          timeoutMs: submitBudget,
        });

        // Persist delivery target in KV when available so an event-driven
        // callback (`/slack/runs/:runId/complete`) can deliver late results.
        if (env.SLACK_TEAMS) {
          await env.SLACK_TEAMS.put(
            `run:${run.id}`,
            JSON.stringify({
              url: decision.url,
              responseUrl: cmd.responseUrl,
              channelId: cmd.channelId,
              teamId: cmd.teamId,
            }),
            { expirationTtl: PENDING_RUN_TTL_SEC },
          );
        }

        let ctx: ExecutionContextLike | undefined;
        try {
          ctx = c.executionCtx as ExecutionContextLike | undefined;
        } catch {
          ctx = undefined;
        }

        if (env.RUN_POLL_QUEUE) {
          const enqueue = env.RUN_POLL_QUEUE.send({
            runId: run.id,
            url: decision.url,
            responseUrl: cmd.responseUrl,
            channelId: cmd.channelId,
            teamId: cmd.teamId,
          });
          if (ctx?.waitUntil) ctx.waitUntil(enqueue);
          else void enqueue.catch(() => undefined);
        } else {
          const work = deliverRunResult({
            apiBaseUrl: apiUrl,
            apiKey,
            runId: run.id,
            url: decision.url,
            responseUrl: cmd.responseUrl,
            botToken,
            channelId: cmd.channelId,
          });
          if (ctx?.waitUntil) ctx.waitUntil(work);
          else void work.catch(() => undefined);
        }

        return c.json({
          response_type: 'ephemeral',
          text: `🔍 Queued visual check \`${escapeSlackCodeSpan(run.id)}\` for \`${escapeSlackMrkdwn(decision.url)}\`. I'll post the result here when it's done.`,
        });
      } catch (err) {
        const message =
          err instanceof SafeRenderTargetError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        return c.json({
          response_type: 'ephemeral',
          text: `:warning: Could not submit the run: ${escapeSlackMrkdwn(message)}`,
        });
      }
    }

    return c.json(ack);
  });

  // ----- Event-driven run completion callback ---------------------------------
  app.post('/slack/runs/:runId/complete', async (c) => {
    const env = c.env ?? {};
    if (!env.FRONTGUARD_CALLBACK_SECRET) {
      return c.json({ error: 'Callback secret not configured' }, 500);
    }
    const auth = c.req.header('authorization') ?? '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!presented || !timingSafeEqual(presented, env.FRONTGUARD_CALLBACK_SECRET)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const raw = await readBodyWithLimit(c.req.raw, MAX_BODY_BYTES);
    if (raw === null) return c.json({ error: 'Payload too large' }, 413);

    const runId = c.req.param('runId');
    if (!runId || !env.SLACK_TEAMS) {
      return c.json({ error: 'Run state store not configured' }, 400);
    }
    const storedRaw = await env.SLACK_TEAMS.get(`run:${runId}`);
    if (!storedRaw) {
      return c.json({ error: 'Unknown or expired run' }, 404);
    }

    let stored: { url: string; responseUrl?: string; channelId?: string; teamId?: string };
    let runBody: CloudRunStatus;
    try {
      stored = JSON.parse(storedRaw) as typeof stored;
      runBody = JSON.parse(raw) as CloudRunStatus;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const followUp = buildFollowUpResponse({ ...runBody, id: runId }, stored.url);
    const posted = stored.responseUrl
      ? await postSlackResponse(stored.responseUrl, followUp)
      : { ok: false };
    if (!posted.ok && stored.channelId) {
      const botToken = await resolveBotToken(env, stored.teamId);
      if (botToken) {
        await postSlackMessage(botToken, stored.channelId, followUp.blocks, followUp.text);
      }
    }
    if (typeof env.SLACK_TEAMS.delete === 'function') {
      await env.SLACK_TEAMS.delete(`run:${runId}`);
    }
    return c.json({ delivered: true });
  });

  // ----- OAuth install --------------------------------------------------------
  app.get('/slack/oauth/callback', async (c) => {
    const env = c.env ?? {};
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) {
      return c.json({ error: 'OAuth not configured' }, 500);
    }

    // Handle Slack OAuth error callbacks (e.g. `?error=access_denied`) cleanly
    // instead of looping back to Slack's authorize URL.
    const oauthError = c.req.query('error');
    if (oauthError) {
      deleteCookie(c, STATE_COOKIE, { path: '/' });
      return c.json(
        {
          ok: false,
          error: `Slack OAuth authorization cancelled or failed: ${oauthError}`,
        },
        400,
      );
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
      // require a constant-time match on the callback to reject forged/replayed installs.
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

    // CSRF: constant-time compare returned state against cookie.
    const returnedState = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });
    if (!expectedState || !returnedState || !timingSafeEqual(returnedState, expectedState)) {
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
