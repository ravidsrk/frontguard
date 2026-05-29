/**
 * Screenshot routes (Task 5.4).
 *
 * - `GET /v1/screenshots/:runId`           → list screenshot metadata for a run.
 * - `GET /v1/screenshots/:runId/:id/raw`   → stream the PNG bytes from R2.
 *
 * Mounted after the `/v1/*` auth guard, so `userId` and `store` are set on the
 * context. Ownership is enforced against the run's owner.
 *
 * @module routes/screenshots
 */

import { Hono } from 'hono';
import type { Bindings } from '../db/factory.js';
import type { Store } from '../db/store.js';
import { getScreenshotStore, type R2Bucket } from '../storage/screenshots.js';

type Variables = { store: Store; userId: string };

export const screenshotRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Ensures the caller owns the run; returns the owner check result. */
async function ownsRun(store: Store, runId: string, userId: string): Promise<boolean> {
  return (await store.getRunOwner(runId)) === userId;
}

// GET /v1/screenshots/:runId — metadata listing.
screenshotRoutes.get('/:runId', async (c) => {
  const store = c.get('store');
  const runId = c.req.param('runId');
  if (!(await ownsRun(store, runId, c.get('userId')))) {
    return c.json({ error: 'Run not found' }, 404);
  }
  const shots = await store.listScreenshots(runId);
  return c.json({
    screenshots: shots.map((s) => ({
      id: s.id,
      route: s.route,
      viewport: s.viewport,
      browser: s.browser,
      type: s.type,
      sizeBytes: s.sizeBytes ?? null,
      url: `/v1/screenshots/${runId}/${s.id}/raw`,
    })),
    total: shots.length,
  });
});

// GET /v1/screenshots/:runId/:id/raw — stream PNG bytes.
screenshotRoutes.get('/:runId/:id/raw', async (c) => {
  const store = c.get('store');
  const runId = c.req.param('runId');
  const id = c.req.param('id');
  if (!(await ownsRun(store, runId, c.get('userId')))) {
    return c.json({ error: 'Run not found' }, 404);
  }
  const shots = await store.listScreenshots(runId);
  const meta = shots.find((s) => s.id === id);
  if (!meta) return c.json({ error: 'Screenshot not found' }, 404);

  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const bytes = await blobs.get(meta.r2Key);
  if (!bytes) return c.json({ error: 'Image data not available' }, 404);

  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'private, max-age=86400',
  });
});
