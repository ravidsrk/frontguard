import * as path from 'node:path';
import { test as playwrightTest, type Page, type TestInfo } from '@playwright/test';
import type { VisualTestOptions, VisualTestResult } from './types.js';
import { compareImages } from './diff.js';
import { analyzeWithAI } from './ai.js';
import { BaselineStorage } from './storage.js';

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
  // The page is typically already navigated by the caller, so an init script
  // (which only runs on the NEXT navigation) would be a no-op here. Prefer the
  // page.clock API which freezes time on the live page; fall back to injecting
  // an init script and reloading on older Playwright versions.
  if (opts.freezeTime !== false) {
    const ts = opts.freezeTime === true ? 0 : (opts.freezeTime ?? 0);
    const clock = (page as { clock?: { setFixedTime?: (t: number) => Promise<void> } }).clock;
    if (clock?.setFixedTime) {
      await clock.setFixedTime(ts);
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
  }

  const hasMasks = Boolean(opts.mask?.length || opts.maskRegions?.length);
  let currentBuffer: Buffer;
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

    // Take screenshot
    currentBuffer = await page.screenshot({ fullPage: opts.fullPage, type: 'png' });
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
  }
  const current = Buffer.from(currentBuffer);

  const baselineKey = getBaselineKey(page, name);

  // Load or create baseline
  const baseline = storage.readBaseline(baselineKey);

  if (baseline === null || opts.update) {
    storage.writeBaseline(baselineKey, current);
    storage.writeFile(baselineKey, 'current', current);
    return {
      passed: true,
      diffPercentage: 0,
      baselinePath: storage.getPath(baselineKey),
      currentPath: storage.getPath(baselineKey, 'current'),
      isNewBaseline: true,
    };
  }

  // Compare
  const diff = compareImages(baseline, current, opts.threshold);

  // Save current for debugging
  storage.writeFile(baselineKey, 'current', current);
  if (diff.diffBuffer) {
    storage.writeFile(baselineKey, 'diff', diff.diffBuffer);
  }

  const result: VisualTestResult = {
    passed: diff.passed,
    diffPercentage: diff.diffPercentage,
    baselinePath: storage.getPath(baselineKey),
    currentPath: storage.getPath(baselineKey, 'current'),
    diffPath: diff.diffBuffer ? storage.getPath(baselineKey, 'diff') : undefined,
    ssim: diff.ssim,
    isNewBaseline: false,
  };

  // AI analysis if enabled and diff detected
  if (opts.ai && !diff.passed) {
    const aiOpts = typeof opts.ai === 'object' ? opts.ai : { provider: 'openai' as const };
    result.ai = await analyzeWithAI(baseline, current, aiOpts);
  }

  return result;
}

export async function expectVisual(
  page: Page,
  name: string,
  options: VisualTestOptions = {}
): Promise<VisualTestResult> {
  const result = await visualTest(page, name, options);
  if (!result.passed) {
    const pct = (result.diffPercentage * 100).toFixed(2);
    throw new Error(
      `Visual regression detected for "${name}": ${pct}% diff (${result.diffPath ?? result.currentPath})`
    );
  }
  return result;
}
