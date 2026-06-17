/**
 * `recent_runs` — list the most recent Frontguard runs, optionally
 * filtered by `owner/repo` and a branch hint (matched against the
 * commit SHA short-prefix or PR linkage; the cloud-api does not yet
 * track branch directly).
 *
 * @module tools/recent-runs
 */

import { z } from 'zod';
import type { CloudClient, CloudRun } from '../client/cloud.js';

export const recentRunsInputSchema = {
  repo: z
    .string()
    .min(1)
    .optional()
    .describe('Optional `owner/name` filter.'),
  branch: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional branch hint. Matched against the commit SHA (prefix) or PR number — the cloud-api does not yet track branch directly, so this is best-effort.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of runs to return. Default 10, max 50.'),
} as const;

export type RecentRunsInput = {
  repo?: string;
  branch?: string;
  limit?: number;
};

export interface RecentRunSummary {
  runId: string;
  status: CloudRun['status'];
  url: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
  routesCount: number;
  regressionsCount: number;
  baselinesApproved: boolean;
  reportUrl: string | null;
  repo?: string;
  prNumber?: number;
  commitSha?: string;
}

export interface RecentRunsResult {
  count: number;
  runs: RecentRunSummary[];
}

const REGRESSION_STATUSES = new Set(['regression', 'changed', 'new', 'error']);

function regressionsCount(run: CloudRun): number {
  return (run.results ?? []).filter(
    (r) => REGRESSION_STATUSES.has(r.status) || r.classification === 'regression',
  ).length;
}

function matchesRepo(run: CloudRun, repo: string): boolean {
  if (!run.github) return false;
  return `${run.github.owner}/${run.github.repo}` === repo;
}

function matchesBranch(run: CloudRun, branch: string): boolean {
  if (!run.github) return false;
  if (run.github.commitSha && run.github.commitSha.startsWith(branch)) return true;
  if (run.github.prNumber !== undefined && String(run.github.prNumber) === branch) return true;
  return false;
}

export async function recentRuns(
  client: CloudClient,
  input: RecentRunsInput,
): Promise<RecentRunsResult> {
  const { runs } = await client.listRuns();
  const filtered = runs
    .filter((r) => (input.repo ? matchesRepo(r, input.repo) : true))
    .filter((r) => (input.branch ? matchesBranch(r, input.branch) : true))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, input.limit ?? 10);

  return {
    count: filtered.length,
    runs: filtered.map((r) => ({
      runId: r.id,
      status: r.status,
      url: r.url,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      durationMs: r.duration,
      routesCount: r.routes?.length ?? 0,
      regressionsCount: regressionsCount(r),
      baselinesApproved: Boolean(r.baselinesApproved),
      reportUrl: r.reportUrl,
      repo: r.github ? `${r.github.owner}/${r.github.repo}` : undefined,
      prNumber: r.github?.prNumber,
      commitSha: r.github?.commitSha,
    })),
  };
}
