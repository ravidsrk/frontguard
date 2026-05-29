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
  type VercelWebhookPayload,
} from './webhook.js';

export interface HandlerEnv {
  /** Vercel integration client secret (for signature verification). */
  VERCEL_CLIENT_SECRET?: string;
  /** Frontguard Cloud API base URL. */
  FRONTGUARD_API_URL?: string;
  /** Frontguard API key used to submit runs. */
  FRONTGUARD_API_KEY?: string;
}

export function createVercelApp() {
  const app = new Hono<{ Bindings: HandlerEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'vercel' }));

  app.get('/api/install', (c) =>
    c.json({
      message: 'Frontguard for Vercel — installation complete. Add FRONTGUARD_API_KEY to your project env.',
    }),
  );

  app.post('/api/webhook', async (c) => {
    const secret = c.env?.VERCEL_CLIENT_SECRET;
    const apiUrl = c.env?.FRONTGUARD_API_URL;
    const apiKey = c.env?.FRONTGUARD_API_KEY;

    const raw = await c.req.text();
    const signature = c.req.header('x-vercel-signature') ?? null;

    if (secret) {
      const valid = await verifyVercelSignature(raw, signature, secret);
      if (!valid) return c.json({ error: 'Invalid signature' }, 401);
    }

    let payload: VercelWebhookPayload;
    try {
      payload = JSON.parse(raw) as VercelWebhookPayload;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const decision = decideFromWebhook(payload);
    if (!decision.trigger || !decision.previewUrl) {
      return c.json({ triggered: false, reason: decision.reason });
    }

    if (!apiUrl || !apiKey) {
      return c.json(
        { triggered: false, reason: 'Frontguard API not configured (FRONTGUARD_API_URL / FRONTGUARD_API_KEY)' },
        200,
      );
    }

    try {
      const run = await triggerRun({ apiBaseUrl: apiUrl, apiKey, previewUrl: decision.previewUrl });
      return c.json({ triggered: true, runId: run.id, previewUrl: decision.previewUrl });
    } catch (err) {
      return c.json({ triggered: false, error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  return app;
}

export default createVercelApp();
