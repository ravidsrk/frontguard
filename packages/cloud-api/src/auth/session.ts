/**
 * Browser session cookies for the monitoring dashboard (Task 6.3).
 *
 * The public API uses bearer API keys, but the human-facing dashboard needs a
 * cookie-based login after a GitHub OAuth round-trip. Sessions are stateless:
 * the cookie value is a signed token `userId.expiry.signature` where the
 * signature is an HMAC-SHA256 (via Web Crypto) over `userId.expiry`. No server
 * state is needed to verify — we just recompute the MAC and check expiry.
 *
 * The signing secret comes from the `DASHBOARD_SESSION_SECRET` binding, with a
 * dev fallback constant so local dev and tests work without configuration. The
 * secret is only ever used in-memory and never logged.
 *
 * @module auth/session
 */

import type { Bindings } from '../db/factory.js';

/** Cookie name carrying the signed dashboard session. */
export const SESSION_COOKIE = 'fg_session';

/** Session lifetime (7 days), in seconds. */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * Dev/test fallback secret. Used only when `DASHBOARD_SESSION_SECRET` is not
 * configured (local dev, tests). Production MUST set the real secret.
 */
export const DEV_SESSION_SECRET = 'frontguard-dev-session-secret';

/** Resolves the session signing secret from env, falling back for dev/tests. */
export function sessionSecret(env: Bindings | undefined): string {
  return env?.DASHBOARD_SESSION_SECRET || DEV_SESSION_SECRET;
}

/** Encodes bytes as URL-safe base64 (no padding). */
function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Computes the base64url HMAC-SHA256 signature of `data` with `secret`. */
async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(sig));
}

/** Constant-time-ish string comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Creates a signed session cookie value for `userId`.
 *
 * @param userId  - The authenticated user's id.
 * @param secret  - The signing secret.
 * @param maxAge  - Lifetime in seconds (default 7 days).
 * @param now     - Current time (injectable for tests).
 * @returns A value of the form `userId.expiry.signature`.
 */
export async function createSessionCookie(
  userId: string,
  secret: string,
  maxAge = SESSION_MAX_AGE,
  now = new Date(),
): Promise<string> {
  const expiry = Math.floor(now.getTime() / 1000) + maxAge;
  // encodeURIComponent does not escape `.`; do so explicitly so the userId can
  // never introduce extra `.` separators into the `userId.expiry.sig` format.
  const payload = `${encodeURIComponent(userId).replace(/\./g, '%2E')}.${expiry}`;
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Verifies a session cookie value and returns the userId, or `null` if the
 * cookie is malformed, tampered, or expired.
 *
 * @param cookieValue - The raw cookie value (`userId.expiry.signature`).
 * @param secret      - The signing secret.
 * @param now         - Current time (injectable for tests).
 */
export async function verifySessionCookie(
  cookieValue: string | undefined | null,
  secret: string,
  now = new Date(),
): Promise<string | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [encodedUser, expiryStr, signature] = parts;
  const payload = `${encodedUser}.${expiryStr}`;

  const expected = await sign(payload, secret);
  if (!safeEqual(signature, expected)) return null;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry)) return null;
  if (Math.floor(now.getTime() / 1000) >= expiry) return null;

  try {
    return decodeURIComponent(encodedUser);
  } catch {
    return null;
  }
}
