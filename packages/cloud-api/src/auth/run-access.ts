import type { Store } from '../db/store.js';
import { can, roleAtLeast } from '../db/teams.js';

/**
 * Authorization helpers for runs.
 *
 * Security invariant: when a run belongs to a registered team project
 * (`store.getProjectById(run.projectId)` is non-null), authorization is
 * governed STRICTLY by the caller's active membership and role in that team —
 * NEVER by historical `getRunOwner(runId)` — so removed members lose access
 * immediately and cannot read, poison, approve, or delete team baselines.
 *
 * For personal runs (no `projectId` or an unregistered CI slug like `org/repo`),
 * authorization falls back to direct run ownership (`getRunOwner(runId)`).
 */

/**
 * Returns true when `userId` may view `runId`.
 */
export async function isRunAccessibleByUser(
  store: Store,
  runId: string,
  userId: string,
): Promise<boolean> {
  const run = await store.getRun(runId);
  if (!run) return false;
  if (run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      return Boolean(member && can(member.role, 'view'));
    }
  }
  return (await store.getRunOwner(runId)) === userId;
}

/**
 * Returns true when `userId` may mutate non-baseline artifacts on `runId`
 * (e.g. upload attachments). Excludes read-only `viewer` and removed members.
 */
export async function canUserMutateRun(
  store: Store,
  runId: string,
  userId: string,
): Promise<boolean> {
  const run = await store.getRun(runId);
  if (!run) return false;
  if (run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      return Boolean(member && can(member.role, 'run_tests'));
    }
  }
  return (await store.getRunOwner(runId)) === userId;
}

/**
 * Returns true when `userId` may approve/reject baselines for `runId`.
 * For registered-project runs, requires active team membership with
 * `run_tests` AND either `member.reviewer === true` or `admin`/`owner` role.
 */
export async function canUserApproveRun(
  store: Store,
  runId: string,
  userId: string,
): Promise<boolean> {
  const run = await store.getRun(runId);
  if (!run) return false;
  if (run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (!member || !can(member.role, 'run_tests')) return false;
      return Boolean(member.reviewer || roleAtLeast(member.role, 'admin'));
    }
  }
  return (await store.getRunOwner(runId)) === userId;
}

/**
 * Returns true when `userId` may delete `runId`.
 * For registered-project runs, requires active team membership AND either
 * `admin`/`owner` role OR (`run_tests` capability AND original run owner).
 * Removed members can never delete team runs/baselines.
 */
export async function canUserDeleteRun(
  store: Store,
  runId: string,
  userId: string,
): Promise<boolean> {
  const run = await store.getRun(runId);
  if (!run) return false;
  const ownerId = await store.getRunOwner(runId);
  if (run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (!member) return false;
      if (roleAtLeast(member.role, 'admin')) return true;
      return can(member.role, 'run_tests') && ownerId === userId;
    }
  }
  return ownerId === userId;
}
