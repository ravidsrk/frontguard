import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { CompareResult, PlaywrightDiffCluster } from './types.js';

/**
 * Extract connected-component spatial clusters from a binary diff mask using
 * 8-connected box/grid clustering and proximity merging.
 */
export function extractDiffClusters(
  diffMask: Uint8Array,
  width: number,
  height: number,
  mergeRadius = 2
): PlaywrightDiffCluster[] {
  if (width <= 0 || height <= 0 || diffMask.length < width * height) {
    return [];
  }

  const total = width * height;
  const visited = new Uint8Array(total);
  const rawAccum: Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    rawDiffPixels: number;
  }> = [];

  const queue = new Int32Array(total);

  for (let startIdx = 0; startIdx < total; startIdx++) {
    if (diffMask[startIdx] === 0 || visited[startIdx] !== 0) continue;

    visited[startIdx] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;

    let minX = startIdx % width;
    let maxX = minX;
    let minY = (startIdx / width) | 0;
    let maxY = minY;
    let rawDiffPixels = 0;

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = (curr / width) | 0;
      rawDiffPixels++;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const y0 = Math.max(0, cy - 1);
      const y1 = Math.min(height - 1, cy + 1);
      const x0 = Math.max(0, cx - 1);
      const x1 = Math.min(width - 1, cx + 1);

      for (let ny = y0; ny <= y1; ny++) {
        const rowOffset = ny * width;
        for (let nx = x0; nx <= x1; nx++) {
          const nIdx = rowOffset + nx;
          if (diffMask[nIdx] !== 0 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    rawAccum.push({ minX, minY, maxX, maxY, rawDiffPixels });
  }

  // Merge proximate or overlapping bounding boxes within mergeRadius
  let merged = true;
  while (merged && rawAccum.length > 1) {
    merged = false;
    for (let i = 0; i < rawAccum.length; i++) {
      for (let j = i + 1; j < rawAccum.length; j++) {
        const a = rawAccum[i];
        const b = rawAccum[j];
        const overlapsX = a.minX - mergeRadius <= b.maxX && a.maxX + mergeRadius >= b.minX;
        const overlapsY = a.minY - mergeRadius <= b.maxY && a.maxY + mergeRadius >= b.minY;
        if (overlapsX && overlapsY) {
          a.minX = Math.min(a.minX, b.minX);
          a.minY = Math.min(a.minY, b.minY);
          a.maxX = Math.max(a.maxX, b.maxX);
          a.maxY = Math.max(a.maxY, b.maxY);
          a.rawDiffPixels += b.rawDiffPixels;
          rawAccum.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  rawAccum.sort((a, b) => {
    if (b.rawDiffPixels !== a.rawDiffPixels) return b.rawDiffPixels - a.rawDiffPixels;
    if (a.minY !== b.minY) return a.minY - b.minY;
    return a.minX - b.minX;
  });

  return rawAccum.map((c, idx) => ({
    id: idx + 1,
    bbox: {
      x: c.minX,
      y: c.minY,
      width: c.maxX - c.minX + 1,
      height: c.maxY - c.minY + 1,
    },
    rawDiffPixels: c.rawDiffPixels,
  }));
}

/**
 * Compare two PNG buffers and return diff results.
 */
export function compareImages(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  threshold: number
): CompareResult {
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  // Handle size mismatch — resize canvas to max dimensions
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);

  const baselineData = padImage(baseline, width, height);
  const currentData = padImage(current, width, height);

  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  // Color distance 0.1 is per pixel. The caller's `threshold` is a fraction of
  // the image. windowSize is a second call so the fraction keeps the total count.
  const colorOptions = { threshold: 0.1, includeAA: false } as const;
  const mismatchCount = pixelmatch(
    baselineData,
    currentData,
    diff.data,
    width,
    height,
    colorOptions,
  );
  const windowMax =
    mismatchCount === 0
      ? 0
      : pixelmatch(baselineData, currentData, null, width, height, {
          ...colorOptions,
          windowSize: 16,
        });

  const diffPercentage = totalPixels > 0 ? mismatchCount / totalPixels : 0;
  const passed = diffPercentage <= threshold && windowMax <= 64;

  // Compute SSIM
  const ssim = computeSSIM(baselineData, currentData, width, height);

  let diffBuffer: Buffer | null = null;
  let clusters: PlaywrightDiffCluster[] = [];

  if (mismatchCount > 0) {
    diffBuffer = PNG.sync.write(diff);
    const diffMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      if (
        diff.data[idx] === 255 &&
        diff.data[idx + 1] === 0 &&
        diff.data[idx + 2] === 0
      ) {
        diffMask[i] = 1;
      }
    }
    clusters = extractDiffClusters(diffMask, width, height);
  }

  return {
    passed,
    diffPercentage,
    windowMax,
    diffBuffer,
    ssim,
    clusters,
  };
}

/**
 * Pad an image to the given dimensions with transparent pixels.
 */
function padImage(png: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data as unknown as Buffer;
  }

  const padded = Buffer.alloc(targetWidth * targetHeight * 4, 0);
  for (let y = 0; y < png.height; y++) {
    const srcOffset = y * png.width * 4;
    const dstOffset = y * targetWidth * 4;
    (png.data as unknown as Buffer).copy(padded, dstOffset, srcOffset, srcOffset + png.width * 4);
  }
  return padded;
}

/**
 * Compute Structural Similarity Index (SSIM) between two RGBA images.
 * Returns a value between 0 and 1, where 1 = identical.
 */
export function computeSSIM(
  img1: Buffer | Uint8Array,
  img2: Buffer | Uint8Array,
  width: number,
  height: number
): number {
  const L = 255;
  const k1 = 0.01;
  const k2 = 0.03;
  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  // Use 8x8 sliding window
  const windowSize = 8;
  if (width < windowSize || height < windowSize) {
    // Too small for SSIM, fall back to simple comparison
    return simpleSSIM(img1, img2);
  }

  let ssimSum = 0;
  let windowCount = 0;

  for (let y = 0; y <= height - windowSize; y += windowSize) {
    for (let x = 0; x <= width - windowSize; x += windowSize) {
      const { mean: mean1, variance: var1, pixels: px1 } = windowStats(img1, width, x, y, windowSize);
      const { mean: mean2, variance: var2, pixels: px2 } = windowStats(img2, width, x, y, windowSize);

      // Covariance
      let covariance = 0;
      for (let i = 0; i < px1.length; i++) {
        covariance += (px1[i] - mean1) * (px2[i] - mean2);
      }
      covariance /= px1.length;

      const numerator = (2 * mean1 * mean2 + c1) * (2 * covariance + c2);
      const denominator = (mean1 ** 2 + mean2 ** 2 + c1) * (var1 + var2 + c2);

      ssimSum += numerator / denominator;
      windowCount++;
    }
  }

  return windowCount > 0 ? ssimSum / windowCount : 1;
}

/**
 * Compute window statistics for SSIM.
 */
function windowStats(
  img: Buffer | Uint8Array,
  imgWidth: number,
  startX: number,
  startY: number,
  windowSize: number
): { mean: number; variance: number; pixels: number[] } {
  const pixels: number[] = [];

  for (let dy = 0; dy < windowSize; dy++) {
    for (let dx = 0; dx < windowSize; dx++) {
      const idx = ((startY + dy) * imgWidth + (startX + dx)) * 4;
      // Convert to luminance: 0.299R + 0.587G + 0.114B
      const lum = 0.299 * img[idx] + 0.587 * img[idx + 1] + 0.114 * img[idx + 2];
      pixels.push(lum);
    }
  }

  const n = pixels.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += pixels[i];
  const mean = sum / n;

  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (pixels[i] - mean) ** 2;
  const variance = varSum / n;

  return { mean, variance, pixels };
}

/**
 * Simple SSIM fallback for tiny images.
 */
function simpleSSIM(img1: Buffer | Uint8Array, img2: Buffer | Uint8Array): number {
  const n = Math.min(img1.length, img2.length);
  if (n === 0) return 1;

  let diffSum = 0;
  for (let i = 0; i < n; i++) {
    diffSum += Math.abs(img1[i] - img2[i]);
  }

  const avgDiff = diffSum / n;
  return Math.max(0, 1 - avgDiff / 255);
}
