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
