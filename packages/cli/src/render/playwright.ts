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
  ScreenshotResult,
  BrowserEngine,
} from '../core/types.js';
import { logger } from '../utils/logger.js';
import { cropToMaxHeight } from './crop.js';
import { STORYBOOK_READY_SCRIPT } from '../discovery/storybook.js';

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

const FREEZE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`.trim();

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
async function executeTask(
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

  // --- Create context (handles auth storage state) ---------------------------
  let context: BrowserContext;
  try {
    const contextOptions: Record<string, unknown> = {
      viewport: { width: task.viewport, height: config.viewportHeight ?? 720 },
    };

    if (config.auth?.storageState) {
      contextOptions.storageState = config.auth.storageState;
    }

    context = await browser.newContext(contextOptions);
  } catch (err) {
    throw new Error(
      `Failed to create browser context for ${task.browser} @ ${task.viewport}px: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let page: Page | undefined;

  try {
    page = await context.newPage();

    // --- Collect console errors ------------------------------------------------
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // --- Freeze Date/time if configured (must be before navigation) -----------
    if (config.freezeTime !== undefined && config.freezeTime !== false) {
      const timestamp = config.freezeTime === true ? 0 : config.freezeTime;
      await page.addInitScript(`{
        const __fg_frozen = ${timestamp};
        const __fg_OrigDate = Date;
        Date = class extends __fg_OrigDate {
          constructor(...args) { if (args.length === 0) return new __fg_OrigDate(__fg_frozen); return new __fg_OrigDate(...args); }
          static now() { return __fg_frozen; }
        };
        Date.prototype = __fg_OrigDate.prototype;
      }`);
    }

    // --- Navigate --------------------------------------------------------------
    const url = `${config.baseUrl}${task.route.path}`;
    logger.debug(`Navigating to ${url} [${task.browser} ${task.viewport}px]`);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: config.pageTimeout ?? 30_000,
    });

    // --- Smart render: freeze animations, wait for fonts -----------------------
    if (config.smartRender !== false) {
      // Inject animation-freezing CSS
      await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });

      // Wait for all web fonts to finish loading
      await page.evaluate(() => document.fonts.ready);
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

    // --- Take screenshot (with optional anti-flake multi-render) ---------------
    let screenshotBuffer: Buffer;
    const antiFlakeRenders = config.antiFlakeRenders ?? 1;

    if (antiFlakeRenders > 1) {
      const buffers: Buffer[] = [];
      for (let i = 0; i < antiFlakeRenders; i++) {
        if (i > 0) await page.waitForTimeout(100);
        buffers.push(Buffer.from(await page.screenshot({ fullPage: true, type: 'png' })));
      }
      screenshotBuffer = findConsensusScreenshot(buffers);
      logger.debug(`Anti-flake: took ${antiFlakeRenders} renders for ${task.route.path}`);
    } else {
      screenshotBuffer = Buffer.from(
        await page.screenshot({ fullPage: true, type: 'png' }),
      );
    }

    // --- Crop to maxHeight if configured ---------------------------------------
    if (config.maxHeight && config.maxHeight > 0) {
      screenshotBuffer = Buffer.from(await cropToMaxHeight(screenshotBuffer, config.maxHeight));
    }

    // --- Capture DOM snapshot --------------------------------------------------
    const domSnapshot = await page.content();

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


