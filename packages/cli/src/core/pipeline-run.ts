/** Pixelmatch run: discover, filter, render, compare, then optional advisory analysis. */

import type {
  BaselineManifest,
  FrontguardConfig,
  Route,
  ScreenshotResult,
  DiffResult,
  RunResult,
  RunTiming,
  Reporter,
  AccessibilityResult,
  AccessibilityViolation,
} from './types.js';
import { withCliTrace, type CliTrace } from '../utils/otel.js';
import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createFingerprintAccum,
  finishFingerprintCheck,
  fingerprintMode,
  formatFingerprintWarning,
  missingFingerprintWarning,
  noteComparedFingerprint,
  rendererBypassReason,
} from './fingerprint.js';
import { smartFilter } from '../graph/filter.js';
import { renderPages } from '../render/playwright.js';
import { overflowReports } from '../render/horizontal-overflow.js';
import {
  compareScreenshot,
  createNewPageResult,
} from '../diff/pixel.js';
import { compareDiffToThreshold } from '../diff/threshold.js';
import { analyzeWithAI } from '../diff/ai-vision.js';
import {
  generateFix,
  FIX_CATEGORIES,
} from '../diff/ai-fix.js';
import { verifyFix } from '../sandbox/verify-fix.js';
import {
  FixPatternDB,
  contextHashFor,
} from '../storage/fix-patterns.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { uploadImages } from '../storage/upload-stage.js';
import {
  detectPreviewUrl,
  waitForUrl,
} from '../utils/preview-url.js';
import { logger } from '../utils/logger.js';
import { PluginManager } from './plugins.js';
import {
  AI_BATCH_SIZE,
  COMPARE_BATCH_SIZE,
  RENDER_CHUNK_SIZE,
  disposeBuffers,
  persistBufferToTemp,
  readTemp,
  processBatched,
  timed,
} from './pipeline-batch.js';
import {
  UnreachableBaseUrlError,
  isUnreachableHostError,
} from './pipeline-errors.js';
import { discoverAllRoutes, resolveThreshold } from './pipeline-discover.js';
import { buildResult } from './pipeline-result.js';

/** URL patterns that indicate no real base URL has been configured. */
const DEFAULT_URL_PATTERNS = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

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
  return withCliTrace((trace) => runCapturedPipeline(config, reporter, trace));
}

async function runCapturedPipeline(
  config: FrontguardConfig,
  rp: Reporter,
  trace: CliTrace,
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
  const pm = new PluginManager();
  const pluginCtx = { config, logger, metadata: new Map<string, unknown>() };
  if (config.plugins) {
    for (const plugin of config.plugins) {
      pm.register(plugin);
    }
  }

  let tempDir: string | undefined;
  const diffs: DiffResult[] = [];

  try {
  await pm.setup(pluginCtx);

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
  config = await pm.runHook('beforeDiscover', config);

  rp.onStageStart('discover', 'Determining routes to test…');
  try {
    const [discovered, duration] = await timed(() => discoverAllRoutes(config));

    routes = discovered;
    timing.discovery = duration;
    rp.onStageComplete('discover', `Found ${routes.length} route(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // If the base URL is unreachable, falling back to "/" only produces N
    // more identical ECONNREFUSEDs — one per viewport — and a confusing
    // stack-of-errors report. Bail with a single clear message instead.
    if (isUnreachableHostError(msg)) {
      rp.onStageComplete(
        'discover',
        `Failed — ${config.baseUrl} is unreachable`,
      );
      throw new UnreachableBaseUrlError(config.baseUrl, err);
    }

    logger.error(`Discovery failed: ${msg}`);
    rp.onStageComplete('discover', `Failed — falling back to /`);

    // Absolute fallback: just test the root
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
  }

  if (routes.length === 0) {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    logger.warn('No routes discovered — testing base URL only');
  }

  // Plugin hook: afterDiscover — can add, remove, or modify routes
  routes = await pm.runHook('afterDiscover', routes, config);

  // -----------------------------------------------------------------------
  // Stage 2: FILTER (dependency graph analysis)
  // -----------------------------------------------------------------------
  let fr: Route[] = routes;

  // Read the baseline manifest before filtering. A browser-build or pixelmatch
  // change has to render every route. A missing or unreadable manifest must
  // not crash this stage and must not force that bypass.
  let cs: GitOrphanStorage | undefined;
  let comparisonStorageReady = false;
  let baselineManifest: BaselineManifest | null = null;
  let manifestReadable = false;
  let manifestReadAttempted = false;
  try {
    cs = new GitOrphanStorage(process.cwd());
    await cs.init();
    comparisonStorageReady = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug(`Baseline storage unavailable before filtering: ${msg}`);
  }
  if (
    comparisonStorageReady &&
    cs &&
    typeof cs.readManifest === 'function'
  ) {
    manifestReadAttempted = true;
    try {
      baselineManifest = await cs.readManifest();
      manifestReadable = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(
        `Baseline manifest unreadable; skipping renderer fingerprint bypass: ${msg}`,
      );
    }
  }
  const bypassReason = manifestReadable
    ? rendererBypassReason(baselineManifest, config.browsers, {
        routes,
        viewports: config.viewports,
      })
    : undefined;

  rp.onStageStart('filter', 'Analyzing dependency graph…');
  try {
    const [filterResult, filterDuration] = await timed(async () =>
      smartFilter(routes, config, bypassReason ? { bypassReason } : undefined),
    );

    fr = filterResult.filtered;
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

    rp.onStageComplete(
      'filter',
      `${fr.length}/${routes.length} route(s) to render — ${filterResult.reason}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Smart filter failed: ${msg} — rendering all ${routes.length} routes`);
    fr = routes;
    rp.onStageComplete('filter', `${fr.length} route(s) to render (filter failed, rendering all)`);
  }

  const totalCombinations =
    fr.length * config.viewports.length * config.browsers.length;
  logger.info(
    `Testing ${fr.length} route(s) × ${config.viewports.length} viewport(s) × ${config.browsers.length} browser(s) = ${totalCombinations} combination(s)`,
  );

  // -----------------------------------------------------------------------
  // Stage 3: RENDER
  // -----------------------------------------------------------------------
  let shots: ScreenshotResult[] = [];

  // Plugin hook: beforeRender — can modify routes or config per-render
  {
    const renderInput = await pm.runHook(
      'beforeRender',
      { routes: fr, config },
    );
    if (renderInput && renderInput.routes) fr = renderInput.routes;
    if (renderInput && renderInput.config) config = renderInput.config;
  }

  const captureSpan = trace.start('frontguard.capture');
  rp.onStageStart('render', `Capturing ${totalCombinations} screenshot(s)…`);
  try {
    const [captured, duration] = await timed(async () => {
      const results = await renderPages(fr, config);

      // Report progress per screenshot
      results.forEach((shot, i) => {
        rp.onStageProgress(
          'render',
          i + 1,
          totalCombinations,
          `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`,
        );
      });

      return results;
    });

    shots = captured;
    timing.render = duration;
    rp.onStageComplete('render', `Captured ${shots.length} screenshot(s) in ${duration}ms`);
    captureSpan.end(shots.length === 0 ? 'error' : 'ok', {
      'frontguard.shots': shots.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Render stage failed: ${msg}`);
    rp.onStageComplete('render', `Failed: ${msg}`);
    captureSpan.end('error', { 'frontguard.shots': shots.length });
  }

  // Plugin hook: afterRender — can modify screenshots before comparison
  if (shots.length > 0) {
    shots = await pm.runHook('afterRender', shots, pluginCtx);
  }

  if (shots.length === 0) {
    logger.error('No screenshots were captured — cannot proceed with comparison');
    const emptyResult = buildResult([], timing, totalStart, config);
    await rp.onComplete(emptyResult);
    return emptyResult;
  }

  // -----------------------------------------------------------------------
  // Stage 4: COMPARE (with memory management)
  // -----------------------------------------------------------------------
  // Create a temp directory for persisting images of changed pages
  // so we can free memory during comparison and restore lazily for reports.
  tempDir = mkdtempSync(join(tmpdir(), 'frontguard-compare-'));
  const compareTempDir: string = tempDir;

  // Track temp file paths for changed diffs so we can restore buffers for reporting
  const tempPaths = new Map<number, { baseline: string; current: string; diff: string }>();

  const compareSpan = trace.start('frontguard.compare');
  rp.onStageStart('compare', 'Comparing against baselines…');
  if (!cs) {
    cs = new GitOrphanStorage(process.cwd());
  }
  const storage = cs;
  if (!comparisonStorageReady) {
    try {
      await storage.init();
      comparisonStorageReady = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Baseline storage init failed: ${msg}`);
      rp.onStageComplete('compare', `Failed: ${msg}`);
      compareSpan.end('error', { 'frontguard.shots': 0 });
      throw err;
    }
  }
  if (!manifestReadAttempted && typeof storage.readManifest === 'function') {
    manifestReadAttempted = true;
    try {
      baselineManifest = await storage.readManifest();
      manifestReadable = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(
        `Baseline manifest unreadable; renderer fingerprint check skipped: ${msg}`,
      );
    }
  }

  const fingerprintAccum = createFingerprintAccum();
  const schemeNotes: string[] = [];
  const seenSchemes = new Set<string>();

  try {
    const [, duration] = await timed(async () => {
      let completed = 0;
      const batchResults = await processBatched(
        shots,
        COMPARE_BATCH_SIZE,
        async (shot, i) => {
          let diff: DiffResult;

          // Resolve the effective threshold: per-route override wins over global.
          const effectiveThreshold = resolveThreshold(shot.route, config.threshold);

          if (!Buffer.isBuffer(shot.buffer) || shot.buffer.length === 0) {
            const renderError =
              shot.consoleErrors.find((message) => message.startsWith('Render error:')) ??
              shot.consoleErrors[0] ??
              'Render produced no screenshot';
            diff = {
              route: shot.route,
              viewport: shot.viewport,
              browser: shot.browser,
              status: 'error',
              diffPercentage: 0,
              error: renderError,
              ...(shot.stability ? { stability: shot.stability } : {}),
              ...(shot.redactedCount !== undefined ? { redactedCount: shot.redactedCount } : {}),
            };
          } else {
            const baseline = await storage.readBaseline(
              shot.route.path,
              shot.viewport,
              shot.browser,
            );

            if (!baseline) {
              // No baseline exists — this is a new page
              diff = createNewPageResult(shot);
              logger.debug(`New page: ${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`);
            } else {
              noteComparedFingerprint(
                fingerprintAccum,
                baselineManifest,
                manifestReadable,
                shot,
              );
              if (manifestReadable && baselineManifest) {
                const stored =
                  baselineManifest.routes?.[shot.route.path]?.snapshots?.[
                    `${shot.viewport}/${shot.browser}`
                  ]?.colorScheme;
                const current = shot.route.colorScheme ?? config.colorScheme ?? 'light';
                const pair = `${stored}:${current}`;
                if (
                  (stored === 'light' || stored === 'dark') &&
                  stored !== current &&
                  !seenSchemes.has(pair)
                ) {
                  seenSchemes.add(pair);
                  schemeNotes.push(
                    `${shot.route.path} @ ${shot.viewport}px [${shot.browser}] ${stored} vs ${current}`,
                  );
                }
              }
              // Compare against existing baseline using the effective threshold
              diff = compareScreenshot(shot, baseline, effectiveThreshold, {
                enabled: config.ssimFallback,
                ssimThreshold: config.ssimThreshold,
              });

              // Mark regressions vs changes based on the effective threshold
              if (
                diff.status === 'changed' &&
                compareDiffToThreshold(diff.diffPercentage, effectiveThreshold) > 0
              ) {
                diff = { ...diff, status: 'regression' };
              }
            }
          }

          // Null out the screenshot buffer — it's been compared and is no longer needed
          (shot as { buffer: Buffer | null }).buffer = null!;

          completed++;
          rp.onStageProgress(
            'compare',
            completed,
            shots.length,
            `${shot.route.path} @ ${shot.viewport}px → ${diff.status} (${diff.diffPercentage.toFixed(2)}%)`,
          );

          return { diff, index: i };
        },
      );

      // Collect results
      for (const outcome of batchResults) {
        if (outcome.status === 'fulfilled') {
          const { diff } = outcome.value;
          diffs.push(diff);
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
    rp.onStageComplete('compare', `Compared ${diffs.length} screenshot(s) in ${duration}ms`);
    compareSpan.end('ok', { 'frontguard.shots': diffs.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Compare stage failed: ${msg}`);
    rp.onStageComplete('compare', `Failed: ${msg}`);
    compareSpan.end('error', { 'frontguard.shots': diffs.length });
  }

  const fingerprintCheck = finishFingerprintCheck(
    fingerprintAccum,
    fingerprintMode(config.fingerprint),
  );
  if (fingerprintCheck.lines.length > 0) {
    logger.warn(formatFingerprintWarning(fingerprintCheck.lines));
  }
  if (fingerprintCheck.missing) {
    logger.warn(missingFingerprintWarning());
  }
  if (schemeNotes.length > 0) {
    logger.warn(
      `Color scheme differs (${schemeNotes.join('; ')}). Not a pixel failure; same baseline file.`,
    );
  }

  const hx = await overflowReports(shots);

  // Free the screenshots array — all data has been extracted
  shots = [];

  // Plugin hook: afterCompare — can modify diff results or add custom analysis
  // Runs before buffer disposal so plugins (e.g. Figma compliance) can read diff.currentImage.
  {
    const modifiedDiffs = await pm.runHook('afterCompare', diffs, pluginCtx);
    // Only replace diffs if the hook returned a DIFFERENT array
    if (modifiedDiffs !== undefined && modifiedDiffs !== diffs) {
      diffs.length = 0;
      diffs.push(...modifiedDiffs);
    }
  }

  // Memory optimization: persist changed/regression/new images to temp dir
  // and free in-memory buffers now that afterCompare plugins have completed.
  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    const isChanged = diff.status === 'changed' || diff.status === 'regression' || diff.status === 'new';
    if (isChanged) {
      const key = `${i}_${diff.route.path}_${diff.viewport}_${diff.browser}`;
      tempPaths.set(i, {
        baseline: persistBufferToTemp(compareTempDir, `${key}_baseline`, diff.baselineImage),
        current: persistBufferToTemp(compareTempDir, `${key}_current`, diff.currentImage),
        diff: persistBufferToTemp(compareTempDir, `${key}_diff`, diff.diffImage),
      });
    }
    disposeBuffers(diff);
  }

  // -----------------------------------------------------------------------
  // Stage 5: ANALYZE (optional — AI, parallelised in batches)
  // -----------------------------------------------------------------------
  if (config.ai) {
    // Restore image buffers from temp for changed diffs so AI can analyze them
    const aiDiffs: Array<{ diff: DiffResult; index: number }> = [];
    for (let i = 0; i < diffs.length; i++) {
      const d = diffs[i];
      if (d.status === 'changed' || d.status === 'regression') {
        // Restore buffers from temp so AI can access the images
        const paths = tempPaths.get(i);
        if (paths) {
          d.baselineImage = readTemp(paths.baseline);
          d.currentImage = readTemp(paths.current);
          d.diffImage = readTemp(paths.diff);
        }
        aiDiffs.push({ diff: d, index: i });
      }
    }

    if (aiDiffs.length > 0) {
      rp.onStageStart(
        'analyze',
        `Analyzing ${aiDiffs.length} change(s) with ${config.ai.provider}/${config.ai.model} (batch size: ${AI_BATCH_SIZE})…`,
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
        const [analysisOutcomes, duration] = await timed(async () => {
          return processBatched(
            aiDiffs,
            AI_BATCH_SIZE,
            async ({ diff }) => {
              const accessibility = a11yByKey.get(`${diff.route.path}@${diff.viewport}`);
              const analysis = await analyzeWithAI(
                diff,
                aiConfig,
                accessibility ? { accessibility } : undefined,
              );
              diff.aiAnalysis = analysis;
              // Pixel comparison is the pass/fail signal. Classification is
              // advisory so a crawled page cannot prompt-inject a clean CI run.

              completed++;
              rp.onStageProgress(
                'analyze',
                completed,
                aiDiffs.length,
                `${diff.route.path} → ${analysis.classification} (${(analysis.confidence * 100).toFixed(0)}%)`,
              );

              return analysis;
            },
          );
        });

        let analysisFailures = 0;
        for (let i = 0; i < analysisOutcomes.length; i++) {
          const outcome = analysisOutcomes[i];
          if (outcome.status === 'fulfilled') continue;

          analysisFailures++;
          const diff = aiDiffs[i]?.diff;
          const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          if (diff) {
            diff.status = 'error';
            diff.error = `AI analysis failed: ${msg}`;
            completed++;
            rp.onStageProgress(
              'analyze',
              completed,
              aiDiffs.length,
              `${diff.route.path} → error`,
            );
          }
        }

        timing.ai = duration;
        if (analysisFailures > 0) {
          logger.error(`AI analysis failed for ${analysisFailures} change(s)`);
          rp.onStageComplete(
            'analyze',
            `Analyzed ${aiDiffs.length - analysisFailures} change(s); ${analysisFailures} failed in ${duration}ms`,
          );
        } else {
          rp.onStageComplete(
            'analyze',
            `Analyzed ${aiDiffs.length} change(s) in ${duration}ms`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`AI analysis stage failed: ${msg}`);
        rp.onStageComplete('analyze', `Failed: ${msg}`);
      }

      // Free AI buffers again after analysis — they'll be restored for reporting
      for (const { diff } of aiDiffs) {
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
          d.baselineImage = readTemp(paths.baseline);
          d.currentImage = readTemp(paths.current);
          d.diffImage = readTemp(paths.diff);
        }
        regressionDiffs.push({ diff: d, index: i });
      }
    }

    if (regressionDiffs.length > 0) {
      rp.onStageStart(
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
            rp.onStageProgress('fix', fixCompleted, regressionDiffs.length, diff.route.path);
          }
        });
        timing.fix = duration;
        rp.onStageComplete('fix', `Generated fixes in ${duration}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Fix generation stage failed: ${msg}`);
        rp.onStageComplete('fix', `Failed: ${msg}`);
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
      diff.baselineImage = readTemp(paths.baseline);
      diff.currentImage = readTemp(paths.current);
      diff.diffImage = readTemp(paths.diff);
    }
  }

  timing.total = Math.round(performance.now() - totalStart);
  const result = buildResult(diffs, timing, totalStart, config);
  if (fingerprintCheck) result.fingerprintCheck = fingerprintCheck;

  // Surface accessibility results (Task 5.1) from plugin metadata onto the
  // result so reporters can render them.
  const a11yResults = pluginCtx.metadata.get('accessibility:results');
  if (Array.isArray(a11yResults) && a11yResults.length > 0) {
    result.accessibility = a11yResults as RunResult['accessibility'];
  }
  if (hx.length > 0) result.horizontalOverflow = hx;

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
  await pm.runHook('afterRun', result, pluginCtx);

  // -----------------------------------------------------------------------
  // Stage 7: REPORT
  // -----------------------------------------------------------------------
  rp.onStageStart('report', 'Generating report…');
  await rp.onComplete(result);
  rp.onStageComplete('report', 'Done');

  return result;

  } catch (pipelineError) {
    // Plugin hook: onError — plugins can inspect or suppress errors
    let suppressed = false;
    if (pipelineError instanceof Error) {
      const suppressResult = await pm.runHook('onError', pipelineError, 'pipeline');
      // runHook returns the last non-undefined value. If any plugin returned true, suppress.
      if (suppressResult === true) suppressed = true;
    }

    if (!suppressed) throw pipelineError;

    // Error suppressed by a plugin — return an empty result
    timing.total = Math.round(performance.now() - totalStart);
    return buildResult([], timing, totalStart, config);
  } finally {
    for (const diff of diffs) {
      disposeBuffers(diff);
    }
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        logger.debug(`Could not clean up temp directory: ${tempDir}`);
      }
    }
    // Plugin hook: teardown — always called, even on error
    await pm.teardown();
  }
}
