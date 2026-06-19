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
import { currentMonth } from '../db/store.js';
import { can, roleAtLeast, type Capability, type TeamRole } from '../db/teams.js';
import { sendInviteEmail } from '../teams/invite-email.js';
import { getPlan, checkLimit } from '../billing/plans.js';
import type { AlertEnv } from '../alerts/index.js';
import { purgeTeamRunBlobs } from '../storage/purge-team-blobs.js';
import type { R2Bucket } from '../storage/screenshots.js';

type Variables = { store: Store; userId: string };

export const teamRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Best-effort activity recorder — never blocks the request on failure. */
async function logActivity(
  store: Store,
  teamId: string,
  userId: string | undefined,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await store.recordActivity({
      id: crypto.randomUUID(),
      teamId,
      userId,
      action,
      target,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Activity logging is best-effort.
  }
}

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
const inviteSchema = z
  .object({
    email: z.string().email().optional(),
    githubLogin: z.string().min(1).max(100).optional(),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
  .refine((d) => !!d.email || !!d.githubLogin, {
    message: 'Either email or githubLogin is required',
  });
const roleSchema = z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) });
const reviewerSchema = z.object({ reviewer: z.boolean() });
const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional(),
});
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
  await logActivity(store, team.id, c.get('userId'), 'team.created', team.id, { name: team.name });
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
  await purgeTeamRunBlobs(store, id, c.env?.SCREENSHOTS as R2Bucket | undefined);
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

  // Plan enforcement (Task 8.2): the team-member count (current members plus
  // outstanding invitations) is capped per plan.
  const team = await store.getTeam(id);
  const plan = getPlan(team?.plan);
  const [members, pending] = await Promise.all([store.listMembers(id), store.listInvitations(id)]);
  const memberLimit = checkLimit(plan, 'teamMembers', members.length + pending.length, 1);
  if (!memberLimit.allowed) {
    return c.json(
      {
        error: `Team member limit reached (${memberLimit.limit} on the ${plan.name} plan).`,
        limit: memberLimit.limit,
        current: memberLimit.current,
        upgradeUrl: 'https://frontguard.dev/pricing',
      },
      402,
    );
  }

  const invitation = {
    id: crypto.randomUUID(),
    teamId: id,
    email: parsed.data.email,
    githubLogin: parsed.data.githubLogin,
    role: parsed.data.role as TeamRole,
    token: crypto.randomUUID().replace(/-/g, ''),
    createdAt: new Date().toISOString(),
  };
  await store.createInvitation(invitation);

  // Best-effort email delivery for email-based invites.
  let emailed = false;
  if (invitation.email) {
    const result = await sendInviteEmail(
      (c.env ?? {}) as AlertEnv,
      invitation,
      team?.name ?? 'your team',
    );
    emailed = result.ok;
  }

  await logActivity(store, id, c.get('userId'), 'member.invited', invitation.email ?? invitation.githubLogin, {
    role: invitation.role,
    via: invitation.email ? 'email' : 'github',
  });

  return c.json(
    {
      id: invitation.id,
      email: invitation.email ?? null,
      githubLogin: invitation.githubLogin ?? null,
      role: invitation.role,
      token: invitation.token,
      emailed,
    },
    201,
  );
});

teamRoutes.post('/invitations/accept', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) return c.json({ error: 'Missing token' }, 400);
  const inv = await store.acceptInvitation(body.token, new Date().toISOString());
  if (!inv) return c.json({ error: 'Invalid or already-accepted invitation' }, 404);

  // Never downgrade an existing higher-ranked membership via a forwarded invite.
  const existing = await store.getMember(inv.teamId, userId);
  if (existing && roleAtLeast(existing.role, inv.role)) {
    await logActivity(store, inv.teamId, userId, 'member.joined', userId, {
      role: existing.role,
      note: 'kept existing higher role',
    });
    return c.json({ joined: true, teamId: inv.teamId, role: existing.role });
  }

  await store.addMember({
    teamId: inv.teamId,
    userId,
    role: inv.role,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
  await logActivity(store, inv.teamId, userId, 'member.joined', userId, { role: inv.role });
  return c.json({ joined: true, teamId: inv.teamId, role: inv.role });
});

teamRoutes.patch('/:id/members/:userId', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const actorId = c.get('userId');
  const guard = await requireCap(store, id, actorId, 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid role' }, 400);
  const targetUserId = c.req.param('userId');
  const newRole = parsed.data.role as TeamRole;

  // No self-role-change (prevents an admin self-promoting to owner).
  if (targetUserId === actorId) {
    return c.json({ error: 'You cannot change your own role' }, 403);
  }
  const target = await store.getMember(id, targetUserId);
  if (!target) return c.json({ error: 'Member not found' }, 404);

  // The actor must strictly outrank both the target's current role and the
  // new role they want to assign. Equal-rank actors (e.g. admin->admin) and
  // any attempt to grant/modify an owner are rejected unless the actor is owner.
  if (!roleAtLeast(guard.role, target.role) || guard.role === target.role) {
    return c.json({ error: 'You cannot modify a member of equal or higher rank' }, 403);
  }
  if (!roleAtLeast(guard.role, newRole) || (newRole === 'owner' && guard.role !== 'owner')) {
    return c.json({ error: 'You cannot assign a role higher than your own' }, 403);
  }

  // Never demote the last remaining owner.
  if (target.role === 'owner' && newRole !== 'owner') {
    const owners = (await store.listMembers(id)).filter((m) => m.role === 'owner');
    if (owners.length <= 1) return c.json({ error: 'A team must have at least one owner' }, 409);
  }

  await store.updateMemberRole(id, targetUserId, newRole);
  await logActivity(store, id, actorId, 'member.role_changed', targetUserId, { role: newRole });
  return c.json({ updated: true });
});

teamRoutes.patch('/:id/members/:userId/reviewer', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const parsed = reviewerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid reviewer flag' }, 400);
  const targetUserId = c.req.param('userId');
  const member = await store.getMember(id, targetUserId);
  if (!member) return c.json({ error: 'Member not found' }, 404);
  await store.setReviewer(id, targetUserId, parsed.data.reviewer);
  await logActivity(store, id, c.get('userId'), 'member.reviewer_changed', targetUserId, {
    reviewer: parsed.data.reviewer,
  });
  return c.json({ updated: true, reviewer: parsed.data.reviewer });
});

teamRoutes.delete('/:id/members/:userId', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const actorId = c.get('userId');
  const guard = await requireCap(store, id, actorId, 'manage_members');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);
  const targetUserId = c.req.param('userId');
  const target = await store.getMember(id, targetUserId);
  if (!target) return c.json({ removed: false });

  // Cannot remove a member of equal or higher rank (self-removal of a
  // non-owner is allowed since you never outrank-or-equal... so guard self too).
  if (targetUserId !== actorId && (!roleAtLeast(guard.role, target.role) || guard.role === target.role)) {
    return c.json({ error: 'You cannot remove a member of equal or higher rank' }, 403);
  }
  // Never remove the last remaining owner.
  if (target.role === 'owner') {
    const owners = (await store.listMembers(id)).filter((m) => m.role === 'owner');
    if (owners.length <= 1) return c.json({ error: 'A team must have at least one owner' }, 409);
  }

  const removed = await store.removeMember(id, targetUserId);
  if (removed) await logActivity(store, id, actorId, 'member.removed', targetUserId);
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
  await logActivity(store, id, c.get('userId'), 'project.created', project.id, { name: project.name });
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

// --- Project-scoped runs & baselines ---------------------------------------

teamRoutes.get('/:teamId/projects/:projectId/runs', async (c) => {
  const store = c.get('store');
  const teamId = c.req.param('teamId');
  const guard = await requireCap(store, teamId, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const projectId = c.req.param('projectId');
  const project = await store.getProjectById(projectId);
  if (!project || project.teamId !== teamId) return c.json({ error: 'Project not found' }, 404);
  const runs = await store.listProjectRuns(projectId, 50);
  return c.json({ runs, total: runs.length });
});

teamRoutes.get('/:teamId/projects/:projectId/baseline', async (c) => {
  const store = c.get('store');
  const teamId = c.req.param('teamId');
  const guard = await requireCap(store, teamId, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const projectId = c.req.param('projectId');
  const project = await store.getProjectById(projectId);
  if (!project || project.teamId !== teamId) return c.json({ error: 'Project not found' }, 404);
  const baseline = await store.getProjectBaseline(projectId);
  if (!baseline) return c.json({ error: 'No approved baseline' }, 404);
  return c.json({ baseline });
});

// --- Baseline review workflow ----------------------------------------------

teamRoutes.post('/:teamId/projects/:projectId/runs/:runId/review', async (c) => {
  const store = c.get('store');
  const teamId = c.req.param('teamId');
  const userId = c.get('userId');
  const guard = await requireCap(store, teamId, userId, 'run_tests');
  if (!guard.ok) return c.json({ error: 'Forbidden' }, guard.status);

  const projectId = c.req.param('projectId');
  const runId = c.req.param('runId');
  const project = await store.getProjectById(projectId);
  if (!project || project.teamId !== teamId) return c.json({ error: 'Project not found' }, 404);
  const run = await store.getRun(runId);
  if (!run || run.projectId !== projectId) return c.json({ error: 'Run not found' }, 404);

  // Only a designated reviewer, or an owner/admin, may approve/reject.
  const member = await store.getMember(teamId, userId);
  const isPrivileged = member ? roleAtLeast(member.role, 'admin') : false;
  if (!member?.reviewer && !isPrivileged) {
    return c.json({ error: 'Only a designated reviewer can review baselines' }, 403);
  }

  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid review', details: parsed.error.flatten().fieldErrors }, 400);

  const approval = {
    id: crypto.randomUUID(),
    runId,
    projectId,
    reviewerUserId: userId,
    status: parsed.data.status,
    comment: parsed.data.comment,
    createdAt: new Date().toISOString(),
  };
  await store.addApproval(approval);

  if (parsed.data.status === 'approved') {
    await store.updateRun(runId, { baselinesApproved: true });
  }
  await logActivity(
    store,
    teamId,
    userId,
    parsed.data.status === 'approved' ? 'baseline.approved' : 'baseline.rejected',
    runId,
    { projectId, comment: parsed.data.comment },
  );

  return c.json({ reviewed: true, status: parsed.data.status, approval }, 201);
});

teamRoutes.get('/:teamId/projects/:projectId/runs/:runId/reviews', async (c) => {
  const store = c.get('store');
  const teamId = c.req.param('teamId');
  const guard = await requireCap(store, teamId, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const reviews = await store.listApprovals(c.req.param('runId'));
  return c.json({ reviews, total: reviews.length });
});

// --- Activity feed ----------------------------------------------------------

teamRoutes.get('/:id/activity', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const activity = await store.listActivity(id, 50);
  return c.json({ activity, total: activity.length });
});

// --- Aggregated usage -------------------------------------------------------

teamRoutes.get('/:id/usage', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const guard = await requireCap(store, id, c.get('userId'), 'view');
  if (!guard.ok) return c.json({ error: 'Team not found' }, guard.status);
  const month = c.req.query('month') || currentMonth();
  const usage = await store.getTeamUsage(id, month);
  return c.json(usage);
});
