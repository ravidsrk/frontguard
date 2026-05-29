import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { visualTest } from '../src/visual-test.js';

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
function createMockPage(screenshotBuffer: Buffer, viewport = { width: 1280, height: 720 }) {
  return {
    screenshot: vi.fn().mockResolvedValue(screenshotBuffer),
    viewportSize: vi.fn().mockReturnValue(viewport),
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

describe('visualTest', () => {
  beforeEach(() => {
    rmDir(TEST_BASELINE_DIR);
    // Clear env vars
    delete process.env.FRONTGUARD_UPDATE;
  });

  afterEach(() => {
    rmDir(TEST_BASELINE_DIR);
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

    // Baseline file should exist
    expect(fs.existsSync(result.baselinePath)).toBe(true);
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

  it('calls evaluate for mask selectors', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'mask-test', {
      baselineDir: TEST_BASELINE_DIR,
      mask: ['.ad-banner', '#timestamp'],
    });

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    const evalArgs = page.evaluate.mock.calls[0];
    expect(evalArgs[1]).toEqual(['.ad-banner', '#timestamp']);
  });

  it('calls evaluate for mask regions', async () => {
    const img = createPNG(50, 50, [128, 128, 128, 255]);
    const page = createMockPage(img);

    await visualTest(page, 'region-test', {
      baselineDir: TEST_BASELINE_DIR,
      maskRegions: [{ x: 10, y: 10, width: 50, height: 50 }],
    });

    expect(page.evaluate).toHaveBeenCalledTimes(1);
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
});
