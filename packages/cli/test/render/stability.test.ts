import { describe, it, expect, vi } from 'vitest';
import { PNG } from 'pngjs';
import {
  compareConsecutiveFrames,
  captureStableScreenshot,
} from '../../src/render/stability.js';

function createSolidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
  patch?: { x: number; y: number; w: number; h: number; rgba: [number, number, number, number] },
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inPatch =
        patch &&
        x >= patch.x &&
        x < patch.x + patch.w &&
        y >= patch.y &&
        y < patch.y + patch.h;
      const c = inPatch ? patch.rgba : rgba;
      png.data[idx] = c[0];
      png.data[idx + 1] = c[1];
      png.data[idx + 2] = c[2];
      png.data[idx + 3] = c[3];
    }
  }
  return PNG.sync.write(png);
}

describe('compareConsecutiveFrames', () => {
  it('returns ratio 0 when two PNG frames are identical', () => {
    const f1 = createSolidPng(40, 40, [240, 240, 240, 255]);
    const f2 = createSolidPng(40, 40, [240, 240, 240, 255]);

    const res = compareConsecutiveFrames(f1, f2);
    expect(res.settled).toBe(true);
    expect(res.unstableRatio).toBe(0);
    expect(res.motionClusters).toEqual([]);
  });

  it('computes unstableRatio and extracts motionClusters when region is moving', () => {
    const f1 = createSolidPng(60, 60, [255, 255, 255, 255]);
    const f2 = createSolidPng(60, 60, [255, 255, 255, 255], {
      x: 10,
      y: 10,
      w: 16,
      h: 16,
      rgba: [220, 20, 60, 255],
    });

    const res = compareConsecutiveFrames(f1, f2);
    expect(res.settled).toBe(false);
    expect(res.unstableRatio).toBeGreaterThan(0.05);
    expect(res.motionClusters.length).toBeGreaterThanOrEqual(1);
    expect(res.motionClusters[0].bbox.width).toBeGreaterThanOrEqual(16);
    expect(res.motionClusters[0].bbox.height).toBeGreaterThanOrEqual(16);
  });

  it('returns unstableRatio 1 when frame dimensions differ', () => {
    const f1 = createSolidPng(40, 40, [255, 255, 255, 255]);
    const f2 = createSolidPng(40, 80, [255, 255, 255, 255]);

    const res = compareConsecutiveFrames(f1, f2);
    expect(res.settled).toBe(false);
    expect(res.unstableRatio).toBe(1);
  });
});

describe('captureStableScreenshot', () => {
  const noopWait = async (): Promise<void> => {};

  it('converges immediately when first two frames match', async () => {
    const stablePng = createSolidPng(32, 32, [100, 150, 200, 255]);
    const takeScreenshot = vi.fn().mockResolvedValue(stablePng);

    const result = await captureStableScreenshot(takeScreenshot, noopWait, {
      maxAttempts: 4,
      intervalMs: 10,
    });

    expect(result.settled).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.unstableRatio).toBe(0);
    expect(result.motionClusters).toEqual([]);
    expect(takeScreenshot).toHaveBeenCalledTimes(2);
  });

  it('settles on later iteration after initial transition finishes', async () => {
    const f1 = createSolidPng(40, 40, [255, 255, 255, 255], {
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      rgba: [255, 0, 0, 255],
    });
    const f2 = createSolidPng(40, 40, [255, 255, 255, 255], {
      x: 15,
      y: 15,
      w: 20,
      h: 20,
      rgba: [0, 0, 255, 255],
    });
    const f3 = f2; // settled!

    const frames = [f1, f2, f3];
    let callIdx = 0;
    const takeScreenshot = vi.fn().mockImplementation(async () => {
      const next = frames[Math.min(callIdx, frames.length - 1)];
      callIdx++;
      return next;
    });

    const result = await captureStableScreenshot(takeScreenshot, noopWait, {
      maxAttempts: 4,
      intervalMs: 10,
    });

    expect(result.settled).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.unstableRatio).toBe(0);
  });

  it('returns settled=false and motionClusters when animation never converges before maxAttempts', async () => {
    let toggle = false;
    const fA = createSolidPng(50, 50, [255, 255, 255, 255], {
      x: 8,
      y: 8,
      w: 20,
      h: 20,
      rgba: [255, 0, 0, 255],
    });
    const fB = createSolidPng(50, 50, [255, 255, 255, 255], {
      x: 8,
      y: 8,
      w: 20,
      h: 20,
      rgba: [0, 255, 0, 255],
    });

    const takeScreenshot = vi.fn().mockImplementation(async () => {
      toggle = !toggle;
      return toggle ? fA : fB;
    });

    const result = await captureStableScreenshot(takeScreenshot, noopWait, {
      maxAttempts: 3,
      intervalMs: 10,
    });

    expect(result.settled).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.unstableRatio).toBeGreaterThan(0.05);
    expect(result.motionClusters.length).toBeGreaterThanOrEqual(1);
    expect(result.motionClusters[0].bbox.x).toBeLessThanOrEqual(8);
  });
});
