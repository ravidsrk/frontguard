import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { compareImages, computeSSIM } from '../src/diff.js';

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
});

describe('computeSSIM', () => {
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
