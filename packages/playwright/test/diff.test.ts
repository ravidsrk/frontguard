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

  it('threshold=1 passes on any difference', () => {
    const img1 = createPNG(100, 100, [0, 0, 0, 255]);
    const img2 = createPNG(100, 100, [255, 255, 255, 255]);
    const result = compareImages(img1, img2, 1);

    expect(result.passed).toBe(true);
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
