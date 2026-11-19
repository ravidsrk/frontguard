import { isPrivateOrLoopbackHost } from '@frontguard/cloud-api/render-target';

/**
 * Vercel integration webhook handler (Task 7.1).
 *
 * Vercel sends webhook events (e.g. `deployment.created`,
 * `deployment.succeeded`) to a registered integration endpoint. On a successful
 * *preview* deployment, we trigger a Frontguard run against the preview URL via
 * the Cloud API; results are posted back to the linked PR by the API.
 *
 * Webhooks are authenticated with an HMAC SHA-1 signature over the raw body
 * using the integration's client secret (`x-vercel-signature` header).
 *
 * This module contains the pure, testable core: signature verification, event
 * parsing, and the decision of whether/what to trigger. The HTTP shell lives in
 * `handler.ts`.
 *
 * @module webhook
 */

/** Subset of a Vercel webhook payload we consume. */
export interface VercelWebhookPayload {
  /** Unique event/delivery id Vercel assigns to each webhook event. */
  id?: string;
  type: string;
  /** Epoch timestamp (milliseconds, or seconds) when Vercel created the event. */
  createdAt?: number;
  configurationId?: string | null;
  payload: {
    deployment?: {
      id: string;
      url: string; // host without protocol, e.g. "my-app-abc123.vercel.app"
      name?: string;
      meta?: Record<string, string | undefined>;
      target?: string | null; // "production" | "staging" | null (preview)
    };
    project?: { id: string; name?: string };
    projects?: Array<{ id: string } | string>;
    /** Integration configuration (present on personal & team installs and removal events). */
    configuration?: { id?: string; projects?: Array<{ id: string } | string> } | null;
    configurationId?: string | null;
    /** Owning user (present on personal-account installs/events). */
    user?: { id: string } | null;
    /** Owning team id (present on team-owned projects). */
    team?: { id: string } | null;
    teamId?: string | null;
    links?: { deployment?: string; project?: string };
  };
}

/** A decision about what to do with a webhook event. */
export interface WebhookDecision {
  trigger: boolean;
  reason: string;
  /** Fully-qualified preview URL to test (when `trigger` is true). */
  previewUrl?: string;
  /** The Vercel project id this event belongs to (used for authorization lookup). */
  projectId?: string;
  /** The Vercel team id, when the project is team-owned. */
  teamId?: string;
  /** The Vercel integration configuration id, when present on the webhook. */
  configurationId?: string;
  /** The Vercel user id, when present on personal-account webhooks. */
  userId?: string;
  /** Git metadata extracted from the deployment, if present. */
  git?: {
    commitSha?: string;
    pullRequestId?: string;
    repoOwner?: string;
    repoSlug?: string;
    branch?: string;
  };
}

/**
 * Verifies a Vercel webhook signature.
 *
 * Vercel signs the raw request body with HMAC-SHA1 using the integration
 * client secret and sends it in the `x-vercel-signature` header.
 *
 * @param rawBody - The raw (unparsed) request body.
 * @param signature - Value of the `x-vercel-signature` header.
 * @param secret - The integration client secret.
 * @param subtle - Web Crypto SubtleCrypto (injectable for tests).
 */
export async function verifyVercelSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<boolean> {
  if (!signature) return false;
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, signature);
}

/** Default webhook timestamp replay tolerance (5 minutes). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60_000;

/**
 * Checks whether a webhook timestamp (`payload.createdAt` or header value) is
 * within the allowed freshness window to mitigate replay attacks.
 */
export function isFreshWebhookTimestamp(
  timestamp: number | string | null | undefined,
  nowMs: number = Date.now(),
  toleranceMs: number = WEBHOOK_TIMESTAMP_TOLERANCE_MS,
): boolean {
  if (timestamp == null || timestamp === '') return false;
  const num = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (!Number.isFinite(num) || num <= 0) return false;
  // Normalize seconds vs milliseconds (Vercel sends epoch ms in `createdAt`).
  const tsMs = num < 1e12 ? num * 1000 : num;
  return Math.abs(nowMs - tsMs) <= toleranceMs;
}
/** Constant-time string comparison to avoid timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Options controlling which deployment URLs are accepted. */
export interface PreviewUrlOptions {
  /**
   * `true` when the project the deployment belongs to has been authorized via
   * the Vercel OAuth install flow (i.e. an integration record exists in KV).
   *
   * Trust model: a Vercel webhook is HMAC-signed with our integration's client
   * secret. A valid signature proves the event was emitted by Vercel for an
   * installation we own — i.e. the project's owner consented to give Frontguard
   * a deployment URL by installing the integration. Once consent is established,
   * we trust whatever host Vercel reports as the preview URL for that project
   * (custom domain, branch alias, or `*.vercel.app`).
   *
   * Defense-in-depth (always enforced, even when authorized):
   * - https scheme only
   * - block private / loopback / link-local hosts to mitigate cloud-metadata
   *   and lateral-movement SSRF (169.254.169.254, 127.0.0.1, 10.0.0.0/8, …)
   */
  authorizedProject?: boolean;
}

export { isPrivateOrLoopbackHost } from '@frontguard/cloud-api/render-target';

/**
 * Validates that a deployment preview URL is safe to forward to the Cloud API
 * for screenshotting.
 *
 * Two trust tiers:
 * - **Always allowed**: https URLs on `*.vercel.app`. Vercel owns this suffix;
 *   the host can't be a private address, and no install record is required.
 * - **Allowed for authorized projects**: when the project is authorized
 *   (see {@link PreviewUrlOptions.authorizedProject}), any https host is
 *   accepted *except* private/loopback/link-local addresses (SSRF guard).
 *   This is what makes custom-domain previews (e.g. `preview.acme.com`,
 *   branch aliases) work end-to-end.
 *
 * Without authorization, custom domains are rejected — that's the closed
 * default for the *.vercel.app-only mode the integration shipped with.
 *
 * @param previewUrl - The fully-qualified preview URL (e.g. `https://x.vercel.app`).
 * @param opts - Authorization context derived from the webhook handler.
 */
export function isAllowedPreviewUrl(
  previewUrl: string | undefined,
  opts: PreviewUrlOptions = {},
): boolean {
  if (!previewUrl) return false;
  try {
    const url = new URL(previewUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) return false;
    if (host === 'vercel.app' || host.endsWith('.vercel.app')) return true;
    return opts.authorizedProject === true;
  } catch {
    return false;
  }
}

/**
 * Decides whether a webhook event should trigger a Frontguard run.
 *
 * Rules:
 * - Only `deployment.succeeded` (or `deployment.ready`) events trigger.
 * - Only *preview* deployments (target is null/undefined) — never production.
 * - The deployment must expose a URL.
 */
export function decideFromWebhook(payload: VercelWebhookPayload): WebhookDecision {
  const triggerTypes = ['deployment.succeeded', 'deployment.ready'];
  if (!triggerTypes.includes(payload.type)) {
    return { trigger: false, reason: `Ignored event type: ${payload.type}` };
  }
  const dep = payload.payload.deployment;
  if (!dep) {
    return { trigger: false, reason: 'No deployment in payload' };
  }
  if (dep.target === 'production') {
    return { trigger: false, reason: 'Skipping production deployment' };
  }
  if (!dep.url) {
    return { trigger: false, reason: 'Deployment has no URL' };
  }

  const meta = dep.meta ?? {};
  const teamId = payload.payload.team?.id ?? payload.payload.teamId ?? undefined;
  const configurationId =
    payload.payload.configuration?.id ??
    payload.payload.configurationId ??
    payload.configurationId ??
    undefined;
  const userId = payload.payload.user?.id ?? undefined;
  return {
    trigger: true,
    reason: 'Preview deployment succeeded',
    previewUrl: dep.url.startsWith('http') ? dep.url : `https://${dep.url}`,
    projectId: payload.payload.project?.id,
    teamId: teamId ?? undefined,
    configurationId: configurationId ?? undefined,
    userId,
    git: {
      commitSha: meta.githubCommitSha ?? meta.gitCommitSha,
      pullRequestId: meta.githubPrId,
      repoOwner: meta.githubOrg ?? meta.githubCommitOrg,
      repoSlug: meta.githubRepo ?? meta.githubCommitRepo,
      branch: meta.githubCommitRef ?? meta.gitCommitRef,
    },
  };
}

/**
 * GitHub PR linkage forwarded to the Cloud API so it can post results back as a
 * PR comment (via the existing github-pr reporter).
 *
 * Cloud API's `/v1/run` schema requires both `owner` and `repo` strings whenever
 * `github` is present, so non-GitHub deploys (missing `owner` or `repo`) omit
 * the `github` field entirely.
 */
export interface GitHubRunLinkage {
  owner: string;
  repo: string;
  prNumber?: number;
  commitSha?: string;
  branch?: string;
}

/** Cloud API run request body. */
export interface TriggerRunOptions {
  apiBaseUrl: string;
  apiKey: string;
  previewUrl: string;
  /** Optional routes; defaults to ['/'] on the API side. */
  routes?: string[];
  /** Git metadata forwarded so the API can post a PR comment. */
  git?: WebhookDecision['git'];
}

const CLOUD_API_TIMEOUT_MS = 15_000;

/**
 * Builds the `github` linkage object from the webhook-extracted git metadata.
 * Returns `undefined` for non-GitHub deployments (missing `repoOwner` or
 * `repoSlug`) so the Cloud API never rejects the run with HTTP 400.
 */
export function buildGitHubLinkage(git?: WebhookDecision['git']): GitHubRunLinkage | undefined {
  if (!git) return undefined;
  const owner = git.repoOwner?.trim();
  const repo = git.repoSlug?.trim();
  if (!owner || !repo) return undefined;

  const parsedPr = git.pullRequestId != null ? Number(git.pullRequestId) : undefined;
  const prNumber =
    parsedPr !== undefined && Number.isInteger(parsedPr) && parsedPr > 0 ? parsedPr : undefined;

  return {
    owner,
    repo,
    prNumber,
    commitSha: git.commitSha,
    branch: git.branch,
  };
}

/**
 * Triggers a Frontguard run via the Cloud API. Returns the created run id.
 *
 * Forwards git metadata (repo owner/slug, PR number, commit SHA, branch) under
 * a `github` object only when GitHub repo linkage (`owner` and `repo`) is present.
 */
export async function triggerRun(
  opts: TriggerRunOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; statusUrl: string }> {
  const github = buildGitHubLinkage(opts.git);
  const res = await fetchImpl(`${opts.apiBaseUrl.replace(/\/+$/, '')}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      url: opts.previewUrl,
      routes: opts.routes?.map((path) => ({ path })),
      ...(github ? { github } : {}),
    }),
    signal: AbortSignal.timeout(CLOUD_API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Cloud API run request failed: ${res.status}`);
  }
  const data = (await res.json()) as { id: string; statusUrl: string };
  return { id: data.id, statusUrl: data.statusUrl };
}
