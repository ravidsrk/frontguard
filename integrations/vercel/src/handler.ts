/**
 * Vercel integration HTTP handler (Task 7.1).
 *
 * A small Hono app exposing:
 * - `POST /api/webhook`  — receives Vercel deployment events.
 * - `GET  /api/install`  — OAuth-style installation landing (stub).
 * - `GET  /health`       — health check.
 *
 * Deployable as a Vercel Serverless Function or any Workers/Node host.
 *
 * @module handler
 */

import { Hono } from 'hono';
import {
  verifyVercelSignature,
  decideFromWebhook,
  triggerRun,
  isAllowedPreviewUrl,
  type VercelWebhookPayload,
} from './webhook.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  parseInstallCallback,
  safeNextRedirect,
} from './install.js';

/**
 * Minimal KV namespace binding (Workers KV / compatible). Declared locally so
 * the integration does not depend on `@cloudflare/workers-types`.
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** TTL (seconds) for recorded webhook delivery ids used for idempotency. */
const DELIVERY_ID_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface HandlerEnv {
  /** Vercel integration client secret (for signature verification + OAuth). */
  VERCEL_CLIENT_SECRET?: string;
  /** Vercel integration client id (for OAuth install flow). */
  VERCEL_CLIENT_ID?: string;
  /** Public URL Vercel redirects back to (the /api/install endpoint). */
  VERCEL_REDIRECT_URI?: string;
  /** Frontguard Cloud API base URL. */
  FRONTGUARD_API_URL?: string;
  /** Frontguard API key used to submit runs. */
  FRONTGUARD_API_KEY?: string;
  /**
   * Comma-separated routes to test on each preview deployment. Mirrors the
   * `routes` field of `frontguard.config.ts`. Defaults to `/` on the API side.
   */
  FRONTGUARD_ROUTES?: string;
  /**
   * Optional KV binding for durable storage of installed integrations (keyed by
   * configurationId) and webhook idempotency records. When absent, persistence
   * and dedup gracefully no-op (e.g. in tests).
   */
  KV?: KVNamespace;
}

/** Parses a comma-separated routes env var into a route list. */
export function parseRoutesEnv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const routes = value
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return routes.length > 0 ? routes : undefined;
}

export function createVercelApp() {
  const app = new Hono<{ Bindings: HandlerEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'vercel' }));

  // GET /api/install — Vercel integration install / OAuth callback.
  //
  // Two modes:
  // 1. No `code`  → kick off the flow by redirecting to Vercel's authorize URL.
  // 2. With `code` → exchange it for an access token, persist the config, then
  //    redirect the user on to the `next` URL Vercel provided.
  app.get('/api/install', async (c) => {
    const clientId = c.env?.VERCEL_CLIENT_ID;
    const clientSecret = c.env?.VERCEL_CLIENT_SECRET;
    const redirectUri =
      c.env?.VERCEL_REDIRECT_URI ?? new URL('/api/install', c.req.url).toString();

    if (!clientId || !clientSecret) {
      return c.json({ error: 'Vercel OAuth not configured (VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET)' }, 500);
    }

    const config = { clientId, clientSecret, redirectUri };
    const code = c.req.query('code');

    // No code → start the OAuth flow.
    if (!code) {
      return c.redirect(buildAuthorizeUrl(config));
    }

    // Callback → exchange the code for an access token.
    let callback;
    try {
      callback = parseInstallCallback({
        code,
        configurationId: c.req.query('configurationId'),
        teamId: c.req.query('teamId'),
        next: c.req.query('next'),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }

    let integration;
    try {
      integration = await exchangeCodeForToken(config, callback.code);
    } catch (err) {
      // Never log/return the secret or raw token — only the failure reason.
      return c.json({ error: err instanceof Error ? err.message : 'Token exchange failed' }, 502);
    }

    integration.configurationId = callback.configurationId;

    // Persist the integration (access token, configurationId, team/user) to
    // durable storage keyed by configurationId. The token is never logged or
    // returned in the response body. No-ops gracefully when no KV is bound.
    if (c.env?.KV && callback.configurationId) {
      await c.env.KV.put(
        `integration:${callback.configurationId}`,
        JSON.stringify({
          accessToken: integration.accessToken,
          teamId: integration.teamId,
          configurationId: callback.configurationId,
          installedAt: new Date().toISOString(),
        }),
      );
    }

    // If Vercel provided a `next` URL, complete the install by redirecting —
    // but only to a validated, same-origin/allowlisted target (no open redirect).
    if (callback.next) {
      return c.redirect(safeNextRedirect(callback.next));
    }

    return c.json({
      installed: true,
      installationType: integration.installationType,
      configurationId: integration.configurationId,
      message: 'Frontguard for Vercel installed. Add FRONTGUARD_API_KEY to your project env.',
    });
  });

  app.post('/api/webhook', async (c) => {
    const secret = c.env?.VERCEL_CLIENT_SECRET;
    const apiUrl = c.env?.FRONTGUARD_API_URL;
    const apiKey = c.env?.FRONTGUARD_API_KEY;

    const raw = await c.req.text();
    const signature = c.req.header('x-vercel-signature') ?? null;

    // Fail CLOSED: refuse to process unverified webhooks. If no secret is
    // configured we cannot verify the signature, so reject the request rather
    // than silently trusting it.
    if (!secret) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }
    const valid = await verifyVercelSignature(raw, signature, secret);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);

    let payload: VercelWebhookPayload;
    try {
      payload = JSON.parse(raw) as VercelWebhookPayload;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Idempotency: short-circuit duplicate deliveries when a delivery/event id
    // is present and a KV binding is available to record processed ids.
    const deliveryId = payload.id;
    if (deliveryId && c.env?.KV) {
      const seen = await c.env.KV.get(`delivery:${deliveryId}`);
      if (seen) {
        return c.json({ triggered: false, reason: 'Duplicate delivery (already processed)' });
      }
      await c.env.KV.put(`delivery:${deliveryId}`, '1', { expirationTtl: DELIVERY_ID_TTL_SECONDS });
    }

    const decision = decideFromWebhook(payload);
    if (!decision.trigger || !decision.previewUrl) {
      return c.json({ triggered: false, reason: decision.reason });
    }

    // SSRF guard: only forward https URLs on the *.vercel.app allowlist to the
    // Cloud API for screenshotting.
    if (!isAllowedPreviewUrl(decision.previewUrl)) {
      return c.json({ triggered: false, error: 'Preview URL not allowed' }, 400);
    }

    if (!apiUrl || !apiKey) {
      return c.json(
        { triggered: false, reason: 'Frontguard API not configured (FRONTGUARD_API_URL / FRONTGUARD_API_KEY)' },
        200,
      );
    }

    try {
      const run = await triggerRun({
        apiBaseUrl: apiUrl,
        apiKey,
        previewUrl: decision.previewUrl,
        routes: parseRoutesEnv(c.env?.FRONTGUARD_ROUTES),
        git: decision.git,
      });
      return c.json({ triggered: true, runId: run.id, previewUrl: decision.previewUrl });
    } catch (err) {
      return c.json({ triggered: false, error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  return app;
}

export default createVercelApp();
