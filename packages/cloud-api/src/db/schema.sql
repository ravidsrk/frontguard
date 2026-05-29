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
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  email TEXT NOT NULL,
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
