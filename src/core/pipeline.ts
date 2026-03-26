/**
 * Main pipeline orchestrator for Frontguard.
 *
 * Coordinates the full visual regression testing flow:
 *   discover → filter → render → compare → analyze → report
 *
 * Each stage has an error boundary — one failing page doesn't kill the run.
 *
 * @module core/pipeline
 */

import type {
  FrontguardConfig,
  Route,
  ScreenshotResult,
  DiffResult,
  RunResult,
  RunTiming,
  Reporter,
  PipelineStage,
} from './types.js';
import { discoverRoutes } from '../discovery/crawler.js';
import { discoverRoutesFromFilesystem } from '../discovery/filesystem.js';
import { renderPages } from '../render/playwright.js';
import { compareScreenshot, createNewPageResult } from '../diff/pixel.js';
import { analyzeWithAI } from '../diff/ai-vision.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Measures execution time of an async function.
 * @returns Tuple of [result, durationMs]
 */
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round(performance.now() - start)];
}

/**
 * Converts explicit route strings from config into Route objects.
 */
function toRouteObjects(paths: string[]): Route[] {
  return paths.map((path) => ({
    path,
    label: path === '/' ? 'Home' : path,
    discoveredVia: 'config' as const,
  }));
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the full Frontguard visual regression pipeline.
 *
 * Pipeline stages:
 * 1. **Discover** — Find routes via config, crawling, or filesystem detection
 * 2. **Filter**   — Placeholder for dependency-graph filtering (pass-through)
 * 3. **Render**   — Capture screenshots with Playwright
 * 4. **Compare**  — Diff against baselines using pixelmatch
 * 5. **Analyze**  — (Optional) AI-powered classification of changes
 * 6. **Report**   — Output results via configured reporter
 *
 * @param config   - Validated Frontguard configuration
 * @param reporter - Reporter for real-time progress output
 * @returns Complete run results with timing and diffs
 */
export async function runPipeline(
  config: FrontguardConfig,
  reporter: Reporter,
): Promise<RunResult> {
  const totalStart = performance.now();

  const timing: RunTiming = {
    discovery: 0,
    render: 0,
    compare: 0,
    ai: 0,
    total: 0,
  };

  // -----------------------------------------------------------------------
  // Stage 1: DISCOVER
  // -----------------------------------------------------------------------
  let routes: Route[] = [];

  reporter.onStageStart('discover', 'Determining routes to test…');
  try {
    const [discovered, duration] = await timed(async () => {
      // 1a. Explicit routes from config
      if (config.routes && config.routes.length > 0) {
        logger.info(`Using ${config.routes.length} configured route(s)`);
        return toRouteObjects(config.routes);
      }

      // 1b. Crawl if discover options are set
      if (config.discover) {
        logger.info(`Crawling from ${config.discover.startUrl ?? '/'}…`);
        return discoverRoutes(config);
      }

      // 1c. Try filesystem, fall back to crawl from '/'
      logger.info('No routes configured — attempting filesystem discovery…');
      const fsRoutes = discoverRoutesFromFilesystem(process.cwd());
      if (fsRoutes && fsRoutes.length > 0) {
        logger.info(`Discovered ${fsRoutes.length} route(s) from filesystem`);
        return fsRoutes;
      }

      // 1d. Fall back: crawl from baseUrl root
      logger.info('Filesystem discovery found nothing — crawling from /');
      const crawlConfig: FrontguardConfig = {
        ...config,
        discover: {
          startUrl: '/',
          maxDepth: 3,
          maxRoutes: 50,
          exclude: [],
        },
      };
      return discoverRoutes(crawlConfig);
    });

    routes = discovered;
    timing.discovery = duration;
    reporter.onStageComplete('discover', `Found ${routes.length} route(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Discovery failed: ${msg}`);
    reporter.onStageComplete('discover', `Failed — falling back to /`);

    // Absolute fallback: just test the root
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
  }

  if (routes.length === 0) {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    logger.warn('No routes discovered — testing base URL only');
  }

  // -----------------------------------------------------------------------
  // Stage 2: FILTER (placeholder for dependency graph)
  // -----------------------------------------------------------------------
  reporter.onStageStart('filter', 'Filtering routes…');
  logger.info(
    `Dependency graph: skipped (not yet implemented), rendering all ${routes.length} routes`,
  );
  const filteredRoutes = routes; // pass through for now
  reporter.onStageComplete('filter', `${filteredRoutes.length} route(s) to render`);

  const totalCombinations =
    filteredRoutes.length * config.viewports.length * config.browsers.length;
  logger.info(
    `Testing ${filteredRoutes.length} route(s) × ${config.viewports.length} viewport(s) × ${config.browsers.length} browser(s) = ${totalCombinations} combination(s)`,
  );

  // -----------------------------------------------------------------------
  // Stage 3: RENDER
  // -----------------------------------------------------------------------
  let screenshots: ScreenshotResult[] = [];

  reporter.onStageStart('render', `Capturing ${totalCombinations} screenshot(s)…`);
  try {
    const [captured, duration] = await timed(async () => {
      const results = await renderPages(filteredRoutes, config);

      // Report progress per screenshot
      results.forEach((shot, i) => {
        reporter.onStageProgress(
          'render',
          i + 1,
          totalCombinations,
          `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`,
        );
      });

      return results;
    });

    screenshots = captured;
    timing.render = duration;
    reporter.onStageComplete('render', `Captured ${screenshots.length} screenshot(s) in ${duration}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Render stage failed: ${msg}`);
    reporter.onStageComplete('render', `Failed: ${msg}`);
  }

  if (screenshots.length === 0) {
    logger.error('No screenshots were captured — cannot proceed with comparison');
    const emptyResult = buildResult([], timing, totalStart, config);
    reporter.onComplete(emptyResult);
    return emptyResult;
  }

  // -----------------------------------------------------------------------
  // Stage 4: COMPARE
  // -----------------------------------------------------------------------
  const diffs: DiffResult[] = [];

  reporter.onStageStart('compare', 'Comparing against baselines…');
  try {
    const [, duration] = await timed(async () => {
      // Init storage
      const storage = new GitOrphanStorage(process.cwd());
      try {
        await storage.init();
      } catch (err) {
        logger.warn(
          `Baseline storage init failed: ${err instanceof Error ? err.message : String(err)}. ` +
            'All screenshots will be treated as new.',
        );
      }

      for (let i = 0; i < screenshots.length; i++) {
        const shot = screenshots[i];
        try {
          const baseline = await storage.readBaseline(
            shot.route.path,
            shot.viewport,
            shot.browser,
          );

          let diff: DiffResult;

          if (!baseline) {
            // No baseline exists — this is a new page
            diff = createNewPageResult(shot);
            logger.debug(`New page: ${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`);
          } else {
            // Compare against existing baseline
            diff = compareScreenshot(shot, baseline, config.threshold);

            // Mark regressions vs changes based on threshold
            if (diff.status === 'changed' && diff.diffPercentage > config.threshold * 100) {
              diff = { ...diff, status: 'regression' };
            }
          }

          diffs.push(diff);

          reporter.onStageProgress(
            'compare',
            i + 1,
            screenshots.length,
            `${shot.route.path} @ ${shot.viewport}px → ${diff.status} (${diff.diffPercentage.toFixed(2)}%)`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Comparison failed for ${shot.route.path}: ${msg}`);
          diffs.push({
            route: shot.route,
            viewport: shot.viewport,
            browser: shot.browser,
            status: 'error',
            diffPercentage: 0,
            error: msg,
          });
        }
      }
    });

    timing.compare = duration;
    reporter.onStageComplete('compare', `Compared ${diffs.length} screenshot(s) in ${duration}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Compare stage failed: ${msg}`);
    reporter.onStageComplete('compare', `Failed: ${msg}`);
  }

  // -----------------------------------------------------------------------
  // Stage 5: ANALYZE (optional — AI)
  // -----------------------------------------------------------------------
  if (config.ai) {
    const changedDiffs = diffs.filter(
      (d) => d.status === 'changed' || d.status === 'regression',
    );

    if (changedDiffs.length > 0) {
      reporter.onStageStart(
        'analyze',
        `Analyzing ${changedDiffs.length} change(s) with ${config.ai.provider}/${config.ai.model}…`,
      );

      try {
        const [, duration] = await timed(async () => {
          for (let i = 0; i < changedDiffs.length; i++) {
            const diff = changedDiffs[i];
            try {
              const analysis = await analyzeWithAI(diff, config.ai!);
              diff.aiAnalysis = analysis;

              // If AI says intentional with high confidence, downgrade regression → warning status
              if (
                analysis.classification === 'intentional' &&
                analysis.confidence >= 0.8
              ) {
                logger.info(
                  `AI classified ${diff.route.path} as intentional (confidence: ${analysis.confidence}) — downgrading to pass`,
                );
                // We don't change status to a literal "warning" since DiffStatus has no 'warning',
                // but we keep it as 'changed' (below regression threshold) to signal it's not critical
                diff.status = 'changed';
              }

              reporter.onStageProgress(
                'analyze',
                i + 1,
                changedDiffs.length,
                `${diff.route.path} → ${analysis.classification} (${(analysis.confidence * 100).toFixed(0)}%)`,
              );
            } catch (err) {
              logger.warn(
                `AI analysis failed for ${diff.route.path}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        });

        timing.ai = duration;
        reporter.onStageComplete('analyze', `Analyzed ${changedDiffs.length} change(s) in ${duration}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`AI analysis stage failed: ${msg}`);
        reporter.onStageComplete('analyze', `Failed: ${msg}`);
      }
    } else {
      logger.debug('No changed pages to analyze with AI');
    }
  }

  // -----------------------------------------------------------------------
  // Stage 6: BUILD RESULT
  // -----------------------------------------------------------------------
  timing.total = Math.round(performance.now() - totalStart);
  const result = buildResult(diffs, timing, totalStart, config);

  // -----------------------------------------------------------------------
  // Stage 7: REPORT
  // -----------------------------------------------------------------------
  reporter.onStageStart('report', 'Generating report…');
  try {
    reporter.onComplete(result);
    reporter.onStageComplete('report', 'Done');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Reporter failed: ${msg}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Update Baselines
// ---------------------------------------------------------------------------

/**
 * Discovers routes, renders all pages, and writes all screenshots as new baselines.
 * Used by the `frontguard update-baselines` command.
 *
 * @param config   - Validated Frontguard configuration
 * @param reporter - Reporter for progress output
 */
export async function updateBaselines(
  config: FrontguardConfig,
  reporter: Reporter,
): Promise<void> {
  reporter.onStageStart('init', 'Updating baselines…');

  // Discover routes (same logic as runPipeline stage 1)
  let routes: Route[];

  if (config.routes && config.routes.length > 0) {
    routes = toRouteObjects(config.routes);
    logger.info(`Using ${routes.length} configured route(s)`);
  } else if (config.discover) {
    logger.info(`Crawling from ${config.discover.startUrl ?? '/'}…`);
    routes = await discoverRoutes(config);
  } else {
    const fsRoutes = discoverRoutesFromFilesystem(process.cwd());
    if (fsRoutes && fsRoutes.length > 0) {
      routes = fsRoutes;
    } else {
      routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    }
  }

  logger.info(`Rendering ${routes.length} route(s) for baseline update…`);
  reporter.onStageStart('render', `Capturing screenshots for ${routes.length} route(s)…`);

  const screenshots = await renderPages(routes, config);
  reporter.onStageComplete('render', `Captured ${screenshots.length} screenshot(s)`);

  // Init storage and write all baselines
  reporter.onStageStart('compare', 'Writing baselines…');
  const storage = new GitOrphanStorage(process.cwd());
  await storage.init();

  let written = 0;
  for (const shot of screenshots) {
    try {
      await storage.writeBaseline(
        shot.route.path,
        shot.viewport,
        shot.browser,
        shot.buffer,
      );
      written++;

      reporter.onStageProgress(
        'compare',
        written,
        screenshots.length,
        `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`,
      );
    } catch (err) {
      logger.error(
        `Failed to write baseline for ${shot.route.path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Update manifest
  const manifest = (await storage.readManifest()) ?? {
    schemaVersion: 1,
    createdBy: 'frontguard@0.1.0',
    updatedAt: new Date().toISOString(),
    routes: {},
  };

  for (const shot of screenshots) {
    const existing = manifest.routes[shot.route.path];
    manifest.routes[shot.route.path] = {
      viewports: [
        ...new Set([...(existing?.viewports ?? []), shot.viewport]),
      ],
      browsers: [
        ...new Set([...(existing?.browsers ?? []), shot.browser]),
      ],
      lastUpdated: new Date().toISOString(),
    };
  }
  manifest.updatedAt = new Date().toISOString();
  await storage.writeManifest(manifest);

  reporter.onStageComplete('compare', `Wrote ${written} baseline(s)`);
  logger.info(`✅ Updated ${written} baseline(s) successfully`);
}

// ---------------------------------------------------------------------------
// Internal: Build RunResult
// ---------------------------------------------------------------------------

function buildResult(
  diffs: DiffResult[],
  timing: RunTiming,
  _totalStart: number,
  config: FrontguardConfig,
): RunResult {
  const summary = {
    total: diffs.length,
    passed: diffs.filter((d) => d.status === 'pass').length,
    regressions: diffs.filter((d) => d.status === 'regression').length,
    warnings: diffs.filter(
      (d) => d.status === 'changed' && d.diffPercentage > 0,
    ).length,
    newPages: diffs.filter((d) => d.status === 'new').length,
    errors: diffs.filter((d) => d.status === 'error').length,
  };

  return {
    summary,
    diffs,
    timing,
    config,
  };
}
