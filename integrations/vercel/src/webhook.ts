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
  payload: {
    deployment?: {
      id: string;
      url: string; // host without protocol, e.g. "my-app-abc123.vercel.app"
      name?: string;
      meta?: Record<string, string | undefined>;
      target?: string | null; // "production" | "staging" | null (preview)
    };
    project?: { id: string; name?: string };
    links?: { deployment?: string; project?: string };
  };
}

/** A decision about what to do with a webhook event. */
export interface WebhookDecision {
  trigger: boolean;
  reason: string;
  /** Fully-qualified preview URL to test (when `trigger` is true). */
  previewUrl?: string;
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

/** Constant-time string comparison to avoid timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Validates that a deployment preview URL is safe to forward to the Cloud API
 * for screenshotting, mitigating SSRF. A URL is allowed only when it uses
 * `https:` and its host ends with `.vercel.app` (or exactly `vercel.app`).
 *
 * @param previewUrl - The fully-qualified preview URL (e.g. `https://x.vercel.app`).
 */
export function isAllowedPreviewUrl(previewUrl: string | undefined): boolean {
  if (!previewUrl) return false;
  try {
    const url = new URL(previewUrl);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'vercel.app' || host.endsWith('.vercel.app');
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
  return {
    trigger: true,
    reason: 'Preview deployment succeeded',
    previewUrl: dep.url.startsWith('http') ? dep.url : `https://${dep.url}`,
    git: {
      commitSha: meta.githubCommitSha ?? meta.gitCommitSha,
      pullRequestId: meta.githubPrId ?? meta.githubCommitRef,
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
 * NOTE: The Cloud API `/v1/run` contract (see
 * `packages/cloud-api/src/index.ts`, `runRequestSchema`) does not yet model git
 * metadata, so we forward it under a dedicated `github` object. Fields:
 * - `owner`     — repository owner / org (e.g. "acme").
 * - `repo`      — repository slug (e.g. "web").
 * - `prNumber`  — pull request number (parsed from the Vercel deployment meta).
 * - `commitSha` — the deployed commit SHA.
 * - `branch`    — the git branch / ref the deployment was built from.
 */
export interface GitHubRunLinkage {
  owner?: string;
  repo?: string;
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

/**
 * Builds the `github` linkage object from the webhook-extracted git metadata.
 * Returns `undefined` when no useful linkage can be derived (so we don't send
 * an empty object to the API).
 */
export function buildGitHubLinkage(git?: WebhookDecision['git']): GitHubRunLinkage | undefined {
  if (!git) return undefined;
  const prNumber = git.pullRequestId != null ? Number(git.pullRequestId) : undefined;
  const linkage: GitHubRunLinkage = {
    owner: git.repoOwner,
    repo: git.repoSlug,
    prNumber: Number.isFinite(prNumber) ? prNumber : undefined,
    commitSha: git.commitSha,
    branch: git.branch,
  };
  // Drop entirely if nothing meaningful is present.
  if (
    linkage.owner == null &&
    linkage.repo == null &&
    linkage.prNumber == null &&
    linkage.commitSha == null &&
    linkage.branch == null
  ) {
    return undefined;
  }
  return linkage;
}

/**
 * Triggers a Frontguard run via the Cloud API. Returns the created run id.
 *
 * Forwards git metadata (repo owner/slug, PR number, commit SHA, branch) under
 * a `github` object so the Cloud API can post results back to the linked PR via
 * the github-pr reporter.
 */
export async function triggerRun(
  opts: TriggerRunOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; statusUrl: string }> {
  const github = buildGitHubLinkage(opts.git);
  const res = await fetchImpl(`${opts.apiBaseUrl}/v1/run`, {
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
  });
  if (!res.ok) {
    throw new Error(`Cloud API run request failed: ${res.status}`);
  }
  const data = (await res.json()) as { id: string; statusUrl: string };
  return { id: data.id, statusUrl: data.statusUrl };
}
