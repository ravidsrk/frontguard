/**
 * Pixel-level screenshot comparison engine for Frontguard.
 *
 * Uses pixelmatch for perceptual diffing and pngjs for PNG encode/decode.
 * Handles dimension mismatches, corrupt buffers, and identical-image fast paths.
 *
 * ## Environment variables
 *
 * - `FRONTGUARD_DISABLE_BYTE_COMPARE=1` — opt-in escape hatch that skips the
 *   byte-identical fast path so every comparison runs through the full
 *   pixelmatch / SSIM pipeline. Used by the validation harness to measure the
 *   diff engine against Chromium's own PNG-encoder noise (an honest
 *   false-positive number) instead of short-circuiting on byte equality.
 *   Off by default; customer runs keep the fast path. See `validation/results-v0.2.md`.
 *
 * @module diff/pixel
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { PIXELMATCH_OPTIONS } from '../core/fingerprint.js';
import { compareDiffToThreshold } from './threshold.js';
import type { ScreenshotResult, DiffResult, DiffCluster } from '../core/types.js';
import { computeSSIM, computeRegionSimilarity } from './ssim.js';
import { extractDiffClusters, attributeClustersToDom } from './regions.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options controlling SSIM fallback behaviour. */
export interface SSIMOptions {
  /** Whether SSIM fallback is enabled (default: true). */
  enabled?: boolean;
  /** SSIM threshold — scores above this are considered perceptually identical (default: 0.98). */
  ssimThreshold?: number;
}

/**
 * Compare a current screenshot against its baseline image.
 *
 * Byte-identical buffers short-circuit to a zero-diff `pass` unless
 * `FRONTGUARD_DISABLE_BYTE_COMPARE=1` is set in the environment, in which case
 * even byte-identical images are decoded and run through pixelmatch (used by the
 * validation harness — see the module-level docs and `validation/results-v0.2.md`).
 *
 * @param current      - The freshly captured screenshot
 * @param baseline     - Raw PNG buffer of the baseline image
 * @param threshold    - Diff threshold (0–1); fraction of pixels that may differ before flagging
 * @param ssimOptions  - Optional SSIM fallback configuration
 * @returns A fully populated DiffResult
 */
export function compareScreenshot(
  current: ScreenshotResult,
  baseline: Buffer,
  threshold: number,
  ssimOptions?: SSIMOptions,
): DiffResult {
  // --- Guard: empty buffers --------------------------------------------------
  if (!baseline || baseline.length === 0) {
    return errorResult(current, 'Baseline image is empty (zero bytes).');
  }
  if (!current.buffer || current.buffer.length === 0) {
    return errorResult(current, 'Current screenshot buffer is empty (zero bytes).');
  }

  const comparedAgainstBaseline = true;

  // --- Fast path: byte-identical images --------------------------------------
  // Skippable via FRONTGUARD_DISABLE_BYTE_COMPARE=1 so the validation harness can
  // force every comparison through pixelmatch and measure the diff engine against
  // Chromium's own encoder noise (val-5). Customer default leaves the fast path on.
  if (
    process.env.FRONTGUARD_DISABLE_BYTE_COMPARE !== '1' &&
    Buffer.compare(current.buffer, baseline) === 0
  ) {
    return {
      route: current.route,
      viewport: current.viewport,
      browser: current.browser,
      status: 'pass',
      diffPercentage: 0,
      diffImage: undefined,
      baselineImage: baseline,
      currentImage: current.buffer,
      comparisonMethod: 'byte-identical',
      comparedAgainstBaseline,
      ...(current.stability ? { stability: current.stability } : {}),
      ...(current.redactedCount !== undefined ? { redactedCount: current.redactedCount } : {}),
      ...(current.blockedRequestsCount !== undefined ? { blockedRequestsCount: current.blockedRequestsCount } : {}),
    };
  }

  // --- Decode PNGs -----------------------------------------------------------
  let cp: PNG;
  let bp: PNG;

  try {
    cp = PNG.sync.read(current.buffer);
  } catch (err) {
    return errorResult(
      current,
      `Failed to decode current screenshot PNG: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    bp = PNG.sync.read(baseline);
  } catch (err) {
    return errorResult(
      current,
      `Failed to decode baseline PNG: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Handle dimension mismatch ---------------------------------------------
  // Pad, then judge the padded pair with the same pixel gate.
  let noteMsg: string | undefined;

  if (
    cp.width !== bp.width ||
    cp.height !== bp.height
  ) {
    noteMsg =
      `Dimension mismatch: current=${cp.width}×${cp.height}, ` +
      `baseline=${bp.width}×${bp.height}. ` +
      `Images were padded to the larger dimensions for comparison.`;
    const maxWidth = Math.max(cp.width, bp.width);
    const maxHeight = Math.max(cp.height, bp.height);

    cp = padToSize(cp, maxWidth, maxHeight);
    bp = padToSize(bp, maxWidth, maxHeight);
  }

  // --- Run pixelmatch --------------------------------------------------------
  const { width, height } = cp;
  const totalPixels = width * height;
  const diffPng = new PNG({ width, height });

  let numDiffPixels: number;
  let wmax = 0;
  try {
    numDiffPixels = pixelmatch(
      bp.data,
      cp.data,
      diffPng.data,
      width,
      height,
      PIXELMATCH_OPTIONS,
    );
    // windowSize replaces the return value with a window max, so the percentage
    // stays on numDiffPixels from the call above. 16 and 64 are the fixtures'
    // split: a compact text edit is over 64, scattered speckle is under it.
    if (numDiffPixels > 0) {
      wmax = pixelmatch(bp.data, cp.data, null, width, height, {
        ...PIXELMATCH_OPTIONS,
        windowSize: 16,
      });
    }
  } catch (err) {
    return errorResult(
      current,
      `pixelmatch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Compute percentage & status -------------------------------------------
  const diffPercentage = totalPixels > 0 ? (numDiffPixels / totalPixels) * 100 : 0;

  // Encode the diff overlay to a PNG buffer
  const diffImage = PNG.sync.write(diffPng);

  let status: DiffResult['status'];
  if (diffPercentage === 0) {
    status = 'pass';
  } else if (wmax > 64 || compareDiffToThreshold(diffPercentage, threshold) > 0) {
    status = 'regression';
  } else {
    status = 'changed';
  }

  const result: DiffResult = {
    route: current.route,
    viewport: current.viewport,
    browser: current.browser,
    status,
    diffPercentage,
    diffImage,
    baselineImage: baseline,
    currentImage: current.buffer,
    comparisonMethod: 'pixelmatch',
    comparedAgainstBaseline,
    ...(current.stability ? { stability: current.stability } : {}),
    ...(current.redactedCount !== undefined ? { redactedCount: current.redactedCount } : {}),
    ...(current.blockedRequestsCount !== undefined ? { blockedRequestsCount: current.blockedRequestsCount } : {}),
  };
  if (wmax > 64) result.windowMax = wmax;

  if (noteMsg) {
    result.error = noteMsg;
  }

  // --- Extract connected-component diff clusters -----------------------------
  const ssimEnabled = ssimOptions?.enabled ?? true;
  const ssimThreshold = ssimOptions?.ssimThreshold ?? 0.98;

  let clusters: DiffCluster[] = [];
  if (numDiffPixels > 0) {
    const diffMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const idx = i << 2;
      // Count red diff pixels [255, 0, 0], excluding yellow [255, 255, 0] anti-aliasing pixels.
      if (
        diffPng.data[idx] === 255 &&
        diffPng.data[idx + 1] === 0 &&
        diffPng.data[idx + 2] === 0
      ) {
        diffMask[i] = 1;
      }
    }
    clusters = extractDiffClusters(diffMask, width, height);
    attributeClustersToDom(clusters, current.domElements);
    if (ssimEnabled) {
      for (const cluster of clusters) {
        if (cluster.bbox.width * cluster.bbox.height <= 65536) {
          const metrics = computeRegionSimilarity(bp, cp, cluster.bbox);
          cluster.chromaSSIM = metrics.chromaSSIM;
          cluster.cwSSIM = metrics.cwSSIM;
        }
      }
    }
    result.clusters = clusters;
  }

  // --- SSIM fallback for borderline diffs -----------------------------------
  if (
    ssimEnabled &&
    diffPercentage > 0 &&
    compareDiffToThreshold(diffPercentage, threshold * 2) < 0 // borderline zone (< 2x threshold)
  ) {
    let ssim: number | undefined;
    try {
      ssim = computeSSIM(baseline, current.buffer);
    } catch (err) {
      logger.debug(
        `SSIM computation failed for ${current.route.path} @ ${current.viewport}px — ` +
          `falling back to pixel-only result: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Localized cluster anti-dilution guard:
    // Prevent global background whitespace from masking a dense, localized UI mutation
    // (e.g. a broken button or badge on a large page) whose local chromaSSIM < 0.70.
    const hasSevereLocalizedChange = clusters.some(
      (cluster) =>
        cluster.rawDiffPixels >= 32 &&
        cluster.density >= 0.5 &&
        totalPixels >= 10000 &&
        cluster.chromaSSIM !== undefined &&
        cluster.chromaSSIM < 0.70,
    );

    if (ssim !== undefined && ssim > ssimThreshold && !hasSevereLocalizedChange) {
      logger.debug(
        `SSIM override: ${current.route.path} @ ${current.viewport}px — ` +
          `pixel diff ${diffPercentage.toFixed(2)}% but SSIM ${ssim.toFixed(4)} (perceptually identical)`,
      );
      return { ...result, status: 'pass', ssim, ssimOverride: true };
    }
    if (ssim !== undefined) {
      result.ssim = ssim;
    }
  }

  return result;
}

/**
 * Create a DiffResult for a page that has no existing baseline.
 *
 * @param current - The newly captured screenshot
 * @returns A DiffResult with status `'new'` and zero diff
 */
export function createNewPageResult(current: ScreenshotResult): DiffResult {
  return {
    route: current.route,
    viewport: current.viewport,
    browser: current.browser,
    status: 'new',
    diffPercentage: 0,
    diffImage: undefined,
    baselineImage: undefined,
    currentImage: current.buffer,
    ...(current.stability ? { stability: current.stability } : {}),
    ...(current.redactedCount !== undefined ? { redactedCount: current.redactedCount } : {}),
    ...(current.blockedRequestsCount !== undefined ? { blockedRequestsCount: current.blockedRequestsCount } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build an error DiffResult from a screenshot and a message.
 */
function errorResult(current: ScreenshotResult, message: string): DiffResult {
  return {
    route: current.route,
    viewport: current.viewport,
    browser: current.browser,
    status: 'error',
    diffPercentage: 0,
    diffImage: undefined,
    baselineImage: undefined,
    currentImage: current.buffer,
    error: message,
    ...(current.stability ? { stability: current.stability } : {}),
    ...(current.redactedCount !== undefined ? { redactedCount: current.redactedCount } : {}),
    ...(current.blockedRequestsCount !== undefined ? { blockedRequestsCount: current.blockedRequestsCount } : {}),
  };
}

/**
 * Pad (or keep) a PNG to the given dimensions.
 *
 * The original image is composited at the top-left corner; any extra
 * pixels are filled with transparent black (0, 0, 0, 0).
 */
function padToSize(src: PNG, targetWidth: number, targetHeight: number): PNG {
  if (src.width === targetWidth && src.height === targetHeight) {
    return src;
  }

  const padded = new PNG({ width: targetWidth, height: targetHeight, fill: true });
  // fill: true initialises data to 0 (transparent black)

  const srcBytesPerRow = src.width * 4;
  const dstBytesPerRow = targetWidth * 4;

  for (let y = 0; y < src.height; y++) {
    src.data.copy(
      padded.data,
      y * dstBytesPerRow,           // destination offset (start of row in padded)
      y * srcBytesPerRow,           // source start
      y * srcBytesPerRow + srcBytesPerRow, // source end
    );
  }

  return padded;
}
