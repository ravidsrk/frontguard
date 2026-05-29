/**
 * GitHub App HTTP handler (Task 7.2).
 *
 * - `POST /webhook` — receives GitHub events. On qualifying PR events it creates
 *   an in-progress Check Run and triggers a Frontguard run via the Cloud API.
 * - `GET /health`   — health check.
 *
 * @module handler
 */

import { Hono } from 'hono';
import {
  verifyGitHubSignature,
  decidePullRequest,
  buildCheckRunPayload,
  type PullRequestEvent,
} from './webhook.js';
import { createAppJwt, getInstallationToken, createCheckRun } from './github-api.js';

export interface GitHubAppEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  FRONTGUARD_API_URL?: string;
  FRONTGUARD_API_KEY?: string;
}

export function createGitHubApp() {
  const app = new Hono<{ Bindings: GitHubAppEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'github-app' }));

  app.post('/webhook', async (c) => {
    const env = c.env ?? {};
    const raw = await c.req.text();
    const event = c.req.header('x-github-event');
    const signature = c.req.header('x-hub-signature-256') ?? null;

    if (env.GITHUB_WEBHOOK_SECRET) {
      const valid = await verifyGitHubSignature(raw, signature, env.GITHUB_WEBHOOK_SECRET);
      if (!valid) return c.json({ error: 'Invalid signature' }, 401);
    }

    if (event === 'ping') return c.json({ ok: true, pong: true });
    if (event !== 'pull_request') {
      return c.json({ handled: false, reason: `Unhandled event: ${event}` });
    }

    let payload: PullRequestEvent;
    try {
      payload = JSON.parse(raw) as PullRequestEvent;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const decision = decidePullRequest(payload);
    if (!decision.trigger) {
      return c.json({ handled: true, triggered: false, reason: decision.reason });
    }

    // If GitHub App credentials are present, create an in-progress Check Run.
    let checkRunId: number | undefined;
    if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && decision.installationId) {
      try {
        const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
        const token = await getInstallationToken(jwt, decision.installationId);
        const check = await createCheckRun(
          token,
          decision.owner!,
          decision.repo!,
          buildCheckRunPayload({ commitSha: decision.commitSha!, status: 'in_progress' }),
        );
        checkRunId = check.id;
      } catch (err) {
        // Non-fatal: continue to trigger the run even if the check fails.
        console.warn(`[github-app] Check Run creation failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Trigger the Frontguard run via the Cloud API.
    if (env.FRONTGUARD_API_URL && env.FRONTGUARD_API_KEY) {
      try {
        const res = await fetch(`${env.FRONTGUARD_API_URL}/v1/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.FRONTGUARD_API_KEY}`,
          },
          body: JSON.stringify({ url: payload.pull_request.html_url }),
        });
        const data = (await res.json()) as { id?: string };
        return c.json({ handled: true, triggered: true, runId: data.id, checkRunId });
      } catch (err) {
        return c.json(
          { handled: true, triggered: false, error: err instanceof Error ? err.message : String(err) },
          502,
        );
      }
    }

    return c.json({
      handled: true,
      triggered: false,
      reason: 'Frontguard API not configured',
      checkRunId,
    });
  });

  return app;
}

export default createGitHubApp();
