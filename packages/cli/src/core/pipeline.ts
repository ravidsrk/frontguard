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

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  FrontguardConfig,
  Route,
  RouteEntry,
  ScreenshotResult,
  DiffResult,
  RunResult,
  RunTiming,
  Reporter,
  AccessibilityResult,
  AccessibilityViolation,
} from './types.js';
import type { JudgeResult } from './types.js';
import { discoverRoutes } from '../discovery/crawler.js';
import { discoverRoutesFromFilesystem } from '../discovery/filesystem.js';
import { smartFilter } from '../graph/filter.js';
import { renderPages } from '../render/playwright.js';
import { compareScreenshot, createNewPageResult } from '../diff/pixel.js';
import { analyzeWithAI } from '../diff/ai-vision.js';
import { judgeScreenshot } from '../diff/model-judge.js';
import { fetchDesignReference } from '../plugins/figma.js';
import { generateFix, FIX_CATEGORIES } from '../diff/ai-fix.js';
import { verifyFix } from '../sandbox/verify-fix.js';
import { FixPatternDB, contextHashFor } from '../storage/fix-patterns.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { uploadImages } from '../storage/upload-stage.js';
import { detectPreviewUrl, waitForUrl } from '../utils/preview-url.js';
import { logger } from '../utils/logger.js';
import { PluginManager } from './plugins.js';

// ---------------------------------------------------------------------------
// Memory Management Helpers
// ---------------------------------------------------------------------------

/** Default number of AI calls to run in parallel. */
const AI_BATCH_SIZE = 5;

/** Number of comparisons to run in parallel. */
const COMPARE_BATCH_SIZE = 5;

/** Number of screenshots to render in each memory-management chunk. */
const RENDER_CHUNK_SIZE = 10;

/**
 * Dispose large image buffers on a DiffResult that is not flagged as changed.
 * Passing pages don't need their images kept in memory for reports — the
 * HTML reporter can read them lazily from a temp directory if needed.
 */
function disposeBuffers(diff: DiffResult): void {
  diff.baselineImage = undefined;
  diff.currentImage = undefined;
  diff.diffImage = undefined;
}

/**
 * Persist an image buffer to a temp directory and return the path.
 * Returns empty string if the buffer is undefined.
 */
function persistBufferToTemp(
  tempDir: string,
  key: string,
  buf: Buffer | undefined,
): string {
  if (!buf || buf.length === 0) return '';
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
  const filePath = join(tempDir, safeName);
  writeFileSync(filePath, buf);
  return filePath;
}

/**
 * Read an image buffer back from a temp file path.
 * Returns undefined if path is empty or the file doesn't exist.
 */
function readBufferFromTemp(filePath: string): Buffer | undefined {
  if (!filePath) return undefined;
  try {
    return readFileSync(filePath);
  } catch {
    return undefined;
  }
}

/**
 * Process items in parallel batches using Promise.allSettled.
 */
async function processBatched<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => fn(item, i + batchIndex)),
    );
    results.push(...batchResults);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL patterns that indicate no real base URL has been configured. */
const DEFAULT_URL_PATTERNS = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

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
 * Converts explicit route entries from config into Route objects.
 *
 * Each entry is either a plain path string or a {@link RouteConfig} object
 * carrying per-route `threshold`, `ignore`, and `viewport` overrides. The
 * overrides are copied onto the runtime Route so the compare stage can apply
 * them without re-reading the config.
 */
export function toRouteObjects(entries: RouteEntry[]): Route[] {
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return {
        path: entry,
        label: entry === '/' ? 'Home' : entry,
        discoveredVia: 'config' as const,
      };
    }
    return {
      path: entry.path,
      label: entry.label ?? (entry.path === '/' ? 'Home' : entry.path),
      discoveredVia: 'config' as const,
      threshold: entry.threshold,
      ignore: entry.ignore,
      viewport: entry.viewport,
    };
  });
}

/**
 * Resolves the effective pixel-diff threshold for a route, preferring the
 * per-route override when present and falling back to the global threshold.
 *
 * @param route           - The route being compared.
 * @param globalThreshold - The global config threshold (fraction 0–1).
 * @returns The threshold to use for this route.
 */
export function resolveThreshold(route: Route, globalThreshold: number): number {
  return typeof route.threshold === 'number' ? route.threshold : globalThreshold;
}

/**
 * Discovers routes using the shared strategy:
 *   1. Explicit routes from config
 *   2. Crawl if discover options are set
 *   3. Filesystem discovery, falling back to crawl from '/'
 *
 * Used by both `runPipeline` and `updateBaselines` to avoid duplication.
 */
async function discoverAllRoutes(config: FrontguardConfig): Promise<Route[]> {
  // 1. Explicit routes from config
  if (config.routes && config.routes.length > 0) {
    logger.info(`Using ${config.routes.length} configured route(s)`);
    return toRouteObjects(config.routes);
  }

  // 2. Crawl if discover options are set
  if (config.discover) {
    logger.info(`Crawling from ${config.discover.startUrl ?? '/'}…`);
    return discoverRoutes(config);
  }

  // 3. Try filesystem, fall back to crawl from '/'
  logger.info('No routes configured — attempting filesystem discovery…');
  const fsRoutes = discoverRoutesFromFilesystem(process.cwd());
  if (fsRoutes && fsRoutes.length > 0) {
    logger.info(`Discovered ${fsRoutes.length} route(s) from filesystem`);
    return fsRoutes;
  }

  // 4. Fall back: crawl from baseUrl root
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
  // Plugin setup
  // -----------------------------------------------------------------------
  const pluginManager = new PluginManager();
  const pluginCtx = { config, logger, metadata: new Map<string, unknown>() };
  if (config.plugins) {
    for (const plugin of config.plugins) {
      pluginManager.register(plugin);
    }
    await pluginManager.setup(pluginCtx);
  }

  try {

  // -----------------------------------------------------------------------
  // Stage 0: PREVIEW URL DETECTION
  // -----------------------------------------------------------------------
  const isDefaultUrl =
    !config.baseUrl ||
    DEFAULT_URL_PATTERNS.some((pattern) => config.baseUrl.startsWith(pattern));

  if (isDefaultUrl) {
    const previewUrl = detectPreviewUrl();
    if (previewUrl) {
      logger.info(`Using preview URL: ${previewUrl}`);
      config = { ...config, baseUrl: previewUrl };

      // Wait for the deployment to be ready before proceeding
      const isReady = await waitForUrl(previewUrl, {
        maxAttempts: 10,
        intervalMs: 15_000,
      });

      if (!isReady) {
        logger.warn(
          `Preview URL ${previewUrl} is not responding — proceeding anyway (may fail during render)`,
        );
      }
    } else {
      logger.debug('No preview URL detected — using configured baseUrl');
    }
  }

  // -----------------------------------------------------------------------
  // Stage 1: DISCOVER
  // -----------------------------------------------------------------------
  let routes: Route[] = [];

  // Plugin hook: beforeDiscover — can modify config before discovery
  config = await pluginManager.runHook('beforeDiscover', config);

  reporter.onStageStart('discover', 'Determining routes to test…');
  try {
    const [discovered, duration] = await timed(() => discoverAllRoutes(config));

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

  // Plugin hook: afterDiscover — can add, remove, or modify routes
  routes = await pluginManager.runHook('afterDiscover', routes, config);

  // -----------------------------------------------------------------------
  // Stage 2: FILTER (dependency graph analysis)
  // -----------------------------------------------------------------------
  let filteredRoutes: Route[] = routes;

  reporter.onStageStart('filter', 'Analyzing dependency graph…');
  try {
    const [filterResult, filterDuration] = await timed(async () =>
      smartFilter(routes, config),
    );

    filteredRoutes = filterResult.filtered;
    const skippedCount = filterResult.skipped.length;

    if (skippedCount > 0) {
      logger.info(
        `Smart filter: ${filterResult.reason} (${filterDuration}ms)`,
      );
      logger.info(
        `Skipped ${skippedCount} unaffected route(s): ${filterResult.skipped.map((r) => r.path).join(', ')}`,
      );
    } else {
      logger.info(
        `Smart filter: ${filterResult.reason} (${filterDuration}ms)`,
      );
    }

    reporter.onStageComplete(
      'filter',
      `${filteredRoutes.length}/${routes.length} route(s) to render — ${filterResult.reason}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Smart filter failed: ${msg} — rendering all ${routes.length} routes`);
    filteredRoutes = routes;
    reporter.onStageComplete('filter', `${filteredRoutes.length} route(s) to render (filter failed, rendering all)`);
  }

  const totalCombinations =
    filteredRoutes.length * config.viewports.length * config.browsers.length;
  logger.info(
    `Testing ${filteredRoutes.length} route(s) × ${config.viewports.length} viewport(s) × ${config.browsers.length} browser(s) = ${totalCombinations} combination(s)`,
  );

  // -----------------------------------------------------------------------
  // Stage 3: RENDER
  // -----------------------------------------------------------------------
  let screenshots: ScreenshotResult[] = [];

  // Plugin hook: beforeRender — can modify routes or config per-render
  {
    const renderInput = await pluginManager.runHook(
      'beforeRender',
      { routes: filteredRoutes, config },
    );
    if (renderInput && renderInput.routes) filteredRoutes = renderInput.routes;
    if (renderInput && renderInput.config) config = renderInput.config;
  }

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

  // Plugin hook: afterRender — can modify screenshots before comparison
  if (screenshots.length > 0) {
    screenshots = await pluginManager.runHook('afterRender', screenshots, pluginCtx);
  }

  if (screenshots.length === 0) {
    logger.error('No screenshots were captured — cannot proceed with comparison');
    const emptyResult = buildResult([], timing, totalStart, config);
    reporter.onComplete(emptyResult);
    await pluginManager.teardown();
    return emptyResult;
  }

  // -----------------------------------------------------------------------
  // Stage 4: COMPARE (with memory management)
  // -----------------------------------------------------------------------
  const diffs: DiffResult[] = [];

  // Create a temp directory for persisting images of changed pages
  // so we can free memory during comparison and restore lazily for reports.
  const tempDir = join(tmpdir(), `frontguard-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  // Track temp file paths for changed diffs so we can restore buffers for reporting
  const tempPaths = new Map<number, { baseline: string; current: string; diff: string }>();

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

      let completed = 0;
      const batchResults = await processBatched(
        screenshots,
        COMPARE_BATCH_SIZE,
        async (shot, i) => {
          const baseline = await storage.readBaseline(
            shot.route.path,
            shot.viewport,
            shot.browser,
          );

          let diff: DiffResult;

          // Resolve the effective threshold: per-route override wins over global.
          const effectiveThreshold = resolveThreshold(shot.route, config.threshold);

          if (!baseline) {
            // No baseline exists — this is a new page
            diff = createNewPageResult(shot);
            logger.debug(`New page: ${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`);
          } else {
            // Compare against existing baseline using the effective threshold
            diff = compareScreenshot(shot, baseline, effectiveThreshold);

            // Mark regressions vs changes based on the effective threshold
            if (diff.status === 'changed' && diff.diffPercentage > effectiveThreshold * 100) {
              diff = { ...diff, status: 'regression' };
            }
          }

          // Null out the screenshot buffer — it's been compared and is no longer needed
          (shot as { buffer: Buffer | null }).buffer = null!;

          completed++;
          reporter.onStageProgress(
            'compare',
            completed,
            screenshots.length,
            `${shot.route.path} @ ${shot.viewport}px → ${diff.status} (${diff.diffPercentage.toFixed(2)}%)`,
          );

          return { diff, index: i };
        },
      );

      // Collect results and manage memory
      for (const outcome of batchResults) {
        if (outcome.status === 'fulfilled') {
          const { diff, index: diffIndex } = outcome.value;
          diffs.push(diff);
          const storedIndex = diffs.length - 1;

          // Memory optimization: persist changed/regression images to temp dir
          // and free the buffers. Passing diffs don't need images at all.
          const isChanged = diff.status === 'changed' || diff.status === 'regression' || diff.status === 'new';
          if (isChanged) {
            const _shot = screenshots[diffIndex] ?? diff;
            const key = `${storedIndex}_${diff.route.path}_${diff.viewport}_${diff.browser}`;
            tempPaths.set(storedIndex, {
              baseline: persistBufferToTemp(tempDir, `${key}_baseline`, diff.baselineImage),
              current: persistBufferToTemp(tempDir, `${key}_current`, diff.currentImage),
              diff: persistBufferToTemp(tempDir, `${key}_diff`, diff.diffImage),
            });
            // Free in-memory buffers now that they're persisted to disk
            disposeBuffers(diff);
          } else {
            // Not changed — no need to keep buffers at all
            disposeBuffers(diff);
          }
        } else {
          const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          logger.error(`Comparison failed: ${msg}`);
          diffs.push({
            route: { path: 'unknown', label: 'unknown' },
            viewport: 0,
            browser: 'chromium',
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

  // Free the screenshots array — all data has been extracted
  screenshots = [];

  // Plugin hook: afterCompare — can modify diff results or add custom analysis
  // Note: image buffers may have been persisted to temp and disposed.
  // Plugins operating on diffs should work with status/diffPercentage/metadata.
  {
    const modifiedDiffs = await pluginManager.runHook('afterCompare', diffs, pluginCtx);
    // Only replace diffs if the hook returned a DIFFERENT array
    if (modifiedDiffs !== undefined && modifiedDiffs !== diffs) {
      diffs.length = 0;
      diffs.push(...modifiedDiffs);
    }
  }

  // -----------------------------------------------------------------------
  // Stage 5: ANALYZE (optional — AI, parallelised in batches)
  // -----------------------------------------------------------------------
  if (config.ai) {
    // Restore image buffers from temp for changed diffs so AI can analyze them
    const changedDiffsWithIndices: Array<{ diff: DiffResult; index: number }> = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      if (d.status === 'changed' || d.status === 'regression') {
        // Restore buffers from temp so AI can access the images
        const paths = tempPaths.get(i);
        if (paths) {
          d.baselineImage = readBufferFromTemp(paths.baseline);
          d.currentImage = readBufferFromTemp(paths.current);
          d.diffImage = readBufferFromTemp(paths.diff);
        }
        changedDiffsWithIndices.push({ diff: d, index: i });
      }
    }

    if (changedDiffsWithIndices.length > 0) {
      reporter.onStageStart(
        'analyze',
        `Analyzing ${changedDiffsWithIndices.length} change(s) with ${config.ai.provider}/${config.ai.model} (batch size: ${AI_BATCH_SIZE})…`,
      );

      const aiConfig = config.ai;
      let completed = 0;

      // Build an accessibility lookup so AI analysis can correlate a visual
      // change with known a11y issues on the same route × viewport (e.g. a
      // contrast regression that is also a visual change). Populated by the
      // accessibility plugin's afterRender hook, which runs before this stage.
      const a11yByKey = new Map<string, AccessibilityViolation[]>();
      const a11yMeta = pluginCtx.metadata.get('accessibility:results');
      if (Array.isArray(a11yMeta)) {
        for (const r of a11yMeta as AccessibilityResult[]) {
          if (r?.violations?.length) a11yByKey.set(`${r.route}@${r.viewport}`, r.violations);
        }
      }

      try {
        const [, duration] = await timed(async () => {
          await processBatched(
            changedDiffsWithIndices,
            AI_BATCH_SIZE,
            async ({ diff }) => {
              const accessibility = a11yByKey.get(`${diff.route.path}@${diff.viewport}`);
              const analysis = await analyzeWithAI(
                diff,
                aiConfig,
                accessibility ? { accessibility } : undefined,
              );
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

              completed++;
              reporter.onStageProgress(
                'analyze',
                completed,
                changedDiffsWithIndices.length,
                `${diff.route.path} → ${analysis.classification} (${(analysis.confidence * 100).toFixed(0)}%)`,
              );

              return analysis;
            },
          );
        });

        timing.ai = duration;
        reporter.onStageComplete('analyze', `Analyzed ${changedDiffsWithIndices.length} change(s) in ${duration}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`AI analysis stage failed: ${msg}`);
        reporter.onStageComplete('analyze', `Failed: ${msg}`);
      }

      // Free AI buffers again after analysis — they'll be restored for reporting
      for (const { diff } of changedDiffsWithIndices) {
        disposeBuffers(diff);
      }
    } else {
      logger.debug('No changed pages to analyze with AI');
    }
  }

  // -----------------------------------------------------------------------
  // Stage 5.5: GENERATE FIXES (optional — AI CSS fixes for regressions)
  // -----------------------------------------------------------------------
  if (config.ai && config.generateFixes) {
    const aiConfig = config.ai;
    // Only attempt fixes for genuine regressions identified by AI.
    const regressionDiffs: Array<{ diff: DiffResult; index: number }> = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      if (d.aiAnalysis?.classification === 'regression') {
        const paths = tempPaths.get(i);
        if (paths) {
          d.baselineImage = readBufferFromTemp(paths.baseline);
          d.currentImage = readBufferFromTemp(paths.current);
          d.diffImage = readBufferFromTemp(paths.diff);
        }
        regressionDiffs.push({ diff: d, index: i });
      }
    }

    if (regressionDiffs.length > 0) {
      reporter.onStageStart(
        'fix',
        `Generating fixes for ${regressionDiffs.length} regression(s)…`,
      );
      let fixCompleted = 0;

      // Open the local fix-pattern DB (data moat). Degrades to no-op if
      // better-sqlite3 isn't available.
      const patternDB = new FixPatternDB();
      const patternsOn = await patternDB.open();

      try {
        const [, duration] = await timed(async () => {
          // Sequential to bound AI cost and (optional) sandbox usage.
          for (const { diff } of regressionDiffs) {
            try {
              const fix = await generateFix(diff, aiConfig, {
                patternLookup: patternsOn
                  ? (d) => {
                      // We don't know the category before generating, so probe
                      // each category's context hash for an accepted pattern.
                      for (const cat of FIX_CATEGORIES) {
                        const hit = patternDB.findAcceptedPattern(contextHashFor(d, cat));
                        if (hit) return hit;
                      }
                      return null;
                    }
                  : undefined,
              });
              if (fix) {
                diff.suggestedFix = fix;
                // Optional sandbox verification (cost-aware, opt-in).
                if (config.verifyFixes && config.baseUrl) {
                  diff.fixVerification = await verifyFix(diff, fix, config, {
                    baseUrl: config.baseUrl,
                    sandbox: config.fixSandbox ?? 'local',
                  });
                }
                // Record verified fixes as accepted training signal.
                if (patternsOn && diff.fixVerification?.verified) {
                  patternDB.record(fix, contextHashFor(diff, fix.category), true, {
                    route: diff.route.path,
                    viewport: diff.viewport,
                  });
                }
              }
            } catch (err) {
              logger.warn(
                `Fix generation failed for ${diff.route.path}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            fixCompleted++;
            reporter.onStageProgress('fix', fixCompleted, regressionDiffs.length, diff.route.path);
          }
        });
        timing.fix = duration;
        reporter.onStageComplete('fix', `Generated fixes in ${duration}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Fix generation stage failed: ${msg}`);
        reporter.onStageComplete('fix', `Failed: ${msg}`);
      } finally {
        patternDB.close();
      }

      // Free buffers again — restored for reporting below.
      for (const { diff } of regressionDiffs) {
        disposeBuffers(diff);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Stage 6: BUILD RESULT (restore image buffers from temp in chunks)
  // -----------------------------------------------------------------------

  // Restore image buffers from temp directory in chunks for the report
  const diffIndices = Array.from(tempPaths.keys());
  for (let c = 0; c < diffIndices.length; c += RENDER_CHUNK_SIZE) {
    const chunk = diffIndices.slice(c, c + RENDER_CHUNK_SIZE);
    for (const idx of chunk) {
      const paths = tempPaths.get(idx)!;
      const diff = diffs[idx];
      if (!diff) continue;
      diff.baselineImage = readBufferFromTemp(paths.baseline);
      diff.currentImage = readBufferFromTemp(paths.current);
      diff.diffImage = readBufferFromTemp(paths.diff);
    }
  }

  timing.total = Math.round(performance.now() - totalStart);
  const result = buildResult(diffs, timing, totalStart, config);

  // Surface accessibility results (Task 5.1) from plugin metadata onto the
  // result so reporters can render them.
  const a11yResults = pluginCtx.metadata.get('accessibility:results');
  if (Array.isArray(a11yResults) && a11yResults.length > 0) {
    result.accessibility = a11yResults as RunResult['accessibility'];
  }

  // -----------------------------------------------------------------------
  // Stage 6.5: UPLOAD IMAGES (optional — for PR comment thumbnails)
  // -----------------------------------------------------------------------
  if (config.imageUpload) {
    try {
      const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
      const count = await uploadImages(diffs, config, runId);
      if (count > 0) {
        logger.info(`Uploaded ${count} screenshot image(s) via ${config.imageUpload.provider}`);
      }
    } catch (err) {
      logger.warn(
        `Image upload stage failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Plugin hook: afterRun — notifications, uploads, custom reporting
  await pluginManager.runHook('afterRun', result, pluginCtx);

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

  // -----------------------------------------------------------------------
  // Cleanup: free buffers and remove temp directory
  // -----------------------------------------------------------------------
  for (const diff of diffs) {
    disposeBuffers(diff);
  }
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    logger.debug(`Could not clean up temp directory: ${tempDir}`);
  }

  return result;

  } catch (pipelineError) {
    // Plugin hook: onError — plugins can inspect or suppress errors
    let suppressed = false;
    if (pipelineError instanceof Error) {
      const suppressResult = await pluginManager.runHook('onError', pipelineError, 'pipeline');
      // runHook returns the last non-undefined value. If any plugin returned true, suppress.
      if (suppressResult === true) suppressed = true;
    }

    if (!suppressed) throw pipelineError;

    // Error suppressed by a plugin — return an empty result
    timing.total = Math.round(performance.now() - totalStart);
    return buildResult([], timing, totalStart, config);
  } finally {
    // Plugin hook: teardown — always called, even on error
    await pluginManager.teardown();
  }
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

  // Discover routes (shared logic with runPipeline)
  let routes: Route[];
  try {
    routes = await discoverAllRoutes(config);
  } catch {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
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

/**
 * Runs the **model-as-judge** (zero-baseline) pipeline (Task 8.4).
 *
 * Flow: `discover → render → judge → report`. No baselines are read or written.
 * Each rendered screenshot is evaluated against design intent (Figma frame when
 * configured, otherwise UI heuristics). Returns a {@link RunResult} whose
 * `judgements` array carries the verdicts; `diffs` is left empty.
 *
 * @experimental Gated behind `--mode judge --experimental`.
 */
export async function runJudgePipeline(
  config: FrontguardConfig,
  reporter: Reporter,
): Promise<RunResult> {
  const totalStart = performance.now();
  const timing: RunTiming = { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 };

  if (!config.ai) {
    throw new Error('Judge mode requires AI configuration (config.ai with a provider + model).');
  }

  // Stage 1: DISCOVER ------------------------------------------------------
  reporter.onStageStart('discover', 'Determining routes to judge…');
  let routes: Route[] = [];
  try {
    const [discovered, duration] = await timed(() => discoverAllRoutes(config));
    routes = discovered;
    timing.discovery = duration;
    reporter.onStageComplete('discover', `Found ${routes.length} route(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Discovery failed: ${msg}`);
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    reporter.onStageComplete('discover', 'Failed — falling back to /');
  }
  if (routes.length === 0) {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
  }

  const totalCombinations = routes.length * config.viewports.length * config.browsers.length;

  // Stage 2: RENDER --------------------------------------------------------
  let screenshots: ScreenshotResult[] = [];
  reporter.onStageStart('render', `Capturing ${totalCombinations} screenshot(s)…`);
  try {
    const [captured, duration] = await timed(() => renderPages(routes, config));
    screenshots = captured;
    timing.render = duration;
    reporter.onStageComplete('render', `Captured ${screenshots.length} screenshot(s) in ${duration}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Render stage failed: ${msg}`);
    reporter.onStageComplete('render', `Failed: ${msg}`);
  }

  if (screenshots.length === 0) {
    const empty = buildJudgeResult([], timing, totalStart, config);
    reporter.onComplete(empty);
    return empty;
  }

  // Stage 3: JUDGE ---------------------------------------------------------
  reporter.onStageStart('analyze', `Judging ${screenshots.length} screenshot(s) with ${config.ai.provider}/${config.ai.model}…`);
  const judgements: JudgeResult[] = [];
  const judgeConfig = config.judge;

  // Cache Figma references per route (avoid refetching across viewports).
  const referenceCache = new Map<string, Buffer | null>();
  async function referenceFor(routePath: string): Promise<Buffer | undefined> {
    if (!judgeConfig?.figmaFileKey || !judgeConfig.figmaPages) return undefined;
    if (!referenceCache.has(routePath)) {
      const ref = await fetchDesignReference(
        {
          fileKey: judgeConfig.figmaFileKey,
          pages: judgeConfig.figmaPages,
          scale: judgeConfig.figmaScale,
        },
        routePath,
      );
      referenceCache.set(routePath, ref);
    }
    return referenceCache.get(routePath) ?? undefined;
  }

  const [, judgeDuration] = await timed(async () => {
    await processBatched(screenshots, AI_BATCH_SIZE, async (shot, index) => {
      const figmaReference = await referenceFor(shot.route.path);
      const verdict = await judgeScreenshot(shot, { ai: config.ai!, figmaReference });
      judgements.push(verdict);
      reporter.onStageProgress(
        'analyze',
        index + 1,
        screenshots.length,
        `${shot.route.path} @ ${shot.viewport}px → ${verdict.pass ? 'pass' : 'fail'}`,
      );
    });
  });
  timing.ai = judgeDuration;
  reporter.onStageComplete('analyze', `Judged ${judgements.length} screenshot(s) in ${judgeDuration}ms`);

  timing.total = Math.round(performance.now() - totalStart);
  const result = buildJudgeResult(judgements, timing, totalStart, config);
  reporter.onComplete(result);
  return result;
}

/**
 * Builds a {@link RunResult} from judge verdicts. Maps verdicts onto the
 * summary counts so existing reporters/exit-code logic keep working:
 * failing judgements count as `regressions`, error verdicts as `errors`.
 */
function buildJudgeResult(
  judgements: JudgeResult[],
  timing: RunTiming,
  _totalStart: number,
  config: FrontguardConfig,
): RunResult {
  const errors = judgements.filter((j) => j.error).length;
  const failed = judgements.filter((j) => !j.pass && !j.error).length;
  const passed = judgements.filter((j) => j.pass).length;
  const warnings = judgements.filter(
    (j) => j.pass && j.issues.some((i) => i.severity === 'warning'),
  ).length;

  return {
    summary: {
      total: judgements.length,
      passed,
      regressions: failed,
      warnings,
      newPages: 0,
      errors,
    },
    diffs: [],
    judgements,
    timing,
    config,
  };
}

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
