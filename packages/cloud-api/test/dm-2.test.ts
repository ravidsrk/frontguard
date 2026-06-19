/**
 * DM-2: cascade deletes — child rows and R2 prefixes are removed with runs/teams.
 */
import { describe as describeBase, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { D1Store } from '../src/db/d1-store.js';
import { InMemoryStore } from '../src/db/store.js';
import { migrate } from '../src/db/migrate.js';
import { createNodeSqliteD1, nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';
// node:sqlite is absent on Node 20 (CI matrix); skip this shim-backed suite there.
const describe = nodeSqliteAvailable ? describeBase : describeBase.skip;
import { screenshotKey, resetMemoryScreenshotStore, getMemoryScreenshotStore } from '../src/storage/screenshots.js';
import { purgeTeamRunBlobs } from '../src/storage/purge-team-blobs.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';

function demoUserId(token: string): string {
  return `demo:${createHash('sha256').update(token).digest('hex')}`;
}

function makeRun(id: string, projectId?: string) {
  return {
    id,
    status: 'completed' as const,
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium' as const],
    threshold: 0.01,
    ai: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    results: null,
    reportUrl: null,
    projectId,
  };
}

describe('deleteRun — D1 cascade (DM-2)', () => {
  let store: D1Store;
  let raw: ReturnType<typeof createNodeSqliteD1>['raw'];

  beforeEach(async () => {
    const sqlite = createNodeSqliteD1();
    raw = sqlite.raw;
    await migrate(sqlite.db);
    store = new D1Store(sqlite.db);
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
  });

  async function childCounts(runId: string) {
    const screenshots = raw.prepare('SELECT COUNT(*) AS n FROM screenshots WHERE run_id = ?').get(runId) as { n: number };
    const attachments = raw.prepare('SELECT COUNT(*) AS n FROM run_attachments WHERE run_id = ?').get(runId) as { n: number };
    const decisions = raw.prepare('SELECT COUNT(*) AS n FROM screenshot_decisions WHERE run_id = ?').get(runId) as { n: number };
    const approvals = raw.prepare('SELECT COUNT(*) AS n FROM baseline_approvals WHERE run_id = ?').get(runId) as { n: number };
    return {
      screenshots: screenshots.n,
      attachments: attachments.n,
      decisions: decisions.n,
      approvals: approvals.n,
    };
  }

  it('removes screenshots, attachments, decisions, and approvals for the run', async () => {
    await store.createRun(makeRun('r1'), 'u1');
    await store.addScreenshot({
      id: 's1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium',
      type: 'baseline', r2Key: 'u1/r1/s1.png', createdAt: 'now',
    });
    await store.addAttachment({
      id: 'a1', runId: 'r1', kind: 'trace', name: 'trace.zip',
      r2Key: 'u1/r1/attachments/a1.zip', createdAt: 'now',
    });
    await store.addScreenshotDecision({
      id: 'd1', screenshotId: 's1', runId: 'r1', userId: 'u1', decision: 'accepted', createdAt: 'now',
    });
    await store.addApproval({
      id: 'ap1', runId: 'r1', reviewerUserId: 'u1', status: 'approved', createdAt: 'now',
    });

    expect(Object.values(await childCounts('r1')).every((n) => n === 1)).toBe(true);
    expect(await store.deleteRun('r1', 'u1')).toBe(true);
    expect(await store.getRun('r1')).toBeNull();
    expect(Object.values(await childCounts('r1')).every((n) => n === 0)).toBe(true);
  });
});

describe('deleteTeam — D1 cascade (DM-2)', () => {
  let store: D1Store;
  let raw: ReturnType<typeof createNodeSqliteD1>['raw'];

  beforeEach(async () => {
    const sqlite = createNodeSqliteD1();
    raw = sqlite.raw;
    await migrate(sqlite.db);
    store = new D1Store(sqlite.db);
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
  });

  it('removes project runs and team activity', async () => {
    await store.createTeam({ id: 't1', name: 'Acme', plan: 'free', createdAt: 'now' }, 'u1');
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });
    await store.createRun(makeRun('r1', 'p1'), 'u1');
    await store.recordActivity({
      id: 'act1', teamId: 't1', userId: 'u1', action: 'run.submitted', createdAt: 'now',
    });

    expect(await store.deleteTeam('t1')).toBe(true);
    expect(await store.getTeam('t1')).toBeNull();
    expect(await store.getRun('r1')).toBeNull();
    const activity = raw.prepare('SELECT COUNT(*) AS n FROM team_activity WHERE team_id = ?').get('t1') as { n: number };
    expect(activity.n).toBe(0);
  });
});

describe('DELETE /v1/runs/:id — R2 + metadata cleanup (DM-2)', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('empties the run R2 prefix and removes child metadata rows', async () => {
    const token = 'dm2-owner';
    const userId = demoUserId(token);
    const store = getMemoryStore();
    const blobs = getMemoryScreenshotStore();

    const res = await app.request('/v1/run', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(202);
    const { id: runId } = (await res.json()) as { id: string };

    const key = screenshotKey(userId, runId, 'baseline', '/', 1440, 'chromium');
    const attKey = `${userId}/${runId}/attachments/trace.zip`;
    await blobs.put(key, new Uint8Array([1, 2, 3]));
    await blobs.put(attKey, new Uint8Array([4, 5]));

    await store.addScreenshot({
      id: 's1', runId, route: '/', viewport: 1440, browser: 'chromium',
      type: 'baseline', r2Key: key, createdAt: 'now',
    });
    await store.addAttachment({
      id: 'a1', runId, kind: 'trace', name: 'trace.zip', r2Key: attKey, createdAt: 'now',
    });
    await store.addScreenshotDecision({
      id: 'd1', screenshotId: 's1', runId, userId, decision: 'accepted', createdAt: 'now',
    });
    await store.addApproval({
      id: 'ap1', runId, reviewerUserId: userId, status: 'approved', createdAt: 'now',
    });

    const del = await app.request(`/v1/runs/${runId}`, { method: 'DELETE', headers: auth(token) });
    expect(del.status).toBe(200);
    expect((await del.json()).deleted).toBe(true);

    expect(await store.listScreenshots(runId)).toHaveLength(0);
    expect(await store.listAttachments(runId)).toHaveLength(0);
    expect(await store.listScreenshotDecisions(runId)).toHaveLength(0);
    expect(await store.listApprovals(runId)).toHaveLength(0);
    expect(await blobs.get(key)).toBeNull();
    expect(await blobs.get(attKey)).toBeNull();
  });
});

describe('purgeTeamRunBlobs pagination (DM-2)', () => {
  beforeEach(() => resetMemoryScreenshotStore());

  it('purges every run R2 prefix across multiple pages', async () => {
    const store = new InMemoryStore();
    const blobs = getMemoryScreenshotStore();
    const pageSize = 2;
    const runCount = 5;

    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'u1');
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });

    const keys: string[] = [];
    for (let i = 0; i < runCount; i++) {
      const runId = `r${i}`;
      await store.createRun(
        {
          ...makeRun(runId, 'p1'),
          createdAt: `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        },
        'u1',
      );
      const key = screenshotKey('u1', runId, 'baseline', '/', 1440, 'chromium');
      keys.push(key);
      await blobs.put(key, new Uint8Array([i]));
    }
    expect(blobs.size()).toBe(runCount);

    await purgeTeamRunBlobs(store, 't1', undefined, pageSize);

    for (const key of keys) {
      expect(await blobs.get(key)).toBeNull();
    }
    expect(blobs.size()).toBe(0);
  });
});

describe('DELETE /v1/teams/:id — R2 cleanup (DM-2)', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('empties R2 prefixes for all project runs when the team is deleted', async () => {
    const token = 'team-owner';
    const userId = demoUserId(token);
    const blobs = getMemoryScreenshotStore();

    const teamRes = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name: 'Acme' }),
    });
    expect(teamRes.status).toBe(201);
    const teamId = (await teamRes.json()).id as string;

    const projRes = await app.request(`/v1/teams/${teamId}/projects`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name: 'Web' }),
    });
    expect(projRes.status).toBe(201);
    const projectId = (await projRes.json()).id as string;

    const runRes = await app.request('/v1/run', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ url: 'https://example.com', projectId }),
    });
    expect(runRes.status).toBe(202);
    const { id: runId } = (await runRes.json()) as { id: string };

    const key = screenshotKey(userId, runId, 'baseline', '/', 1440, 'chromium');
    const attKey = `${userId}/${runId}/attachments/trace.zip`;
    await blobs.put(key, new Uint8Array([1, 2, 3]));
    await blobs.put(attKey, new Uint8Array([4, 5]));
    expect(blobs.size()).toBe(2);

    const del = await app.request(`/v1/teams/${teamId}`, { method: 'DELETE', headers: auth(token) });
    expect(del.status).toBe(200);
    expect((await del.json()).deleted).toBe(true);

    expect(await blobs.get(key)).toBeNull();
    expect(await blobs.get(attKey)).toBeNull();
    expect(blobs.size()).toBe(0);
  });
});

describe('InMemoryStore deleteTeam (DM-2)', () => {
  it('removes project-scoped runs and activity', async () => {
    const store = new InMemoryStore();
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'u1');
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });
    await store.createRun(makeRun('r1', 'p1'), 'u1');
    await store.recordActivity({ id: 'x1', teamId: 't1', action: 'team.created', createdAt: 'now' });

    expect(await store.deleteTeam('t1')).toBe(true);
    expect(await store.getRun('r1')).toBeNull();
    expect(await store.listActivity('t1')).toHaveLength(0);
  });
});