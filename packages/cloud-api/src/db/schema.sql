-- Frontguard Cloud API — D1 schema (Task 5.2)
-- SQLite dialect (Cloudflare D1).

-- Users & API keys --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE,
  email TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- Runs & results ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES team_projects(id),
  status TEXT NOT NULL DEFAULT 'queued',
  config TEXT NOT NULL,          -- JSON blob
  results TEXT,                  -- JSON blob
  report_html TEXT,
  routes_count INTEGER DEFAULT 0,
  regressions_count INTEGER DEFAULT 0,
  baselines_approved INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at);

-- Screenshots (metadata only — images live in R2) -------------------------
CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  route TEXT NOT NULL,
  viewport INTEGER NOT NULL,
  browser TEXT NOT NULL,
  type TEXT NOT NULL,            -- baseline, current, diff
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_screenshots_run ON screenshots(run_id);

-- Usage tracking ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,           -- YYYY-MM
  runs_count INTEGER DEFAULT 0,
  screenshots_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- Teams (workspaces, Task 8.1) -------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
  reviewer INTEGER NOT NULL DEFAULT 0,  -- designated baseline reviewer flag
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  email TEXT,                            -- nullable: one of email/github_login required
  github_login TEXT,                     -- invite by GitHub handle
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_team_invitations_team ON team_invitations(team_id);

CREATE TABLE IF NOT EXISTS team_projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  repo_url TEXT,
  config TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_projects_team ON team_projects(team_id);

-- Baseline approvals (review workflow, Task 8.1) --------------------------
CREATE TABLE IF NOT EXISTS baseline_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  project_id TEXT REFERENCES team_projects(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,                  -- approved, rejected
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_baseline_approvals_run ON baseline_approvals(run_id, created_at);

-- Team activity feed (Task 8.1) -------------------------------------------
CREATE TABLE IF NOT EXISTS team_activity (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT,
  action TEXT NOT NULL,                  -- team.created, member.invited, etc.
  target TEXT,
  metadata TEXT,                         -- JSON blob
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_activity_team ON team_activity(team_id, created_at);

-- Monitors (scheduled production checks, Task 6.1) ------------------------
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  routes TEXT NOT NULL,          -- JSON array
  viewports TEXT NOT NULL,       -- JSON array
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  alert_threshold REAL NOT NULL DEFAULT 0.05,
  alerts TEXT,                   -- JSON: { slack?, email?[] }
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitors_user ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_due ON monitors(enabled, last_run_at);

-- Per-monitor run history (Task 6.1) --------------------------------------
CREATE TABLE IF NOT EXISTS monitor_runs (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,           -- passed, regression, error
  regressions_count INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  screenshots TEXT,               -- JSON: array of R2 keys
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_monitor ON monitor_runs(monitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_user ON monitor_runs(user_id, created_at);

-- Alert state per monitor (dedup + snooze, Task 6.2) ----------------------
CREATE TABLE IF NOT EXISTS monitor_alert_state (
  monitor_id TEXT PRIMARY KEY REFERENCES monitors(id),
  last_fingerprint TEXT,         -- hash of the last alerted regression set
  last_alert_at TEXT,
  snoozed_until TEXT             -- ISO timestamp until which alerts are suppressed
);

-- Ignore-region masks (Task 15.5) ----------------------------------------
-- A saved rectangle (in image coordinates relative to a route+viewport)
-- that diff comparisons should ignore. Scoped to the owning user so private.
CREATE TABLE IF NOT EXISTS masks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  route TEXT NOT NULL,
  viewport INTEGER NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_masks_user ON masks(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_masks_match ON masks(user_id, route, viewport);

-- Per-diff baseline decisions (Task 15.4) ---------------------------------
-- Bulk-approve / reject decisions made in the diff viewer. One row per
-- (screenshot, decision); the screenshot row already knows route/viewport.
CREATE TABLE IF NOT EXISTS screenshot_decisions (
  id TEXT PRIMARY KEY,
  screenshot_id TEXT NOT NULL REFERENCES screenshots(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,        -- accepted, rejected
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_screenshot_decisions_run ON screenshot_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_screenshot_decisions_shot ON screenshot_decisions(screenshot_id);

-- Run attachments (Task 15.6) ---------------------------------------------
-- Trace bundles, DOM snapshots, console logs, and other artifacts produced
-- during a run. Bytes live in R2; this table is the metadata index.
CREATE TABLE IF NOT EXISTS run_attachments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL,            -- trace, dom-snapshot, console-log, video, other
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_attachments_run ON run_attachments(run_id, created_at);

-- Spend-cap alert state (Task 15.7) ---------------------------------------
-- Tracks the highest usage-warning tier already emailed per (user, month)
-- so we don't re-spam the user every cron tick. Tiers: 0=none, 80, 95.
CREATE TABLE IF NOT EXISTS usage_alert_state (
  user_id TEXT NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,
  last_tier INTEGER NOT NULL DEFAULT 0,
  last_alert_at TEXT,
  PRIMARY KEY (user_id, month)
);
