/**
 * Vercel integration HTTP handler.
 *
 * A small Hono app exposing:
 * - `POST /api/webhook`  — receives Vercel deployment events.
 * - `GET  /api/install`  — Vercel OAuth install + callback handler.
 * - `GET  /health`       — health check.
 *
 * Deployable as a Vercel Serverless Function or any Workers/Node host.
 *
 * @module handler
 */

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  verifyVercelSignature,
  timingSafeEqual,
  isFreshWebhookTimestamp,
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
  delete?(key: string): Promise<void>;
}

async function deleteKvKey(kv: KVNamespace, key: string): Promise<void> {
  if (typeof kv.delete === 'function') {
    await kv.delete(key);
  } else {
    await kv.put(key, '');
  }
}

/** TTL (seconds) for recorded webhook delivery ids used for idempotency. */
const DELIVERY_ID_TTL_SECONDS = 60 * 60 * 24; // 24h
/** Short-lived cookie holding the OAuth `state` for CSRF protection. */
const STATE_COOKIE = 'fg_vercel_oauth_state';
const MAX_WEBHOOK_BODY_BYTES = 1_048_576; // 1 MiB
const INSTALL_CALLBACK_TIMEOUT_MS = 15_000;

/** Key used in KV to mark a Vercel project as authorized for custom-domain previews. */
function projectAuthorizationKey(projectId: string): string {
  return `project:${projectId}`;
}

export interface HandlerEnv {
  /** Vercel integration client secret (for signature verification + OAuth). */
  VERCEL_CLIENT_SECRET?: string;
  /** Vercel integration client id (for OAuth install flow). */
  VERCEL_CLIENT_ID?: string;
  /** Public HTTPS URL Vercel redirects back to (the /api/install endpoint). Required for OAuth. */
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

function isValidHttpsUri(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
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

export function createVercelApp() {
  const app = new Hono<{ Bindings: HandlerEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'vercel' }));

  // GET /api/install — Vercel integration install / OAuth callback.
  //
  // Three modes:
  // 1. With `error` → user denied or Vercel returned an OAuth error; stop cleanly.
  // 2. No `code`    → set CSRF state cookie and redirect to Vercel's authorize URL.
  // 3. With `code`  → validate CSRF state cookie, exchange the code for an access
  //    token, derive `configurationId` strictly from Vercel's token response,
  //    persist to KV, and redirect to a validated `next` URL.
  app.get('/api/install', async (c) => {
    const clientId = c.env?.VERCEL_CLIENT_ID;
    const clientSecret = c.env?.VERCEL_CLIENT_SECRET;
    const redirectUri = c.env?.VERCEL_REDIRECT_URI;

    if (!clientId || !clientSecret || !isValidHttpsUri(redirectUri)) {
      return c.json(
        {
          error:
            'Vercel OAuth not configured (VERCEL_CLIENT_ID / VERCEL_CLIENT_SECRET / https VERCEL_REDIRECT_URI)',
        },
        500,
      );
    }

    const oauthError = c.req.query('error');
    if (oauthError) {
      deleteCookie(c, STATE_COOKIE, { path: '/' });
      return c.json(
        {
          installed: false,
          error: `Vercel OAuth authorization error: ${oauthError}`,
        },
        400,
      );
    }

    const config = { clientId, clientSecret, redirectUri };
    const code = c.req.query('code');

    // No code → start the OAuth flow with a random CSRF state cookie.
    if (!code) {
      const state = crypto.randomUUID();
      setCookie(c, STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 600,
      });
      return c.redirect(buildAuthorizeUrl(config, state));
    }

    // CSRF validation: state query param must match the HttpOnly cookie.
    const returnedState = c.req.query('state');
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });
    if (!expectedState || !returnedState || !timingSafeEqual(returnedState, expectedState)) {
      return c.json({ error: 'Invalid OAuth state' }, 403);
    }

    // Callback → parse query params (ignoring untrusted configurationId/teamId).
    let callback;
    try {
      callback = parseInstallCallback({
        code,
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

    // Derive configurationId strictly from Vercel's token exchange response
    // (`installation_id`), NEVER from the untrusted query string.
    const configurationId = integration.installationId;
    integration.configurationId = configurationId;

    // Persist the integration (access token, configurationId, team/user) to
    // durable storage keyed by the authoritative configurationId.
    const installedAt = new Date().toISOString();
    if (c.env?.KV && configurationId) {
      await c.env.KV.put(
        `integration:${configurationId}`,
        JSON.stringify({
          accessToken: integration.accessToken,
          teamId: integration.teamId,
          userId: integration.userId,
          configurationId,
          installedAt,
        }),
      );
      // Also key by Vercel teamId (or userId for personal accounts) so webhooks
      // can resolve an installation in O(1).
      if (integration.teamId) {
        await c.env.KV.put(
          `team:${integration.teamId}`,
          JSON.stringify({ configurationId, installedAt }),
        );
      }
      if (integration.userId) {
        await c.env.KV.put(
          `user:${integration.userId}`,
          JSON.stringify({ configurationId, installedAt }),
        );
      }
    }

    // Best-effort: create a corresponding Frontguard team in the Cloud API so
    // runs triggered by this integration are billed to the right workspace.
    if (c.env?.FRONTGUARD_API_URL && c.env?.FRONTGUARD_API_KEY) {
      try {
        await fetch(`${c.env.FRONTGUARD_API_URL.replace(/\/+$/, '')}/v1/integrations/vercel/install`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${c.env.FRONTGUARD_API_KEY}`,
          },
          body: JSON.stringify({
            configurationId,
            vercelTeamId: integration.teamId,
            vercelUserId: integration.userId,
            installationType: integration.installationType,
          }),
          signal: AbortSignal.timeout(INSTALL_CALLBACK_TIMEOUT_MS),
        });
      } catch {
        // Swallow — install still succeeds locally.
      }
    }

    // If Vercel provided a `next` URL, complete the install by redirecting —
    // but only to a validated, same-origin/allowlisted target (no open redirect).
    if (callback.next) {
      return c.redirect(safeNextRedirect(callback.next));
    }

    return c.json({
      installed: true,
      installationType: integration.installationType,
      configurationId,
      message: 'Frontguard for Vercel installed. Add FRONTGUARD_API_KEY to your project env.',
    });
  });

  app.post('/api/webhook', async (c) => {
    const secret = c.env?.VERCEL_CLIENT_SECRET;
    const apiUrl = c.env?.FRONTGUARD_API_URL;
    const apiKey = c.env?.FRONTGUARD_API_KEY;

    // Fail CLOSED: refuse to process unverified webhooks.
    if (!secret) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    const raw = await readBodyWithLimit(c.req.raw, MAX_WEBHOOK_BODY_BYTES);
    if (raw === null) {
      return c.json({ error: 'Payload too large' }, 413);
    }

    const signature = c.req.header('x-vercel-signature') ?? null;
    const valid = await verifyVercelSignature(raw, signature, secret);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);

    let payload: VercelWebhookPayload;
    try {
      payload = JSON.parse(raw) as VercelWebhookPayload;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Replay guard: enforce a 5-minute freshness window on Vercel's signed
    // `createdAt` timestamp (or `x-vercel-timestamp` header).
    const timestamp = payload.createdAt ?? c.req.header('x-vercel-timestamp');
    if (!isFreshWebhookTimestamp(timestamp)) {
      return c.json({ error: 'Stale or missing webhook timestamp' }, 401);
    }

    // Idempotency check (read-only here — write ONLY after side effects succeed
    // so transient 502 retries are never dropped).
    const deliveryId = payload.id;
    if (deliveryId && c.env?.KV) {
      const seen = await c.env.KV.get(`delivery:${deliveryId}`);
      if (seen) {
        return c.json({ triggered: false, reason: 'Duplicate delivery (already processed)' });
      }
    }

    // Handle integration uninstallation / revocation events by purging KV records.
    if (
      payload.type === 'integration-configuration.removed' ||
      payload.type === 'integration-configuration-removed'
    ) {
      const configId =
        payload.payload?.configuration?.id ??
        payload.payload?.configurationId ??
        payload.configurationId ??
        undefined;
      let teamId = payload.payload?.team?.id ?? payload.payload?.teamId ?? undefined;
      let userId = payload.payload?.user?.id ?? undefined;
      if (c.env?.KV) {
        if (configId) {
          const existing = await c.env.KV.get(`integration:${configId}`);
          if (existing) {
            try {
              const parsed = JSON.parse(existing) as { teamId?: string; userId?: string };
              teamId = teamId ?? parsed.teamId;
              userId = userId ?? parsed.userId;
            } catch {
              /* ignore */
            }
          }
          await deleteKvKey(c.env.KV, `integration:${configId}`);
        }
        if (teamId) {
          await deleteKvKey(c.env.KV, `team:${teamId}`);
        }
        if (userId) {
          await deleteKvKey(c.env.KV, `user:${userId}`);
        }
        const projectIds = new Set<string>();
        if (payload.payload?.project?.id) projectIds.add(payload.payload.project.id);
        for (const p of payload.payload?.projects ?? []) {
          projectIds.add(typeof p === 'string' ? p : p.id);
        }
        for (const p of payload.payload?.configuration?.projects ?? []) {
          projectIds.add(typeof p === 'string' ? p : p.id);
        }
        for (const pid of projectIds) {
          if (pid) await deleteKvKey(c.env.KV, projectAuthorizationKey(pid));
        }
        if (deliveryId) {
          await c.env.KV.put(`delivery:${deliveryId}`, '1', {
            expirationTtl: DELIVERY_ID_TTL_SECONDS,
          });
        }
      }
      return c.json({
        triggered: false,
        removed: true,
        configurationId: configId ?? null,
        reason: 'Integration configuration removed',
      });
    }

    const decision = decideFromWebhook(payload);
    if (!decision.trigger || !decision.previewUrl) {
      return c.json({ triggered: false, reason: decision.reason });
    }

    // Project authorization for custom-domain previews.
    let authorizedProject = false;
    if (c.env?.KV) {
      const projectId = decision.projectId;
      const teamId = decision.teamId;
      const configurationId = decision.configurationId;
      const userId = decision.userId;
      if (!authorizedProject && teamId) {
        const installed = await c.env.KV.get(`team:${teamId}`);
        if (installed) authorizedProject = true;
      }
      if (!authorizedProject && configurationId) {
        const installed = await c.env.KV.get(`integration:${configurationId}`);
        if (installed) authorizedProject = true;
      }
      if (!authorizedProject && userId) {
        const installed = await c.env.KV.get(`user:${userId}`);
        if (installed) authorizedProject = true;
      }
      if (!authorizedProject && projectId) {
        const seen = await c.env.KV.get(projectAuthorizationKey(projectId));
        if (seen) {
          try {
            const parsed = JSON.parse(seen) as {
              teamId?: string | null;
              configurationId?: string | null;
              userId?: string | null;
            };
            if (parsed && typeof parsed === 'object') {
              if (parsed.teamId && (await c.env.KV.get(`team:${parsed.teamId}`))) {
                authorizedProject = true;
              } else if (
                parsed.configurationId &&
                (await c.env.KV.get(`integration:${parsed.configurationId}`))
              ) {
                authorizedProject = true;
              } else if (parsed.userId && (await c.env.KV.get(`user:${parsed.userId}`))) {
                authorizedProject = true;
              }
            }
          } catch {
            // Fail closed on corrupt KV JSON.
            authorizedProject = false;
          }
        }
      }
      // Lazy first-time registration: signature is verified, so we know the
      // event came from Vercel for our integration. Record the project so
      // subsequent lookups are O(1).
      if (authorizedProject && projectId) {
        await c.env.KV.put(
          projectAuthorizationKey(projectId),
          JSON.stringify({
            teamId: teamId ?? null,
            configurationId: configurationId ?? null,
            userId: userId ?? null,
            firstSeenAt: new Date().toISOString(),
          }),
        );
      }
    }

    // SSRF guard. Custom hosts (e.g. `preview.acme.com`) are accepted only when
    // the project is authorized (KV install record present); `*.vercel.app` is
    // always allowed. Private/loopback/link-local hosts are always rejected.
    if (!isAllowedPreviewUrl(decision.previewUrl, { authorizedProject })) {
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
      if (deliveryId && c.env?.KV) {
        await c.env.KV.put(`delivery:${deliveryId}`, '1', {
          expirationTtl: DELIVERY_ID_TTL_SECONDS,
        });
      }
      return c.json({ triggered: true, runId: run.id, previewUrl: decision.previewUrl });
    } catch (err) {
      return c.json({ triggered: false, error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  return app;
}

export default createVercelApp();
