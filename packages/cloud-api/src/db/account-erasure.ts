/**
 * Rules shared by the in-memory and D1 account-erasure paths.
 */

/** Why an erasure attempt left the account in place. */
export type ErasureBlockReason = 'sole-owner' | 'blob-delete-failed';

/** One team membership, enough to decide whether erasure would strand a team. */
export interface ErasureMembership {
  teamId: string;
  userId: string;
  role: string;
}

/**
 * True when `userId` is the only owner of a team that still has another member.
 * Erasure must stop so that team still has someone who can grant `owner`.
 */
export function erasureBlockedBySoleOwnership(
  userId: string,
  memberships: readonly ErasureMembership[],
): boolean {
  const byTeam = new Map<string, ErasureMembership[]>();
  for (const membership of memberships) {
    const rows = byTeam.get(membership.teamId);
    if (rows) rows.push(membership);
    else byTeam.set(membership.teamId, [membership]);
  }
  for (const rows of byTeam.values()) {
    const self = rows.find((row) => row.userId === userId);
    if (!self || self.role !== 'owner') continue;
    const ownerCount = rows.filter((row) => row.role === 'owner').length;
    const hasSomeoneElse = rows.some((row) => row.userId !== userId);
    if (ownerCount === 1 && hasSomeoneElse) return true;
  }
  return false;
}
