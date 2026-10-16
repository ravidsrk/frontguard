import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';
import { resetCasMemoryStore, type CasR2Bucket } from '../src/routes/cas.js';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Cloud CAS routes (/v1/cas)', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetCasMemoryStore();
  });

  const authJson = (token = 'user-a') => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const authBinary = (token = 'user-a') => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'image/png',
  });

  const pngBytes1 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const pngBytes2 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 5, 6, 7, 8]);
  const hash1 = sha256(pngBytes1);
  const hash2 = sha256(pngBytes2);

  it('requires authentication on /v1/cas routes', async () => {
    const res = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [hash1] }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /v1/cas/check returns all hashes as missing initially and moves uploaded hashes to existing', async () => {
    const checkInitial = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: authJson('user-a'),
      body: JSON.stringify({ hashes: [hash1, hash2] }),
    });
    expect(checkInitial.status).toBe(200);
    expect(await checkInitial.json()).toEqual({
      existing: [],
      missing: [hash1, hash2],
      totalRequested: 2,
      deduplicatedCount: 0,
    });

    // Upload hash1
    const putRes = await app.request(`/v1/cas/blobs/${hash1}`, {
      method: 'PUT',
      headers: authBinary('user-a'),
      body: pngBytes1,
    });
    expect(putRes.status).toBe(201);
    const putJson = await putRes.json();
    expect(putJson.sha256).toBe(hash1);
    expect(putJson.sizeBytes).toBe(pngBytes1.byteLength);
    expect(putJson.key).toMatch(new RegExp(`^cas/.+/${hash1}\\.png$`));

    // Re-check both hashes
    const checkAfter = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: authJson('user-a'),
      body: JSON.stringify({ hashes: [hash1, hash2] }),
    });
    expect(checkAfter.status).toBe(200);
    expect(await checkAfter.json()).toEqual({
      existing: [hash1],
      missing: [hash2],
      totalRequested: 2,
      deduplicatedCount: 1,
    });
  });

  it('POST /v1/cas/check validates input and caps at 1,000 hashes', async () => {
    const badHashRes = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: authJson('user-a'),
      body: JSON.stringify({ hashes: ['not-a-sha256'] }),
    });
    expect(badHashRes.status).toBe(400);

    const overCapHashes = Array.from({ length: 1001 }, () => hash1);
    const overCapRes = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: authJson('user-a'),
      body: JSON.stringify({ hashes: overCapHashes }),
    });
    expect(overCapRes.status).toBe(400);
  });

  it('PUT /v1/cas/blobs/:sha256 rejects invalid SHA-256 hex paths and digest mismatches', async () => {
    const invalidPathRes = await app.request('/v1/cas/blobs/not-a-valid-sha256', {
      method: 'PUT',
      headers: authBinary('user-a'),
      body: pngBytes1,
    });
    expect(invalidPathRes.status).toBe(400);

    // Payload is pngBytes2 but URL claims hash1
    const mismatchRes = await app.request(`/v1/cas/blobs/${hash1}`, {
      method: 'PUT',
      headers: authBinary('user-a'),
      body: pngBytes2,
    });
    expect(mismatchRes.status).toBe(400);
    expect(await mismatchRes.json()).toEqual({ error: 'SHA-256 digest mismatch' });
  });

  it('GET /v1/cas/blobs/:sha256 returns exact PNG bytes with immutable Cache-Control and 404 for unknown blobs', async () => {
    const missingRes = await app.request(`/v1/cas/blobs/${hash1}`, {
      headers: { Authorization: 'Bearer user-a' },
    });
    expect(missingRes.status).toBe(404);

    await app.request(`/v1/cas/blobs/${hash1}`, {
      method: 'PUT',
      headers: authBinary('user-a'),
      body: pngBytes1,
    });

    const getRes = await app.request(`/v1/cas/blobs/${hash1}`, {
      headers: { Authorization: 'Bearer user-a' },
    });
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('Content-Type')).toBe('image/png');
    expect(getRes.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect(getRes.headers.get('Vary')).toContain('Authorization');
    const returnedBytes = new Uint8Array(await getRes.arrayBuffer());
    expect(returnedBytes).toEqual(pngBytes1);
  });

  it('enforces tenant isolation so User A blobs are not visible to User B', async () => {
    const putA = await app.request(`/v1/cas/blobs/${hash1}`, {
      method: 'PUT',
      headers: authBinary('user-a'),
      body: pngBytes1,
    });
    expect(putA.status).toBe(201);

    // User B checks for hash1 -> should be missing
    const checkB = await app.request('/v1/cas/check', {
      method: 'POST',
      headers: authJson('user-b'),
      body: JSON.stringify({ hashes: [hash1] }),
    });
    expect(checkB.status).toBe(200);
    expect(await checkB.json()).toEqual({
      existing: [],
      missing: [hash1],
      totalRequested: 1,
      deduplicatedCount: 0,
    });

    // User B tries to GET hash1 -> 404
    const getB = await app.request(`/v1/cas/blobs/${hash1}`, {
      headers: { Authorization: 'Bearer user-b' },
    });
    expect(getB.status).toBe(404);
  });

  it('uses SCREENSHOT_BUCKET R2 binding when provided', async () => {
    const r2Map = new Map<string, Uint8Array>();
    const fakeBucket: CasR2Bucket = {
      async head(key) {
        return r2Map.has(key) ? { key } : null;
      },
      async get(key) {
        const val = r2Map.get(key);
        if (!val) return null;
        return {
          arrayBuffer: async () =>
            val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength) as ArrayBuffer,
        };
      },
      async put(key, value) {
        r2Map.set(key, new Uint8Array(value as ArrayBuffer));
      },
    };
    const env = { SCREENSHOT_BUCKET: fakeBucket };

    const putRes = await app.request(
      `/v1/cas/blobs/${hash1}`,
      {
        method: 'PUT',
        headers: authBinary('user-r2'),
        body: pngBytes1,
      },
      env,
    );
    expect(putRes.status).toBe(201);
    expect(r2Map.size).toBe(1);

    const checkRes = await app.request(
      '/v1/cas/check',
      {
        method: 'POST',
        headers: authJson('user-r2'),
        body: JSON.stringify({ hashes: [hash1, hash2] }),
      },
      env,
    );
    expect(checkRes.status).toBe(200);
    expect(await checkRes.json()).toEqual({
      existing: [hash1],
      missing: [hash2],
      totalRequested: 2,
      deduplicatedCount: 1,
    });

    const getRes = await app.request(
      `/v1/cas/blobs/${hash1}`,
      { headers: { Authorization: 'Bearer user-r2' } },
      env,
    );
    expect(getRes.status).toBe(200);
    expect(new Uint8Array(await getRes.arrayBuffer())).toEqual(pngBytes1);
  });
});
