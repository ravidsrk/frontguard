/**
 * v9 migration — monotonic sandbox/AI usage metering, Stripe webhook
 * idempotency + event ordering, and `monitor_runs.run_id` linkage.
 *
 * @module db/migrations/009-metering-billing-monitor-run-id
 */

import type { Migration } from './types.js';

export const migration009MeteringBillingMonitorRunId: Migration = {
  version: '009',
  name: 'metering_billing_monitor_run_id',
  sql: `
ALTER TABLE usage ADD COLUMN sandbox_minutes_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage ADD COLUMN ai_calls_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_usage ADD COLUMN sandbox_minutes_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN stripe_last_event_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitor_runs ADD COLUMN run_id TEXT;
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  created INTEGER NOT NULL DEFAULT 0,
  team_id TEXT,
  processed_at TEXT NOT NULL
);
`,
};
