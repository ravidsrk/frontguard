/**
 * GitHub App webhook core (Task 7.2).
 *
 * Pure, testable logic for the Frontguard GitHub App:
 * - HMAC-SHA256 signature verification (`x-hub-signature-256`).
 * - Event decisioning: which webhook events should trigger a Frontguard run.
 * - Check Run payload construction (GitHub Checks API).
 *
 * The HTTP shell + GitHub API calls live in `handler.ts` / `github-api.ts`.
 *
 * @module webhook
 */

/** Subset of a GitHub `pull_request` webhook payload we consume. */
export interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { ref: string };
    html_url: string;
  };
  repository: { name: string; owner: { login: string }; full_name: string };
  installation?: { id: number };
}

/** Subset of an `installation` webhook payload. */
export interface InstallationEvent {
  action: string;
  installation: { id: number; account: { login: string } };
  repositories?: Array<{ name: string; full_name: string }>;
}

/** A decision about a pull_request event. */
export interface PrDecision {
  trigger: boolean;
  reason: string;
  commitSha?: string;
  prNumber?: number;
  owner?: string;
  repo?: string;
  installationId?: number;
}

/**
 * Verifies a GitHub webhook signature (`x-hub-signature-256: sha256=<hmac>`).
 *
 * @param rawBody - Raw request body.
 * @param signatureHeader - Value of `x-hub-signature-256`.
 * @param secret - The webhook secret.
 * @param subtle - SubtleCrypto (injectable for tests).
 */
export async function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const provided = signatureHeader.slice('sha256='.length);
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, provided);
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Which PR actions warrant a (re-)run. */
const TRIGGER_ACTIONS = ['opened', 'synchronize', 'reopened', 'ready_for_review'];

/**
 * Decides whether a `pull_request` event should trigger a Frontguard run.
 */
export function decidePullRequest(event: PullRequestEvent): PrDecision {
  if (!TRIGGER_ACTIONS.includes(event.action)) {
    return { trigger: false, reason: `Ignored PR action: ${event.action}` };
  }
  const pr = event.pull_request;
  if (!pr?.head?.sha) {
    return { trigger: false, reason: 'No head SHA in payload' };
  }
  return {
    trigger: true,
    reason: `PR #${event.number} ${event.action}`,
    commitSha: pr.head.sha,
    prNumber: event.number,
    owner: event.repository.owner.login,
    repo: event.repository.name,
    installationId: event.installation?.id,
  };
}

/** GitHub Check Run conclusion values. */
export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'action_required';

/** Result summary used to build a Check Run. */
export interface CheckRunInput {
  commitSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: CheckConclusion;
  regressions?: number;
  warnings?: number;
  total?: number;
  detailsUrl?: string;
}

/**
 * Builds a GitHub Check Run API payload from a run summary.
 * Exposed for testing.
 */
export function buildCheckRunPayload(input: CheckRunInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: 'Frontguard Visual Regression',
    head_sha: input.commitSha,
    status: input.status,
  };
  if (input.detailsUrl) base.details_url = input.detailsUrl;

  if (input.status === 'completed') {
    const regressions = input.regressions ?? 0;
    const warnings = input.warnings ?? 0;
    const conclusion: CheckConclusion =
      input.conclusion ?? (regressions > 0 ? 'failure' : warnings > 0 ? 'neutral' : 'success');
    base.conclusion = conclusion;
    base.completed_at = new Date().toISOString();
    base.output = {
      title:
        regressions > 0
          ? `${regressions} visual regression(s) detected`
          : warnings > 0
            ? `${warnings} visual change(s) to review`
            : 'No visual regressions',
      summary:
        `Frontguard tested ${input.total ?? 0} page(s).\n\n` +
        `- ❌ Regressions: ${regressions}\n` +
        `- ⚠️ Warnings: ${warnings}\n` +
        `- ✅ Passed: ${Math.max(0, (input.total ?? 0) - regressions - warnings)}`,
    };
  } else {
    base.started_at = new Date().toISOString();
  }
  return base;
}
