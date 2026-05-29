/**
 * Shared PNG cropping helper.
 *
 * Both the main renderer and the fix-verification sandboxes must crop captured
 * screenshots identically (to `config.maxHeight`). Keeping a single
 * implementation here ensures the baseline and after-fix buffers share the same
 * dimensions, so the pixel diff is meaningful instead of failing on a size
 * mismatch.
 *
 * @module render/crop
 */

import { PNG } from 'pngjs';
import { logger } from '../utils/logger.js';

/**
 * Crop a PNG buffer to a maximum height, preserving width.
 * If the image is shorter than or equal to maxHeight it is returned unchanged.
 * If the buffer can't be parsed, the original is returned rather than throwing.
 */
export async function cropToMaxHeight(buffer: Buffer, maxHeight: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (err, parsed) => {
      if (err) {
        logger.warn(`Could not parse PNG for cropping: ${err.message}`);
        resolve(buffer);
        return;
      }

      if (parsed.height <= maxHeight) {
        resolve(buffer);
        return;
      }

      const cropped = new PNG({ width: parsed.width, height: maxHeight });
      const bytesPerRow = parsed.width * 4;

      for (let y = 0; y < maxHeight; y++) {
        parsed.data.copy(
          cropped.data,
          y * bytesPerRow,
          y * bytesPerRow,
          (y + 1) * bytesPerRow,
        );
      }

      const chunks: Uint8Array[] = [];
      const stream = cropped.pack();
      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks) as Buffer));
      stream.on('error', reject);
    });
  });
}
