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

  it('round-trips monitors and filters due ones', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createMonitor({
      id: 'm1', userId: 'u1', name: 'Home', url: 'https://example.com',
      routes: ['/', '/pricing'], viewports: [1440, 375], intervalMinutes: 60,
      alertThreshold: 0.05, alerts: { slack: 'https://hook', email: ['a@b.com'] },
      enabled: true, lastRunAt: '2026-01-01T10:00:00Z', createdAt: 'now',
    });
    const m = await store.getMonitor('m1');
    expect(m?.routes).toEqual(['/', '/pricing']);
    expect(m?.alerts?.slack).toBe('https://hook');

    await store.updateMonitor('m1', { enabled: false, lastStatus: 'passed' });
    expect((await store.getMonitor('m1'))?.enabled).toBe(false);

    // Re-enable and check due filtering.
    await store.updateMonitor('m1', { enabled: true });
    const due = await store.listDueMonitors(new Date('2026-01-01T12:00:00Z'));
    expect(due.map((x) => x.id)).toEqual(['m1']);

    expect(await store.deleteMonitor('m1', 'u1')).toBe(true);
  });

  it('round-trips teams, members, invitations, and projects', async () => {
    await store.createUser({ id: 'owner', plan: 'free', createdAt: 'now' });
    await store.createUser({ id: 'u2', plan: 'free', createdAt: 'now' });
    await store.createTeam({ id: 't1', name: 'Acme', plan: 'free', createdAt: 'now' }, 'owner');
    expect((await store.getTeam('t1'))?.name).toBe('Acme');
    expect((await store.getMember('t1', 'owner'))?.role).toBe('owner');

    await store.addMember({ teamId: 't1', userId: 'u2', role: 'member', createdAt: 'now' });
    await store.updateMemberRole('t1', 'u2', 'admin');
    expect((await store.getMember('t1', 'u2'))?.role).toBe('admin');
    expect((await store.listMembers('t1')).length).toBe(2);

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await store.createInvitation({
      id: 'i1',
      teamId: 't1',
      email: 'x@y.com',
      role: 'viewer',
      token: 'tok1',
      createdAt: 'now',
      expiresAt,
    });
    expect((await store.getInvitationByToken('tok1'))?.email).toBe('x@y.com');
    const acceptedAt = new Date().toISOString();
    expect((await store.acceptInvitation('tok1', acceptedAt))?.role).toBe('viewer');
    expect(await store.acceptInvitation('tok1', acceptedAt)).toBeNull();

    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', repoUrl: 'https://x', createdAt: 'now' });
    expect((await store.listProjects('t1'))[0].repoUrl).toBe('https://x');

    const teams = await store.listTeamsForUser('u2');
    expect(teams[0].role).toBe('admin');

    expect(await store.deleteTeam('t1')).toBe(true);
    expect(await store.getTeam('t1')).toBeNull();
    expect((await store.listProjects('t1')).length).toBe(0);
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

  it('Task 8.1: github invites, reviewer flag, project runs, approvals, activity, usage', async () => {
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' });
    await store.createUser({ id: 'u2', plan: 'free', createdAt: 'now' });
    await store.createTeam({ id: 't1', name: 'Acme', plan: 'free', createdAt: 'now' }, 'u1');
    await store.addMember({ teamId: 't1', userId: 'u2', role: 'member', createdAt: 'now' });

    // GitHub-handle invite (nullable email).
    await store.createInvitation({
      id: 'i1',
      teamId: 't1',
      githubLogin: 'octocat',
      role: 'member',
      token: 'ghtok',
      createdAt: 'now',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const inv = await store.getInvitationByToken('ghtok');
    expect(inv?.githubLogin).toBe('octocat');
    expect(inv?.email).toBeUndefined();

    // Reviewer flag.
    await store.setReviewer('t1', 'u2', true);
    expect((await store.getMember('t1', 'u2'))?.reviewer).toBe(true);

    // Project-scoped runs + baseline.
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });
    expect((await store.getProjectById('p1'))?.name).toBe('Web');
    await store.createRun(makeRun('r1'), 'u1');
    await store.updateRun('r1', { projectId: 'p1', baselinesApproved: true, status: 'completed' });
    const projectRuns = await store.listProjectRuns('p1');
    expect(projectRuns.length).toBe(1);
    expect(projectRuns[0].projectId).toBe('p1');
    expect((await store.getProjectBaseline('p1'))?.id).toBe('r1');

    // Approvals.
    await store.addApproval({ id: 'a1', runId: 'r1', projectId: 'p1', reviewerUserId: 'u2', status: 'approved', comment: 'ok', createdAt: 'now' });
    const approvals = await store.listApprovals('r1');
    expect(approvals.length).toBe(1);
    expect(approvals[0].status).toBe('approved');

    // Activity feed.
    await store.recordActivity({ id: 'act1', teamId: 't1', userId: 'u1', action: 'team.created', target: 't1', createdAt: '2026-01-01' });
    await store.recordActivity({ id: 'act2', teamId: 't1', userId: 'u1', action: 'project.created', target: 'p1', createdAt: '2026-02-01' });
    const activity = await store.listActivity('t1');
    expect(activity.length).toBe(2);
    expect(activity[0].action).toBe('project.created'); // newest first

    // Team usage pool (DM-3).
    await store.incrementTeamUsage('t1', '2026-05', 5, 15);
    const teamUsage = await store.getTeamUsage('t1', '2026-05');
    expect(teamUsage.memberCount).toBe(2);
    expect(teamUsage.runsCount).toBe(5);
    expect(teamUsage.screenshotsCount).toBe(15);
  });
});
