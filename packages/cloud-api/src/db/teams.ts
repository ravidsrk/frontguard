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

import type { Run } from '../types.js';

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
  /** Designated baseline reviewer flag. */
  reviewer?: boolean;
  createdAt: string;
}

/** A pending invitation. Invites carry either an email or a GitHub login. */
export interface TeamInvitation {
  id: string;
  teamId: string;
  /** Invitee email (nullable — one of email/githubLogin is required). */
  email?: string;
  /** Invitee GitHub login (alternative to email). */
  githubLogin?: string;
  role: TeamRole;
  token: string;
  createdAt: string;
  /** ISO timestamp after which the token is no longer valid (SEC-4). */
  expiresAt?: string;
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

/** A baseline approval/rejection by a reviewer (review workflow). */
export interface BaselineApproval {
  id: string;
  runId: string;
  projectId?: string;
  reviewerUserId: string;
  status: 'approved' | 'rejected';
  comment?: string;
  createdAt: string;
}

/** A team activity feed entry. */
export interface TeamActivity {
  id: string;
  teamId: string;
  userId?: string;
  action: string;
  target?: string;
  /** JSON-serialised metadata blob. */
  metadata?: string;
  createdAt: string;
}

/** Aggregated team usage for a month. */
export interface TeamUsage {
  month: string;
  runsCount: number;
  screenshotsCount: number;
  memberCount: number;
  perMember: Array<{ userId: string; runsCount: number; screenshotsCount: number }>;
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
  /** Resolves a team by its Stripe subscription id (fallback when webhook metadata is absent). */
  getTeamByStripeSubscriptionId(subscriptionId: string): Promise<Team | null>;
  updateTeam(id: string, patch: Partial<Team>): Promise<void>;
  deleteTeam(id: string): Promise<boolean>;
  listTeamsForUser(userId: string): Promise<Array<Team & { role: TeamRole }>>;

  addMember(member: TeamMember): Promise<void>;
  getMember(teamId: string, userId: string): Promise<TeamMember | null>;
  listMembers(teamId: string): Promise<TeamMember[]>;
  updateMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
  setReviewer(teamId: string, userId: string, reviewer: boolean): Promise<void>;
  removeMember(teamId: string, userId: string): Promise<boolean>;

  createInvitation(inv: TeamInvitation): Promise<void>;
  getInvitationByToken(token: string): Promise<TeamInvitation | null>;
  listInvitations(teamId: string): Promise<TeamInvitation[]>;
  acceptInvitation(token: string, at: string): Promise<TeamInvitation | null>;

  createProject(project: TeamProject): Promise<void>;
  getProjectById(id: string): Promise<TeamProject | null>;
  listProjects(teamId: string): Promise<TeamProject[]>;
  deleteProject(id: string, teamId: string): Promise<boolean>;

  // Project-scoped runs & baselines
  listProjectRuns(projectId: string, limit?: number, offset?: number): Promise<Run[]>;
  getProjectBaseline(projectId: string): Promise<Run | null>;

  // Baseline approvals / review workflow
  addApproval(approval: BaselineApproval): Promise<void>;
  listApprovals(runId: string): Promise<BaselineApproval[]>;

  // Activity feed
  recordActivity(activity: TeamActivity): Promise<void>;
  listActivity(teamId: string, limit?: number): Promise<TeamActivity[]>;

  // Aggregated usage
  getTeamUsage(teamId: string, month: string): Promise<TeamUsage>;
}
