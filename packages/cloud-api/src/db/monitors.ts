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
}

/** A saved monitor. */
export interface Monitor {
  id: string;
  userId: string;
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
}

/** Returns true if a monitor is due to run at `now`. */
export function isMonitorDue(monitor: Monitor, now: Date): boolean {
  if (!monitor.enabled) return false;
  if (!monitor.lastRunAt) return true;
  const last = new Date(monitor.lastRunAt).getTime();
  return now.getTime() - last >= monitor.intervalMinutes * 60_000;
}
