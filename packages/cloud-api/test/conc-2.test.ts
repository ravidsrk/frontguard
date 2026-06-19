/**
 * CONC-2: lost-update protection via optimistic concurrency on
 * updateRun / updateMonitor / updateTeam.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { D1Store } from '../src/db/d1-store.js';
import { InMemoryStore } from '../src/db/store.js';
import { migrate } from '../src/db/migrate.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';
import type { Run } from '../src/types.js';

function makeRun(id: string): Run {
  return {
    id,
    status: 'queued',
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.01,
    ai: null,
    createdAt: new Date().toISOString(),
    results: null,
    reportUrl: null,
  };
}

describe('updateRun optimistic concurrency (CONC-2)', () => {
  describe('InMemoryStore', () => {
    let store: InMemoryStore;

    beforeEach(() => {
      store = new InMemoryStore();
    });

    it('preserves both approval and status under concurrent updates', async () => {
      await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
      await store.createRun(makeRun('r1'), 'u1');

      await Promise.all([
        store.updateRun('r1', { baselinesApproved: true }),
        store.updateRun('r1', { status: 'completed', completedAt: 'done' }),
      ]);

      const run = await store.getRun('r1');
      expect(run?.baselinesApproved).toBe(true);
      expect(run?.status).toBe('completed');
      expect(run?.completedAt).toBe('done');
    });
  });

  describe('D1Store', () => {
    let store: D1Store;

    beforeEach(async () => {
      const { db } = createNodeSqliteD1();
      await migrate(db);
      store = new D1Store(db);
      await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
      await store.createRun(makeRun('r1'), 'u1');
    });

    it('preserves both approval and status under concurrent updates', async () => {
      await Promise.all([
        store.updateRun('r1', { baselinesApproved: true }),
        store.updateRun('r1', { status: 'completed', completedAt: 'done' }),
      ]);

      const run = await store.getRun('r1');
      expect(run?.baselinesApproved).toBe(true);
      expect(run?.status).toBe('completed');
      expect(run?.completedAt).toBe('done');
    });

    it('bumps version on each successful update', async () => {
      const { db } = createNodeSqliteD1();
      await migrate(db);
      const s = new D1Store(db);
      await s.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
      await s.createRun(makeRun('r2'), 'u1');

      await s.updateRun('r2', { status: 'running' });
      await s.updateRun('r2', { status: 'completed' });

      const row = await db
        .prepare('SELECT version FROM runs WHERE id = ?')
        .bind('r2')
        .first<{ version: number }>();
      expect(row?.version).toBe(2);
    });
  });
});