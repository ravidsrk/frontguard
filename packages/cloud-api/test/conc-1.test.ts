/**
 * CONC-1: monthly run-limit enforcement must be an atomic reserve, not
 * read-check-then-increment (TOCTOU).
 */
import { describe as describeBase, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { InMemoryStore } from '../src/db/store.js';
import { D1Store } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { createNodeSqliteD1, nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';
// node:sqlite is absent on Node 20 (CI matrix); skip this shim-backed suite there.
const describe = nodeSqliteAvailable ? describeBase : describeBase.skip;

function demoUserId(token: string): string {
  return `demo:${createHash('sha256').update(token).digest('hex')}`;
}

describe('tryReserveRun — store primitive (CONC-1)', () => {
  it('allows exactly K of N parallel reservations at limit K', async () => {
    const store = new InMemoryStore();
    const userId = 'u1';
    const month = '2026-06';
    const limit = 3;
    const attempts = 10;

    const results = await Promise.all(
      Array.from({ length: attempts }, () => store.tryReserveRun(userId, month, limit)),
    );

    expect(results.filter(Boolean).length).toBe(limit);
    expect(results.filter((r) => !r).length).toBe(attempts - limit);
    const usage = await store.getUsage(userId, month);
    expect(usage.runsCount).toBe(limit);
  });
});

describe('tryReserveRun — D1Store (CONC-1)', () => {
  let store: D1Store;

  beforeEach(async () => {
    const { db } = createNodeSqliteD1();
    await migrate(db);
    store = new D1Store(db);
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
  });

  it('allows exactly K of N parallel reservations at limit K', async () => {
    const limit = 2;
    const attempts = 6;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => store.tryReserveRun('u1', '2026-06', limit)),
    );
    expect(results.filter(Boolean).length).toBe(limit);
    expect((await store.getUsage('u1', '2026-06')).runsCount).toBe(limit);
  });
});

describe('POST /v1/run — concurrent limit boundary (CONC-1)', () => {
  beforeEach(() => resetMemoryStore());

  it('accepts exactly one of two concurrent submissions at the monthly run cap', async () => {
    const store = getMemoryStore();
    const token = 'conc-boundary';
    const userId = demoUserId(token);
    const month = new Date().toISOString().slice(0, 7);

    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });
    // Free plan limit is 50 — seed 49 so only one more run fits.
    await store.incrementUsage(userId, month, 49, 0);
    const runsBefore = (await store.listRuns(userId)).length;

    const body = JSON.stringify({ url: 'https://example.com' });
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const [resA, resB] = await Promise.all([
      app.request('/v1/run', { method: 'POST', headers, body }),
      app.request('/v1/run', { method: 'POST', headers, body }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([202, 402]);

    const runsAfter = (await store.listRuns(userId)).length;
    expect(runsAfter - runsBefore).toBe(1);

    const usage = await store.getUsage(userId, month);
    expect(usage.runsCount).toBe(50);
  });
});