import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test as playwrightTest, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import { visualTest, expectVisual } from '../src/index.js';

const TEST_BASELINE_DIR = '__test_visual_baselines__';

/** Create a solid-color PNG buffer */
function createPNG(
  width: number,
  height: number,
  color: [number, number, number, number] = [255, 0, 0, 255]
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
  return PNG.sync.write(png);
}

/** Create a mock Playwright Page object */
function createMockPage(
  screenshotBuffer: Buffer,
  viewport = { width: 1280, height: 720 },
  browserName = 'chromium'
) {
  return {
    screenshot: vi.fn().mockResolvedValue(screenshotBuffer),
    viewportSize: vi.fn().mockReturnValue(viewport),
    context: vi.fn().mockReturnValue({
      browser: vi.fn().mockReturnValue({
        browserType: vi.fn().mockReturnValue({ name: vi.fn().mockReturnValue(browserName) }),
      }),
    }),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    clock: { setFixedTime: vi.fn().mockResolvedValue(undefined) },
    evaluate: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/** Recursively remove directory */
function rmDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function createTestInfo(testId: string, projectName = 'desktop'): TestInfo {
  return {
    file: '/repo/tests/checkout.spec.ts',
    project: {
      name: projectName,
      testDir: '/repo/tests',
      use: { browserName: 'chromium' },
    },
    testId,
    title: 'renders checkout',
    titlePath: ['checkout.spec.ts', 'checkout', 'renders checkout'],
  } as TestInfo;
}

describe('visualTest', () => {
  beforeEach(() => {
    rmDir(TEST_BASELINE_DIR);
    // Clear env vars
    delete process.env.FRONTGUARD_UPDATE;
  });

  afterEach(() => {
    rmDir(TEST_BASELINE_DIR);
    vi.restoreAllMocks();
  });

  it('first run creates a new baseline', async () => {
    const img = createPNG(100, 100, [128, 128, 128, 255]);
    const page = createMockPage(img);

    const result = await visualTest(page, 'test-page', {
      baselineDir: TEST_BASELINE_DIR,
    });

    expect(result.passed).toBe(true);
    expect(result.isNewBaseline).toBe(true);
    expect(result.diffPercentage).toBe(0);

    // Baseline and current files should exist
    expect(fs.existsSync(result.baselinePath)).toBe(true);
    expect(fs.existsSync(result.currentPath)).toBe(true);
  });

  it('second run with same image passes', async () => {
    const img = createPNG(100, 100, [128, 128, 128, 255]);
    const page = createMockPage(img);

    // First run — creates baseline
    await visualTest(page, 'same-test', { baselineDir: TEST_BASELINE_DIR });

    // Second run — should pass
    const result = await visualTest(page, 'same-test', {
      baselineDir: TEST_BASELINE_DIR,
    });

    expect(result.passed).toBe(true);
    expect(result.isNewBaseline).toBe(false);
    expect(result.diffPercentage).toBe(0);
    expect(result.ssim).toBeCloseTo(1, 1);
  });

  it('second run with different image fails', async () => {
    const img1 = createPNG(100, 100, [255, 0, 0, 255]);
    const img2 = createPNG(100, 100, [0, 0, 255, 255]);

    const page1 = createMockPage(img1);
    const page2 = createMockPage(img2);

    // First run — creates baseline with red
    await visualTest(page1, 'diff-test', { baselineDir: TEST_BASELINE_DIR });

    // Second run — compare with blue
    const result = await visualTest(page2, 'diff-test', {
      baselineDir: TEST_BASELINE_DIR,
    });

    expect(result.passed).toBe(false);
    expect(result.isNewBaseline).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0.5);
    expect(result.diffPath).toBeDefined();
    expect(fs.existsSync(result.diffPath!)).toBe(true);
  });

  it('update mode overwrites baseline', async () => {
    const img1 = createPNG(100, 100, [255, 0, 0, 255]);
    const img2 = createPNG(100, 100, [0, 0, 255, 255]);

    const page1 = createMockPage(img1);
    const page2 = createMockPage(img2);

    // First run — creates red baseline
    await visualTest(page1, 'update-test', { baselineDir: TEST_BASELINE_DIR });

    // Second run with update=true — overwrites with blue
    const result = await visualTest(page2, 'update-test', {
      baselineDir: TEST_BASELINE_DIR,
      update: true,
    });

    expect(result.passed).toBe(true);
    expect(result.isNewBaseline).toBe(true);

    // Baseline should now be the blue image
    const baseline = fs.readFileSync(result.baselinePath);
    const png = PNG.sync.read(baseline);
    expect(png.data[0]).toBe(0); // R=0 (blue)
    expect(png.data[2]).toBe(255); // B=255
  });

  it('FRONTGUARD_UPDATE env var triggers update', async () => {
    const img1 = createPNG(100, 100, [255, 0, 0, 255]);
    const img2 = createPNG(100, 100, [0, 255, 0, 255]);

    const page1 = createMockPage(img1);
    const page2 = createMockPage(img2);

    // Create baseline
    await visualTest(page1, 'env-update', { baselineDir: TEST_BASELINE_DIR });

    // Set env var
    process.env.FRONTGUARD_UPDATE = '1';

    const result = await visualTest(page2, 'env-update', {
      baselineDir: TEST_BASELINE_DIR,
    });

    expect(result.passed).toBe(true);
    expect(result.isNewBaseline).toBe(true);
  });

  it.skipIf(process.platform === 'win32')(
    'does not overwrite or pass when an existing baseline cannot be read',
    async () => {
      const baselineImage = createPNG(100, 100, [255, 0, 0, 255]);
      const currentImage = createPNG(100, 100, [0, 0, 255, 255]);
      const first = await visualTest(createMockPage(baselineImage), 'read-error', {
        baselineDir: TEST_BASELINE_DIR,
      });
      fs.chmodSync(first.baselinePath, 0o200);

      let operationError: unknown;
      let result: Awaited<ReturnType<typeof visualTest>> | undefined;
      try {
        result = await visualTest(createMockPage(currentImage), 'read-error', {
          baselineDir: TEST_BASELINE_DIR,
        });
      } catch (error) {
        operationError = error;
      } finally {
        fs.chmodSync(first.baselinePath, 0o600);
      }

      expect(operationError).toMatchObject({ code: 'EACCES' });
      expect(result).toBeUndefined();
      expect(fs.readFileSync(first.baselinePath)).toEqual(baselineImage);
    }
  );

  it('uses page.clock.setFixedTime when freezeTime is set (works on loaded page)', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'freeze-test', {
      baselineDir: TEST_BASELINE_DIR,
      freezeTime: 1700000000000,
    });

    // Prefer the clock API which actually freezes time on an already-loaded
    // page; the old init-script approach was a no-op for the page under test.
    expect(page.clock.setFixedTime).toHaveBeenCalledTimes(1);
    expect(page.clock.setFixedTime).toHaveBeenCalledWith(1700000000000);
    expect(page.addInitScript).not.toHaveBeenCalled();
  });

  it('falls back to addInitScript + reload when page.clock is unavailable', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);
    // Simulate an older Playwright without the clock API.
    delete page.clock;

    await visualTest(page, 'freeze-fallback', {
      baselineDir: TEST_BASELINE_DIR,
      freezeTime: 1700000000000,
    });

    expect(page.addInitScript).toHaveBeenCalledTimes(1);
    const scriptArg = page.addInitScript.mock.calls[0][0];
    expect(scriptArg).toContain('1700000000000');
    // Reload makes the injected script take effect on the current page.
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('calls evaluate for mask selectors and cleans up in finally', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'mask-test', {
      baselineDir: TEST_BASELINE_DIR,
      mask: ['.ad-banner', '#timestamp'],
    });

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    const evalArgs = page.evaluate.mock.calls[0];
    expect(evalArgs[1]).toEqual(['.ad-banner', '#timestamp']);
  });

  it('calls evaluate for mask regions and cleans up in finally', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'region-test', {
      baselineDir: TEST_BASELINE_DIR,
      maskRegions: [{ x: 10, y: 10, width: 50, height: 50 }],
    });

    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });

  it('respects custom threshold', async () => {
    const img1 = createPNG(10, 10, [128, 128, 128, 255]);
    // Create image with ~10% diff
    const png2 = new PNG({ width: 10, height: 10 });
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const idx = (y * 10 + x) * 4;
        // First row is different
        const c = y === 0 ? [255, 0, 0, 255] : [128, 128, 128, 255];
        png2.data[idx] = c[0];
        png2.data[idx + 1] = c[1];
        png2.data[idx + 2] = c[2];
        png2.data[idx + 3] = c[3];
      }
    }
    const img2 = PNG.sync.write(png2);

    const page1 = createMockPage(img1);
    const page2 = createMockPage(img2);

    // Create baseline
    await visualTest(page1, 'threshold-test', { baselineDir: TEST_BASELINE_DIR });

    // With default threshold (1%) should fail
    const result1 = await visualTest(page2, 'threshold-test', {
      baselineDir: TEST_BASELINE_DIR,
      threshold: 0.01,
    });
    expect(result1.passed).toBe(false);

    // With high threshold (50%) should pass
    const result2 = await visualTest(page2, 'threshold-test', {
      baselineDir: TEST_BASELINE_DIR,
      threshold: 0.5,
    });
    expect(result2.passed).toBe(true);
  });

  it('includes viewport in baseline key', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img, { width: 1920, height: 1080 });

    const result = await visualTest(page, 'viewport-test', {
      baselineDir: TEST_BASELINE_DIR,
    });

    expect(result.baselinePath).toContain('1920x1080');
  });

  it('scopes readable baseline paths by every available Playwright identity', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const testInfo = vi.spyOn(playwrightTest, 'info');

    testInfo.mockReturnValue(createTestInfo('test-a'));
    const base = await visualTest(createMockPage(img), 'checkout', {
      baselineDir: TEST_BASELINE_DIR,
    });

    testInfo.mockReturnValue(createTestInfo('test-b'));
    const otherTest = await visualTest(createMockPage(img), 'checkout', {
      baselineDir: TEST_BASELINE_DIR,
    });

    testInfo.mockReturnValue(createTestInfo('test-a', 'mobile'));
    const otherProject = await visualTest(createMockPage(img), 'checkout', {
      baselineDir: TEST_BASELINE_DIR,
    });

    testInfo.mockReturnValue(createTestInfo('test-a'));
    const otherBrowser = await visualTest(
      createMockPage(img, { width: 1280, height: 720 }, 'firefox'),
      'checkout',
      { baselineDir: TEST_BASELINE_DIR }
    );

    const otherCaller = await visualTest(createMockPage(img), 'checkout/summary', {
      baselineDir: TEST_BASELINE_DIR,
    });
    const otherViewport = await visualTest(createMockPage(img, { width: 390, height: 844 }), 'checkout', {
      baselineDir: TEST_BASELINE_DIR,
    });

    const paths = [
      base.baselinePath,
      otherTest.baselinePath,
      otherProject.baselinePath,
      otherBrowser.baselinePath,
      otherCaller.baselinePath,
      otherViewport.baselinePath,
    ];
    expect(new Set(paths).size).toBe(paths.length);

    const readablePath = path.basename(base.baselinePath);
    expect(readablePath).toContain('renders-checkout');
    expect(readablePath).toContain('desktop');
    expect(readablePath).toContain('chromium');
    expect(readablePath).toContain(process.platform);
    expect(readablePath).toContain('checkout');
    expect(readablePath).toContain('1280x720');
  });

  it('expectVisual resolves when visualTest passes and throws on regression', async () => {
    const img1 = createPNG(20, 20, [128, 128, 128, 255]);
    const img2 = createPNG(20, 20, [255, 0, 0, 255]);

    const res = await expectVisual(createMockPage(img1), 'expect-visual', {
      baselineDir: TEST_BASELINE_DIR,
    });
    expect(res.passed).toBe(true);

    await expect(
      expectVisual(createMockPage(img2), 'expect-visual', {
        baselineDir: TEST_BASELINE_DIR,
      })
    ).rejects.toThrow(/Visual regression detected for "expect-visual": .+% diff, 16×16 window \d+ > 64/);
  });

  it('captures component-scoped screenshot when selector option is provided', async () => {
    const pageImg = createPNG(100, 100, [255, 0, 0, 255]);
    const componentImg = createPNG(40, 20, [0, 255, 0, 255]);
    const page = createMockPage(pageImg);
    const locatorScreenshot = vi.fn().mockResolvedValue(componentImg);
    page.locator = vi.fn().mockReturnValue({
      first: () => ({ screenshot: locatorScreenshot }),
    });

    const result = await visualTest(page, 'component-card', {
      baselineDir: TEST_BASELINE_DIR,
      selector: '[data-testid="pricing-card"]',
    });

    expect(result.passed).toBe(true);
    expect(page.locator).toHaveBeenCalledWith('[data-testid="pricing-card"]');
    expect(locatorScreenshot).toHaveBeenCalledWith({ type: 'png' });
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it('applies and cleans up sensitive-DOM redaction when redactSensitive is enabled', async () => {
    const img = createPNG(30, 30, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'redact-test', {
      baselineDir: TEST_BASELINE_DIR,
      redactSensitive: ['[data-secret-token]'],
    });

    // 1 evaluate call to apply redaction + 1 evaluate call in finally to restore
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    const selectorsArg = page.evaluate.mock.calls[0][1] as string[];
    expect(selectorsArg).toContain('input[type="password"]');
    expect(selectorsArg).toContain('[data-secret-token]');
  });

  it('polls consecutive frames until settled when waitForStable is enabled', async () => {
    const frame1 = createPNG(24, 24, [255, 0, 0, 255]);
    const frame2 = createPNG(24, 24, [0, 128, 255, 255]);
    const frame3 = createPNG(24, 24, [0, 128, 255, 255]); // matches frame2 -> settled!
    const page = createMockPage(frame3);
    page.screenshot = vi
      .fn()
      .mockResolvedValueOnce(frame1)
      .mockResolvedValueOnce(frame2)
      .mockResolvedValueOnce(frame3);

    const result = await visualTest(page, 'stable-test', {
      baselineDir: TEST_BASELINE_DIR,
      waitForStable: { maxAttempts: 3, intervalMs: 10 },
    });

    expect(result.passed).toBe(true);
    expect(result.settled).toBe(true);
    expect(page.screenshot).toHaveBeenCalledTimes(3);
  });

  it('supports ISO date string in freezeTime', async () => {
    const img = createPNG(30, 30, [128, 128, 128, 255]);
    const page = createMockPage(img);
    const iso = '2026-06-15T12:30:00.000Z';
    const expectedTs = Date.parse(iso);

    await visualTest(page, 'freeze-iso', {
      baselineDir: TEST_BASELINE_DIR,
      freezeTime: iso,
    });

    expect(page.clock.setFixedTime).toHaveBeenCalledWith(expectedTs);
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), expectedTs);
  });

  it('injects deterministic Mulberry32 PRNG when seedRandom is set', async () => {
    const img = createPNG(30, 30, [128, 128, 128, 255]);
    const page1 = createMockPage(img);
    await visualTest(page1, 'seed-default', {
      baselineDir: TEST_BASELINE_DIR,
      seedRandom: true,
    });
    expect(page1.evaluate).toHaveBeenCalledWith(expect.any(Function), 42);

    const page2 = createMockPage(img);
    await visualTest(page2, 'seed-custom', {
      baselineDir: TEST_BASELINE_DIR,
      seedRandom: 1337,
    });
    expect(page2.evaluate).toHaveBeenCalledWith(expect.any(Function), 1337);
  });

  it('intercepts and aborts matched URLs when blockUrls is provided and cleans up in finally', async () => {
    const img = createPNG(30, 30, [128, 128, 128, 255]);
    const page = createMockPage(img);
    const abortSpy = vi.fn().mockResolvedValue(undefined);
    const continueSpy = vi.fn().mockResolvedValue(undefined);

    page.route = vi.fn(async (_pattern: string, handler: (route: any) => Promise<void>) => {
      await handler({
        request: () => ({ url: () => 'https://www.google-analytics.com/collect' }),
        abort: abortSpy,
        continue: continueSpy,
      });
      await handler({
        request: () => ({ url: () => 'https://ads.example.com/banner.js' }),
        abort: abortSpy,
        continue: continueSpy,
      });
      await handler({
        request: () => ({ url: () => 'https://app.example.com/main.css' }),
        abort: abortSpy,
        continue: continueSpy,
      });
    });
    page.unroute = vi.fn().mockResolvedValue(undefined);

    const result = await visualTest(page, 'block-urls-test', {
      baselineDir: TEST_BASELINE_DIR,
      blockUrls: ['*google-analytics.com*', 'https://ads.example.com/*'],
    });

    expect(result.blockedRequestsCount).toBe(2);
    expect(abortSpy).toHaveBeenCalledTimes(2);
    expect(continueSpy).toHaveBeenCalledTimes(1);
    expect(page.unroute).toHaveBeenCalledTimes(1);
  });

  it('captures ariaSnapshot when captureAriaSnapshot is true', async () => {
    const img = createPNG(30, 30, [128, 128, 128, 255]);
    const page = createMockPage(img);
    page.locator = vi.fn().mockReturnValue({
      ariaSnapshot: vi.fn().mockResolvedValue('- main:\n  - button "Checkout"'),
    });

    const result = await visualTest(page, 'aria-snapshot-test', {
      baselineDir: TEST_BASELINE_DIR,
      captureAriaSnapshot: true,
    });

    expect(page.locator).toHaveBeenCalledWith('body');
    expect(result.ariaSnapshot).toBe('- main:\n  - button "Checkout"');
  });

  it('attributes spatial diff clusters to the highest-overlap specific DOM selector', async () => {
    const baseImg = createPNG(100, 100, [128, 128, 128, 255]);
    const modPng = PNG.sync.read(baseImg);
    // Mutate a 10x10 region at (20, 30)
    for (let y = 30; y < 40; y++) {
      for (let x = 20; x < 30; x++) {
        const idx = (y * 100 + x) * 4;
        modPng.data[idx] = 255;
        modPng.data[idx + 1] = 0;
        modPng.data[idx + 2] = 0;
      }
    }
    const currentImg = PNG.sync.write(modPng);

    // First run saves baseline
    await visualTest(createMockPage(baseImg), 'cluster-dom-test', {
      baselineDir: TEST_BASELINE_DIR,
    });

    // Second run detects diff cluster and attributes it via page.evaluate
    const page2 = createMockPage(currentImg);
    page2.evaluate = vi.fn().mockResolvedValue([
      { selector: 'main.page', x: 0, y: 0, width: 100, height: 100 },
      { selector: 'section.pricing', x: 10, y: 10, width: 80, height: 80 },
      { selector: '[data-testid="buy-button"]', x: 18, y: 28, width: 14, height: 14 },
      { selector: 'footer.site-footer', x: 0, y: 85, width: 100, height: 15 },
    ]);

    const result = await visualTest(page2, 'cluster-dom-test', {
      baselineDir: TEST_BASELINE_DIR,
      threshold: 0.001,
    });

    expect(result.passed).toBe(false);
    expect(result.clusters).toBeDefined();
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters![0]).toEqual({
      id: 1,
      bbox: { x: 20, y: 30, width: 10, height: 10 },
      rawDiffPixels: 100,
      targetSelector: '[data-testid="buy-button"]',
    });
  });
});
