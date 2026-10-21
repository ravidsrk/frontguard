/**
 * v8 migration — parked run finalizers.
 *
 * A finished run whose account is mid-erasure is stored here instead of being
 * dropped. Reopening writes applies the payload. A successful erasure deletes
 * the row with the rest of the account.
 *
 * @module db/migrations/008-pending-run-updates
 */

import type { Migration } from './types.js';

/** Creates `pending_run_updates` on databases migrated before the table existed. */
export const migration008PendingRunUpdates: Migration = {
  version: '008',
  name: 'pending_run_updates',
  sql: `
CREATE TABLE IF NOT EXISTS pending_run_updates (
  run_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_run_updates_user ON pending_run_updates(user_id);
`,
};
