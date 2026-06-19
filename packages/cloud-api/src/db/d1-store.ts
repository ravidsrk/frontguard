/**
 * Cloudflare D1 implementation of the {@link Store} interface (Task 5.2).
 *
 * Uses the D1 prepared-statement API (`prepare().bind().first()/all()/run()`).
 * JSON blobs (run config/results) are serialised into TEXT columns.
 *
 * @module db/d1-store
 */

import type {
  Store,
  User,
  ApiKeyRecord,
  ScreenshotRecord,
  UsageRecord,
  UsageAlertState,
  ScreenshotDecision,
  ListRunsOptions,
} from './store.js';
import type { Monitor, MonitorRun, MonitorRunStatus, MonitorAlertState } from './monitors.js';
import { isMonitorDue } from './monitors.js';
import type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamProject,
  TeamRole,
  BaselineApproval,
  TeamActivity,
  TeamUsage,
} from './teams.js';
import type { IgnoreMask } from './masks.js';
import type { RunAttachment, AttachmentKind } from './attachments.js';
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
  /** Runs prepared statements atomically (D1's transactional primitive). */
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

interface RunRow {
  id: string;
  user_id: string;
  project_id: string | null;
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
  version?: number;
}

const OPTIMISTIC_MAX_RETRIES = 5;

class OptimisticConflictError extends Error {
  constructor(entity: string, id: string) {
    super(`optimistic concurrency conflict: ${entity} ${id}`);
    this.name = 'OptimisticConflictError';
  }
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
    // CI linkage (owner/repo/prNumber/commitSha). Folded into the config blob
    // rather than dedicated columns so no schema migration is required. The MCP
    // `list_regressions` / `recent_runs` tools filter on this, so dropping it
    // here is what left them returning empty in production (mcp-1).
    github: run.github,
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
    projectId: row.project_id ?? undefined,
    error: row.error ?? undefined,
    github: cfg.github ?? undefined,
  };
}

/** D1-backed store. */
export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async createUser(user: User): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, email, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.githubId ?? null,
        user.githubLogin ?? null,
        user.email ?? null,
        user.plan,
        user.createdAt,
      )
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
  async updateUserIdentity(id: string, patch: { email?: string; githubLogin?: string }): Promise<void> {
    if (patch.email !== undefined) {
      await this.db.prepare(`UPDATE users SET email = ? WHERE id = ?`).bind(patch.email, id).run();
    }
    if (patch.githubLogin !== undefined) {
      await this.db
        .prepare(`UPDATE users SET github_login = ? WHERE id = ?`)
        .bind(patch.githubLogin, id)
        .run();
    }
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
        `INSERT INTO runs (id, user_id, project_id, status, config, results, report_html, routes_count, regressions_count, baselines_approved, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        userId,
        run.projectId ?? null,
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
  async listRuns(userId: string, opts: ListRunsOptions = {}): Promise<Run[]> {
    const { limit = 50, teamIds = [], includeOwn = true } = opts;
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (includeOwn) {
      clauses.push('user_id = ?');
      binds.push(userId);
    }
    if (teamIds.length > 0) {
      // Runs are scoped to a team via their project. Expand the team list into
      // positional placeholders (D1 has no array binding).
      const placeholders = teamIds.map(() => '?').join(', ');
      clauses.push(
        `project_id IN (SELECT id FROM team_projects WHERE team_id IN (${placeholders}))`,
      );
      binds.push(...teamIds);
    }
    // Nothing to scope to (e.g. explicit team-only with an empty team set).
    if (clauses.length === 0) return [];
    binds.push(limit);
    const { results } = await this.db
      .prepare(
        `SELECT * FROM runs WHERE ${clauses.join(' OR ')} ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(...binds)
      .all<RunRow>();
    return results.map(rowToRun);
  }
  async updateRun(id: string, patch: Partial<Run>): Promise<void> {
    for (let attempt = 0; attempt < OPTIMISTIC_MAX_RETRIES; attempt++) {
      const row = await this.db.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<RunRow>();
      if (!row) return;
      const version = Number(row.version ?? 0);
      const merged = { ...rowToRun(row), ...patch };
      const res = await this.db
        .prepare(
          `UPDATE runs SET project_id = ?, status = ?, config = ?, results = ?, report_html = ?, routes_count = ?, regressions_count = ?, baselines_approved = ?, error = ?, completed_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
        )
        .bind(
          merged.projectId ?? null,
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
          version,
        )
        .run();
      if ((res.meta?.changes ?? 0) > 0) return;
    }
    throw new OptimisticConflictError('run', id);
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

  async tryReserveRun(userId: string, month: string, limit: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO usage (user_id, month, runs_count, screenshots_count) VALUES (?, ?, 1, 0)
         ON CONFLICT(user_id, month) DO UPDATE SET
           runs_count = runs_count + 1
         WHERE runs_count < ?`,
      )
      .bind(userId, month, limit)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async tryReserveScreenshots(
    userId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return true;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO usage (user_id, month, runs_count, screenshots_count)
           VALUES (?, ?, 0, 0)`,
        )
        .bind(userId, month),
      this.db
        .prepare(
          `UPDATE usage SET screenshots_count = screenshots_count + ?
           WHERE user_id = ? AND month = ? AND screenshots_count + ? <= ?`,
        )
        .bind(amount, userId, month, amount, limit),
    ]);
    const update = results[1] as { meta?: { changes?: number } };
    return (update.meta?.changes ?? 0) > 0;
  }

  async tryReserveTeamRun(teamId: string, month: string, limit: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO team_usage (team_id, month, runs_count, screenshots_count) VALUES (?, ?, 1, 0)
         ON CONFLICT(team_id, month) DO UPDATE SET
           runs_count = runs_count + 1
         WHERE runs_count < ?`,
      )
      .bind(teamId, month, limit)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async tryReserveTeamScreenshots(
    teamId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return true;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO team_usage (team_id, month, runs_count, screenshots_count)
           VALUES (?, ?, 0, 0)`,
        )
        .bind(teamId, month),
      this.db
        .prepare(
          `UPDATE team_usage SET screenshots_count = screenshots_count + ?
           WHERE team_id = ? AND month = ? AND screenshots_count + ? <= ?`,
        )
        .bind(amount, teamId, month, amount, limit),
    ]);
    const update = results[1] as { meta?: { changes?: number } };
    return (update.meta?.changes ?? 0) > 0;
  }

  async incrementTeamUsage(teamId: string, month: string, runs: number, screenshots: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO team_usage (team_id, month, runs_count, screenshots_count) VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, month) DO UPDATE SET
           runs_count = runs_count + excluded.runs_count,
           screenshots_count = screenshots_count + excluded.screenshots_count`,
      )
      .bind(teamId, month, runs, screenshots)
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
  async getUsageAlertState(userId: string, month: string): Promise<UsageAlertState | null> {
    const row = await this.db
      .prepare(`SELECT * FROM usage_alert_state WHERE user_id = ? AND month = ?`)
      .bind(userId, month)
      .first<Record<string, unknown>>();
    if (!row) return null;
    const tier = Number(row.last_tier ?? 0);
    return {
      userId,
      month,
      lastTier: (tier === 80 || tier === 95 ? tier : 0) as 0 | 80 | 95,
      lastAlertAt: row.last_alert_at != null ? String(row.last_alert_at) : undefined,
    };
  }
  async setUsageAlertState(state: UsageAlertState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage_alert_state (user_id, month, last_tier, last_alert_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, month) DO UPDATE SET
           last_tier = excluded.last_tier,
           last_alert_at = excluded.last_alert_at`,
      )
      .bind(state.userId, state.month, state.lastTier, state.lastAlertAt ?? null)
      .run();
  }

  // Masks --------------------------------------------------------------------
  async createMask(m: IgnoreMask): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO masks (id, user_id, route, viewport, x, y, width, height, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(m.id, m.userId, m.route, m.viewport, m.x, m.y, m.width, m.height, m.label ?? null, m.createdAt)
      .run();
  }
  async listMasks(userId: string): Promise<IgnoreMask[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM masks WHERE user_id = ? ORDER BY created_at DESC`)
      .bind(userId)
      .all<Record<string, unknown>>();
    return results.map(maskFromRow);
  }
  async listMasksForTarget(userId: string, route: string, viewport: number): Promise<IgnoreMask[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM masks WHERE user_id = ? AND route = ? AND viewport = ? ORDER BY created_at DESC`,
      )
      .bind(userId, route, viewport)
      .all<Record<string, unknown>>();
    return results.map(maskFromRow);
  }
  async deleteMask(id: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare(`DELETE FROM masks WHERE id = ? AND user_id = ?`)
      .bind(id, userId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // Attachments --------------------------------------------------------------
  async addAttachment(att: RunAttachment): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO run_attachments (id, run_id, kind, name, r2_key, content_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        att.id,
        att.runId,
        att.kind,
        att.name,
        att.r2Key,
        att.contentType ?? null,
        att.sizeBytes ?? null,
        att.createdAt,
      )
      .run();
  }
  async listAttachments(runId: string): Promise<RunAttachment[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM run_attachments WHERE run_id = ? ORDER BY created_at`)
      .bind(runId)
      .all<Record<string, unknown>>();
    return results.map(attachmentFromRow);
  }
  async getAttachment(id: string): Promise<RunAttachment | null> {
    const row = await this.db
      .prepare(`SELECT * FROM run_attachments WHERE id = ?`)
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? attachmentFromRow(row) : null;
  }
  async deleteAttachment(id: string): Promise<boolean> {
    const res = await this.db.prepare(`DELETE FROM run_attachments WHERE id = ?`).bind(id).run();
    return (res.meta?.changes ?? 0) > 0;
  }

  // Screenshot decisions -----------------------------------------------------
  async addScreenshotDecision(d: ScreenshotDecision): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO screenshot_decisions (id, screenshot_id, run_id, user_id, decision, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(d.id, d.screenshotId, d.runId, d.userId, d.decision, d.createdAt)
      .run();
  }
  async listScreenshotDecisions(runId: string): Promise<ScreenshotDecision[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM screenshot_decisions WHERE run_id = ? ORDER BY created_at DESC`)
      .bind(runId)
      .all<Record<string, unknown>>();
    return results.map(decisionFromRow);
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
    for (let attempt = 0; attempt < OPTIMISTIC_MAX_RETRIES; attempt++) {
      const row = await this.db
        .prepare(`SELECT * FROM monitors WHERE id = ?`)
        .bind(id)
        .first<Record<string, unknown>>();
      if (!row) return;
      const version = Number(row.version ?? 0);
      const current = monitorFromRow(row);
      const m = { ...current, ...patch };
      const res = await this.db
        .prepare(
          `UPDATE monitors SET name = ?, url = ?, routes = ?, viewports = ?, interval_minutes = ?, alert_threshold = ?, alerts = ?, enabled = ?, last_run_at = ?, last_status = ?, version = version + 1 WHERE id = ? AND version = ?`,
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
          version,
        )
        .run();
      if ((res.meta?.changes ?? 0) > 0) return;
    }
    throw new OptimisticConflictError('monitor', id);
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
  async addMonitorRun(run: MonitorRun): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO monitor_runs (id, monitor_id, user_id, status, regressions_count, attempts, screenshots, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.monitorId,
        run.userId,
        run.status,
        run.regressionsCount,
        run.attempts,
        run.screenshots ? JSON.stringify(run.screenshots) : null,
        run.error ?? null,
        run.createdAt,
        run.completedAt ?? null,
      )
      .run();
  }
  async listMonitorRuns(monitorId: string, limit = 50): Promise<MonitorRun[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM monitor_runs WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(monitorId, limit)
      .all<Record<string, unknown>>();
    return results.map(monitorRunFromRow);
  }
  async pruneMonitorRuns(userId: string, cutoff: string): Promise<number> {
    const res = await this.db
      .prepare(`DELETE FROM monitor_runs WHERE user_id = ? AND created_at < ?`)
      .bind(userId, cutoff)
      .run();
    return res.meta?.changes ?? 0;
  }
  async getAlertState(monitorId: string): Promise<MonitorAlertState | null> {
    const row = await this.db
      .prepare(`SELECT * FROM monitor_alert_state WHERE monitor_id = ?`)
      .bind(monitorId)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      monitorId: String(row.monitor_id),
      lastFingerprint: row.last_fingerprint != null ? String(row.last_fingerprint) : undefined,
      lastAlertAt: row.last_alert_at != null ? String(row.last_alert_at) : undefined,
      snoozedUntil: row.snoozed_until != null ? String(row.snoozed_until) : undefined,
    };
  }
  async setAlertState(state: MonitorAlertState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO monitor_alert_state (monitor_id, last_fingerprint, last_alert_at, snoozed_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(monitor_id) DO UPDATE SET
           last_fingerprint = excluded.last_fingerprint,
           last_alert_at = excluded.last_alert_at,
           snoozed_until = excluded.snoozed_until`,
      )
      .bind(
        state.monitorId,
        state.lastFingerprint ?? null,
        state.lastAlertAt ?? null,
        state.snoozedUntil ?? null,
      )
      .run();
  }

  // Teams --------------------------------------------------------------------
  async createTeam(team: Team, ownerUserId: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO teams (id, name, plan, stripe_customer_id, stripe_subscription_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(team.id, team.name, team.plan, team.stripeCustomerId ?? null, team.stripeSubscriptionId ?? null, team.createdAt)
      .run();
    await this.addMember({ teamId: team.id, userId: ownerUserId, role: 'owner', createdAt: team.createdAt });
  }
  async getTeam(id: string): Promise<Team | null> {
    const row = await this.db.prepare(`SELECT * FROM teams WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    return row ? teamFromRow(row) : null;
  }
  async getTeamByStripeSubscriptionId(subscriptionId: string): Promise<Team | null> {
    const row = await this.db
      .prepare(`SELECT * FROM teams WHERE stripe_subscription_id = ?`)
      .bind(subscriptionId)
      .first<Record<string, unknown>>();
    return row ? teamFromRow(row) : null;
  }
  async updateTeam(id: string, patch: Partial<Team>): Promise<void> {
    for (let attempt = 0; attempt < OPTIMISTIC_MAX_RETRIES; attempt++) {
      const row = await this.db.prepare(`SELECT * FROM teams WHERE id = ?`).bind(id).first<Record<string, unknown>>();
      if (!row) return;
      const version = Number(row.version ?? 0);
      const current = teamFromRow(row);
      const t = { ...current, ...patch };
      const res = await this.db
        .prepare(
          `UPDATE teams SET name = ?, plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, version = version + 1 WHERE id = ? AND version = ?`,
        )
        .bind(t.name, t.plan, t.stripeCustomerId ?? null, t.stripeSubscriptionId ?? null, id, version)
        .run();
      if ((res.meta?.changes ?? 0) > 0) return;
    }
    throw new OptimisticConflictError('team', id);
  }
  async deleteTeam(id: string): Promise<boolean> {
    await this.db.prepare(`DELETE FROM team_activity WHERE team_id = ?`).bind(id).run();
    await this.db.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(id).run();
    await this.db.prepare(`DELETE FROM team_invitations WHERE team_id = ?`).bind(id).run();
    // CASCADE (DM-2): deleting projects removes project-scoped runs and children.
    await this.db.prepare(`DELETE FROM team_projects WHERE team_id = ?`).bind(id).run();
    const res = await this.db.prepare(`DELETE FROM teams WHERE id = ?`).bind(id).run();
    return (res.meta?.changes ?? 0) > 0;
  }
  async listTeamsForUser(userId: string): Promise<Array<Team & { role: TeamRole }>> {
    const { results } = await this.db
      .prepare(
        `SELECT t.*, m.role AS member_role FROM teams t
         JOIN team_members m ON m.team_id = t.id WHERE m.user_id = ?`,
      )
      .bind(userId)
      .all<Record<string, unknown>>();
    return results.map((row) => ({ ...teamFromRow(row), role: String(row.member_role) as TeamRole }));
  }

  async addMember(member: TeamMember): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO team_members (team_id, user_id, role, reviewer, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
      )
      .bind(member.teamId, member.userId, member.role, member.reviewer ? 1 : 0, member.createdAt)
      .run();
  }
  async getMember(teamId: string, userId: string): Promise<TeamMember | null> {
    const row = await this.db
      .prepare(`SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`)
      .bind(teamId, userId)
      .first<Record<string, unknown>>();
    return row ? memberFromRow(row) : null;
  }
  async listMembers(teamId: string): Promise<TeamMember[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM team_members WHERE team_id = ?`)
      .bind(teamId)
      .all<Record<string, unknown>>();
    return results.map(memberFromRow);
  }
  async updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
    await this.db
      .prepare(`UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`)
      .bind(role, teamId, userId)
      .run();
  }
  async setReviewer(teamId: string, userId: string, reviewer: boolean): Promise<void> {
    await this.db
      .prepare(`UPDATE team_members SET reviewer = ? WHERE team_id = ? AND user_id = ?`)
      .bind(reviewer ? 1 : 0, teamId, userId)
      .run();
  }
  async removeMember(teamId: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`)
      .bind(teamId, userId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async createInvitation(inv: TeamInvitation): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO team_invitations (id, team_id, email, github_login, role, token, created_at, expires_at, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        inv.id,
        inv.teamId,
        inv.email ?? null,
        inv.githubLogin ?? null,
        inv.role,
        inv.token,
        inv.createdAt,
        inv.expiresAt ?? null,
        inv.acceptedAt ?? null,
      )
      .run();
  }
  async getInvitationByToken(token: string): Promise<TeamInvitation | null> {
    const row = await this.db
      .prepare(`SELECT * FROM team_invitations WHERE token = ?`)
      .bind(token)
      .first<Record<string, unknown>>();
    return row ? invitationFromRow(row) : null;
  }
  async listInvitations(teamId: string): Promise<TeamInvitation[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM team_invitations WHERE team_id = ? AND accepted_at IS NULL`)
      .bind(teamId)
      .all<Record<string, unknown>>();
    return results.map(invitationFromRow);
  }
  async acceptInvitation(token: string, at: string): Promise<TeamInvitation | null> {
    const inv = await this.getInvitationByToken(token);
    if (!inv || inv.acceptedAt) return null;
    if (!inv.expiresAt || new Date(inv.expiresAt) <= new Date(at)) return null;
    const res = await this.db
      .prepare(
        `UPDATE team_invitations SET accepted_at = ? WHERE token = ? AND accepted_at IS NULL AND expires_at > ?`,
      )
      .bind(at, token, at)
      .run();
    if ((res.meta?.changes ?? 0) === 0) return null;
    return { ...inv, acceptedAt: at };
  }

  async createProject(project: TeamProject): Promise<void> {
    await this.db
      .prepare(`INSERT INTO team_projects (id, team_id, name, repo_url, config, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(project.id, project.teamId, project.name, project.repoUrl ?? null, project.config ?? null, project.createdAt)
      .run();
  }
  async getProjectById(id: string): Promise<TeamProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM team_projects WHERE id = ?`)
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? projectFromRow(row) : null;
  }
  async listProjects(teamId: string): Promise<TeamProject[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM team_projects WHERE team_id = ? ORDER BY created_at DESC`)
      .bind(teamId)
      .all<Record<string, unknown>>();
    return results.map(projectFromRow);
  }
  async deleteProject(id: string, teamId: string): Promise<boolean> {
    const res = await this.db
      .prepare(`DELETE FROM team_projects WHERE id = ? AND team_id = ?`)
      .bind(id, teamId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  }

  async listProjectRuns(projectId: string, limit = 50, offset = 0): Promise<Run[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(projectId, limit, offset)
      .all<RunRow>();
    return results.map(rowToRun);
  }
  async getProjectBaseline(projectId: string): Promise<Run | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM runs WHERE project_id = ? AND baselines_approved = 1 ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(projectId)
      .first<RunRow>();
    return row ? rowToRun(row) : null;
  }

  async addApproval(approval: BaselineApproval): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO baseline_approvals (id, run_id, project_id, reviewer_user_id, status, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        approval.id,
        approval.runId,
        approval.projectId ?? null,
        approval.reviewerUserId,
        approval.status,
        approval.comment ?? null,
        approval.createdAt,
      )
      .run();
  }
  async listApprovals(runId: string): Promise<BaselineApproval[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM baseline_approvals WHERE run_id = ? ORDER BY created_at DESC`)
      .bind(runId)
      .all<Record<string, unknown>>();
    return results.map(approvalFromRow);
  }

  async recordActivity(activity: TeamActivity): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO team_activity (id, team_id, user_id, action, target, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        activity.id,
        activity.teamId,
        activity.userId ?? null,
        activity.action,
        activity.target ?? null,
        activity.metadata ?? null,
        activity.createdAt,
      )
      .run();
  }
  async listActivity(teamId: string, limit = 50): Promise<TeamActivity[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM team_activity WHERE team_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(teamId, limit)
      .all<Record<string, unknown>>();
    return results.map(activityFromRow);
  }

  async getTeamUsage(teamId: string, month: string): Promise<TeamUsage> {
    const members = await this.listMembers(teamId);
    const perMember = await Promise.all(
      members.map(async (m) => {
        const u = await this.getUsage(m.userId, month);
        return { userId: m.userId, runsCount: u.runsCount, screenshotsCount: u.screenshotsCount };
      }),
    );
    const row = await this.db
      .prepare(`SELECT * FROM team_usage WHERE team_id = ? AND month = ?`)
      .bind(teamId, month)
      .first<Record<string, unknown>>();
    return {
      month,
      runsCount: Number(row?.runs_count ?? 0),
      screenshotsCount: Number(row?.screenshots_count ?? 0),
      memberCount: members.length,
      perMember,
    };
  }
}

function teamFromRow(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    name: String(row.name),
    plan: String(row.plan ?? 'free'),
    stripeCustomerId: row.stripe_customer_id != null ? String(row.stripe_customer_id) : undefined,
    stripeSubscriptionId: row.stripe_subscription_id != null ? String(row.stripe_subscription_id) : undefined,
    createdAt: String(row.created_at),
  };
}

function memberFromRow(row: Record<string, unknown>): TeamMember {
  return {
    teamId: String(row.team_id),
    userId: String(row.user_id),
    role: String(row.role) as TeamRole,
    reviewer: row.reviewer === 1 || row.reviewer === true,
    createdAt: String(row.created_at),
  };
}

function invitationFromRow(row: Record<string, unknown>): TeamInvitation {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    email: row.email != null ? String(row.email) : undefined,
    githubLogin: row.github_login != null ? String(row.github_login) : undefined,
    role: String(row.role) as TeamRole,
    token: String(row.token),
    createdAt: String(row.created_at),
    expiresAt: row.expires_at != null ? String(row.expires_at) : undefined,
    acceptedAt: row.accepted_at != null ? String(row.accepted_at) : undefined,
  };
}

function approvalFromRow(row: Record<string, unknown>): BaselineApproval {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    projectId: row.project_id != null ? String(row.project_id) : undefined,
    reviewerUserId: String(row.reviewer_user_id),
    status: String(row.status) as BaselineApproval['status'],
    comment: row.comment != null ? String(row.comment) : undefined,
    createdAt: String(row.created_at),
  };
}

function activityFromRow(row: Record<string, unknown>): TeamActivity {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    userId: row.user_id != null ? String(row.user_id) : undefined,
    action: String(row.action),
    target: row.target != null ? String(row.target) : undefined,
    metadata: row.metadata != null ? String(row.metadata) : undefined,
    createdAt: String(row.created_at),
  };
}

function projectFromRow(row: Record<string, unknown>): TeamProject {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    name: String(row.name),
    repoUrl: row.repo_url != null ? String(row.repo_url) : undefined,
    config: row.config != null ? String(row.config) : undefined,
    createdAt: String(row.created_at),
  };
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

function monitorRunFromRow(row: Record<string, unknown>): MonitorRun {
  return {
    id: String(row.id),
    monitorId: String(row.monitor_id),
    userId: String(row.user_id),
    status: String(row.status) as MonitorRunStatus,
    regressionsCount: Number(row.regressions_count ?? 0),
    attempts: Number(row.attempts ?? 1),
    screenshots: row.screenshots != null ? (JSON.parse(String(row.screenshots)) as string[]) : undefined,
    error: row.error != null ? String(row.error) : undefined,
    createdAt: String(row.created_at),
    completedAt: row.completed_at != null ? String(row.completed_at) : undefined,
  };
}

function userFromRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    githubId: row.github_id != null ? String(row.github_id) : undefined,
    githubLogin: row.github_login != null ? String(row.github_login) : undefined,
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

function maskFromRow(row: Record<string, unknown>): IgnoreMask {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    route: String(row.route),
    viewport: Number(row.viewport),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    label: row.label != null ? String(row.label) : undefined,
    createdAt: String(row.created_at),
  };
}

function decisionFromRow(row: Record<string, unknown>): ScreenshotDecision {
  return {
    id: String(row.id),
    screenshotId: String(row.screenshot_id),
    runId: String(row.run_id),
    userId: String(row.user_id),
    decision: String(row.decision) as ScreenshotDecision['decision'],
    createdAt: String(row.created_at),
  };
}

function attachmentFromRow(row: Record<string, unknown>): RunAttachment {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    kind: String(row.kind) as AttachmentKind,
    name: String(row.name),
    r2Key: String(row.r2_key),
    contentType: row.content_type != null ? String(row.content_type) : undefined,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    createdAt: String(row.created_at),
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
