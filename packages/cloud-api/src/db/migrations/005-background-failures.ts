/**
 * v5 migration — background failure dead-letter table (OPS-3).
 *
 * Durable record of terminal failures from `/v1/run` processing and scheduled
 * monitor checks, replacing warn-and-swallow visibility gaps.
 *
 * @module db/migrations/005-background-failures
 */

import type { Migration } from './types.js';

/** Creates `background_failures` for queryable dead-letter records. */
export const migration005BackgroundFailures: Migration = {
  version: '005',
  name: 'background_failures',
  sql: `
CREATE TABLE IF NOT EXISTS background_failures (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  user_id TEXT,
  error TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  context TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_background_failures_source ON background_failures(kind, source_id);
CREATE INDEX IF NOT EXISTS idx_background_failures_created ON background_failures(created_at);
`,
};