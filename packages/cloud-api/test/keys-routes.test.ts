import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';
import { hashKey, MAX_KEYS_PER_USER } from '../src/auth/keys.js';
import { migrate } from '../src/db/migrate.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';

const auth = (token = 'tok-user-a') => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

describe('/v1/keys (dev mode)', () => {
  beforeEach(() => resetMemoryStore());

  it('requires authorization', async () => {
    const res = await app.request('/v1/keys');
    expect(res.status).toBe(401);
  });

  it('mints a key and lists it (plaintext returned once)', async () => {
    const createRes = await app.request('/v1/keys', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'CI key' }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.apiKey).toMatch(/^fg_[0-9a-f]{48}$/);
    expect(created.name).toBe('CI key');

    const listRes = await app.request('/v1/keys', { headers: auth() });
    const list = await listRes.json();
    expect(list.total).toBe(1);
    expect(list.keys[0].name).toBe('CI key');
    // Plaintext is never returned in a listing.
    expect(JSON.stringify(list)).not.toContain(created.apiKey);
  });

  it('scopes keys per user', async () => {
    await app.request('/v1/keys', { method: 'POST', headers: auth('user-a'), body: '{}' });
    const listB = await app.request('/v1/keys', { headers: auth('user-b') });
    expect((await listB.json()).total).toBe(0);
  });

  it('deletes a key by id prefix', async () => {
    const createRes = await app.request('/v1/keys', { method: 'POST', headers: auth(), body: '{}' });
    const { id } = await createRes.json();
    const delRes = await app.request(`/v1/keys/${id}`, { method: 'DELETE', headers: auth() });
    expect((await delRes.json()).deleted).toBe(true);
    const listRes = await app.request('/v1/keys', { headers: auth() });
    expect((await listRes.json()).total).toBe(0);
  });

  // COST-3: per-user key cap rejects creation beyond the limit.
  it('rejects key creation when the per-user cap is reached', async () => {
    for (let i = 0; i < MAX_KEYS_PER_USER; i++) {
      const res = await app.request('/v1/keys', {
        method: 'POST',
        headers: auth('cap-user'),
        body: JSON.stringify({ name: `key-${i}` }),
      });
      expect(res.status).toBe(201);
    }

    const overRes = await app.request('/v1/keys', {
      method: 'POST',
      headers: auth('cap-user'),
      body: JSON.stringify({ name: 'one-too-many' }),
    });
    expect(overRes.status).toBe(429);
    const body = await overRes.json();
    expect(body.error).toMatch(/limit reached/i);
    expect(body.limit).toBe(MAX_KEYS_PER_USER);

    const listRes = await app.request('/v1/keys', { headers: auth('cap-user') });
    expect((await listRes.json()).total).toBe(MAX_KEYS_PER_USER);
  });
});

describe('/auth/github (not configured in dev)', () => {
  beforeEach(() => resetMemoryStore());

  it('returns 501 when OAuth env is missing', async () => {
    const res = await app.request('/auth/github');
    expect(res.status).toBe(501);
  });

  it('callback returns 501 without config', async () => {
    const res = await app.request('/auth/github/callback?code=x');
    expect(res.status).toBe(501);
  });
});

// IN-2 / P0-6 auth hardening: the legacy app/src/index.js shim accepted any
// Bearer token ≥10 chars. Now that the Hono entry is what deploys, any
// unknown token in production mode (D1 binding present) must 401, while a
// hashed-and-stored key returns 200.
describe('production auth — bearer tokens are validated against the store', () => {
  it('rejects a bogus 11-char Bearer with 401 even though the shim used to accept it', async () => {
    const { db, raw } = createSqliteD1();
    await migrate(db);

    const bogus = 'bogus-token'; // 11 chars — used to slip past the shim.
    const res = await app.request('/v1/usage', {
      headers: { Authorization: `Bearer ${bogus}` },
    }, { DB: db });
    expect(res.status).toBe(401);
    raw.close();
  });

  it('accepts a hashed-and-stored key', async () => {
    const { db, raw } = createSqliteD1();
    await migrate(db);

    // Seed a user + a real key hash so the production path resolves.
    const plaintext = 'fg_realkey_abcdef0123456789';
    const keyHash = await hashKey(plaintext);
    await db.prepare('INSERT INTO users (id, plan, created_at) VALUES (?, ?, ?)')
      .bind('u1', 'free', new Date().toISOString())
      .run();
    await db.prepare('INSERT INTO api_keys (key_hash, user_id, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(keyHash, 'u1', 'CI', new Date().toISOString())
      .run();

    const res = await app.request('/v1/usage', {
      headers: { Authorization: `Bearer ${plaintext}` },
    }, { DB: db });
    expect(res.status).toBe(200);
    raw.close();
  });
});

describe('per-user run isolation', () => {
  beforeEach(() => resetMemoryStore());

  it('user B cannot see user A run', async () => {
    const createRes = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    const { id } = await createRes.json();
    const bobRes = await app.request(`/v1/runs/${id}`, { headers: auth('bob') });
    expect(bobRes.status).toBe(404);
    const aliceRes = await app.request(`/v1/runs/${id}`, { headers: auth('alice') });
    expect(aliceRes.status).toBe(200);
  });
});
