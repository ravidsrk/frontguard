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
const isCI = process.env.GITHUB_ACTIONS !== undefined;
const hasBrowserBinary = (() => {
  try {
    const execPath = chromium.executablePath();
    if (!fs.existsSync(execPath)) return false;
    const headlessDir = execPath.replace(/\/chromium-(\d+)\/.*$/, '/chromium_headless_shell-$1');
    return (
      fs.existsSync(join(headlessDir, 'INSTALLATION_COMPLETE')) ||
      fs.existsSync(join(headlessDir, 'chrome-linux/headless_shell')) ||
      fs.existsSync(join(headlessDir, 'chrome-headless-shell-linux64/chrome-headless-shell')) ||
      fs.existsSync(join(headlessDir, 'chrome-headless-shell-linux-arm64/chrome-headless-shell'))
    );
  } catch {
    return false;
  }
})();
const skipBrowserTests =
  (process.env.FRONTGUARD_SKIP_BROWSER_TESTS === '1' || !hasBrowserBinary) && !isCI;

let browser: Browser;

/** Write a tiny static HTML page to disk and return a file:// URL for it. */
function writeHtml(file: string, boxColor: string): string {
  const html = `<!doctype html><html><head><style>
    body { margin: 0; }
    .box { width: 200px; height: 200px; background: ${boxColor}; }
  </style></head><body>
    <div class="box"></div>
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
      const first = await visualTest(page, 'integration-regression', { baselineDir, update: true });
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
      const first = await visualTest(page, 'integration-stable', { baselineDir, update: true });
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
      const result = await visualTest(page, 'integration-freeze', {
        baselineDir,
        freezeTime: fixed,
        update: true,
      });
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

  it('offsets component domBoxes by selector origin so component captures attribute accurately', async () => {
    const mkComponentHtml = (btnColor: string) => `<!doctype html><html><head><style>
      body { margin: 0; }
      .spacer { height: 180px; width: 100%; background: #eee; }
      .card { margin-left: 160px; width: 160px; height: 120px; position: relative; background: #fff; }
      .cta { position: absolute; left: 20px; top: 30px; width: 80px; height: 40px; background: ${btnColor}; }
    </style></head><body>
      <div class="spacer"></div>
      <div class="card" data-testid="pricing-card">
        <button class="cta" data-testid="inner-cta">Buy</button>
      </div>
    </body></html>`;

    const beforePath = join(workDir, 'comp-before.html');
    const afterPath = join(workDir, 'comp-after.html');
    fs.writeFileSync(beforePath, mkComponentHtml('#2563eb'), 'utf8');
    fs.writeFileSync(afterPath, mkComponentHtml('#dc2626'), 'utf8');

    const page = await browser.newPage({ viewport: { width: 500, height: 400 } });
    try {
      await page.goto(pathToFileURL(beforePath).href);
      await visualTest(page, 'component-attribution', {
        baselineDir,
        selector: '[data-testid="pricing-card"]',
        update: true,
      });

      await page.goto(pathToFileURL(afterPath).href);
      const res = await visualTest(page, 'component-attribution', {
        baselineDir,
        selector: '[data-testid="pricing-card"]',
        threshold: 0.001,
      });

      expect(res.passed).toBe(false);
      expect(res.clusters?.length).toBeGreaterThan(0);
      expect(res.clusters?.[0]?.targetSelector).toBe('[data-testid="inner-cta"]');
    } finally {
      await page.close();
    }
  }, 60_000);

  it('hardens redactSensitive: handles Shadow DOM, isolates invalid selectors, and scrubs text/ARIA snapshots', async () => {
    const secretHtml = `<!doctype html><html><body>
      <div id="app">
        <input name="cardNumber" value="4111-1111-1111-4242" />
        <input name="cvv" value="987" />
        <span data-frontguard-redact id="token-box">SUPER_SECRET_TOKEN_XYZ</span>
        <div id="shadow-host"></div>
      </div>
      <script>
        const host = document.getElementById('shadow-host');
        const sr = host.attachShadow({ mode: 'open' });
        sr.innerHTML = '<input type="password" value="SHADOW_SECRET_PASS" /><span data-sensitive>SHADOW_PII</span>';
      </script>
    </body></html>`;
    const file = join(workDir, 'redact.html');
    fs.writeFileSync(file, secretHtml, 'utf8');

    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    try {
      await page.goto(pathToFileURL(file).href);
      const res = await visualTest(page, 'redact-hardened', {
        baselineDir,
        update: true,
        // Include an intentionally malformed custom selector to prove default redaction still runs
        redactSensitive: ['input[broken-selector', '[data-custom-secret]'],
        captureAriaSnapshot: true,
        textSnapshot: { json: '#app' },
      });

      expect(res.passed).toBe(true);
      expect(res.ariaSnapshot).toBeDefined();
      expect(res.ariaSnapshot).not.toContain('SUPER_SECRET_TOKEN_XYZ');
      expect(res.ariaSnapshot).not.toContain('4111-1111-1111-4242');
      expect(res.ariaSnapshot).not.toContain('SHADOW_SECRET_PASS');
      expect(res.ariaSnapshot).not.toContain('SHADOW_PII');

      const jsonSnap = res.textSnapshots?.find((t) => t.kind === 'json');
      expect(jsonSnap).toBeDefined();
      const savedJson = fs.readFileSync(jsonSnap!.path, 'utf8');
      expect(savedJson).not.toContain('SUPER_SECRET_TOKEN_XYZ');
      expect(savedJson).toContain('[REDACTED]');

      // Verify DOM values and text were cleanly restored after capture
      const restored = await page.evaluate(() => {
        const card = (document.querySelector('input[name="cardNumber"]') as HTMLInputElement).value;
        const token = document.getElementById('token-box')?.textContent;
        const shadowHost = document.getElementById('shadow-host')!;
        const shadowPass = (shadowHost.shadowRoot!.querySelector('input[type="password"]') as HTMLInputElement).value;
        return { card, token, shadowPass };
      });
      expect(restored).toEqual({
        card: '4111-1111-1111-4242',
        token: 'SUPER_SECRET_TOKEN_XYZ',
        shadowPass: 'SHADOW_SECRET_PASS',
      });
    } finally {
      await page.close();
    }
  }, 60_000);
});
