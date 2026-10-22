/** Shared batching and temp-image helpers for the pipeline stages. */

import type {
  DiffResult,
} from './types.js';
import {
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** Default number of AI calls to run in parallel. */
export const AI_BATCH_SIZE = 5;

/** Number of comparisons to run in parallel. */
export const COMPARE_BATCH_SIZE = 5;

/** Number of screenshots to render in each memory-management chunk. */
export const RENDER_CHUNK_SIZE = 10;

/**
 * Dispose large image buffers on a DiffResult that is not flagged as changed.
 * Passing pages don't need their images kept in memory for reports — the
 * HTML reporter can read them lazily from a temp directory if needed.
 */
export function disposeBuffers(diff: DiffResult): void {
  diff.baselineImage = undefined;
  diff.currentImage = undefined;
  diff.diffImage = undefined;
}

/**
 * Persist an image buffer to a temp directory and return the path.
 * Returns empty string if the buffer is undefined.
 */
export function persistBufferToTemp(
  tempDir: string,
  key: string,
  buf: Buffer | undefined,
): string {
  if (!buf || buf.length === 0) return '';
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
  const filePath = join(tempDir, safeName);
  writeFileSync(filePath, buf);
  return filePath;
}

/**
 * Read an image buffer back from a temp file path.
 * Returns undefined if path is empty or the file doesn't exist.
 */
export function readTemp(filePath: string): Buffer | undefined {
  if (!filePath) return undefined;
  try {
    return readFileSync(filePath);
  } catch {
    return undefined;
  }
}

/**
 * Process items in parallel batches using Promise.allSettled.
 */
export async function processBatched<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => fn(item, i + batchIndex)),
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Measures execution time of an async function.
 * @returns Tuple of [result, durationMs]
 */
export async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round(performance.now() - start)];
}
