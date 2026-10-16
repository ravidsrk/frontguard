/**
 * Deterministic Frame Convergence & Motion Attribution Engine.
 *
 * Ensures that screenshots are captured only after the page has visually
 * settled (two consecutive frames match within subpixel tolerance). When a
 * page fails to settle within the retry budget (e.g. an unmasked spinner,
 * carousel, or canvas animation), extracts spatial `DiffCluster` bounding
 * boxes pinpointing the exact unstable UI regions.
 *
 * @module render/stability
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { extractDiffClusters, type DiffCluster } from '../diff/regions.js';

export interface StabilityOptions {
  /** Maximum number of frames to capture while waiting for convergence (default: 4, min: 2). */
  maxAttempts?: number;
  /** Delay in milliseconds between consecutive frame captures (default: 120). */
  intervalMs?: number;
  /** Per-pixel YIQ color threshold (0–1) passed to pixelmatch (default: 0.1). */
  pixelThreshold?: number;
  /** Maximum fraction of pixels (0–1) allowed to differ between two consecutive frames (default: 0.0005 = 0.05%). */
  maxUnstableRatio?: number;
}

export interface FrameConvergenceComparison {
  /** Whether the two frames converged within tolerance. */
  settled: boolean;
  /** Number of pixels that differed between the two frames. */
  unstablePixels: number;
  /** Fraction of total pixels (0–1) that differed between the two frames. */
  unstableRatio: number;
  /** Spatial bounding-box clusters of moving/unstable UI regions when not settled. */
  motionClusters: DiffCluster[];
}

export interface StabilityResult extends FrameConvergenceComparison {
  /** Total number of frames captured during the stability check. */
  attempts: number;
  /** The final (or converged) PNG screenshot buffer. */
  buffer: Buffer;
}

/**
 * Compares two consecutive PNG frames to determine whether the viewport has
 * visually stabilized, and attributes any residual motion to spatial bounding
 * box clusters.
 */
export function compareConsecutiveFrames(
  previousBuffer: Buffer,
  currentBuffer: Buffer,
  options: Pick<StabilityOptions, 'pixelThreshold' | 'maxUnstableRatio'> = {},
): FrameConvergenceComparison {
  const pixelThreshold = options.pixelThreshold ?? 0.1;
  const maxUnstableRatio = options.maxUnstableRatio ?? 0.0005;

  // Fast path: byte-identical PNG buffers
  if (previousBuffer.equals(currentBuffer)) {
    return {
      settled: true,
      unstablePixels: 0,
      unstableRatio: 0,
      motionClusters: [],
    };
  }

  let prevPng: PNG;
  let currPng: PNG;
  try {
    prevPng = PNG.sync.read(previousBuffer);
    currPng = PNG.sync.read(currentBuffer);
  } catch {
    // Non-PNG buffers (e.g., synthetic mock buffers in unit tests) fall back to byte comparison
    return {
      settled: false,
      unstablePixels: 1,
      unstableRatio: 1,
      motionClusters: [],
    };
  }

  // If document dimensions are still changing (e.g. lazy layout expansion), it has not settled
  if (prevPng.width !== currPng.width || prevPng.height !== currPng.height) {
    const maxW = Math.max(prevPng.width, currPng.width);
    const maxH = Math.max(prevPng.height, currPng.height);
    return {
      settled: false,
      unstablePixels: maxW * maxH,
      unstableRatio: 1,
      motionClusters: [
        {
          id: 1,
          bbox: { x: 0, y: 0, width: maxW, height: maxH },
          rawDiffPixels: maxW * maxH,
          density: 1,
          perimeterRatio: 0,
        },
      ],
    };
  }

  const { width, height } = currPng;
  const totalPixels = width * height;
  if (totalPixels === 0) {
    return {
      settled: true,
      unstablePixels: 0,
      unstableRatio: 0,
      motionClusters: [],
    };
  }

  const diffOut = new Uint8Array(totalPixels * 4);
  const unstablePixels = pixelmatch(
    prevPng.data,
    currPng.data,
    diffOut,
    width,
    height,
    { threshold: pixelThreshold, includeAA: false },
  );

  const unstableRatio = unstablePixels / totalPixels;
  if (unstableRatio <= maxUnstableRatio) {
    return {
      settled: true,
      unstablePixels,
      unstableRatio,
      motionClusters: [],
    };
  }

  // Build binary mask of pixels that moved between frames to localize unstable UI components
  const diffMask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (diffOut[idx] === 255 && diffOut[idx + 1] === 0 && diffOut[idx + 2] === 0) {
      diffMask[i] = 1;
    }
  }

  const motionClusters = extractDiffClusters(diffMask, width, height);
  return {
    settled: false,
    unstablePixels,
    unstableRatio,
    motionClusters,
  };
}

/**
 * Polls `captureFrame` until two consecutive captures converge within
 * `maxUnstableRatio`, or `maxAttempts` is exhausted.
 */
export async function captureStableScreenshot(
  captureFrame: () => Promise<Buffer>,
  wait: (ms: number) => Promise<void>,
  options: StabilityOptions = {},
): Promise<StabilityResult> {
  const maxAttempts = Math.max(2, options.maxAttempts ?? 4);
  const intervalMs = Math.max(0, options.intervalMs ?? 120);

  let previous = await captureFrame();
  let attempts = 1;
  let lastComparison: FrameConvergenceComparison = {
    settled: false,
    unstablePixels: 0,
    unstableRatio: 0,
    motionClusters: [],
  };

  while (attempts < maxAttempts) {
    if (intervalMs > 0) {
      await wait(intervalMs);
    }
    const current = await captureFrame();
    attempts += 1;

    lastComparison = compareConsecutiveFrames(previous, current, options);
    if (lastComparison.settled) {
      return {
        settled: true,
        attempts,
        buffer: current,
        unstablePixels: lastComparison.unstablePixels,
        unstableRatio: lastComparison.unstableRatio,
        motionClusters: [],
      };
    }

    previous = current;
  }

  return {
    settled: false,
    attempts,
    buffer: previous,
    unstablePixels: lastComparison.unstablePixels,
    unstableRatio: lastComparison.unstableRatio,
    motionClusters: lastComparison.motionClusters,
  };
}
