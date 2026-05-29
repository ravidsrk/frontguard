/**
 * Cloudflare D1 implementation of the {@link Store} interface (Task 5.2).
 *
 * Uses the D1 prepared-statement API (`prepare().bind().first()/all()/run()`).
 * JSON blobs (run config/results) are serialised into TEXT columns.
 *
 * @module db/d1-store
 */

import type { Store, User, ApiKeyRecord, ScreenshotRecord, UsageRecord } from './store.js';
import type { Monitor } from './monitors.js';
import { isMonitorDue } from './monitors.js';
import type { Run } from '../types.js';

/** Minimal D1 typings (avoids depending on @cloudflare/workers-types). */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

interface RunRow {
  id: string;
  user_id: string;
  status: string;
  config: string;
  results: string | null;
  report_html: string | null;
  routes_count: number;
  regressions_count: number;
  baselines_approved: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Serialises a Run's mutable, JSON-friendly config fields. */
function runConfig(run: Run): string {
  return JSON.stringify({
    url: run.url,
    routes: run.routes,
    viewports: run.viewports,
    browsers: run.browsers,
    threshold: run.threshold,
    ai: run.ai,
    reportUrl: run.reportUrl,
  });
}

/** Reconstructs a Run from a D1 row. */
function rowToRun(row: RunRow): Run {
  const cfg = JSON.parse(row.config) as Partial<Run>;
  return {
    id: row.id,
    status: row.status as Run['status'],
    url: cfg.url ?? '',
    routes: cfg.routes ?? [{ path: '/' }],
    viewports: cfg.viewports ?? [1440],
    browsers: cfg.browsers ?? ['chromium'],
    threshold: cfg.threshold ?? 0.01,
    ai: cfg.ai ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    results: row.results ? (JSON.parse(row.results) as Run['results']) : null,
    reportUrl: cfg.reportUrl ?? null,
    reportHtml: row.report_html ?? undefined,
    baselinesApproved: row.baselines_approved === 1,
    error: row.error ?? undefined,
  };
}

/** D1-backed store. */
export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async createUser(user: User): Promise<void> {
    await this.db
      .prepare(`INSERT INTO users (id, github_id, email, plan, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(user.id, user.githubId ?? null, user.email ?? null, user.plan, user.createdAt)
      .run();
  }
  async getUser(id: string): Promise<User | null> {
    const row = await this.db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    return row ? userFromRow(row) : null;
  }
  async getUserByGithubId(githubId: string): Promise<User | null> {
    const row = await this.db
      .prepare(`SELECT * FROM users WHERE github_id = ?`)
      .bind(githubId)
      .first<Record<string, unknown>>();
    return row ? userFromRow(row) : null;
  }
  async updateUserPlan(id: string, plan: string): Promise<void> {
    await this.db.prepare(`UPDATE users SET plan = ? WHERE id = ?`).bind(plan, id).run();
  }

  async createApiKey(key: ApiKeyRecord): Promise<void> {
    await this.db
      .prepare(`INSERT INTO api_keys (key_hash, user_id, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(key.keyHash, key.userId, key.name, key.createdAt, key.lastUsedAt ?? null)
      .run();
  }
  async getApiKey(keyHash: string): Promise<ApiKeyRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM api_keys WHERE key_hash = ?`)
      .bind(keyHash)
      .first<Record<string, unknown>>();
    return row ? apiKeyFromRow(row) : null;
  }
  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<Record<string, unknown>>();
    return results.map(apiKeyFromRow);
  }
  async deleteApiKey(keyHash: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare(`DELETE FROM api_keys WHERE key_hash = ? AND user_id = ?`)
      .bind(keyHash, userId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }
  async touchApiKey(keyHash: string, at: string): Promise<void> {
    await this.db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?`).bind(at, keyHash).run();
  }

  async createRun(run: Run, userId: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO runs (id, user_id, status, config, results, report_html, routes_count, regressions_count, baselines_approved, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        userId,
        run.status,
        runConfig(run),
        run.results ? JSON.stringify(run.results) : null,
        run.reportHtml ?? null,
        run.routes.length,
        run.results?.filter((r) => r.classification === 'regression').length ?? 0,
        run.baselinesApproved ? 1 : 0,
        run.error ?? null,
        run.createdAt,
        run.completedAt ?? null,
      )
      .run();
  }
  async getRun(id: string): Promise<Run | null> {
    const row = await this.db.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<RunRow>();
    return row ? rowToRun(row) : null;
  }
  async getRunOwner(id: string): Promise<string | null> {
    const row = await this.db.prepare(`SELECT user_id FROM runs WHERE id = ?`).bind(id).first<{ user_id: string }>();
    return row?.user_id ?? null;
  }
  async listRuns(userId: string, limit = 50): Promise<Run[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(userId, limit)
      .all<RunRow>();
    return results.map(rowToRun);
  }
  async updateRun(id: string, patch: Partial<Run>): Promise<void> {
    // Read-modify-write to keep the JSON config consistent.
    const current = await this.getRun(id);
    if (!current) return;
    const merged = { ...current, ...patch };
    await this.db
      .prepare(
        `UPDATE runs SET status = ?, config = ?, results = ?, report_html = ?, routes_count = ?, regressions_count = ?, baselines_approved = ?, error = ?, completed_at = ? WHERE id = ?`,
      )
      .bind(
        merged.status,
        runConfig(merged),
        merged.results ? JSON.stringify(merged.results) : null,
        merged.reportHtml ?? null,
        merged.routes.length,
        merged.results?.filter((r) => r.classification === 'regression').length ?? 0,
        merged.baselinesApproved ? 1 : 0,
        merged.error ?? null,
        merged.completedAt ?? null,
        id,
      )
      .run();
  }
  async deleteRun(id: string, userId: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM runs WHERE id = ? AND user_id = ?`).bind(id, userId).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async addScreenshot(rec: ScreenshotRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO screenshots (id, run_id, route, viewport, browser, type, r2_key, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        rec.id,
        rec.runId,
        rec.route,
        rec.viewport,
        rec.browser,
        rec.type,
        rec.r2Key,
        rec.sizeBytes ?? null,
        rec.createdAt,
      )
      .run();
  }
  async listScreenshots(runId: string): Promise<ScreenshotRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM screenshots WHERE run_id = ? ORDER BY created_at`)
      .bind(runId)
      .all<Record<string, unknown>>();
    return results.map(screenshotFromRow);
  }

  async incrementUsage(userId: string, month: string, runs: number, screenshots: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage (user_id, month, runs_count, screenshots_count) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, month) DO UPDATE SET
           runs_count = runs_count + excluded.runs_count,
           screenshots_count = screenshots_count + excluded.screenshots_count`,
      )
      .bind(userId, month, runs, screenshots)
      .run();
  }
  async getUsage(userId: string, month: string): Promise<UsageRecord> {
    const row = await this.db
      .prepare(`SELECT * FROM usage WHERE user_id = ? AND month = ?`)
      .bind(userId, month)
      .first<Record<string, unknown>>();
    return row
      ? {
          userId,
          month,
          runsCount: Number(row.runs_count ?? 0),
          screenshotsCount: Number(row.screenshots_count ?? 0),
        }
      : { userId, month, runsCount: 0, screenshotsCount: 0 };
  }

  // Monitors -----------------------------------------------------------------
  async createMonitor(m: Monitor): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO monitors (id, user_id, name, url, routes, viewports, interval_minutes, alert_threshold, alerts, enabled, last_run_at, last_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        m.id,
        m.userId,
        m.name,
        m.url,
        JSON.stringify(m.routes),
        JSON.stringify(m.viewports),
        m.intervalMinutes,
        m.alertThreshold,
        m.alerts ? JSON.stringify(m.alerts) : null,
        m.enabled ? 1 : 0,
        m.lastRunAt ?? null,
        m.lastStatus ?? null,
        m.createdAt,
      )
      .run();
  }
  async getMonitor(id: string): Promise<Monitor | null> {
    const row = await this.db.prepare(`SELECT * FROM monitors WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    return row ? monitorFromRow(row) : null;
  }
  async listMonitors(userId: string): Promise<Monitor[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM monitors WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<Record<string, unknown>>();
    return results.map(monitorFromRow);
  }
  async updateMonitor(id: string, patch: Partial<Monitor>): Promise<void> {
    const current = await this.getMonitor(id);
    if (!current) return;
    const m = { ...current, ...patch };
    await this.db
      .prepare(
        `UPDATE monitors SET name = ?, url = ?, routes = ?, viewports = ?, interval_minutes = ?, alert_threshold = ?, alerts = ?, enabled = ?, last_run_at = ?, last_status = ? WHERE id = ?`,
      )
      .bind(
        m.name,
        m.url,
        JSON.stringify(m.routes),
        JSON.stringify(m.viewports),
        m.intervalMinutes,
        m.alertThreshold,
        m.alerts ? JSON.stringify(m.alerts) : null,
        m.enabled ? 1 : 0,
        m.lastRunAt ?? null,
        m.lastStatus ?? null,
        id,
      )
      .run();
  }
  async deleteMonitor(id: string, userId: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM monitors WHERE id = ? AND user_id = ?`).bind(id, userId).run();
    return (res.meta?.changes ?? 0) > 0;
  }
  async listDueMonitors(now: Date): Promise<Monitor[]> {
    // Fetch enabled monitors and filter in JS (interval comparison is awkward
    // in portable SQL). Monitor counts are small, so this is fine.
    const { results } = await this.db
      .prepare(`SELECT * FROM monitors WHERE enabled = 1`)
      .all<Record<string, unknown>>();
    return results.map(monitorFromRow).filter((m) => isMonitorDue(m, now));
  }
}

function monitorFromRow(row: Record<string, unknown>): Monitor {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    url: String(row.url),
    routes: JSON.parse(String(row.routes ?? '[]')) as string[],
    viewports: JSON.parse(String(row.viewports ?? '[]')) as number[],
    intervalMinutes: Number(row.interval_minutes ?? 60),
    alertThreshold: Number(row.alert_threshold ?? 0.05),
    alerts: row.alerts != null ? (JSON.parse(String(row.alerts)) as Monitor['alerts']) : undefined,
    enabled: row.enabled === 1 || row.enabled === true,
    lastRunAt: row.last_run_at != null ? String(row.last_run_at) : undefined,
    lastStatus: row.last_status != null ? String(row.last_status) : undefined,
    createdAt: String(row.created_at),
  };
}

function userFromRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    githubId: row.github_id != null ? String(row.github_id) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    plan: String(row.plan ?? 'free'),
    createdAt: String(row.created_at),
  };
}

function apiKeyFromRow(row: Record<string, unknown>): ApiKeyRecord {
  return {
    keyHash: String(row.key_hash),
    userId: String(row.user_id),
    name: String(row.name),
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at != null ? String(row.last_used_at) : undefined,
  };
}

function screenshotFromRow(row: Record<string, unknown>): ScreenshotRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    route: String(row.route),
    viewport: Number(row.viewport),
    browser: String(row.browser),
    type: String(row.type) as ScreenshotRecord['type'],
    r2Key: String(row.r2_key),
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    createdAt: String(row.created_at),
  };
}
