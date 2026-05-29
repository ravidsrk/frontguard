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
import type { Monitor, MonitorStore } from './monitors.js';
import { isMonitorDue } from './monitors.js';

/** A user record. */
export interface User {
  id: string;
  githubId?: string;
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

/**
 * Persistent storage contract. All methods are async to accommodate D1.
 */
export interface Store extends MonitorStore {
  // Users
  createUser(user: User): Promise<void>;
  getUser(id: string): Promise<User | null>;
  getUserByGithubId(githubId: string): Promise<User | null>;
  updateUserPlan(id: string, plan: string): Promise<void>;

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
  listRuns(userId: string, limit?: number): Promise<Run[]>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  deleteRun(id: string, userId: string): Promise<boolean>;

  // Screenshots
  addScreenshot(rec: ScreenshotRecord): Promise<void>;
  listScreenshots(runId: string): Promise<ScreenshotRecord[]>;

  // Usage
  incrementUsage(userId: string, month: string, runs: number, screenshots: number): Promise<void>;
  getUsage(userId: string, month: string): Promise<UsageRecord>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (default — dev & tests)
// ---------------------------------------------------------------------------

/**
 * In-memory store. Data is lost on restart — used for local dev and tests.
 */
export class InMemoryStore implements Store {
  private users = new Map<string, User>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private runs = new Map<string, { run: Run; userId: string }>();
  private screenshots = new Map<string, ScreenshotRecord[]>();
  private usage = new Map<string, UsageRecord>();
  private monitors = new Map<string, Monitor>();

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
  }
  async getRun(id: string): Promise<Run | null> {
    return this.runs.get(id)?.run ?? null;
  }
  async getRunOwner(id: string): Promise<string | null> {
    return this.runs.get(id)?.userId ?? null;
  }
  async listRuns(userId: string, limit = 50): Promise<Run[]> {
    return [...this.runs.values()]
      .filter((r) => r.userId === userId)
      .map((r) => r.run)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  async updateRun(id: string, patch: Partial<Run>): Promise<void> {
    const entry = this.runs.get(id);
    if (entry) Object.assign(entry.run, patch);
  }
  async deleteRun(id: string, userId: string): Promise<boolean> {
    const entry = this.runs.get(id);
    if (entry && entry.userId === userId) return this.runs.delete(id);
    return false;
  }

  async addScreenshot(rec: ScreenshotRecord): Promise<void> {
    const list = this.screenshots.get(rec.runId) ?? [];
    list.push({ ...rec });
    this.screenshots.set(rec.runId, list);
  }
  async listScreenshots(runId: string): Promise<ScreenshotRecord[]> {
    return this.screenshots.get(runId) ?? [];
  }

  async incrementUsage(userId: string, month: string, runs: number, screenshots: number): Promise<void> {
    const key = `${userId}:${month}`;
    const cur = this.usage.get(key) ?? { userId, month, runsCount: 0, screenshotsCount: 0 };
    cur.runsCount += runs;
    cur.screenshotsCount += screenshots;
    this.usage.set(key, cur);
  }
  async getUsage(userId: string, month: string): Promise<UsageRecord> {
    return (
      this.usage.get(`${userId}:${month}`) ?? { userId, month, runsCount: 0, screenshotsCount: 0 }
    );
  }

  // Monitors -----------------------------------------------------------------
  async createMonitor(m: Monitor): Promise<void> {
    this.monitors.set(m.id, { ...m });
  }
  async getMonitor(id: string): Promise<Monitor | null> {
    return this.monitors.get(id) ?? null;
  }
  async listMonitors(userId: string): Promise<Monitor[]> {
    return [...this.monitors.values()].filter((m) => m.userId === userId);
  }
  async updateMonitor(id: string, patch: Partial<Monitor>): Promise<void> {
    const m = this.monitors.get(id);
    if (m) Object.assign(m, patch);
  }
  async deleteMonitor(id: string, userId: string): Promise<boolean> {
    const m = this.monitors.get(id);
    if (m && m.userId === userId) return this.monitors.delete(id);
    return false;
  }
  async listDueMonitors(now: Date): Promise<Monitor[]> {
    return [...this.monitors.values()].filter((m) => isMonitorDue(m, now));
  }

  /** Test helper: wipe all data. */
  clear(): void {
    this.users.clear();
    this.apiKeys.clear();
    this.runs.clear();
    this.screenshots.clear();
    this.usage.clear();
    this.monitors.clear();
  }
}

/** Convenience: current month as `YYYY-MM`. */
export function currentMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type { Run, RunResult };
export type { Monitor, MonitorAlerts, MonitorStore } from './monitors.js';
