/**
 * v2 acceptance fixture — keep in sync with {@link ./002-dm1-test-col.sql}.
 *
 * @module db/migrations/002-dm1-test-col
 */

import type { Migration } from './types.js';

/** Additive column proving the migration runner handles ALTER TABLE. */
export const migration002Dm1TestCol: Migration = {
  version: '002',
  name: 'dm1_test_col',
  sql: 'ALTER TABLE users ADD COLUMN dm1_test_col TEXT;',
};