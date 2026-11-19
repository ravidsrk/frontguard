/**
 * Safe PNG signature and IHDR dimension validation before pngjs decoding.
 *
 * Prevents decompression bombs / OOM allocations from malformed PNGs with
 * huge declared IHDR dimensions (e.g. 65535×65535).
 */

import { PNG } from 'pngjs';

export const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_PNG_DIMENSION = 50_000;
export const MAX_PNG_PIXELS = 100_000_000;

/** Returns true when `buffer` starts with the 8-byte PNG signature. */
export function hasPngMagicBytes(buffer: Buffer): boolean {
  return Buffer.isBuffer(buffer) && buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Validates PNG magic bytes and IHDR width/height bounds without allocating
 * pixel memory. Throws on invalid headers or out-of-bounds dimensions.
 */
export function assertSafePngBounds(buffer: Buffer): { width: number; height: number } {
  if (!hasPngMagicBytes(buffer)) {
    throw new Error('Invalid PNG signature');
  }
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Invalid PNG: missing IHDR header');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1) {
    throw new Error(`Invalid PNG dimensions: ${width}×${height}`);
  }
  if (width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION || width * height > MAX_PNG_PIXELS) {
    throw new Error(
      `PNG dimensions ${width}×${height} exceed safe limits (max ${MAX_PNG_DIMENSION}px per side, ${MAX_PNG_PIXELS} pixels)`,
    );
  }
  return { width, height };
}

/** Safely reads a PNG buffer synchronously after validating IHDR bounds. */
export function readPngSafe(buffer: Buffer): PNG {
  assertSafePngBounds(buffer);
  return PNG.sync.read(buffer);
}
