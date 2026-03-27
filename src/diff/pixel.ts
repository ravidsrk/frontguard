/**
 * Pixel-level screenshot comparison engine for Frontguard.
 *
 * Uses pixelmatch for perceptual diffing and pngjs for PNG encode/decode.
 * Handles dimension mismatches, corrupt buffers, and identical-image fast paths.
 *
 * @module diff/pixel
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { ScreenshotResult, DiffResult } from '../core/types.js';
import { computeSSIM } from './ssim.js';
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

  // --- Fast path: byte-identical images --------------------------------------
  if (Buffer.compare(current.buffer, baseline) === 0) {
    return {
      route: current.route,
      viewport: current.viewport,
      browser: current.browser,
      status: 'pass',
      diffPercentage: 0,
      diffImage: undefined,
      baselineImage: baseline,
      currentImage: current.buffer,
    };
  }

  // --- Decode PNGs -----------------------------------------------------------
  let currentPng: PNG;
  let baselinePng: PNG;

  try {
    currentPng = PNG.sync.read(current.buffer);
  } catch (err) {
    return errorResult(
      current,
      `Failed to decode current screenshot PNG: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    baselinePng = PNG.sync.read(baseline);
  } catch (err) {
    return errorResult(
      current,
      `Failed to decode baseline PNG: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- Handle dimension mismatch ---------------------------------------------
  let dimensionMismatch = false;
  let noteMsg: string | undefined;

  if (
    currentPng.width !== baselinePng.width ||
    currentPng.height !== baselinePng.height
  ) {
    dimensionMismatch = true;
    noteMsg =
      `Dimension mismatch: current=${currentPng.width}×${currentPng.height}, ` +
      `baseline=${baselinePng.width}×${baselinePng.height}. ` +
      `Images were padded to the larger dimensions for comparison.`;

    const maxWidth = Math.max(currentPng.width, baselinePng.width);
    const maxHeight = Math.max(currentPng.height, baselinePng.height);

    currentPng = padToSize(currentPng, maxWidth, maxHeight);
    baselinePng = padToSize(baselinePng, maxWidth, maxHeight);
  }

  // --- Run pixelmatch --------------------------------------------------------
  const { width, height } = currentPng;
  const totalPixels = width * height;
  const diffPng = new PNG({ width, height });

  let numDiffPixels: number;
  try {
    numDiffPixels = pixelmatch(
      baselinePng.data,
      currentPng.data,
      diffPng.data,
      width,
      height,
      { threshold: 0.1, includeAA: false },
    );
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

  // Determine status
  let status: DiffResult['status'];
  if (dimensionMismatch) {
    status = 'changed';
  } else if (diffPercentage === 0) {
    status = 'pass';
  } else if (diffPercentage / 100 > threshold) {
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
  };

  if (noteMsg) {
    result.error = noteMsg;
  }

  // --- SSIM fallback for borderline diffs -----------------------------------
  const ssimEnabled = ssimOptions?.enabled ?? true;
  const ssimThreshold = ssimOptions?.ssimThreshold ?? 0.98;

  if (
    ssimEnabled &&
    diffPercentage > 0 &&
    diffPercentage < threshold * 100 * 2 // borderline zone (< 2× the threshold in %)
  ) {
    const ssim = computeSSIM(baseline, current.buffer);
    if (ssim > ssimThreshold) {
      logger.debug(
        `SSIM override: ${current.route.path} @ ${current.viewport}px — ` +
          `pixel diff ${diffPercentage.toFixed(2)}% but SSIM ${ssim.toFixed(4)} (perceptually identical)`,
      );
      return { ...result, status: 'pass', ssim, ssimOverride: true };
    }
    result.ssim = ssim;
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
