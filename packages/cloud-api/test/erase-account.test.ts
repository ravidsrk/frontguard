/**
 * Fixture erasure for one account, including the baselines and reports it owns.
 * Uses the in-process SQLite test database. No production database is touched.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { D1Store } from '../src/db/d1-store.js';
import { InMemoryStore } from '../src/db/store.js';
import type { Store } from '../src/db/store.js';
import { migrate } from '../src/db/migrate.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';
import { MemoryScreenshotStore, screenshotKey } from '../src/storage/screenshots.js';
import { persistScreenshots } from '../src/storage/persist-screenshots.js';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { getMemoryScreenshotStore, resetMemoryScreenshotStore } from '../src/storage/screenshots.js';
import type { Run } from '../src/types.js';
import { allocateDemoUserId } from '../src/auth/demo-user.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeRun(id: string, reportHtml: string): Run {
  return {
    id,
    status: 'completed',
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.01,
    ai: null,
    createdAt: '2026-01-02T00:00:00Z',
    results: null,
    reportUrl: `/v1/reports/${id}`,
    reportHtml,
  };
}

async function seedFixture(
  store: Store,
  blobs: MemoryScreenshotStore,
  secondOwner = true,
): Promise<void> {
  await store.createUser({
    id: 'fixture-a',
    email: 'a@example.com',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00Z',
  });
  await store.createUser({
    id: 'fixture-b',
    email: 'b@example.com',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00Z',
  });
  await store.createTeam(
    { id: 'team-1', name: 'Shared', plan: 'free', createdAt: '2026-01-01T00:00:00Z' },
    'fixture-a',
  );
  await store.addMember({
    teamId: 'team-1',
    userId: 'fixture-b',
    role: 'member',
    createdAt: '2026-01-01T00:00:00Z',
  });
  if (secondOwner) {
    await store.createUser({
      id: 'fixture-c',
      email: 'c@example.com',
      plan: 'free',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await store.addMember({
      teamId: 'team-1',
      userId: 'fixture-c',
      role: 'owner',
      createdAt: '2026-01-01T00:00:00Z',
    });
  }
  await store.createInvitation({
    id: 'inv-a',
    teamId: 'team-1',
    email: 'a@example.com',
    role: 'member',
    token: 'tok-a',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
  });
  await store.createInvitation({
    id: 'inv-b',
    teamId: 'team-1',
    email: 'b@example.com',
    role: 'member',
    token: 'tok-b',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
  });

  await store.createRun(makeRun('run-a', "Alice's report"), 'fixture-a');
  await store.createRun(makeRun('run-b', "Bob's report"), 'fixture-b');
  await store.addApproval({
    id: 'ap-a',
    runId: 'run-b',
    reviewerUserId: 'fixture-a',
    status: 'approved',
    createdAt: '2026-01-02T00:00:00Z',
  });
  await store.createApiKey({
    keyHash: 'hash-a',
    userId: 'fixture-a',
    name: 'ci',
    createdAt: '2026-01-01T00:00:00Z',
  });
  await store.createMask({
    id: 'mask-a',
    userId: 'fixture-a',
    route: '/',
    viewport: 1440,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    createdAt: '2026-01-01T00:00:00Z',
  });
  await store.createMonitor({
    id: 'mon-a',
    userId: 'fixture-a',
    name: 'Home',
    url: 'https://example.com',
    routes: ['/'],
    viewports: [1440],
    intervalMinutes: 60,
    alertThreshold: 0.05,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  });
  await store.recordActivity({
    id: 'act-a',
    teamId: 'team-1',
    userId: 'fixture-a',
    action: 'run.submitted',
    target: 'run-a',
    createdAt: '2026-01-02T00:00:00Z',
  });
  await store.recordBackgroundFailure({
    id: 'bf-a',
    kind: 'run',
    sourceId: 'run-a',
    userId: 'fixture-a',
    error: 'old failure',
    attempt: 1,
    createdAt: '2026-01-02T00:00:00Z',
  });

  const keyA = screenshotKey('fixture-a', 'run-a', 'baseline', '/', 1440, 'chromium');
  const keyB = screenshotKey('fixture-b', 'run-b', 'baseline', '/', 1440, 'chromium');
  await blobs.put(keyA, PNG);
  await blobs.put(keyB, PNG);
  await store.addScreenshot({
    id: 'shot-a',
    runId: 'run-a',
    route: '/',
    viewport: 1440,
    browser: 'chromium',
    type: 'baseline',
    r2Key: keyA,
    createdAt: '2026-01-02T00:00:00Z',
  });
  await store.addScreenshot({
    id: 'shot-b',
    runId: 'run-b',
    route: '/',
    viewport: 1440,
    browser: 'chromium',
    type: 'baseline',
    r2Key: keyB,
    createdAt: '2026-01-02T00:00:00Z',
  });
}

async function expectErased(store: Store, blobs: MemoryScreenshotStore): Promise<void> {
  const result = await store.eraseAccount('fixture-a', blobs);
  expect(result).toEqual({ erased: true, userId: 'fixture-a', runs: 1, baselines: 1, reports: 1 });

  expect(await store.getUser('fixture-a')).toBeNull();
  expect(await store.getRun('run-a')).toBeNull();
  expect(await store.listScreenshots('run-a')).toEqual([]);
  expect(await store.getApiKey('hash-a')).toBeNull();
  expect(await store.listMasks('fixture-a')).toEqual([]);
  expect(await store.getMonitor('mon-a')).toBeNull();
  expect(await store.getInvitationByToken('tok-a')).toBeNull();
  expect(await store.listApprovals('run-b')).toEqual([]);
  expect(await store.listActivity('team-1')).toEqual([]);
  expect(await store.listBackgroundFailures({ sourceId: 'run-a' })).toEqual([]);
  expect(await blobs.get(screenshotKey('fixture-a', 'run-a', 'baseline', '/', 1440, 'chromium'))).toBeNull();

  expect((await store.getUser('fixture-b'))?.email).toBe('b@example.com');
  expect((await store.getRun('run-b'))?.reportHtml).toBe("Bob's report");
  expect((await store.listScreenshots('run-b')).map((shot) => shot.type)).toEqual(['baseline']);
  expect(await blobs.get(screenshotKey('fixture-b', 'run-b', 'baseline', '/', 1440, 'chromium'))).toEqual(PNG);
  expect(await store.getMember('team-1', 'fixture-b')).toMatchObject({ role: 'member' });
  expect(await store.getMember('team-1', 'fixture-c')).toMatchObject({ role: 'owner' });
  expect((await store.getTeam('team-1'))?.name).toBe('Shared');
  expect((await store.getInvitationByToken('tok-b'))?.email).toBe('b@example.com');
}

describe('eraseAccount — fixture account', () => {
  it('erases one sqlite fixture account, including its baselines and report', async () => {
    const { db } = createSqliteD1();
    await migrate(db);
    const store = new D1Store(db);
    const blobs = new MemoryScreenshotStore();
    await seedFixture(store, blobs);
    await expectErased(store, blobs);
    expect(await store.eraseAccount('fixture-a', blobs)).toMatchObject({ erased: false, runs: 0 });
    expect((await store.getRun('run-b'))?.reportHtml).toBe("Bob's report");
  });

  it('erases one in-memory fixture account without deleting the other account', async () => {
    const store = new InMemoryStore();
    const blobs = new MemoryScreenshotStore();
    await seedFixture(store, blobs);
    await expectErased(store, blobs);
  });
});

async function openStore(kind: 'sqlite' | 'memory'): Promise<Store> {
  if (kind === 'memory') return new InMemoryStore();
  const { db } = createSqliteD1();
  await migrate(db);
  return new D1Store(db);
}

describe('eraseAccount — refusal', () => {
  it.each(['sqlite', 'memory'] as const)(
    'keeps the %s account when blob deletion fails',
    async (kind) => {
      const store = await openStore(kind);
      const blobs = new MemoryScreenshotStore();
      await seedFixture(store, blobs);
      const key = screenshotKey('fixture-a', 'run-a', 'baseline', '/', 1440, 'chromium');
      blobs.deleteRun = async () => {
        throw new Error('object store unavailable');
      };
      const result = await store.eraseAccount('fixture-a', blobs);
      expect(result).toMatchObject({ erased: false, userId: 'fixture-a', reason: 'blob-delete-failed' });
      expect(await store.getUser('fixture-a')).not.toBeNull();
      expect(await store.getRun('run-a')).not.toBeNull();
      expect(await blobs.get(key)).toEqual(PNG);
      expect(await store.accountWritesClosed('fixture-a')).toBe(false);
    },
  );

  it.each(['sqlite', 'memory'] as const)(
    'refuses to erase the sole %s owner while another member remains',
    async (kind) => {
      const store = await openStore(kind);
      const blobs = new MemoryScreenshotStore();
      await seedFixture(store, blobs, false);
      const key = screenshotKey('fixture-a', 'run-a', 'baseline', '/', 1440, 'chromium');
      const result = await store.eraseAccount('fixture-a', blobs);
      expect(result).toMatchObject({ erased: false, userId: 'fixture-a', reason: 'sole-owner' });
      expect(await store.getUser('fixture-a')).not.toBeNull();
      expect(await store.getMember('team-1', 'fixture-a')).toMatchObject({ role: 'owner' });
      expect(await store.getMember('team-1', 'fixture-b')).toMatchObject({ role: 'member' });
      expect(await blobs.get(key)).toEqual(PNG);
    },
  );

  it('drops a screenshot that was uploading when erasure started', async () => {
    const store = new InMemoryStore();
    const blobs = new MemoryScreenshotStore();
    await store.createUser({
      id: 'fixture-a',
      email: 'a@example.com',
      plan: 'free',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await store.createRun(makeRun('run-a', "Alice's report"), 'fixture-a');
    let releasePut: () => void = () => {};
    const putEntered = new Promise<void>((resolve) => {
      const original = blobs.put.bind(blobs);
      blobs.put = async (key, bytes) => {
        resolve();
        await new Promise<void>((release) => {
          releasePut = release;
        });
        await original(key, bytes);
      };
    });
    const pending = persistScreenshots(store, blobs, 'fixture-a', 'run-a', [
      { name: 'home_1440_chromium_0_current', type: 'current', bytes: PNG },
    ]);
    await putEntered;
    const erasing = store.eraseAccount('fixture-a', blobs);
    releasePut();
    const [count, result] = await Promise.all([pending, erasing]);
    expect(count).toBe(1);
    expect(result.erased).toBe(true);
    expect(blobs.size()).toBe(0);
    expect(await store.getUser('fixture-a')).toBeNull();
  });

  it('does not put screenshots after writes are closed', async () => {
    const { db } = createSqliteD1();
    await migrate(db);
    const store = new D1Store(db);
    const blobs = new MemoryScreenshotStore();
    await store.createUser({
      id: 'fixture-a',
      email: 'a@example.com',
      plan: 'free',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await store.closeAccountWrites('fixture-a');
    const count = await persistScreenshots(store, blobs, 'fixture-a', 'run-a', [
      { name: 'home_1440_chromium_0_current', type: 'current', bytes: PNG },
    ]);
    expect(count).toBe(0);
    expect(blobs.size()).toBe(0);
  });
});

describe('DELETE /v1/account', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  it('erases the caller and leaves another account in the store', async () => {
    const create = await app.request('/v1/run', {
      method: 'POST',
      headers: { Authorization: 'Bearer erase-me', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(create.status).toBe(202);
    const { id } = (await create.json()) as { id: string };
    await new Promise((resolve) => setTimeout(resolve, 30));

    const store = getMemoryStore();
    const userId = await store.getRunOwner(id);
    expect(userId).toBeTruthy();
    await store.updateRun(id, { reportHtml: "Alice's report", status: 'completed' });
    const key = screenshotKey(userId!, id, 'baseline', '/', 1440, 'chromium');
    const blobs = getMemoryScreenshotStore();
    await blobs.put(key, PNG);
    await store.addScreenshot({
      id: 'shot-http',
      runId: id,
      route: '/',
      viewport: 1440,
      browser: 'chromium',
      type: 'baseline',
      r2Key: key,
      createdAt: '2026-01-02T00:00:00Z',
    });
    await store.createUser({ id: 'fixture-b', email: 'b@example.com', plan: 'free', createdAt: 'now' });
    await store.createRun(makeRun('run-b', "Bob's report"), 'fixture-b');

    const res = await app.request('/v1/account', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer erase-me' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { erased: boolean; userId: string; runs: number; baselines: number; reports: number };
    expect(body.erased).toBe(true);
    expect(body.userId).toBe(userId);
    expect(body.runs).toBe(1);
    expect(body.baselines).toBe(1);
    expect(body.reports).toBe(1);
    expect(await store.getUser(userId!)).toBeNull();
    expect(await store.getRun(id)).toBeNull();
    expect(await blobs.get(key)).toBeNull();
    expect((await store.getRun('run-b'))?.reportHtml).toBe("Bob's report");
  });
});

describe('erasure races a finished run', () => {
  it.each(['sqlite', 'memory'] as const)(
    'applies a parked %s run when writes reopen',
    async (kind) => {
      const store = await openStore(kind);
      await store.createUser({ id: 'fixture-a', plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
      const queued = makeRun('run-parked', '');
      queued.status = 'queued';
      queued.reportHtml = undefined;
      await store.createRun(queued, 'fixture-a');
      await store.closeAccountWrites('fixture-a');

      const finished = makeRun('run-parked', 'done');
      expect(await store.commitFinishedRun('fixture-a', finished)).toBe('pending');
      expect((await store.getRun('run-parked'))?.status).toBe('queued');

      await store.reopenAccountWrites('fixture-a');
      expect(await store.accountWritesClosed('fixture-a')).toBe(false);
      expect((await store.getRun('run-parked'))?.status).toBe('completed');
      expect((await store.getRun('run-parked'))?.reportHtml).toBe('done');
    },
  );

  it.each(['sqlite', 'memory'] as const)(
    'drops a parked %s run when erasure succeeds and does not reuse the locked id',
    async (kind) => {
      const store = await openStore(kind);
      const token = `erase-${kind}`;
      const first = await allocateDemoUserId(store, token);
      await store.createUser({ id: first, plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
      const queued = makeRun('run-gone', '');
      queued.status = 'queued';
      await store.createRun(queued, first);
      await store.closeAccountWrites(first);
      expect(await store.commitFinishedRun(first, makeRun('run-gone', 'late'))).toBe('pending');

      const erased = await store.eraseAccount(first);
      expect(erased.erased).toBe(true);
      expect(await store.getRun('run-gone')).toBeNull();
      expect(await store.accountWritesClosed(first)).toBe(true);

      const second = await allocateDemoUserId(store, token);
      const third = await allocateDemoUserId(store, token);
      expect(second).toBe(third);
      expect(second).not.toBe(first);
      await store.createUser({ id: second, plan: 'free', createdAt: '2026-01-02T00:00:00Z' });
      await store.createRun(makeRun('run-new', 'fresh'), second);
      expect(await store.commitFinishedRun(second, makeRun('run-new', 'fresh'))).toBe('written');
      expect((await store.getRun('run-new'))?.reportHtml).toBe('fresh');
      expect(await store.accountWritesClosed(first)).toBe(true);
    },
  );
});
