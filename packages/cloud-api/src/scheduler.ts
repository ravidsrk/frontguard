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
 *   5. Dispatches alerts on regressions and check failures.
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
import { getScreenshotStore, type R2Bucket } from './storage/screenshots.js';
import { persistScreenshots, type PendingScreenshot } from './storage/persist-screenshots.js';
import type { BaselineRestore } from './daytona-runner.js';
import {
  baselineRestoreFromRefs,
  buildMonitorScreenshotRefs,
  parseMonitorScreenshots,
  promoteRefsForBaselineStorage,
  runIdFromR2Key,
  type MonitorScreenshotRef,
} from './monitor-screenshots.js';
import { recordDeadLetter } from './dead-letter.js';

/** Summary of a single scheduler tick (returned for logging/tests). */
export interface SchedulerTickResult {
  /** Monitors that were due at tick start. */
  checked: number;
  /** Monitors actually executed this tick (may be less than `checked`). */
  processed: number;
  /** Due monitors left for a later tick because of the per-tick cap. */
  deferred: number;
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

/**
 * Maximum monitors executed per cron tick. Each run can take up to 5 minutes;
 * the cron fires every 15 minutes, so unbounded sequential execution silently
 * drops late monitors when the Worker is killed (REL-4).
 */
export const MONITORS_PER_TICK = 3;

/** Parallel monitor executions within a single tick. */
export const MONITOR_CONCURRENCY = 2;

/**
 * Lease duration while a monitor executes (CONC-3). Covers two 5-minute sandbox
 * attempts; overlapping cron ticks cannot reclaim until this expires.
 */
export const MONITOR_LEASE_TTL_MS = 10 * 60_000;

/** Scheduler env: Worker bindings + alert delivery secrets. */
export type SchedulerEnv = Bindings & AlertEnv & ProcessorEnv;

interface CheckAttempt {
  run: Run;
  screenshotRefs: MonitorScreenshotRef[];
}

/**
 * Orders due monitors oldest-due-first so deferred monitors are prioritized on
 * the next tick and cannot be starved by short-interval monitors (REL-4).
 */
export function sortMonitorsByDuePriority(monitors: Monitor[]): Monitor[] {
  return [...monitors].sort((a, b) => {
    const aLast = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const bLast = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    if (aLast !== bLast) return aLast - bLast;
    return a.id.localeCompare(b.id);
  });
}

/** Builds a check-failure alert after the retry budget is exhausted (REL-6). */
function buildErrorAlert(monitor: Monitor, message: string): MonitorAlert {
  return {
    url: monitor.url,
    route: '(check failed)',
    viewport: 0,
    diffPercentage: 1,
    threshold: monitor.alertThreshold,
    kind: 'error',
    message,
  };
}

/**
 * Resolves baselines for the next monitor check (REL-2):
 *   1. Approved project baseline, when the monitor is project-scoped.
 *   2. Approved baseline via `baseline_approvals` on a prior process run.
 *   3. Most recent successful run's persisted screenshots (last-run-as-baseline).
 */
async function resolveMonitorBaseline(
  store: Store,
  monitor: Monitor,
  bucket: R2Bucket | undefined,
): Promise<BaselineRestore | undefined> {
  if (!bucket) return undefined;

  if (monitor.projectId) {
    const baselineRun = await store.getProjectBaseline(monitor.projectId);
    if (baselineRun) {
      const approvedRefs = buildMonitorScreenshotRefs(
        monitor.routes,
        (await store.listScreenshots(baselineRun.id)).filter((s) => s.type === 'baseline'),
      );
      const approved = baselineRestoreFromRefs(approvedRefs, bucket);
      if (approved) return approved;
    }
  }

  const priorRuns = await store.listMonitorRuns(monitor.id, 20);

  for (const prior of priorRuns) {
    const refs = parseMonitorScreenshots(prior.screenshots, monitor.routes);
    const runIds = [...new Set(refs.map((r) => runIdFromR2Key(r.r2Key)).filter((id): id is string => id != null))];
    for (const runId of runIds) {
      const approvals = await store.listApprovals(runId);
      if (approvals[0]?.status === 'approved') {
        const restore = baselineRestoreFromRefs(refs, bucket);
        if (restore) return restore;
      }
    }
  }

  for (const prior of priorRuns) {
    if (prior.status === 'error') continue;
    const refs = parseMonitorScreenshots(prior.screenshots, monitor.routes);
    const restore = baselineRestoreFromRefs(refs, bucket);
    if (restore) return restore;
  }
  return undefined;
}

/** Executes a single check attempt against a monitor's URL (REL-2 baseline wiring). */
async function attemptCheck(
  monitor: Monitor,
  now: Date,
  env: SchedulerEnv,
  store: Store,
): Promise<CheckAttempt> {
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

  const blobs = getScreenshotStore(env.SCREENSHOTS as R2Bucket | undefined);
  const onScreenshots = async (shots: PendingScreenshot[]): Promise<void> => {
    await persistScreenshots(store, blobs, monitor.userId, run.id, shots);
  };
  const baselineRestore = await resolveMonitorBaseline(store, monitor, env.SCREENSHOTS as R2Bucket | undefined);

  await processRun(run, env, onScreenshots, baselineRestore);

  const screenshotRefs = buildMonitorScreenshotRefs(
    monitor.routes,
    await store.listScreenshots(run.id),
  );
  return { run, screenshotRefs };
}

/**
 * Runs one monitor: executes a check (retrying once on failure), records a
 * history entry, meters usage, updates status, and fires alerts.
 */
export async function runMonitor(
  env: SchedulerEnv,
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
  let screenshotRefs: MonitorScreenshotRef[] = [];

  while (attempts < MAX_ATTEMPTS && !succeeded) {
    attempts++;
    try {
      const attempt = await attemptCheck(monitor, now, env, store);
      const { run } = attempt;
      screenshotRefs = attempt.screenshotRefs;

      // processRun marks failures on the run without throwing (REL-6).
      if (run.status === 'failed') {
        throw new Error(run.error ?? 'check failed');
      }

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

  if (status === 'error' && lastError) {
    alerts = [buildErrorAlert(monitor, lastError)];
  }

  // Persist the run history record.
  const monitorRun: MonitorRun = {
    id: crypto.randomUUID(),
    monitorId: monitor.id,
    userId: monitor.userId,
    status,
    regressionsCount: alerts.filter((a) => a.kind !== 'error').length,
    attempts,
    screenshots:
      screenshotRefs.length > 0 ? promoteRefsForBaselineStorage(screenshotRefs) : undefined,
    error: lastError,
    createdAt: now.toISOString(),
    completedAt: new Date().toISOString(),
  };
  await store.addMonitorRun(monitorRun);

  // Update the monitor's latest status and release the execution lease (CONC-3).
  await store.updateMonitor(monitor.id, {
    lastRunAt: now.toISOString(),
    lastStatus: status,
    leasedUntil: undefined,
  });

  // Meter usage against the owner's plan (the monitor run counts as one run).
  await store.incrementUsage(monitor.userId, currentMonth(now), 1, 0);

  if (alerts.length > 0) {
    await dispatchAlertsWithState(env, store, monitor, alerts, now, fetchImpl);
  }

  if (status === 'error' && lastError) {
    await recordDeadLetter(store, {
      kind: 'monitor',
      sourceId: monitor.id,
      userId: monitor.userId,
      error: lastError,
      attempt: attempts,
      context: { monitorRunId: monitorRun.id },
    });
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

/** Runs `fn` over `items` with at most `concurrency` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Executes one scheduler tick across all due monitors.
 */
export async function runScheduledChecks(
  env: SchedulerEnv,
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
  const eligible: Monitor[] = [];
  for (const monitor of due) {
    if (!(await canMonitor(monitor.userId))) {
      skipped++;
      continue;
    }
    eligible.push(monitor);
  }

  const ordered = sortMonitorsByDuePriority(eligible);
  const toProcess: Monitor[] = [];
  for (const monitor of ordered) {
    if (toProcess.length >= MONITORS_PER_TICK) break;
    const claimed = await store.tryClaimDueMonitor(monitor.id, now, MONITOR_LEASE_TTL_MS);
    if (claimed) toProcess.push(claimed);
  }
  const deferred = eligible.length - toProcess.length;

  await mapWithConcurrency(toProcess, MONITOR_CONCURRENCY, async (monitor) => {
    try {
      const { alerts, run } = await runMonitor(env, store, monitor, now, fetchImpl);
      if (alerts.length > 0) alerted++;
      if (run.status === 'error') errors++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      try {
        await recordDeadLetter(store, {
          kind: 'monitor',
          sourceId: monitor.id,
          userId: monitor.userId,
          error: message,
          attempt: 0,
          context: { phase: 'runScheduledChecks' },
        });
      } catch (dlErr) {
        console.warn('[scheduler] dead-letter write failed', dlErr);
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
  });

  return {
    checked: due.length,
    processed: toProcess.length,
    deferred,
    alerted,
    errors,
    pruned,
    skipped,
  };
}