import * as path from 'node:path';
import { test as playwrightTest, type Page, type TestInfo } from '@playwright/test';
import type { VisualTestOptions, VisualTestResult } from './types.js';
import { compareImages } from './diff.js';
import { analyzeWithAI, warnOnce } from './ai.js';
import { BaselineStorage } from './storage.js';
import { recordTextSnapshots } from './text-snapshot.js';
import type { TextSnapshotKind } from './types.js';

/** Default frozen timestamp when `freezeTime: true` (`2024-01-01T00:00:00.000Z`, matching CLI). */
export const DEFAULT_FREEZE_TIMESTAMP = 1704067200000;

/** Default CSS selectors redacted when `redactSensitive` is enabled (parity with CLI + card/cvv/cvc). */
export const DEFAULT_SENSITIVE_SELECTORS: readonly string[] = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[autocomplete="one-time-code"]',
  'input[autocomplete^="cc-"]',
  'input[name*="card" i]',
  'input[name*="cvv" i]',
  'input[name*="cvc" i]',
  '[data-frontguard-redact]',
  '[data-sensitive]',
] as const;

/** True when running in a CI environment (`CI` env var set and not `'0'` / `'false'`). */
export function isCIEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CI?.trim().toLowerCase();
  return Boolean(raw && raw !== '0' && raw !== 'false');
}

/**
 * Resolve `freezeTime` option (`true`, epoch ms number, or ISO 8601 string) to
 * a numeric epoch millisecond timestamp, or `null` when disabled/invalid.
 */
export function resolveFreezeTimestamp(
  freezeTime: boolean | number | string | undefined,
): number | null {
  if (freezeTime === undefined || freezeTime === false) return null;
  if (freezeTime === true) return DEFAULT_FREEZE_TIMESTAMP;
  if (typeof freezeTime === 'number') return Number.isFinite(freezeTime) ? freezeTime : null;
  if (typeof freezeTime === 'string') {
    const parsed = Date.parse(freezeTime);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Linear-time, ReDoS-safe URL matcher supporting `*` wildcards and
 * case-insensitive substring matching. All regex metacharacters (including `?`)
 * are matched literally.
 */
export function matchesBlockedUrl(url: string, patterns: readonly string[]): boolean {
  const lowerUrl = url.toLowerCase();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;
    const lowerPattern = pattern.toLowerCase();
    if (!lowerPattern.includes('*')) {
      if (lowerUrl.includes(lowerPattern)) return true;
      continue;
    }
    const segments = lowerPattern.split('*').filter((s) => s.length > 0);
    if (segments.length === 0) return true; // Pattern was only `*`
    let searchFrom = 0;
    let matched = true;
    for (const seg of segments) {
      const idx = lowerUrl.indexOf(seg, searchFrom);
      if (idx === -1) {
        matched = false;
        break;
      }
      searchFrom = idx + seg.length;
    }
    if (matched) return true;
  }
  return false;
}

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
  const frozenTs = resolveFreezeTimestamp(opts.freezeTime);
  if (frozenTs !== null) {
    const clock = (page as { clock?: { setFixedTime?: (t: number) => Promise<void> } }).clock;
    if (clock?.setFixedTime) {
      await clock.setFixedTime(frozenTs).catch(() => {});
    } else {
      await page.addInitScript(`{
        const __ts = ${frozenTs};
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
      }, frozenTs)
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

    routeInterceptor = async (route: any) => {
      const reqUrl =
        typeof route?.request === 'function'
          ? (route.request()?.url?.() ?? '')
          : (route?.url ?? '');
      if (!reqUrl || matchesBlockedUrl(reqUrl, patterns)) {
        blockedRequestsCount = (blockedRequestsCount ?? 0) + 1;
        await route?.abort?.();
      } else {
        await route?.continue?.();
      }
    };
    await pageWithRoutes.route('**/*', routeInterceptor);
  }

  const redactSelectors = !opts.redactSensitive
    ? []
    : opts.redactSensitive === true
      ? [...DEFAULT_SENSITIVE_SELECTORS]
      : [
          ...new Set([
            ...DEFAULT_SENSITIVE_SELECTORS,
            ...opts.redactSensitive.map((s) => s.trim()).filter(Boolean),
          ]),
        ];

  const hasMasks = Boolean(
    opts.mask?.length || opts.maskRegions?.length || redactSelectors.length,
  );
  const wantsTextSnapshot = Boolean(
    opts.captureAriaSnapshot || opts.textSnapshot?.json || opts.textSnapshot?.markdown,
  );
  let currentBuffer: Buffer;
  let settled: boolean | undefined;
  let ariaSnapshot: string | undefined;
  let jsonText: string | undefined;
  let markdownText: string | undefined;
  const textErrors: Array<{ kind: TextSnapshotKind; ext: string; message: string }> = [];
  try {
    // Mask elements
    if (opts.mask?.length) {
      await page.evaluate((selectors: string[]) => {
        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              const htmlEl = el as HTMLElement;
              if (!htmlEl.hasAttribute('data-frontguard-prev-style')) {
                htmlEl.setAttribute('data-frontguard-prev-style', htmlEl.getAttribute('style') ?? '');
              }
              htmlEl.style.cssText += 'visibility:hidden!important;';
            });
          } catch {
            // Ignore malformed individual mask selector
          }
        }
      }, opts.mask);
    }

    // Redact sensitive elements across Document, open Shadow DOM, and same-origin iframes.
    // Selectors are evaluated individually so one invalid custom selector never disables defaults.
    if (redactSelectors.length > 0) {
      await page.evaluate((selectors: string[]) => {
        const mediaTags = new Set(['img', 'svg', 'canvas', 'video', 'picture']);
        const seenRoots = new Set<Document | ShadowRoot>();

        const applyVisualRedaction = (el: Element) => {
          const htmlEl = el as HTMLElement;
          if (!htmlEl.hasAttribute('data-frontguard-prev-style')) {
            htmlEl.setAttribute('data-frontguard-prev-style', htmlEl.getAttribute('style') ?? '');
          }
          htmlEl.style.setProperty('color', 'transparent', 'important');
          htmlEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          htmlEl.style.setProperty('text-shadow', 'none', 'important');
          htmlEl.style.setProperty('caret-color', 'transparent', 'important');
          if (mediaTags.has(el.tagName.toLowerCase())) {
            htmlEl.style.setProperty('opacity', '0', 'important');
          }
        };

        const visitRoot = (root: Document | ShadowRoot) => {
          if (seenRoots.has(root)) return;
          seenRoots.add(root);

          for (const sel of selectors) {
            try {
              const matches = root.querySelectorAll(sel);
              matches.forEach((matchEl) => {
                applyVisualRedaction(matchEl);
                matchEl.querySelectorAll('*').forEach((desc) => applyVisualRedaction(desc));
              });
            } catch {
              // Isolate malformed selector so remaining selectors still redact
            }
          }

          root.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) {
              visitRoot(el.shadowRoot);
            }
            if (el.tagName.toLowerCase() === 'iframe') {
              try {
                const doc = (el as HTMLIFrameElement).contentDocument;
                if (doc) visitRoot(doc);
              } catch {
                // Cross-origin iframe
              }
            }
          });
        };

        visitRoot(document);
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

    // Scrub redacted DOM values/text before capturing ARIA / JSON / Markdown text snapshots
    // so plaintext secrets never leak into saved text baselines or diffs.
    if (redactSelectors.length > 0 && wantsTextSnapshot) {
      await page
        .evaluate((selectors: string[]) => {
          const restoreKey = Symbol.for('frontguard.redactRestore');
          const win = window as unknown as Record<symbol, Array<() => void>>;
          const restores: Array<() => void> = win[restoreKey] ?? [];
          win[restoreKey] = restores;
          const seenRoots = new Set<Document | ShadowRoot>();
          const scrubbedElements = new Set<Element>();

          const scrubElement = (el: Element) => {
            if (scrubbedElements.has(el)) return;
            scrubbedElements.add(el);

            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea') {
              const field = el as HTMLInputElement | HTMLTextAreaElement;
              const origVal = field.value;
              const hadValueAttr = field.hasAttribute('value');
              const origValueAttr = field.getAttribute('value');
              const hadPlaceholder = field.hasAttribute('placeholder');
              const origPlaceholder = field.getAttribute('placeholder');

              field.value = '';
              if (hadValueAttr) field.setAttribute('value', '[REDACTED]');
              if (hadPlaceholder) field.setAttribute('placeholder', '[REDACTED]');

              restores.push(() => {
                field.value = origVal;
                if (hadValueAttr && origValueAttr !== null) field.setAttribute('value', origValueAttr);
                else if (hadValueAttr) field.removeAttribute('value');
                if (hadPlaceholder && origPlaceholder !== null) field.setAttribute('placeholder', origPlaceholder);
              });
            }

            if (el.hasAttribute('aria-label')) {
              const origAria = el.getAttribute('aria-label');
              el.setAttribute('aria-label', '[REDACTED]');
              restores.push(() => {
                if (origAria !== null) el.setAttribute('aria-label', origAria);
              });
            }

            if (tag !== 'input' && tag !== 'textarea') {
              const ownerDoc = el.ownerDocument || document;
              const walker = ownerDoc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              const textNodes: Text[] = [];
              let node: Node | null;
              while ((node = walker.nextNode())) {
                if (node.nodeValue && node.nodeValue.trim().length > 0) {
                  textNodes.push(node as Text);
                }
              }
              for (const tn of textNodes) {
                const origText = tn.nodeValue;
                tn.nodeValue = '[REDACTED]';
                restores.push(() => {
                  tn.nodeValue = origText;
                });
              }
            }
          };

          const visitRoot = (root: Document | ShadowRoot) => {
            if (seenRoots.has(root)) return;
            seenRoots.add(root);

            for (const sel of selectors) {
              try {
                root.querySelectorAll(sel).forEach((el) => scrubElement(el));
              } catch {
                // Ignore malformed selector
              }
            }

            root.querySelectorAll('*').forEach((el) => {
              if (el.shadowRoot) visitRoot(el.shadowRoot);
              if (el.tagName.toLowerCase() === 'iframe') {
                try {
                  const doc = (el as HTMLIFrameElement).contentDocument;
                  if (doc) visitRoot(doc);
                } catch {
                  // Cross-origin iframe
                }
              }
            });
          };

          visitRoot(document);
        }, redactSelectors)
        .catch(() => {});
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
    if (opts.textSnapshot?.json) {
      const read = await readOptionalPageText(page, opts.textSnapshot.json);
      if ('error' in read) textErrors.push({ kind: 'json', ext: '.json', message: read.error });
      else jsonText = read.body;
    }
    if (opts.textSnapshot?.markdown) {
      const read = await readOptionalPageText(page, opts.textSnapshot.markdown);
      if ('error' in read) textErrors.push({ kind: 'markdown', ext: '.md', message: read.error });
      else markdownText = read.body;
    }
  } finally {
    if (hasMasks) {
      await page
        .evaluate(() => {
          const restoreKey = Symbol.for('frontguard.redactRestore');
          const win = window as unknown as Record<symbol, Array<() => void> | undefined>;
          const restores = win[restoreKey];
          if (Array.isArray(restores)) {
            for (let i = restores.length - 1; i >= 0; i--) {
              try {
                restores[i]();
              } catch {
                // ignore individual restore failure
              }
            }
            delete win[restoreKey];
          }

          const seenRoots = new Set<Document | ShadowRoot>();
          const restoreRoot = (root: Document | ShadowRoot) => {
            if (seenRoots.has(root)) return;
            seenRoots.add(root);

            root.querySelectorAll('[data-frontguard-prev-style]').forEach((el) => {
              const prev = el.getAttribute('data-frontguard-prev-style');
              el.removeAttribute('data-frontguard-prev-style');
              if (prev) {
                el.setAttribute('style', prev);
              } else {
                el.removeAttribute('style');
              }
            });
            root.querySelectorAll('[data-frontguard-mask-region]').forEach((el) => {
              el.remove();
            });

            root.querySelectorAll('*').forEach((el) => {
              if (el.shadowRoot) restoreRoot(el.shadowRoot);
              if (el.tagName.toLowerCase() === 'iframe') {
                try {
                  const doc = (el as HTMLIFrameElement).contentDocument;
                  if (doc) restoreRoot(doc);
                } catch {
                  // Cross-origin iframe
                }
              }
            });
          };

          restoreRoot(document);
        })
        .catch(() => {});
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

  // Load or create baseline (fail closed in CI when baseline is missing and update is off)
  const baseline = storage.readBaseline(baselineKey);
  const missingInCI = baseline === null && opts.update !== true && isCIEnv();
  const writing = !missingInCI && (baseline === null || opts.update === true);
  const textFailure = textErrors[0];
  if (writing && textFailure) throw new Error(textFailure.message);
  const recorded = textItems.length
    ? recordTextSnapshots(storage, baselineKey, textItems, writing)
    : [];
  const failed = textErrors.map((item) => ({
    kind: item.kind,
    status: 'error' as const,
    path: storage.textPath(baselineKey, item.ext),
  }));
  const textSnapshots = recorded.length + failed.length > 0 ? [...recorded, ...failed] : undefined;

  if (missingInCI) {
    storage.writeFile(baselineKey, 'current', current);
    return {
      passed: false,
      diffPercentage: 1,
      baselinePath: storage.getPath(baselineKey),
      currentPath: storage.getPath(baselineKey, 'current'),
      isNewBaseline: false,
      missingBaseline: true,
      ...(settled !== undefined ? { settled } : {}),
      ...(blockedRequestsCount !== undefined ? { blockedRequestsCount } : {}),
      ...(ariaSnapshot !== undefined ? { ariaSnapshot } : {}),
      ...(textSnapshots ? { textSnapshots } : {}),
    };
  }

  if (writing) {
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
  const diff = compareImages(baseline!, current, opts.threshold);

  // Attribute clusters to specific DOM selectors when clusters exist.
  // When `opts.selector` scopes the screenshot to a component, subtract that
  // component's document-space origin so DOM boxes match component-local clusters.
  if (diff.clusters && diff.clusters.length > 0) {
    try {
      const domBoxes = await page.evaluate((componentSelector: string | null) => {
        let originX = 0;
        let originY = 0;
        let rootElements: Element[];

        if (componentSelector) {
          let compEl: Element | null = null;
          try {
            compEl = document.querySelector(componentSelector);
          } catch {
            compEl = null;
          }
          if (compEl) {
            const compRect = compEl.getBoundingClientRect();
            originX = compRect.left + window.scrollX;
            originY = compRect.top + window.scrollY;
            rootElements = [compEl, ...Array.from(compEl.querySelectorAll('*'))];
          } else {
            rootElements = Array.from(document.querySelectorAll('*'));
          }
        } else {
          rootElements = Array.from(document.querySelectorAll('*'));
        }

        const results: Array<{
          selector: string;
          x: number;
          y: number;
          width: number;
          height: number;
        }> = [];
        for (const el of rootElements) {
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
            x: rect.left + window.scrollX - originX,
            y: rect.top + window.scrollY - originY,
            width: rect.width,
            height: rect.height,
          });
        }
        return results;
      }, opts.selector ?? null);

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
    ...(diff.ssimOverride ? { ssimOverride: true } : {}),
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
    const outcome = await analyzeWithAI(baseline!, current, aiOpts, diff.diffBuffer);
    if (outcome.ai) result.ai = outcome.ai;
    if (outcome.aiError) {
      result.aiError = outcome.aiError;
      warnOnce(outcome.aiError);
    }
  }

  return result;
}

async function readOptionalPageText(
  page: Page,
  selector: string,
): Promise<{ body: string } | { error: string }> {
  try {
    return { body: await readPageText(page, selector) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
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
    if (result.missingBaseline) {
      throw new Error(
        `Missing visual baseline for "${name}" in CI (${result.baselinePath}). Generate and commit baselines locally or run with update: true / FRONTGUARD_UPDATE=1.`,
      );
    }
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
