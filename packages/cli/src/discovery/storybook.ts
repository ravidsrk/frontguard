/**
 * Route discovery via Storybook story indexes.
 *
 * Connects to a running Storybook instance (8.x via `/index.json`, 7.x via
 * `/stories.json`), enumerates its stories, and produces one {@link Route}
 * per story. Each route targets the Storybook preview iframe so the renderer
 * can navigate directly to a single story without the surrounding manager UI.
 *
 * Per-story metadata can be set via Storybook parameters:
 *
 *   export const Filled = {
 *     parameters: {
 *       frontguard: {
 *         viewports: [375, 1280],
 *         threshold: 0.005,
 *         ignore: [{ selector: '.timestamp' }],
 *       },
 *     },
 *   };
 *
 * These overrides flow into the corresponding {@link Route} fields and are
 * honoured by the pipeline the same way per-route config entries are.
 *
 * @module discovery/storybook
 */

import type { FrontguardConfig, Route } from '../core/types.js';
import { logger } from '../utils/logger.js';
import {
  resolveStoryFrontguardParameters,
  type StoryFrontguardParameters,
} from './storybook-parameters.js';

export type { StoryFrontguardParameters };

// ---------------------------------------------------------------------------
// Public Config Surface
// ---------------------------------------------------------------------------

/**
 * Storybook integration configuration.
 *
 * Set on {@link FrontguardConfig.storybook} to enable Storybook-aware
 * discovery and rendering.
 */
export interface StorybookConfig {
  /**
   * Base URL of the running Storybook server (e.g. `http://localhost:6006`).
   * Frontguard will fetch `/index.json` (Storybook 8) or `/stories.json`
   * (Storybook 7) from this origin to enumerate stories.
   */
  url: string;
  /**
   * Optional include filter. Each entry is either a glob (`Button/*`),
   * a Storybook story id (`button--primary`), or a story title prefix
   * (`Forms/Input`). When omitted, all enumerated stories are tested.
   */
  stories?: string[];
  /**
   * Optional list of patterns to EXCLUDE. Uses the same matching rules as
   * `stories`. Useful for skipping docs-only entries or work-in-progress
   * stories without touching their source.
   */
  exclude?: string[];
  /**
   * Optional fetch timeout in milliseconds for the index request.
   * Defaults to 15s.
   */
  fetchTimeoutMs?: number;
  /**
   * Root directory of the Storybook project (where `importPath` files live).
   * When omitted, Frontguard walks up from `process.cwd()` looking for
   * `.storybook/main.*`.
   */
  projectRoot?: string;
}

// ---------------------------------------------------------------------------
// Index Schemas (intentionally permissive — we only read a few fields)
// ---------------------------------------------------------------------------

/** Shape of a single story entry in `index.json` (Storybook 8). */
interface RawStoryEntry {
  id: string;
  title?: string;
  name?: string;
  type?: 'story' | 'docs';
  importPath?: string;
  tags?: string[];
  parameters?: {
    frontguard?: StoryFrontguardParameters;
    [key: string]: unknown;
  };
}

/** Storybook 8: `/index.json` payload. */
interface StorybookIndexV5 {
  v: number;
  entries: Record<string, RawStoryEntry>;
}

/** Storybook 7: `/stories.json` payload (v3 shape). */
interface StorybookStoriesV3 {
  v: number;
  stories: Record<string, RawStoryEntry>;
}

// ---------------------------------------------------------------------------
// Matching Helpers
// ---------------------------------------------------------------------------

/** True if the pattern is `*` or `**` (match everything). */
function isWildcard(pattern: string): boolean {
  return pattern === '*' || pattern === '**';
}

/**
 * Glob-ish matcher: `*` matches any run of characters that isn't `/`,
 * `**` matches anything (including `/`). Anchored to the full string.
 */
function globMatch(pattern: string, candidate: string): boolean {
  if (isWildcard(pattern)) return true;

  // Escape regex specials, then re-introduce ** and * as wildcards.
  const escaped = pattern
    .replace(/[\\.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLESTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(candidate);
  } catch {
    return false;
  }
}

/**
 * True when a story matches any of the supplied patterns.
 *
 * A pattern matches when ANY of these is true:
 *   - it equals the story id (`button--primary`)
 *   - it is a glob over `title/name` (`Forms/Input/*`)
 *   - it is a prefix of the title (`Forms/Input`)
 */
function matchesAny(story: { id: string; title?: string; name?: string }, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const title = story.title ?? '';
  const titleAndName = `${title}/${story.name ?? ''}`;
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === story.id) return true;
    if (globMatch(pattern, story.id)) return true;
    if (globMatch(pattern, title)) return true;
    if (globMatch(pattern, titleAndName)) return true;
    if (title.toLowerCase().startsWith(pattern.toLowerCase())) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Index Fetch
// ---------------------------------------------------------------------------

/**
 * Strip a trailing slash from a URL so we can safely append `/index.json`.
 */
function normalizeBase(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Issue a GET against the Storybook server with a timeout.
 * Returns the parsed JSON body, or `null` on any failure (network error,
 * non-2xx, malformed JSON, AbortError).
 */
async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.debug(`Storybook index fetch ${url} → ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.debug(`Storybook index fetch ${url} failed: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the story index from a running Storybook.
 *
 * Tries `/index.json` first (Storybook 8 and 7.6+ generators), then falls
 * back to `/stories.json` (Storybook 7.x and earlier). Returns the
 * normalized entry map plus the detected major version, or `null` if both
 * endpoints fail.
 *
 * Exported for testability — tests can serve fixtures over a static file
 * server and feed the URL in.
 */
export async function fetchStorybookIndex(
  baseUrl: string,
  timeoutMs: number = 15_000,
): Promise<{ entries: Record<string, RawStoryEntry>; storybookMajor: 7 | 8 } | null> {
  const base = normalizeBase(baseUrl);

  // Storybook 8 (and recent 7.6+) — /index.json
  const v5 = await fetchJson(`${base}/index.json`, timeoutMs);
  if (v5 && typeof v5 === 'object' && 'entries' in v5) {
    const parsed = v5 as StorybookIndexV5;
    return { entries: parsed.entries ?? {}, storybookMajor: 8 };
  }

  // Storybook 7 (and older) — /stories.json
  const v3 = await fetchJson(`${base}/stories.json`, timeoutMs);
  if (v3 && typeof v3 === 'object' && 'stories' in v3) {
    const parsed = v3 as StorybookStoriesV3;
    return { entries: parsed.stories ?? {}, storybookMajor: 7 };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route Building
// ---------------------------------------------------------------------------

/**
 * Build the iframe-preview path for a story. The renderer joins this with
 * `config.baseUrl`, which for a Storybook run is the Storybook URL.
 */
export function storyIframePath(storyId: string): string {
  return `/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

/**
 * Build a human-readable label like `Button › Primary` for a story.
 */
function storyLabel(entry: RawStoryEntry): string {
  const title = entry.title?.trim();
  const name = entry.name?.trim();
  if (title && name) return `${title} › ${name}`;
  if (title) return title;
  return entry.id;
}

/**
 * Apply per-story Frontguard parameters to a base Route, returning a new
 * Route with overrides merged in.
 */
function applyStoryParameters(route: Route, params: StoryFrontguardParameters | undefined): Route {
  if (!params) return route;
  const next: Route = { ...route };
  if (params.label) next.label = params.label;
  if (typeof params.threshold === 'number') next.threshold = params.threshold;
  if (Array.isArray(params.viewports) && params.viewports.length > 0) {
    next.viewport = params.viewports.filter((v) => Number.isFinite(v) && v > 0);
  }
  if (Array.isArray(params.ignore) && params.ignore.length > 0) {
    next.ignore = params.ignore;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Public Discovery Entry Point
// ---------------------------------------------------------------------------

/**
 * Result of a Storybook discovery pass.
 */
export interface StorybookDiscoveryResult {
  /** All routes corresponding to capturable stories. */
  routes: Route[];
  /** Detected Storybook major version (7 or 8). */
  storybookMajor: 7 | 8;
  /** Number of entries skipped because `type === 'docs'`. */
  docsSkipped: number;
  /** Number of stories filtered out by the `stories` / `exclude` filters. */
  filtered: number;
  /** Number of stories explicitly skipped via `parameters.frontguard.skip`. */
  paramSkipped: number;
}

/**
 * Enumerate stories from a running Storybook server and return one Route
 * per capturable story.
 *
 * @param sbConfig - Storybook integration configuration.
 * @returns A {@link StorybookDiscoveryResult}, or `null` if the server is
 *          unreachable / returns no index.
 */
export async function discoverStorybookStories(
  sbConfig: StorybookConfig,
): Promise<StorybookDiscoveryResult | null> {
  if (!sbConfig?.url) {
    logger.warn('storybook.url is required for Storybook discovery');
    return null;
  }

  const fetched = await fetchStorybookIndex(sbConfig.url, sbConfig.fetchTimeoutMs ?? 15_000);
  if (!fetched) {
    logger.warn(
      `Could not fetch Storybook index at ${sbConfig.url}. ` +
        'Is Storybook running? Frontguard tried /index.json (Storybook 8) and /stories.json (Storybook 7).',
    );
    return null;
  }

  const { entries, storybookMajor } = fetched;
  const includes = sbConfig.stories ?? [];
  const excludes = sbConfig.exclude ?? [];

  const paramMap = await resolveStoryFrontguardParameters(
    normalizeBase(sbConfig.url),
    Object.values(entries),
    {
      storybookMajor,
      projectRoot: sbConfig.projectRoot,
      fetchTimeoutMs: sbConfig.fetchTimeoutMs,
    },
  );

  const routes: Route[] = [];
  let docsSkipped = 0;
  let filtered = 0;
  let paramSkipped = 0;

  for (const entry of Object.values(entries)) {
    // Skip docs-only entries — they aren't capturable as a story preview.
    if (entry.type && entry.type !== 'story') {
      docsSkipped++;
      continue;
    }

    // Apply explicit exclude first.
    if (excludes.length > 0 && matchesAny(entry, excludes)) {
      filtered++;
      continue;
    }

    // Apply include filter when present.
    if (includes.length > 0 && !matchesAny(entry, includes)) {
      filtered++;
      continue;
    }

    const params = paramMap.get(entry.id) ?? entry.parameters?.frontguard;
    if (params?.skip) {
      paramSkipped++;
      continue;
    }

    const base: Route = {
      path: storyIframePath(entry.id),
      label: storyLabel(entry),
      discoveredVia: 'storybook',
    };
    routes.push(applyStoryParameters(base, params));
  }

  // Stable order for deterministic snapshot grouping.
  routes.sort((a, b) => a.path.localeCompare(b.path));

  logger.info(
    `Storybook discovery (v${storybookMajor}): found ${routes.length} stor${
      routes.length === 1 ? 'y' : 'ies'
    }` +
      (docsSkipped ? ` (skipped ${docsSkipped} docs)` : '') +
      (filtered ? ` (filtered ${filtered})` : '') +
      (paramSkipped ? ` (skipped ${paramSkipped} via parameters.frontguard.skip)` : ''),
  );

  return { routes, storybookMajor, docsSkipped, filtered, paramSkipped };
}

/**
 * Glue for the pipeline: produces a {@link FrontguardConfig}-flavoured
 * route list using {@link discoverStorybookStories}. Returns `null` when
 * no `storybook` block is configured so the caller can fall through to
 * other discovery strategies.
 *
 * The returned config has its `baseUrl` pinned to the Storybook URL so
 * the renderer navigates to `<storybookUrl>/iframe.html?id=…`.
 */
export async function discoverStorybookRoutesForConfig(
  config: FrontguardConfig & { storybook?: StorybookConfig },
): Promise<{ routes: Route[]; storybookUrl: string } | null> {
  if (!config.storybook?.url) return null;
  const result = await discoverStorybookStories(config.storybook);
  if (!result) return null;
  return { routes: result.routes, storybookUrl: normalizeBase(config.storybook.url) };
}

// ---------------------------------------------------------------------------
// Renderer Hook
// ---------------------------------------------------------------------------

/**
 * Browser-side script injected by the renderer to wait for a Storybook
 * story (including its `play()` function) to finish.
 *
 * Strategy:
 *   1. Wait for `window.__STORYBOOK_PREVIEW__` to exist.
 *   2. Watch `storyRenders` (Storybook 8) for `phase === 'completed'` /
 *      `'played'` — this is set after the play function resolves.
 *   3. As a Storybook 7 fallback, listen for the `storyRendered` channel
 *      event and resolve when it fires.
 *   4. Network idle + a final animation frame for paint stability.
 *
 * Times out after `timeoutMs` and resolves anyway — the renderer's existing
 * timeout protections still apply.
 *
 * Exported as a string so the render layer can `page.evaluate` it without
 * pulling this module into the browser bundle.
 */
export const STORYBOOK_READY_SCRIPT = `(timeoutMs) => new Promise((resolve) => {
  const start = Date.now();
  let timer;

  function done(why) {
    if (timer) clearTimeout(timer);
    resolve({ ready: true, reason: why, elapsedMs: Date.now() - start });
  }

  function isCompletedPhase(phase) {
    return phase === 'completed' || phase === 'played' || phase === 'errored' || phase === 'aborted';
  }

  function poll() {
    try {
      const preview = window.__STORYBOOK_PREVIEW__;
      if (preview && preview.storyRenders && typeof preview.storyRenders.entries === 'function') {
        const all = Array.from(preview.storyRenders.entries());
        if (all.length > 0 && all.every(([, r]) => isCompletedPhase(r && r.phase))) {
          return done('phase-complete');
        }
      } else if (preview && preview.urlStore && preview.storyStoreValue) {
        // Storybook 7 fallback: storyStoreValue exists after render
        return done('store-ready');
      } else if (
        document.body &&
        document.body.classList.contains('sb-show-main') &&
        !document.body.classList.contains('sb-show-preparingStory') &&
        !document.body.classList.contains('sb-show-errordisplay')
      ) {
        // Last-resort heuristic — Storybook DOM marker.
        return done('class-heuristic');
      }
    } catch (e) {
      // ignore — keep polling
    }
    if (Date.now() - start > timeoutMs) return done('timeout');
    requestAnimationFrame(poll);
  }

  // Also subscribe to the channel for SB7 'storyRendered' as a backup signal.
  try {
    const preview = window.__STORYBOOK_PREVIEW__;
    if (preview && preview.channel && typeof preview.channel.once === 'function') {
      preview.channel.once('storyRendered', () => done('event-storyRendered'));
    }
  } catch (e) { /* noop */ }

  timer = setTimeout(() => done('timeout'), timeoutMs + 250);
  poll();
})`;
