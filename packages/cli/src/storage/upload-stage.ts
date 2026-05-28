/**
 * Pipeline upload stage — uploads screenshot images and annotates diffs with
 * public URLs for PR comment thumbnails.
 *
 * Runs between the build-result and report stages. Only diffs that have image
 * buffers and are interesting (regression / changed / new) are uploaded, to
 * avoid wasting bandwidth on passing pages.
 *
 * @module storage/upload-stage
 */

import type { FrontguardConfig, DiffResult } from '../core/types.js';
import { createUploader, buildImageKey } from './image-upload.js';
import { logger } from '../utils/logger.js';

/** Statuses worth uploading images for (skip clean passes). */
const UPLOAD_STATUSES = new Set<DiffResult['status']>([
  'regression',
  'changed',
  'new',
  'flaky',
]);

/**
 * Uploads baseline/current/diff images for interesting diffs and sets the
 * `*ImageUrl` fields on each diff in place.
 *
 * Fails soft: an upload error for one image is logged and skipped; the run
 * continues with whatever URLs succeeded.
 *
 * @param diffs  - The diff results (mutated in place with image URLs).
 * @param config - The run configuration (must have `imageUpload`).
 * @param runId  - Unique identifier for this run (used in object keys).
 * @returns The number of images uploaded.
 */
export async function uploadImages(
  diffs: DiffResult[],
  config: FrontguardConfig,
  runId: string,
): Promise<number> {
  if (!config.imageUpload) return 0;

  const project = config.imageUpload.project ?? 'frontguard';
  const uploader = createUploader(config.imageUpload, config.outputDir);

  let uploaded = 0;

  for (const diff of diffs) {
    if (!UPLOAD_STATUSES.has(diff.status)) continue;

    const base = {
      project,
      runId,
      route: diff.route.path,
      viewport: diff.viewport,
      browser: diff.browser,
    };

    const jobs: Array<{
      type: 'baseline' | 'current' | 'diff';
      buffer: Buffer | undefined;
      set: (url: string) => void;
    }> = [
      { type: 'baseline', buffer: diff.baselineImage, set: (u) => (diff.baselineImageUrl = u) },
      { type: 'current', buffer: diff.currentImage, set: (u) => (diff.currentImageUrl = u) },
      { type: 'diff', buffer: diff.diffImage, set: (u) => (diff.diffImageUrl = u) },
    ];

    for (const job of jobs) {
      if (!job.buffer) continue;
      try {
        const key = buildImageKey({ ...base, type: job.type });
        const url = await uploader.upload(key, job.buffer, 'image/png');
        job.set(url);
        uploaded++;
      } catch (err) {
        logger.warn(
          `Image upload failed for ${diff.route.path} (${job.type}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  return uploaded;
}
