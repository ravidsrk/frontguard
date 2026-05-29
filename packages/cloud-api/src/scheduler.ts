/**
 * Monitoring scheduler (Task 6.1).
 *
 * Invoked by a Cloudflare Workers Cron trigger. On each tick it:
 *   1. Loads monitors that are due (interval elapsed).
 *   2. Runs a visual check for each (via the processor / Daytona sandbox).
 *   3. Records the outcome and dispatches alerts on regressions.
 *
 * The scheduled handler is exported and attached to the Worker's `scheduled`
 * lifecycle event in `index.ts`.
 *
 * @module scheduler
 */

import { getStore, type Bindings } from './db/factory.js';
import type { Monitor } from './db/monitors.js';
import type { Store } from './db/store.js';
import { processRun } from './processor.js';
import { dispatchAlerts, type MonitorAlert, type AlertEnv } from './alerts/index.js';
import type { Run } from './types.js';

/** Summary of a single scheduler tick (returned for logging/tests). */
export interface SchedulerTickResult {
  checked: number;
  alerted: number;
  errors: number;
}

/**
 * Runs one monitor: executes a check, updates its status, and fires alerts.
 * Returns the regressions detected (for aggregation/testing).
 */
export async function runMonitor(
  env: Bindings & AlertEnv,
  store: Store,
  monitor: Monitor,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<MonitorAlert[]> {
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

  let alerts: MonitorAlert[] = [];
  let status = 'passed';
  try {
    await processRun(run);
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
  } catch (err) {
    status = 'error';
    alerts = [];
    void err;
  }

  await store.updateMonitor(monitor.id, {
    lastRunAt: now.toISOString(),
    lastStatus: status,
  });

  if (alerts.length > 0) {
    await dispatchAlerts(env, monitor, alerts, fetchImpl);
  }
  return alerts;
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
  for (const monitor of due) {
    try {
      const alerts = await runMonitor(env, store, monitor, now, fetchImpl);
      if (alerts.length > 0) alerted++;
    } catch {
      errors++;
    }
  }

  return { checked: due.length, alerted, errors };
}
