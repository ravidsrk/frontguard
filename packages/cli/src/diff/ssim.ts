/**
 * Structural Similarity Index (SSIM) computation for Frontguard.
 *
 * Includes:
 * - Full-image grayscale SSIM (Wang et al., 2004)
 * - ITU-R BT.709 YCbCr Chroma-Aware SSIM (full-image and region-scoped)
 * - Complex Wavelet / Quadrature Gabor Phase SSIM (CW-SSIM, Sampat et al., 2009)
 *   across 4 orientations (0, π/4, π/2, 3π/4) for shift-invariant structural comparison.
 *
 * No external dependencies beyond pngjs.
 *
 * @module diff/ssim
 */

import { PNG } from 'pngjs';
import type { BoundingBox } from './regions.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Region-scoped perceptual similarity metrics for a diff cluster. */
export interface RegionSimilarityMetrics {
  /** ITU-R BT.709 YCbCr chroma-aware SSIM (0–1) within the bounding box. */
  chromaSSIM: number;
  /** Complex Wavelet / Quadrature Gabor Phase SSIM (0–1) within the bounding box. */
  cwSSIM: number;
}

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

  return count > 0 ? ssimSum / count : 0;
}

/**
 * Compute full-image chroma-aware YCbCr SSIM between two PNG buffers.
 *
 * Catches isoluminant color changes (e.g. red vs green with identical
 * ITU-R BT.709 luminance) where grayscale SSIM returns > 0.99.
 *
 * @param img1 - Raw PNG buffer of the first image
 * @param img2 - Raw PNG buffer of the second image
 * @returns A value between 0 (completely different) and 1 (identical)
 */
export function computeChromaSSIM(img1: Buffer, img2: Buffer): number {
  const png1 = PNG.sync.read(img1);
  const png2 = PNG.sync.read(img2);

  if (png1.width !== png2.width || png1.height !== png2.height) {
    return 0;
  }
  if (png1.width < 8 || png1.height < 8) {
    return 0;
  }

  return computeChromaSSIMInRect(png1, png2, {
    x: 0,
    y: 0,
    width: png1.width,
    height: png1.height,
  });
}

/**
 * Compute region-scoped Chroma-Aware YCbCr SSIM and Complex Wavelet SSIM (CW-SSIM)
 * strictly within `bbox` (padded to at least 8×8 when possible).
 *
 * @param png1 - Decoded baseline PNG
 * @param png2 - Decoded current PNG
 * @param bbox - Bounding box of the diff cluster
 * @returns `{ chromaSSIM, cwSSIM }` in `[0, 1]`
 */
export function computeRegionSimilarity(
  png1: PNG,
  png2: PNG,
  bbox: BoundingBox,
): RegionSimilarityMetrics {
  if (
    png1.width !== png2.width ||
    png1.height !== png2.height ||
    png1.width === 0 ||
    png1.height === 0
  ) {
    return { chromaSSIM: 0, cwSSIM: 0 };
  }

  const padded = padBoxToMinSize(bbox, png1.width, png1.height, 8);
  const chromaSSIM = computeChromaSSIMInRect(png1, png2, padded);
  const cwSSIM = computeCWSSIMInRect(png1, png2, padded);

  return { chromaSSIM, cwSSIM };
}

// ---------------------------------------------------------------------------
// Grayscale & YCbCr helpers
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

interface YCbCrPatch {
  width: number;
  height: number;
  Y: Float64Array;
  Cb: Float64Array;
  Cr: Float64Array;
}

/**
 * Extract an ITU-R BT.709 YCbCr patch from an RGBA PNG within `rect`.
 */
function extractYCbCrPatch(png: PNG, rect: BoundingBox): YCbCrPatch {
  const { x: rx, y: ry, width: rw, height: rh } = rect;
  const total = rw * rh;
  const Y = new Float64Array(total);
  const Cb = new Float64Array(total);
  const Cr = new Float64Array(total);

  let k = 0;
  for (let dy = 0; dy < rh; dy++) {
    const srcRow = (ry + dy) * png.width;
    for (let dx = 0; dx < rw; dx++) {
      const idx = (srcRow + (rx + dx)) << 2;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];

      const yVal = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // ITU-R BT.709 chrominance components shifted to [0, 255]
      const cbVal = 128 + (-0.114572 * r - 0.385428 * g + 0.5 * b);
      const crVal = 128 + (0.5 * r - 0.454153 * g - 0.045847 * b);

      Y[k] = yVal;
      Cb[k] = cbVal;
      Cr[k] = crVal;
      k++;
    }
  }

  return { width: rw, height: rh, Y, Cb, Cr };
}

/**
 * Pad a bounding box symmetrically so its width and height are at least `minSize`,
 * clamped to `[0, imgWidth]` and `[0, imgHeight]`.
 */
function padBoxToMinSize(
  bbox: BoundingBox,
  imgWidth: number,
  imgHeight: number,
  minSize: number,
): BoundingBox {
  const targetW = Math.min(imgWidth, Math.max(minSize, Math.floor(bbox.width)));
  const targetH = Math.min(imgHeight, Math.max(minSize, Math.floor(bbox.height)));

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  let x0 = Math.round(cx - targetW / 2);
  let y0 = Math.round(cy - targetH / 2);

  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x0 + targetW > imgWidth) x0 = Math.max(0, imgWidth - targetW);
  if (y0 + targetH > imgHeight) y0 = Math.max(0, imgHeight - targetH);

  return {
    x: x0,
    y: y0,
    width: Math.max(1, Math.min(imgWidth - x0, targetW)),
    height: Math.max(1, Math.min(imgHeight - y0, targetH)),
  };
}

/**
 * Compute single-channel SSIM on two extracted blocks along with their means.
 */
function computeBlockChannelSSIM(
  b1: number[],
  b2: number[],
  C1: number,
  C2: number,
): { ssim: number; mean1: number; mean2: number } {
  const m1 = mean(b1);
  const m2 = mean(b2);
  const v1 = variance(b1, m1);
  const v2 = variance(b2, m2);
  const cov = covariance(b1, b2, m1, m2);

  const numerator = (2 * m1 * m2 + C1) * (2 * cov + C2);
  const denominator = (m1 ** 2 + m2 ** 2 + C1) * (v1 + v2 + C2);
  return {
    ssim: denominator !== 0 ? numerator / denominator : 0,
    mean1: m1,
    mean2: m2,
  };
}

/**
 * Compute ITU-R BT.709 YCbCr weighted SSIM (`0.8 * ssimY + 0.1 * ssimCb + 0.1 * ssimCr`)
 * within `rect`, augmented with chrominance Euclidean shift attenuation so isoluminant
 * hue inversions (e.g. red vs green of identical luminance Y) drop sharply.
 */
function computeChromaSSIMInRect(
  png1: PNG,
  png2: PNG,
  rect: BoundingBox,
): number {
  const p1 = extractYCbCrPatch(png1, rect);
  const p2 = extractYCbCrPatch(png2, rect);

  const windowSize = Math.min(8, p1.width, p1.height);
  if (windowSize < 1) return 0;

  const K1 = 0.01;
  const K2 = 0.03;
  const L = 255;
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;
  const chromaSigmaSq2 = 2 * 36 * 36;

  // Generate block start coordinates that cover the entire rect
  const xs = buildWindowStarts(p1.width, windowSize);
  const ys = buildWindowStarts(p1.height, windowSize);

  let sum = 0;
  let count = 0;

  for (const y of ys) {
    for (const x of xs) {
      const y1 = extractBlock(p1.Y, p1.width, x, y, windowSize);
      const y2 = extractBlock(p2.Y, p2.width, x, y, windowSize);
      const cb1 = extractBlock(p1.Cb, p1.width, x, y, windowSize);
      const cb2 = extractBlock(p2.Cb, p2.width, x, y, windowSize);
      const cr1 = extractBlock(p1.Cr, p1.width, x, y, windowSize);
      const cr2 = extractBlock(p2.Cr, p2.width, x, y, windowSize);

      const resY = computeBlockChannelSSIM(y1, y2, C1, C2);
      const resCb = computeBlockChannelSSIM(cb1, cb2, C1, C2);
      const resCr = computeBlockChannelSSIM(cr1, cr2, C1, C2);

      const weighted = 0.8 * resY.ssim + 0.1 * resCb.ssim + 0.1 * resCr.ssim;

      // Chrominance shift attenuation catches isoluminant hue swaps where Y is identical
      // and Cb/Cr DC offset (128) would otherwise keep raw channel SSIM artificially high.
      const dCb = resCb.mean1 - resCb.mean2;
      const dCr = resCr.mean1 - resCr.mean2;
      const deltaChromaSq = dCb * dCb + dCr * dCr;
      const chromaAttenuation = Math.exp(-deltaChromaSq / chromaSigmaSq2);

      const blockScore = Math.max(0, Math.min(1, weighted * chromaAttenuation));
      sum += blockScore;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

function buildWindowStarts(dim: number, windowSize: number): number[] {
  if (dim <= windowSize) return [0];
  const starts: number[] = [];
  for (let pos = 0; pos <= dim - windowSize; pos += windowSize) {
    starts.push(pos);
  }
  const last = dim - windowSize;
  if (starts[starts.length - 1] !== last) {
    starts.push(last);
  }
  return starts;
}

// ---------------------------------------------------------------------------
// Complex Wavelet / Quadrature Gabor Phase SSIM (CW-SSIM)
// ---------------------------------------------------------------------------

interface GaborKernel2D {
  radius: number;
  size: number;
  real: Float64Array;
  imag: Float64Array;
}

const GABOR_ORIENTATIONS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
const GABOR_WAVELENGTHS = [4, 8];

let cachedGaborBank: GaborKernel2D[] | null = null;

/**
 * Build (and cache) the bank of 2D quadrature Gabor wavelet kernels across
 * 4 orientations (0, π/4, π/2, 3π/4) and wavelengths (4px, 8px).
 * Each real kernel is zero-mean (DC-balanced) so constant patches produce zero response.
 */
function getGaborBank(): GaborKernel2D[] {
  if (cachedGaborBank) return cachedGaborBank;

  const bank: GaborKernel2D[] = [];
  const radius = 4;
  const size = 2 * radius + 1;
  const sigma = 2.5;
  const twoSigmaSq = 2 * sigma * sigma;

  for (const wavelength of GABOR_WAVELENGTHS) {
    const freq = (2 * Math.PI) / wavelength;
    for (const theta of GABOR_ORIENTATIONS) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const real = new Float64Array(size * size);
      const imag = new Float64Array(size * size);
      let envSum = 0;
      let realSum = 0;

      let k = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const u = dx * cosT + dy * sinT;
          const env = Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
          const rVal = env * Math.cos(freq * u);
          const iVal = env * Math.sin(freq * u);
          real[k] = rVal;
          imag[k] = iVal;
          envSum += env;
          realSum += rVal;
          k++;
        }
      }

      // Subtract DC component from the even (cosine) filter and normalize L1 envelope
      const dcOffset = realSum / (size * size);
      for (let i = 0; i < real.length; i++) {
        real[i] = (real[i] - dcOffset) / envSum;
        imag[i] = imag[i] / envSum;
      }

      bank.push({ radius, size, real, imag });
    }
  }

  cachedGaborBank = bank;
  return bank;
}

/**
 * Compute Complex Wavelet SSIM (CW-SSIM, Sampat et al., 2009) within `rect`.
 *
 * Uses quadrature Gabor filter responses across 4 orientations (0, π/4, π/2, 3π/4).
 * Because a small rigid spatial translation shifts all local wavelet coefficients by a
 * coherent phase Δφ, taking the magnitude of the complex inner product `|∑ c1 * conj(c2)|`
 * cancels the constant phase shift while penalizing unstructured noise and structural changes.
 */
function computeCWSSIMInRect(
  png1: PNG,
  png2: PNG,
  rect: BoundingBox,
): number {
  const { x: rx, y: ry, width: rw, height: rh } = rect;
  const total = rw * rh;
  if (total === 0) return 0;

  const lum1 = new Float64Array(total);
  const lum2 = new Float64Array(total);

  let idx = 0;
  for (let dy = 0; dy < rh; dy++) {
    const row = (ry + dy) * png1.width;
    for (let dx = 0; dx < rw; dx++) {
      const pIdx = (row + (rx + dx)) << 2;
      lum1[idx] =
        0.2126 * png1.data[pIdx] +
        0.7152 * png1.data[pIdx + 1] +
        0.0722 * png1.data[pIdx + 2];
      lum2[idx] =
        0.2126 * png2.data[pIdx] +
        0.7152 * png2.data[pIdx + 1] +
        0.0722 * png2.data[pIdx + 2];
      idx++;
    }
  }

  const bank = getGaborBank();
  const windowSize = Math.min(8, rw, rh);
  const xs = buildWindowStarts(rw, windowSize);
  const ys = buildWindowStarts(rh, windowSize);
  const K = 1e-4;

  let weightedCwSum = 0;
  let totalWeight = 0;

  const re1 = new Float64Array(total);
  const im1 = new Float64Array(total);
  const re2 = new Float64Array(total);
  const im2 = new Float64Array(total);

  for (const kernel of bank) {
    convolveGabor(lum1, rw, rh, kernel, re1, im1);
    convolveGabor(lum2, rw, rh, kernel, re2, im2);

    for (const wy of ys) {
      for (const wx of xs) {
        let crossRe = 0;
        let crossIm = 0;
        let energy1 = 0;
        let energy2 = 0;

        for (let dy = 0; dy < windowSize; dy++) {
          const rowOff = (wy + dy) * rw + wx;
          for (let dx = 0; dx < windowSize; dx++) {
            const p = rowOff + dx;
            const r1 = re1[p];
            const i1 = im1[p];
            const r2 = re2[p];
            const i2 = im2[p];

            // c1 * conj(c2) = (r1 + j*i1)*(r2 - j*i2) = (r1*r2 + i1*i2) + j*(i1*r2 - r1*i2)
            crossRe += r1 * r2 + i1 * i2;
            crossIm += i1 * r2 - r1 * i2;
            energy1 += r1 * r1 + i1 * i1;
            energy2 += r2 * r2 + i2 * i2;
          }
        }

        const totalEnergy = energy1 + energy2;
        if (totalEnergy > 1e-3) {
          const crossMag = Math.sqrt(crossRe * crossRe + crossIm * crossIm);
          const cwScore = (2 * crossMag + K) / (totalEnergy + K);
          weightedCwSum += cwScore * totalEnergy;
          totalWeight += totalEnergy;
        }
      }
    }
  }

  if (totalWeight <= 1e-3) {
    // Both patches are flat (no wavelet edge energy); fall back to luminance SSIM
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    const b1 = Array.from(lum1);
    const b2 = Array.from(lum2);
    return Math.max(0, Math.min(1, computeBlockChannelSSIM(b1, b2, C1, C2).ssim));
  }

  return Math.max(0, Math.min(1, weightedCwSum / totalWeight));
}

/**
 * Convolve a 2D patch with a complex Gabor kernel using clamped replicate borders.
 */
function convolveGabor(
  src: Float64Array,
  width: number,
  height: number,
  kernel: GaborKernel2D,
  outRe: Float64Array,
  outIm: Float64Array,
): void {
  const { radius, real, imag } = kernel;
  let outIdx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumRe = 0;
      let sumIm = 0;
      let k = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = Math.max(0, Math.min(height - 1, y + dy)) * width;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const val = src[sy + sx];
          sumRe += val * real[k];
          sumIm += val * imag[k];
          k++;
        }
      }
      outRe[outIdx] = sumRe;
      outIm[outIdx] = sumIm;
      outIdx++;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
