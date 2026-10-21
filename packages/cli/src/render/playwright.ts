/**
 * Playwright-based rendering engine for Frontguard.
 *
 * Captures full-page screenshots across multiple browser engines, viewports,
 * and routes in parallel using a configurable worker pool.
 *
 * @module render/playwright
 */

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import type {
  FrontguardConfig,
  Route,
  RouteAction,
  ScreenshotResult,
  BrowserEngine,
} from '../core/types.js';
import { logger } from '../utils/logger.js';
import { cropToMaxHeight } from './crop.js';
import { joinStoryUrl } from '../discovery/story-url.js';
import { STORYBOOK_READY_SCRIPT } from '../discovery/storybook.js';
import { captureStableScreenshot } from './stability.js';
import {
  applySensitiveRedactionInPage,
  redactSensitiveDomHtml,
  resolveRedactSelectors,
} from './redaction.js';
import { extractDomElementBoxes } from './dom-elements.js';
import { CAPTURE_SCREENSHOT_OPTIONS } from '../core/fingerprint.js';

/**
 * Bound for `document.fonts.ready`.
 *
 * The wait used to be unbounded. WebKit can leave the promise pending forever
 * (playwright#42986), and the Chromium headless shell can stall on a font load
 * (playwright#42962). Ten seconds covers a real font fetch. On timeout the
 * route fails and the run exits 2.
 */
export const FONT_READY_TIMEOUT_MS = 10_000;

async function waitForDocumentFonts(page: Page, routePath: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      page.evaluate(() => document.fonts.ready),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `document.fonts.ready timed out after ${FONT_READY_TIMEOUT_MS}ms for route ${routePath}`,
            ),
          );
        }, FONT_READY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Deterministic rendering helpers (clock freeze & network request blocking)
// ---------------------------------------------------------------------------

/**
 * Resolve `freezeTime` config (`true`, epoch ms number, or ISO 8601 string)
 * to a numeric epoch millisecond timestamp, or `null` when disabled.
 */
export function resolveFreezeTimestamp(
  freezeTime: boolean | number | string | undefined,
): number | null {
  if (freezeTime === undefined || freezeTime === false) return null;
  if (freezeTime === true) return 1704067200000; // 2024-01-01T00:00:00.000Z
  if (typeof freezeTime === 'number') return freezeTime;
  if (typeof freezeTime === 'string') {
    const parsed = Date.parse(freezeTime);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Check whether a request URL matches any configured `blockUrls` pattern.
 * Supports `*` wildcards as well as case-insensitive substring matching.
 */
export function matchesBlockedUrl(url: string, patterns: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.includes('*')) {
      const escaped = lowerPattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      if (new RegExp(`^${escaped}$`, 'i').test(url) || new RegExp(escaped, 'i').test(url)) {
        return true;
      }
    } else if (lowerUrl.includes(lowerPattern)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Browser engine map
// ---------------------------------------------------------------------------

const engines = { chromium, firefox, webkit } as const;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A single unit of work: one route × viewport × browser combination. */
interface RenderTask {
  route: Route;
  viewport: number;
  browser: BrowserEngine;
}

// ---------------------------------------------------------------------------
// CSS injected into every page to freeze animations / transitions
// ---------------------------------------------------------------------------

const FREEZE_ANIMATIONS_CSS =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render screenshots for every route × viewport × browser combination.
 *
 * Browsers are launched once and shared across all tasks for the same engine.
 * Tasks are processed in batches of `config.workers` (default 4) using
 * `Promise.allSettled` so a single page failure never kills the run.
 *
 * @param routes  - Routes to capture
 * @param config  - Frontguard configuration
 * @returns Array of screenshot results (one per task that succeeded or failed gracefully)
 */
export async function renderPages(
  routes: Route[],
  config: FrontguardConfig,
): Promise<ScreenshotResult[]> {
  const workers = config.workers ?? 4;

  // --- Build the full task list ------------------------------------------------
  // Per-route viewport overrides restrict capture to a subset of widths.
  const tasks: RenderTask[] = [];
  for (const route of routes) {
    const viewports =
      route.viewport && route.viewport.length > 0 ? route.viewport : config.viewports;
    for (const viewport of viewports) {
      for (const browser of config.browsers) {
        tasks.push({ route, viewport, browser });
      }
    }
  }

  if (tasks.length === 0) {
    logger.warn('No render tasks to process — check routes, viewports, and browsers config.');
    return [];
  }

  logger.info(`Rendering ${tasks.length} screenshots (${routes.length} routes × ${config.viewports.length} viewports × ${config.browsers.length} browsers)`);

  // --- Launch all required browsers once ---------------------------------------
  const browserMap = new Map<BrowserEngine, Browser>();

  for (const engine of config.browsers) {
    try {
      logger.debug(`Launching ${engine}…`);
      const launcher = engines[engine];
      const browser = await launcher.launch({
        // Headless by default; use reasonable args for stability
        args: engine === 'chromium'
          ? ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
          : undefined,
      });
      browserMap.set(engine, browser);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Detect OOM (exit code 137)
      if (message.includes('137') || message.includes('OOM') || message.includes('out of memory')) {
        logger.error(`Out-of-memory detected while launching ${engine}. Reduce config.workers or free system resources.`);
      } else {
        logger.error(`Failed to launch ${engine}: ${message}`);
      }
      // Continue — tasks for this engine will produce error results below.
    }
  }

  // --- Process tasks in batches ------------------------------------------------
  const results: ScreenshotResult[] = [];

  for (let i = 0; i < tasks.length; i += workers) {
    const batch = tasks.slice(i, i + workers);
    const batchResults = await Promise.allSettled(
      batch.map((task) => executeTaskWithRetry(task, config, browserMap)),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const outcome = batchResults[j];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        // Produce an error-state ScreenshotResult so downstream stages can report it
        const task = batch[j];
        const errMsg = outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);

        logger.error(`Task failed [${task.browser} ${task.viewport}px ${task.route.path}]: ${errMsg}`);

        results.push({
          route: task.route,
          viewport: task.viewport,
          browser: task.browser,
          buffer: Buffer.alloc(0),
          domSnapshot: '',
          consoleErrors: [`Render error: ${errMsg}`],
          timestamp: Date.now(),
          duration: 0,
        });
      }
    }

    logger.debug(`Batch complete: ${Math.min(i + workers, tasks.length)}/${tasks.length}`);
  }

  // --- Teardown ----------------------------------------------------------------
  for (const [engine, browser] of browserMap) {
    try {
      await browser.close();
      logger.debug(`Closed ${engine}`);
    } catch {
      // Best-effort close — swallow errors
    }
  }

  logger.info(`Rendering complete — ${results.filter((r) => r.buffer.length > 0).length}/${tasks.length} succeeded`);
  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Execute a single render task: open page, navigate, screenshot, close.
 */
export async function executeTask(
  task: RenderTask,
  config: FrontguardConfig,
  browserMap: Map<BrowserEngine, Browser>,
): Promise<ScreenshotResult> {
  const startTime = Date.now();
  const consoleErrors: string[] = [];

  const browser = browserMap.get(task.browser);
  if (!browser) {
    throw new Error(
      `Browser "${task.browser}" is not available — it may have failed to launch.`,
    );
  }

  // --- Create context (handles auth storage state & colorScheme) -------------
  let context: BrowserContext;
  try {
    const contextOptions: Record<string, unknown> = {
      viewport: { width: task.viewport, height: config.viewportHeight ?? 720 },
    };

    if (config.auth?.storageState) {
      contextOptions.storageState = config.auth.storageState;
    }

    const effectiveColorScheme = task.route.colorScheme ?? config.colorScheme;
    if (effectiveColorScheme) {
      contextOptions.colorScheme = effectiveColorScheme;
    }

    context = await browser.newContext(contextOptions);
  } catch (err) {
    throw new Error(
      `Failed to create browser context for ${task.browser} @ ${task.viewport}px: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let page: Page | undefined;

  try {
    // --- Block noisy third-party URLs if configured --------------------------
    const blockUrls = [...(config.blockUrls ?? []), ...(task.route.blockUrls ?? [])];
    let blockedRequestsCount = 0;
    if (
      blockUrls.length > 0 &&
      typeof (context as { route?: unknown }).route === 'function'
    ) {
      await context.route('**/*', async (route) => {
        const reqUrl = route.request().url();
        if (matchesBlockedUrl(reqUrl, blockUrls)) {
          blockedRequestsCount++;
          await route.abort('blockedbyclient');
        } else {
          await route.continue();
        }
      });
    }

    page = await context.newPage();

    // --- Collect console errors ------------------------------------------------
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // --- Freeze Date/time if configured (must be before navigation) -----------
    const effectiveFreezeTime = task.route.freezeTime ?? config.freezeTime;
    const frozenTimestamp = resolveFreezeTimestamp(effectiveFreezeTime);
    if (frozenTimestamp !== null) {
      const pageWithClock = page as {
        clock?: { setFixedTime?: (time: number) => Promise<void> };
      };
      if (typeof pageWithClock.clock?.setFixedTime === 'function') {
        await pageWithClock.clock.setFixedTime(frozenTimestamp).catch(() => {});
      }
      if (typeof (page as { addInitScript?: unknown }).addInitScript === 'function') {
        await page.addInitScript(`{const __fg_frozen=${frozenTimestamp};const __fg_OrigDate=Date;Date=class extends __fg_OrigDate{constructor(...args){if(args.length===0)return new __fg_OrigDate(__fg_frozen);return new __fg_OrigDate(...args);}static now(){return __fg_frozen;}};Date.prototype=__fg_OrigDate.prototype;}`);
      }
    }

    // --- Seed Math.random if configured (must be before navigation) -----------
    const effectiveSeedRandom = task.route.seedRandom ?? config.seedRandom;
    if (effectiveSeedRandom !== undefined && effectiveSeedRandom !== false) {
      const seedVal = effectiveSeedRandom === true ? 42 : effectiveSeedRandom;
      if (typeof (page as { addInitScript?: unknown }).addInitScript === 'function') {
        await page.addInitScript(`{let __fg_seed=(${Number(seedVal)}>>>0)||42;Math.random=function(){let t=(__fg_seed+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}`);
      }
    }

    // --- Navigate --------------------------------------------------------------
    const url =
      task.route.discoveredVia === 'ladle' || task.route.discoveredVia === 'histoire'
        ? joinStoryUrl(config.baseUrl, task.route.path)
        : new URL(task.route.path, config.baseUrl).href;
    logger.debug(`Navigating to ${url} [${task.browser} ${task.viewport}px]`);

    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: config.pageTimeout ?? 30_000,
    });
    if (response && response.status() >= 400) {
      logger.warn(`Route ${task.route.path} returned HTTP ${response.status()}`);
    }

    // --- Smart render: freeze animations, wait for fonts -----------------------
    if (config.smartRender !== false) {
      // Inject animation-freezing CSS
      await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });

      // Wait for web fonts, but do not let a stuck document.fonts.ready hang the run.
      await waitForDocumentFonts(page, task.route.path);
    }

    // --- Optional per-route waitForSelector & pre-capture interaction steps ----
    if (task.route.waitForSelector) {
      await page.waitForSelector(task.route.waitForSelector, {
        state: 'visible',
        timeout: config.pageTimeout ?? 30_000,
      });
    }

    if (task.route.actions && task.route.actions.length > 0) {
      await executeRouteActions(page, task.route.actions, config.pageTimeout ?? 30_000);
    }

    // --- Storybook integration: wait for play() to complete --------------------
    // When the route was discovered from a Storybook server, the iframe URL
    // boots the preview *and* runs the story's optional `play()` function.
    // We need to wait for that to settle before screenshotting, otherwise we
    // capture pre-interaction state and the test is meaningless.
    if (task.route.discoveredVia === 'storybook') {
      try {
        const sbTimeout = Math.min(config.pageTimeout ?? 30_000, 30_000);
        const result = (await page.evaluate(
          `(${STORYBOOK_READY_SCRIPT})(${sbTimeout})`,
        )) as {
          ready: boolean;
          reason: string;
          elapsedMs: number;
        };
        logger.debug(
          `Storybook ready (${result.reason}) for ${task.route.path} in ${result.elapsedMs}ms`,
        );
        // Belt-and-braces: a final RAF + tiny settle keeps any post-play
        // re-renders (e.g. focus rings, error boundaries) from being missed.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
        await page.waitForTimeout(50);
      } catch (err) {
        logger.warn(
          `Storybook ready-wait failed for ${task.route.path}: ${(err as Error).message}`,
        );
      }
    }

    // --- Apply ignore rules (hide matching elements) ---------------------------
    // Merge global ignore rules with any per-route ignore rules. Per-route
    // rules ADD to the global set, they do not replace it.
    const mergedIgnore = [...(config.ignore ?? []), ...(task.route.ignore ?? [])];
    const selectorRules = mergedIgnore.filter(r => r.selector);
    if (selectorRules.length > 0) {
      await page.evaluate((rules: { selector: string }[]) => {
        for (const rule of rules) {
          const elements = document.querySelectorAll(rule.selector);
          for (const el of elements) {
            (el as HTMLElement).style.visibility = 'hidden';
          }
        }
      }, selectorRules.map(r => ({ selector: r.selector! })));
    }

    // --- Apply rect-based ignore rules (overlay fixed-position masks) --------
    if (mergedIgnore.some(r => r.rect)) {
      const rects = mergedIgnore.filter(r => r.rect).map(r => r.rect!);
      await page.evaluate((rects) => {
        for (const rect of rects) {
          const overlay = document.createElement('div');
          overlay.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:#808080;z-index:999999;pointer-events:none;`;
          document.body.appendChild(overlay);
        }
      }, rects);
    }

    // --- Apply sensitive input redaction if configured -------------------------
    const redactSelectors = resolveRedactSelectors(config.redactSensitive);
    let redactedCount: number | undefined;
    if (redactSelectors.length > 0) {
      redactedCount = await page.evaluate(applySensitiveRedactionInPage, redactSelectors);
    }

    // --- Take screenshot (with optional stability convergence or anti-flake) ---
    let screenshotBuffer: Buffer;
    let stabilityMetadata: ScreenshotResult['stability'];
    const antiFlakeRenders = config.antiFlakeRenders ?? 1;

    if (config.waitForStability) {
      const stabilityOpts =
        typeof config.waitForStability === 'object' ? config.waitForStability : {};
      const stability = await captureStableScreenshot(
        async () => Buffer.from(await page!.screenshot(CAPTURE_SCREENSHOT_OPTIONS)),
        async (ms) => {
          if (typeof page!.waitForTimeout === 'function') {
            await page!.waitForTimeout(ms);
          } else {
            await new Promise((r) => setTimeout(r, ms));
          }
        },
        stabilityOpts,
      );
      screenshotBuffer = stability.buffer;
      stabilityMetadata = {
        settled: stability.settled,
        attempts: stability.attempts,
        unstableRatio: stability.unstableRatio,
        ...(stability.motionClusters.length > 0
          ? { motionClusters: stability.motionClusters }
          : {}),
      };
      if (!stability.settled) {
        const topCluster = stability.motionClusters[0];
        const clusterHint = topCluster
          ? `; top unstable region at (${topCluster.bbox.x},${topCluster.bbox.y} ${topCluster.bbox.width}x${topCluster.bbox.height})`
          : '';
        logger.warn(
          `Route ${task.route.path} did not visually settle after ${stability.attempts} frames (${(stability.unstableRatio * 100).toFixed(2)}% variance${clusterHint})`,
        );
      }
    } else if (antiFlakeRenders > 1) {
      const buffers: Buffer[] = [];
      for (let i = 0; i < antiFlakeRenders; i++) {
        if (i > 0) await page.waitForTimeout(100);
        buffers.push(Buffer.from(await page.screenshot(CAPTURE_SCREENSHOT_OPTIONS)));
      }
      screenshotBuffer = findConsensusScreenshot(buffers);
      logger.debug(`Anti-flake: took ${antiFlakeRenders} renders for ${task.route.path}`);
    } else {
      screenshotBuffer = Buffer.from(
        await page.screenshot(CAPTURE_SCREENSHOT_OPTIONS),
      );
    }

    // --- Crop to maxHeight if configured ---------------------------------------
    if (config.maxHeight && config.maxHeight > 0) {
      screenshotBuffer = Buffer.from(await cropToMaxHeight(screenshotBuffer, config.maxHeight));
    }

    // --- Evaluate performance collection script if injected by plugin ----------
    const perfScript = (config as { _perfScript?: string })._perfScript;
    if (typeof perfScript === 'string' && perfScript.trim().length > 0) {
      await page.evaluate(perfScript).catch(() => {});
    }

    // --- Capture DOM snapshot (with optional sensitive attribute scrubbing) ----
    const rawDomSnapshot = await page.content();
    const domSnapshot =
      redactSelectors.length > 0 ? redactSensitiveDomHtml(rawDomSnapshot) : rawDomSnapshot;

    // --- Extract spatial DOM element bounding boxes for diff attribution ------
    const domElements = await extractDomElementBoxes(page);

    const duration = Date.now() - startTime;
    logger.debug(`Captured ${task.route.path} [${task.browser} ${task.viewport}px] in ${duration}ms`);

    return {
      route: task.route,
      viewport: task.viewport,
      browser: task.browser,
      buffer: screenshotBuffer,
      domSnapshot,
      consoleErrors,
      timestamp: Date.now(),
      duration,
      ...(redactedCount !== undefined ? { redactedCount } : {}),
      ...(stabilityMetadata !== undefined ? { stability: stabilityMetadata } : {}),
      ...(domElements.length > 0 ? { domElements } : {}),
      ...(blockUrls.length > 0 || blockedRequestsCount > 0 ? { blockedRequestsCount } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Detect OOM (exit code 137)
    if (message.includes('137') || message.includes('OOM') || message.includes('out of memory')) {
      throw new Error(
        `Out-of-memory (OOM) while rendering ${task.route.path} @ ${task.viewport}px with ${task.browser}. ` +
        `Try reducing config.workers, config.maxHeight, or closing other processes.`,
      );
    }

    throw err;
  } finally {
    // Always close the context (and its page) to free resources
    try {
      await context.close();
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Execute a render task with optional retries on failure.
 */
async function executeTaskWithRetry(
  task: RenderTask,
  config: FrontguardConfig,
  browserMap: Map<BrowserEngine, Browser>,
): Promise<ScreenshotResult> {
  const renderRetries = config.renderRetries ?? 0;
  for (let attempt = 0; attempt <= renderRetries; attempt++) {
    try {
      return await executeTask(task, config, browserMap);
    } catch (err) {
      if (attempt === renderRetries) throw err;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Render retry ${attempt + 1}/${renderRetries} for ${task.route.path}: ${message}`);
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('Unreachable');
}

/**
 * Find the consensus screenshot from multiple renders.
 *
 * Fast path: if all buffers are byte-identical, return the first.
 * Slow path: pairwise comparison to find the frame matching the most others.
 */
function findConsensusScreenshot(buffers: Buffer[]): Buffer {
  if (buffers.length <= 1) return buffers[0];

  // Fast path: check if all buffers are identical
  const allIdentical = buffers.every((b) => b.equals(buffers[0]));
  if (allIdentical) {
    logger.debug(`Anti-flake: all ${buffers.length} renders identical (consensus reached, 0px variance)`);
    return buffers[0];
  }

  // Slow path: group identical buffers and return the most common one
  const groups: { buffer: Buffer; count: number }[] = [];
  for (const buf of buffers) {
    const existing = groups.find((g) => g.buffer.equals(buf));
    if (existing) {
      existing.count++;
    } else {
      groups.push({ buffer: buf, count: 1 });
    }
  }

  groups.sort((a, b) => b.count - a.count);
  logger.debug(`Anti-flake: ${buffers.length} renders, ${groups.length} unique frames, consensus group has ${groups[0].count} matches`);
  return groups[0].buffer;
}

/**
 * Executes declarative pre-capture interaction steps on a Playwright page.
 */
export async function executeRouteActions(
  page: Page,
  actions: RouteAction[],
  timeoutMs: number,
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'click':
        await page.click(action.selector, { timeout: timeoutMs });
        break;
      case 'hover':
        await page.hover(action.selector, { timeout: timeoutMs });
        break;
      case 'fill':
        await page.fill(action.selector, action.value, { timeout: timeoutMs });
        break;
      case 'press':
        if (action.selector) {
          await page.press(action.selector, action.key, { timeout: timeoutMs });
        } else {
          await page.keyboard.press(action.key);
        }
        break;
      case 'waitForSelector':
        await page.waitForSelector(action.selector, {
          state: action.state ?? 'visible',
          timeout: timeoutMs,
        });
        break;
      case 'wait': {
        const clampedMs = Math.min(Math.max(0, action.ms), 30_000);
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(clampedMs);
        } else {
          await new Promise((r) => setTimeout(r, clampedMs));
        }
        break;
      }
    }
  }
}


