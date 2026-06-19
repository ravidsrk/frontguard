/**
 * Browser session cookies for the monitoring dashboard (Task 6.3).
 *
 * The public API uses bearer API keys, but the human-facing dashboard needs a
 * cookie-based login after a GitHub OAuth round-trip. Sessions are stateless:
 * the cookie value is a signed token `userId.expiry.signature` where the
 * signature is an HMAC-SHA256 (via Web Crypto) over `userId.expiry`. No server
 * state is needed to verify — we just recompute the MAC and check expiry.
 *
 * The signing secret comes from the `DASHBOARD_SESSION_SECRET` binding. In
 * production ({@link isProduction}) the secret is mandatory and the resolver
 * fails closed if it is missing or too short — we never sign cookies with a
 * public fallback. Only in dev/tests does a self-documenting insecure fallback
 * constant kick in so local work needs no configuration. The secret is only
 * ever used in-memory and never logged.
 *
 * @module auth/session
 */

import { isProduction, type Bindings } from '../db/factory.js';

/** Cookie name carrying the signed dashboard session. */
export const SESSION_COOKIE = 'fg_session';

/** Session lifetime (7 days), in seconds. */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * Minimum acceptable length, in characters, for a production session secret.
 * Anything shorter is treated as unconfigured and fails closed.
 */
export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Dev/test-only fallback secret. Used ONLY when `DASHBOARD_SESSION_SECRET` is
 * unset AND the runtime is not production (see {@link isProduction}). The name
 * is self-documenting by design: it ships in
 * the published source, so it must read as obviously unusable in production.
 * Its value mirrors its name so any accidental leak is instantly recognisable
 * as the insecure dev placeholder rather than a real secret.
 */
export const INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD =
  'INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD';

/**
 * Thrown by {@link sessionSecret} when running in production without a usable
 * `DASHBOARD_SESSION_SECRET`. The dashboard routes are guarded up front (see
 * `index.ts`) so they fail closed with a 503 before reaching this throw; this
 * is the backstop for any other caller (e.g. the OAuth callback) so a misconfig
 * can never silently sign cookies with a fallback secret.
 */
export class SessionSecretMissingError extends Error {
  constructor() {
    super('DASHBOARD_SESSION_SECRET is required in production (must be set and >= 32 chars)');
    this.name = 'SessionSecretMissingError';
  }
}

/**
 * Returns true when `env` carries a usable production session secret — set and
 * at least {@link MIN_SESSION_SECRET_LENGTH} characters. Used by the boot-time
 * dashboard guard in `index.ts` to decide whether to fail closed.
 */
export function hasValidSessionSecret(env: Bindings | undefined): boolean {
  const secret = env?.DASHBOARD_SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= MIN_SESSION_SECRET_LENGTH;
}

/**
 * Resolves the session signing secret from env.
 *
 * In production ({@link isProduction} — `ENVIRONMENT=production`) this
 * fails closed: if `DASHBOARD_SESSION_SECRET` is unset or shorter than
 * {@link MIN_SESSION_SECRET_LENGTH}, it throws {@link SessionSecretMissingError}
 * rather than signing cookies with a public fallback. In dev/tests it falls
 * back to {@link INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD}.
 */
export function sessionSecret(env: Bindings | undefined): string {
  const configured = env?.DASHBOARD_SESSION_SECRET;
  if (isProduction(env)) {
    if (!configured || configured.length < MIN_SESSION_SECRET_LENGTH) {
      throw new SessionSecretMissingError();
    }
    return configured;
  }
  return configured || INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD;
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
