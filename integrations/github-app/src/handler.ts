/**
 * GitHub App HTTP handler (Task 7.2).
 *
 * - `POST /webhook` — receives GitHub events:
 *     - `pull_request`: creates an in-progress Check Run, reads repo config from
 *       `base.ref`, and triggers a Frontguard run via the Cloud API.
 *     - `installation` / `installation_repositories`: bootstraps a default
 *       `frontguard.config.ts` PR for repos that lack one.
 *     - `status` / `deployment_status`: caches validated preview URLs and
 *       resumes pending PR runs.
 * - `POST /runs/:checkRunId/complete` — authenticated completion callback from
 *   the Cloud API; validates inputs + server-side checkRunId binding before
 *   updating the Check Run to `completed`.
 * - `GET /health`   — health check.
 *
 * @module handler
 */

import { Hono } from 'hono';
import {
  verifyGitHubSignature,
  timingSafeEqual,
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
import {
  inferPreviewUrl,
  previewUrlFromCommitStatus,
  previewUrlFromDeploymentStatus,
  assertSafePreviewUrl,
  parseSafePreviewUrl,
  type CommitStatusEvent,
  type DeploymentStatusEvent,
  type InferredPreviewUrl,
} from './preview-url.js';

/** Minimal KV binding (Cloudflare Workers KV or compatible test stub). */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface GitHubAppEnv {
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  FRONTGUARD_API_URL?: string;
  /**
   * API key for explicit single-tenant self-hosted deployments. Only used when
   * `FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID` matches the webhook's
   * `installation.id` so a single key is never shared across untrusted tenants.
   */
  FRONTGUARD_API_KEY?: string;
  /**
   * Explicit single-tenant installation ID bound to `FRONTGUARD_API_KEY`.
   */
  FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID?: string;
  /**
   * Optional JSON map of `{ "<installationId>": "<apiKey>" }` for multi-tenant
   * per-installation credentials when KV is not used.
   */
  FRONTGUARD_INSTALLATION_KEYS?: string;
  /**
   * Shared service-to-service secret exchanged with the Cloud API:
   * - Sent on `POST /v1/run` as `X-Frontguard-Callback-Secret` so Cloud API
   *   accepts `checkRunId` / `installationId` linkage only from `github-app`.
   * - Verified on `POST /runs/:checkRunId/complete` as `Authorization: Bearer`.
   */
  FRONTGUARD_CALLBACK_SECRET?: string;
  /**
   * Optional URL template used when no provider (Vercel/Netlify/Cloudflare)
   * event has been observed yet for the PR's head commit. Supports `{owner}`,
   * `{repo}`, `{prNumber}`, `{commitSha}`, `{commitShortSha}`, and `{branch}`.
   */
  FRONTGUARD_PREVIEW_URL_TEMPLATE?: string;
  /**
   * Set to `"true"` to opt into running checks on fork PRs. Disabled by default.
   */
  FRONTGUARD_ALLOW_FORK_PRS?: string;
  /**
   * Optional Workers KV namespace for durable preview-URL cache, pending PRs,
   * Check Run bindings, and per-installation credentials
   * (`installation:<id>:credentials`).
   */
  KV?: KVNamespace;
}

const MAX_WEBHOOK_BODY_BYTES = 1_048_576; // 1 MiB
const MAX_CALLBACK_BODY_BYTES = 65_536; // 64 KiB
const CLOUD_API_TIMEOUT_MS = 15_000;
const PREVIEW_TTL_MS = 30 * 60_000;
const PREVIEW_TTL_SEC = 30 * 60;
const BINDING_TTL_MS = 24 * 60 * 60_000;
const BINDING_TTL_SEC = 24 * 60 * 60;
const MAX_PREVIEW_CACHE_ENTRIES = 500;
const MAX_BINDING_CACHE_ENTRIES = 1_000;

const GITHUB_SLUG_RE = /^[a-zA-Z0-9._-]+$/;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;
const VALID_CONCLUSIONS = new Set<CheckConclusion>([
  'success',
  'failure',
  'neutral',
  'action_required',
]);

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/** Bounded in-memory Map with TTL expiration and oldest-first eviction. */
class BoundedTtlMap<V> {
  private readonly store = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): V | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    const now = Date.now();
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      for (const [k, v] of this.store) {
        if (now >= v.expiresAt) this.store.delete(k);
      }
    }
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

interface PendingPullRequest {
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  branch: string;
  installationId?: number;
  checkRunId?: number;
  repoConfig: { path: string; format: string; content: string } | null;
}

/** Server-side binding created when `github-app` registers a run for a Check Run. */
export interface CheckRunBinding {
  runId: string;
  owner: string;
  repo: string;
  commitSha: string;
  installationId: number;
  createdAt: string;
}

const previewUrlCache = new BoundedTtlMap<InferredPreviewUrl>(
  MAX_PREVIEW_CACHE_ENTRIES,
  PREVIEW_TTL_MS,
);
const pendingPrCache = new BoundedTtlMap<PendingPullRequest>(
  MAX_PREVIEW_CACHE_ENTRIES,
  PREVIEW_TTL_MS,
);
const checkRunBindingCache = new BoundedTtlMap<CheckRunBinding>(
  MAX_BINDING_CACHE_ENTRIES,
  BINDING_TTL_MS,
);

function previewCacheKey(owner: string, repo: string, sha: string): string {
  return `${owner}/${repo}@${sha}`;
}

function kvPreviewKey(owner: string, repo: string, sha: string): string {
  return `preview:${previewCacheKey(owner, repo, sha)}`;
}

function kvPendingKey(owner: string, repo: string, sha: string): string {
  return `pending:${previewCacheKey(owner, repo, sha)}`;
}

function kvCheckRunKey(checkRunId: number): string {
  return `checkrun:${checkRunId}`;
}

async function deleteKvKey(kv: KVNamespace, key: string): Promise<void> {
  if (typeof kv.delete === 'function') {
    await kv.delete(key);
  } else {
    await kv.put(key, '', { expirationTtl: 60 });
  }
}

async function rememberPendingPr(env: GitHubAppEnv, pending: PendingPullRequest): Promise<void> {
  const key = previewCacheKey(pending.owner, pending.repo, pending.commitSha);
  pendingPrCache.set(key, pending);
  if (env.KV) {
    await env.KV.put(kvPendingKey(pending.owner, pending.repo, pending.commitSha), JSON.stringify(pending), {
      expirationTtl: PREVIEW_TTL_SEC,
    });
  }
}

async function peekPendingPr(
  env: GitHubAppEnv,
  owner: string,
  repo: string,
  sha: string,
): Promise<PendingPullRequest | null> {
  const cached = pendingPrCache.get(previewCacheKey(owner, repo, sha));
  if (cached) return cached;
  if (env.KV) {
    const raw = await env.KV.get(kvPendingKey(owner, repo, sha));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PendingPullRequest;
        if (parsed && parsed.owner && parsed.repo && parsed.commitSha) {
          pendingPrCache.set(previewCacheKey(owner, repo, sha), parsed);
          return parsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function deletePendingPr(env: GitHubAppEnv, owner: string, repo: string, sha: string): Promise<void> {
  pendingPrCache.delete(previewCacheKey(owner, repo, sha));
  if (env.KV) {
    await deleteKvKey(env.KV, kvPendingKey(owner, repo, sha));
  }
}

/**
 * Records a provider-observed preview URL for later lookup by the PR handler.
 * Exported for tests.
 */
export function rememberPreviewUrl(
  owner: string,
  repo: string,
  sha: string,
  preview: InferredPreviewUrl,
): void {
  previewUrlCache.set(previewCacheKey(owner, repo, sha), preview);
}

async function rememberPreviewUrlDurable(
  env: GitHubAppEnv,
  owner: string,
  repo: string,
  sha: string,
  preview: InferredPreviewUrl,
): Promise<void> {
  rememberPreviewUrl(owner, repo, sha, preview);
  if (env.KV) {
    await env.KV.put(kvPreviewKey(owner, repo, sha), JSON.stringify(preview), {
      expirationTtl: PREVIEW_TTL_SEC,
    });
  }
}

/** Look up a previously-observed preview URL from the isolate cache. */
export function recallPreviewUrl(
  owner: string,
  repo: string,
  sha: string,
): InferredPreviewUrl | null {
  return previewUrlCache.get(previewCacheKey(owner, repo, sha));
}

async function recallPreviewUrlDurable(
  env: GitHubAppEnv,
  owner: string,
  repo: string,
  sha: string,
): Promise<InferredPreviewUrl | null> {
  const cached = recallPreviewUrl(owner, repo, sha);
  if (cached) return cached;
  if (env.KV) {
    const raw = await env.KV.get(kvPreviewKey(owner, repo, sha));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as InferredPreviewUrl;
        if (parsed && typeof parsed.url === 'string' && typeof parsed.source === 'string') {
          rememberPreviewUrl(owner, repo, sha, parsed);
          return parsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function rememberCheckRunBinding(
  env: GitHubAppEnv,
  checkRunId: number,
  binding: CheckRunBinding,
): Promise<void> {
  checkRunBindingCache.set(String(checkRunId), binding);
  if (env.KV) {
    await env.KV.put(kvCheckRunKey(checkRunId), JSON.stringify(binding), {
      expirationTtl: BINDING_TTL_SEC,
    });
  }
}

/** Look up a server-side Check Run binding (exported for tests). */
export async function recallCheckRunBinding(
  checkRunId: number,
  env?: GitHubAppEnv,
): Promise<CheckRunBinding | null> {
  const cached = checkRunBindingCache.get(String(checkRunId));
  if (cached) return cached;
  if (env?.KV) {
    const raw = await env.KV.get(kvCheckRunKey(checkRunId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CheckRunBinding;
        if (parsed && parsed.runId && parsed.owner && parsed.repo && parsed.commitSha) {
          checkRunBindingCache.set(String(checkRunId), parsed);
          return parsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function deleteCheckRunBinding(env: GitHubAppEnv, checkRunId: number): Promise<void> {
  checkRunBindingCache.delete(String(checkRunId));
  if (env.KV) {
    await deleteKvKey(env.KV, kvCheckRunKey(checkRunId));
  }
}

/** Test-only: wipes the in-memory caches between runs. */
export function clearPreviewUrlCache(): void {
  previewUrlCache.clear();
  pendingPrCache.clear();
  checkRunBindingCache.clear();
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

/** Validates a GitHub owner or repo slug (rejects traversal and invalid characters). */
function isValidGitHubSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 100 &&
    value !== '.' &&
    value !== '..' &&
    GITHUB_SLUG_RE.test(value)
  );
}

/**
 * Resolves the Frontguard Cloud API credential for a specific GitHub App
 * installation. Never shares a global `FRONTGUARD_API_KEY` across arbitrary
 * installations unless `FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID` explicitly
 * pins the deployment to that single installation.
 */
async function resolveInstallationApiKey(
  env: GitHubAppEnv,
  installationId: number | undefined,
): Promise<string | null> {
  if (installationId == null || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return null;
  }
  const idKey = String(installationId);

  if (env.KV) {
    const raw = await env.KV.get(`installation:${idKey}:credentials`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { apiKey?: unknown };
        if (typeof parsed.apiKey === 'string' && parsed.apiKey.trim().length > 0) {
          return parsed.apiKey.trim();
        }
      } catch {
        // Fail closed on corrupt credential record.
        return null;
      }
    }
  }

  if (env.FRONTGUARD_INSTALLATION_KEYS) {
    try {
      const map = JSON.parse(env.FRONTGUARD_INSTALLATION_KEYS) as Record<string, unknown>;
      if (map && typeof map === 'object') {
        const candidate = map[idKey];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate.trim();
        }
      }
    } catch {
      return null;
    }
  }

  if (
    env.FRONTGUARD_API_KEY &&
    env.FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID &&
    timingSafeEqual(idKey, env.FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID.trim())
  ) {
    return env.FRONTGUARD_API_KEY;
  }

  return null;
}

/** Mints an installation token from app credentials. Throws if not configured. */
async function installationToken(env: GitHubAppEnv, installationId: number): Promise<string> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials not configured');
  }
  const jwt = await createAppJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY);
  return getInstallationToken(jwt, installationId);
}

interface TriggerCloudRunResult {
  ok: true;
  runId: string;
}

interface TriggerCloudRunFailure {
  ok: false;
  status: 400 | 502;
  error: string;
}

async function triggerCloudRun(
  env: GitHubAppEnv,
  apiKey: string,
  params: {
    preview: InferredPreviewUrl;
    owner: string;
    repo: string;
    commitSha: string;
    prNumber: number;
    installationId?: number;
    checkRunId?: number;
    repoConfig: { path: string; format: string; content: string } | null;
  },
): Promise<TriggerCloudRunResult | TriggerCloudRunFailure> {
  try {
    await assertSafePreviewUrl(params.preview.url);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : 'Preview URL failed SSRF validation',
    };
  }

  const baseUrl = env.FRONTGUARD_API_URL!.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (env.FRONTGUARD_CALLBACK_SECRET) {
    headers['X-Frontguard-Callback-Secret'] = env.FRONTGUARD_CALLBACK_SECRET;
  }

  try {
    const res = await fetch(`${baseUrl}/v1/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: params.preview.url,
        previewSource: params.preview.source,
        projectId: `${params.owner}/${params.repo}`,
        github: {
          owner: params.owner,
          repo: params.repo,
          commitSha: params.commitSha,
          prNumber: params.prNumber,
        },
        installationId: params.installationId,
        checkRunId: params.checkRunId,
        config: params.repoConfig,
      }),
      signal: AbortSignal.timeout(CLOUD_API_TIMEOUT_MS),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || typeof data.id !== 'string' || !data.id) {
      return {
        ok: false,
        status: 502,
        error: data.error ?? `Cloud API returned HTTP ${res.status}`,
      };
    }

    if (
      params.checkRunId != null &&
      Number.isSafeInteger(params.checkRunId) &&
      params.checkRunId > 0 &&
      params.installationId != null &&
      Number.isSafeInteger(params.installationId) &&
      params.installationId > 0
    ) {
      await rememberCheckRunBinding(env, params.checkRunId, {
        runId: data.id,
        owner: params.owner,
        repo: params.repo,
        commitSha: params.commitSha,
        installationId: params.installationId,
        createdAt: new Date().toISOString(),
      });
    }

    return { ok: true, runId: data.id };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createGitHubApp() {
  const app = new Hono<{ Bindings: GitHubAppEnv }>();

  app.get('/health', (c) => c.json({ status: 'ok', integration: 'github-app' }));

  app.post('/webhook', async (c) => {
    const env = c.env ?? {};

    // Fail closed: a missing webhook secret is a fatal misconfiguration, not a
    // licence to skip verification. Reject all webhooks until it is configured.
    if (!env.GITHUB_WEBHOOK_SECRET) {
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    const raw = await readBodyWithLimit(c.req.raw, MAX_WEBHOOK_BODY_BYTES);
    if (raw === null) {
      return c.json({ error: 'Payload too large' }, 413);
    }

    const event = c.req.header('x-github-event');
    const signature = c.req.header('x-hub-signature-256') ?? null;

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

    // ── Vercel commit_status events → cache preview URL (+ trigger pending PR) ─
    if (event === 'status') {
      let statusEvent: CommitStatusEvent;
      try {
        statusEvent = JSON.parse(raw) as CommitStatusEvent;
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      const preview = previewUrlFromCommitStatus(statusEvent);
      if (preview && statusEvent.repository) {
        const owner = statusEvent.repository.owner.login;
        const repo = statusEvent.repository.name;
        await rememberPreviewUrlDurable(env, owner, repo, statusEvent.sha, preview);
        const pending = await peekPendingPr(env, owner, repo, statusEvent.sha);
        const apiKey = pending ? await resolveInstallationApiKey(env, pending.installationId) : null;
        if (pending && env.FRONTGUARD_API_URL && apiKey) {
          const result = await triggerCloudRun(env, apiKey, {
            preview,
            owner: pending.owner,
            repo: pending.repo,
            commitSha: pending.commitSha,
            prNumber: pending.prNumber,
            installationId: pending.installationId,
            checkRunId: pending.checkRunId,
            repoConfig: pending.repoConfig,
          });
          if (!result.ok) {
            return c.json(
              {
                handled: true,
                cached: true,
                triggered: false,
                source: preview.source,
                url: preview.url,
                error: result.error,
              },
              result.status,
            );
          }
          await deletePendingPr(env, owner, repo, statusEvent.sha);
          return c.json({
            handled: true,
            cached: true,
            triggered: true,
            runId: result.runId,
            checkRunId: pending.checkRunId,
            source: preview.source,
            url: preview.url,
            previewUrl: preview.url,
            previewSource: preview.source,
            config: pending.repoConfig?.path ?? null,
          });
        }
        return c.json({ handled: true, cached: true, source: preview.source, url: preview.url });
      }
      return c.json({ handled: true, cached: false, reason: 'No preview URL detected' });
    }

    // ── Netlify / Cloudflare deployment_status → cache preview URL (+ trigger pending PR) ─
    if (event === 'deployment_status') {
      let depEvent: DeploymentStatusEvent;
      try {
        depEvent = JSON.parse(raw) as DeploymentStatusEvent;
      } catch {
        return c.json({ error: 'Invalid JSON' }, 400);
      }
      const preview = previewUrlFromDeploymentStatus(depEvent);
      if (preview && depEvent.repository) {
        const owner = depEvent.repository.owner.login;
        const repo = depEvent.repository.name;
        const sha = depEvent.deployment.sha;
        await rememberPreviewUrlDurable(env, owner, repo, sha, preview);
        const pending = await peekPendingPr(env, owner, repo, sha);
        const apiKey = pending ? await resolveInstallationApiKey(env, pending.installationId) : null;
        if (pending && env.FRONTGUARD_API_URL && apiKey) {
          const result = await triggerCloudRun(env, apiKey, {
            preview,
            owner: pending.owner,
            repo: pending.repo,
            commitSha: pending.commitSha,
            prNumber: pending.prNumber,
            installationId: pending.installationId,
            checkRunId: pending.checkRunId,
            repoConfig: pending.repoConfig,
          });
          if (!result.ok) {
            return c.json(
              {
                handled: true,
                cached: true,
                triggered: false,
                source: preview.source,
                url: preview.url,
                error: result.error,
              },
              result.status,
            );
          }
          await deletePendingPr(env, owner, repo, sha);
          return c.json({
            handled: true,
            cached: true,
            triggered: true,
            runId: result.runId,
            checkRunId: pending.checkRunId,
            source: preview.source,
            url: preview.url,
            previewUrl: preview.url,
            previewSource: preview.source,
            config: pending.repoConfig?.path ?? null,
          });
        }
        return c.json({ handled: true, cached: true, source: preview.source, url: preview.url });
      }
      return c.json({ handled: true, cached: false, reason: 'No preview URL detected' });
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

    const decision = decidePullRequest(payload, {
      allowForkPrs: env.FRONTGUARD_ALLOW_FORK_PRS === 'true',
    });
    if (!decision.trigger) {
      return c.json({ handled: true, triggered: false, reason: decision.reason });
    }

    // If GitHub App credentials are present, create an in-progress Check Run
    // and read any per-repo config overrides strictly from the trusted base ref.
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
        // Read config strictly from the trusted base branch (never head.ref).
        repoConfig = await getRepoConfig(
          token,
          decision.owner!,
          decision.repo!,
          decision.baseRef ?? payload.pull_request.base.ref,
        );
      } catch (err) {
        // Non-fatal: continue to trigger the run even if the check fails.
        console.warn(`[github-app] Check Run creation failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const observed = await recallPreviewUrlDurable(
      env,
      decision.owner!,
      decision.repo!,
      decision.commitSha!,
    );
    const inferred = inferPreviewUrl({
      event: payload,
      template: env.FRONTGUARD_PREVIEW_URL_TEMPLATE,
      observed,
    });

    if (!inferred) {
      await rememberPendingPr(env, {
        owner: decision.owner!,
        repo: decision.repo!,
        prNumber: decision.prNumber!,
        commitSha: decision.commitSha!,
        branch: payload.pull_request.head.ref,
        installationId: decision.installationId,
        checkRunId,
        repoConfig,
      });
      return c.json({
        handled: true,
        triggered: false,
        reason:
          'No preview URL available yet — waiting for a Vercel/Netlify/Cloudflare ' +
          'deployment_status or configure FRONTGUARD_PREVIEW_URL_TEMPLATE.',
        checkRunId,
        config: repoConfig?.path ?? null,
      });
    }

    const apiKey = await resolveInstallationApiKey(env, decision.installationId);
    if (env.FRONTGUARD_API_URL && apiKey) {
      const result = await triggerCloudRun(env, apiKey, {
        preview: inferred,
        owner: decision.owner!,
        repo: decision.repo!,
        commitSha: decision.commitSha!,
        prNumber: decision.prNumber!,
        installationId: decision.installationId,
        checkRunId,
        repoConfig,
      });
      if (!result.ok) {
        return c.json(
          {
            handled: true,
            triggered: false,
            checkRunId,
            error: result.error,
          },
          result.status,
        );
      }
      return c.json({
        handled: true,
        triggered: true,
        runId: result.runId,
        checkRunId,
        previewUrl: inferred.url,
        previewSource: inferred.source,
        config: repoConfig?.path ?? null,
      });
    }

    return c.json({
      handled: true,
      triggered: false,
      reason: env.FRONTGUARD_API_URL
        ? 'No tenant API credential configured for this GitHub App installation'
        : 'Frontguard API not configured',
      checkRunId,
      previewUrl: inferred.url,
      previewSource: inferred.source,
      config: repoConfig?.path ?? null,
    });
  });

  // ── Completion callback the Cloud API hits when a run finishes ────────────
  // POST /runs/:checkRunId/complete
  //   { owner, repo, commitSha, installationId, runId?, conclusion?, summary?,
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
    if (!presented || !timingSafeEqual(presented, env.FRONTGUARD_CALLBACK_SECRET)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const raw = await readBodyWithLimit(c.req.raw, MAX_CALLBACK_BODY_BYTES);
    if (raw === null) {
      return c.json({ error: 'Payload too large' }, 413);
    }

    const checkRunIdParam = c.req.param('checkRunId');
    if (!/^\d+$/.test(checkRunIdParam)) {
      return c.json({ error: 'Invalid checkRunId' }, 400);
    }
    const checkRunId = Number(checkRunIdParam);
    if (!Number.isSafeInteger(checkRunId) || checkRunId <= 0) {
      return c.json({ error: 'Invalid checkRunId' }, 400);
    }

    let body: {
      owner?: unknown;
      repo?: unknown;
      commitSha?: unknown;
      installationId?: unknown;
      runId?: unknown;
      conclusion?: unknown;
      summary?: unknown;
      regressions?: unknown;
      warnings?: unknown;
      total?: unknown;
      detailsUrl?: unknown;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid payload' }, 400);
    }

    if (
      body.owner == null ||
      body.repo == null ||
      body.commitSha == null ||
      body.installationId == null
    ) {
      return c.json({ error: 'Missing owner/repo/commitSha/installationId' }, 400);
    }

    if (!isValidGitHubSlug(body.owner) || !isValidGitHubSlug(body.repo)) {
      return c.json({ error: 'Invalid owner or repo slug' }, 400);
    }
    if (typeof body.commitSha !== 'string' || !COMMIT_SHA_RE.test(body.commitSha)) {
      return c.json({ error: 'Invalid commitSha (expected 40-char hex SHA)' }, 400);
    }
    if (
      typeof body.installationId !== 'number' ||
      !Number.isSafeInteger(body.installationId) ||
      body.installationId <= 0
    ) {
      return c.json({ error: 'Invalid installationId' }, 400);
    }

    let conclusion: CheckConclusion | undefined;
    if (body.conclusion !== undefined) {
      if (typeof body.conclusion !== 'string' || !VALID_CONCLUSIONS.has(body.conclusion as CheckConclusion)) {
        return c.json({ error: 'Invalid conclusion' }, 400);
      }
      conclusion = body.conclusion as CheckConclusion;
    }

    let detailsUrl: string | undefined;
    if (body.detailsUrl !== undefined) {
      if (typeof body.detailsUrl !== 'string' || !parseSafePreviewUrl(body.detailsUrl)) {
        return c.json({ error: 'Invalid detailsUrl (must be a public https: URL)' }, 400);
      }
      detailsUrl = body.detailsUrl.trim();
    }

    if (body.runId !== undefined && (typeof body.runId !== 'string' || body.runId.length === 0)) {
      return c.json({ error: 'Invalid runId' }, 400);
    }

    // Verify server-side Check Run binding when present (or mandatory when durable KV is active).
    const binding = await recallCheckRunBinding(checkRunId, env);
    if (binding) {
      const ownerMatch = binding.owner.toLowerCase() === body.owner.toLowerCase();
      const repoMatch = binding.repo.toLowerCase() === body.repo.toLowerCase();
      const shaMatch = binding.commitSha.toLowerCase() === body.commitSha.toLowerCase();
      const installMatch = binding.installationId === body.installationId;
      const runMatch = body.runId === undefined || binding.runId === body.runId;
      if (!ownerMatch || !repoMatch || !shaMatch || !installMatch || !runMatch) {
        return c.json({ error: 'Check run binding mismatch' }, 403);
      }
    } else if (env.KV) {
      return c.json({ error: 'Unknown or expired check run binding' }, 403);
    }

    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
      return c.json({ error: 'GitHub App credentials not configured' }, 500);
    }

    const regressions =
      typeof body.regressions === 'number' && Number.isFinite(body.regressions)
        ? body.regressions
        : undefined;
    const warnings =
      typeof body.warnings === 'number' && Number.isFinite(body.warnings)
        ? body.warnings
        : undefined;
    const total =
      typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : undefined;

    const payload = buildCheckRunPayload({
      commitSha: body.commitSha,
      status: 'completed',
      conclusion,
      regressions,
      warnings,
      total,
      detailsUrl,
    });
    // Allow the Cloud API to supply a richer summary.
    if (typeof body.summary === 'string' && body.summary && payload.output && typeof payload.output === 'object') {
      (payload.output as Record<string, unknown>).summary = body.summary;
    }

    try {
      const token = await installationToken(env, body.installationId);
      await updateCheckRun(token, body.owner, body.repo, checkRunId, payload);
      await deleteCheckRunBinding(env, checkRunId);
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
