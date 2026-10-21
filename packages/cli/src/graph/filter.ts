/**
 * Smart route filtering via dependency graph analysis.
 *
 * Main entry point that ties the parser and resolver together. Determines
 * which routes are affected by the current set of file changes, so only
 * those pages need to be re-rendered.
 *
 * This is purely an optimization — if anything fails, or the graph cannot
 * prove which routes are unaffected, it falls back to rendering ALL routes.
 * Smart filter should never cause missed regressions.
 *
 * Incomplete analysis (render every route, and say why):
 * - a deleted path, because its former dependents can no longer be walked
 * - a `public/` or `static/` file, or an image/font no import edge names
 * - a relative import in a changed file or route entry that did not resolve
 * - a dependency walk that hit its file cap
 *
 * @module graph/filter
 */

import type { Route, FrontguardConfig } from '../core/types.js';
import { buildDependencyGraph } from './parser.js';
import {
  mapRoutesToFiles,
  getChangedPaths,
  filterAffectedRoutes,
  incompleteAnalysisReason,
} from './resolver.js';
import { pinnedDiffBase } from './diff-base.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of the smart filtering operation. */
export interface SmartFilterResult {
  /** Routes that should be rendered (affected by changes). */
  filtered: Route[];
  /** Routes that were skipped (not affected by changes). */
  skipped: Route[];
  /** Human-readable explanation of the filtering result. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns all routes with a given reason — the "include everything" fallback.
 */
function includeAll(routes: Route[], reason: string): SmartFilterResult {
  return {
    filtered: [...routes],
    skipped: [],
    reason,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyzes changed files and dependency graph to determine which routes
 * need re-rendering.
 *
 * Flow:
 * 1. Honor an explicit renderer-fingerprint bypass (before the smart-render gate)
 * 2. Check if smart rendering is enabled
 * 3. Detect changed files via Git
 * 4. Map routes to their source file entry points
 * 5. Build dependency graph from route entry files
 * 6. Filter routes using transitive dependency analysis
 *
 * All failure modes fall back to rendering ALL routes with a warning.
 * This function NEVER throws — it catches everything and degrades gracefully.
 *
 * @param routes - All discovered routes to potentially filter
 * @param config - Frontguard configuration
 * @param options - Optional bypass. When `bypassReason` is set, every route is rendered and the reason is logged.
 * @returns Filtered + skipped routes with explanation
 */
export async function smartFilter(
  routes: Route[],
  config: FrontguardConfig,
  options?: { bypassReason?: string },
): Promise<SmartFilterResult> {
  // A browser-build or comparator change makes a scoped render untrustworthy.
  // Checked before the smart-render gate so the log says why every route ran.
  if (options?.bypassReason) {
    logger.warn(options.bypassReason);
    return includeAll(routes, options.bypassReason);
  }

  // --all-routes asks for every route without turning off capture stabilization.
  if (config.includeAllRoutes) {
    return includeAll(routes, 'all routes requested; capture settings unchanged');
  }

  // Gate: smart rendering must be enabled
  if (!config.smartRender) {
    return includeAll(routes, 'smart rendering disabled');
  }

  // Gate: need routes to filter
  if (routes.length === 0) {
    return includeAll(routes, 'no routes to filter');
  }

  // A merge queue's origin/main is not the queued base. Without a pin, render
  // every route instead of diffing the wrong branch. #306 selects a per-PR base.
  if (process.env.GITHUB_EVENT_NAME === 'merge_group' && pinnedDiffBase() === null) {
    return includeAll(
      routes,
      'merge_group has no FRONTGUARD_DIFF_BASE; rendering all routes',
    );
  }

  // Step 1: Detect changed files, including deletions
  let changedFiles: string[];
  let removedFiles: string[];
  try {
    const changed = getChangedPaths(process.cwd());
    if (changed.pinnedDiffError) {
      logger.warn(changed.pinnedDiffError);
      return includeAll(routes, changed.pinnedDiffError);
    }
    changedFiles = changed.present;
    removedFiles = changed.removed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Could not detect changed files: ${msg}`);
    return includeAll(routes, `could not detect changed files: ${msg}`);
  }

  if (changedFiles.length === 0 && removedFiles.length === 0) {
    return includeAll(routes, 'no changes detected');
  }

  logger.debug(`Changed files (${changedFiles.length}):`);
  for (const f of changedFiles.slice(0, 10)) {
    logger.debug(`  ${f}`);
  }
  if (changedFiles.length > 10) {
    logger.debug(`  ... and ${changedFiles.length - 10} more`);
  }

  // Step 2: Map routes to their source files
  let routeFileMap: Map<string, string[]>;
  try {
    routeFileMap = mapRoutesToFiles(routes, process.cwd());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Route-to-file mapping failed: ${msg}`);
    return includeAll(routes, `route-to-file mapping failed: ${msg}`);
  }

  // Collect all entry files for the dependency graph
  const allEntryFiles: string[] = [];
  for (const files of routeFileMap.values()) {
    allEntryFiles.push(...files);
  }

  // If no entry files were found, we can't do dependency analysis
  if (allEntryFiles.length === 0) {
    logger.info('No route entry files found — rendering all routes');
    return includeAll(routes, 'no route entry files found on disk');
  }

  // Step 3: Build dependency graph
  let graph: Map<string, Set<string>>;
  try {
    graph = buildDependencyGraph(allEntryFiles, process.cwd());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Dependency graph build failed: ${msg}`);
    return includeAll(routes, `dependency graph build failed: ${msg}`);
  }

  const gap = incompleteAnalysisReason({
    changedFiles,
    removedFiles,
    graph,
    entryFiles: allEntryFiles,
    projectDir: process.cwd(),
  });
  if (gap) {
    logger.warn(gap);
    return includeAll(routes, gap);
  }

  // Step 4: Filter affected routes
  let affected: Route[];
  try {
    affected = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Route filtering failed: ${msg}`);
    return includeAll(routes, `route filtering failed: ${msg}`);
  }

  // Build results
  const affectedPaths = new Set(affected.map((r) => r.path));
  const skipped = routes.filter((r) => !affectedPaths.has(r.path));

  // Determine reason
  let reason: string;
  if (affected.length === routes.length) {
    reason = `all ${routes.length} routes affected by ${changedFiles.length} changed file(s)`;
  } else if (affected.length === 0) {
    // This shouldn't happen (routes with no mapping are always included),
    // but handle it gracefully — never miss a regression
    logger.warn('Smart filter produced 0 affected routes — falling back to all');
    return includeAll(routes, 'smart filter returned empty — rendering all as safety fallback');
  } else {
    reason = `${affected.length}/${routes.length} routes affected by ${changedFiles.length} changed file(s)`;
  }

  logger.info(`Dependency graph: ${reason}`);

  if (skipped.length > 0) {
    logger.info(
      `Skipping ${skipped.length} unaffected route(s): ${skipped.map((r) => r.path).join(', ')}`,
    );
  }

  return {
    filtered: affected,
    skipped,
    reason,
  };
}
