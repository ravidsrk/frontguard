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

/**
 * Returns true if `host` resolves to a private, loopback, or link-local
 * address — i.e. one we never want to hit from a server-side fetcher.
 *
 * Hostnames are checked literally (no DNS lookup) — we only need to block
 * obvious SSRF targets passed inline. Production cloud-side fetchers are
 * expected to do their own DNS-time SSRF guarding.
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === '::1' || h === '[::1]') return true;
  if (h.startsWith('fe80:') || h.startsWith('[fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) {
    // fc00::/7 (unique local). Strip brackets for the check.
    const stripped = h.startsWith('[') ? h.slice(1, -1) : h;
    if (stripped.startsWith('fc') || stripped.startsWith('fd')) return true;
  }
  // IPv4 dotted-quad checks.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

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
  return {
    trigger: true,
    reason: 'Preview deployment succeeded',
    previewUrl: dep.url.startsWith('http') ? dep.url : `https://${dep.url}`,
    projectId: payload.payload.project?.id,
    teamId: teamId ?? undefined,
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
