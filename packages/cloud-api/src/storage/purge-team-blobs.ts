/**
 * R2 blob purge for team deletion (DM-2).
 *
 * Enumerates every run under the team's projects in paginated chunks so no
 * screenshot/attachment prefix is orphaned when a project has more runs than
 * a single query page.
 *
 * @module storage/purge-team-blobs
 */

import type { Store } from '../db/store.js';
import { getScreenshotStore, type R2Bucket } from './screenshots.js';

/** Default page size when purging team run blobs in production. */
export const DEFAULT_TEAM_RUN_PURGE_PAGE_SIZE = 500;

/**
 * Best-effort purge of R2 screenshot/attachment blobs for every run scoped to a
 * team's projects. Must run before {@link Store.deleteTeam} while run rows
 * still exist so owners can be resolved.
 */
export async function purgeTeamRunBlobs(
  store: Store,
  teamId: string,
  bucket: R2Bucket | undefined,
  pageSize = DEFAULT_TEAM_RUN_PURGE_PAGE_SIZE,
): Promise<void> {
  const blobs = getScreenshotStore(bucket);
  const projects = await store.listProjects(teamId);
  for (const project of projects) {
    let offset = 0;
    for (;;) {
      const runs = await store.listProjectRuns(project.id, pageSize, offset);
      for (const run of runs) {
        const ownerId = await store.getRunOwner(run.id);
        if (!ownerId) continue;
        try {
          await blobs.deleteRun(ownerId, run.id);
        } catch {
          /* non-fatal */
        }
      }
      if (runs.length < pageSize) break;
      offset += runs.length;
    }
  }
}