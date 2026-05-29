import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore, currentMonth } from '../src/db/store.js';
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

describe('currentMonth', () => {
  it('formats YYYY-MM in UTC', () => {
    expect(currentMonth(new Date('2026-03-09T00:00:00Z'))).toBe('2026-03');
    expect(currentMonth(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('InMemoryStore — users & keys', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('creates and fetches users by id and github id', async () => {
    await store.createUser({ id: 'u1', githubId: 'gh1', plan: 'free', createdAt: 'now' });
    expect((await store.getUser('u1'))?.id).toBe('u1');
    expect((await store.getUserByGithubId('gh1'))?.id).toBe('u1');
    expect(await store.getUserByGithubId('nope')).toBeNull();
  });

  it('updates a user plan', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.updateUserPlan('u1', 'pro');
    expect((await store.getUser('u1'))?.plan).toBe('pro');
  });

  it('manages API keys scoped to a user', async () => {
    await store.createApiKey({ keyHash: 'h1', userId: 'u1', name: 'k', createdAt: 'now' });
    await store.createApiKey({ keyHash: 'h2', userId: 'u2', name: 'k', createdAt: 'now' });
    expect((await store.listApiKeys('u1')).length).toBe(1);
    expect((await store.getApiKey('h1'))?.userId).toBe('u1');
    // Cannot delete another user's key
    expect(await store.deleteApiKey('h1', 'u2')).toBe(false);
    expect(await store.deleteApiKey('h1', 'u1')).toBe(true);
  });

  it('touches a key last-used timestamp', async () => {
    await store.createApiKey({ keyHash: 'h1', userId: 'u1', name: 'k', createdAt: 'now' });
    await store.touchApiKey('h1', '2026-01-01');
    expect((await store.getApiKey('h1'))?.lastUsedAt).toBe('2026-01-01');
  });
});

describe('InMemoryStore — runs', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('creates, reads, and scopes runs by owner', async () => {
    await store.createRun(makeRun('r1'), 'u1');
    await store.createRun(makeRun('r2'), 'u2');
    expect((await store.getRun('r1'))?.id).toBe('r1');
    expect(await store.getRunOwner('r1')).toBe('u1');
    expect((await store.listRuns('u1')).length).toBe(1);
  });

  it('updates a run via patch', async () => {
    await store.createRun(makeRun('r1'), 'u1');
    await store.updateRun('r1', { status: 'completed', baselinesApproved: true });
    const r = await store.getRun('r1');
    expect(r?.status).toBe('completed');
    expect(r?.baselinesApproved).toBe(true);
  });

  it('only deletes runs owned by the caller', async () => {
    await store.createRun(makeRun('r1'), 'u1');
    expect(await store.deleteRun('r1', 'u2')).toBe(false);
    expect(await store.deleteRun('r1', 'u1')).toBe(true);
    expect(await store.getRun('r1')).toBeNull();
  });

  it('lists runs newest-first and respects limit', async () => {
    const a = makeRun('a');
    a.createdAt = '2026-01-01T00:00:00Z';
    const b = makeRun('b');
    b.createdAt = '2026-02-01T00:00:00Z';
    await store.createRun(a, 'u1');
    await store.createRun(b, 'u1');
    const list = await store.listRuns('u1', 1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('b');
  });
});

describe('InMemoryStore — screenshots & usage', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('stores and lists screenshots per run', async () => {
    await store.addScreenshot({
      id: 's1',
      runId: 'r1',
      route: '/',
      viewport: 1440,
      browser: 'chromium',
      type: 'baseline',
      r2Key: 'runs/r1/s1.png',
      createdAt: 'now',
    });
    const list = await store.listScreenshots('r1');
    expect(list).toHaveLength(1);
    expect(list[0].r2Key).toBe('runs/r1/s1.png');
  });

  it('accumulates usage counters', async () => {
    await store.incrementUsage('u1', '2026-03', 1, 5);
    await store.incrementUsage('u1', '2026-03', 2, 3);
    const usage = await store.getUsage('u1', '2026-03');
    expect(usage.runsCount).toBe(3);
    expect(usage.screenshotsCount).toBe(8);
  });

  it('returns zeroed usage for an unknown month', async () => {
    const usage = await store.getUsage('u1', '2099-01');
    expect(usage.runsCount).toBe(0);
    expect(usage.screenshotsCount).toBe(0);
  });
});
