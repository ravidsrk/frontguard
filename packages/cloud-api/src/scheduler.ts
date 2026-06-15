/**
 * Monitoring scheduler (Task 6.1).
 *
 * Invoked by a Cloudflare Workers Cron trigger. On each tick it:
 *   1. Loads monitors that are due (interval elapsed).
 *   2. Runs a visual check for each (via the processor / Daytona sandbox),
 *      retrying once on failure before marking the run as `error`.
 *   3. Persists a {@link MonitorRun} history record and updates the monitor's
 *      latest status.
 *   4. Meters usage against the owner's plan.
 *   5. Dispatches alerts on regressions.
 *   6. Prunes monitor-run history beyond the owner's plan retention window.
 *
 * The scheduled handler is exported and attached to the Worker's `scheduled`
 * lifecycle event in `index.ts`.
 *
 * @module scheduler
 */

import { getStore, type Bindings } from './db/factory.js';
import type { Monitor, MonitorRun, MonitorRunStatus } from './db/monitors.js';
import type { Store } from './db/store.js';
import { currentMonth } from './db/store.js';
import { processRun, type ProcessorEnv } from './processor.js';
import { dispatchAlertsWithState, type MonitorAlert, type AlertEnv } from './alerts/index.js';
import { getPlan, hasFeature } from './billing/plans.js';
import type { Run } from './types.js';

/** Summary of a single scheduler tick (returned for logging/tests). */
export interface SchedulerTickResult {
  checked: number;
  alerted: number;
  errors: number;
  pruned: number;
  /** Monitors skipped because the owner's plan lacks production monitoring. */
  skipped: number;
}

/** Result of executing a monitor: the alerts and the persisted run record. */
export interface MonitorExecution {
  alerts: MonitorAlert[];
  run: MonitorRun;
}

/** Maximum attempts per monitor execution (1 initial + 1 retry). */
const MAX_ATTEMPTS = 2;

/** Executes a single check attempt against a monitor's URL. */
async function attemptCheck(monitor: Monitor, now: Date, env: ProcessorEnv): Promise<Run> {
  const run: Run = {
    id: crypto.randomUUID(),
    status: 'queued',
    url: monitor.url,
    routes: monitor.routes.map((path) => ({ path })),
    viewports: monitor.viewports,
    browsers: ['chromium'],
    threshold: monitor.alertThreshold,
    ai: null,
    createdAt: now.toISOString(),
    results: null,
    reportUrl: null,
  };
  await processRun(run, env);
  return run;
}

/**
 * Runs one monitor: executes a check (retrying once on failure), records a
 * history entry, meters usage, updates status, and fires alerts.
 */
export async function runMonitor(
  env: Bindings & AlertEnv,
  store: Store,
  monitor: Monitor,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<MonitorExecution> {
  let alerts: MonitorAlert[] = [];
  let status: MonitorRunStatus = 'passed';
  let lastError: string | undefined;
  let attempts = 0;
  let succeeded = false;

  while (attempts < MAX_ATTEMPTS && !succeeded) {
    attempts++;
    try {
      const run = await attemptCheck(monitor, now, env);
      alerts = (run.results ?? [])
        .filter((r) => r.status === 'regression' || r.diffPercentage > monitor.alertThreshold)
        .map((r) => ({
          url: monitor.url,
          route: r.route,
          viewport: r.viewport,
          diffPercentage: r.diffPercentage,
          threshold: monitor.alertThreshold,
        }));
      status = alerts.length > 0 ? 'regression' : 'passed';
      lastError = undefined;
      succeeded = true;
    } catch (err) {
      status = 'error';
      alerts = [];
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // Persist the run history record.
  const monitorRun: MonitorRun = {
    id: crypto.randomUUID(),
    monitorId: monitor.id,
    userId: monitor.userId,
    status,
    regressionsCount: alerts.length,
    attempts,
    error: lastError,
    createdAt: now.toISOString(),
    completedAt: new Date().toISOString(),
  };
  await store.addMonitorRun(monitorRun);

  // Update the monitor's latest status.
  await store.updateMonitor(monitor.id, {
    lastRunAt: now.toISOString(),
    lastStatus: status,
  });

  // Meter usage against the owner's plan (the monitor run counts as one run).
  await store.incrementUsage(monitor.userId, currentMonth(now), 1, 0);

  if (alerts.length > 0) {
    await dispatchAlertsWithState(env, store, monitor, alerts, now, fetchImpl);
  }
  return { alerts, run: monitorRun };
}

/**
 * Prunes monitor-run history for a user beyond their plan's retention window.
 * Returns the number of rows removed.
 */
async function pruneForUser(store: Store, userId: string, now: Date): Promise<number> {
  const user = await store.getUser(userId);
  const plan = getPlan(user?.plan);
  const cutoff = new Date(now.getTime() - plan.limits.historyRetentionDays * 86_400_000).toISOString();
  return store.pruneMonitorRuns(userId, cutoff);
}

/**
 * Executes one scheduler tick across all due monitors.
 */
export async function runScheduledChecks(
  env: Bindings & AlertEnv,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<SchedulerTickResult> {
  const store = getStore(env);
  const due = await store.listDueMonitors(now);

  let alerted = 0;
  let errors = 0;
  const prunedUsers = new Set<string>();
  let pruned = 0;

  // Cache plan eligibility per user across the tick.
  const monitoringAllowed = new Map<string, boolean>();
  async function canMonitor(userId: string): Promise<boolean> {
    const cached = monitoringAllowed.get(userId);
    if (cached !== undefined) return cached;
    const user = await store.getUser(userId);
    const allowed = hasFeature(getPlan(user?.plan), 'productionMonitoring');
    monitoringAllowed.set(userId, allowed);
    return allowed;
  }

  let skipped = 0;
  for (const monitor of due) {
    // Gate execution on the owner's plan: a downgraded user's existing monitors
    // must not keep running on a plan without production monitoring.
    if (!(await canMonitor(monitor.userId))) {
      skipped++;
    } else {
      try {
        const { alerts, run } = await runMonitor(env, store, monitor, now, fetchImpl);
        if (alerts.length > 0) alerted++;
        if (run.status === 'error') errors++;
      } catch {
        errors++;
      }
    }
    // Prune each owner's history at most once per tick.
    if (!prunedUsers.has(monitor.userId)) {
      prunedUsers.add(monitor.userId);
      try {
        pruned += await pruneForUser(store, monitor.userId, now);
      } catch {
        /* non-fatal */
      }
    }
  }

  return { checked: due.length, alerted, errors, pruned, skipped };
}
