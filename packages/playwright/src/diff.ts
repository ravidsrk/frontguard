import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { CompareResult } from './types.js';

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

  const mismatchCount = pixelmatch(
    baselineData,
    currentData,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  const diffPercentage = totalPixels > 0 ? mismatchCount / totalPixels : 0;
  const passed = diffPercentage <= threshold;

  // Compute SSIM
  const ssim = computeSSIM(baselineData, currentData, width, height);

  const diffBuffer = mismatchCount > 0 ? PNG.sync.write(diff) : null;

  return {
    passed,
    diffPercentage,
    diffBuffer,
    ssim,
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
