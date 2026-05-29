/**
 * Team workspace routes (Task 8.1).
 *
 * Mounted after the `/v1/*` auth guard (so `store` + `userId` are set).
 * Role capabilities are enforced per-route via {@link can}.
 *
 * - `POST   /v1/teams`                     → create a team (caller becomes owner).
 * - `GET    /v1/teams`                     → list teams the caller belongs to.
 * - `GET    /v1/teams/:id`                 → team detail (members + projects).
 * - `PATCH  /v1/teams/:id`                 → rename / update (owner).
 * - `DELETE /v1/teams/:id`                 → delete (owner).
 * - `POST   /v1/teams/:id/invitations`     → invite a member (admin+).
 * - `POST   /v1/teams/invitations/accept`  → accept an invite (any auth'd user).
 * - `PATCH  /v1/teams/:id/members/:userId` → change role (admin+).
 * - `DELETE /v1/teams/:id/members/:userId` → remove member (admin+).
 * - `GET/POST/DELETE /v1/teams/:id/projects` → project management (member+).
 *
 * @module routes/teams
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../db/factory.js';
import type { Store } from '../db/store.js';
import { can, type Capability, type TeamRole } from '../db/teams.js';

type Variables = { store: Store; userId: string };

export const teamRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Resolves the caller's role on a team, or null if not a member. */
async function callerRole(store: Store, teamId: string, userId: string): Promise<TeamRole | null> {
  const m = await store.getMember(teamId, userId);
  return m?.role ?? null;
}

/** Guard: returns the role if the caller has `cap`, else writes an error. */
async function requireCap(
  store: Store,
  teamId: string,
  userId: string,
  cap: Capability,
): Promise<{ ok: true; role: TeamRole } | { ok: false; status: 403 | 404 }> {
  const role = await callerRole(store, teamId, userId);
  if (!role) return { ok: false, status: 404 };
  if (!can(role, cap)) return { ok: false, status: 403 };
  return { ok: true, role };
}

const createTeamSchema = z.object({ name: z.string().min(1).max(100) });
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});
const roleSchema = z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) });
const projectSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().url().optional(),
  config: z.string().optional(),
});

teamRoutes.post('/', async (c) => {
  const parsed = createTeamSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid team', details: parsed.error.flatten().fieldErrors }, 400);
  const store = c.get('store');
  const team = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    plan: 'free',
    createdAt: new Date().toISOString(),
  };
  await store.createTeam(team, c.get('userId'));
  return c.json({ ...team, role: 'owner' }, 201);
});

teamRoutes.get('/', async (c) => {
  const teams = await c.get('store').listTeamsForUser(c.get('userId'));
  return c.json({ teams, total: teams.length });
});

teamRoutes.get('/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const [team, members, projects] = await Promise.all([
    store.getTeam(id),
    store.listMembers(id),
    store.listProjects(id),
  ]);
  return c.json({ team, members, projects, role: guard.role });
});

teamRoutes.patch('/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_team');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = createTeamSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid update' }, 400);
  await store.updateTeam(id, parsed.data);
  return c.json(await store.getTeam(id));
});

teamRoutes.delete('/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_team');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const deleted = await store.deleteTeam(id);
  return c.json({ deleted });
});

teamRoutes.post('/:id/invitations', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = inviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid invitation', details: parsed.error.flatten().fieldErrors }, 400);

  const invitation = {
    id: crypto.randomUUID(),
    teamId: id,
    email: parsed.data.email,
    role: parsed.data.role as TeamRole,
    token: crypto.randomUUID().replace(/-/g, ''),
    createdAt: new Date().toISOString(),
  };
  await store.createInvitation(invitation);
  return c.json({ id: invitation.id, email: invitation.email, role: invitation.role, token: invitation.token }, 201);
});

teamRoutes.post('/invitations/accept', async (c) => {
  const store = c.get('store');
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) return c.json({ error: 'Missing token' }, 400);
  const inv = await store.acceptInvitation(body.token, new Date().toISOString());
  if (!inv) return c.json({ error: 'Invalid or already-accepted invitation' }, 404);
  await store.addMember({
    teamId: inv.teamId,
    userId: c.get('userId'),
    role: inv.role,
    createdAt: new Date().toISOString(),
  });
  return c.json({ joined: true, teamId: inv.teamId, role: inv.role });
});

teamRoutes.patch('/:id/members/:userId', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid role' }, 400);
  await store.updateMemberRole(id, c.req.param('userId'), parsed.data.role as TeamRole);
  return c.json({ updated: true });
});

teamRoutes.delete('/:id/members/:userId', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const removed = await store.removeMember(id, c.req.param('userId'));
  return c.json({ removed });
});

teamRoutes.get('/:id/projects', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const projects = await store.listProjects(id);
  return c.json({ projects, total: projects.length });
});

teamRoutes.post('/:id/projects', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'run_tests');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = projectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid project', details: parsed.error.flatten().fieldErrors }, 400);
  const project = {
    id: crypto.randomUUID(),
    teamId: id,
    name: parsed.data.name,
    repoUrl: parsed.data.repoUrl,
    config: parsed.data.config,
    createdAt: new Date().toISOString(),
  };
  await store.createProject(project);
  return c.json(project, 201);
});

teamRoutes.delete('/:id/projects/:projectId', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'run_tests');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const deleted = await store.deleteProject(c.req.param('projectId'), id);
  return c.json({ deleted });
});
