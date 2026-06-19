import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { InMemoryStore } from '../src/db/store.js';
import { can, roleAtLeast } from '../src/db/teams.js';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import { sendInviteEmail, buildAcceptUrl, buildInviteHtml } from '../src/teams/invite-email.js';

const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;

describe('role capabilities', () => {
  it('owner can do everything', () => {
    expect(can('owner', 'manage_team')).toBe(true);
    expect(can('owner', 'manage_members')).toBe(true);
    expect(can('owner', 'run_tests')).toBe(true);
    expect(can('owner', 'view')).toBe(true);
  });
  it('admin can manage members but not the team', () => {
    expect(can('admin', 'manage_members')).toBe(true);
    expect(can('admin', 'manage_team')).toBe(false);
  });
  it('member can run tests but not manage', () => {
    expect(can('member', 'run_tests')).toBe(true);
    expect(can('member', 'manage_members')).toBe(false);
  });
  it('viewer can only view', () => {
    expect(can('viewer', 'view')).toBe(true);
    expect(can('viewer', 'run_tests')).toBe(false);
  });
  it('roleAtLeast compares ranks', () => {
    expect(roleAtLeast('admin', 'member')).toBe(true);
    expect(roleAtLeast('member', 'admin')).toBe(false);
    expect(roleAtLeast('owner', 'owner')).toBe(true);
  });
});

describe('InMemoryStore teams', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('creates a team with the creator as owner', async () => {
    await store.createTeam({ id: 't1', name: 'Acme', plan: 'free', createdAt: 'now' }, 'u1');
    expect((await store.getMember('t1', 'u1'))?.role).toBe('owner');
    const teams = await store.listTeamsForUser('u1');
    expect(teams[0].role).toBe('owner');
  });

  it('manages members and roles', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
    await store.addMember({ teamId: 't1', userId: 'u2', role: 'member', createdAt: 'now' });
    await store.updateMemberRole('t1', 'u2', 'admin');
    expect((await store.getMember('t1', 'u2'))?.role).toBe('admin');
    expect((await store.listMembers('t1')).length).toBe(2);
    expect(await store.removeMember('t1', 'u2')).toBe(true);
  });

  it('handles invitations: create → accept once', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
    await store.createInvitation({
      id: 'i1', teamId: 't1', email: 'x@y.com', role: 'member', token: 'tok', createdAt: 'now',
    });
    expect((await store.listInvitations('t1')).length).toBe(1);
    const accepted = await store.acceptInvitation('tok', 'now');
    expect(accepted?.teamId).toBe('t1');
    // Second accept fails.
    expect(await store.acceptInvitation('tok', 'now')).toBeNull();
    // Accepted invitations no longer listed.
    expect((await store.listInvitations('t1')).length).toBe(0);
  });

  it('deletes a team and cascades members/projects', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });
    await store.deleteTeam('t1');
    expect(await store.getTeam('t1')).toBeNull();
    expect((await store.listProjects('t1')).length).toBe(0);
    expect(await store.getMember('t1', 'owner')).toBeNull();
  });
});

describe('/v1/teams routes (dev mode)', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  async function createTeam(token: string, name = 'Acme'): Promise<string> {
    const res = await app.request('/v1/teams', { method: 'POST', headers: auth(token), body: JSON.stringify({ name }) });
    const id = (await res.json()).id;
    // Default teams are free (1-member cap). Upgrade to business so invite-flow
    // tests are not blocked by the member-limit gate.
    await getMemoryStore().updateTeam(id, { plan: 'business' });
    return id;
  }

  it('creates a team and lists it for the owner', async () => {
    const res = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).role).toBe('owner');
    const list = await app.request('/v1/teams', { headers: auth('alice') });
    expect((await list.json()).total).toBe(1);
  });

  it('non-members cannot view a team', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });

  it('full invite → accept → member appears flow', async () => {
    const id = await createTeam('alice');
    const inviteRes = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    expect(inviteRes.status).toBe(201);
    const { token } = await inviteRes.json();

    const acceptRes = await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token }),
    });
    expect(acceptRes.status).toBe(200);
    expect((await acceptRes.json()).role).toBe('member');

    // Bob can now view.
    const viewRes = await app.request(`/v1/teams/${id}`, { headers: auth('bob') });
    expect(viewRes.status).toBe(200);
    expect((await viewRes.json()).members.length).toBe(2);
  });

  it('members cannot invite (need admin+)', async () => {
    const id = await createTeam('alice');
    // Add bob as member directly via invite+accept.
    const inv = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'b@x.com', role: 'member' }),
    });
    await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });
    // Bob (member) tries to invite → 403.
    const res = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ email: 'c@x.com' }),
    });
    expect(res.status).toBe(403);
  });

  it('only owner can delete the team', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}`, { method: 'DELETE', headers: auth('bob') });
    expect(res.status).toBe(404); // bob isn't even a member
    const ok = await app.request(`/v1/teams/${id}`, { method: 'DELETE', headers: auth('alice') });
    expect((await ok.json()).deleted).toBe(true);
  });

  it('manages team projects (member+)', async () => {
    const id = await createTeam('alice');
    const createRes = await app.request(`/v1/teams/${id}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web', repoUrl: 'https://github.com/acme/web' }),
    });
    expect(createRes.status).toBe(201);
    const listRes = await app.request(`/v1/teams/${id}/projects`, { headers: auth('alice') });
    expect((await listRes.json()).total).toBe(1);
  });

  // Helper: add bob as a member of alice's team via invite+accept.
  async function addBob(teamId: string, role = 'member'): Promise<void> {
    const inv = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'bob@x.com', role }),
    });
    await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });
  }

  it('owner updates a member role', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    const res = await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(true);
    expect((await getMemoryStore().getMember(id, bobId))?.role).toBe('admin');
  });

  it('rejects an invalid member role with 400', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    const res = await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'superuser' }),
    });
    expect(res.status).toBe(400);
  });

  it('members cannot update roles (403)', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    const res = await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('bob'), body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(403);
  });

  it('owner removes a member', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    const res = await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'DELETE', headers: auth('alice'),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(true);
    expect(await getMemoryStore().getMember(id, bobId)).toBeFalsy();
  });

  // --- RBAC hardening (regression tests for privilege-escalation fixes) ------

  it('an admin cannot promote themselves to owner', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    // Alice (owner) promotes bob to admin.
    await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    // Bob (admin) tries to self-promote to owner → 403.
    const res = await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('bob'), body: JSON.stringify({ role: 'owner' }),
    });
    expect(res.status).toBe(403);
    expect((await getMemoryStore().getMember(id, bobId))?.role).toBe('admin');
  });

  it('an admin cannot demote the owner', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const aliceId = `demo:${createHash('sha256').update('alice').digest('hex')}`;
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    // Bob (admin) tries to demote alice (owner) → 403 (cannot touch equal/higher rank).
    const res = await app.request(`/v1/teams/${id}/members/${aliceId}`, {
      method: 'PATCH', headers: auth('bob'), body: JSON.stringify({ role: 'viewer' }),
    });
    expect(res.status).toBe(403);
    expect((await getMemoryStore().getMember(id, aliceId))?.role).toBe('owner');
  });

  it('cannot demote the last remaining owner', async () => {
    const id = await createTeam('alice');
    const aliceId = `demo:${createHash('sha256').update('alice').digest('hex')}`;
    // Alice is the only owner; she may not self-demote (self-change blocked)...
    const selfRes = await app.request(`/v1/teams/${id}/members/${aliceId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    expect(selfRes.status).toBe(403);
    expect((await getMemoryStore().getMember(id, aliceId))?.role).toBe('owner');
  });

  it('an admin cannot remove the owner', async () => {
    const id = await createTeam('alice');
    await addBob(id);
    const aliceId = `demo:${createHash('sha256').update('alice').digest('hex')}`;
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    const res = await app.request(`/v1/teams/${id}/members/${aliceId}`, {
      method: 'DELETE', headers: auth('bob'),
    });
    expect(res.status).toBe(403);
    expect(await getMemoryStore().getMember(id, aliceId)).toBeTruthy();
  });

  it('accepting a lower-role invite does not downgrade an existing higher role', async () => {
    const id = await createTeam('alice');
    await addBob(id); // bob is a member
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    await app.request(`/v1/teams/${id}/members/${bobId}`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ role: 'admin' }),
    });
    // A new viewer invite is forwarded to bob (already admin); accepting it must not downgrade him.
    const inv = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'b2@x.com', role: 'viewer' }),
    });
    const acc = await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });
    expect(acc.status).toBe(200);
    expect((await getMemoryStore().getMember(id, bobId))?.role).toBe('admin');
  });

  it('lists projects requires membership (404 for non-members)', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}/projects`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });

  it('rejects invalid project payloads with 400', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ repoUrl: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('deletes a project', async () => {
    const id = await createTeam('alice');
    const created = await app.request(`/v1/teams/${id}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web' }),
    });
    const projectId = (await created.json()).id;
    const res = await app.request(`/v1/teams/${id}/projects/${projectId}`, {
      method: 'DELETE', headers: auth('alice'),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (1) GitHub-handle invitations
// ---------------------------------------------------------------------------
describe('GitHub-handle invitations', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  async function createTeam(token: string): Promise<string> {
    const res = await app.request('/v1/teams', { method: 'POST', headers: auth(token), body: JSON.stringify({ name: 'Acme' }) });
    const id = (await res.json()).id;
    await getMemoryStore().updateTeam(id, { plan: 'business' });
    return id;
  }

  it('invites by githubLogin and is acceptable via token', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ githubLogin: 'octocat', role: 'member' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.githubLogin).toBe('octocat');
    expect(body.email).toBeNull();
    expect(body.emailed).toBe(false);
    expect(typeof body.token).toBe('string');

    const accept = await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: body.token }),
    });
    expect(accept.status).toBe(200);
    expect((await accept.json()).role).toBe('member');
  });

  it('rejects an invite with neither email nor githubLogin (400)', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ role: 'member' }),
    });
    expect(res.status).toBe(400);
  });

  it('email invites still work (back-compat)', async () => {
    const id = await createTeam('alice');
    const res = await app.request(`/v1/teams/${id}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'x@y.com', role: 'member' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe('x@y.com');
    // No RESEND_API_KEY configured in dev → not emailed, but never throws.
    expect(body.emailed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (2) Invite email delivery (Resend pattern)
// ---------------------------------------------------------------------------
describe('sendInviteEmail', () => {
  const baseInv = {
    id: 'i1', teamId: 't1', email: 'invitee@x.com', role: 'member' as const,
    token: 'tok123', createdAt: 'now',
  };

  it('builds an accept URL and HTML containing the token + team name', () => {
    const url = buildAcceptUrl({ PUBLIC_BASE_URL: 'https://app.frontguard.dev' }, 'tok123');
    expect(url).toBe('https://app.frontguard.dev/dashboard?invite=tok123');
    const html = buildInviteHtml(url, 'Acme Corp', 'member');
    expect(html).toContain('Acme Corp');
    expect(html).toContain(url);
  });

  it('calls the Resend API when key is configured', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const result = await sendInviteEmail(
      { RESEND_API_KEY: 'rk_test', ALERT_FROM_EMAIL: 'team@frontguard.dev', PUBLIC_BASE_URL: 'https://app.frontguard.dev' },
      baseInv,
      'Acme',
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rk_test');
    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual(['invitee@x.com']);
  });

  it('returns ok:false without throwing when no API key', async () => {
    const fetchMock = vi.fn();
    const result = await sendInviteEmail({}, baseInv, 'Acme', fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:false on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 422 }));
    const result = await sendInviteEmail(
      { RESEND_API_KEY: 'rk_test' }, baseInv, 'Acme', fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('422');
  });

  it('returns ok:false when invitation has no email', async () => {
    const result = await sendInviteEmail(
      { RESEND_API_KEY: 'rk_test' },
      { ...baseInv, email: undefined, githubLogin: 'octocat' },
      'Acme',
    );
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (3) Baseline scoping to team projects
// ---------------------------------------------------------------------------
describe('project-scoped runs', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  async function setup(): Promise<{ teamId: string; projectId: string }> {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    const projRes = await app.request(`/v1/teams/${teamId}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web' }),
    });
    const projectId = (await projRes.json()).id;
    return { teamId, projectId };
  }

  it('member can submit a run scoped to the project', async () => {
    const { projectId } = await setup();
    const res = await app.request('/v1/run', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ url: 'https://example.com', projectId }),
    });
    expect(res.status).toBe(202);
    const runId = (await res.json()).id;
    const run = await getMemoryStore().getRun(runId);
    expect(run?.projectId).toBe(projectId);
  });

  it('non-member is rejected with 403', async () => {
    const { projectId } = await setup();
    const res = await app.request('/v1/run', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ url: 'https://example.com', projectId }),
    });
    expect(res.status).toBe(403);
  });

  it('unknown projectId returns 404', async () => {
    const res = await app.request('/v1/run', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ url: 'https://example.com', projectId: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('lists project runs and exposes baseline', async () => {
    const { teamId, projectId } = await setup();
    const runRes = await app.request('/v1/run', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ url: 'https://example.com', projectId }),
    });
    const runId = (await runRes.json()).id;

    const listRes = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs`, { headers: auth('alice') });
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).total).toBeGreaterThanOrEqual(1);

    // No approved baseline yet.
    const noBaseline = await app.request(`/v1/teams/${teamId}/projects/${projectId}/baseline`, { headers: auth('alice') });
    expect(noBaseline.status).toBe(404);

    // Approve it directly, then baseline resolves.
    await getMemoryStore().updateRun(runId, { baselinesApproved: true });
    const baseline = await app.request(`/v1/teams/${teamId}/projects/${projectId}/baseline`, { headers: auth('alice') });
    expect(baseline.status).toBe(200);
    expect((await baseline.json()).baseline.id).toBe(runId);
  });

  it('project runs listing requires membership (404)', async () => {
    const { teamId, projectId } = await setup();
    const res = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// (4) Approval workflow / reviewer
// ---------------------------------------------------------------------------
describe('baseline review workflow', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  async function setupWithBob(): Promise<{ teamId: string; projectId: string; runId: string; bobId: string }> {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'business' });
    const projRes = await app.request(`/v1/teams/${teamId}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web' }),
    });
    const projectId = (await projRes.json()).id;
    // Add bob as member.
    const inv = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });
    // Bob submits a run.
    const runRes = await app.request('/v1/run', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ url: 'https://example.com', projectId }),
    });
    const runId = (await runRes.json()).id;
    return { teamId, projectId, runId, bobId: demoId('bob') };
  }

  it('a designated reviewer can approve and it sets baselinesApproved', async () => {
    const { teamId, projectId, runId, bobId } = await setupWithBob();
    // Make bob a reviewer.
    const setRev = await app.request(`/v1/teams/${teamId}/members/${bobId}/reviewer`, {
      method: 'PATCH', headers: auth('alice'), body: JSON.stringify({ reviewer: true }),
    });
    expect(setRev.status).toBe(200);

    const review = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs/${runId}/review`, {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ status: 'approved', comment: 'LGTM' }),
    });
    expect(review.status).toBe(201);
    expect((await review.json()).status).toBe('approved');
    expect((await getMemoryStore().getRun(runId))?.baselinesApproved).toBe(true);
  });

  it('owner/admin can approve without explicit reviewer flag', async () => {
    const { teamId, projectId, runId } = await setupWithBob();
    const review = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs/${runId}/review`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ status: 'approved' }),
    });
    expect(review.status).toBe(201);
    expect((await getMemoryStore().getRun(runId))?.baselinesApproved).toBe(true);
  });

  it('a non-reviewer member is rejected with 403', async () => {
    const { teamId, projectId, runId } = await setupWithBob();
    // bob is a plain member (not reviewer).
    const review = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs/${runId}/review`, {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ status: 'approved' }),
    });
    expect(review.status).toBe(403);
  });

  it('rejection does not approve the baseline and is listed in reviews', async () => {
    const { teamId, projectId, runId } = await setupWithBob();
    const review = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs/${runId}/review`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ status: 'rejected', comment: 'nope' }),
    });
    expect(review.status).toBe(201);
    expect((await getMemoryStore().getRun(runId))?.baselinesApproved).toBeFalsy();

    const reviews = await app.request(`/v1/teams/${teamId}/projects/${projectId}/runs/${runId}/reviews`, { headers: auth('alice') });
    expect(reviews.status).toBe(200);
    const body = await reviews.json();
    expect(body.total).toBe(1);
    expect(body.reviews[0].status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// (5) Activity feed
// ---------------------------------------------------------------------------
describe('team activity feed', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('records and lists activity events newest-first', async () => {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'business' });
    // Invite + accept + project create generate events.
    const inv = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });
    await app.request(`/v1/teams/${teamId}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web' }),
    });

    const res = await app.request(`/v1/teams/${teamId}/activity`, { headers: auth('alice') });
    expect(res.status).toBe(200);
    const body = await res.json();
    const actions = body.activity.map((a: { action: string }) => a.action);
    expect(actions).toContain('team.created');
    expect(actions).toContain('member.invited');
    expect(actions).toContain('member.joined');
    expect(actions).toContain('project.created');
    // Newest-first ordering: timestamps are non-increasing.
    const times = body.activity.map((a: { createdAt: string }) => new Date(a.createdAt).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
  });

  it('non-members cannot read the activity feed (404)', async () => {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    const res = await app.request(`/v1/teams/${teamId}/activity`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// (6) Team usage aggregation
// ---------------------------------------------------------------------------
describe('team usage aggregation', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('sums usage across team members', async () => {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'business' });
    const projRes = await app.request(`/v1/teams/${teamId}/projects`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Web' }),
    });
    const projectId = (await projRes.json()).id;
    // Add bob.
    const inv = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    await app.request('/v1/teams/invitations/accept', {
      method: 'POST', headers: auth('bob'), body: JSON.stringify({ token: (await inv.json()).token }),
    });

    // Alice submits 2 runs, bob 1 run — pooled against the business team plan (DM-3).
    for (let i = 0; i < 2; i++) {
      await app.request('/v1/run', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ url: 'https://example.com', projectId }) });
    }
    await app.request('/v1/run', { method: 'POST', headers: auth('bob'), body: JSON.stringify({ url: 'https://example.com', projectId }) });

    const res = await app.request(`/v1/teams/${teamId}/usage`, { headers: auth('alice') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memberCount).toBe(2);
    expect(body.runsCount).toBe(3);
    expect(body.perMember.length).toBe(2);
  });

  it('non-members cannot read usage (404)', async () => {
    const teamRes = await app.request('/v1/teams', { method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'Acme' }) });
    const teamId = (await teamRes.json()).id;
    const res = await app.request(`/v1/teams/${teamId}/usage`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Store-level coverage for new methods (InMemoryStore)
// ---------------------------------------------------------------------------
describe('InMemoryStore new methods', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('setReviewer toggles the reviewer flag', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
    await store.setReviewer('t1', 'owner', true);
    expect((await store.getMember('t1', 'owner'))?.reviewer).toBe(true);
  });

  it('getProjectById, listProjectRuns, getProjectBaseline', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: 'now' });
    expect((await store.getProjectById('p1'))?.name).toBe('Web');

    await store.createRun({
      id: 'r1', status: 'completed', url: 'u', routes: [{ path: '/' }], viewports: [1440],
      browsers: ['chromium'], threshold: 0.01, ai: null, createdAt: '2026-01-01', results: null,
      reportUrl: null, projectId: 'p1', baselinesApproved: true,
    }, 'owner');
    await store.createRun({
      id: 'r2', status: 'completed', url: 'u', routes: [{ path: '/' }], viewports: [1440],
      browsers: ['chromium'], threshold: 0.01, ai: null, createdAt: '2026-02-01', results: null,
      reportUrl: null, projectId: 'p1', baselinesApproved: false,
    }, 'owner');

    expect((await store.listProjectRuns('p1')).length).toBe(2);
    // Most-recent approved baseline is r1.
    expect((await store.getProjectBaseline('p1'))?.id).toBe('r1');
  });

  it('addApproval + listApprovals', async () => {
    await store.addApproval({ id: 'a1', runId: 'r1', reviewerUserId: 'u1', status: 'approved', createdAt: 'now' });
    const list = await store.listApprovals('r1');
    expect(list.length).toBe(1);
    expect(list[0].status).toBe('approved');
  });

  it('recordActivity + listActivity', async () => {
    await store.recordActivity({ id: 'x1', teamId: 't1', action: 'team.created', createdAt: '2026-01-01' });
    await store.recordActivity({ id: 'x2', teamId: 't1', action: 'project.created', createdAt: '2026-02-01' });
    const list = await store.listActivity('t1');
    expect(list.length).toBe(2);
    expect(list[0].action).toBe('project.created');
  });

  it('getTeamUsage reads the team_usage pool', async () => {
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'u1');
    await store.addMember({ teamId: 't1', userId: 'u2', role: 'member', createdAt: 'now' });
    await store.incrementTeamUsage('t1', '2026-05', 5, 15);
    const usage = await store.getTeamUsage('t1', '2026-05');
    expect(usage.memberCount).toBe(2);
    expect(usage.runsCount).toBe(5);
    expect(usage.screenshotsCount).toBe(15);
  });
});
