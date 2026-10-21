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

export { joinStoryUrl } from './story-url.js';

export async function fetchJson(url: string, timeoutMs: number, label: string): Promise<unknown | null> {
  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ct.signal });
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
