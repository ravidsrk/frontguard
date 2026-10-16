/**
 * Stage 3 Cloud Content-Addressable Storage (CAS) routes.
 *
 * - `POST /v1/cas/check`          → check which SHA-256 PNG blobs already exist.
 * - `PUT  /v1/cas/blobs/:sha256`  → upload a SHA-256-verified PNG blob.
 * - `GET  /v1/cas/blobs/:sha256`  → fetch a cached PNG blob with immutable cache headers.
 *
 * Mounted after the `/v1/*` auth guard, so `userId` and `store` are set on the
 * context. Blobs are scoped per tenant (`cas/${scope}/${sha256}.png`).
 *
 * @module routes/cas
 */

import { Hono, type Context } from 'hono';
import { getPlan } from '../billing/plans.js';
import type { Bindings } from '../db/factory.js';
import type { Store, User } from '../db/store.js';

/** Minimal R2 bucket interface supporting `head`, `get`, and `put`. */
export interface CasR2Bucket {
  head?(key: string): Promise<unknown | null>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

type Variables = { store: Store; userId: string };

/** Maximum number of hashes allowed in a single `POST /v1/cas/check` call. */
export const MAX_CAS_CHECK_HASHES = 1000;

/** Maximum size in bytes of a single CAS PNG blob (25 MB). */
export const MAX_CAS_BLOB_BYTES = 25 * 1024 * 1024;

/** Maximum number of blobs retained in the fallback in-memory CAS store. */
export const MAX_CAS_MEMORY_BLOBS = 500;

const SHA256_LOWER_HEX_RE = /^[0-9a-f]{64}$/;
const SHA256_HEX_RE = /^[0-9a-fA-F]{64}$/;

/** In-memory CAS blob fallback used when `SCREENSHOT_BUCKET` is not bound. */
const casMemoryStore = new Map<string, Uint8Array>();

/** Resets the in-memory CAS blob store (test helper). */
export function resetCasMemoryStore(): void {
  casMemoryStore.clear();
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Reads request body stream up to `maxBytes`, aborting early if exceeded. */
async function readBoundedBody(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; buffer: ArrayBuffer } | { ok: false; reason: 'empty' | 'too_large' }> {
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, reason: 'too_large' };
    }
  }

  if (!req.body) {
    return { ok: false, reason: 'empty' };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, reason: 'too_large' };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return { ok: false, reason: 'empty' };
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, buffer: merged.buffer };
}

/** Resolves the tenant scope (`teamId ?? user.id`) and billing context for CAS storage keys. */
async function resolveCasTenant(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<{ scope: string; userId: string; teamId?: string; planId: string }> {
  const userId = c.get('userId');
  const store = c.get('store');
  const queryTeamId = c.req.query('teamId');
  if (queryTeamId && store) {
    const member = await store.getMember(queryTeamId, userId);
    if (member) {
      const team = await store.getTeam(queryTeamId);
      return {
        scope: queryTeamId,
        userId,
        teamId: queryTeamId,
        planId: team?.plan ?? 'free',
      };
    }
  }
  const user = store ? await store.getUser(userId) : null;
  const userWithTeam = user as (User & { teamId?: string }) | null;
  const teamId = userWithTeam?.teamId;
  const scope = teamId ?? user?.id ?? userId;
  return {
    scope,
    userId,
    teamId,
    planId: user?.plan ?? 'free',
  };
}

/** Resolves the R2 bucket binding if configured. */
function getCasBucket(env: Bindings | undefined): CasR2Bucket | undefined {
  return (env?.SCREENSHOT_BUCKET ?? env?.SCREENSHOTS) as CasR2Bucket | undefined;
}

/** Builds the tenant-scoped CAS object key for a SHA-256 digest. */
export function casObjectKey(scope: string, sha256: string): string {
  return `cas/${scope}/${sha256}.png`;
}

/** Computes the lowercase hex SHA-256 digest of an ArrayBuffer. */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const casRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// POST /v1/cas/check — batch check which SHA-256 blobs already exist.
casRoutes.post('/check', async (c) => {
  let body: { hashes?: unknown };
  try {
    body = (await c.req.json()) as { hashes?: unknown };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || !Array.isArray(body.hashes)) {
    return c.json({ error: 'Invalid request: hashes must be an array of SHA-256 hex strings' }, 400);
  }

  if (body.hashes.length > MAX_CAS_CHECK_HASHES) {
    return c.json(
      { error: `Too many hashes: maximum ${MAX_CAS_CHECK_HASHES} hashes per request` },
      400,
    );
  }

  const hashes: string[] = [];
  for (const h of body.hashes) {
    if (typeof h !== 'string' || !SHA256_LOWER_HEX_RE.test(h)) {
      return c.json(
        { error: 'Invalid hash: each entry must be a 64-character lowercase hex SHA-256 string' },
        400,
      );
    }
    hashes.push(h);
  }

  const { scope } = await resolveCasTenant(c);
  const bucket = getCasBucket(c.env);
  const existing: string[] = [];
  const missing: string[] = [];

  for (const hash of hashes) {
    const key = casObjectKey(scope, hash);
    let found = false;
    if (bucket) {
      const headObj =
        typeof bucket.head === 'function' ? await bucket.head(key) : await bucket.get(key);
      found = headObj !== null && headObj !== undefined;
    } else {
      found = casMemoryStore.has(key);
    }

    if (found) {
      existing.push(hash);
    } else {
      missing.push(hash);
    }
  }

  return c.json({
    existing,
    missing,
    totalRequested: hashes.length,
    deduplicatedCount: existing.length,
  });
});

// PUT /v1/cas/blobs/:sha256 — upload a SHA-256-verified PNG blob.
casRoutes.put('/blobs/:sha256', async (c) => {
  const sha256 = c.req.param('sha256');
  if (!SHA256_LOWER_HEX_RE.test(sha256)) {
    return c.json(
      { error: 'Invalid SHA-256 hash: must be a 64-character lowercase hex string' },
      400,
    );
  }

  const readResult = await readBoundedBody(c.req.raw, MAX_CAS_BLOB_BYTES);
  if (!readResult.ok) {
    if (readResult.reason === 'empty') {
      return c.json({ error: 'Blob payload must not be empty' }, 400);
    }
    return c.json({ error: 'Blob payload exceeds maximum size of 25 MB' }, 413);
  }
  const buf = readResult.buffer;

  const actualHash = await sha256Hex(buf);
  if (actualHash !== sha256) {
    return c.json({ error: 'SHA-256 digest mismatch' }, 400);
  }

  const { scope, userId, teamId, planId } = await resolveCasTenant(c);
  const key = casObjectKey(scope, sha256);
  const bucket = getCasBucket(c.env);
  const store = c.get('store');

  let alreadyExists = false;
  if (bucket) {
    const headObj =
      typeof bucket.head === 'function' ? await bucket.head(key) : await bucket.get(key);
    alreadyExists = headObj !== null && headObj !== undefined;
  } else {
    alreadyExists = casMemoryStore.has(key);
  }

  if (!alreadyExists && store) {
    const plan = getPlan(planId);
    const screenshotLimit = plan.limits.screenshotsPerMonth;
    const month = currentMonth();
    const meterTeam = Boolean(teamId && plan.id !== 'free');
    if (screenshotLimit !== null) {
      const reserved = meterTeam
        ? await store.tryReserveTeamScreenshots(teamId!, month, screenshotLimit, 1)
        : await store.tryReserveScreenshots(userId, month, screenshotLimit, 1);
      if (!reserved) {
        return c.json(
          {
            error: `Monthly screenshot limit reached (${screenshotLimit} on the ${plan.name} plan).`,
            limit: screenshotLimit,
          },
          402,
        );
      }
    } else if (meterTeam) {
      await store.incrementTeamUsage(teamId!, month, 0, 1);
    } else {
      await store.incrementUsage(userId, month, 0, 1);
    }
  }

  if (bucket) {
    await bucket.put(key, buf, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'private, max-age=31536000, immutable',
      },
    });
  } else {
    if (!casMemoryStore.has(key) && casMemoryStore.size >= MAX_CAS_MEMORY_BLOBS) {
      const oldestKey = casMemoryStore.keys().next().value;
      if (oldestKey !== undefined) {
        casMemoryStore.delete(oldestKey);
      }
    }
    casMemoryStore.set(key, new Uint8Array(buf));
  }

  return c.json(
    {
      sha256,
      sizeBytes: buf.byteLength,
      key,
    },
    201,
  );
});

// GET /v1/cas/blobs/:sha256 — fetch a CAS PNG blob.
casRoutes.get('/blobs/:sha256', async (c) => {
  const sha256Param = c.req.param('sha256');
  if (!SHA256_HEX_RE.test(sha256Param)) {
    return c.json({ error: 'Invalid SHA-256 hash: must be a 64-character hex string' }, 400);
  }

  const sha256 = sha256Param.toLowerCase();
  const { scope } = await resolveCasTenant(c);
  const key = casObjectKey(scope, sha256);
  const bucket = getCasBucket(c.env);

  let bytes: Uint8Array | null = null;
  if (bucket) {
    const obj = await bucket.get(key);
    if (obj) {
      bytes = new Uint8Array(await obj.arrayBuffer());
    }
  } else {
    bytes = casMemoryStore.get(key) ?? null;
  }

  if (!bytes) {
    return c.json({ error: 'CAS blob not found' }, 404);
  }

  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'private, max-age=31536000, immutable',
    Vary: 'Authorization',
  });
});
