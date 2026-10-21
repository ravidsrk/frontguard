import { createRequire } from 'node:module';
import { describe, it, expect, afterEach } from 'vitest';
import { PNG } from 'pngjs';
import { PIXELMATCH_OPTIONS } from '../../src/core/fingerprint.js';
import { compareScreenshot, createNewPageResult } from '../../src/diff/pixel.js';
import { createTestPng } from '../fixtures/helpers.js';
import type { ScreenshotResult } from '../../src/core/types.js';

/** Helper to build a minimal ScreenshotResult */
function makeScreenshot(buffer: Buffer, overrides?: Partial<ScreenshotResult>): ScreenshotResult {
  return {
    route: { path: '/test', label: 'Test' },
    viewport: 1440,
    browser: 'chromium',
    buffer,
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 100,
    ...overrides,
  };
}

describe('compareScreenshot', () => {
  it('returns pass with 0% diff for identical images', () => {
    const png = createTestPng(100, 100, 255, 0, 0);
    const current = makeScreenshot(png);
    const result = compareScreenshot(current, Buffer.from(png), 0.1);

    expect(result.status).toBe('pass');
    expect(result.diffPercentage).toBe(0);
    expect(result.route.path).toBe('/test');
    expect(result.viewport).toBe(1440);
    expect(result.browser).toBe('chromium');
  });

  it('detects changes between red and blue images', () => {
    const red = createTestPng(50, 50, 255, 0, 0);
    const blue = createTestPng(50, 50, 0, 0, 255);
    const current = makeScreenshot(red);
    const result = compareScreenshot(current, blue, 0.1);

    expect(result.status).not.toBe('pass');
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffImage).toBeDefined();
    expect(result.diffImage).toBeInstanceOf(Buffer);
  });

  it('handles dimension mismatches without throwing', () => {
    const small = createTestPng(50, 50, 255, 0, 0);
    const large = createTestPng(100, 100, 255, 0, 0);
    const current = makeScreenshot(small);
    const result = compareScreenshot(current, large, 0.1);

    // 50×50 inside 100×100 leaves most of the canvas as padding, over the 10% budget.
    expect(result.status).toBe('regression');
    expect(result.error).toContain('Dimension mismatch');
    expect(result.diffPercentage).toBeGreaterThan(10);
  });

  it('returns error status for zero-byte current buffer', () => {
    const baseline = createTestPng(10, 10);
    const current = makeScreenshot(Buffer.alloc(0));
    const result = compareScreenshot(current, baseline, 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('empty');
  });

  it('returns error status for zero-byte baseline buffer', () => {
    const png = createTestPng(10, 10);
    const current = makeScreenshot(png);
    const result = compareScreenshot(current, Buffer.alloc(0), 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toContain('empty');
  });

  it('returns error for corrupt PNG data', () => {
    const goodPng = createTestPng(10, 10);
    const corruptBuffer = Buffer.from('not a png at all');
    const current = makeScreenshot(corruptBuffer);
    const result = compareScreenshot(current, goodPng, 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toContain('Failed to decode');
  });

  it('returns regression status when diff exceeds threshold', () => {
    const red = createTestPng(50, 50, 255, 0, 0);
    const blue = createTestPng(50, 50, 0, 0, 255);
    const current = makeScreenshot(red);

    // Very low threshold — any difference is a regression
    const result = compareScreenshot(current, blue, 0.001);

    expect(result.status).toBe('regression');
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('preserves route and viewport metadata in result', () => {
    const png = createTestPng(20, 20, 128, 128, 128);
    const current = makeScreenshot(png, {
      route: { path: '/checkout', label: 'Checkout' },
      viewport: 375,
      browser: 'firefox',
    });
    const result = compareScreenshot(current, Buffer.from(png), 0.1);

    expect(result.route.path).toBe('/checkout');
    expect(result.viewport).toBe(375);
    expect(result.browser).toBe('firefox');
  });
});

describe('FRONTGUARD_DISABLE_BYTE_COMPARE escape hatch (val-5)', () => {
  const ORIG = process.env.FRONTGUARD_DISABLE_BYTE_COMPARE;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.FRONTGUARD_DISABLE_BYTE_COMPARE;
    else process.env.FRONTGUARD_DISABLE_BYTE_COMPARE = ORIG;
  });

  it('default: byte-identical PNGs short-circuit to pass with 0% diff', () => {
    delete process.env.FRONTGUARD_DISABLE_BYTE_COMPARE;
    const png = createTestPng(20, 20, 255, 255, 255);
    const result = compareScreenshot(makeScreenshot(png), Buffer.from(png), 0.1);

    expect(result.status).toBe('pass');
    expect(result.diffPercentage).toBe(0);
    // Fast-path signature: the diff overlay is never materialized.
    expect(result.diffImage).toBeUndefined();
    expect(result.comparisonMethod).toBe('byte-identical');
    expect(result.comparedAgainstBaseline).toBe(true);
  });

  it('FRONTGUARD_DISABLE_BYTE_COMPARE=1: byte-identical PNGs go through pixelmatch', () => {
    process.env.FRONTGUARD_DISABLE_BYTE_COMPARE = '1';
    const png = createTestPng(20, 20, 255, 255, 255);
    const result = compareScreenshot(makeScreenshot(png), Buffer.from(png), 0.1);

    // pixelmatch on identical decoded PNGs still computes a 0% diff, but the
    // slow path is taken — assert via the side-channel that the diffImage buffer
    // is materialized (the fast path leaves it undefined).
    expect(result.status).toBe('pass');
    expect(result.diffPercentage).toBe(0);
    expect(result.diffImage).toBeDefined();
    expect(result.diffImage).toBeInstanceOf(Buffer);
    expect(result.comparisonMethod).toBe('pixelmatch');
    expect(result.comparedAgainstBaseline).toBe(true);
  });
});

describe('createNewPageResult', () => {
  it('returns status new with 0% diff', () => {
    const png = createTestPng(100, 100);
    const current = makeScreenshot(png);
    const result = createNewPageResult(current);

    expect(result.status).toBe('new');
    expect(result.diffPercentage).toBe(0);
    expect(result.diffImage).toBeUndefined();
    expect(result.baselineImage).toBeUndefined();
    expect(result.currentImage).toBe(png);
    expect(result.route.path).toBe('/test');
  });
});

describe('Perceptual Diffing v2: cluster extraction and anti-dilution SSIM guard', () => {
  it('prevents global whitespace SSIM dilution from overriding a dense localized UI change to pass', () => {
    const width = 200;
    const height = 200;

    // 200x200 white canvas with a 16x16 blue button at (80, 80) -> 256 px = 0.64% of canvas
    const baselinePng = new PNG({ width, height });
    const currentPng = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) << 2;
        const inButton = x >= 80 && x < 96 && y >= 80 && y < 96;
        baselinePng.data[idx] = inButton ? 0 : 255;
        baselinePng.data[idx + 1] = inButton ? 100 : 255;
        baselinePng.data[idx + 2] = 255;
        baselinePng.data[idx + 3] = 255;

        currentPng.data[idx] = 255;
        currentPng.data[idx + 1] = inButton ? 30 : 255;
        currentPng.data[idx + 2] = inButton ? 0 : 255;
        currentPng.data[idx + 3] = 255;
      }
    }

    const baselineBuf = PNG.sync.write(baselinePng);
    const currentBuf = PNG.sync.write(currentPng);

    // Threshold 0.005 (0.5%) -> 0.64% diff is in borderline zone (< 1.0%)
    // Global SSIM is > 0.98 because 99.36% of the canvas is identical white,
    // but the localized cluster guard detects chromaSSIM < 0.70 inside the 16x16 button!
    const result = compareScreenshot(makeScreenshot(currentBuf), baselineBuf, 0.005, {
      enabled: true,
      ssimThreshold: 0.98,
    });

    expect(result.status).toBe('regression');
    expect(result.ssim).toBeGreaterThan(0.98);
    expect(result.ssimOverride).toBeUndefined();
    expect(result.clusters).toBeDefined();
    expect(result.clusters!.length).toBe(1);
    expect(result.clusters![0].rawDiffPixels).toBe(256);
    expect(result.clusters![0].chromaSSIM).toBeLessThan(0.70);
  });

  it('populates cluster chromaSSIM/cwSSIM and propagates stability and redactedCount even when diff exceeds 2x threshold', () => {
    const red = createTestPng(32, 32, 255, 0, 0);
    const blue = createTestPng(32, 32, 0, 0, 255);
    const current = makeScreenshot(red, {
      redactedCount: 3,
      stability: {
        settled: true,
        attempts: 2,
        unstableRatio: 0,
      },
    });

    const result = compareScreenshot(current, blue, 0.01);

    expect(result.status).toBe('regression');
    expect(result.redactedCount).toBe(3);
    expect(result.stability).toEqual({
      settled: true,
      attempts: 2,
      unstableRatio: 0,
    });
    expect(result.clusters).toBeDefined();
    expect(result.clusters!.length).toBe(1);
    expect(result.clusters![0].chromaSSIM).toBeDefined();
    expect(result.clusters![0].cwSSIM).toBeDefined();
  });
});

function fillPng(width: number, height: number, r: number, g: number, b: number): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  }
  return png;
}

function putPx(png: PNG, x: number, y: number, r: number, g: number, b: number): void {
  const idx = (y * png.width + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = 255;
}

/**
 * Six 3×14 black strokes on white. Shifting them is about 1.2% of a 200×150
 * canvas and a window max of 120, above the localized fail line of 64.
 */
function strokePair(): { baseline: PNG; current: PNG } {
  const baseline = fillPng(200, 150, 255, 255, 255);
  const current = fillPng(200, 150, 255, 255, 255);
  for (let stroke = 0; stroke < 6; stroke++) {
    const x0 = 20 + stroke * 8;
    for (let y = 30; y < 44; y++) {
      for (let x = x0; x < x0 + 3; x++) putPx(baseline, x, y, 0, 0, 0);
    }
    for (let y = 32; y < 46; y++) {
      for (let x = x0 + 2; x < x0 + 5; x++) putPx(current, x, y, 0, 0, 0);
    }
  }
  return { baseline, current };
}

describe('pixelmatch 8 color metric and window gate', () => {
  const require = createRequire(import.meta.url);

  it('records the installed pixelmatch 8 version and the window fail line', () => {
    const version = (require('pixelmatch/package.json') as { version: string }).version;
    expect(version).toMatch(/^8\./);
    expect(PIXELMATCH_OPTIONS).toEqual({ threshold: 0.1, includeAA: false });
  });

  it('treats a small OKLab shift as equal and a larger shift as different', () => {
    // No published study evaluates HyAB on UI screenshots. These patches are
    // this repo's check of the v8 color metric. White versus 230 is under the
    // hardcoded color distance of 0.1. White versus 220 is over it.
    const white = fillPng(32, 32, 255, 255, 255);
    const under = compareScreenshot(makeScreenshot(PNG.sync.write(fillPng(32, 32, 230, 230, 230))), PNG.sync.write(white), 0.1);
    const over = compareScreenshot(makeScreenshot(PNG.sync.write(fillPng(32, 32, 220, 220, 220))), PNG.sync.write(white), 0.1);

    expect(under.diffPercentage).toBe(0);
    expect(under.status).toBe('pass');
    expect(over.diffPercentage).toBeGreaterThan(90);
    expect(over.status).toBe('regression');
  });

  it('fails a compact text or icon edit of a few percent and keeps scattered speckle', () => {
    const strokes = strokePair();
    const text = compareScreenshot(
      makeScreenshot(PNG.sync.write(strokes.current)),
      PNG.sync.write(strokes.baseline),
      0.1,
    );
    expect(text.diffPercentage).toBeGreaterThan(0);
    expect(text.diffPercentage).toBeLessThan(10);
    expect(text.windowMax).toBeGreaterThan(64);
    expect(text.status).toBe('regression');
    expect(text.ssimOverride).toBeUndefined();

    const iconBase = fillPng(200, 150, 255, 255, 255);
    const iconCurrent = fillPng(200, 150, 255, 255, 255);
    for (let y = 40; y < 52; y++) {
      for (let x = 30; x < 42; x++) putPx(iconCurrent, x, y, 20, 20, 20);
    }
    const icon = compareScreenshot(
      makeScreenshot(PNG.sync.write(iconCurrent)),
      PNG.sync.write(iconBase),
      0.1,
    );
    expect(icon.diffPercentage).toBeLessThan(10);
    expect(icon.status).toBe('regression');

    const speckleBase = fillPng(200, 150, 255, 255, 255);
    const speckle = fillPng(200, 150, 255, 255, 255);
    for (let y = 0; y < 150; y += 8) {
      for (let x = 0; x < 200; x += 8) putPx(speckle, x, y, 0, 0, 0);
    }
    const diffuse = compareScreenshot(
      makeScreenshot(PNG.sync.write(speckle)),
      PNG.sync.write(speckleBase),
      0.1,
    );
    expect(diffuse.diffPercentage).toBeGreaterThan(0);
    expect(diffuse.diffPercentage).toBeLessThan(10);
    expect(diffuse.status).not.toBe('regression');

    const underBase = fillPng(200, 150, 255, 255, 255);
    const under = fillPng(200, 150, 255, 255, 255);
    for (let y = 0; y < 150; y += 8) {
      for (let x = 0; x < 200; x += 8) putPx(under, x, y, 247, 247, 247);
    }
    const subThreshold = compareScreenshot(
      makeScreenshot(PNG.sync.write(under)),
      PNG.sync.write(underBase),
      0.1,
    );
    expect(subThreshold.diffPercentage).toBe(0);
    expect(subThreshold.status).toBe('pass');

    const aaBase = fillPng(80, 80, 255, 255, 255);
    const aaCurrent = fillPng(80, 80, 255, 255, 255);
    for (let y = 20; y < 50; y++) {
      for (let x = 20; x < 50; x++) {
        putPx(aaBase, x, y, 0, 0, 0);
        putPx(aaCurrent, x, y, 0, 0, 0);
      }
    }
    for (let x = 19; x <= 50; x++) {
      putPx(aaCurrent, x, 19, 128, 128, 128);
      putPx(aaCurrent, x, 50, 128, 128, 128);
    }
    for (let y = 20; y <= 49; y++) {
      putPx(aaCurrent, 19, y, 128, 128, 128);
      putPx(aaCurrent, 50, y, 128, 128, 128);
    }
    const aa = compareScreenshot(
      makeScreenshot(PNG.sync.write(aaCurrent)),
      PNG.sync.write(aaBase),
      0.1,
    );
    expect(aa.diffPercentage).toBeLessThan(1);
    expect(aa.status).not.toBe('regression');
  });

  it('keeps a one-pixel height change under both budgets', () => {
    const baseline = fillPng(100, 100, 255, 0, 0);
    const current = fillPng(100, 101, 255, 0, 0);
    const result = compareScreenshot(makeScreenshot(PNG.sync.write(current)), PNG.sync.write(baseline), 0.1);

    expect(result.error).toContain('Dimension mismatch');
    expect(result.diffPercentage).toBeLessThan(10);
    expect(result.status).not.toBe('regression');
  });

  it('reports how often ssimOverride flips a non-zero pixel diff to pass', () => {
    const fullBase = fillPng(50, 50, 255, 0, 0);
    const fullCurrent = fillPng(50, 50, 0, 0, 255);

    const mildBase = fillPng(100, 100, 255, 0, 0);
    const mild = fillPng(100, 100, 255, 0, 0);
    for (let i = 0; i < 32; i++) {
      const p = (i * 17) % (100 * 100);
      putPx(mild, p % 100, (p / 100) | 0, 200, 0, 0);
    }

    const speckleBase = fillPng(200, 150, 255, 255, 255);
    const speckle = fillPng(200, 150, 255, 255, 255);
    for (let y = 0; y < 150; y += 8) {
      for (let x = 0; x < 200; x += 8) putPx(speckle, x, y, 0, 0, 0);
    }

    const strokes = strokePair();
    const rows = [
      compareScreenshot(makeScreenshot(PNG.sync.write(mild)), PNG.sync.write(mildBase), 0.1),
      compareScreenshot(makeScreenshot(PNG.sync.write(speckle)), PNG.sync.write(speckleBase), 0.1),
      compareScreenshot(makeScreenshot(PNG.sync.write(strokes.current)), PNG.sync.write(strokes.baseline), 0.1),
      compareScreenshot(makeScreenshot(PNG.sync.write(fullCurrent)), PNG.sync.write(fullBase), 0.1),
    ];
    const nonzero = rows.filter((row) => row.diffPercentage > 0);
    const flips = nonzero.filter((row) => row.ssimOverride === true);

    // 1 of 4 non-zero diffs on this corpus. The flip is the existing SSIM rule
    // (score above 0.98, under twice the config threshold, no severe cluster).
    expect(nonzero).toHaveLength(4);
    expect(flips, `ssimOverride flipped ${flips.length} of ${nonzero.length}`).toHaveLength(1);
    expect(rows[0].status).toBe('pass');
    expect(rows[0].ssimOverride).toBe(true);
    expect(rows[1].status).toBe('changed');
    expect(rows[1].ssimOverride).toBeUndefined();
    expect(rows[2].status).toBe('regression');
    expect(rows[2].ssimOverride).toBeUndefined();
    expect(rows[3].status).toBe('regression');
    expect(rows[3].ssimOverride).toBeUndefined();
  });
});
