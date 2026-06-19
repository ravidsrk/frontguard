/**
 * REL-3 — bounded, evicting in-process rate limiter.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BoundedRateLimiter } from '../src/rate-limit.js';
import { app, apiRateLimiter } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';

describe('BoundedRateLimiter', () => {
  const windowMs = 60_000;
  const limit = 5;

  it('evicts expired entries so the map stays bounded', () => {
    const rl = new BoundedRateLimiter({ limit, windowMs, maxEntries: 3 });
    const t0 = 1_000_000;

    rl.check('a', t0);
    rl.check('b', t0);
    rl.check('c', t0);
    expect(rl.size).toBe(3);

    // All entries expired — next check sweeps them before adding a new key.
    const later = t0 + windowMs + 1;
    rl.check('d', later);
    expect(rl.size).toBe(1);
  });

  it('LRU-evicts when maxEntries is exceeded', () => {
    const rl = new BoundedRateLimiter({ limit, windowMs, maxEntries: 2 });
    const t0 = 2_000_000;

    rl.check('first', t0);
    rl.check('second', t0);
    expect(rl.size).toBe(2);

    // Touch first so second is LRU and gets evicted when third arrives.
    rl.check('first', t0 + 1);
    rl.check('third', t0 + 2);
    expect(rl.size).toBe(2);
    expect(rl.check('second', t0 + 3).allowed).toBe(true);
    expect(rl.size).toBe(2);
  });

  it('rate-limits within a single isolate', () => {
    const rl = new BoundedRateLimiter({ limit: 3, windowMs, maxEntries: 10 });
    const t0 = 3_000_000;

    expect(rl.check('key', t0).allowed).toBe(true);
    expect(rl.check('key', t0).allowed).toBe(true);
    expect(rl.check('key', t0).allowed).toBe(true);
    expect(rl.check('key', t0).allowed).toBe(false);
  });
});

describe('GET /v1/usage — rate limit middleware (REL-3)', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
  });

  it('returns 429 after exceeding 100 requests per minute for one key', async () => {
    const headers = { Authorization: 'Bearer rate-limit-test-key' };

    for (let i = 0; i < 100; i++) {
      const res = await app.request('/v1/usage', { headers });
      expect(res.status).toBe(200);
    }

    const blocked = await app.request('/v1/usage', { headers });
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toMatch(/rate limit exceeded/i);
  });
});