/**
 * `list_regressions` — given a GitHub PR number, a Frontguard run id, or
 * `"latest"`, return the visual regressions detected on that run.
 *
 * The cloud-api stores PR linkage on the {@link CloudRun} object, so we
 * fetch the user's recent runs and pick the one matching the PR. Falling
 * back to a direct run id lets agents skip the search when they already
 * know the run. `"latest"` picks the newest run by `createdAt`; a local
 * report is a single run, so there it is the report's run.
 *
 * @module tools/list-regressions
 */

import { z } from 'zod';
import type { CloudClient, CloudRun, CloudRunResult } from '../client/cloud.js';
import { diffIdFor } from '../client/cloud.js';
import { pageCursorInput, pageLimitInput, paginate } from './_paging.js';
import { isRegressionResult } from './_regression.js';
import { LATEST_RUN, matchesRepo, newestRun } from './_runs.js';

export const listRegressionsInputSchema = {
  pr_id: z
    .union([z.number().int(), z.string().min(1)])
    .describe(
      'GitHub PR number, a Frontguard run id (e.g. "run_abc123"; a local report is "run_local" unless it sets an id), or "latest" for the newest run (in local-report mode, the report\'s run). Required.',
    ),
  repo: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional `owner/name` filter — disambiguates when the same PR number exists across multiple repos.',
    ),
  branch: z
    .string()
    .min(1)
    .optional()
    .describe('Reserved for future use; ignored by the current cloud-api.'),
  limit: pageLimitInput,
  cursor: pageCursorInput,
} as const;

export type ListRegressionsInput = {
  pr_id: number | string;
  repo?: string;
  branch?: string;
  /** Rows per page. Default 25, max 200. */
  limit?: number;
  /** `nextCursor` from the previous page. */
  cursor?: string;
};

/** One regression. Run-level fields live on {@link ListRegressionsResult}. */
export interface RegressionRow {
  diffId: string;
  route: string;
  viewport: number;
  status: string;
  diffPercentage: number;
  classification?: string;
  hasSuggestedFix: boolean;
  /** Number of diff clusters recorded for this diff (0 when none). */
  clusterCount: number;
}

export interface ListRegressionsResult {
  runId: string | null;
  reportUrl: string | null;
  prNumber?: number;
  repo?: string;
  commitSha?: string;
  /** Regression rows in the whole run. */
  total: number;
  /** Rows in this page. */
  count: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Worst first: regression/error, then changed; then `diffPercentage` descending. */
  regressions: RegressionRow[];
  /** Set when no matching run could be found. */
  notFound?: { reason: string };
}

const regressionRowOutputSchema = z.object({
  diffId: z.string(),
  route: z.string(),
  viewport: z.number(),
  status: z.string(),
  diffPercentage: z.number(),
  classification: z.string().optional(),
  hasSuggestedFix: z.boolean(),
  clusterCount: z.number().int().nonnegative(),
});

export const listRegressionsOutputSchema = z.object({
  runId: z.string().nullable(),
  reportUrl: z.string().nullable(),
  prNumber: z.number().optional(),
  repo: z.string().optional(),
  commitSha: z.string().optional(),
  total: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  regressions: z.array(regressionRowOutputSchema),
  notFound: z
    .object({
      reason: z.string(),
    })
    .optional(),
});

function isRegression(r: CloudRunResult): boolean {
  return isRegressionResult(r);
}

/** regression and error rank before changed; anything else after. */
const STATUS_RANK: Readonly<Record<string, number>> = { regression: 0, error: 0, changed: 1 };

function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 2;
}

function sortKey(diffPercentage: number): number {
  return Number.isFinite(diffPercentage) ? diffPercentage : 0;
}

/** Worst first. Array#sort is stable, so equal rows keep report order. */
function compareRows(a: RegressionRow, b: RegressionRow): number {
  return (
    statusRank(a.status) - statusRank(b.status) ||
    sortKey(b.diffPercentage) - sortKey(a.diffPercentage)
  );
}

function matchesPrFilter(run: CloudRun, prId: number | string, repo?: string): boolean {
  if (typeof prId === 'string' && run.id === prId) return true;
  if (!run.github) return false;
  if (repo && !matchesRepo(run, repo)) return false;
  const prNumber = typeof prId === 'number' ? prId : Number(prId);
  if (!Number.isFinite(prNumber)) return false;
  return run.github.prNumber === prNumber;
}

export async function listRegressions(
  client: CloudClient,
  input: ListRegressionsInput,
): Promise<ListRegressionsResult> {
  let run: CloudRun | null = null;

  if (input.pr_id === LATEST_RUN) {
    const { runs } = await client.listRuns();
    const repo = input.repo;
    run = newestRun(repo ? runs.filter((r) => matchesRepo(r, repo)) : runs);
  } else if (
    typeof input.pr_id === 'string' &&
    /^(?:run[_-]|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)/i.test(input.pr_id)
  ) {
    try {
      run = await client.getRun(input.pr_id);
    } catch {
      run = null;
    }
  }

  if (!run && input.pr_id !== LATEST_RUN) {
    const { runs } = await client.listRuns();
    run = newestRun(runs.filter((r) => matchesPrFilter(r, input.pr_id, input.repo)));
  }

  if (!run) {
    return {
      runId: null,
      reportUrl: null,
      total: 0,
      count: 0,
      nextCursor: null,
      regressions: [],
      notFound: {
        reason: `No Frontguard run found for pr_id=${input.pr_id}${input.repo ? ` repo=${input.repo}` : ''}. The CI integration may not have completed yet.`,
      },
    };
  }

  const runId = run.id;
  const rows: RegressionRow[] = (run.results ?? [])
    .filter(isRegression)
    .map((r) => ({
      diffId: r.diffId ?? diffIdFor(runId, r),
      route: r.route,
      viewport: r.viewport,
      status: r.status,
      diffPercentage: r.diffPercentage,
      classification: r.classification,
      hasSuggestedFix: Boolean(r.suggestedFix),
      clusterCount: r.clusters?.length ?? 0,
    }))
    .sort(compareRows);
  const page = paginate(rows, { runId, limit: input.limit, cursor: input.cursor });

  return {
    runId,
    reportUrl: run.reportUrl ?? null,
    prNumber: run.github?.prNumber,
    repo: run.github ? `${run.github.owner}/${run.github.repo}` : undefined,
    commitSha: run.github?.commitSha,
    total: page.total,
    count: page.count,
    nextCursor: page.nextCursor,
    regressions: page.rows,
  };
}
