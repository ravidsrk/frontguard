/**
 * v3 migration — optimistic concurrency version columns (CONC-2) and
 * invitation expiry + invitee identity support (SEC-4).
 *
 * @module db/migrations/003-optimistic-concurrency-invitation-expiry
 */

import type { Migration } from './types.js';

/**
 * Adds per-row `version` for runs/monitors/teams, `expires_at` on invitations,
 * and `github_login` on users for invitee identity binding.
 */
export const migration003OptimisticConcurrencyInvitationExpiry: Migration = {
  version: '003',
  name: 'optimistic_concurrency_invitation_expiry',
  sql: `
ALTER TABLE runs ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitors ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_invitations ADD COLUMN expires_at TEXT;
ALTER TABLE users ADD COLUMN github_login TEXT;
`,
};