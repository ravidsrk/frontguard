import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { InMemoryStore } from '../src/db/store.js';
import { can, roleAtLeast } from '../src/db/teams.js';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';

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
    return (await res.json()).id;
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
