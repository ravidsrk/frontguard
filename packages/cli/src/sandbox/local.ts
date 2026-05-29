/**
 * Local Playwright sandbox for fix verification.
 *
 * Renders a URL with the generated CSS patch injected as a stylesheet, using a
 * locally-launched Playwright browser. This is the zero-dependency fallback
 * that works without Daytona.
 *
 * @module sandbox/local
 */

import type { Sandbox, SandboxPatch, SandboxScreenshotParams } from './types.js';
import { logger } from '../utils/logger.js';
import { cropToMaxHeight } from '../render/crop.js';

/** Local Playwright-based sandbox. */
export class LocalSandbox implements Sandbox {
  private cssPatches: string[] = [];
  // Browser handles are typed loosely to avoid importing playwright types eagerly.
  private browser: { newPage: () => Promise<unknown>; close: () => Promise<void> } | null = null;

  async create(): Promise<void> {
    // Nothing to boot ahead of time — browsers are launched per screenshot to
    // support multiple engines. We just verify Playwright is importable.
    try {
      await import('playwright');
    } catch {
      throw new Error(
        'Local sandbox requires Playwright. Install it: npm install playwright',
      );
    }
  }

  async applyPatch(patch: SandboxPatch): Promise<void> {
    if (patch.type === 'css') {
      this.cssPatches.push(patch.content);
    } else {
      // HTML/config patches can't be applied via simple injection — log and skip.
      logger.debug(`LocalSandbox: ignoring non-CSS patch of type "${patch.type}"`);
    }
  }

  async screenshot(params: SandboxScreenshotParams): Promise<Buffer> {
    const pw = await import('playwright');
    const engine = pw[params.browser];
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: params.viewport, height: params.viewportHeight ?? 720 },
      });
      const page = await context.newPage();
      await page.goto(params.url, { waitUntil: 'networkidle', timeout: 30_000 });

      // Disable animations for stable screenshots.
      await page.addStyleTag({
        content: '*,*::before,*::after{animation:none!important;transition:none!important;}',
      });

      // Inject each CSS patch as a stylesheet.
      for (const css of this.cssPatches) {
        await page.addStyleTag({ content: css });
      }

      // Let the layout settle after patches.
      await page.waitForTimeout(300);

      let buffer = Buffer.from(await page.screenshot({ fullPage: true, type: 'png' }));
      await context.close();

      // Crop to maxHeight so the after-fix buffer matches the main renderer's
      // baseline dimensions on tall pages (otherwise the diff is always 100%).
      if (params.maxHeight && params.maxHeight > 0) {
        buffer = Buffer.from(await cropToMaxHeight(buffer, params.maxHeight));
      }
      return buffer;
    } finally {
      await browser.close();
    }
  }

  async destroy(): Promise<void> {
    this.cssPatches = [];
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* already closed */
      }
      this.browser = null;
    }
  }
}
