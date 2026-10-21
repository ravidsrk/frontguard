/**
 * Route discovery via Histoire's built `histoire.json`.
 *
 * Histoire's build serializes collected stories to `histoire.json`
 * (`stories[]` with `id`, `title`, `variants[]` of `{ id, title }`, plus
 * optional `group`, `docsOnly`, and `relativePath`). Native visual testing
 * on current main is still marked 1.0-beta.2+ and is not invoked here.
 *
 * Each variant is captured at `/__sandbox.html?storyId=&variantId=`, the
 * sandbox URL Histoire's preview helper builds.
 *
 * @module discovery/histoire
 */

import type { HistoireIntegrationConfig, Route } from '../core/types.js';
import { logger } from '../utils/logger.js';
import { fetchJson, normalizeBase, readIndexFile } from './index-json.js';
import { matchesAny } from './story-match.js';

export type HistoireConfig = HistoireIntegrationConfig;

/** Variant object stored on each story in `histoire.json`. */
interface HistoireVariant {
  id?: string;
  title?: string;
}

/** Story object stored in `histoire.json` `stories`. */
interface HistoireStory {
  id?: string;
  title?: string;
  group?: string;
  variants?: HistoireVariant[];
  docsOnly?: boolean;
  relativePath?: string;
}

/** Top-level `histoire.json` written next to `__sandbox.html`. */
interface HistoireIndex {
  stories?: HistoireStory[];
  markdownFiles?: unknown[];
}

export interface HistoireDiscoveryResult {
  routes: Route[];
  docsSkipped: number;
  filtered: number;
}

/** Sandbox path for one story variant. Grid view is intentionally not used. */
export function histoireSandboxPath(storyId: string, variantId: string): string {
  const query = new URLSearchParams({ storyId, variantId });
  return `/__sandbox.html?${query.toString()}`;
}

function histoireLabel(story: HistoireStory, variant: HistoireVariant): string {
  const title = story.title?.trim() || story.id || 'story';
  const group = story.group?.trim();
  const variantTitle = variant.title?.trim() || variant.id || 'variant';
  const head = group ? `${group} / ${title}` : title;
  return `${head} › ${variantTitle}`;
}

function variantMatches(story: HistoireStory, variant: HistoireVariant, patterns: string[]): boolean {
  const title = story.group?.trim()
    ? `${story.group.trim()} / ${story.title ?? ''}`
    : (story.title ?? '');
  const targets = [
    { id: story.id ?? '', title, name: variant.title },
    { id: variant.id ?? '', title, name: variant.title },
  ];
  return targets.some((target) => target.id.length > 0 && matchesAny(target, patterns));
}

/**
 * Load `histoire.json` from a local build directory, or from
 * `<url>/histoire.json` when no directory is set. A directory wins when
 * both are set.
 */
export async function loadHistoireIndex(config: HistoireConfig): Promise<HistoireIndex | null> {
  const timeoutMs = config.fetchTimeoutMs ?? 15_000;
  if (config.dir) {
    const fromDir = await readIndexFile(config.dir, 'histoire.json', 'Histoire');
    if (fromDir) return fromDir as HistoireIndex;
  }
  if (config.url) {
    const fromUrl = await fetchJson(
      `${normalizeBase(config.url)}/histoire.json`,
      timeoutMs,
      'Histoire',
    );
    if (fromUrl) return fromUrl as HistoireIndex;
  }
  return null;
}

/**
 * Enumerate Histoire variants into the same {@link Route} objects Storybook
 * discovery returns. Comparison stays on the shared pixelmatch path.
 */
export async function discoverHistoireStories(
  config: HistoireConfig,
): Promise<HistoireDiscoveryResult | null> {
  if (!config.url && !config.dir) {
    logger.warn('histoire.url or histoire.dir is required for Histoire discovery');
    return null;
  }

  const index = await loadHistoireIndex(config);
  if (!index || !Array.isArray(index.stories)) {
    logger.warn(
      'Could not read a Histoire histoire.json (stories array). ' +
        'Point histoire.dir at a Histoire build folder or histoire.url at a running build.',
    );
    return null;
  }

  const includes = config.stories ?? [];
  const excludes = config.exclude ?? [];
  const routes: Route[] = [];
  let docsSkipped = 0;
  let filtered = 0;

  for (const story of index.stories) {
    if (!story || typeof story !== 'object' || !story.id) {
      filtered++;
      continue;
    }
    if (story.docsOnly) {
      docsSkipped++;
      continue;
    }
    const variants = Array.isArray(story.variants) ? story.variants : [];
    for (const variant of variants) {
      if (!variant?.id) {
        filtered++;
        continue;
      }
      if (excludes.length > 0 && variantMatches(story, variant, excludes)) {
        filtered++;
        continue;
      }
      if (includes.length > 0 && !variantMatches(story, variant, includes)) {
        filtered++;
        continue;
      }
      routes.push({
        path: histoireSandboxPath(story.id, variant.id),
        label: histoireLabel(story, variant),
        discoveredVia: 'histoire',
      });
    }
  }

  routes.sort((a, b) => a.path.localeCompare(b.path));
  logger.info(
    `Histoire discovery: found ${routes.length} variant${routes.length === 1 ? '' : 's'}` +
      (docsSkipped ? ` (skipped ${docsSkipped} docs)` : '') +
      (filtered ? ` (filtered ${filtered})` : ''),
  );
  return { routes, docsSkipped, filtered };
}

/**
 * Pipeline glue. Returns null when Histoire is not configured so route
 * discovery can fall through. `baseUrl` is set only when `histoire.url` is.
 */
export async function discoverHistoireRoutesForConfig(
  config: { histoire?: HistoireConfig },
): Promise<{ routes: Route[]; baseUrl?: string } | null> {
  if (!config.histoire?.url && !config.histoire?.dir) return null;
  const result = await discoverHistoireStories(config.histoire);
  if (!result) return null;
  const baseUrl = config.histoire.url ? normalizeBase(config.histoire.url) : undefined;
  return baseUrl ? { routes: result.routes, baseUrl } : { routes: result.routes };
}
