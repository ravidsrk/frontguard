/**
 * GitHub App HTTP handler (Task 7.2).
 *
 * - `POST /webhook` — receives GitHub events:
 *     - `pull_request`: creates an in-progress Check Run and triggers a
 *       Frontguard run via the Cloud API (passing per-repo config overrides).
 *     - `installation` / `installation_repositories`: bootstraps a default
 *       `frontguard.config.ts` PR for repos that lack one.
 * - `POST /runs/:checkRunId/complete` — completion callback the Cloud API hits
 *   when a run finishes; updates the Check Run to `completed`.
 * - `GET /health`   — health check.
 *
 * @module handler
 */

import { Hono } from 'hono';
import {
  verifyGitHubSignature,
  decidePullRequest,
  decideInstallation,
  buildCheckRunPayload,
  type PullRequestEvent,
  type InstallationEvent,
  type CheckConclusion,
} from './webhook.js';
import {
  createAppJwt,
  getInstallationToken,
  createCheckRun,
  updateCheckRun,
  getInstallationRepos,
  getRepoConfig,
  bootstrapConfigPr,
} from './github-api.js';

export interface GitHubAppEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  FRONTGUARD_API_URL?: string;
  FRONTGUARD_API_KEY?: string;
  /**
   * Shared secret the Cloud API presents (as `Authorization: Bearer <secret>`)
   * when calling the run-completion callback. Required to complete check runs.
   */
  FRONTGUARD_CALLBACK_SECRET?: string;
}

/** Constant-time string comparison to avoid leaking secrets via timing. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mints an installation token from app credentials. Throws if not configured. */
async function installationToken(env: GitHubAppEnv, installationId: number): Promise<string> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials not configured');
  }
  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  return getInstallationToken(jwt, installationId);
}

export function createGitHubApp() {
  const app = new Hono<{ Bindings: GitHubAppEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'github-app' }));

  app.post('/webhook', async (c) => {
    const env = c.env ?? {};
    const raw = await c.req.text();
    const event = c.req.header('x-github-event');
    const signature = c.req.header('x-hub-signature-256') ?? null;

    // Fail closed: a missing webhook secret is a fatal misconfiguration, not a
    // licence to skip verification. Reject all webhooks until it is configured.
    if (!env.GITHUB_WEBHOOK_SECRET) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }
    const valid = await verifyGitHubSignature(raw, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);

    if (event === 'ping') return c.json({ ok: true, pong: true });

    // ── Installation events → bootstrap default config PRs ──────────────────
    if (event === 'installation' || event === 'installation_repositories') {
      let instPayload: InstallationEvent;
      try {
        instPayload = JSON.parse(raw) as InstallationEvent;
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      const instDecision = decideInstallation(instPayload);
      if (!instDecision.bootstrap) {
        return c.json({ handled: true, bootstrapped: false, reason: instDecision.reason });
      }
      if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
        return c.json({ handled: true, bootstrapped: false, reason: 'GitHub App credentials not configured' });
      }

      const opened: string[] = [];
      const skipped: string[] = [];
      try {
        const token = await installationToken(env, instDecision.installationId!);
        const repos = await getInstallationRepos(token);
        for (const repo of repos) {
          try {
            const pr = await bootstrapConfigPr(token, repo);
            if (pr) opened.push(repo.full_name);
            else skipped.push(repo.full_name);
          } catch (err) {
            console.warn(
              `[github-app] Bootstrap failed for ${repo.full_name}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      } catch (err) {
        return c.json(
          { handled: true, bootstrapped: false, error: err instanceof Error ? err.message : String(err) },
          502,
        );
      }
      return c.json({ handled: true, bootstrapped: true, opened, skipped });
    }

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

    // If GitHub App credentials are present, create an in-progress Check Run
    // and read any per-repo config overrides.
    let checkRunId: number | undefined;
    let repoConfig: { path: string; format: string; content: string } | null = null;
    if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && decision.installationId) {
      try {
        const token = await installationToken(env, decision.installationId);
        const check = await createCheckRun(
          token,
          decision.owner!,
          decision.repo!,
          buildCheckRunPayload({ commitSha: decision.commitSha!, status: 'in_progress' }),
        );
        checkRunId = check.id;
        // Per-repo overrides read from the PR head ref.
        repoConfig = await getRepoConfig(
          token,
          decision.owner!,
          decision.repo!,
          payload.pull_request.head.ref,
        );
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
          body: JSON.stringify({
            url: payload.pull_request.html_url,
            github: {
              owner: decision.owner,
              repo: decision.repo,
              commitSha: decision.commitSha,
              prNumber: decision.prNumber,
            },
            installationId: decision.installationId,
            checkRunId,
            config: repoConfig,
          }),
        });
        const data = (await res.json()) as { id?: string };
        return c.json({
          handled: true,
          triggered: true,
          runId: data.id,
          checkRunId,
          config: repoConfig?.path ?? null,
        });
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
      config: repoConfig?.path ?? null,
    });
  });

  // ── Completion callback the Cloud API hits when a run finishes ────────────
  // POST /runs/:checkRunId/complete
  //   { owner, repo, commitSha, installationId, conclusion, summary?,
  //     regressions?, warnings?, total?, detailsUrl? }
  app.post('/runs/:checkRunId/complete', async (c) => {
    const env = c.env ?? {};

    // Authenticate the caller (the Cloud API) with a shared bearer secret.
    // Fail closed if the secret is not configured: without it, anyone could
    // forge check-run conclusions on any commit using the app's credentials.
    if (!env.FRONTGUARD_CALLBACK_SECRET) {
      return c.json({ error: 'Callback secret not configured' }, 500);
    }
    const auth = c.req.header('authorization') ?? '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!presented || !timingSafeEqualStr(presented, env.FRONTGUARD_CALLBACK_SECRET)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const checkRunId = Number(c.req.param('checkRunId'));
    if (!Number.isInteger(checkRunId) || checkRunId <= 0) {
      return c.json({ error: 'Invalid checkRunId' }, 400);
    }

    let body: {
      owner?: string;
      repo?: string;
      commitSha?: string;
      installationId?: number;
      conclusion?: CheckConclusion;
      summary?: string;
      regressions?: number;
      warnings?: number;
      total?: number;
      detailsUrl?: string;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.owner || !body.repo || !body.commitSha || !body.installationId) {
      return c.json({ error: 'Missing owner/repo/commitSha/installationId' }, 400);
    }
    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
      return c.json({ error: 'GitHub App credentials not configured' }, 500);
    }

    const payload = buildCheckRunPayload({
      commitSha: body.commitSha,
      status: 'completed',
      conclusion: body.conclusion,
      regressions: body.regressions,
      warnings: body.warnings,
      total: body.total,
      detailsUrl: body.detailsUrl,
    });
    // Allow the Cloud API to supply a richer summary.
    if (body.summary && payload.output && typeof payload.output === 'object') {
      (payload.output as Record<string, unknown>).summary = body.summary;
    }

    try {
      const token = await installationToken(env, body.installationId);
      await updateCheckRun(token, body.owner, body.repo, checkRunId, payload);
      return c.json({ completed: true, checkRunId, conclusion: payload.conclusion });
    } catch (err) {
      return c.json(
        { completed: false, error: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  });

  return app;
}

export default createGitHubApp();
