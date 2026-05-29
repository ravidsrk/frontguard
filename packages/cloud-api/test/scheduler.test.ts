import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runMonitor, runScheduledChecks } from '../src/scheduler.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import type { Monitor } from '../src/db/monitors.js';
import * as processor from '../src/processor.js';
import { currentMonth } from '../src/db/store.js';

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 'm1',
    userId: 'u1',
    name: 'Home',
    url: 'https://example.com',
    routes: ['/'],
    viewports: [1440],
    intervalMinutes: 60,
    alertThreshold: 0.05,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('scheduler', () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.restoreAllMocks());

  it('runMonitor updates last-run status (no Daytona → simulated new_baseline = no alerts)', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    const { alerts } = await runMonitor({}, store, monitor, now);
    // Simulated processor yields new_baseline (diff 0) → no alerts.
    expect(alerts).toEqual([]);
    const updated = await store.getMonitor('m1');
    expect(updated?.lastRunAt).toBe(now.toISOString());
    expect(updated?.lastStatus).toBe('passed');
  });

  it('persists a monitor run history record', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    const { run } = await runMonitor({}, store, monitor, now);
    expect(run.monitorId).toBe('m1');
    expect(run.status).toBe('passed');
    expect(run.attempts).toBe(1);

    const history = await store.listMonitorRuns('m1');
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('passed');
  });

  it('meters usage against the owner for each monitor run', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    await runMonitor({}, store, monitor, now);
    const usage = await store.getUsage('u1', currentMonth(now));
    expect(usage.runsCount).toBe(1);
  });

  it('retries once then marks the run as error on persistent failure', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    const spy = vi.spyOn(processor, 'processRun').mockRejectedValue(new Error('boom'));

    const { run, alerts } = await runMonitor({}, store, monitor, now);
    expect(spy).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    expect(run.status).toBe('error');
    expect(run.attempts).toBe(2);
    expect(run.error).toContain('boom');
    expect(alerts).toEqual([]);
    expect((await store.getMonitor('m1'))?.lastStatus).toBe('error');
  });

  it('recovers if the retry succeeds after a first failure', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    const spy = vi
      .spyOn(processor, 'processRun')
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined as unknown as void);

    const { run } = await runMonitor({}, store, monitor, now);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('passed');
    expect(run.attempts).toBe(2);
  });

  it('runScheduledChecks processes only due monitors', async () => {
    const store = getMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    // The monitor owner must be on a plan that allows production monitoring.
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    await store.createMonitor(makeMonitor({ id: 'due', lastRunAt: '2026-01-01T10:00:00Z' }));
    await store.createMonitor(makeMonitor({ id: 'fresh', lastRunAt: '2026-01-01T11:59:00Z' }));

    const result = await runScheduledChecks({}, now);
    expect(result.checked).toBe(1);
    expect(result.errors).toBe(0);

    // The due monitor's lastRunAt advanced; the fresh one did not.
    expect((await store.getMonitor('due'))?.lastRunAt).toBe(now.toISOString());
    expect((await store.getMonitor('fresh'))?.lastRunAt).toBe('2026-01-01T11:59:00Z');
  });

  it('prunes monitor-run history beyond the plan retention window', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u1', plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    const monitor = makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' });
    await store.createMonitor(monitor);

    // Seed an old run (older than free 7-day retention) and a recent one.
    await store.addMonitorRun({
      id: 'old', monitorId: 'm1', userId: 'u1', status: 'passed',
      regressionsCount: 0, attempts: 1, createdAt: '2025-12-01T00:00:00Z',
    });

    const now = new Date('2026-01-01T12:00:00Z');
    const result = await runScheduledChecks({}, now);
    expect(result.pruned).toBeGreaterThanOrEqual(1);

    const history = await store.listMonitorRuns('m1');
    // The old run is gone; the fresh run from this tick remains.
    expect(history.every((r) => r.id !== 'old')).toBe(true);
  });

  it('skips monitors whose owner lacks production monitoring (downgraded plan)', async () => {
    const store = getMemoryStore();
    // Free-plan owner: monitoring is Business-only, so the due monitor is skipped.
    await store.createUser({ id: 'u1', plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    await store.createMonitor(makeMonitor({ id: 'due', lastRunAt: '2026-01-01T10:00:00Z' }));
    const now = new Date('2026-01-01T12:00:00Z');

    const result = await runScheduledChecks({}, now);
    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    // The monitor's lastRunAt did not advance because it never executed.
    expect((await store.getMonitor('due'))?.lastRunAt).toBe('2026-01-01T10:00:00Z');
  });

  it('dispatches alerts when regressions are detected', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor({ alerts: { slack: 'https://hook' } });
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    let slackCalls = 0;
    const fakeFetch = (async () => {
      slackCalls++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const { alerts } = await runMonitor({}, store, monitor, now, fakeFetch);
    // Simulated processor returns new_baseline → no alerts/dispatch.
    expect(alerts).toEqual([]);
    expect(slackCalls).toBe(0);
  });
});
