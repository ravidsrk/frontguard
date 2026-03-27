/**
 * Structural Similarity Index (SSIM) computation for Frontguard.
 *
 * SSIM compares luminance, contrast, and structure — making it robust
 * against anti-aliasing, sub-pixel rendering, and gamma differences
 * that cause false positives in pixel-level diffing.
 *
 * Implemented from scratch using the original Wang et al. (2004) formula.
 * No external dependencies beyond pngjs.
 *
 * @module diff/ssim
 */

import { PNG } from 'pngjs';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute Structural Similarity Index (SSIM) between two PNG images.
 *
 * @param img1 - Raw PNG buffer of the first image
 * @param img2 - Raw PNG buffer of the second image
 * @returns A value between 0 (completely different) and 1 (identical)
 */
export function computeSSIM(img1: Buffer, img2: Buffer): number {
  const png1 = PNG.sync.read(img1);
  const png2 = PNG.sync.read(img2);

  if (png1.width !== png2.width || png1.height !== png2.height) {
    return 0; // Different dimensions = completely different
  }

  // Convert to grayscale luminance
  const lum1 = toGrayscale(png1);
  const lum2 = toGrayscale(png2);

  // Compute SSIM using sliding window (8×8 blocks)
  const windowSize = 8;
  const K1 = 0.01;
  const K2 = 0.03;
  const L = 255; // dynamic range of pixel values
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;

  let ssimSum = 0;
  let count = 0;

  for (let y = 0; y <= png1.height - windowSize; y += windowSize) {
    for (let x = 0; x <= png1.width - windowSize; x += windowSize) {
      const block1 = extractBlock(lum1, png1.width, x, y, windowSize);
      const block2 = extractBlock(lum2, png2.width, x, y, windowSize);

      const mean1 = mean(block1);
      const mean2 = mean(block2);
      const var1 = variance(block1, mean1);
      const var2 = variance(block2, mean2);
      const cov = covariance(block1, block2, mean1, mean2);

      const numerator = (2 * mean1 * mean2 + C1) * (2 * cov + C2);
      const denominator = (mean1 ** 2 + mean2 ** 2 + C1) * (var1 + var2 + C2);

      ssimSum += numerator / denominator;
      count++;
    }
  }

  return count > 0 ? ssimSum / count : 1;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert an RGBA PNG to a grayscale luminance array using ITU-R BT.709
 * luma coefficients.
 */
export function toGrayscale(png: PNG): Float64Array {
  const gray = new Float64Array(png.width * png.height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    // ITU-R BT.709 luma coefficients
    gray[i] =
      0.2126 * png.data[idx] +
      0.7152 * png.data[idx + 1] +
      0.0722 * png.data[idx + 2];
  }
  return gray;
}

/**
 * Extract a square block of pixels from a grayscale image.
 */
function extractBlock(
  data: Float64Array,
  width: number,
  x: number,
  y: number,
  size: number,
): number[] {
  const block: number[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      block.push(data[(y + dy) * width + (x + dx)]);
    }
  }
  return block;
}

/** Arithmetic mean of an array. */
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Population variance of an array given its mean. */
function variance(arr: number[], m: number): number {
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

/** Population covariance of two arrays given their means. */
function covariance(
  a: number[],
  b: number[],
  ma: number,
  mb: number,
): number {
  return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / a.length;
}
