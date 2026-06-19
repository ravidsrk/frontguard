/**
 * v4 migration — monitor execution lease (CONC-3).
 *
 * Prevents overlapping cron ticks from double-running the same due monitor.
 *
 * @module db/migrations/004-monitor-lease
 */

import type { Migration } from './types.js';

/** Adds `leased_until` so due monitors can be atomically claimed before execution. */
export const migration004MonitorLease: Migration = {
  version: '004',
  name: 'monitor_lease',
  sql: `
ALTER TABLE monitors ADD COLUMN leased_until TEXT;
CREATE INDEX IF NOT EXISTS idx_monitors_lease ON monitors(leased_until);
`,
};