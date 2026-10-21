/**
 * Optional ARIA, JSON, and Markdown snapshots stored beside each PNG.
 *
 * A text mismatch is reported on its own. It does not change `comparisonMethod`
 * and it does not pass or fail a pixel comparison. axe-core remains the
 * accessibility plugin; this file does not audit WCAG rules.
 *
 * @module plugins/text-snapshot
 */

import type { Browser, Page } from 'playwright';
import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type { ScreenshotResult, TextSnapshotReport } from '../core/types.js';
import { executeRouteActions } from '../render/route-actions.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { logger } from '../utils/logger.js';

export interface TextSnapshotConfig {
  /** Write the page ARIA snapshot. */
  aria?: boolean;
  /** CSS selector whose text is the JSON blob. */
  json?: string;
  /** CSS selector whose text is the Markdown blob. */
  markdown?: string;
}

const WRITE_KEY = 'tw';

export function normalizeTextSnapshot(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function suffixFor(kind: TextSnapshotReport['kind']): string {
  if (kind === 'aria') return '.aria.txt';
  if (kind === 'json') return '.json';
  return '.md';
}

type Captured =
  | { kind: TextSnapshotReport['kind']; body: string }
  | { kind: TextSnapshotReport['kind']; error: string };

/**
 * Creates the text-snapshot plugin. Off unless `aria`, `json`, or `markdown` is set.
 */
export function createTextSnapshotPlugin(config: TextSnapshotConfig = {}): FrontguardPlugin {
  let reports: TextSnapshotReport[] = [];
  const kinds: Array<{ kind: TextSnapshotReport['kind']; selector?: string }> = [];
  if (config.aria) kinds.push({ kind: 'aria' });
  if (config.json) kinds.push({ kind: 'json', selector: config.json });
  if (config.markdown) kinds.push({ kind: 'markdown', selector: config.markdown });

  return {
    name: 'text-snapshot',

    async afterRender(screenshots: ScreenshotResult[], ctx: PluginContext): Promise<void> {
      reports = [];
      if (kinds.length === 0) return;
      const writing = ctx.metadata.get(WRITE_KEY) === true;
      const pw = await import('playwright').catch(() => null);
      if (!pw) {
        const message = 'Text snapshots need playwright installed.';
        if (writing) throw new Error(message);
        logger.warn(message);
        return;
      }
      const storage = new GitOrphanStorage(process.cwd(), { mode: writing ? 'update' : 'compare' });
      await storage.init();
      const browser = await pw.chromium.launch({ headless: true });
      const pending: Array<{ shot: ScreenshotResult; kind: TextSnapshotReport['kind']; suffix: string; body: string }> = [];
      try {
        for (const shot of screenshots) {
          let captured: Captured[];
          try {
            captured = await captureShot(browser, shot, ctx, config);
          } catch (err) {
            if (writing) throw err;
            for (const item of kinds) {
              reports.push({ ...shotKey(shot), kind: item.kind, status: 'error' });
            }
            continue;
          }
          for (const item of captured) {
            const suffix = suffixFor(item.kind);
            if ('error' in item) {
              if (writing) throw new Error(item.error);
              reports.push({ ...shotKey(shot), kind: item.kind, status: 'error' });
              continue;
            }
            const body = normalizeTextSnapshot(item.body);
            if (writing) {
              pending.push({ shot, kind: item.kind, suffix, body });
              continue;
            }
            const previous = await storage.textFile(shot.route.path, shot.viewport, shot.browser, suffix);
            const status = previous === null
              ? 'new'
              : normalizeTextSnapshot(previous) === body
                ? 'match'
                : 'mismatch';
            reports.push({ ...shotKey(shot), kind: item.kind, status });
          }
        }
        for (const item of pending) {
          await storage.textFile(
            item.shot.route.path,
            item.shot.viewport,
            item.shot.browser,
            item.suffix,
            item.body,
          );
          reports.push({ ...shotKey(item.shot), kind: item.kind, status: 'new' });
        }
      } finally {
        await browser.close();
      }
      ctx.metadata.set('text-snapshot:reports', reports);
    },

    afterRun(result): void {
      if (reports.length > 0) result.textSnapshots = reports;
    },
  };
}

function shotKey(shot: ScreenshotResult): Pick<TextSnapshotReport, 'route' | 'viewport' | 'browser'> {
  return { route: shot.route.path, viewport: shot.viewport, browser: shot.browser };
}

async function captureShot(
  browser: Browser,
  shot: ScreenshotResult,
  ctx: PluginContext,
  config: TextSnapshotConfig,
): Promise<Captured[]> {
  const timeoutMs = ctx.config.pageTimeout ?? 30_000;
  const colorScheme = shot.route.colorScheme ?? ctx.config.colorScheme;
  const context = await browser.newContext({
    viewport: { width: shot.viewport, height: ctx.config.viewportHeight ?? 720 },
    ...(ctx.config.auth?.storageState ? { storageState: ctx.config.auth.storageState } : {}),
    ...(colorScheme ? { colorScheme } : {}),
  });
  try {
    const page = await context.newPage();
    const url = new URL(shot.route.path, ctx.config.baseUrl).href;
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    if (shot.route.waitForSelector) {
      await page.waitForSelector(shot.route.waitForSelector, { state: 'visible', timeout: timeoutMs });
    }
    if (shot.route.actions && shot.route.actions.length > 0) {
      await executeRouteActions(page, shot.route.actions, timeoutMs);
    }
    const out: Captured[] = [];
    if (config.aria) out.push(await readAria(page));
    if (config.json) out.push(await readText(page, 'json', config.json));
    if (config.markdown) out.push(await readText(page, 'markdown', config.markdown));
    return out;
  } finally {
    await context.close();
  }
}

async function readAria(page: Page): Promise<Captured> {
  try {
    const raw = page.locator('body');
    const target = typeof raw.first === 'function' ? raw.first() : raw;
    if (typeof target.ariaSnapshot !== 'function') return { kind: 'aria', error: 'ARIA snapshot is unavailable' };
    return { kind: 'aria', body: await target.ariaSnapshot() };
  } catch (err) {
    return { kind: 'aria', error: err instanceof Error ? err.message : String(err) };
  }
}

async function readText(page: Page, kind: 'json' | 'markdown', selector: string): Promise<Captured> {
  try {
    const raw = page.locator(selector);
    const target = typeof raw.first === 'function' ? raw.first() : raw;
    if (typeof target.textContent !== 'function') return { kind, error: `No text for ${selector}` };
    return { kind, body: (await target.textContent()) ?? '' };
  } catch (err) {
    return { kind, error: err instanceof Error ? err.message : String(err) };
  }
}
