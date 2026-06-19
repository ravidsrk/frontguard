/**
 * SEC-4: team invitation binding to invitee identity and expiry enforcement.
 */
import { describe as describeBase, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { D1Store } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { createNodeSqliteD1, nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';
// node:sqlite is absent on Node 20 (CI matrix); skip this shim-backed suite there.
const describe = nodeSqliteAvailable ? describeBase : describeBase.skip;
import { invitationIsExpired, userMatchesInvitation } from '../src/teams/invitation-match.js';

const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;

describe('invitation identity helpers (SEC-4)', () => {
  it('matches email case-insensitively', () => {
    expect(
      userMatchesInvitation(
        { id: 'u1', email: 'Bob@X.com', plan: 'free', createdAt: 'now' },
        { id: 'i1', teamId: 't1', email: 'bob@x.com', role: 'member', token: 't', createdAt: 'now' },
      ),
    ).toBe(true);
  });

  it('rejects a different email', () => {
    expect(
      userMatchesInvitation(
        { id: 'u1', email: 'carol@x.com', plan: 'free', createdAt: 'now' },
        { id: 'i1', teamId: 't1', email: 'bob@x.com', role: 'member', token: 't', createdAt: 'now' },
      ),
    ).toBe(false);
  });

  it('treats missing expiry as expired', () => {
    expect(
      invitationIsExpired({
        id: 'i1',
        teamId: 't1',
        email: 'a@b.com',
        role: 'member',
        token: 't',
        createdAt: 'now',
      }),
    ).toBe(true);
  });
});

describe('acceptInvitation expiry (SEC-4)', () => {
  let store: D1Store;

  beforeEach(async () => {
    const { db } = createNodeSqliteD1();
    await migrate(db);
    store = new D1Store(db);
    await store.createUser({ id: 'owner', plan: 'free', createdAt: 'now' });
    await store.createTeam({ id: 't1', name: 'A', plan: 'free', createdAt: 'now' }, 'owner');
  });

  it('rejects an expired invitation token', async () => {
    await store.createInvitation({
      id: 'i1',
      teamId: 't1',
      email: 'bob@x.com',
      role: 'member',
      token: 'expired-tok',
      createdAt: '2020-01-01T00:00:00Z',
      expiresAt: '2020-01-02T00:00:00Z',
    });

    const accepted = await store.acceptInvitation('expired-tok', new Date().toISOString());
    expect(accepted).toBeNull();
  });

  it('accepts a non-expired invitation', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await store.createInvitation({
      id: 'i2',
      teamId: 't1',
      email: 'bob@x.com',
      role: 'member',
      token: 'valid-tok',
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    const accepted = await store.acceptInvitation('valid-tok', new Date().toISOString());
    expect(accepted?.teamId).toBe('t1');
  });
});

describe('POST /v1/teams/invitations/accept (SEC-4)', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  async function createTeam(token: string): Promise<string> {
    const res = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ name: 'Acme' }),
    });
    const id = (await res.json()).id;
    await getMemoryStore().updateTeam(id, { plan: 'business' });
    return id;
  }

  async function seedInvitee(token: string, identity: { email?: string; githubLogin?: string }): Promise<void> {
    const userId = demoId(token);
    await getMemoryStore().createUser({
      id: userId,
      plan: 'free',
      createdAt: new Date().toISOString(),
      ...identity,
    });
  }

  it('returns 403 when the caller identity does not match the invited email', async () => {
    const teamId = await createTeam('alice');
    const inviteRes = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    const { token } = await inviteRes.json();

    await seedInvitee('carol', { email: 'carol@x.com' });
    const res = await app.request('/v1/teams/invitations/accept', {
      method: 'POST',
      headers: auth('carol'),
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not for this user/i);
  });

  it('returns 404 for an expired invitation', async () => {
    const teamId = await createTeam('alice');
    const store = getMemoryStore();
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await store.createInvitation({
      id: 'i-exp',
      teamId,
      email: 'bob@x.com',
      role: 'member',
      token: 'manual-expired',
      createdAt: expiredAt,
      expiresAt: expiredAt,
    });

    await seedInvitee('bob', { email: 'bob@x.com' });
    const res = await app.request('/v1/teams/invitations/accept', {
      method: 'POST',
      headers: auth('bob'),
      body: JSON.stringify({ token: 'manual-expired' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/expired/i);
  });

  it('allows accept when identity matches', async () => {
    const teamId = await createTeam('alice');
    const inviteRes = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ email: 'bob@x.com', role: 'member' }),
    });
    const { token } = await inviteRes.json();

    await seedInvitee('bob', { email: 'bob@x.com' });
    const res = await app.request('/v1/teams/invitations/accept', {
      method: 'POST',
      headers: auth('bob'),
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).joined).toBe(true);
  });
});