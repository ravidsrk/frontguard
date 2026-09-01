import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { visualTest } from '../src/visual-test.js';

/**
 * Real-browser integration tests (Part A3 gap). These launch an actual
 * headless Chromium, load static HTML, and exercise visualTest end to end.
 *
 * Local runs may explicitly set FRONTGUARD_SKIP_BROWSER_TESTS=1. CI always
 * attempts the launch so a missing or broken browser cannot produce a green run.
 */

const workDir = join(tmpdir(), `fg-integration-${process.pid}`);
const baselineDir = join(workDir, 'baselines');
const isCI = process.env.CI !== undefined || process.env.GITHUB_ACTIONS !== undefined;
const skipBrowserTests = process.env.FRONTGUARD_SKIP_BROWSER_TESTS === '1' && !isCI;

let browser: Browser;

/** Write a tiny static HTML page to disk and return a file:// URL for it. */
function writeHtml(file: string, boxColor: string): string {
  const html = `<!doctype html><html><head><style>
    body { margin: 0; }
    .box { width: 200px; height: 200px; background: ${boxColor}; }
  </style></head><body>
    <div class="box"></div>
    <div id="ts"></div>
    <script>document.getElementById('ts').textContent = String(Date.now());</script>
  </body></html>`;
  const abs = join(workDir, file);
  fs.writeFileSync(abs, html, 'utf8');
  return pathToFileURL(abs).href;
}

describe.skipIf(skipBrowserTests)('visualTest real-browser integration', () => {
  beforeAll(async () => {
    fs.mkdirSync(workDir, { recursive: true });
    browser = await chromium.launch();
  });

  afterAll(async () => {
    if (browser) await browser.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('flags a regression when the page changes', async () => {
    const redUrl = writeHtml('red.html', 'red');
    const blueUrl = writeHtml('blue.html', 'blue');

    const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
    try {
      // Baseline: red box.
      await page.goto(redUrl);
      const first = await visualTest(page, 'integration-regression', { baselineDir });
      expect(first.isNewBaseline).toBe(true);
      expect(first.passed).toBe(true);

      // Changed: blue box -> should be flagged as a regression.
      await page.goto(blueUrl);
      const second = await visualTest(page, 'integration-regression', { baselineDir });
      expect(second.isNewBaseline).toBe(false);
      expect(second.passed).toBe(false);
      expect(second.diffPercentage).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('passes when the page is unchanged', async () => {
    const url = writeHtml('stable.html', 'green');
    const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
    try {
      await page.goto(url);
      const first = await visualTest(page, 'integration-stable', { baselineDir });
      expect(first.isNewBaseline).toBe(true);
      expect(first.passed).toBe(true);

      await page.goto(url);
      const second = await visualTest(page, 'integration-stable', { baselineDir });
      expect(second.isNewBaseline).toBe(false);
      expect(second.passed).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('freezeTime actually freezes Date.now in the loaded page', async () => {
    const fixed = 1_700_000_000_000;
    const url = writeHtml('freeze.html', 'orange');
    const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
    try {
      // Navigate BEFORE visualTest, as documented real usage does.
      await page.goto(url);

      // This triggers the freezeTime path inside visualTest on the live page.
      const result = await visualTest(page, 'integration-freeze', { baselineDir, freezeTime: fixed });
      expect(result.passed).toBe(true);

      const t1 = await page.evaluate(() => Date.now());
      await page.waitForTimeout(50);
      const t2 = await page.evaluate(() => Date.now());

      expect(t1).toBe(fixed);
      expect(t2).toBe(fixed);
      // new Date() should also reflect the frozen time.
      const fromCtor = await page.evaluate(() => new Date().getTime());
      expect(fromCtor).toBe(fixed);
    } finally {
      await page.close();
    }
  }, 60_000);
});
