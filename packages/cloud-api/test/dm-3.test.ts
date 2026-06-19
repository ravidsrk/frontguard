/**
 * DM-3: team-scoped usage pool — combined member runs enforce team plan limit.
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

describe('tryReserveTeamRun — store primitive (DM-3)', () => {
  it('allows exactly K of N parallel team reservations at limit K', async () => {
    const store = new InMemoryStore();
    const teamId = 't1';
    const month = '2026-06';
    const limit = 3;
    const attempts = 10;

    const results = await Promise.all(
      Array.from({ length: attempts }, () => store.tryReserveTeamRun(teamId, month, limit)),
    );

    expect(results.filter(Boolean).length).toBe(limit);
    const usage = await store.getTeamUsage(teamId, month);
    expect(usage.runsCount).toBe(limit);
  });
});

describe('tryReserveTeamRun — D1Store (DM-3)', () => {
  let store: D1Store;

  beforeEach(async () => {
    const { db } = createNodeSqliteD1();
    await migrate(db);
    store = new D1Store(db);
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createTeam({ id: 't1', name: 'Acme', plan: 'pro', createdAt: 'now' }, 'u1');
  });

  it('allows exactly K of N parallel team reservations at limit K', async () => {
    const limit = 2;
    const attempts = 6;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => store.tryReserveTeamRun('t1', '2026-06', limit)),
    );
    expect(results.filter(Boolean).length).toBe(limit);
    expect((await store.getTeamUsage('t1', '2026-06')).runsCount).toBe(limit);
  });
});

describe('POST /v1/run — team-pooled limit (DM-3)', () => {
  beforeEach(() => resetMemoryStore());

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('enforces the team plan limit across two members combined', async () => {
    const store = getMemoryStore();
    const month = new Date().toISOString().slice(0, 7);

    const aliceId = demoUserId('alice');
    const bobId = demoUserId('bob');
    await store.createUser({ id: aliceId, plan: 'free', createdAt: new Date().toISOString() });
    await store.createUser({ id: bobId, plan: 'free', createdAt: new Date().toISOString() });

    await store.createTeam({ id: 't1', name: 'Acme', plan: 'pro', createdAt: new Date().toISOString() }, aliceId);
    await store.addMember({ teamId: 't1', userId: bobId, role: 'member', createdAt: new Date().toISOString() });

    // Pro plan allows 500 runs — seed team pool to 499 so only one more fits.
    await store.incrementTeamUsage('t1', month, 499, 0);

    const body = JSON.stringify({ url: 'https://example.com' });
    const aliceHeaders = { ...auth('alice') };
    const bobHeaders = { ...auth('bob') };

    const [resAlice, resBob] = await Promise.all([
      app.request('/v1/run?teamId=t1', { method: 'POST', headers: aliceHeaders, body }),
      app.request('/v1/run?teamId=t1', { method: 'POST', headers: bobHeaders, body }),
    ]);

    const statuses = [resAlice.status, resBob.status].sort();
    expect(statuses).toEqual([202, 402]);

    const teamUsage = await store.getTeamUsage('t1', month);
    expect(teamUsage.runsCount).toBe(500);
  });

  it('rejects paid-plan runs without team scope', async () => {
    const store = getMemoryStore();
    const userId = demoUserId('solo-pro');
    await store.createUser({ id: userId, plan: 'pro', createdAt: new Date().toISOString() });

    const res = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('solo-pro'),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('team scope');
  });
});