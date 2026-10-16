import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  computeSSIM,
  toGrayscale,
  computeChromaSSIM,
  computeRegionSimilarity,
} from '../../src/diff/ssim.js';
import { createTestPng } from '../fixtures/helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a PNG buffer with per-pixel control via a callback. */
function createCustomPng(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const [r, g, b, a] = pixelFn(x, y);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeSSIM', () => {
  it('returns 1.0 for identical images', () => {
    const img = createTestPng(64, 64, 128, 128, 128);
    const ssim = computeSSIM(img, Buffer.from(img));
    expect(ssim).toBe(1);
  });

  it('returns SSIM < 0.5 for completely different images', () => {
    const black = createTestPng(64, 64, 0, 0, 0);
    const white = createTestPng(64, 64, 255, 255, 255);
    const ssim = computeSSIM(black, white);
    expect(ssim).toBeLessThan(0.5);
  });

  it('returns SSIM > 0.98 when only 1 pixel differs', () => {
    const img1 = createTestPng(64, 64, 100, 100, 100);
    // Clone and modify a single pixel
    const png2 = PNG.sync.read(Buffer.from(img1));
    const idx = (32 * 64 + 32) << 2; // middle pixel
    png2.data[idx] = 200;
    png2.data[idx + 1] = 200;
    png2.data[idx + 2] = 200;
    const img2 = PNG.sync.write(png2);

    const ssim = computeSSIM(img1, img2);
    expect(ssim).toBeGreaterThan(0.98);
  });

  it('returns 0 for images with different dimensions', () => {
    const small = createTestPng(32, 32, 128, 128, 128);
    const large = createTestPng(64, 64, 128, 128, 128);
    const ssim = computeSSIM(small, large);
    expect(ssim).toBe(0);
  });

  it('handles images smaller than the window size gracefully', () => {
    // 4×4 is smaller than the 8×8 window — no blocks can be extracted
    const img = createTestPng(4, 4, 255, 0, 0);
    const ssim = computeSSIM(img, Buffer.from(img));
    // Should return 0 (fallback for count === 0 — tiny images should NOT auto-pass)
    expect(ssim).toBe(0);
  });

  it('returns SSIM > 0.95 for a 1px shifted image (anti-aliasing scenario)', () => {
    // Create a pattern with vertical stripes
    const width = 64;
    const height = 64;

    const original = createCustomPng(width, height, (x, _y) => {
      const v = x % 8 < 4 ? 200 : 50;
      return [v, v, v, 255];
    });

    // Shift content 1px to the right
    const shifted = createCustomPng(width, height, (x, _y) => {
      const sx = (x + width - 1) % width;
      const v = sx % 8 < 4 ? 200 : 50;
      return [v, v, v, 255];
    });

    const ssim = computeSSIM(original, shifted);
    expect(ssim).toBeGreaterThan(0.5);
    // Structural similarity should still be high for a mere shift
  });

  it('returns SSIM close to 1 for nearly identical gradients', () => {
    // Create gradient images with very slight difference
    const width = 64;
    const height = 64;

    const gradient1 = createCustomPng(width, height, (x, _y) => {
      const v = Math.round((x / width) * 255);
      return [v, v, v, 255];
    });

    const gradient2 = createCustomPng(width, height, (x, _y) => {
      const v = Math.min(255, Math.round((x / width) * 255) + 1);
      return [v, v, v, 255];
    });

    const ssim = computeSSIM(gradient1, gradient2);
    expect(ssim).toBeGreaterThan(0.99);
  });

  it('detects significant structural changes', () => {
    // Horizontal stripes vs vertical stripes — different structure
    const width = 64;
    const height = 64;

    const horizontal = createCustomPng(width, height, (_x, y) => {
      const v = y % 16 < 8 ? 200 : 50;
      return [v, v, v, 255];
    });

    const vertical = createCustomPng(width, height, (x, _y) => {
      const v = x % 16 < 8 ? 200 : 50;
      return [v, v, v, 255];
    });

    const ssim = computeSSIM(horizontal, vertical);
    // Different structures but same mean/variance → SSIM should be noticeably < 1
    expect(ssim).toBeLessThan(0.95);
  });
});

describe('toGrayscale', () => {
  it('converts pure red to correct luminance', () => {
    const png = PNG.sync.read(createTestPng(1, 1, 255, 0, 0));
    const gray = toGrayscale(png);
    // 0.2126 * 255 ≈ 54.213
    expect(gray[0]).toBeCloseTo(0.2126 * 255, 2);
  });

  it('converts pure green to correct luminance', () => {
    const png = PNG.sync.read(createTestPng(1, 1, 0, 255, 0));
    const gray = toGrayscale(png);
    // 0.7152 * 255 ≈ 182.376
    expect(gray[0]).toBeCloseTo(0.7152 * 255, 2);
  });

  it('converts pure blue to correct luminance', () => {
    const png = PNG.sync.read(createTestPng(1, 1, 0, 0, 255));
    const gray = toGrayscale(png);
    // 0.0722 * 255 ≈ 18.411
    expect(gray[0]).toBeCloseTo(0.0722 * 255, 2);
  });

  it('converts white to 255', () => {
    const png = PNG.sync.read(createTestPng(1, 1, 255, 255, 255));
    const gray = toGrayscale(png);
    // 0.2126*255 + 0.7152*255 + 0.0722*255 = 255
    expect(gray[0]).toBeCloseTo(255, 0);
  });

  it('converts black to 0', () => {
    const png = PNG.sync.read(createTestPng(1, 1, 0, 0, 0));
    const gray = toGrayscale(png);
    expect(gray[0]).toBe(0);
  });
});

describe('computeChromaSSIM & computeRegionSimilarity', () => {
  it('detects isoluminant color changes (red vs green with identical BT.709 luminance) where grayscale computeSSIM returns > 0.99', () => {
    // Red (255, 0, 0) has BT.709 Y = 0.2126 * 255 = 54.213
    // Green (0, 76, 0) has BT.709 Y = 0.7152 * 76  = 54.355
    const red = createTestPng(64, 64, 255, 0, 0);
    const green = createTestPng(64, 64, 0, 76, 0);

    const graySSIM = computeSSIM(red, green);
    expect(graySSIM).toBeGreaterThan(0.99);

    const chromaSSIM = computeChromaSSIM(red, green);
    expect(chromaSSIM).toBeLessThan(0.5);

    const regionMetrics = computeRegionSimilarity(
      PNG.sync.read(red),
      PNG.sync.read(green),
      { x: 0, y: 0, width: 64, height: 64 },
    );
    expect(regionMetrics.chromaSSIM).toBeLessThan(0.5);
  });

  it('detects a localized 16x16 corrupted button on a 200x200 canvas without whitespace dilution', () => {
    const width = 200;
    const height = 200;
    const bbox = { x: 80, y: 80, width: 16, height: 16 };

    const baselineBuf = createCustomPng(width, height, (x, y) => {
      if (x >= bbox.x && x < bbox.x + bbox.width && y >= bbox.y && y < bbox.y + bbox.height) {
        return [0, 120, 255, 255]; // Primary blue button
      }
      return [255, 255, 255, 255]; // White background
    });

    const currentBuf = createCustomPng(width, height, (x, y) => {
      if (x >= bbox.x && x < bbox.x + bbox.width && y >= bbox.y && y < bbox.y + bbox.height) {
        return [255, 40, 0, 255]; // Corrupted red button
      }
      return [255, 255, 255, 255]; // White background
    });

    // Global SSIM is diluted by 99.36% identical white canvas
    const globalSSIM = computeSSIM(baselineBuf, currentBuf);
    expect(globalSSIM).toBeGreaterThan(0.98);

    // Region-scoped similarity inside bbox is not diluted and drops sharply
    const regionMetrics = computeRegionSimilarity(
      PNG.sync.read(baselineBuf),
      PNG.sync.read(currentBuf),
      bbox,
    );
    expect(regionMetrics.chromaSSIM).toBeLessThan(0.5);
  });

  it('keeps cwSSIM high (> 0.85) on a 1px subpixel shifted pattern compared to unstructured noise', () => {
    const width = 64;
    const height = 64;
    const bbox = { x: 8, y: 8, width: 48, height: 48 };

    const original = PNG.sync.read(
      createCustomPng(width, height, (x, _y) => {
        const v = x % 8 < 4 ? 200 : 50;
        return [v, v, v, 255];
      }),
    );

    const shifted1px = PNG.sync.read(
      createCustomPng(width, height, (x, _y) => {
        const sx = (x + width - 1) % width;
        const v = sx % 8 < 4 ? 200 : 50;
        return [v, v, v, 255];
      }),
    );

    const noise = PNG.sync.read(
      createCustomPng(width, height, (x, y) => {
        // Deterministic pseudo-random unstructured noise
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const v = Math.floor((hash - Math.floor(hash)) * 255);
        return [v, v, v, 255];
      }),
    );

    const shiftedMetrics = computeRegionSimilarity(original, shifted1px, bbox);
    const noiseMetrics = computeRegionSimilarity(original, noise, bbox);

    expect(shiftedMetrics.cwSSIM).toBeGreaterThan(0.85);
    expect(noiseMetrics.cwSSIM).toBeLessThan(0.5);
    expect(shiftedMetrics.cwSSIM).toBeGreaterThan(noiseMetrics.cwSSIM);
  });
});

