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
import { PNG } from 'pngjs';
import type {
  FrontguardConfig,
  Route,
  ScreenshotResult,
  BrowserEngine,
} from '../core/types.js';
import { logger } from '../utils/logger.js';

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
  const tasks: RenderTask[] = [];
  for (const route of routes) {
    for (const viewport of config.viewports) {
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
      batch.map((task) => executeTask(task, config, browserMap)),
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

    // --- Apply ignore rules (hide matching elements) ---------------------------
    if (config.ignore && config.ignore.length > 0) {
      await page.evaluate((rules: { selector: string }[]) => {
        for (const rule of rules) {
          const elements = document.querySelectorAll(rule.selector);
          for (const el of elements) {
            (el as HTMLElement).style.visibility = 'hidden';
          }
        }
      }, config.ignore);
    }

    // --- Take screenshot -------------------------------------------------------
    let screenshotBuffer: Buffer = Buffer.from(
      await page.screenshot({ fullPage: true, type: 'png' }),
    );

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
 * Crop a PNG buffer to a maximum height, preserving width.
 * If the image is shorter than maxHeight it is returned unchanged.
 */
async function cropToMaxHeight(
  buffer: Buffer,
  maxHeight: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (err, parsed) => {
      if (err) {
        // If we can't parse, return the original buffer rather than crashing
        logger.warn(`Could not parse PNG for cropping: ${err.message}`);
        resolve(buffer);
        return;
      }

      if (parsed.height <= maxHeight) {
        resolve(buffer);
        return;
      }

      // Create a cropped PNG
      const cropped = new PNG({ width: parsed.width, height: maxHeight });
      const bytesPerRow = parsed.width * 4;

      for (let y = 0; y < maxHeight; y++) {
        parsed.data.copy(
          cropped.data,
          y * bytesPerRow,
          y * bytesPerRow,
          (y + 1) * bytesPerRow,
        );
      }

      const chunks: Uint8Array[] = [];
      const stream = cropped.pack();
      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks) as Buffer));
      stream.on('error', reject);
    });
  });
}
