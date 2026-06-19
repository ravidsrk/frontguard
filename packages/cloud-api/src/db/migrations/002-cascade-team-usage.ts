/**
 * v2 migration — ON DELETE CASCADE for run/team children (DM-2) and
 * team-scoped usage metering (DM-3).
 *
 * @module db/migrations/002-cascade-team-usage
 */

import type { Migration } from './types.js';

/**
 * Recreates child tables with ON DELETE CASCADE and adds `team_usage`.
 * Runs with `PRAGMA foreign_keys=OFF` so table order is unconstrained.
 */
export const migration002CascadeTeamUsage: Migration = {
  version: '002',
  name: 'cascade_team_usage',
  sql: `
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS team_usage (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  runs_count INTEGER DEFAULT 0,
  screenshots_count INTEGER DEFAULT 0,
  PRIMARY KEY (team_id, month)
);

CREATE TABLE screenshots_new (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  viewport INTEGER NOT NULL,
  browser TEXT NOT NULL,
  type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
INSERT INTO screenshots_new SELECT * FROM screenshots;
DROP TABLE screenshots;
ALTER TABLE screenshots_new RENAME TO screenshots;
CREATE INDEX IF NOT EXISTS idx_screenshots_run ON screenshots(run_id);

CREATE TABLE screenshot_decisions_new (
  id TEXT PRIMARY KEY,
  screenshot_id TEXT NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO screenshot_decisions_new SELECT * FROM screenshot_decisions;
DROP TABLE screenshot_decisions;
ALTER TABLE screenshot_decisions_new RENAME TO screenshot_decisions;
CREATE INDEX IF NOT EXISTS idx_screenshot_decisions_run ON screenshot_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_decisions_shot ON screenshot_decisions(screenshot_id);

CREATE TABLE run_attachments_new (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
INSERT INTO run_attachments_new SELECT * FROM run_attachments;
DROP TABLE run_attachments;
ALTER TABLE run_attachments_new RENAME TO run_attachments;
CREATE INDEX IF NOT EXISTS idx_run_attachments_run ON run_attachments(run_id, created_at);

CREATE TABLE baseline_approvals_new (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES team_projects(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO baseline_approvals_new SELECT * FROM baseline_approvals;
DROP TABLE baseline_approvals;
ALTER TABLE baseline_approvals_new RENAME TO baseline_approvals;
CREATE INDEX IF NOT EXISTS idx_baseline_approvals_run ON baseline_approvals(run_id, created_at);

CREATE TABLE runs_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES team_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  config TEXT NOT NULL,
  results TEXT,
  report_html TEXT,
  routes_count INTEGER DEFAULT 0,
  regressions_count INTEGER DEFAULT 0,
  baselines_approved INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
INSERT INTO runs_new SELECT * FROM runs;
DROP TABLE runs;
ALTER TABLE runs_new RENAME TO runs;
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at);

CREATE TABLE team_activity_new (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO team_activity_new SELECT * FROM team_activity;
DROP TABLE team_activity;
ALTER TABLE team_activity_new RENAME TO team_activity;
CREATE INDEX IF NOT EXISTS idx_team_activity_team ON team_activity(team_id, created_at);

PRAGMA foreign_keys = ON;
`,
};