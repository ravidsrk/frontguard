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

function candidateFragmentsForRoute(route: string): string[] {
  const withoutLeadingSlash = route.replace(/^\//, '');
  const slashToUnderscore = withoutLeadingSlash.replace(/\//g, '_') || 'index';
  const slashToUnderscoreRoot = withoutLeadingSlash.replace(/\//g, '_') || '_root';
  const safeChars = route.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || '_root';
  const slug = route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return [
    slashToUnderscore,
    slashToUnderscoreRoot,
    safeChars,
    slug,
    ...(route === '/' ? ['_root', 'index', 'root', ''] : []),
  ];
}

/**
 * Reverse-parses a reporter image basename of the form
 * `<routeFragment>_<viewport>_<browser>_<diffIdx>_<type>` or
 * `<index>_<routeFragment>_<viewport>_<browser>_<diffIdx>_<type>`.
 *
 * When `knownRoutes` is supplied, matches `routeFragment` (with or without a
 * leading numeric index prefix) against the known route list so nested routes
 * like `/blog/post-1` are recovered losslessly instead of becoming `/blog_post-1`.
 */
export function parseScreenshotName(
  name: string,
  knownRoutes?: readonly string[],
): ParsedScreenshotName | null {
  const m = name.match(/^(.*)_(\d+)_([a-z]+)_(\d+)_(baseline|current|diff)$/);
  if (!m) return null;
  const [, rawFragment, viewportStr, browser, diffIdxStr, type] = m;
  if (!KNOWN_BROWSERS.has(browser)) return null;
  const viewport = Number(viewportStr);
  if (!Number.isFinite(viewport)) return null;

  const idxMatch = rawFragment.match(/^(\d+)_(.+)$/);
  const strippedFragment = idxMatch ? idxMatch[2] : rawFragment;
  const leadingIdx = idxMatch ? Number(idxMatch[1]) : null;
  const diffIdx = Number(diffIdxStr);

  if (knownRoutes && knownRoutes.length > 0) {
    const normalizedKnown = knownRoutes.map((r) => (r.startsWith('/') ? r : `/${r}`));
    const matches = normalizedKnown.filter((normalized) => {
      const fragments = candidateFragmentsForRoute(normalized);
      return fragments.includes(rawFragment) || fragments.includes(strippedFragment);
    });

    if (matches.length === 1) {
      return {
        route: matches[0],
        viewport,
        browser,
        type: type as ParsedScreenshotName['type'],
      };
    }

    if (matches.length > 1) {
      if (
        leadingIdx !== null &&
        leadingIdx >= 0 &&
        leadingIdx < normalizedKnown.length &&
        matches.includes(normalizedKnown[leadingIdx])
      ) {
        return {
          route: normalizedKnown[leadingIdx],
          viewport,
          browser,
          type: type as ParsedScreenshotName['type'],
        };
      }
      if (
        Number.isFinite(diffIdx) &&
        diffIdx >= 0 &&
        diffIdx < normalizedKnown.length &&
        matches.includes(normalizedKnown[diffIdx])
      ) {
        return {
          route: normalizedKnown[diffIdx],
          viewport,
          browser,
          type: type as ParsedScreenshotName['type'],
        };
      }
      // Ambiguous matches without an index mapping: preserve rawFragment so
      // distinct indexed filenames (e.g. 0_a_b vs 1_a_b) never overwrite each other.
      return {
        route: `/${rawFragment}`,
        viewport,
        browser,
        type: type as ParsedScreenshotName['type'],
      };
    }
  }

  // Best-effort route recovery when no knownRoutes match: strip optional
  // leading `${index}_` prefix emitted by the CLI HTML reporter and map root
  // sentinels (`_root`, `index`, `''`) to `/`.
  const fragment = idxMatch ? strippedFragment : rawFragment;
  const route =
    fragment === '_root' || fragment === 'index' || fragment === '' ? '/' : `/${fragment}`;
  return { route, viewport, browser, type: type as ParsedScreenshotName['type'] };
}

/**
 * Selects the effective baseline screenshot records from an approved baseline
 * run. For each `(route, viewport, browser)` tuple, prefers `'current'` (the
 * newly captured/approved image from that run) over `'baseline'` (which holds
 * the pre-approval image when a regression run was approved), falling back to
 * `'baseline'` when only `'baseline'` records exist.
 */
export function selectApprovedBaselineScreenshots(
  shots: readonly ScreenshotRecord[],
): ScreenshotRecord[] {
  const byKey = new Map<string, ScreenshotRecord>();
  for (const shot of shots) {
    if (shot.type !== 'baseline' && shot.type !== 'current') continue;
    const key = `${shot.route}\0${shot.viewport}\0${shot.browser}`;
    const existing = byKey.get(key);
    if (!existing || (existing.type === 'baseline' && shot.type === 'current')) {
      byKey.set(key, shot);
    }
  }
  return [...byKey.values()];
}

/**
 * Ensures an approved run has `'baseline'` screenshot records corresponding to
 * its `'current'` screenshots so callers filtering by `type === 'baseline'`
 * find the approved images.
 */
export async function promoteRunCurrentScreenshotsToBaseline(
  store: Store,
  runId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  const shots = await store.listScreenshots(runId);
  const existingBaselines = new Set(
    shots
      .filter((s) => s.type === 'baseline')
      .map((s) => `${s.route}\0${s.viewport}\0${s.browser}`),
  );
  for (const shot of shots) {
    if (shot.type !== 'current') continue;
    const key = `${shot.route}\0${shot.viewport}\0${shot.browser}`;
    if (existingBaselines.has(key)) continue;
    existingBaselines.add(key);
    await store.addScreenshot({
      id: crypto.randomUUID(),
      runId: shot.runId,
      route: shot.route,
      viewport: shot.viewport,
      browser: shot.browser,
      type: 'baseline',
      r2Key: shot.r2Key,
      sizeBytes: shot.sizeBytes,
      createdAt: now(),
    });
  }
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
  nowOrRoutes: (() => string) | readonly string[] = () => new Date().toISOString(),
  knownRoutes?: readonly string[],
): Promise<number> {
  const now = typeof nowOrRoutes === 'function' ? nowOrRoutes : () => new Date().toISOString();
  const routes = Array.isArray(nowOrRoutes) ? nowOrRoutes : knownRoutes;
  let persisted = 0;
  for (const shot of screenshots) {
    const parsed = parseScreenshotName(shot.name, routes);
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
