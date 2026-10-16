/**
 * v6 migration — monitor project scope (`project_id`).
 *
 * Adds `project_id` to `monitors` for databases created before `monitors.project_id`
 * was included in the baseline schema.
 *
 * @module db/migrations/006-monitor-project-id
 */

import type { Migration } from './types.js';

/** Adds `project_id` column to `monitors`. */
export const migration006MonitorProjectId: Migration = {
  version: '006',
  name: 'monitor_project_id',
  sql: `
ALTER TABLE monitors ADD COLUMN project_id TEXT;
`,
};
