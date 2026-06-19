import type { MonitorScreenshotRef } from '../monitor-screenshots.js';

/**
 * Monitor records and the monitor-store mixin (Task 6.1).
 *
 * A "monitor" is a saved configuration that runs visual checks against live
 * production URLs on a schedule (driven by a Workers Cron trigger). The cron
 * handler queries due monitors, runs them, and fires alerts on regressions.
 *
 * @module db/monitors
 */

/** Alert channel configuration for a monitor. */
export interface MonitorAlerts {
  /** Slack (or generic) incoming-webhook URL. */
  slack?: string;
  /** Email recipients. */
  email?: string[];
  /** PagerDuty Events API v2 routing (integration) key. */
  pagerduty?: string;
}

/** A saved monitor. */
export interface Monitor {
  id: string;
  userId: string;
  /** When set, approved project baselines take priority over last-run drift detection. */
  projectId?: string;
  name: string;
  url: string;
  routes: string[];
  viewports: number[];
  intervalMinutes: number;
  alertThreshold: number;
  alerts?: MonitorAlerts;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: string;
  createdAt: string;
}

/**
 * Alias for the saved monitor configuration. A "config" is the persisted
 * definition of what/when to check; a {@link MonitorRun} is one execution of it.
 */
export type MonitorConfig = Monitor;

/** The outcome status of a single monitor execution. */
export type MonitorRunStatus = 'passed' | 'regression' | 'error';

export type { MonitorScreenshotRef } from '../monitor-screenshots.js';

/**
 * A single execution of a monitor. Persisted to `monitor_runs` so history is
 * retained per monitor (not just the latest status on the monitor row).
 */
export interface MonitorRun {
  id: string;
  monitorId: string;
  userId: string;
  status: MonitorRunStatus;
  regressionsCount: number;
  /** How many attempts were made (1 = first try, 2 = one retry). */
  attempts: number;
  /**
   * Screenshots captured during the run. Each entry stores the original route
   * alongside the R2 key so nested paths round-trip (REL-2). Legacy rows may
   * still hold a bare `string[]` of R2 keys until rewritten.
   */
  screenshots?: MonitorScreenshotRef[] | string[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Per-monitor alert state used for deduplication and snoozing (Task 6.2).
 */
export interface MonitorAlertState {
  monitorId: string;
  /** Fingerprint of the last alerted regression set (for dedup). */
  lastFingerprint?: string;
  lastAlertAt?: string;
  /** ISO timestamp until which alerts are suppressed. */
  snoozedUntil?: string;
}

/** Storage operations for monitors (implemented by both stores). */
export interface MonitorStore {
  createMonitor(m: Monitor): Promise<void>;
  getMonitor(id: string): Promise<Monitor | null>;
  listMonitors(userId: string): Promise<Monitor[]>;
  updateMonitor(id: string, patch: Partial<Monitor>): Promise<void>;
  deleteMonitor(id: string, userId: string): Promise<boolean>;
  /**
   * Returns enabled monitors that are due to run — i.e. `lastRunAt` is null or
   * older than `intervalMinutes` relative to `now`.
   */
  listDueMonitors(now: Date): Promise<Monitor[]>;

  // Monitor run history (Task 6.1) ------------------------------------------
  /** Records a completed monitor execution. */
  addMonitorRun(run: MonitorRun): Promise<void>;
  /** Lists recent runs for a monitor, newest first. */
  listMonitorRuns(monitorId: string, limit?: number): Promise<MonitorRun[]>;
  /**
   * Deletes monitor runs older than `cutoff` (ISO string), scoped to a single
   * user. Used to enforce per-plan history retention without touching other
   * tenants' history. Returns the number of rows removed.
   */
  pruneMonitorRuns(userId: string, cutoff: string): Promise<number>;

  // Alert state (dedup + snooze, Task 6.2) ----------------------------------
  /** Returns the alert state for a monitor (or null if none recorded). */
  getAlertState(monitorId: string): Promise<MonitorAlertState | null>;
  /** Upserts the alert state for a monitor. */
  setAlertState(state: MonitorAlertState): Promise<void>;
}

/** Returns true if a monitor is due to run at `now`. */
export function isMonitorDue(monitor: Monitor, now: Date): boolean {
  if (!monitor.enabled) return false;
  if (!monitor.lastRunAt) return true;
  const last = new Date(monitor.lastRunAt).getTime();
  return now.getTime() - last >= monitor.intervalMinutes * 60_000;
}
