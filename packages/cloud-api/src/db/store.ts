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
import { erasureBlockedBySoleOwnership } from './account-erasure.js';
import { withUserMutation } from './account-writes.js';
import { deleteCasMemoryPrefix } from '../storage/cas-memory.js';
import { clampLimit } from '../limits.js';
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
import type {
  BackgroundFailure,
  BackgroundFailureStore,
  ListBackgroundFailuresOptions,
} from './background-failures.js';

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
  sandboxMinutesUsed?: number;
  aiCallsUsed?: number;
}

/** Deletes object-store bytes for one owned run / user prefix during account erasure. */
export interface RunBlobDeleter {
  deleteRun(userId: string, runId: string): Promise<void>;
  delete?(key: string): Promise<void>;
  deletePrefix?(prefix: string): Promise<void>;
}

/** Result of erasing one account. Counts are what that account owned before deletion. */
export interface AccountErasureResult {
  erased: boolean;
  userId: string;
  runs: number;
  baselines: number;
  reports: number;
  /**
   * Why the account was left in place. Omitted when `erased` is true.
   * `sole-owner` means another member would be left with nobody who can grant owner.
   * `blob-delete-failed` means object bytes may still exist, so the rows were kept.
   */
  reason?: 'sole-owner' | 'blob-delete-failed';
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
export interface Store extends MonitorStore, TeamStore, MaskStore, AttachmentStore, BackgroundFailureStore {
  // Users
  createUser(user: User): Promise<void>;
  getUser(id: string): Promise<User | null>;
  getUserByGithubId(githubId: string): Promise<User | null>;
  updateUserPlan(id: string, plan: string): Promise<void>;
  updateUserIdentity(id: string, patch: { email?: string; githubLogin?: string }): Promise<void>;
  /**
   * Deletes one account and the baselines, reports, and other rows it owns.
   * Other accounts are left intact. Closes writes, then deletes blobs, then
   * deletes rows. A blob-delete failure keeps the account so a later call can
   * retry. Refuses when the user is the only owner of a team that still has
   * another member. Does not touch accounts that do not match `userId`.
   */
  eraseAccount(userId: string, blobs?: RunBlobDeleter): Promise<AccountErasureResult>;
  /** Stop new screenshot writes for this account until erasure finishes or reopens. */
  closeAccountWrites(userId: string): Promise<void>;
  /** Allow screenshot writes again after an erasure attempt that kept the account. */
  reopenAccountWrites(userId: string): Promise<void>;
  /** True while an erasure attempt has closed writes and has not reopened them. */
  accountWritesClosed(userId: string): Promise<boolean>;
  /** When the write lock was closed, or null while writes are open. */
  accountWriteLockClosedAt(userId: string): Promise<string | null>;
  /**
   * Persist a finished run. While erasure has closed writes and the account
   * still exists, park the payload and apply it if writes reopen. Skip when
   * the account is already gone. `afterWritten` runs in the same per-user
   * queue as the update, before another mutation for this user can start.
   */
  commitFinishedRun(
    userId: string,
    run: Run,
    afterWritten?: () => Promise<void>,
  ): Promise<FinishedRunCommit>;

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
  /** Monotonically adds sandbox compute minutes for a user (never decremented on run deletion). */
  addSandboxMinutes(userId: string, month: string, minutes: number): Promise<void>;
  /** Monotonically adds sandbox compute minutes for a team (never decremented on run deletion). */
  addTeamSandboxMinutes(teamId: string, month: string, minutes: number): Promise<void>;
  /** Atomically reserves `amount` AI calls if usage + amount <= limit. */
  tryReserveAiCalls(userId: string, month: string, limit: number, amount: number): Promise<boolean>;
  /** Atomically reserves `amount` team AI calls if usage + amount <= limit. */
  tryReserveTeamAiCalls(teamId: string, month: string, limit: number, amount: number): Promise<boolean>;
  incrementAiCalls(userId: string, month: string, amount: number): Promise<void>;
  incrementTeamAiCalls(teamId: string, month: string, amount: number): Promise<void>;
  /**
   * Records a Stripe webhook event id for idempotency. Returns true if the
   * event was newly recorded, false if it was already processed.
   */
  recordStripeEvent(eventId: string, eventType: string, created: number, teamId?: string): Promise<boolean>;
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

/** What happened to a finished run that raced an account erasure. */
export type FinishedRunCommit = 'written' | 'pending' | 'skipped';

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
  /** Accounts whose screenshot writes must no-op until erasure reopens or finishes. */
  private closedWrites = new Map<string, string>();
  /** Finished runs waiting for an erasure lock to reopen. */
  private pendingRunUpdates = new Map<string, { userId: string; run: Run }>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private runs = new Map<string, { run: Run; userId: string }>();
  private runVersions = new Map<string, number>();
  private monitorVersions = new Map<string, number>();
  private teamVersions = new Map<string, number>();
  private screenshots = new Map<string, ScreenshotRecord[]>();
  private usage = new Map<string, UsageRecord>();
  private teamUsage = new Map<
    string,
    {
      teamId: string;
      month: string;
      runsCount: number;
      screenshotsCount: number;
      sandboxMinutesUsed: number;
      aiCallsUsed: number;
    }
  >();
  private stripeEvents = new Map<string, { eventType: string; created: number; teamId?: string; processedAt: string }>();
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
  private backgroundFailures: BackgroundFailure[] = [];

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

  async eraseAccount(userId: string, blobs?: RunBlobDeleter): Promise<AccountErasureResult> {
    return withUserMutation(userId, () => this.eraseAccountUnlocked(userId, blobs));
  }

  async closeAccountWrites(userId: string): Promise<void> {
    this.closedWrites.set(userId, new Date().toISOString());
  }
  async reopenAccountWrites(userId: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.flushPendingRunUpdates(userId);
      if (!this.hasPendingRunUpdate(userId)) {
        this.closedWrites.delete(userId);
        await this.flushPendingRunUpdates(userId);
        return;
      }
    }
    await this.flushPendingRunUpdates(userId);
    this.closedWrites.delete(userId);
    await this.flushPendingRunUpdates(userId);
  }
  async accountWritesClosed(userId: string): Promise<boolean> {
    return this.closedWrites.has(userId);
  }
  async accountWriteLockClosedAt(userId: string): Promise<string | null> {
    return this.closedWrites.get(userId) ?? null;
  }
  async commitFinishedRun(
    userId: string,
    run: Run,
    afterWritten?: () => Promise<void>,
  ): Promise<FinishedRunCommit> {
    return withUserMutation(userId, async () => {
      if (!(await this.getUser(userId))) {
        this.pendingRunUpdates.delete(run.id);
        return 'skipped';
      }
      if (this.closedWrites.has(userId)) {
        this.pendingRunUpdates.set(run.id, { userId, run: { ...run } });
      }
      if (!(await this.getUser(userId))) {
        this.pendingRunUpdates.delete(run.id);
        return 'skipped';
      }
      if (!this.closedWrites.has(userId)) {
        this.pendingRunUpdates.delete(run.id);
        await this.updateRun(run.id, run);
        await afterWritten?.();
        return 'written';
      }
      return 'pending';
    });
  }

  private hasPendingRunUpdate(userId: string): boolean {
    for (const pending of this.pendingRunUpdates.values()) {
      if (pending.userId === userId) return true;
    }
    return false;
  }

  private async flushPendingRunUpdates(userId: string): Promise<void> {
    const pending = [...this.pendingRunUpdates.entries()].filter(([, item]) => item.userId === userId);
    for (const [runId, item] of pending) {
      if (this.pendingRunUpdates.get(runId) !== item) continue;
      this.pendingRunUpdates.delete(runId);
      await this.updateRun(runId, item.run);
    }
  }

  private dropPendingRunUpdates(userId: string): void {
    for (const [runId, item] of this.pendingRunUpdates) {
      if (item.userId === userId) this.pendingRunUpdates.delete(runId);
    }
  }

  private async eraseAccountUnlocked(userId: string, blobs?: RunBlobDeleter): Promise<AccountErasureResult> {
    const user = this.users.get(userId);
    if (!user) return { erased: false, userId, runs: 0, baselines: 0, reports: 0 };

    const memberships = [...this.members.values()].map((member) => ({
      teamId: member.teamId,
      userId: member.userId,
      role: member.role,
    }));
    if (erasureBlockedBySoleOwnership(userId, memberships)) {
      return { erased: false, userId, runs: 0, baselines: 0, reports: 0, reason: 'sole-owner' };
    }

    // Close writes BEFORE snapshotting owned runs/blobs so concurrent uploads
    // cannot slip past the listing window.
    await this.closeAccountWrites(userId);

    const ownedIds: string[] = [];
    let baselines = 0;
    let reports = 0;
    for (const [id, entry] of this.runs) {
      if (entry.userId !== userId) continue;
      ownedIds.push(id);
      if (entry.run.reportHtml) reports++;
      baselines += (this.screenshots.get(id) ?? []).filter((shot) => shot.type === 'baseline').length;
    }

    // Identify solo teams where userId is the only member (so they are deleted cleanly).
    const teamMembersByTeam = new Map<string, TeamMember[]>();
    for (const m of this.members.values()) {
      const list = teamMembersByTeam.get(m.teamId) ?? [];
      list.push(m);
      teamMembersByTeam.set(m.teamId, list);
    }
    const soloTeamIds: string[] = [];
    for (const [teamId, teamMembers] of teamMembersByTeam) {
      if (teamMembers.length === 1 && teamMembers[0]!.userId === userId) {
        soloTeamIds.push(teamId);
      }
    }
    const soloTeamSet = new Set(soloTeamIds);
    const soloProjectIds = new Set(
      [...this.projects.values()].filter((p) => soloTeamSet.has(p.teamId)).map((p) => p.id),
    );
    const soloTeamRuns: Array<{ runId: string; ownerId: string }> = [];
    for (const [runId, entry] of this.runs) {
      if (entry.run.projectId && soloProjectIds.has(entry.run.projectId) && entry.userId !== userId) {
        soloTeamRuns.push({ runId, ownerId: entry.userId });
      }
    }

    const ownedIdSet = new Set(ownedIds);
    const attachmentKeysToDelete = new Set<string>();
    for (const att of this.attachments.values()) {
      if (ownedIdSet.has(att.runId) || att.r2Key.startsWith(`${userId}/`)) {
        attachmentKeysToDelete.add(att.r2Key);
      }
    }

    if (blobs) {
      try {
        for (const id of ownedIds) {
          await blobs.deleteRun(userId, id);
        }
        for (const key of attachmentKeysToDelete) {
          await blobs.delete?.(key);
        }
        await blobs.deletePrefix?.(`${userId}/`);
        await blobs.deletePrefix?.(`cas/${userId}/`);
        for (const solo of soloTeamRuns) {
          await blobs.deleteRun(solo.ownerId, solo.runId);
        }
        for (const soloTeamId of soloTeamIds) {
          await blobs.deletePrefix?.(`cas/${soloTeamId}/`);
        }
      } catch {
        await this.reopenAccountWrites(userId);
        return {
          erased: false,
          userId,
          runs: ownedIds.length,
          baselines,
          reports,
          reason: 'blob-delete-failed',
        };
      }
    }

    // Re-verify sole ownership immediately before deleting DB rows (closes co-owner race).
    const latestMemberships = [...this.members.values()].map((member) => ({
      teamId: member.teamId,
      userId: member.userId,
      role: member.role,
    }));
    if (erasureBlockedBySoleOwnership(userId, latestMemberships)) {
      await this.reopenAccountWrites(userId);
      return { erased: false, userId, runs: 0, baselines: 0, reports: 0, reason: 'sole-owner' };
    }

    deleteCasMemoryPrefix(`cas/${userId}/`);
    for (const soloTeamId of soloTeamIds) {
      deleteCasMemoryPrefix(`cas/${soloTeamId}/`);
    }

    for (const id of ownedIds) {
      await this.deleteRun(id, userId);
      this.runVersions.delete(id);
    }
    // Delete any cross-user attachments uploaded by this user on other runs.
    for (const [attId, att] of this.attachments) {
      if (att.r2Key.startsWith(`${userId}/`)) this.attachments.delete(attId);
    }

    this.approvals = this.approvals.filter((approval) => approval.reviewerUserId !== userId);
    this.decisions = this.decisions.filter((decision) => decision.userId !== userId);
    for (const [hash, key] of this.apiKeys) {
      if (key.userId === userId) this.apiKeys.delete(hash);
    }
    for (const key of [...this.usage.keys()]) {
      if (key.startsWith(`${userId}:`)) this.usage.delete(key);
    }
    for (const key of [...this.usageAlertState.keys()]) {
      if (key.startsWith(`${userId}:`)) this.usageAlertState.delete(key);
    }
    for (const [id, mask] of this.masks) {
      if (mask.userId === userId) this.masks.delete(id);
    }

    const monitorIds = [...this.monitors.values()].filter((monitor) => monitor.userId === userId).map((monitor) => monitor.id);
    for (const id of monitorIds) {
      this.monitors.delete(id);
      this.monitorVersions.delete(id);
      this.alertState.delete(id);
    }
    const monitorIdSet = new Set(monitorIds);
    this.monitorRuns = this.monitorRuns.filter(
      (run) => run.userId !== userId && !monitorIdSet.has(run.monitorId),
    );

    // Delete solo teams cleanly (including Stripe ids, projects, usage, activity).
    for (const soloTeamId of soloTeamIds) {
      await this.deleteTeam(soloTeamId);
    }
    for (const [key, member] of this.members) {
      if (member.userId === userId) this.members.delete(key);
    }

    // Remove activity authored by userId and redact PII from other teams' activity targets.
    const emailLower = user.email?.toLowerCase();
    const loginLower = user.githubLogin?.toLowerCase();
    this.activity = this.activity
      .filter((entry) => entry.userId !== userId)
      .map((entry) => {
        const targetLower = entry.target?.toLowerCase();
        const matchesTarget =
          entry.target === userId ||
          (emailLower != null && targetLower === emailLower) ||
          (loginLower != null && targetLower === loginLower);
        if (matchesTarget) {
          return { ...entry, target: '[erased]', metadata: undefined };
        }
        return entry;
      });

    // Delete invitations matching either email or github_login.
    for (const [token, invitation] of this.invitations) {
      if (
        (emailLower != null && invitation.email && invitation.email.toLowerCase() === emailLower) ||
        (loginLower != null && invitation.githubLogin && invitation.githubLogin.toLowerCase() === loginLower)
      ) {
        this.invitations.delete(token);
      }
    }

    this.backgroundFailures = this.backgroundFailures.filter(
      (failure) =>
        failure.userId !== userId && !ownedIdSet.has(failure.sourceId) && !monitorIdSet.has(failure.sourceId),
    );
    this.dropPendingRunUpdates(userId);
    this.users.delete(userId);
    return { erased: true, userId, runs: ownedIds.length, baselines, reports };
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
    const safeLimit = clampLimit(limit, 50, 200);
    const teamSet = new Set(teamIds);
    const teamProjectIds = new Set(
      [...this.projects.values()].filter((p) => teamSet.has(p.teamId)).map((p) => p.id),
    );
    return [...this.runs.values()]
      .filter((entry) => {
        const projectId = entry.run.projectId;
        const isRegisteredProject = projectId != null && this.projects.has(projectId);
        if (isRegisteredProject) {
          return teamProjectIds.has(projectId);
        }
        return includeOwn && entry.userId === userId;
      })
      .map((entry) => {
        const { reportHtml: _omit, ...summary } = entry.run;
        return summary;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
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
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.runsCount += runs;
      cur.screenshotsCount += screenshots;
      this.usage.set(key, cur);
    });
  }

  async tryReserveRun(userId: string, month: string, limit: number): Promise<boolean> {
    const key = `${userId}:${month}`;
    return this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
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
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      if (cur.screenshotsCount + amount > limit) return false;
      cur.screenshotsCount += amount;
      this.usage.set(key, cur);
      return true;
    });
  }
  async tryReserveTeamRun(teamId: string, month: string, limit: number): Promise<boolean> {
    const key = `${teamId}:${month}`;
    return this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
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
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      if (cur.screenshotsCount + amount > limit) return false;
      cur.screenshotsCount += amount;
      this.teamUsage.set(key, cur);
      return true;
    });
  }

  async incrementTeamUsage(teamId: string, month: string, runs: number, screenshots: number): Promise<void> {
    const key = `${teamId}:${month}`;
    await this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.runsCount += runs;
      cur.screenshotsCount += screenshots;
      this.teamUsage.set(key, cur);
    });
  }

  async addSandboxMinutes(userId: string, month: string, minutes: number): Promise<void> {
    const delta = Math.max(0, Math.ceil(minutes));
    if (delta <= 0) return;
    const key = `${userId}:${month}`;
    await this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.sandboxMinutesUsed = (cur.sandboxMinutesUsed ?? 0) + delta;
      this.usage.set(key, cur);
    });
  }

  async addTeamSandboxMinutes(teamId: string, month: string, minutes: number): Promise<void> {
    const delta = Math.max(0, Math.ceil(minutes));
    if (delta <= 0) return;
    const key = `${teamId}:${month}`;
    await this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.sandboxMinutesUsed += delta;
      this.teamUsage.set(key, cur);
    });
  }

  async tryReserveAiCalls(userId: string, month: string, limit: number, amount: number): Promise<boolean> {
    if (amount <= 0) return true;
    const key = `${userId}:${month}`;
    return this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      const used = cur.aiCallsUsed ?? 0;
      if (used + amount > limit) return false;
      cur.aiCallsUsed = used + amount;
      this.usage.set(key, cur);
      return true;
    });
  }

  async tryReserveTeamAiCalls(teamId: string, month: string, limit: number, amount: number): Promise<boolean> {
    if (amount <= 0) return true;
    const key = `${teamId}:${month}`;
    return this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      if (cur.aiCallsUsed + amount > limit) return false;
      cur.aiCallsUsed += amount;
      this.teamUsage.set(key, cur);
      return true;
    });
  }

  async incrementAiCalls(userId: string, month: string, amount: number): Promise<void> {
    if (amount === 0) return;
    const key = `${userId}:${month}`;
    await this.withUsageLock(key, async () => {
      const cur = this.usage.get(key) ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.aiCallsUsed = Math.max(0, (cur.aiCallsUsed ?? 0) + amount);
      this.usage.set(key, cur);
    });
  }

  async incrementTeamAiCalls(teamId: string, month: string, amount: number): Promise<void> {
    if (amount === 0) return;
    const key = `${teamId}:${month}`;
    await this.withTeamUsageLock(key, async () => {
      const cur = this.teamUsage.get(key) ?? {
        teamId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      };
      cur.aiCallsUsed = Math.max(0, cur.aiCallsUsed + amount);
      this.teamUsage.set(key, cur);
    });
  }

  async recordStripeEvent(eventId: string, eventType: string, created: number, teamId?: string): Promise<boolean> {
    if (this.stripeEvents.has(eventId)) return false;
    this.stripeEvents.set(eventId, {
      eventType,
      created,
      teamId,
      processedAt: new Date().toISOString(),
    });
    return true;
  }

  async getUsage(userId: string, month: string): Promise<UsageRecord> {
    const cur = this.usage.get(`${userId}:${month}`);
    return (
      cur ?? {
        userId,
        month,
        runsCount: 0,
        screenshotsCount: 0,
        sandboxMinutesUsed: 0,
        aiCallsUsed: 0,
      }
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
      if ('projectId' in patch && patch.projectId === undefined) delete m.projectId;
      this.monitorVersions.set(id, expected + 1);
      return;
    }
    throw new Error(`optimistic concurrency conflict: monitor ${id}`);
  }
  async deleteMonitor(id: string, userId: string): Promise<boolean> {
    const m = this.monitors.get(id);
    if (m && m.userId === userId) {
      this.monitors.delete(id);
      this.monitorVersions.delete(id);
      this.alertState.delete(id);
      this.monitorRuns = this.monitorRuns.filter((r) => r.monitorId !== id);
      return true;
    }
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
    const safeLimit = clampLimit(limit, 50, 200);
    return this.monitorRuns
      .filter((r) => r.monitorId === monitorId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
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

  // Background failures (OPS-3) ----------------------------------------------
  async recordBackgroundFailure(failure: BackgroundFailure): Promise<void> {
    if (failure.userId && !this.users.has(failure.userId)) return;
    this.backgroundFailures.push({ ...failure, context: failure.context ? { ...failure.context } : undefined });
  }
  async listBackgroundFailures(opts: ListBackgroundFailuresOptions = {}): Promise<BackgroundFailure[]> {
    const { kind, sourceId, limit = 50 } = opts;
    const safeLimit = clampLimit(limit, 50, 200);
    return this.backgroundFailures
      .filter((f) => (kind == null || f.kind === kind) && (sourceId == null || f.sourceId === sourceId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
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
  async getTeamByStripeCustomerId(customerId: string): Promise<Team | null> {
    for (const team of this.teams.values()) {
      if (team.stripeCustomerId === customerId) return team;
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
    // Mirror D1 ON DELETE SET NULL on monitors.project_id.
    for (const monitor of this.monitors.values()) {
      if (monitor.projectId && projectIds.has(monitor.projectId)) {
        delete monitor.projectId;
      }
    }
    this.approvals = this.approvals.filter((a) => !a.projectId || !projectIds.has(a.projectId));
    this.activity = this.activity.filter((a) => a.teamId !== id);
    for (const key of [...this.teamUsage.keys()]) {
      if (key.startsWith(`${id}:`)) this.teamUsage.delete(key);
    }
    for (const [key, m] of this.members) if (m.teamId === id) this.members.delete(key);
    for (const [key, p] of this.projects) if (p.teamId === id) this.projects.delete(key);
    for (const [key, inv] of this.invitations) if (inv.teamId === id) this.invitations.delete(key);
    this.teamVersions.delete(id);
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
    const now = Date.now();
    return [...this.invitations.values()].filter(
      (i) =>
        i.teamId === teamId &&
        !i.acceptedAt &&
        Boolean(i.expiresAt && new Date(i.expiresAt).getTime() > now),
    );
  }
  async acceptInvitation(token: string, at: string): Promise<TeamInvitation | null> {
    const inv = this.invitations.get(token);
    if (!inv || inv.acceptedAt) return null;
    if (!inv.expiresAt || new Date(inv.expiresAt) <= new Date(at)) return null;
    inv.acceptedAt = at;
    return inv;
  }
  async revokeInvitation(id: string, teamId: string): Promise<boolean> {
    for (const [token, inv] of this.invitations) {
      if (inv.id === id && inv.teamId === teamId && !inv.acceptedAt) {
        this.invitations.delete(token);
        return true;
      }
    }
    return false;
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
    if (!p || p.teamId !== teamId) return false;
    // Mirror D1 ON DELETE CASCADE for project-scoped runs/approvals and ON DELETE SET NULL for monitors.
    for (const [runId, entry] of this.runs) {
      if (entry.run.projectId === id) {
        await this.deleteRun(runId, entry.userId);
      }
    }
    this.approvals = this.approvals.filter((a) => a.projectId !== id);
    for (const monitor of this.monitors.values()) {
      if (monitor.projectId === id) {
        delete monitor.projectId;
      }
    }
    return this.projects.delete(id);
  }

  async listProjectRuns(projectId: string, limit = 50, offset = 0, userId?: string): Promise<Run[]> {
    const safeLimit = clampLimit(limit, 50, 500);
    const safeOffset = Math.max(0, Math.floor(offset));
    const isRegisteredProject = (await this.getProjectById(projectId)) !== null;
    return [...this.runs.values()]
      .filter((entry) => {
        const r = entry.run;
        if (r.projectId === projectId && (isRegisteredProject || !userId || entry.userId === userId)) {
          return true;
        }
        return Boolean(
          userId &&
            entry.userId === userId &&
            r.github?.owner &&
            r.github?.repo &&
            `${r.github.owner}/${r.github.repo}` === projectId,
        );
      })
      .map((entry) => {
        const { reportHtml: _omit, ...summary } = entry.run;
        return summary;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(safeOffset, safeOffset + safeLimit);
  }
  async getProjectBaseline(projectId: string, userId?: string): Promise<Run | null> {
    const isRegisteredProject = (await this.getProjectById(projectId)) !== null;
    const approved = [...this.runs.values()]
      .filter((entry) => {
        const r = entry.run;
        if (!r.baselinesApproved) return false;
        if (r.projectId === projectId && (isRegisteredProject || !userId || entry.userId === userId)) {
          return true;
        }
        return Boolean(
          userId &&
            entry.userId === userId &&
            r.github?.owner &&
            r.github?.repo &&
            `${r.github.owner}/${r.github.repo}` === projectId,
        );
      })
      .map((entry) => {
        const { reportHtml: _omit, ...summary } = entry.run;
        return summary;
      })
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
    const safeLimit = clampLimit(limit, 50, 200);
    return this.activity
      .filter((a) => a.teamId === teamId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, safeLimit);
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
      sandboxMinutesUsed: pooled?.sandboxMinutesUsed ?? 0,
      aiCallsUsed: pooled?.aiCallsUsed ?? 0,
      memberCount: members.length,
      perMember,
    };
  }

  /** Test helper: wipe all data. */
  clear(): void {
    this.users.clear();
    this.closedWrites.clear();
    this.pendingRunUpdates.clear();
    this.apiKeys.clear();
    this.runs.clear();
    this.runVersions.clear();
    this.monitorVersions.clear();
    this.teamVersions.clear();
    this.screenshots.clear();
    this.usage.clear();
    this.teamUsage.clear();
    this.stripeEvents.clear();
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
    this.backgroundFailures = [];
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
