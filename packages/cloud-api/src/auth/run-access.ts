import type { Store } from '../db/store.js';
import { can } from '../db/teams.js';

/**
 * Returns true when `userId` owns `runId` directly OR is a member of the team
 * that owns `run.projectId` (read access: `view`).
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
      if (member && can(member.role, 'view')) return true;
    }
  }
  return false;
}

/**
 * Returns true when `userId` owns `runId` directly OR is a member of the team
 * that owns `run.projectId` with `run_tests` capability (owner/admin/member,
 * excluding read-only `viewer`).
 */
export async function canUserMutateRun(
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
      if (member && can(member.role, 'run_tests')) return true;
    }
  }
  return false;
}
