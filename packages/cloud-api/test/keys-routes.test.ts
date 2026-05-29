import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';

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
