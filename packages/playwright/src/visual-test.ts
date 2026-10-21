import * as path from 'node:path';
import { test as playwrightTest, type Page, type TestInfo } from '@playwright/test';
import type { VisualTestOptions, VisualTestResult } from './types.js';
import { compareImages } from './diff.js';
import { analyzeWithAI } from './ai.js';
import { BaselineStorage } from './storage.js';
import { recordTextSnapshots } from './text-snapshot.js';
import type { TextSnapshotKind } from './types.js';

function currentTestInfo(): TestInfo | undefined {
  try {
    return playwrightTest.info();
  } catch {
    // visualTest can also be called with a standalone Playwright Page.
    return undefined;
  }
}

function readablePart(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function getBaselineKey(page: Page, name: string): string {
  const testInfo = currentTestInfo();
  const viewport = page.viewportSize();
  const browser = page.context().browser()?.browserType().name()
    ?? testInfo?.project.use.browserName
    ?? null;
  const testFile = testInfo ? path.relative(testInfo.project.testDir, testInfo.file) : null;
  const testName = testInfo ? testInfo.titlePath.slice(1).join(' ') : 'standalone';
  const viewportName = viewport ? `${viewport.width}x${viewport.height}` : 'default';
  const identity = {
    test: testInfo ? { id: testInfo.testId, file: testFile, titlePath: testInfo.titlePath } : null,
    project: testInfo?.project.name ?? null,
    browser,
    platform: process.platform,
    caller: name,
    viewport,
  };
  const readable = [
    `test-${readablePart(`${testName} ${testFile ?? ''}`.trim(), 36)}`,
    `name-${readablePart(name, 20)}`,
    `project-${readablePart(testInfo?.project.name || 'default', 16)}`,
    `browser-${readablePart(browser ?? 'unknown', 12)}`,
    `platform-${readablePart(identity.platform, 10)}`,
    `viewport-${readablePart(viewportName, 15)}`,
  ].join('__');

  // JSON preserves the complete, untruncated dimensions for storage's digest.
  return `${readable}__identity-${JSON.stringify(identity)}`;
}

export async function visualTest(
  page: Page,
  name: string,
  options: VisualTestOptions = {}
): Promise<VisualTestResult> {
  const opts = {
    threshold: 0.01,
    fullPage: true,
    ai: false as VisualTestOptions['ai'],
    freezeTime: false as VisualTestOptions['freezeTime'],
    baselineDir: '__visual_baselines__',
    update: process.env.FRONTGUARD_UPDATE === '1',
    ...options,
  };

  const storage = new BaselineStorage(opts.baselineDir);

  // Freeze time if requested.
  if (opts.freezeTime !== false && opts.freezeTime !== undefined) {
    const rawTs =
      typeof opts.freezeTime === 'string'
        ? Date.parse(opts.freezeTime)
        : opts.freezeTime === true
          ? 0
          : (opts.freezeTime ?? 0);
    const ts = Number.isFinite(rawTs) ? rawTs : 0;
    const clock = (page as { clock?: { setFixedTime?: (t: number) => Promise<void> } }).clock;
    if (clock?.setFixedTime) {
      await clock.setFixedTime(ts).catch(() => {});
    } else {
      await page.addInitScript(`{
        const __ts = ${ts};
        const __D = Date;
        const __FrozenDate = class extends __D {
          constructor(...a) { super(...(a.length ? a : [__ts])); }
          static now() { return __ts; }
        };
        window.Date = __FrozenDate;
      }`);
      await page.reload();
    }
    await page
      .evaluate((fixedTs: number) => {
        const OrigDate = window.Date;
        const FrozenDate = class extends OrigDate {
          constructor(...args: unknown[]) {
            if (args.length === 0) {
              super(fixedTs);
            } else {
              // @ts-expect-error spread into Date constructor
              super(...args);
            }
          }
          static now() {
            return fixedTs;
          }
        };
        window.Date = FrozenDate as DateConstructor;
      }, ts)
      .catch(() => {});
  }

  // Seed Math.random with deterministic Mulberry32 PRNG if requested.
  if (opts.seedRandom) {
    const seed = typeof opts.seedRandom === 'number' ? opts.seedRandom : 42;
    await page
      .evaluate((initialSeed: number) => {
        let state = initialSeed >>> 0;
        Math.random = () => {
          state = (state + 0x6d2b79f5) >>> 0;
          let t = Math.imul(state ^ (state >>> 15), 1 | state);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }, seed)
      .catch(() => {});
  }

  // Block matching network URLs if requested.
  let blockedRequestsCount: number | undefined;
  let routeInterceptor: ((route: any) => Promise<void>) | undefined;
  const pageWithRoutes = page as unknown as {
    route?: (url: string, handler: (route: any) => Promise<void>) => Promise<void>;
    unroute?: (url: string, handler?: (route: any) => Promise<void>) => Promise<void>;
  };

  if (opts.blockUrls && opts.blockUrls.length > 0 && typeof pageWithRoutes.route === 'function') {
    blockedRequestsCount = 0;
    const patterns = opts.blockUrls;
    const matchesBlockedPattern = (url: string): boolean => {
      for (const pat of patterns) {
        if (url.includes(pat)) return true;
        const regexStr = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*');
        if (new RegExp(regexStr, 'i').test(url)) return true;
      }
      return false;
    };

    routeInterceptor = async (route: any) => {
      const reqUrl =
        typeof route?.request === 'function'
          ? (route.request()?.url?.() ?? '')
          : (route?.url ?? '');
      if (!reqUrl || matchesBlockedPattern(reqUrl)) {
        blockedRequestsCount = (blockedRequestsCount ?? 0) + 1;
        await route?.abort?.();
      } else {
        await route?.continue?.();
      }
    };
    await pageWithRoutes.route('**/*', routeInterceptor);
  }

  const defaultSensitiveSelectors = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
    'input[autocomplete="one-time-code"]',
    'input[autocomplete^="cc-"]',
    '[data-frontguard-redact]',
    '[data-sensitive]',
  ];
  const redactSelectors = !opts.redactSensitive
    ? []
    : opts.redactSensitive === true
      ? defaultSensitiveSelectors
      : [...new Set([...defaultSensitiveSelectors, ...opts.redactSensitive])];

  const hasMasks = Boolean(
    opts.mask?.length || opts.maskRegions?.length || redactSelectors.length,
  );
  let currentBuffer: Buffer;
  let settled: boolean | undefined;
  let ariaSnapshot: string | undefined;
  let jsonText: string | undefined;
  let markdownText: string | undefined;
  try {
    // Mask elements
    if (opts.mask?.length) {
      await page.evaluate((selectors: string[]) => {
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (!htmlEl.hasAttribute('data-frontguard-prev-style')) {
              htmlEl.setAttribute('data-frontguard-prev-style', htmlEl.getAttribute('style') ?? '');
            }
            htmlEl.style.cssText += 'visibility:hidden!important;';
          });
        }
      }, opts.mask);
    }

    // Redact sensitive inputs while keeping their box geometry intact
    if (redactSelectors.length > 0) {
      await page.evaluate((selectors: string[]) => {
        const combined = selectors.join(', ');
        document.querySelectorAll(combined).forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (!htmlEl.hasAttribute('data-frontguard-prev-style')) {
            htmlEl.setAttribute('data-frontguard-prev-style', htmlEl.getAttribute('style') ?? '');
          }
          htmlEl.style.cssText +=
            'color:transparent!important;text-shadow:none!important;caret-color:transparent!important;';
        });
      }, redactSelectors);
    }

    // Mask regions
    if (opts.maskRegions?.length) {
      await page.evaluate((regions: Array<{ x: number; y: number; width: number; height: number }>) => {
        for (const r of regions) {
          const d = document.createElement('div');
          d.setAttribute('data-frontguard-mask-region', 'true');
          d.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;background:#808080;z-index:999999;`;
          document.body.appendChild(d);
        }
      }, opts.maskRegions);
    }

    const takeCapture = async (): Promise<Buffer> => {
      if (opts.selector && typeof (page as unknown as { locator?: unknown }).locator === 'function') {
        const rawLoc = (
          page as unknown as {
            locator: (s: string) => {
              first?: () => { screenshot: (o: { type: 'png' }) => Promise<Buffer> };
              screenshot?: (o: { type: 'png' }) => Promise<Buffer>;
            };
          }
        ).locator(opts.selector);
        const target = typeof rawLoc.first === 'function' ? rawLoc.first() : rawLoc;
        return Buffer.from(await target.screenshot!({ type: 'png' }));
      }
      return Buffer.from(await page.screenshot({ fullPage: opts.fullPage, type: 'png' }));
    };

    if (opts.waitForStable) {
      const stableCfg = typeof opts.waitForStable === 'object' ? opts.waitForStable : {};
      const maxAttempts = Math.max(2, stableCfg.maxAttempts ?? 3);
      const intervalMs = Math.max(0, stableCfg.intervalMs ?? 80);
      let prev = await takeCapture();
      settled = false;
      for (let attempt = 1; attempt < maxAttempts; attempt++) {
        if (intervalMs > 0) {
          await new Promise((r) => setTimeout(r, intervalMs));
        }
        const next = await takeCapture();
        if (prev.equals(next) || compareImages(prev, next, opts.threshold).passed) {
          prev = next;
          settled = true;
          break;
        }
        prev = next;
      }
      currentBuffer = prev;
    } else {
      currentBuffer = await takeCapture();
    }

    if (opts.captureAriaSnapshot) {
      const rootSelector = opts.selector || 'body';
      if (typeof (page as unknown as { locator?: unknown }).locator === 'function') {
        try {
          const rawLoc = (
            page as unknown as {
              locator: (s: string) => {
                ariaSnapshot?: () => Promise<string>;
                first?: () => { ariaSnapshot?: () => Promise<string> };
              };
            }
          ).locator(rootSelector);
          if (typeof rawLoc?.ariaSnapshot === 'function') {
            ariaSnapshot = await rawLoc.ariaSnapshot();
          } else if (typeof rawLoc?.first === 'function') {
            const firstLoc = rawLoc.first();
            if (typeof firstLoc?.ariaSnapshot === 'function') {
              ariaSnapshot = await firstLoc.ariaSnapshot();
            }
          }
        } catch {
          // Fall back to evaluate tree below
        }
      }
      if (ariaSnapshot === undefined) {
        try {
          const evaluated = await page.evaluate((sel: string) => {
            const root = document.querySelector(sel) || document.body;
            if (!root) return '';
            const lines: string[] = [];
            const walk = (el: Element, depth: number) => {
              const role = el.getAttribute('role') || el.tagName.toLowerCase();
              const label =
                el.getAttribute('aria-label') ||
                (el as HTMLElement).innerText?.trim()?.slice(0, 50) ||
                '';
              lines.push(`${'  '.repeat(depth)}- ${role}${label ? ` "${label}"` : ''}`);
              for (const child of Array.from(el.children)) {
                walk(child, depth + 1);
              }
            };
            walk(root, 0);
            return lines.join('\n');
          }, rootSelector);
          ariaSnapshot = typeof evaluated === 'string' ? evaluated : '';
        } catch {
          ariaSnapshot = '';
        }
      }
    }
    if (opts.textSnapshot?.json) jsonText = await readPageText(page, opts.textSnapshot.json);
    if (opts.textSnapshot?.markdown) markdownText = await readPageText(page, opts.textSnapshot.markdown);
  } finally {
    if (hasMasks) {
      await page.evaluate(() => {
        document.querySelectorAll('[data-frontguard-prev-style]').forEach((el) => {
          const prev = el.getAttribute('data-frontguard-prev-style');
          el.removeAttribute('data-frontguard-prev-style');
          if (prev) {
            el.setAttribute('style', prev);
          } else {
            el.removeAttribute('style');
          }
        });
        document.querySelectorAll('[data-frontguard-mask-region]').forEach((el) => {
          el.remove();
        });
      });
    }
    if (routeInterceptor && typeof pageWithRoutes.unroute === 'function') {
      await pageWithRoutes.unroute('**/*', routeInterceptor).catch(() => {});
    }
  }
  const current = Buffer.from(currentBuffer);

  const baselineKey = getBaselineKey(page, opts.selector ? `${name}__${opts.selector}` : name);
  const textItems: Array<{ kind: TextSnapshotKind; ext: string; body: string }> = [];
  if (ariaSnapshot !== undefined) textItems.push({ kind: 'aria', ext: '.aria.txt', body: ariaSnapshot });
  if (jsonText !== undefined) textItems.push({ kind: 'json', ext: '.json', body: jsonText });
  if (markdownText !== undefined) textItems.push({ kind: 'markdown', ext: '.md', body: markdownText });

  // Load or create baseline
  const baseline = storage.readBaseline(baselineKey);
  const textSnapshots = textItems.length
    ? recordTextSnapshots(storage, baselineKey, textItems, baseline === null || opts.update === true)
    : undefined;

  if (baseline === null || opts.update) {
    storage.writeBaseline(baselineKey, current);
    storage.writeFile(baselineKey, 'current', current);
    return {
      passed: true,
      diffPercentage: 0,
      baselinePath: storage.getPath(baselineKey),
      currentPath: storage.getPath(baselineKey, 'current'),
      isNewBaseline: true,
      ...(settled !== undefined ? { settled } : {}),
      ...(blockedRequestsCount !== undefined ? { blockedRequestsCount } : {}),
      ...(ariaSnapshot !== undefined ? { ariaSnapshot } : {}),
      ...(textSnapshots ? { textSnapshots } : {}),
    };
  }

  // Compare
  const diff = compareImages(baseline, current, opts.threshold);

  // Attribute clusters to specific DOM selectors when clusters exist
  if (diff.clusters && diff.clusters.length > 0) {
    try {
      const domBoxes = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        const results: Array<{
          selector: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }> = [];
        for (const el of elements) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'html' || tag === 'body' || tag === 'head' || tag === 'script' || tag === 'style') {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const testId = el.getAttribute('data-testid');
          let selector = tag;
          if (testId) {
            selector = `[data-testid="${testId}"]`;
          } else if (el.id) {
            selector = `#${el.id}`;
          } else if (typeof el.className === 'string' && el.className.trim()) {
            const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            selector = `${tag}.${cls}`;
          }
          results.push({
            selector,
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
          });
        }
        return results;
      });

      if (Array.isArray(domBoxes) && domBoxes.length > 0) {
        for (const cluster of diff.clusters) {
          const cb = cluster.bbox;
          const clusterArea = Math.max(1, cb.width * cb.height);
          let bestSelector: string | undefined;
          let bestOverlap = 0;
          let bestIoU = 0;

          for (const item of domBoxes as Array<{
            selector?: string;
            bbox?: { x: number; y: number; width: number; height: number };
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }>) {
            if (!item || typeof item.selector !== 'string' || !item.selector.trim()) continue;
            const eb = item.bbox ?? {
              x: item.x ?? 0,
              y: item.y ?? 0,
              width: item.width ?? 0,
              height: item.height ?? 0,
            };
            if (eb.width <= 0 || eb.height <= 0) continue;

            const ix = Math.max(0, Math.min(cb.x + cb.width, eb.x + eb.width) - Math.max(cb.x, eb.x));
            const iy = Math.max(0, Math.min(cb.y + cb.height, eb.y + eb.height) - Math.max(cb.y, eb.y));
            const overlap = ix * iy;
            if (overlap <= 0) continue;

            const elArea = eb.width * eb.height;
            const iou = overlap / (clusterArea + elArea - overlap);

            if (
              overlap > bestOverlap ||
              (overlap === bestOverlap && iou > bestIoU)
            ) {
              bestOverlap = overlap;
              bestIoU = iou;
              bestSelector = item.selector.trim();
            }
          }

          if (bestSelector) {
            cluster.targetSelector = bestSelector;
          }
        }
      }
    } catch {
      // Best-effort DOM attribution
    }
  }

  // Save current for debugging
  storage.writeFile(baselineKey, 'current', current);
  if (diff.diffBuffer) {
    storage.writeFile(baselineKey, 'diff', diff.diffBuffer);
  }

  const result: VisualTestResult = {
    passed: diff.passed,
    diffPercentage: diff.diffPercentage,
    windowMax: diff.windowMax,
    baselinePath: storage.getPath(baselineKey),
    currentPath: storage.getPath(baselineKey, 'current'),
    diffPath: diff.diffBuffer ? storage.getPath(baselineKey, 'diff') : undefined,
    ssim: diff.ssim,
    isNewBaseline: false,
    ...(settled !== undefined ? { settled } : {}),
    ...(diff.clusters && diff.clusters.length > 0 ? { clusters: diff.clusters } : {}),
    ...(blockedRequestsCount !== undefined ? { blockedRequestsCount } : {}),
    ...(ariaSnapshot !== undefined ? { ariaSnapshot } : {}),
    ...(textSnapshots ? { textSnapshots } : {}),
  };

  // AI analysis if enabled and diff detected
  if (opts.ai && !diff.passed) {
    const aiOpts = typeof opts.ai === 'object' ? opts.ai : { provider: 'openai' as const };
    result.ai = await analyzeWithAI(baseline, current, aiOpts);
  }

  return result;
}

async function readPageText(page: Page, selector: string): Promise<string> {
  const locatorPage = page as Page & {
    locator?: (selector: string) => {
      textContent?: () => Promise<string | null>;
      first?: () => { textContent?: () => Promise<string | null> };
    };
  };
  if (typeof locatorPage.locator !== 'function') return '';
  const raw = locatorPage.locator(selector);
  const target = typeof raw.first === 'function' ? raw.first() : raw;
  if (typeof target.textContent !== 'function') return '';
  return (await target.textContent()) ?? '';
}

export async function expectVisual(
  page: Page,
  name: string,
  options: VisualTestOptions = {}
): Promise<VisualTestResult> {
  const result = await visualTest(page, name, options);
  if (!result.passed) {
    const pct = (result.diffPercentage * 100).toFixed(2);
    const windowNote =
      result.windowMax !== undefined && result.windowMax > 64
        ? `, 16×16 window ${result.windowMax} > 64`
        : '';
    throw new Error(
      `Visual regression detected for "${name}": ${pct}% diff${windowNote} (${result.diffPath ?? result.currentPath})`,
    );
  }
  return result;
}
