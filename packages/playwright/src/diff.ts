import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { compareDiffToThreshold } from '../../cli/src/diff/threshold.js';
import { computeRegionSimilarity } from '../../cli/src/diff/ssim.js';
import type { CompareResult, PlaywrightDiffCluster } from './types.js';

export interface ClusterExtractionOptions {
  /** Horizontal dilation radius in pixels to bridge character kerning (default: 8). */
  dilateRadiusX?: number;
  /** Vertical dilation radius in pixels to bridge line spacing (default: 4). */
  dilateRadiusY?: number;
  /** Minimum raw diff pixels required to retain a cluster (default: 4). */
  minPixels?: number;
  /** Proximity margin in pixels for merging overlapping/adjacent AABBs (default: 8). */
  mergeMargin?: number;
  /** Maximum number of clusters to return, sorted by rawDiffPixels descending (default: 8). */
  maxClusters?: number;
}

interface RawClusterAccum {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rawDiffPixels: number;
}

const MAX_PREMERGE_COMPONENTS = 2048;
const MAX_MERGE_SWEEPS = 16;

/**
 * Non-cubic AABB proximity merge using sort-by-minX sweep + Union-Find.
 * Each sweep is O(K log K + overlaps) rather than O(K^3) splice restarts.
 */
function mergeProximateBoxes(boxes: RawClusterAccum[], mergeMargin: number): RawClusterAccum[] {
  let list = boxes;
  if (list.length > MAX_PREMERGE_COMPONENTS) {
    list = [...list]
      .sort((a, b) => b.rawDiffPixels - a.rawDiffPixels)
      .slice(0, MAX_PREMERGE_COMPONENTS);
  }

  for (let sweep = 0; sweep < MAX_MERGE_SWEEPS && list.length > 1; sweep++) {
    list.sort((a, b) => (a.minX !== b.minX ? a.minX - b.minX : a.minY - b.minY));
    const n = list.length;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    const find = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      let c = x;
      while (c !== r) {
        const next = parent[c];
        parent[c] = r;
        c = next;
      }
      return r;
    };

    const union = (a: number, b: number): boolean => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
      return true;
    };

    let anyMerged = false;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const limitX = a.maxX + mergeMargin;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (b.minX > limitX) break; // Sorted by minX: no later box can overlap in X.
        if (a.minY - mergeMargin <= b.maxY && a.maxY + mergeMargin >= b.minY) {
          if (union(i, j)) anyMerged = true;
        }
      }
    }

    if (!anyMerged) break;

    const mergedMap = new Map<number, RawClusterAccum>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const item = list[i];
      const acc = mergedMap.get(root);
      if (!acc) {
        mergedMap.set(root, { ...item });
      } else {
        if (item.minX < acc.minX) acc.minX = item.minX;
        if (item.minY < acc.minY) acc.minY = item.minY;
        if (item.maxX > acc.maxX) acc.maxX = item.maxX;
        if (item.maxY > acc.maxY) acc.maxY = item.maxY;
        acc.rawDiffPixels += item.rawDiffPixels;
      }
    }
    list = Array.from(mergedMap.values());
  }

  return list;
}

/**
 * Extract connected-component spatial clusters from a binary diff mask using
 * CLI-parity separable O(W × H) box dilation, 8-connected Union-Find labeling,
 * micro-speck filtering (`minPixels`), non-cubic sweep-line proximity merging,
 * and `maxClusters` capping.
 */
export function extractDiffClusters(
  diffMask: Uint8Array,
  width: number,
  height: number,
  optionsOrMergeRadius?: number | ClusterExtractionOptions,
): PlaywrightDiffCluster[] {
  if (width <= 0 || height <= 0 || diffMask.length < width * height) {
    return [];
  }

  const opts: ClusterExtractionOptions =
    typeof optionsOrMergeRadius === 'number'
      ? { mergeMargin: optionsOrMergeRadius }
      : (optionsOrMergeRadius ?? {});

  const rx = Math.max(0, Math.floor(opts.dilateRadiusX ?? 8));
  const ry = Math.max(0, Math.floor(opts.dilateRadiusY ?? 4));
  const minPixels = Math.max(1, Math.floor(opts.minPixels ?? 4));
  const mergeMargin = Math.max(0, Math.floor(opts.mergeMargin ?? 8));
  const maxClusters = Math.max(1, Math.floor(opts.maxClusters ?? 8));

  const total = width * height;
  let hasAnyDiff = false;
  for (let i = 0; i < total; i++) {
    if (diffMask[i] !== 0) {
      hasAnyDiff = true;
      break;
    }
  }
  if (!hasAnyDiff) return [];

  // Step 1: Separable O(W × H) box dilation
  const horiz = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let windowSum = 0;
    const initEnd = Math.min(width - 1, rx);
    for (let x = 0; x <= initEnd; x++) {
      if (diffMask[rowOffset + x] !== 0) windowSum++;
    }
    for (let x = 0; x < width; x++) {
      if (windowSum > 0) horiz[rowOffset + x] = 1;
      const outX = x - rx;
      if (outX >= 0 && diffMask[rowOffset + outX] !== 0) windowSum--;
      const inX = x + rx + 1;
      if (inX < width && diffMask[rowOffset + inX] !== 0) windowSum++;
    }
  }

  const dilated = new Uint8Array(total);
  for (let x = 0; x < width; x++) {
    let windowSum = 0;
    const initEnd = Math.min(height - 1, ry);
    for (let y = 0; y <= initEnd; y++) {
      if (horiz[y * width + x] !== 0) windowSum++;
    }
    for (let y = 0; y < height; y++) {
      if (windowSum > 0) dilated[y * width + x] = 1;
      const outY = y - ry;
      if (outY >= 0 && horiz[outY * width + x] !== 0) windowSum--;
      const inY = y + ry + 1;
      if (inY < height && horiz[inY * width + x] !== 0) windowSum++;
    }
  }

  // Step 2: Two-pass 8-connected Union-Find labeling
  const labels = new Int32Array(total);
  const parent: number[] = [0]; // 1-indexed labels

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
  };

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (dilated[idx] === 0) continue;

      let minLabel = 0;
      const n0 = x > 0 ? labels[idx - 1] : 0;
      const n1 = y > 0 && x > 0 ? labels[prevRowOffset + x - 1] : 0;
      const n2 = y > 0 ? labels[prevRowOffset + x] : 0;
      const n3 = y > 0 && x + 1 < width ? labels[prevRowOffset + x + 1] : 0;

      if (n0 > 0) minLabel = find(n0);
      if (n1 > 0) {
        const r1 = find(n1);
        minLabel = minLabel === 0 ? r1 : Math.min(minLabel, r1);
      }
      if (n2 > 0) {
        const r2 = find(n2);
        minLabel = minLabel === 0 ? r2 : Math.min(minLabel, r2);
      }
      if (n3 > 0) {
        const r3 = find(n3);
        minLabel = minLabel === 0 ? r3 : Math.min(minLabel, r3);
      }

      if (minLabel === 0) {
        const newLabel = parent.length;
        parent.push(newLabel);
        labels[idx] = newLabel;
      } else {
        labels[idx] = minLabel;
        if (n0 > 0) union(minLabel, n0);
        if (n1 > 0) union(minLabel, n1);
        if (n2 > 0) union(minLabel, n2);
        if (n3 > 0) union(minLabel, n3);
      }
    }
  }

  // Step 3: Accumulate tight raw-diff bounding boxes and filter micro-specks
  const accumMap = new Map<number, RawClusterAccum>();
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (diffMask[idx] === 0) continue;
      const root = find(labels[idx]);
      if (root === 0) continue;
      let acc = accumMap.get(root);
      if (!acc) {
        acc = { minX: x, minY: y, maxX: x, maxY: y, rawDiffPixels: 0 };
        accumMap.set(root, acc);
      } else {
        if (x < acc.minX) acc.minX = x;
        if (y < acc.minY) acc.minY = y;
        if (x > acc.maxX) acc.maxX = x;
        if (y > acc.maxY) acc.maxY = y;
      }
      acc.rawDiffPixels++;
    }
  }

  const filtered = Array.from(accumMap.values()).filter((c) => c.rawDiffPixels >= minPixels);
  if (filtered.length === 0) return [];

  // Step 4: Non-cubic sweep-line AABB proximity merging
  let merged = mergeProximateBoxes(filtered, mergeMargin);

  merged.sort((a, b) => {
    if (b.rawDiffPixels !== a.rawDiffPixels) return b.rawDiffPixels - a.rawDiffPixels;
    if (a.minY !== b.minY) return a.minY - b.minY;
    return a.minX - b.minX;
  });

  if (merged.length > maxClusters) {
    merged = merged.slice(0, maxClusters);
  }

  return merged.map((c, idx) => ({
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
 * Compare two PNG buffers and return diff results reconciled with `@frontguard/cli`:
 * - Byte-identical fast path (unless `FRONTGUARD_DISABLE_BYTE_COMPARE=1`)
 * - `compareDiffToThreshold` float-epsilon parity
 * - 16×16 localized window guard (`windowMax > 64`)
 * - BT.709 SSIM + borderline SSIM override with localized chromaSSIM anti-dilution guard
 * - CLI-parity dilated/capped/non-cubic diff clustering
 */
export function compareImages(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  threshold: number,
): CompareResult {
  // Fast path: byte-identical PNG buffers skip decode, pixelmatch, and SSIM
  if (
    process.env.FRONTGUARD_DISABLE_BYTE_COMPARE !== '1' &&
    Buffer.compare(baselineBuffer, currentBuffer) === 0
  ) {
    return {
      passed: true,
      diffPercentage: 0,
      windowMax: 0,
      diffBuffer: null,
      ssim: 1,
      clusters: [],
    };
  }

  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  // Handle size mismatch — resize canvas to max dimensions
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);

  const baselinePng = padPng(baseline, width, height);
  const currentPng = padPng(current, width, height);
  const baselineData = baselinePng.data as unknown as Buffer;
  const currentData = currentPng.data as unknown as Buffer;

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
  const diffPct100 = diffPercentage * 100;
  let passed = compareDiffToThreshold(diffPct100, threshold) <= 0 && windowMax <= 64;

  let diffBuffer: Buffer | null = null;
  let clusters: PlaywrightDiffCluster[] = [];
  let ssim = 1;
  let ssimOverride: boolean | undefined;

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

    ssim = computeSSIM(baselineData, currentData, width, height);

    // CLI-parity SSIM override for borderline diffs (< 2x threshold, no severe localized cluster)
    const isBorderline =
      !passed &&
      windowMax <= 64 &&
      compareDiffToThreshold(diffPct100, threshold * 2) < 0 &&
      baseline.width === current.width &&
      baseline.height === current.height;

    if (isBorderline && ssim > 0.98) {
      let hasSevereLocalizedChange = false;
      for (const cluster of clusters) {
        const area = cluster.bbox.width * cluster.bbox.height;
        const density = area > 0 ? cluster.rawDiffPixels / area : 0;
        if (cluster.rawDiffPixels >= 32 && density >= 0.5 && totalPixels >= 10_000 && area <= 65_536) {
          const metrics = computeRegionSimilarity(baselinePng, currentPng, cluster.bbox);
          if (metrics.chromaSSIM < 0.70) {
            hasSevereLocalizedChange = true;
            break;
          }
        }
      }
      if (!hasSevereLocalizedChange) {
        passed = true;
        ssimOverride = true;
      }
    }
  }

  return {
    passed,
    diffPercentage,
    windowMax,
    diffBuffer,
    ssim,
    ...(ssimOverride ? { ssimOverride } : {}),
    clusters,
  };
}

/**
 * Pad an image to the given dimensions with transparent pixels.
 */
function padPng(png: PNG, targetWidth: number, targetHeight: number): PNG {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png;
  }

  const padded = new PNG({ width: targetWidth, height: targetHeight, fill: true });
  for (let y = 0; y < png.height; y++) {
    const srcOffset = y * png.width * 4;
    const dstOffset = y * targetWidth * 4;
    png.data.copy(padded.data, dstOffset, srcOffset, srcOffset + png.width * 4);
  }
  return padded;
}

/**
 * Compute Structural Similarity Index (SSIM) between two RGBA images using
 * ITU-R BT.709 luminance (matching `@frontguard/cli`).
 * Returns a value between 0 and 1, where 1 = identical.
 */
export function computeSSIM(
  img1: Buffer | Uint8Array,
  img2: Buffer | Uint8Array,
  width: number,
  height: number,
): number {
  const L = 255;
  const k1 = 0.01;
  const k2 = 0.03;
  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  // Use 8x8 sliding window
  const windowSize = 8;
  if (width < windowSize || height < windowSize) {
    return simpleSSIM(img1, img2);
  }

  let ssimSum = 0;
  let windowCount = 0;

  for (let y = 0; y <= height - windowSize; y += windowSize) {
    for (let x = 0; x <= width - windowSize; x += windowSize) {
      const { mean: mean1, variance: var1, pixels: px1 } = windowStats(img1, width, x, y, windowSize);
      const { mean: mean2, variance: var2, pixels: px2 } = windowStats(img2, width, x, y, windowSize);

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
 * Compute window statistics for SSIM using ITU-R BT.709 luminance.
 */
function windowStats(
  img: Buffer | Uint8Array,
  imgWidth: number,
  startX: number,
  startY: number,
  windowSize: number,
): { mean: number; variance: number; pixels: number[] } {
  const pixels: number[] = [];

  for (let dy = 0; dy < windowSize; dy++) {
    for (let dx = 0; dx < windowSize; dx++) {
      const idx = ((startY + dy) * imgWidth + (startX + dx)) * 4;
      // ITU-R BT.709 luminance (matches @frontguard/cli)
      const lum = 0.2126 * img[idx] + 0.7152 * img[idx + 1] + 0.0722 * img[idx + 2];
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
