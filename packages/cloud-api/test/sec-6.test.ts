/**
 * SEC-6 — production mode is explicit; misconfigured prod fails closed.
 */
import { describe, it, expect } from 'vitest';
import { app } from '../src/index.js';
import { sessionSecret, SessionSecretMissingError } from '../src/auth/session.js';
import { isProduction, isProductionMisconfigured } from '../src/db/factory.js';
import type { D1Database } from '../src/db/d1-store.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';
import { migrate } from '../src/db/migrate.js';
import { hashKey } from '../src/auth/keys.js';

const STRONG_SECRET = 'a'.repeat(40);

describe('isProduction (SEC-6)', () => {
  it('is false when only a DB binding is present', () => {
    expect(isProduction({ DB: {} as D1Database })).toBe(false);
  });

  it('is true only when ENVIRONMENT=production', () => {
    expect(isProduction({ ENVIRONMENT: 'production' })).toBe(true);
    expect(isProduction({ ENVIRONMENT: 'staging' })).toBe(false);
    expect(isProduction(undefined)).toBe(false);
  });

  it('flags production without DB as misconfigured', () => {
    expect(isProductionMisconfigured({ ENVIRONMENT: 'production' })).toBe(true);
    expect(
      isProductionMisconfigured({
        ENVIRONMENT: 'production',
        DB: {} as D1Database,
      }),
    ).toBe(false);
  });
});

describe('production misconfiguration — fail closed (SEC-6)', () => {
  const prodNoDb = { ENVIRONMENT: 'production' as const };

  it('/v1 rejects arbitrary bearer tokens with 503, not dev-auth-open', async () => {
    const res = await app.request(
      '/v1/usage',
      { headers: { Authorization: 'Bearer any-dev-token' } },
      prodNoDb,
    );
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/DB binding missing/i);
  });

  it('/dashboard fails closed before session handling', async () => {
    const res = await app.request('/dashboard', {}, prodNoDb);
    expect(res.status).toBe(503);
  });

  it('sessionSecret throws in production even without DB (backstop)', () => {
    expect(() => sessionSecret(prodNoDb)).toThrow(SessionSecretMissingError);
  });

  it('rejects dev-style tokens in production when DB is present (401, not dev-open)', async () => {
    const { db, raw } = createNodeSqliteD1();
    await migrate(db);

    const res = await app.request(
      '/v1/usage',
      { headers: { Authorization: 'Bearer demo-key' } },
      { ENVIRONMENT: 'production', DB: db, DASHBOARD_SESSION_SECRET: STRONG_SECRET },
    );
    expect(res.status).toBe(401);
    raw.close();
  });

  it('accepts a stored API key in production when DB is present', async () => {
    const { db, raw } = createNodeSqliteD1();
    await migrate(db);

    const plaintext = 'fg_prodkey_abcdef0123456789';
    const keyHash = await hashKey(plaintext);
    await db
      .prepare('INSERT INTO users (id, plan, created_at) VALUES (?, ?, ?)')
      .bind('u1', 'free', new Date().toISOString())
      .run();
    await db
      .prepare('INSERT INTO api_keys (key_hash, user_id, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(keyHash, 'u1', 'CI', new Date().toISOString())
      .run();

    const res = await app.request(
      '/v1/usage',
      { headers: { Authorization: `Bearer ${plaintext}` } },
      { ENVIRONMENT: 'production', DB: db, DASHBOARD_SESSION_SECRET: STRONG_SECRET },
    );
    expect(res.status).toBe(200);
    raw.close();
  });
});