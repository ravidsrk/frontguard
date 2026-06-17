/**
 * Regression test for mcp-1: `run.github` must survive persistence.
 *
 * The MCP flagship tools `list_regressions` and `recent_runs` filter runs by
 * `run.github` (owner/repo/prNumber/commitSha). The in-memory store kept the
 * field by shallow-copying the whole Run, so all MCP unit tests passed — but
 * the production D1 store serialised only a fixed config whitelist and dropped
 * `github`, so those tools silently returned empty against the real API.
 *
 * These tests round-trip a Run with github linkage through both store
 * implementations and assert the field is byte-identical on read, locking the
 * two backends into the same behaviour.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { D1Store } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { InMemoryStore } from '../src/db/store.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';
import type { Run, Store } from '../src/db/store.js';

const GITHUB = { owner: 'acme', repo: 'shop', prNumber: 42, commitSha: 'abc123' } as const;

function makeRun(id: string): Run {
  return {
    id,
    status: 'completed',
    url: 'https://shop.example.com',
    routes: [{ path: '/' }, { path: '/pricing' }],
    viewports: [1440, 375],
    browsers: ['chromium'],
    threshold: 0.05,
    ai: null,
    createdAt: '2026-06-10T10:00:00.000Z',
    completedAt: '2026-06-10T10:00:42.000Z',
    results: [
      { route: '/pricing', viewport: 1440, status: 'regression', diffPercentage: 0.09, classification: 'regression', timestamp: '2026-06-10T10:00:20.000Z' },
    ],
    reportUrl: '/v1/reports/' + id,
    github: { ...GITHUB },
  };
}

/** Run the same contract against any Store implementation. */
function sharedRoundTripSuite(name: string, build: () => Promise<Store>) {
  describe(name, () => {
    let store: Store;
    beforeEach(async () => {
      store = await build();
      await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    });

    it('round-trips run.github through createRun -> getRun', async () => {
      await store.createRun(makeRun('r1'), 'u1');
      const r = await store.getRun('r1');
      expect(r?.github).toEqual(GITHUB);
    });

    it('preserves run.github across updateRun (read-modify-write)', async () => {
      await store.createRun(makeRun('r2'), 'u1');
      await store.updateRun('r2', { status: 'completed', completedAt: 'done' });
      const r = await store.getRun('r2');
      expect(r?.github).toEqual(GITHUB);
    });

    it('surfaces github linkage via listRuns so list_regressions can match', async () => {
      await store.createRun(makeRun('r3'), 'u1');
      const runs = await store.listRuns('u1');
      const withGh = runs.find((x) => x.id === 'r3');
      expect(withGh?.github?.prNumber).toBe(42);
      expect(withGh?.github?.owner).toBe('acme');
      expect(withGh?.github?.repo).toBe('shop');
      expect(withGh?.github?.commitSha).toBe('abc123');
    });
  });
}

sharedRoundTripSuite('InMemoryStore', async () => new InMemoryStore());
sharedRoundTripSuite('D1Store (SQLite-backed)', async () => {
  const { db } = createSqliteD1();
  await migrate(db);
  return new D1Store(db);
});
