import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  runMonitor,
  runScheduledChecks,
  MONITORS_PER_TICK,
  sortMonitorsByDuePriority,
} from '../src/scheduler.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import type { Monitor } from '../src/db/monitors.js';
import * as processor from '../src/processor.js';
import * as alerts from '../src/alerts/index.js';
import { currentMonth } from '../src/db/store.js';
import { screenshotKey } from '../src/storage/screenshots.js';
import { resetMemoryScreenshotStore } from '../src/storage/screenshots.js';
import { routeToSlug } from '../src/monitor-screenshots.js';

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
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });
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

    const { run, alerts: fired } = await runMonitor({}, store, monitor, now);
    expect(spy).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    expect(run.status).toBe('error');
    expect(run.attempts).toBe(2);
    expect(run.error).toContain('boom');
    expect(fired).toHaveLength(1);
    expect(fired[0].kind).toBe('error');
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
    // Business plan: monitoring runs (and triggers prune); free retention window still applies.
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    const monitor = makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' });
    await store.createMonitor(monitor);

    // Seed a run older than the business plan's 90-day retention window.
    await store.addMonitorRun({
      id: 'old', monitorId: 'm1', userId: 'u1', status: 'passed',
      regressionsCount: 0, attempts: 1, createdAt: '2025-09-01T00:00:00Z',
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

  it('REL-2: tick 1 establishes baseline from current screenshots; tick 2 detects regression', async () => {
    const nestedRoutes = ['/foo/bar', '/a/b/c', '/search?q=1'];
    const store = getMemoryStore();
    const monitor = makeMonitor({
      routes: nestedRoutes,
      alerts: { slack: 'https://hook' },
    });
    await store.createMonitor(monitor);
    const bucket = {
      get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
      put: async () => {},
      delete: async () => {},
      list: async () => ({ objects: [] }),
    };
    const env = { SCREENSHOTS: bucket };
    const t1 = new Date('2026-01-01T12:00:00Z');

    const tick1 = vi.spyOn(processor, 'processRun').mockImplementation(
      async (run, _env, onScreenshots, baselineRestore) => {
        expect(baselineRestore).toBeUndefined();
        if (onScreenshots) {
          await onScreenshots(
            nestedRoutes.map((route) => ({
              name: `${routeToSlug(route)}_1440_chromium_0_current`,
              type: 'current' as const,
              bytes: new Uint8Array([1, 2, 3]),
            })),
          );
        }
        run.status = 'completed';
        run.results = nestedRoutes.map((route) => ({
          route,
          viewport: 1440,
          status: 'new_baseline',
          diffPercentage: 0,
          timestamp: t1.toISOString(),
        }));
      },
    );

    const first = await runMonitor(env, store, monitor, t1);
    expect(first.alerts).toEqual([]);
    expect(first.run.status).toBe('passed');
    expect(first.run.screenshots).toHaveLength(nestedRoutes.length);
    for (const route of nestedRoutes) {
      const ref = first.run.screenshots!.find((s) => s.route === route);
      expect(ref).toBeDefined();
      expect(ref!.type).toBe('baseline');
      expect(ref!.r2Key).toContain('-current.png');
    }

    const dispatchSpy = vi.spyOn(alerts, 'dispatchAlertsWithState').mockResolvedValue({
      reason: 'sent',
      deliveries: [],
    });

    const t2 = new Date('2026-01-01T13:00:00Z');
    let capturedRestore: { baselines: Array<{ route: string; r2Key: string }> } | undefined;
    const tick2 = vi.spyOn(processor, 'processRun').mockImplementation(
      async (run, _env, _sink, baselineRestore) => {
        capturedRestore = baselineRestore;
        expect(baselineRestore).toBeDefined();
        for (const route of nestedRoutes) {
          const match = baselineRestore!.baselines.find((b) => b.route === route);
          expect(match).toBeDefined();
          expect(match!.r2Key).toBe(
            first.run.screenshots!.find((s) => s.route === route)!.r2Key,
          );
        }
        run.status = 'completed';
        run.results = nestedRoutes.map((route, i) => ({
          route,
          viewport: 1440,
          status: i === 0 ? 'regression' : 'unchanged',
          diffPercentage: i === 0 ? 0.2 : 0,
          timestamp: t2.toISOString(),
        }));
      },
    );

    const second = await runMonitor(env, store, monitor, t2);
    expect(tick1).toHaveBeenCalled();
    expect(tick2).toHaveBeenCalled();
    expect(capturedRestore?.baselines.map((b) => b.route)).toEqual(
      expect.arrayContaining(nestedRoutes),
    );
    expect(second.alerts.length).toBeGreaterThan(0);
    expect(second.alerts[0].route).toBe('/foo/bar');
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it('sortMonitorsByDuePriority orders oldest-due monitors first', () => {
    const sorted = sortMonitorsByDuePriority([
      makeMonitor({ id: 'new', lastRunAt: '2026-01-01T11:00:00Z' }),
      makeMonitor({ id: 'old', lastRunAt: '2026-01-01T09:00:00Z' }),
      makeMonitor({ id: 'never' }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['never', 'old', 'new']);
  });

  it('REL-4: defers overflow monitors to the next tick instead of dropping them', async () => {
    const store = getMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });

    const dueCount = MONITORS_PER_TICK + 2;
    for (let i = 0; i < dueCount; i++) {
      await store.createMonitor(
        makeMonitor({
          id: `m${i}`,
          lastRunAt: '2026-01-01T10:00:00Z',
        }),
      );
    }

    const first = await runScheduledChecks({}, now);
    expect(first.checked).toBe(dueCount);
    expect(first.processed).toBe(MONITORS_PER_TICK);
    expect(first.deferred).toBe(2);

    const stillDue: string[] = [];
    for (let i = 0; i < dueCount; i++) {
      const m = await store.getMonitor(`m${i}`);
      if (m?.lastRunAt === '2026-01-01T10:00:00Z') stillDue.push(`m${i}`);
    }
    expect(stillDue.length).toBe(2);

    const second = await runScheduledChecks({}, new Date('2026-01-01T12:05:00Z'));
    expect(second.processed).toBeGreaterThan(0);

    for (const id of stillDue) {
      const m = await store.getMonitor(id);
      expect(m?.lastRunAt).not.toBe('2026-01-01T10:00:00Z');
    }
  });

  it('REL-4: fair scheduling prevents short-interval monitors from starving deferred ones', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });

    const slowIds = ['slow0', 'slow1', 'slow2', 'slow3', 'slow4'];
    for (const id of slowIds) {
      await store.createMonitor(
        makeMonitor({
          id,
          intervalMinutes: 60,
          lastRunAt: '2026-01-01T08:00:00Z',
        }),
      );
    }
    await store.createMonitor(
      makeMonitor({
        id: 'fast',
        intervalMinutes: 5,
        lastRunAt: '2026-01-01T11:58:00Z',
      }),
    );

    const ran = new Set<string>();
    const ticks = [
      '2026-01-01T12:00:00Z',
      '2026-01-01T12:05:00Z',
      '2026-01-01T12:10:00Z',
      '2026-01-01T12:15:00Z',
    ];

    for (const iso of ticks) {
      const before = new Map<string, string | undefined>();
      for (const id of [...slowIds, 'fast']) {
        before.set(id, (await store.getMonitor(id))?.lastRunAt);
      }
      await runScheduledChecks({}, new Date(iso));
      for (const [id, prev] of before) {
        const next = (await store.getMonitor(id))?.lastRunAt;
        if (next !== prev) ran.add(id);
      }
    }

    for (const id of slowIds) {
      expect(ran.has(id), `expected ${id} to run`).toBe(true);
    }
    expect(ran.has('fast')).toBe(true);
  });

  it('REL-6: surfaces a failed processRun as an error alert, not a pass', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor({ alerts: { slack: 'https://hook' } });
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    vi.spyOn(processor, 'processRun').mockImplementation(async (run) => {
      run.status = 'failed';
      run.error = 'sandbox timeout';
    });

    const dispatchSpy = vi.spyOn(alerts, 'dispatchAlertsWithState').mockResolvedValue({
      reason: 'sent',
      deliveries: [],
    });

    const { alerts: fired, run } = await runMonitor({}, store, monitor, now);
    expect(run.status).toBe('error');
    expect(run.attempts).toBe(2);
    expect(fired).toHaveLength(1);
    expect(fired[0].kind).toBe('error');
    expect(fired[0].message).toContain('sandbox timeout');
    expect(dispatchSpy).toHaveBeenCalled();
    expect((await store.getMonitor('m1'))?.lastStatus).toBe('error');
  });
});
