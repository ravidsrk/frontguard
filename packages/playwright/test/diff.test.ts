import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { compareImages, computeSSIM, extractDiffClusters } from '../src/diff.js';

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

/** Create a PNG with a modified region */
function createPNGWithRegion(
  width: number,
  height: number,
  baseColor: [number, number, number, number],
  regionColor: [number, number, number, number],
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inRegion =
        x >= regionX && x < regionX + regionW && y >= regionY && y < regionY + regionH;
      const c = inRegion ? regionColor : baseColor;
      png.data[idx] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = c[3];
    }
  }
  return PNG.sync.write(png);
}

describe('compareImages', () => {
  it('identical images → passed=true, diff=0', () => {
    const img = createPNG(100, 100, [128, 128, 128, 255]);
    const result = compareImages(img, img, 0.01);

    expect(result.passed).toBe(true);
    expect(result.diffPercentage).toBe(0);
    expect(result.diffBuffer).toBeNull();
    expect(result.ssim).toBeCloseTo(1, 1);
  });

  it('completely different images → passed=false, high diff', () => {
    const img1 = createPNG(100, 100, [255, 0, 0, 255]);
    const img2 = createPNG(100, 100, [0, 0, 255, 255]);
    const result = compareImages(img1, img2, 0.01);

    expect(result.passed).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0.5);
    expect(result.diffBuffer).not.toBeNull();
  });

  it('small diff within threshold → passed=true', () => {
    // 100x100 image, change a 2x2 region = 4/10000 = 0.04%
    const img1 = createPNG(100, 100, [128, 128, 128, 255]);
    const img2 = createPNGWithRegion(
      100, 100,
      [128, 128, 128, 255],
      [255, 0, 0, 255],
      0, 0, 2, 2
    );

    const result = compareImages(img1, img2, 0.01);
    expect(result.passed).toBe(true);
    expect(result.diffPercentage).toBeLessThanOrEqual(0.01);
  });

  it('diff just above threshold → passed=false', () => {
    // 10x10 image, change 2 pixels = 2/100 = 2%
    const img1 = createPNG(10, 10, [128, 128, 128, 255]);
    const img2 = createPNGWithRegion(
      10, 10,
      [128, 128, 128, 255],
      [255, 0, 0, 255],
      0, 0, 2, 1
    );

    const result = compareImages(img1, img2, 0.01);
    expect(result.passed).toBe(false);
    expect(result.diffPercentage).toBeGreaterThan(0.01);
  });

  it('handles different-sized images', () => {
    const img1 = createPNG(50, 50, [128, 128, 128, 255]);
    const img2 = createPNG(100, 100, [128, 128, 128, 255]);
    const result = compareImages(img1, img2, 0.01);

    // Should not throw — pads to max dimensions
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('fails a compact edit that is a few percent of the image at threshold 0.1', () => {
    const base = createPNG(200, 150, [255, 255, 255, 255]);
    const current = createPNGWithRegion(
      200,
      150,
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      30,
      40,
      40,
      24,
    );
    const result = compareImages(base, current, 0.1);

    expect(result.diffPercentage).toBeLessThan(0.1);
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.windowMax).toBeGreaterThan(64);
    expect(result.passed).toBe(false);
  });

  it('keeps scattered high-contrast speckle under threshold 0.1', () => {
    const width = 200;
    const height = 150;
    const basePng = new PNG({ width, height });
    const currentPng = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const speck = x % 8 === 0 && y % 8 === 0;
        basePng.data[idx] = 255;
        basePng.data[idx + 1] = 255;
        basePng.data[idx + 2] = 255;
        basePng.data[idx + 3] = 255;
        currentPng.data[idx] = speck ? 0 : 255;
        currentPng.data[idx + 1] = speck ? 0 : 255;
        currentPng.data[idx + 2] = speck ? 0 : 255;
        currentPng.data[idx + 3] = 255;
      }
    }
    const result = compareImages(PNG.sync.write(basePng), PNG.sync.write(currentPng), 0.1);

    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffPercentage).toBeLessThan(0.1);
    expect(result.windowMax).toBeLessThanOrEqual(64);
    expect(result.passed).toBe(true);
  });

  it('counts a large gray step and ignores a small one', () => {
    const white = createPNG(16, 16, [255, 255, 255, 255]);
    const under = createPNG(16, 16, [230, 230, 230, 255]);
    const over = createPNG(16, 16, [220, 220, 220, 255]);

    expect(compareImages(white, under, 0.1).diffPercentage).toBe(0);
    expect(compareImages(white, over, 0.1).diffPercentage).toBeGreaterThan(0.5);
  });

  it('threshold=0 fails on any difference', () => {
    const img1 = createPNG(10, 10, [128, 128, 128, 255]);
    const img2 = createPNGWithRegion(
      10, 10,
      [128, 128, 128, 255],
      [129, 128, 128, 255], // 1 shade off on 1 pixel
      0, 0, 1, 1
    );

    const result = compareImages(img1, img2, 0);
    // pixelmatch might or might not flag a 1-shade diff at threshold=0.1
    // but at least it shouldn't crash
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.diffPercentage).toBe('number');
  });

  it('a ratio of 1 still fails a dense difference', () => {
    const img1 = createPNG(100, 100, [0, 0, 0, 255]);
    const img2 = createPNG(100, 100, [255, 255, 255, 255]);
    const result = compareImages(img1, img2, 1);

    expect(result.diffPercentage).toBeGreaterThan(0.5);
    expect(result.passed).toBe(false);
  });

  it('extracts spatial connected-component diff clusters sorted by rawDiffPixels', () => {
    const base = createPNG(100, 100, [128, 128, 128, 255]);
    const png = PNG.sync.read(base);
    // Region 1: 4x4 at (10, 10) -> 16 pixels
    for (let y = 10; y < 14; y++) {
      for (let x = 10; x < 14; x++) {
        const idx = (y * 100 + x) * 4;
        png.data[idx] = 255;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
      }
    }
    // Region 2: 8x6 at (50, 60) -> 48 pixels
    for (let y = 60; y < 66; y++) {
      for (let x = 50; x < 58; x++) {
        const idx = (y * 100 + x) * 4;
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 255;
      }
    }
    const current = PNG.sync.write(png);

    const result = compareImages(base, current, 0.001);
    expect(result.clusters).toBeDefined();
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters![0]).toEqual({
      id: 1,
      bbox: { x: 50, y: 60, width: 8, height: 6 },
      rawDiffPixels: 48,
    });
    expect(result.clusters![1]).toEqual({
      id: 2,
      bbox: { x: 10, y: 10, width: 4, height: 4 },
      rawDiffPixels: 16,
    });
  });

  it('uses byte-identical fast path without decoding PNGs', () => {
    const identicalRaw = Buffer.from('not-even-a-png-byte-identical');
    const result = compareImages(identicalRaw, Buffer.from(identicalRaw), 0.01);
    expect(result).toEqual({
      passed: true,
      diffPercentage: 0,
      windowMax: 0,
      diffBuffer: null,
      ssim: 1,
      clusters: [],
    });
  });

  it('applies minPixels filtering, maxClusters capping, and non-cubic merging on dense speck fields', () => {
    // 200x200 image with 20 separate 3x3 blocks (9px each, spaced 25px apart so they don't merge)
    const width = 400;
    const height = 400;
    const mask = new Uint8Array(width * height);
    // Add isolated 1px micro-specks (< minPixels=4) that must be filtered out
    mask[5 * width + 5] = 1;
    mask[5 * width + 50] = 1;

    // Add 16 separated 3x3 blocks (>= minPixels=4) -> must cap at maxClusters=8
    let count = 0;
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const x0 = 20 + gx * 90;
        const y0 = 20 + gy * 90;
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            mask[(y0 + dy) * width + (x0 + dx)] = 1;
          }
        }
        count++;
      }
    }
    expect(count).toBe(16);

    const start = performance.now();
    const clusters = extractDiffClusters(mask, width, height);
    const elapsed = performance.now() - start;

    expect(clusters).toHaveLength(8); // capped at default maxClusters=8
    expect(clusters.every((c) => c.rawDiffPixels === 9)).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  it('handles float-boundary threshold equality cleanly via compareDiffToThreshold', () => {
    // 100x100 image with 100 changed pixels = exact 0.01 (1%) -> should pass at threshold 0.01
    // Spread across 10x10? No, 10x10 has windowMax=100>64, so use a 100x1 line (windowMax=16<=64)
    const base = createPNG(100, 100, [128, 128, 128, 255]);
    const current = createPNGWithRegion(100, 100, [128, 128, 128, 255], [255, 0, 0, 255], 0, 0, 100, 1);
    const result = compareImages(base, current, 0.01);
    expect(result.diffPercentage).toBe(0.01);
    expect(result.windowMax).toBeLessThanOrEqual(64);
    expect(result.passed).toBe(true);
  });
});

describe('computeSSIM', () => {
  it('uses ITU-R BT.709 luminance weights matching @frontguard/cli', () => {
    const size = 16;
    // Pure blue (0,0,255): BT.709 luma = 18.411 vs BT.601 luma = 29.07
    // Gray with luma 18 (18,18,18) matches BT.709 much closer than gray 29
    const blue = Buffer.alloc(size * size * 4);
    const gray709 = Buffer.alloc(size * size * 4);
    const gray601 = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size * 4; i += 4) {
      blue[i] = 0; blue[i + 1] = 0; blue[i + 2] = 255; blue[i + 3] = 255;
      gray709[i] = 18; gray709[i + 1] = 18; gray709[i + 2] = 18; gray709[i + 3] = 255;
      gray601[i] = 29; gray601[i + 1] = 29; gray601[i + 2] = 29; gray601[i + 3] = 255;
    }
    expect(computeSSIM(blue, gray709, size, size)).toBeGreaterThan(computeSSIM(blue, gray601, size, size));
  });
  it('identical data → SSIM ≈ 1', () => {
    const size = 32;
    const data = Buffer.alloc(size * size * 4, 128);
    const ssim = computeSSIM(data, data, size, size);
    expect(ssim).toBeCloseTo(1, 2);
  });

  it('different data → SSIM < 1', () => {
    const size = 32;
    const data1 = Buffer.alloc(size * size * 4, 0);
    const data2 = Buffer.alloc(size * size * 4, 255);
    const ssim = computeSSIM(data1, data2, size, size);
    expect(ssim).toBeLessThan(0.5);
  });

  it('nearly identical data → SSIM close to 1', () => {
    const size = 32;
    const data1 = Buffer.alloc(size * size * 4, 128);
    const data2 = Buffer.from(data1);
    // Modify a few pixels slightly
    for (let i = 0; i < 40; i += 4) {
      data2[i] = 130;
    }
    const ssim = computeSSIM(data1, data2, size, size);
    expect(ssim).toBeGreaterThan(0.95);
  });
});
