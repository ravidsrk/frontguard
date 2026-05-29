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
import type { Team, TeamMember, TeamInvitation, TeamProject, TeamRole } from './teams.js';
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
  async updateTeam(id: string, patch: Partial<Team>): Promise<void> {
    const current = await this.getTeam(id);
    if (!current) return;
    const t = { ...current, ...patch };
    await this.db
      .prepare(`UPDATE teams SET name = ?, plan = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`)
      .bind(t.name, t.plan, t.stripeCustomerId ?? null, t.stripeSubscriptionId ?? null, id)
      .run();
  }
  async deleteTeam(id: string): Promise<boolean> {
    await this.db.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(id).run();
    await this.db.prepare(`DELETE FROM team_projects WHERE team_id = ?`).bind(id).run();
    await this.db.prepare(`DELETE FROM team_invitations WHERE team_id = ?`).bind(id).run();
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
        `INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
      )
      .bind(member.teamId, member.userId, member.role, member.createdAt)
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
        `INSERT INTO team_invitations (id, team_id, email, role, token, created_at, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(inv.id, inv.teamId, inv.email, inv.role, inv.token, inv.createdAt, inv.acceptedAt ?? null)
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
    await this.db.prepare(`UPDATE team_invitations SET accepted_at = ? WHERE token = ?`).bind(at, token).run();
    return { ...inv, acceptedAt: at };
  }

  async createProject(project: TeamProject): Promise<void> {
    await this.db
      .prepare(`INSERT INTO team_projects (id, team_id, name, repo_url, config, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(project.id, project.teamId, project.name, project.repoUrl ?? null, project.config ?? null, project.createdAt)
      .run();
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
    createdAt: String(row.created_at),
  };
}

function invitationFromRow(row: Record<string, unknown>): TeamInvitation {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    email: String(row.email),
    role: String(row.role) as TeamRole,
    token: String(row.token),
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at != null ? String(row.accepted_at) : undefined,
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
