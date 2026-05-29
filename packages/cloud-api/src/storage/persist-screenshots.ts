/**
 * Screenshot persistence (Task 5.4 wiring).
 *
 * Bridges the sandbox runner output to durable storage: raw PNG bytes go to
 * the {@link ScreenshotStore} (R2 in prod) under a per-user/run key, and the
 * metadata row goes to the {@link Store} (D1) so `GET /v1/screenshots/:runId`
 * can list and stream them.
 *
 * @module storage/persist-screenshots
 */

import type { Store, ScreenshotRecord } from '../db/store.js';
import { type ScreenshotStore, screenshotKey } from './screenshots.js';

/** A screenshot produced by a run, before persistence. */
export interface PendingScreenshot {
  /** Reporter image basename, e.g. `home_1440_chromium_0_baseline`. */
  name: string;
  type: 'baseline' | 'current' | 'diff';
  bytes: Uint8Array;
}

/** Parsed metadata recovered from a reporter image basename. */
export interface ParsedScreenshotName {
  route: string;
  viewport: number;
  browser: string;
  type: 'baseline' | 'current' | 'diff';
}

const KNOWN_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);

/**
 * Reverse-parses a reporter image basename of the form
 * `<routeFragment>_<viewport>_<browser>_<diffIdx>_<type>`.
 *
 * The route fragment is itself underscore-sanitised, so we parse from the
 * right where the structure is unambiguous. Returns `null` if the name does
 * not match the expected shape.
 */
export function parseScreenshotName(name: string): ParsedScreenshotName | null {
  const m = name.match(/^(.*)_(\d+)_([a-z]+)_(\d+)_(baseline|current|diff)$/);
  if (!m) return null;
  const [, routeFragment, viewportStr, browser, , type] = m;
  if (!KNOWN_BROWSERS.has(browser)) return null;
  const viewport = Number(viewportStr);
  if (!Number.isFinite(viewport)) return null;
  // Best-effort route recovery: the fragment was sanitised, so we present a
  // leading-slash path derived from it (e.g. `home` -> `/home`, `_root` -> `/`).
  const route = routeFragment === '_root' || routeFragment === '' ? '/' : `/${routeFragment}`;
  return { route, viewport, browser, type: type as ParsedScreenshotName['type'] };
}

/**
 * Persists a run's screenshots to blob storage + metadata store.
 * Best-effort per screenshot: a single failure does not abort the rest.
 * Returns the number of screenshots successfully persisted.
 */
export async function persistScreenshots(
  store: Store,
  blobs: ScreenshotStore,
  userId: string,
  runId: string,
  screenshots: PendingScreenshot[],
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  let persisted = 0;
  for (const shot of screenshots) {
    const parsed = parseScreenshotName(shot.name);
    if (!parsed) continue;
    const key = screenshotKey(userId, runId, parsed.type, parsed.route, parsed.viewport, parsed.browser);
    try {
      await blobs.put(key, shot.bytes);
      const record: ScreenshotRecord = {
        id: crypto.randomUUID(),
        runId,
        route: parsed.route,
        viewport: parsed.viewport,
        browser: parsed.browser,
        type: parsed.type,
        r2Key: key,
        sizeBytes: shot.bytes.byteLength,
        createdAt: now(),
      };
      await store.addScreenshot(record);
      persisted++;
    } catch {
      // Skip this screenshot; continue with the rest.
    }
  }
  return persisted;
}
