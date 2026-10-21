/**
 * Route discovery via Ladle's `meta.json`.
 *
 * Field names match Ladle's published meta file: `about`, and `stories`
 * keyed by story id with `name`, `levels`, `locStart`, `locEnd`,
 * `filePath`, and a user `meta` object. Each story is captured at
 * `/?story=<key>&mode=preview`. The renderer waits for `[data-storyloaded]`.
 *
 * `meta.frontguard` is a Frontguard annotation inside Ladle's `meta` bag.
 * It uses the same override fields as Storybook `parameters.frontguard`.
 *
 * @module discovery/ladle
 */

import type { LadleIntegrationConfig, Route } from '../core/types.js';
import { logger } from '../utils/logger.js';
import { fetchJson, normalizeBase, readIndexFile } from './index-json.js';
import { matchesAny } from './story-match.js';
import {
  normalizeFrontguardParams,
  type StoryFrontguardParameters,
} from './storybook-parameters.js';

export type LadleConfig = LadleIntegrationConfig;

/** One story inside Ladle `meta.json` `stories`. */
interface LadleStoryEntry {
  name?: string;
  levels?: string[];
  locStart?: number;
  locEnd?: number;
  filePath?: string;
  meta?: Record<string, unknown>;
}

/** Ladle build/serve index. `about.version` is Ladle's own meta version. */
interface LadleMetaJson {
  about?: {
    homepage?: string;
    github?: string;
    version?: number;
  };
  stories?: Record<string, LadleStoryEntry>;
}

export interface LadleDiscoveryResult {
  routes: Route[];
  filtered: number;
  paramSkipped: number;
}

/** Preview path Ladle documents for a single story. */
export function ladlePreviewPath(storyKey: string): string {
  return `/?story=${encodeURIComponent(storyKey)}&mode=preview`;
}

function ladleLabel(key: string, entry: LadleStoryEntry): string {
  const levels = (entry.levels ?? []).filter((level) => level.trim().length > 0).join('/');
  const name = entry.name?.trim();
  if (levels && name) return `${levels} › ${name}`;
  if (name) return name;
  return key;
}

function applyFrontguard(route: Route, params: StoryFrontguardParameters | undefined): Route {
  if (!params) return route;
  const next: Route = { ...route };
  if (params.label) next.label = params.label;
  if (typeof params.threshold === 'number') next.threshold = params.threshold;
  if (Array.isArray(params.viewports) && params.viewports.length > 0) {
    next.viewport = params.viewports;
  }
  if (Array.isArray(params.ignore) && params.ignore.length > 0) {
    next.ignore = params.ignore;
  }
  return next;
}

function isStoryMap(value: unknown): value is Record<string, LadleStoryEntry> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Load `meta.json` from a local build directory, or from `<url>/meta.json`
 * when no directory is set. A directory wins when both are set.
 */
export async function loadLadleMeta(
  config: LadleConfig,
): Promise<LadleMetaJson | null> {
  const timeoutMs = config.fetchTimeoutMs ?? 15_000;
  if (config.dir) {
    const fromDir = await readIndexFile(config.dir, 'meta.json', 'Ladle');
    if (fromDir) return fromDir as LadleMetaJson;
  }
  if (config.url) {
    const fromUrl = await fetchJson(`${normalizeBase(config.url)}/meta.json`, timeoutMs, 'Ladle');
    if (fromUrl) return fromUrl as LadleMetaJson;
  }
  return null;
}

/**
 * Enumerate Ladle stories into the same {@link Route} objects Storybook
 * discovery returns. Comparison stays on the shared pixelmatch path.
 */
export async function discoverLadleStories(
  config: LadleConfig,
): Promise<LadleDiscoveryResult | null> {
  if (!config.url && !config.dir) {
    logger.warn('ladle.url or ladle.dir is required for Ladle discovery');
    return null;
  }

  const meta = await loadLadleMeta(config);
  if (!meta || !isStoryMap(meta.stories)) {
    logger.warn(
      'Could not read a Ladle meta.json (stories map). ' +
        'Point ladle.dir at a Ladle build folder or ladle.url at a running server.',
    );
    return null;
  }

  const includes = config.stories ?? [];
  const excludes = config.exclude ?? [];
  const routes: Route[] = [];
  let filtered = 0;
  let paramSkipped = 0;

  for (const [key, entry] of Object.entries(meta.stories)) {
    if (!entry || typeof entry !== 'object') {
      filtered++;
      continue;
    }
    const target = {
      id: key,
      title: (entry.levels ?? []).join('/'),
      name: entry.name,
    };
    if (excludes.length > 0 && matchesAny(target, excludes)) {
      filtered++;
      continue;
    }
    if (includes.length > 0 && !matchesAny(target, includes)) {
      filtered++;
      continue;
    }

    const params = normalizeFrontguardParams(entry.meta?.frontguard);
    if (params?.skip) {
      paramSkipped++;
      continue;
    }

    const base: Route = {
      path: ladlePreviewPath(key),
      label: ladleLabel(key, entry),
      discoveredVia: 'ladle',
      waitForSelector: '[data-storyloaded]',
    };
    routes.push(applyFrontguard(base, params));
  }

  routes.sort((a, b) => a.path.localeCompare(b.path));
  logger.info(
    `Ladle discovery: found ${routes.length} stor${routes.length === 1 ? 'y' : 'ies'}` +
      (filtered ? ` (filtered ${filtered})` : '') +
      (paramSkipped ? ` (skipped ${paramSkipped} via meta.frontguard.skip)` : ''),
  );
  return { routes, filtered, paramSkipped };
}

/**
 * Pipeline glue. Returns null when Ladle is not configured so route
 * discovery can fall through. `baseUrl` is set only when `ladle.url` is.
 */
export async function discoverLadleRoutesForConfig(
  config: { ladle?: LadleConfig },
): Promise<{ routes: Route[]; baseUrl?: string } | null> {
  if (!config.ladle?.url && !config.ladle?.dir) return null;
  const result = await discoverLadleStories(config.ladle);
  if (!result) return null;
  const baseUrl = config.ladle.url ? normalizeBase(config.ladle.url) : undefined;
  return baseUrl ? { routes: result.routes, baseUrl } : { routes: result.routes };
}
