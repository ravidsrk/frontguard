import { describe, it, expect } from 'vitest';
import {
  createSessionCookie,
  verifySessionCookie,
  INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD,
  sessionSecret,
  hasValidSessionSecret,
  MIN_SESSION_SECRET_LENGTH,
  SessionSecretMissingError,
  SESSION_COOKIE,
} from '../src/auth/session.js';
import type { Bindings } from '../src/db/factory.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';

const SECRET = INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD;

/** A production-like env — explicit ENVIRONMENT=production (SEC-6). */
function prodEnv(secret?: string): Bindings {
  return {
    ENVIRONMENT: 'production',
    DB: createSqliteD1().db,
    DASHBOARD_SESSION_SECRET: secret,
  };
}

describe('session cookie', () => {
  it('round-trips create → verify', async () => {
    const value = await createSessionCookie('user-123', SECRET);
    expect(value.split('.')).toHaveLength(3);
    const userId = await verifySessionCookie(value, SECRET);
    expect(userId).toBe('user-123');
  });

  it('preserves userIds containing special characters (demo: prefix)', async () => {
    const id = 'demo:abc.def';
    const value = await createSessionCookie(id, SECRET);
    expect(await verifySessionCookie(value, SECRET)).toBe(id);
  });

  it('rejects a tampered signature', async () => {
    const value = await createSessionCookie('user-123', SECRET);
    const parts = value.split('.');
    parts[2] = parts[2].slice(0, -2) + 'xy';
    expect(await verifySessionCookie(parts.join('.'), SECRET)).toBeNull();
  });

  it('rejects a tampered payload (userId swap)', async () => {
    const value = await createSessionCookie('user-123', SECRET);
    const parts = value.split('.');
    parts[0] = 'attacker';
    expect(await verifySessionCookie(parts.join('.'), SECRET)).toBeNull();
  });

  it('rejects a different secret', async () => {
    const value = await createSessionCookie('user-123', SECRET);
    expect(await verifySessionCookie(value, 'other-secret')).toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const issued = new Date('2026-01-01T00:00:00Z');
    const value = await createSessionCookie('user-123', SECRET, 60, issued);
    // Two minutes later → expired.
    const later = new Date('2026-01-01T00:02:00Z');
    expect(await verifySessionCookie(value, SECRET, later)).toBeNull();
    // Still valid 30s in.
    const within = new Date('2026-01-01T00:00:30Z');
    expect(await verifySessionCookie(value, SECRET, within)).toBe('user-123');
  });

  it('rejects malformed values', async () => {
    expect(await verifySessionCookie(undefined, SECRET)).toBeNull();
    expect(await verifySessionCookie('', SECRET)).toBeNull();
    expect(await verifySessionCookie('a.b', SECRET)).toBeNull();
    expect(await verifySessionCookie('a.b.c.d', SECRET)).toBeNull();
  });

  it('exports the expected cookie name', () => {
    expect(SESSION_COOKIE).toBe('fg_session');
  });
});

describe('sessionSecret — production fail-closed (sec-1, cloud-4)', () => {
  it('falls back to the insecure dev secret outside production', () => {
    expect(sessionSecret(undefined)).toBe(INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD);
    // A configured value still wins in dev, even if short.
    expect(sessionSecret({ DASHBOARD_SESSION_SECRET: 'real-dev-value' })).toBe('real-dev-value');
  });

  it('throws in production when DASHBOARD_SESSION_SECRET is unset', () => {
    expect(() => sessionSecret(prodEnv(undefined))).toThrow(SessionSecretMissingError);
  });

  it('throws in production when the secret is shorter than the minimum', () => {
    const short = 'x'.repeat(MIN_SESSION_SECRET_LENGTH - 1);
    expect(() => sessionSecret(prodEnv(short))).toThrow(SessionSecretMissingError);
  });

  it('returns the configured secret in production when it is long enough', () => {
    const strong = 'x'.repeat(MIN_SESSION_SECRET_LENGTH);
    expect(sessionSecret(prodEnv(strong))).toBe(strong);
  });

  it('never resolves to the public dev fallback in production', () => {
    const strong = 'y'.repeat(MIN_SESSION_SECRET_LENGTH);
    expect(sessionSecret(prodEnv(strong))).not.toBe(
      INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD,
    );
  });

  it('hasValidSessionSecret requires the secret to be set and >= 32 chars', () => {
    expect(hasValidSessionSecret(undefined)).toBe(false);
    expect(hasValidSessionSecret({ DASHBOARD_SESSION_SECRET: 'too-short' })).toBe(false);
    expect(
      hasValidSessionSecret({
        DASHBOARD_SESSION_SECRET: 'z'.repeat(MIN_SESSION_SECRET_LENGTH),
      }),
    ).toBe(true);
  });
});
