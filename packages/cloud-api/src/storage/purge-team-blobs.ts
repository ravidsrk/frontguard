/**
 * R2 blob purge for team and project deletion (DM-2).
 *
 * Enumerates every run under a project (or team's projects) in paginated chunks
 * so no screenshot/attachment/CAS prefix is orphaned when a project has more
 * runs than a single query page.
 *
 * @module storage/purge-team-blobs
 */

import type { Store } from '../db/store.js';
import { MAX_LIST_LIMIT } from '../limits.js';
import { deleteCasMemoryPrefix } from './cas-memory.js';
import { getScreenshotStore, type R2Bucket } from './screenshots.js';

/** Default page size when purging team/project run blobs in production. */
export const DEFAULT_TEAM_RUN_PURGE_PAGE_SIZE = MAX_LIST_LIMIT;

/**
 * Best-effort purge of R2 screenshot/attachment blobs for every run scoped to
 * one project. Must run before {@link Store.deleteProject} while run rows still
 * exist so owners and attachment keys can be resolved.
 */
export async function purgeProjectRunBlobs(
  store: Store,
  projectId: string,
  bucket: R2Bucket | undefined,
  pageSize = DEFAULT_TEAM_RUN_PURGE_PAGE_SIZE,
): Promise<void> {
  const blobs = getScreenshotStore(bucket);
  const effectivePageSize = Math.max(1, Math.min(pageSize, MAX_LIST_LIMIT));
  let offset = 0;
  for (;;) {
    const runs = await store.listProjectRuns(projectId, effectivePageSize, offset);
    for (const run of runs) {
      const ownerId = await store.getRunOwner(run.id);
      if (ownerId) {
        try {
          await blobs.deleteRun(ownerId, run.id);
        } catch {
          /* non-fatal */
        }
      }
      // Also remove any attachments uploaded by another team member onto this run.
      try {
        const attachments = await store.listAttachments(run.id);
        for (const att of attachments) {
          await blobs.delete(att.r2Key);
        }
      } catch {
        /* non-fatal */
      }
    }
    if (runs.length < effectivePageSize) break;
    offset += runs.length;
  }
}

/**
 * Best-effort purge of R2 screenshot/attachment/CAS blobs for every run scoped
 * to a team's projects. Must run before {@link Store.deleteTeam} while run rows
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
    await purgeProjectRunBlobs(store, project.id, bucket, pageSize);
  }
  try {
    await blobs.deletePrefix(`cas/${teamId}/`);
  } catch {
    /* non-fatal */
  }
  deleteCasMemoryPrefix(`cas/${teamId}/`);
}
