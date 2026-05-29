import { describe, it, expect, beforeEach } from 'vitest';
import { D1Store } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';
import type { Run } from '../src/types.js';

function makeRun(id: string): Run {
  return {
    id,
    status: 'queued',
    url: 'https://example.com',
    routes: [{ path: '/' }, { path: '/about' }],
    viewports: [1440, 375],
    browsers: ['chromium'],
    threshold: 0.01,
    ai: { provider: 'openai', model: 'gpt-4o' },
    createdAt: new Date().toISOString(),
    results: null,
    reportUrl: null,
  };
}

describe('D1Store (SQLite-backed)', () => {
  let store: D1Store;

  beforeEach(async () => {
    const { db } = createSqliteD1();
    await migrate(db);
    store = new D1Store(db);
  });

  it('migrate creates all tables (runs CRUD works)', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createRun(makeRun('r1'), 'u1');
    const r = await store.getRun('r1');
    expect(r?.url).toBe('https://example.com');
    expect(r?.routes).toHaveLength(2);
    expect(r?.ai?.provider).toBe('openai');
  });

  it('round-trips users and api keys', async () => {
    await store.createUser({ id: 'u1', githubId: 'gh1', email: 'a@b.com', plan: 'pro', createdAt: 'now' });
    expect((await store.getUserByGithubId('gh1'))?.email).toBe('a@b.com');

    await store.createApiKey({ keyHash: 'h1', userId: 'u1', name: 'CI', createdAt: 'now' });
    expect((await store.getApiKey('h1'))?.name).toBe('CI');
    await store.touchApiKey('h1', '2026-05-01');
    expect((await store.getApiKey('h1'))?.lastUsedAt).toBe('2026-05-01');
    expect((await store.listApiKeys('u1')).length).toBe(1);
    expect(await store.deleteApiKey('h1', 'u1')).toBe(true);
    expect(await store.getApiKey('h1')).toBeNull();
  });

  it('updates a run and preserves config across updates', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createRun(makeRun('r1'), 'u1');
    await store.updateRun('r1', {
      status: 'completed',
      results: [
        { route: '/', viewport: 1440, status: 'pass', diffPercentage: 0, classification: 'pass', timestamp: 'now' },
        { route: '/about', viewport: 375, status: 'regression', diffPercentage: 5, classification: 'regression', timestamp: 'now' },
      ],
      completedAt: 'done',
    });
    const r = await store.getRun('r1');
    expect(r?.status).toBe('completed');
    expect(r?.results).toHaveLength(2);
    // Config (url/routes) survived the update.
    expect(r?.url).toBe('https://example.com');
    expect(r?.routes).toHaveLength(2);
  });

  it('scopes listRuns and deleteRun by owner', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createUser({ id: 'u2', plan: 'free', createdAt: 'now' });
    await store.createRun(makeRun('r1'), 'u1');
    await store.createRun(makeRun('r2'), 'u2');
    expect((await store.listRuns('u1')).map((r) => r.id)).toEqual(['r1']);
    expect(await store.deleteRun('r1', 'u2')).toBe(false);
    expect(await store.deleteRun('r1', 'u1')).toBe(true);
  });

  it('stores screenshots and accumulates usage via upsert', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createRun(makeRun('r1'), 'u1');
    await store.addScreenshot({
      id: 's1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium',
      type: 'baseline', r2Key: 'k1', sizeBytes: 100, createdAt: 'now',
    });
    expect((await store.listScreenshots('r1')).length).toBe(1);

    await store.incrementUsage('u1', '2026-05', 1, 4);
    await store.incrementUsage('u1', '2026-05', 2, 6);
    const usage = await store.getUsage('u1', '2026-05');
    expect(usage.runsCount).toBe(3);
    expect(usage.screenshotsCount).toBe(10);
  });
});
