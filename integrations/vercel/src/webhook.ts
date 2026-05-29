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
    },
  };
}

/** Cloud API run request body. */
export interface TriggerRunOptions {
  apiBaseUrl: string;
  apiKey: string;
  previewUrl: string;
  /** Optional routes; defaults to ['/'] on the API side. */
  routes?: string[];
}

/**
 * Triggers a Frontguard run via the Cloud API. Returns the created run id.
 */
export async function triggerRun(
  opts: TriggerRunOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; statusUrl: string }> {
  const res = await fetchImpl(`${opts.apiBaseUrl}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      url: opts.previewUrl,
      routes: opts.routes?.map((path) => ({ path })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Cloud API run request failed: ${res.status}`);
  }
  const data = (await res.json()) as { id: string; statusUrl: string };
  return { id: data.id, statusUrl: data.statusUrl };
}
