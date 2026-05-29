import { describe, it, expect } from 'vitest';
import {
  createSessionCookie,
  verifySessionCookie,
  DEV_SESSION_SECRET,
  sessionSecret,
  SESSION_COOKIE,
} from '../src/auth/session.js';

const SECRET = DEV_SESSION_SECRET;

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

  it('sessionSecret falls back to the dev secret', () => {
    expect(sessionSecret(undefined)).toBe(DEV_SESSION_SECRET);
    expect(sessionSecret({ DASHBOARD_SESSION_SECRET: 'real' })).toBe('real');
  });

  it('exports the expected cookie name', () => {
    expect(SESSION_COOKIE).toBe('fg_session');
  });
});
