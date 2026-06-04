/**
 * Slack request signature verification.
 *
 * Slack signs every request with `X-Slack-Signature: v0=<hmac>` where the HMAC
 * is SHA-256 over `v0:<timestamp>:<rawBody>` keyed by the app's signing secret.
 * We also enforce a freshness window on `X-Slack-Request-Timestamp` to defeat
 * replay. Pure and dependency-free (Web Crypto), so it runs on Workers.
 *
 * @module verify
 */

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyOptions {
  /** Injectable SubtleCrypto for tests. */
  subtle?: SubtleCrypto;
  /** Current time in ms (injectable for tests). */
  nowMs?: number;
  /** Allowed clock skew / replay window in seconds. Default 300 (5 min). */
  toleranceSec?: number;
}

/**
 * Verifies a Slack request signature.
 *
 * @param rawBody - The exact raw request body.
 * @param timestampHeader - Value of `X-Slack-Request-Timestamp` (unix seconds).
 * @param signatureHeader - Value of `X-Slack-Signature` (`v0=<hex>`).
 * @param signingSecret - The app signing secret.
 */
export async function verifySlackSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  signingSecret: string,
  options: VerifyOptions = {},
): Promise<boolean> {
  if (!timestampHeader || !signatureHeader || !signatureHeader.startsWith('v0=')) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const tolerance = options.toleranceSec ?? 300;
  if (Math.abs(nowSec - ts) > tolerance) return false; // stale → replay guard

  const subtle = options.subtle ?? crypto.subtle;
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestampHeader}:${rawBody}`));
  const expected = 'v0=' + Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, signatureHeader);
}
