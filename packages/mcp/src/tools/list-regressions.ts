/**
 * `list_regressions` — given a GitHub PR number (or a Frontguard run id),
 * return the visual regressions detected on that PR.
 *
 * The cloud-api stores PR linkage on the {@link CloudRun} object, so we
 * fetch the user's recent runs and pick the one matching the PR. Falling
 * back to a direct run id lets agents skip the search when they already
 * know the run.
 *
 * @module tools/list-regressions
 */

import { z } from 'zod';
import type { CloudClient, CloudRun, CloudRunResult } from '../client/cloud.js';
import { diffIdFor } from '../client/cloud.js';
import { isRegressionResult } from './_regression.js';

export const listRegressionsInputSchema = {
  pr_id: z
    .union([z.number().int(), z.string().min(1)])
    .describe('GitHub PR number, or a Frontguard run id (e.g. "run_abc123"). Required.'),
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
} as const;

export type ListRegressionsInput = {
  pr_id: number | string;
  repo?: string;
  branch?: string;
};

export interface RegressionRow {
  diffId: string;
  runId: string;
  route: string;
  viewport: number;
  status: string;
  diffPercentage: number;
  classification?: string;
  hasSuggestedFix: boolean;
  reportUrl: string | null;
  prNumber?: number;
  repo?: string;
  commitSha?: string;
}

export interface ListRegressionsResult {
  count: number;
  runId: string | null;
  regressions: RegressionRow[];
  /** Set when no matching run could be found. */
  notFound?: { reason: string };
}

const regressionRowOutputSchema = z.object({
  diffId: z.string(),
  runId: z.string(),
  route: z.string(),
  viewport: z.number(),
  status: z.string(),
  diffPercentage: z.number(),
  classification: z.string().optional(),
  hasSuggestedFix: z.boolean(),
  reportUrl: z.string().nullable(),
  prNumber: z.number().optional(),
  repo: z.string().optional(),
  commitSha: z.string().optional(),
});

export const listRegressionsOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  runId: z.string().nullable(),
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

function matchesPrFilter(run: CloudRun, prId: number | string, repo?: string): boolean {
  if (typeof prId === 'string' && run.id === prId) return true;
  if (!run.github) return false;
  if (repo && `${run.github.owner}/${run.github.repo}` !== repo) return false;
  const prNumber = typeof prId === 'number' ? prId : Number(prId);
  if (!Number.isFinite(prNumber)) return false;
  return run.github.prNumber === prNumber;
}

export async function listRegressions(
  client: CloudClient,
  input: ListRegressionsInput,
): Promise<ListRegressionsResult> {
  let run: CloudRun | null = null;

  if (typeof input.pr_id === 'string' && /^run[_-]/i.test(input.pr_id)) {
    try {
      run = await client.getRun(input.pr_id);
    } catch {
      run = null;
    }
  }

  if (!run) {
    const { runs } = await client.listRuns();
    const matches = runs.filter((r) => matchesPrFilter(r, input.pr_id, input.repo));
    matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    run = matches[0] ?? null;
  }

  if (!run) {
    return {
      count: 0,
      runId: null,
      regressions: [],
      notFound: {
        reason: `No Frontguard run found for pr_id=${input.pr_id}${input.repo ? ` repo=${input.repo}` : ''}. The CI integration may not have completed yet.`,
      },
    };
  }

  const results = run.results ?? [];
  const regressions: RegressionRow[] = results.filter(isRegression).map((r) => ({
    diffId: r.diffId ?? diffIdFor(run.id, r),
    runId: run.id,
    route: r.route,
    viewport: r.viewport,
    status: r.status,
    diffPercentage: r.diffPercentage,
    classification: r.classification,
    hasSuggestedFix: Boolean(r.suggestedFix),
    reportUrl: run.reportUrl,
    prNumber: run.github?.prNumber,
    repo: run.github ? `${run.github.owner}/${run.github.repo}` : undefined,
    commitSha: run.github?.commitSha,
  }));

  return {
    count: regressions.length,
    runId: run.id,
    regressions,
  };
}
