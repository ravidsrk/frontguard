/**
 * Monitor-run screenshot metadata (REL-2).
 *
 * R2 object keys slug route paths for filenames, so nested routes like
 * `/foo/bar` cannot be recovered by reverse-sanitizing the key. Each persisted
 * monitor screenshot therefore carries the original route explicitly in the
 * `monitor_runs.screenshots` JSON blob.
 *
 * @module monitor-screenshots
 */

import type { ScreenshotRecord } from './db/store.js';
import type { BaselineRestore } from './daytona-runner.js';
import { parseScreenshotKey, type R2Bucket } from './storage/screenshots.js';

/** A screenshot captured during a monitor run, with lossless route metadata. */
export interface MonitorScreenshotRef {
  r2Key: string;
  route: string;
  viewport: number;
  browser: string;
  type: 'baseline' | 'current' | 'diff';
}

/** Slug used in R2 keys — mirrors {@link screenshotKey}. */
export function routeToSlug(route: string): string {
  return route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
}

/** Extracts the route slug embedded in an R2 object key filename. */
export function slugFromR2Key(key: string): string | null {
  const filename = key.split('/').pop();
  if (!filename) return null;
  const base = filename.replace(/\.png$/i, '');
  const m = base.match(/^(.*)-(\d+)-([a-z]+)-(baseline|current|diff)$/);
  return m?.[1] ?? null;
}

/**
 * Maps an R2 slug back to the monitor's original route by matching against the
 * configured route list — never by reverse-sanitizing the slug alone.
 */
export function matchRouteFromSlug(slug: string, routes: string[]): string | undefined {
  for (const route of routes) {
    if (routeToSlug(route) === slug) return route;
  }
  return undefined;
}

/** Builds lossless refs from persisted screenshot metadata + monitor routes. */
export function buildMonitorScreenshotRefs(
  routes: string[],
  shots: ScreenshotRecord[],
): MonitorScreenshotRef[] {
  const refs: MonitorScreenshotRef[] = [];
  for (const shot of shots) {
    const slug = slugFromR2Key(shot.r2Key);
    const route = slug != null ? matchRouteFromSlug(slug, routes) : undefined;
    refs.push({
      r2Key: shot.r2Key,
      route: route ?? shot.route,
      viewport: shot.viewport,
      browser: shot.browser,
      type: shot.type,
    });
  }
  return refs;
}

/**
 * Normalizes `monitor_runs.screenshots` JSON — supports legacy `string[]` keys
 * and the current {@link MonitorScreenshotRef} objects.
 */
export function parseMonitorScreenshots(
  raw: MonitorScreenshotRef[] | string[] | undefined,
  routes: string[],
): MonitorScreenshotRef[] {
  if (!raw?.length) return [];
  if (typeof raw[0] === 'string') {
    return (raw as string[])
      .map((r2Key) => {
        const parsed = parseScreenshotKey(r2Key);
        if (!parsed) return null;
        const slug = slugFromR2Key(r2Key);
        const route = slug != null ? matchRouteFromSlug(slug, routes) : undefined;
        if (!route) return null;
        return {
          r2Key,
          route,
          viewport: parsed.viewport,
          browser: parsed.browser,
          type: parsed.type,
        };
      })
      .filter((r): r is MonitorScreenshotRef => r != null);
  }
  return raw as MonitorScreenshotRef[];
}

/** Screenshot types that may seed the sandbox baseline on the next tick. */
const BASELINE_SOURCE_TYPES = new Set<MonitorScreenshotRef['type']>(['baseline', 'current']);

/** Extracts the ephemeral process-run id embedded in an R2 object key. */
export function runIdFromR2Key(key: string): string | null {
  const parts = key.split('/');
  return parts.length >= 3 ? parts[1]! : null;
}

/**
 * Promotes first-run `current` screenshots to `baseline` in monitor-run history
 * so the next tick's restore path accepts them without requiring approval.
 */
export function promoteRefsForBaselineStorage(refs: MonitorScreenshotRef[]): MonitorScreenshotRef[] {
  return refs.map((r) =>
    BASELINE_SOURCE_TYPES.has(r.type) ? { ...r, type: 'baseline' as const } : r,
  );
}

/** Resolves a {@link BaselineRestore} from prior monitor-run screenshot refs. */
export function baselineRestoreFromRefs(
  refs: MonitorScreenshotRef[],
  bucket: R2Bucket,
): BaselineRestore | undefined {
  const baselines = refs
    .filter((r) => BASELINE_SOURCE_TYPES.has(r.type))
    .map((r) => ({
      route: r.route,
      viewport: r.viewport,
      browser: r.browser,
      r2Key: r.r2Key,
    }));
  return baselines.length > 0 ? { bucket, baselines } : undefined;
}