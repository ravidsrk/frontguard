/**
 * Team workspace records and store contract (Task 8.1).
 *
 * Teams enable multi-user workspaces with role-based access:
 *   owner > admin > member > viewer
 *
 * Roles gate capabilities (see {@link can}). Baselines, projects, and usage are
 * scoped to a team.
 *
 * @module db/teams
 */

/** Team roles, highest privilege first. */
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

/** A team workspace. */
export interface Team {
  id: string;
  name: string;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
}

/** A team membership. */
export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  createdAt: string;
}

/** A pending invitation. */
export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  token: string;
  createdAt: string;
  acceptedAt?: string;
}

/** A team project (shared baselines, config). */
export interface TeamProject {
  id: string;
  teamId: string;
  name: string;
  repoUrl?: string;
  config?: string;
  createdAt: string;
}

/** Capabilities gated by role. */
export type Capability =
  | 'manage_team' // rename, delete, billing
  | 'manage_members' // invite/remove/role-change
  | 'run_tests' // submit runs, approve baselines
  | 'view'; // read-only

const ROLE_RANK: Record<TeamRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };

/** Minimum role required for each capability. */
const CAPABILITY_MIN_ROLE: Record<Capability, TeamRole> = {
  manage_team: 'owner',
  manage_members: 'admin',
  run_tests: 'member',
  view: 'viewer',
};

/** Returns true if `role` is permitted to perform `capability`. */
export function can(role: TeamRole, capability: Capability): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[CAPABILITY_MIN_ROLE[capability]];
}

/** Compares two roles; returns true if `a` outranks (or equals) `b`. */
export function roleAtLeast(a: TeamRole, b: TeamRole): boolean {
  return ROLE_RANK[a] >= ROLE_RANK[b];
}

/** Storage operations for teams. */
export interface TeamStore {
  createTeam(team: Team, ownerUserId: string): Promise<void>;
  getTeam(id: string): Promise<Team | null>;
  updateTeam(id: string, patch: Partial<Team>): Promise<void>;
  deleteTeam(id: string): Promise<boolean>;
  listTeamsForUser(userId: string): Promise<Array<Team & { role: TeamRole }>>;

  addMember(member: TeamMember): Promise<void>;
  getMember(teamId: string, userId: string): Promise<TeamMember | null>;
  listMembers(teamId: string): Promise<TeamMember[]>;
  updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
  removeMember(teamId: string, userId: string): Promise<boolean>;

  createInvitation(inv: TeamInvitation): Promise<void>;
  getInvitationByToken(token: string): Promise<TeamInvitation | null>;
  listInvitations(teamId: string): Promise<TeamInvitation[]>;
  acceptInvitation(token: string, at: string): Promise<TeamInvitation | null>;

  createProject(project: TeamProject): Promise<void>;
  listProjects(teamId: string): Promise<TeamProject[]>;
  deleteProject(id: string, teamId: string): Promise<boolean>;
}
