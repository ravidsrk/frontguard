import type { Page } from '@playwright/test';
import type { VisualTestOptions, VisualTestResult } from './types.js';
import { compareImages } from './diff.js';
import { analyzeWithAI } from './ai.js';
import { BaselineStorage } from './storage.js';

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

  // Freeze time if requested
  if (opts.freezeTime !== false) {
    const ts = opts.freezeTime === true ? 0 : opts.freezeTime;
    await page.addInitScript(`{
      const __ts = ${ts};
      const __D = Date;
      Date = class extends __D {
        constructor(...a) { if(!a.length) return new __D(__ts); return new __D(...a); }
        static now() { return __ts; }
      };
      Date.prototype = __D.prototype;
    }`);
  }

  // Mask elements
  if (opts.mask?.length) {
    await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.cssText += 'visibility:hidden!important;';
        });
      }
    }, opts.mask);
  }

  // Mask regions
  if (opts.maskRegions?.length) {
    await page.evaluate((regions: Array<{ x: number; y: number; width: number; height: number }>) => {
      for (const r of regions) {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;background:#808080;z-index:999999;`;
        document.body.appendChild(d);
      }
    }, opts.maskRegions);
  }

  // Take screenshot
  const currentBuffer = await page.screenshot({ fullPage: opts.fullPage, type: 'png' });
  const current = Buffer.from(currentBuffer);

  // Get viewport info for filename
  const viewport = page.viewportSize();
  const vpStr = viewport ? `${viewport.width}x${viewport.height}` : 'default';
  const baselineKey = `${name}-${vpStr}`;

  // Load or create baseline
  const baseline = storage.readBaseline(baselineKey);

  if (!baseline || opts.update) {
    storage.writeBaseline(baselineKey, current);
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
