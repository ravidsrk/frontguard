/**
 * CONC-3: overlapping cron ticks must not double-run the same due monitor.
 * Atomic lease/claim on due rows ensures exactly one tick executes each monitor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runScheduledChecks } from '../src/scheduler.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import { InMemoryStore } from '../src/db/store.js';
import { D1Store, type D1Database } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';
import type { Monitor } from '../src/db/monitors.js';
import * as processor from '../src/processor.js';

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

describe('tryClaimDueMonitor — store primitive (CONC-3)', () => {
  it('allows exactly one of two concurrent claims on the same due monitor', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await store.createMonitor(makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' }));

    const [first, second] = await Promise.all([
      store.tryClaimDueMonitor('m1', now, 60_000),
      store.tryClaimDueMonitor('m1', now, 60_000),
    ]);

    const claimed = [first, second].filter((m) => m != null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.leasedUntil).toBeDefined();

    const after = await store.getMonitor('m1');
    expect(after?.leasedUntil).toBe(claimed[0]?.leasedUntil);
  });

  it('stale updateMonitor concurrent with claim does not erase the active lease', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await store.createMonitor(makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' }));

    await Promise.all([
      store.tryClaimDueMonitor('m1', now, 60_000),
      store.updateMonitor('m1', { lastStatus: 'running' }),
    ]);

    const after = await store.getMonitor('m1');
    expect(after?.leasedUntil).toBeDefined();
    expect(new Date(after!.leasedUntil!).getTime()).toBeGreaterThan(now.getTime());
    expect(after?.lastStatus).toBe('running');
    expect(await store.tryClaimDueMonitor('m1', now, 60_000)).toBeNull();
  });

  it('rejects a second claim while the lease is still valid', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await store.createMonitor(makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' }));

    const claimed = await store.tryClaimDueMonitor('m1', now, 60_000);
    expect(claimed).not.toBeNull();

    const blocked = await store.tryClaimDueMonitor('m1', now, 60_000);
    expect(blocked).toBeNull();
  });
});

describe('tryClaimDueMonitor — D1Store (CONC-3)', () => {
  let store: D1Store;
  let db: D1Database;

  beforeEach(async () => {
    const created = createNodeSqliteD1();
    db = created.db;
    await migrate(db);
    store = new D1Store(db);
    await store.createUser({ id: 'u1', plan: 'business', createdAt: 'now' });
    await store.createMonitor(makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' }));
  });

  it('allows exactly one of two concurrent claims on the same due monitor', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [first, second] = await Promise.all([
      store.tryClaimDueMonitor('m1', now, 60_000),
      store.tryClaimDueMonitor('m1', now, 60_000),
    ]);

    const claimed = [first, second].filter((m) => m != null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.leasedUntil).toBeDefined();
  });

  it('stale version-0 CAS cannot erase a lease after claim bumps version', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const claimed = await store.tryClaimDueMonitor('m1', now, 60_000);
    expect(claimed).not.toBeNull();

    const staleWrite = await db
      .prepare(
        `UPDATE monitors SET last_status = ?, leased_until = NULL, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .bind('stale', 'm1', 0)
      .run();
    expect(staleWrite.meta?.changes ?? 0).toBe(0);

    const after = await store.getMonitor('m1');
    expect(after?.leasedUntil).toBeDefined();
    expect(new Date(after!.leasedUntil!).getTime()).toBeGreaterThan(now.getTime());
  });

  it('stale updateMonitor concurrent with claim does not erase the active lease', async () => {
    const now = new Date('2026-01-01T12:00:00Z');

    await Promise.all([
      store.tryClaimDueMonitor('m1', now, 60_000),
      store.updateMonitor('m1', { lastStatus: 'running' }),
    ]);

    const after = await store.getMonitor('m1');
    expect(after?.leasedUntil).toBeDefined();
    expect(new Date(after!.leasedUntil!).getTime()).toBeGreaterThan(now.getTime());
    expect(after?.lastStatus).toBe('running');
    expect(await store.tryClaimDueMonitor('m1', now, 60_000)).toBeNull();
  });
});

describe('runScheduledChecks — overlapping ticks (CONC-3)', () => {
  beforeEach(() => {
    resetMemoryStore();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('executes each due monitor at most once across concurrent ticks', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    await store.createMonitor(makeMonitor({ lastRunAt: '2026-01-01T10:00:00Z' }));

    const processSpy = vi.spyOn(processor, 'processRun');
    const now = new Date('2026-01-01T12:00:00Z');

    const [tickA, tickB] = await Promise.all([
      runScheduledChecks({}, now),
      runScheduledChecks({}, now),
    ]);

    expect(tickA.processed + tickB.processed).toBe(1);
    expect(processSpy).toHaveBeenCalledTimes(1);

    const monitor = await store.getMonitor('m1');
    expect(monitor?.lastRunAt).toBe(now.toISOString());
    expect(monitor?.leasedUntil).toBeUndefined();
  });

  it('does not block a later tick after the lease is released', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    await store.createMonitor(
      makeMonitor({
        intervalMinutes: 5,
        lastRunAt: '2026-01-01T11:54:00Z',
      }),
    );

    const processSpy = vi.spyOn(processor, 'processRun');

    await runScheduledChecks({}, new Date('2026-01-01T12:00:00Z'));
    await runScheduledChecks({}, new Date('2026-01-01T12:06:00Z'));

    expect(processSpy).toHaveBeenCalledTimes(2);
  });
});