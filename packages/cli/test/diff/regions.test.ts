import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  extractDiffClusters,
  cropClusterComparisonStrip,
  drawSetOfMarkBoxes,
} from '../../src/diff/regions.js';
import { createTestPng } from '../fixtures/helpers.js';

describe('extractDiffClusters', () => {
  it('returns an empty array for an empty diff mask', () => {
    const mask = new Uint8Array(100 * 100);
    const clusters = extractDiffClusters(mask, 100, 100);
    expect(clusters).toEqual([]);
  });

  it('extracts a single dense rectangular region with accurate bbox and density', () => {
    const width = 100;
    const height = 100;
    const mask = new Uint8Array(width * height);

    // Fill a 10x8 block at (20, 30)
    for (let y = 30; y < 38; y++) {
      for (let x = 20; x < 30; x++) {
        mask[y * width + x] = 1;
      }
    }

    const clusters = extractDiffClusters(mask, width, height);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toBe(1);
    expect(clusters[0].bbox).toEqual({ x: 20, y: 30, width: 10, height: 8 });
    expect(clusters[0].rawDiffPixels).toBe(80);
    expect(clusters[0].density).toBeCloseTo(1.0, 5);
    expect(clusters[0].perimeterRatio).toBeLessThan(1.0);
  });

  it('separates multiple distant diff regions and sorts by rawDiffPixels descending', () => {
    const width = 200;
    const height = 200;
    const mask = new Uint8Array(width * height);

    // Region A: 4x4 = 16 pixels at (10, 10)
    for (let y = 10; y < 14; y++) {
      for (let x = 10; x < 14; x++) {
        mask[y * width + x] = 1;
      }
    }

    // Region B: 10x10 = 100 pixels at (150, 150)
    for (let y = 150; y < 160; y++) {
      for (let x = 150; x < 160; x++) {
        mask[y * width + x] = 1;
      }
    }

    const clusters = extractDiffClusters(mask, width, height);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].id).toBe(1);
    expect(clusters[0].rawDiffPixels).toBe(100);
    expect(clusters[0].bbox).toEqual({ x: 150, y: 150, width: 10, height: 10 });

    expect(clusters[1].id).toBe(2);
    expect(clusters[1].rawDiffPixels).toBe(16);
    expect(clusters[1].bbox).toEqual({ x: 10, y: 10, width: 4, height: 4 });
  });

  it('merges adjacent characters bridged by horizontal box dilation', () => {
    const width = 200;
    const height = 100;
    const mask = new Uint8Array(width * height);

    // Character 1 at x=[20..24], y=[40..48] (4x8 = 32 px)
    for (let y = 40; y < 48; y++) {
      for (let x = 20; x < 24; x++) {
        mask[y * width + x] = 1;
      }
    }
    // Character 2 at x=[30..34], y=[40..48] (6px gap, bridged by default dilateRadiusX=8)
    for (let y = 40; y < 48; y++) {
      for (let x = 30; x < 34; x++) {
        mask[y * width + x] = 1;
      }
    }

    const clusters = extractDiffClusters(mask, width, height);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].rawDiffPixels).toBe(64);
    expect(clusters[0].bbox).toEqual({ x: 20, y: 40, width: 14, height: 8 });
  });

  it('filters out isolated micro-specks below minPixels', () => {
    const width = 100;
    const height = 100;
    const mask = new Uint8Array(width * height);

    // 2 isolated specks of 1 and 2 pixels (< default minPixels=4)
    mask[10 * width + 10] = 1;
    mask[80 * width + 80] = 1;
    mask[80 * width + 81] = 1;

    // 1 real cluster of 5x5 = 25 pixels at (40, 40)
    for (let y = 40; y < 45; y++) {
      for (let x = 40; x < 45; x++) {
        mask[y * width + x] = 1;
      }
    }

    const clusters = extractDiffClusters(mask, width, height);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].rawDiffPixels).toBe(25);
    expect(clusters[0].bbox).toEqual({ x: 40, y: 40, width: 5, height: 5 });
  });
});

describe('cropClusterComparisonStrip', () => {
  it('produces a valid 3-panel PNG buffer with expected dimensions', () => {
    const baselinePng = PNG.sync.read(createTestPng(200, 150, 255, 0, 0));
    const currentPng = PNG.sync.read(createTestPng(200, 150, 0, 255, 0));
    const diffPng = PNG.sync.read(createTestPng(200, 150, 0, 0, 255));

    const bbox = { x: 60, y: 50, width: 20, height: 16 };
    const padding = 10;
    const stripBuf = cropClusterComparisonStrip(
      baselinePng,
      currentPng,
      diffPng,
      bbox,
      padding,
    );

    const decoded = PNG.sync.read(stripBuf);
    const expectedPanelWidth = 20 + padding * 2; // 40
    const expectedPanelHeight = 16 + padding * 2; // 36
    expect(decoded.width).toBe(expectedPanelWidth * 3);
    expect(decoded.height).toBe(expectedPanelHeight);

    // Verify Panel 1 (baseline = red), Panel 2 (current = green), Panel 3 (diff = blue)
    const p1Idx = (0 * decoded.width + 5) << 2;
    expect([decoded.data[p1Idx], decoded.data[p1Idx + 1], decoded.data[p1Idx + 2]]).toEqual([255, 0, 0]);

    const p2Idx = (0 * decoded.width + expectedPanelWidth + 5) << 2;
    expect([decoded.data[p2Idx], decoded.data[p2Idx + 1], decoded.data[p2Idx + 2]]).toEqual([0, 255, 0]);

    const p3Idx = (0 * decoded.width + expectedPanelWidth * 2 + 5) << 2;
    expect([decoded.data[p3Idx], decoded.data[p3Idx + 1], decoded.data[p3Idx + 2]]).toEqual([0, 0, 255]);
  });
});

describe('drawSetOfMarkBoxes', () => {
  it('draws high-contrast bounding box outlines and numeric marker badges onto a PNG', () => {
    const png = PNG.sync.read(createTestPng(100, 100, 255, 255, 255));
    drawSetOfMarkBoxes(png, [
      { id: 1, bbox: { x: 20, y: 20, width: 30, height: 25 } },
    ]);

    // Top-left border pixel at (20, 20) should be modified from white [255, 255, 255]
    const borderIdx = (20 * png.width + 20) << 2;
    expect(png.data[borderIdx]).toBe(255);
    expect(png.data[borderIdx + 1]).toBe(0);
    expect(png.data[borderIdx + 2]).toBe(85);
  });
});
