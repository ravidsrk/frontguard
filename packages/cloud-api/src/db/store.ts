/**
 * Storage abstraction for the Frontguard Cloud API (Task 5.2).
 *
 * Defines a `Store` interface used by all routes, with two implementations:
 * - {@link InMemoryStore} — default, used for local dev and tests.
 * - `D1Store` (see `./d1-store.ts`) — Cloudflare D1 (SQLite at the edge).
 *
 * Routes depend only on this interface, so swapping the backend never changes
 * the API surface. Existing API contracts are preserved.
 *
 * @module db/store
 */

import type { Run, RunResult } from '../types.js';
import type { Monitor, MonitorRun, MonitorAlertState, MonitorStore } from './monitors.js';
import { isMonitorDue } from './monitors.js';
import type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamProject,
  TeamRole,
  TeamStore,
  BaselineApproval,
  TeamActivity,
  TeamUsage,
} from './teams.js';
import type { IgnoreMask, MaskStore } from './masks.js';
import type { RunAttachment, AttachmentStore } from './attachments.js';

/** A per-screenshot accept/reject decision recorded from the diff viewer. */
export interface ScreenshotDecision {
  id: string;
  screenshotId: string;
  runId: string;
  userId: string;
  decision: 'accepted' | 'rejected';
  createdAt: string;
}

/** A user record. */
export interface User {
  id: string;
  githubId?: string;
  /** GitHub handle (login) — used for githubLogin invitation binding (SEC-4). */
  githubLogin?: string;
  email?: string;
  plan: string;
  createdAt: string;
}

/** An API key record (hash only — never plaintext). */
export interface ApiKeyRecord {
  keyHash: string;
  userId: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** A screenshot metadata record (image bytes live in R2). */
export interface ScreenshotRecord {
  id: string;
  runId: string;
  route: string;
  viewport: number;
  browser: string;
  type: 'baseline' | 'current' | 'diff';
  r2Key: string;
  sizeBytes?: number;
  createdAt: string;
}

/** Monthly usage counters. */
export interface UsageRecord {
  userId: string;
  month: string;
  runsCount: number;
  screenshotsCount: number;
}

/** Options for {@link Store.listRuns}. */
export interface ListRunsOptions {
  /** Cap on the number of runs returned (default 50). */
  limit?: number;
  /**
   * Also include runs whose `projectId` belongs to one of these teams. Lets a
   * personal key see the runs a CI service account submitted under a shared
   * team, instead of only the key owner's own runs (mcp-7).
   */
  teamIds?: string[];
  /** Include the caller's own runs (user_id match). Default true. */
  includeOwn?: boolean;
}

/**
 * Tracks the highest spend-cap warning tier already emailed per (user, month).
 * Tiers: 0 = none, 80 = 80%-warning sent, 95 = 95%-warning sent. We never
 * re-send a tier we've already crossed; resets next month.
 */
export interface UsageAlertState {
  userId: string;
  month: string;
  lastTier: 0 | 80 | 95;
  lastAlertAt?: string;
}

/**
 * Persistent storage contract. All methods are async to accommodate D1.
 */
export interface Store extends MonitorStore, TeamStore, MaskStore, AttachmentStore {
  // Users
  createUser(user: User): Promise<void>;
  getUser(id: string): Promise<User | null>;
  getUserByGithubId(githubId: string): Promise<User | null>;
  updateUserPlan(id: string, plan: string): Promise<void>;
  updateUserIdentity(id: string, patch: { email?: string; githubLogin?: string }): Promise<void>;

  // API keys
  createApiKey(key: ApiKeyRecord): Promise<void>;
  getApiKey(keyHash: string): Promise<ApiKeyRecord | null>;
  listApiKeys(userId: string): Promise<ApiKeyRecord[]>;
  deleteApiKey(keyHash: string, userId: string): Promise<boolean>;
  touchApiKey(keyHash: string, at: string): Promise<void>;

  // Runs
  createRun(run: Run, userId: string): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  getRunOwner(id: string): Promise<string | null>;
  listRuns(userId: string, opts?: ListRunsOptions): Promise<Run[]>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  deleteRun(id: string, userId: string): Promise<boolean>;

  // Screenshots
  addScreenshot(rec: ScreenshotRecord): Promise<void>;
  listScreenshots(runId: string): Promise<ScreenshotRecord[]>;

  // Usage
  incrementUsage(userId: string, month: string, runs: number, screenshots: number): Promise<void>;
  /**
   * Atomically reserves one monthly run if usage is below `limit`.
   * Returns false when the limit is already reached (CONC-1).
   */
  tryReserveRun(userId: string, month: string, limit: number): Promise<boolean>;
  /**
   * Atomically reserves `amount` monthly screenshots if usage + amount ≤ `limit`.
   * Returns false when the reservation would exceed the limit (COST-1).
   */
  tryReserveScreenshots(
    userId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean>;
  /**
   * Atomically reserves one monthly run against a team pool (DM-3).
   * Returns false when the team limit is already reached.
   */
  tryReserveTeamRun(teamId: string, month: string, limit: number): Promise<boolean>;
  /**
   * Atomically reserves screenshots against a team pool (DM-3).
   */
  tryReserveTeamScreenshots(
    teamId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean>;
  incrementTeamUsage(teamId: string, month: string, runs: number, screenshots: number): Promise<void>;
  getUsage(userId: string, month: string): Promise<UsageRecord>;
  /** Returns the spend-cap warning tier already alerted for (user, month), or null. */
  getUsageAlertState(userId: string, month: string): Promise<UsageAlertState | null>;
  /** Upserts the spend-cap warning tier for (user, month). */
  setUsageAlertState(state: UsageAlertState): Promise<void>;

  // Screenshot decisions (bulk approve/reject, Task 15.4) -------------------
  /** Records a per-screenshot accept/reject decision. */
  addScreenshotDecision(d: ScreenshotDecision): Promise<void>;
  /** Lists decisions for a run, newest first. */
  listScreenshotDecisions(runId: string): Promise<ScreenshotDecision[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (default — dev & tests)
// ---------------------------------------------------------------------------

/**
 * In-memory store. Data is lost on restart — used for local dev and tests.
 */
export class InMemoryStore implements Store {
  /** Serializes usage mutations per (userId, month) for atomic reservations. */
  private usageLocks = new Map<string, Promise<void>>();
  /** Serializes team usage mutations per (teamId, month) (DM-3). */
  private teamUsageLocks = new Map<string, Promise<void>>();
  /** Serializes monitor lease claims per monitor id (CONC-3). */
  private monitorClaimLocks = new Map<string, Promise<void>>();

  private users = new Map<string, User>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private runs = new Map<string, { run: Run; userId: string }>();
  private runVersions = new Map<string, number>();
  private monitorVersions = new Map<string, number>();
  private teamVersions = new Map<string, number>();
  private screenshots = new Map<string, ScreenshotRecord[]>();
  private usage = new Map<string, UsageRecord>();
  private teamUsage = new Map<string, { teamId: string; month: string; runsCount: number; screenshotsCount: number }>();
  private monitors = new Map<string, Monitor>();
  private monitorRuns: MonitorRun[] = [];
  private alertState = new Map<string, MonitorAlertState>();
  private teams = new Map<string, Team>();
  private members = new Map<string, TeamMember>(); // key: `${teamId}:${userId}`
  private invitations = new Map<string, TeamInvitation>(); // key: token
  private projects = new Map<string, TeamProject>();
  private approvals: BaselineApproval[] = [];
  private activity: TeamActivity[] = [];
  private masks = new Map<string, IgnoreMask>();
  private attachments = new Map<string, RunAttachment>();
  private usageAlertState = new Map<string, UsageAlertState>(); // key: `${userId}:${month}`
  private decisions: ScreenshotDecision[] = [];

  async createUser(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }
  async getUserByGithubId(githubId: string): Promise<User | null> {
    for (const u of this.users.values()) if (u.githubId === githubId) return u;
    return null;
  }
  async updateUserPlan(id: string, plan: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.plan = plan;
  }
  async updateUserIdentity(id: string, patch: { email?: string; githubLogin?: string }): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    if (patch.email !== undefined) u.email = patch.email;
    if (patch.githubLogin !== undefined) u.githubLogin = patch.githubLogin;
  }

  async createApiKey(key: ApiKeyRecord): Promise<void> {
    this.apiKeys.set(key.keyHash, { ...key });
  }
  async getApiKey(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.apiKeys.get(keyHash) ?? null;
  }
  async listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    return [...this.apiKeys.values()].filter((k) => k.userId === userId);
  }
  async deleteApiKey(keyHash: string, userId: string): Promise<boolean> {
    const k = this.apiKeys.get(keyHash);
    if (k && k.userId === userId) return this.apiKeys.delete(keyHash);
    return false;
  }
  async touchApiKey(keyHash: string, at: string): Promise<void> {
    const k = this.apiKeys.get(keyHash);
    if (k) k.lastUsedAt = at;
  }

  async createRun(run: Run, userId: string): Promise<void> {
    this.runs.set(run.id, { run: { ...run }, userId });
    this.runVersions.set(run.id, 0);
  }
  async getRun(id: string): Promise<Run | null> {
    return this.runs.get(id)?.run ?? null;
  }
  async getRunOwner(id: string): Promise<string | null> {
    return this.runs.get(id)?.userId ?? null;
  }
  async listRuns(userId: string, opts: ListRunsOptions = {}): Promise<Run[]> {
    const { limit = 50, teamIds = [], includeOwn = true } = opts;
    const teamSet = new Set(teamIds);
    const teamProjectIds = new Set(
      [...this.projects.values()].filter((p) => teamSet.has(p.teamId)).map((p) => p.id),
    );
    return [...this.runs.values()]
      .filter(
        (entry) =>
          (includeOwn && entry.userId === userId) ||
          (entry.run.projectId != null && teamProjectIds.has(entry.run.projectId)),
      )
      .map((entry) => entry.run)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  async updateRun(id: string, patch: Partial<Run>): Promise<void> {
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const entry = this.runs.get(id);
      if (!entry) return;
      const expected = this.runVersions.get(id) ?? 0;
      await Promise.resolve();
      if ((this.runVersions.get(id) ?? 0) !== expected) continue;
      Object.assign(entry.run, patch);
      this.runVersions.set(id, expected + 1);
      return;
    }
    throw new Error(`optimistic concurrency conflict: run ${id}`);
  }
  async deleteRun(id: string, userId: string): Promise<boolean> {
    const entry = this.runs.get(id);
    if (!entry || entry.userId !== userId) return false;
    this.runs.delete(id);
    this.screenshots.delete(id);
    for (const [attId, att] of this.attachments) {
      if (att.runId === id) this.attachments.delete(attId);
    }
    this.decisions = this.decisions.filter((d) => d.runId !== id);
    this.approvals = this.approvals.filter((a) => a.runId !== id);
    return true;
  }

  async addScreenshot(rec: ScreenshotRecord): Promise<void> {
    const list = this.screenshots.get(rec.runId) ?? [];
    list.push({ ...rec });
    this.screenshots.set(rec.runId, list);
  }
  async listScreenshots(runId: string): Promise<ScreenshotRecord[]> {
    return this.screenshots.get(runId) ?? [];
  }

  private async withUsageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.usageLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.usageLocks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async withMonitorClaimLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.monitorClaimLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.monitorClaimLocks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private async withTeamUsageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.teamUsageLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.teamUsageLocks.set(key, prev.then(() => gate));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async incrementUsage(userId: string, month: string, runs: number, screenshots: number): Promise<void> {
    const key = `${userId}:${month}`;
    await this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? { userId, month, runsCount: 0, screenshotsCount: 0 };
      cur.runsCount += runs;
      cur.screenshotsCount += screenshots;
      this.usage.set(key, cur);
    });
  }

  async tryReserveRun(userId: string, month: string, limit: number): Promise<boolean> {
    const key = `${userId}:${month}`;
    return this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? { userId, month, runsCount: 0, screenshotsCount: 0 };
      if (cur.runsCount >= limit) return false;
      cur.runsCount += 1;
      this.usage.set(key, cur);
      return true;
    });
  }

  async tryReserveScreenshots(
    userId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return true;
    const key = `${userId}:${month}`;
    return this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? { userId, month, runsCount: 0, screenshotsCount: 0 };
      if (cur.screenshotsCount + amount > limit) return false;
      cur.screenshotsCount += amount;
      this.usage.set(key, cur);
      return true;
    });
  }
  async tryReserveTeamRun(teamId: string, month: string, limit: number): Promise<boolean> {
    const key = `${teamId}:${month}`;
    return this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? { teamId, month, runsCount: 0, screenshotsCount: 0 };
      if (cur.runsCount >= limit) return false;
      cur.runsCount += 1;
      this.teamUsage.set(key, cur);
      return true;
    });
  }

  async tryReserveTeamScreenshots(
    teamId: string,
    month: string,
    limit: number,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return true;
    const key = `${teamId}:${month}`;
    return this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? { teamId, month, runsCount: 0, screenshotsCount: 0 };
      if (cur.screenshotsCount + amount > limit) return false;
      cur.screenshotsCount += amount;
      this.teamUsage.set(key, cur);
      return true;
    });
  }

  async incrementTeamUsage(teamId: string, month: string, runs: number, screenshots: number): Promise<void> {
    const key = `${teamId}:${month}`;
    await this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? { teamId, month, runsCount: 0, screenshotsCount: 0 };
      cur.runsCount += runs;
      cur.screenshotsCount += screenshots;
      this.teamUsage.set(key, cur);
    });
  }

  async getUsage(userId: string, month: string): Promise<UsageRecord> {
    return (
      this.usage.get(`${userId}:${month}`) ?? { userId, month, runsCount: 0, screenshotsCount: 0 }
    );
  }
  async getUsageAlertState(userId: string, month: string): Promise<UsageAlertState | null> {
    return this.usageAlertState.get(`${userId}:${month}`) ?? null;
  }
  async setUsageAlertState(state: UsageAlertState): Promise<void> {
    this.usageAlertState.set(`${state.userId}:${state.month}`, { ...state });
  }

  // Masks --------------------------------------------------------------------
  async createMask(m: IgnoreMask): Promise<void> {
    this.masks.set(m.id, { ...m });
  }
  async listMasks(userId: string): Promise<IgnoreMask[]> {
    return [...this.masks.values()]
      .filter((m) => m.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async listMasksForTarget(userId: string, route: string, viewport: number): Promise<IgnoreMask[]> {
    return [...this.masks.values()].filter(
      (m) => m.userId === userId && m.route === route && m.viewport === viewport,
    );
  }
  async deleteMask(id: string, userId: string): Promise<boolean> {
    const m = this.masks.get(id);
    if (m && m.userId === userId) return this.masks.delete(id);
    return false;
  }

  // Attachments --------------------------------------------------------------
  async addAttachment(att: RunAttachment): Promise<void> {
    this.attachments.set(att.id, { ...att });
  }
  async listAttachments(runId: string): Promise<RunAttachment[]> {
    return [...this.attachments.values()]
      .filter((a) => a.runId === runId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  async getAttachment(id: string): Promise<RunAttachment | null> {
    return this.attachments.get(id) ?? null;
  }
  async deleteAttachment(id: string): Promise<boolean> {
    return this.attachments.delete(id);
  }

  // Screenshot decisions -----------------------------------------------------
  async addScreenshotDecision(d: ScreenshotDecision): Promise<void> {
    this.decisions.push({ ...d });
  }
  async listScreenshotDecisions(runId: string): Promise<ScreenshotDecision[]> {
    return this.decisions
      .filter((d) => d.runId === runId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Monitors -----------------------------------------------------------------
  async createMonitor(m: Monitor): Promise<void> {
    this.monitors.set(m.id, { ...m });
    this.monitorVersions.set(m.id, 0);
  }
  async getMonitor(id: string): Promise<Monitor | null> {
    return this.monitors.get(id) ?? null;
  }
  async listMonitors(userId: string): Promise<Monitor[]> {
    return [...this.monitors.values()].filter((m) => m.userId === userId);
  }
  async updateMonitor(id: string, patch: Partial<Monitor>): Promise<void> {
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const m = this.monitors.get(id);
      if (!m) return;
      const expected = this.monitorVersions.get(id) ?? 0;
      await Promise.resolve();
      if ((this.monitorVersions.get(id) ?? 0) !== expected) continue;
      Object.assign(m, patch);
      if ('leasedUntil' in patch && patch.leasedUntil === undefined) delete m.leasedUntil;
      this.monitorVersions.set(id, expected + 1);
      return;
    }
    throw new Error(`optimistic concurrency conflict: monitor ${id}`);
  }
  async deleteMonitor(id: string, userId: string): Promise<boolean> {
    const m = this.monitors.get(id);
    if (m && m.userId === userId) return this.monitors.delete(id);
    return false;
  }
  async listDueMonitors(now: Date): Promise<Monitor[]> {
    return [...this.monitors.values()].filter((m) => isMonitorDue(m, now));
  }
  async tryClaimDueMonitor(id: string, now: Date, leaseTtlMs: number): Promise<Monitor | null> {
    return this.withMonitorClaimLock(id, async () => {
      const m = this.monitors.get(id);
      if (!m || !isMonitorDue(m, now)) return null;
      if (m.leasedUntil && new Date(m.leasedUntil).getTime() > now.getTime()) return null;
      const leasedUntil = new Date(now.getTime() + leaseTtlMs).toISOString();
      m.leasedUntil = leasedUntil;
      const version = this.monitorVersions.get(id) ?? 0;
      this.monitorVersions.set(id, version + 1);
      return { ...m };
    });
  }
  async addMonitorRun(run: MonitorRun): Promise<void> {
    this.monitorRuns.push({ ...run });
  }
  async listMonitorRuns(monitorId: string, limit = 50): Promise<MonitorRun[]> {
    return this.monitorRuns
      .filter((r) => r.monitorId === monitorId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  async pruneMonitorRuns(userId: string, cutoff: string): Promise<number> {
    const cut = new Date(cutoff).getTime();
    const before = this.monitorRuns.length;
    this.monitorRuns = this.monitorRuns.filter(
      (r) => r.userId !== userId || new Date(r.createdAt).getTime() >= cut,
    );
    return before - this.monitorRuns.length;
  }
  async getAlertState(monitorId: string): Promise<MonitorAlertState | null> {
    return this.alertState.get(monitorId) ?? null;
  }
  async setAlertState(state: MonitorAlertState): Promise<void> {
    this.alertState.set(state.monitorId, { ...state });
  }

  // Teams --------------------------------------------------------------------
  async createTeam(team: Team, ownerUserId: string): Promise<void> {
    this.teams.set(team.id, { ...team });
    this.teamVersions.set(team.id, 0);
    const member: TeamMember = {
      teamId: team.id,
      userId: ownerUserId,
      role: 'owner',
      createdAt: team.createdAt,
    };
    this.members.set(`${team.id}:${ownerUserId}`, member);
  }
  async getTeam(id: string): Promise<Team | null> {
    return this.teams.get(id) ?? null;
  }
  async getTeamByStripeSubscriptionId(subscriptionId: string): Promise<Team | null> {
    for (const team of this.teams.values()) {
      if (team.stripeSubscriptionId === subscriptionId) return team;
    }
    return null;
  }
  async updateTeam(id: string, patch: Partial<Team>): Promise<void> {
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const t = this.teams.get(id);
      if (!t) return;
      const expected = this.teamVersions.get(id) ?? 0;
      await Promise.resolve();
      if ((this.teamVersions.get(id) ?? 0) !== expected) continue;
      Object.assign(t, patch);
      this.teamVersions.set(id, expected + 1);
      return;
    }
    throw new Error(`optimistic concurrency conflict: team ${id}`);
  }
  async deleteTeam(id: string): Promise<boolean> {
    const projectIds = new Set(
      [...this.projects.values()].filter((p) => p.teamId === id).map((p) => p.id),
    );
    for (const [runId, entry] of this.runs) {
      if (entry.run.projectId != null && projectIds.has(entry.run.projectId)) {
        await this.deleteRun(runId, entry.userId);
      }
    }
    this.activity = this.activity.filter((a) => a.teamId !== id);
    for (const key of [...this.teamUsage.keys()]) {
      if (key.startsWith(`${id}:`)) this.teamUsage.delete(key);
    }
    for (const [key, m] of this.members) if (m.teamId === id) this.members.delete(key);
    for (const [key, p] of this.projects) if (p.teamId === id) this.projects.delete(key);
    for (const [key, inv] of this.invitations) if (inv.teamId === id) this.invitations.delete(key);
    return this.teams.delete(id);
  }
  async listTeamsForUser(userId: string): Promise<Array<Team & { role: TeamRole }>> {
    const out: Array<Team & { role: TeamRole }> = [];
    for (const m of this.members.values()) {
      if (m.userId === userId) {
        const t = this.teams.get(m.teamId);
        if (t) out.push({ ...t, role: m.role });
      }
    }
    return out;
  }

  async addMember(member: TeamMember): Promise<void> {
    // Match D1 ON CONFLICT semantics: update role on an existing membership
    // but preserve the original reviewer flag and createdAt.
    const key = `${member.teamId}:${member.userId}`;
    const existing = this.members.get(key);
    if (existing) {
      existing.role = member.role;
    } else {
      this.members.set(key, { ...member });
    }
  }
  async getMember(teamId: string, userId: string): Promise<TeamMember | null> {
    return this.members.get(`${teamId}:${userId}`) ?? null;
  }
  async listMembers(teamId: string): Promise<TeamMember[]> {
    return [...this.members.values()].filter((m) => m.teamId === teamId);
  }
  async updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
    const m = this.members.get(`${teamId}:${userId}`);
    if (m) m.role = role;
  }
  async setReviewer(teamId: string, userId: string, reviewer: boolean): Promise<void> {
    const m = this.members.get(`${teamId}:${userId}`);
    if (m) m.reviewer = reviewer;
  }
  async removeMember(teamId: string, userId: string): Promise<boolean> {
    return this.members.delete(`${teamId}:${userId}`);
  }

  async createInvitation(inv: TeamInvitation): Promise<void> {
    this.invitations.set(inv.token, { ...inv });
  }
  async getInvitationByToken(token: string): Promise<TeamInvitation | null> {
    return this.invitations.get(token) ?? null;
  }
  async listInvitations(teamId: string): Promise<TeamInvitation[]> {
    return [...this.invitations.values()].filter((i) => i.teamId === teamId && !i.acceptedAt);
  }
  async acceptInvitation(token: string, at: string): Promise<TeamInvitation | null> {
    const inv = this.invitations.get(token);
    if (!inv || inv.acceptedAt) return null;
    if (!inv.expiresAt || new Date(inv.expiresAt) <= new Date(at)) return null;
    inv.acceptedAt = at;
    return inv;
  }

  async createProject(project: TeamProject): Promise<void> {
    this.projects.set(project.id, { ...project });
  }
  async getProjectById(id: string): Promise<TeamProject | null> {
    return this.projects.get(id) ?? null;
  }
  async listProjects(teamId: string): Promise<TeamProject[]> {
    return [...this.projects.values()].filter((p) => p.teamId === teamId);
  }
  async deleteProject(id: string, teamId: string): Promise<boolean> {
    const p = this.projects.get(id);
    if (p && p.teamId === teamId) return this.projects.delete(id);
    return false;
  }

  async listProjectRuns(projectId: string, limit = 50, offset = 0): Promise<Run[]> {
    return [...this.runs.values()]
      .map((r) => r.run)
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);
  }
  async getProjectBaseline(projectId: string): Promise<Run | null> {
    const approved = [...this.runs.values()]
      .map((r) => r.run)
      .filter((r) => r.projectId === projectId && r.baselinesApproved)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return approved[0] ?? null;
  }

  async addApproval(approval: BaselineApproval): Promise<void> {
    this.approvals.push({ ...approval });
  }
  async listApprovals(runId: string): Promise<BaselineApproval[]> {
    return this.approvals
      .filter((a) => a.runId === runId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async recordActivity(activity: TeamActivity): Promise<void> {
    this.activity.push({ ...activity });
  }
  async listActivity(teamId: string, limit = 50): Promise<TeamActivity[]> {
    return this.activity
      .filter((a) => a.teamId === teamId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getTeamUsage(teamId: string, month: string): Promise<TeamUsage> {
    const members = await this.listMembers(teamId);
    const perMember = await Promise.all(
      members.map(async (m) => {
        const u = await this.getUsage(m.userId, month);
        return { userId: m.userId, runsCount: u.runsCount, screenshotsCount: u.screenshotsCount };
      }),
    );
    const pooled = this.teamUsage.get(`${teamId}:${month}`);
    return {
      month,
      runsCount: pooled?.runsCount ?? 0,
      screenshotsCount: pooled?.screenshotsCount ?? 0,
      memberCount: members.length,
      perMember,
    };
  }

  /** Test helper: wipe all data. */
  clear(): void {
    this.users.clear();
    this.apiKeys.clear();
    this.runs.clear();
    this.screenshots.clear();
    this.usage.clear();
    this.teamUsage.clear();
    this.monitors.clear();
    this.monitorRuns = [];
    this.alertState.clear();
    this.teams.clear();
    this.members.clear();
    this.invitations.clear();
    this.projects.clear();
    this.approvals = [];
    this.activity = [];
    this.masks.clear();
    this.attachments.clear();
    this.usageAlertState.clear();
    this.decisions = [];
  }
}

/** Convenience: current month as `YYYY-MM`. */
export function currentMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type { Run, RunResult };
export type {
  Monitor,
  MonitorAlerts,
  MonitorStore,
  MonitorRun,
  MonitorConfig,
  MonitorRunStatus,
  MonitorAlertState,
} from './monitors.js';
export type {
  Team,
  TeamMember,
  TeamInvitation,
  TeamProject,
  TeamRole,
  TeamStore,
  BaselineApproval,
  TeamActivity,
  TeamUsage,
} from './teams.js';
export type { IgnoreMask, MaskStore } from './masks.js';
export type { RunAttachment, AttachmentKind, AttachmentStore } from './attachments.js';
