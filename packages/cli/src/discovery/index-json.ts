/**
 * Read a story index from a local build directory or a running server.
 *
 * @module discovery/index-json
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { logger } from '../utils/logger.js';

export function normalizeBase(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Resolve a story preview against a hosted base without dropping the base directory.
 *
 * `new URL('/?story=a', 'https://example.com/components')` opens the site root.
 * Story paths from Ladle and Histoire are root-shaped (`/?story=`, `/__sandbox.html`).
 * Strip that leading slash and join onto a directory URL so `/components/` stays.
 */
export function joinStoryUrl(base: string, previewPath: string): string {
  const directory = base.endsWith('/') ? base : `${base}/`;
  const relative = previewPath.replace(/^\/+/, '');
  return new URL(relative, directory).href;
}

export async function fetchJson(url: string, timeoutMs: number, label: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.debug(`${label} index fetch ${url} → ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.debug(`${label} index fetch ${url} failed: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read `<dir>/<filename>` and parse it. Returns null on any failure. */
export async function readIndexFile(dir: string, filename: string, label: string): Promise<unknown | null> {
  const path = join(isAbsolute(dir) ? dir : resolve(dir), filename);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (err) {
    logger.warn(`Could not read ${label} index at ${path}: ${(err as Error).message}`);
    return null;
  }
}
