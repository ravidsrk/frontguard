/**
 * v7 migration — account erasure write lock.
 *
 * A row here means screenshot persistence must not put new bytes for that
 * account. Created before blob deletion and removed with the user, or removed
 * alone when erasure stops because a blob delete failed.
 *
 * @module db/migrations/007-account-write-locks
 */

import type { Migration } from './types.js';

/** Creates `account_write_locks` on databases migrated before the table existed. */
export const migration007AccountWriteLocks: Migration = {
  version: '007',
  name: 'account_write_locks',
  sql: `
CREATE TABLE IF NOT EXISTS account_write_locks (
  user_id TEXT PRIMARY KEY,
  closed_at TEXT NOT NULL
);
`,
};
