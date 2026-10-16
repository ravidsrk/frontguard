import type { Store } from '../db/store.js';

/**
 * Returns true when `userId` owns `runId` directly OR is a member of the team
 * that owns `run.projectId`.
 */
export async function isRunAccessibleByUser(
  store: Store,
  runId: string,
  userId: string,
): Promise<boolean> {
  if ((await store.getRunOwner(runId)) === userId) {
    return true;
  }
  const run = await store.getRun(runId);
  if (run?.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (member) return true;
    }
  }
  return false;
}
