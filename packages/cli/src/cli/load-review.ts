/**
 * Loads the review command from a sibling file so it stays out of the
 * published bin. A static import would be bundled into `dist/cli/index.js`.
 */
import type { reviewCli, runReview, writeReviewManifest } from './review-command.js';

export async function loadReview(): Promise<{
  reviewCli: typeof reviewCli;
  runReview: typeof runReview;
  writeReviewManifest: typeof writeReviewManifest;
}> {
  let dir = import.meta.url;
  for (let n = 0; n < 4; n++) {
    const slash = dir.lastIndexOf('/');
    if (slash <= 0) break;
    dir = dir.slice(0, slash);
    try {
      // A literal relative import is bundled. A computed directory is not.
      return await import(new URL('review-command.js', `${dir}/`).href);
    } catch {
      // Source and the published bin both resolve this name beside the entry.
    }
  }
  throw new Error('no review');
}
