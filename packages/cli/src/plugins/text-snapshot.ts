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
import type { BrowserEngine, ScreenshotResult, TextSnapshotReport } from '../core/types.js';
import { pageUrl } from '../discovery/story-url.js';
import { STORYBOOK_READY_SCRIPT } from '../discovery/storybook.js';
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

function clipText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
}

function textExcerpt(baseline: string, current: string): string {
  return `was ${clipText(baseline)} now ${clipText(current)}`;
}

type Captured =
  | { kind: TextSnapshotReport['kind']; body: string }
  | { kind: TextSnapshotReport['kind']; error: string };

type PlaywrightEngines = Partial<Record<BrowserEngine, { launch?: (opts: { headless: boolean; args?: string[] }) => Promise<Browser> }>>;

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

    async afterRender(shots: ScreenshotResult[], ctx: PluginContext): Promise<void> {
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
      const pending: Array<{ shot: ScreenshotResult; kind: TextSnapshotReport['kind']; suffix: string; body: string }> = [];
      const groups = new Map<BrowserEngine, ScreenshotResult[]>();
      for (const shot of shots) {
        const list = groups.get(shot.browser);
        if (list) list.push(shot);
        else groups.set(shot.browser, [shot]);
      }
      const markFailed = (shot: ScreenshotResult): void => {
        for (const item of kinds) reports.push({ ...shotKey(shot), kind: item.kind, status: 'error' });
      };
      for (const [name, shots] of groups) {
        let browser: Browser;
        try {
          browser = await launchEngine(pw as PlaywrightEngines, name);
        } catch (err) {
          if (writing) throw err;
          for (const shot of shots) markFailed(shot);
          continue;
        }
        try {
          for (const shot of shots) {
            let captured: Captured[];
            try {
              captured = await captureShot(browser, shot, ctx, config);
            } catch (err) {
              if (writing) throw err;
              markFailed(shot);
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
              const status = previous === null ? 'new' : previous === body ? 'match' : 'mismatch';
              reports.push({
                ...shotKey(shot),
                kind: item.kind,
                status,
                ...(status === 'mismatch' && previous !== null ? { excerpt: textExcerpt(previous, body) } : {}),
              });
            }
          }
        } finally {
          await browser.close();
        }
      }
      for (const item of pending) {
        await storage.textFile(item.shot.route.path, item.shot.viewport, item.shot.browser, item.suffix, item.body);
        reports.push({ ...shotKey(item.shot), kind: item.kind, status: 'new' });
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

async function launchEngine(pw: PlaywrightEngines, name: BrowserEngine): Promise<Browser> {
  const engine = pw[name];
  if (!engine || typeof engine.launch !== 'function') throw new Error(`Browser "${name}" is not available`);
  return engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'] } : {}),
  });
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
    const blockUrls = [...(ctx.config.blockUrls ?? []), ...(shot.route.blockUrls ?? [])];
    if (blockUrls.length > 0 && typeof context.route === 'function') {
      await context.route('**/*', async (route) => {
        if (urlBlocked(route.request().url(), blockUrls)) await route.abort('blockedbyclient');
        else await route.continue();
      });
    }
    const page = await context.newPage();
    await freezeAndSeed(page, shot, ctx);
    const url = pageUrl(ctx.config.baseUrl, shot.route.path, shot.route.discoveredVia);
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    if (shot.route.waitForSelector) {
      await page.waitForSelector(shot.route.waitForSelector, { state: 'visible', timeout: timeoutMs });
    }
    if (shot.route.actions && shot.route.actions.length > 0) {
      await executeRouteActions(page, shot.route.actions, timeoutMs);
    }
    if (shot.route.discoveredVia === 'storybook') await waitForStorybook(page, shot, timeoutMs);
    const out: Captured[] = [];
    if (config.aria) out.push(await readAria(page));
    if (config.json) out.push(await readText(page, 'json', config.json));
    if (config.markdown) out.push(await readText(page, 'markdown', config.markdown));
    return out;
  } finally {
    await context.close();
  }
}

async function freezeAndSeed(page: Page, shot: ScreenshotResult, ctx: PluginContext): Promise<void> {
  const frozen = frozenAt(shot.route.freezeTime ?? ctx.config.freezeTime);
  if (frozen !== null) {
    const clock = page as Page & { clock?: { setFixedTime?: (time: number) => Promise<void> } };
    if (typeof clock.clock?.setFixedTime === 'function') await clock.clock.setFixedTime(frozen).catch(() => {});
    if (typeof page.addInitScript === 'function') {
      await page.addInitScript(`{const __fg_frozen=${frozen};const __fg_OrigDate=Date;Date=class extends __fg_OrigDate{constructor(...args){if(args.length===0)return new __fg_OrigDate(__fg_frozen);return new __fg_OrigDate(...args);}static now(){return __fg_frozen;}};Date.prototype=__fg_OrigDate.prototype;}`);
    }
  }
  const seed = shot.route.seedRandom ?? ctx.config.seedRandom;
  if (seed !== undefined && seed !== false && typeof page.addInitScript === 'function') {
    const seedVal = seed === true ? 42 : seed;
    await page.addInitScript(`{let __fg_seed=(${Number(seedVal)}>>>0)||42;Math.random=function(){let t=(__fg_seed+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}`);
  }
}

async function waitForStorybook(page: Page, shot: ScreenshotResult, timeoutMs: number): Promise<void> {
  try {
    const sbTimeout = Math.min(timeoutMs, 30_000);
    await page.evaluate(`(${STORYBOOK_READY_SCRIPT})(${sbTimeout})`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.waitForTimeout(50);
  } catch (err) {
    logger.warn(
      `Storybook ready-wait failed for ${shot.route.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function frozenAt(freezeTime: boolean | number | string | undefined): number | null {
  if (freezeTime === undefined || freezeTime === false) return null;
  if (freezeTime === true) return 1704067200000;
  if (typeof freezeTime === 'number') return freezeTime;
  if (typeof freezeTime === 'string') {
    const parsed = Date.parse(freezeTime);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function urlBlocked(url: string, patterns: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.includes('*')) {
      const escaped = lowerPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      if (new RegExp(`^${escaped}$`, 'i').test(url) || new RegExp(escaped, 'i').test(url)) return true;
    } else if (lowerUrl.includes(lowerPattern)) {
      return true;
    }
  }
  return false;
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
