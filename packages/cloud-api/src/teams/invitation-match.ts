/**
 * Invitation invitee identity checks (SEC-4).
 *
 * @module teams/invitation-match
 */

import type { User } from '../db/store.js';
import type { TeamInvitation } from '../db/teams.js';

/** Returns true when the authenticated user matches the invited identity. */
export function userMatchesInvitation(user: User | null, inv: TeamInvitation): boolean {
  if (!user) return false;
  if (inv.email) {
    if (!user.email) return false;
    return user.email.toLowerCase() === inv.email.toLowerCase();
  }
  if (inv.githubLogin) {
    if (!user.githubLogin) return false;
    return user.githubLogin.toLowerCase() === inv.githubLogin.toLowerCase();
  }
  return false;
}

/** Returns true when the invitation is past its expiry (or missing expiry). */
export function invitationIsExpired(inv: TeamInvitation, now: Date = new Date()): boolean {
  if (!inv.expiresAt) return true;
  return new Date(inv.expiresAt) <= now;
}

/** Default invitation lifetime (7 days). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;