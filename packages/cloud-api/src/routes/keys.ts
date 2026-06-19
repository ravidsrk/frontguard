/**
 * API key management routes (Task 5.3).
 *
 * - `GET    /v1/keys`      → list the caller's keys (hashes masked).
 * - `POST   /v1/keys`      → mint a new key (plaintext returned once).
 * - `DELETE /v1/keys/:hash`→ revoke a key by its hash prefix.
 *
 * Mounted before the global `/v1/*` guard, so this router runs its own auth
 * (resolving the caller from their bearer key). In dev mode any token maps to a
 * per-token demo user, mirroring the main guard.
 *
 * @module routes/keys
 */

import { Hono } from 'hono';
import type { Bindings } from '../db/factory.js';
import { getStore, isProduction } from '../db/factory.js';
import type { Store } from '../db/store.js';
import { generateApiKey, hashKey, MAX_KEYS_PER_USER } from '../auth/keys.js';

type Variables = { store: Store; userId: string };

export const keyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Per-router auth: resolve the caller to a userId.
keyRoutes.use('*', async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return c.json({ error: 'Missing API key' }, 401);

  const store = getStore(c.env);
  c.set('store', store);

  if (isProduction(c.env)) {
    const record = await store.getApiKey(await hashKey(apiKey));
    if (!record) return c.json({ error: 'Invalid API key' }, 401);
    c.set('userId', record.userId);
  } else {
    const userId = `demo:${await hashKey(apiKey)}`;
    if (!(await store.getUser(userId))) {
      await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });
    }
    c.set('userId', userId);
  }
  await next();
});

// GET /v1/keys — list keys (hash shortened, never full plaintext).
keyRoutes.get('/', async (c) => {
  const store = c.get('store');
  const keys = await store.listApiKeys(c.get('userId'));
  return c.json({
    keys: keys.map((k) => ({
      id: k.keyHash.slice(0, 12),
      name: k.name,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt ?? null,
    })),
    total: keys.length,
  });
});

// POST /v1/keys — mint a new key.
keyRoutes.post('/', async (c) => {
  const store = c.get('store');
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? 'API key').slice(0, 100);

  const existingKeys = await store.listApiKeys(c.get('userId'));
  if (existingKeys.length >= MAX_KEYS_PER_USER) {
    return c.json(
      { error: 'API key limit reached', limit: MAX_KEYS_PER_USER },
      429,
    );
  }

  const apiKey = generateApiKey();
  const keyHash = await hashKey(apiKey);
  await store.createApiKey({
    keyHash,
    userId: c.get('userId'),
    name,
    createdAt: new Date().toISOString(),
  });

  return c.json(
    {
      id: keyHash.slice(0, 12),
      name,
      apiKey,
      note: 'Store this key securely — it will not be shown again.',
    },
    201,
  );
});

// DELETE /v1/keys/:id — revoke a key by its hash prefix.
keyRoutes.delete('/:id', async (c) => {
  const store = c.get('store');
  const prefix = c.req.param('id');
  const keys = await store.listApiKeys(c.get('userId'));
  const match = keys.find((k) => k.keyHash.startsWith(prefix));
  if (!match) return c.json({ error: 'Key not found' }, 404);
  const deleted = await store.deleteApiKey(match.keyHash, c.get('userId'));
  return c.json({ deleted });
});
