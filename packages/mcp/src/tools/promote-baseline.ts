/**
 * `promote_baseline` — promote reviewed visual changes to baseline after
 * explicit confirmation, optionally scoped to a subset of routes.
 *
 * @module tools/promote-baseline
 */

import { z } from 'zod';
import type { CloudClient, CloudRun } from '../client/cloud.js';

export const promoteBaselineInputSchema = {
  run_id: z.string().min(1).describe('Run ID or PR number whose baselines should be promoted.'),
  routes: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional subset of route paths to promote (defaults to all changed/new routes in the run).'),
  confirm_reviewed: z
    .boolean()
    .describe('Must be true to confirm visual changes were reviewed before promotion.'),
} as const;

export type PromoteBaselineInput = {
  run_id: string;
  routes?: string[];
  confirm_reviewed: boolean;
};

export interface PromoteBaselineResult {
  promoted: boolean;
  runId: string;
  promotedRoutes: string[];
  mode: 'local-report' | 'cloud-api';
}

export const promoteBaselineOutputSchema = z.object({
  promoted: z.boolean(),
  runId: z.string(),
  promotedRoutes: z.array(z.string()),
  mode: z.enum(['local-report', 'cloud-api']),
});

async function resolveRun(client: CloudClient, runIdOrPr: string): Promise<CloudRun> {
  try {
    return await client.getRun(runIdOrPr);
  } catch {
    const { runs } = await client.listRuns();
    const prNumber = Number(runIdOrPr);
    const matches = runs.filter(
      (r) =>
        r.id === runIdOrPr ||
        (Number.isFinite(prNumber) && r.github?.prNumber === prNumber),
    );
    matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (matches[0]) {
      return matches[0];
    }
    throw new Error(`No Frontguard run found for run_id=${runIdOrPr}.`);
  }
}

export async function promoteBaseline(
  client: CloudClient,
  input: PromoteBaselineInput,
): Promise<PromoteBaselineResult> {
  if (input.confirm_reviewed !== true) {
    throw new Error(
      'confirm_reviewed must be true — review visual changes before promoting baselines.',
    );
  }

  if (client.mode === 'local-report') {
    throw new Error(
      'Baseline promotion is not supported in local-report mode and does not write the frontguard-baselines branch. The local write is the CLI command `npx frontguard update-baselines --confirm-baselines`. Cloud approveRun is not a production path. Setting confirm_reviewed: true is not a human review.',
    );
  }

  const run = await resolveRun(client, input.run_id);
  const routeSet = input.routes && input.routes.length > 0 ? new Set(input.routes) : null;
  const results = run.results ?? [];
  const allChangedDiffs = results.filter(
    (r) => r.status !== 'pass' && r.status !== 'unchanged',
  );

  if (routeSet) {
    const unselectedChangedRoutes = Array.from(
      new Set(allChangedDiffs.filter((r) => !routeSet.has(r.route)).map((r) => r.route)),
    );
    if (unselectedChangedRoutes.length > 0) {
      throw new Error(
        `Cannot partially promote routes [${Array.from(routeSet).join(', ')}] because cloud baseline approval is whole-run and would also approve unreviewed routes: ${unselectedChangedRoutes.join(', ')}. Include all changed routes or promote locally via CLI.`,
      );
    }
  }

  const matchingDiffs = results.filter((r) =>
    routeSet ? routeSet.has(r.route) : r.status !== 'pass' && r.status !== 'unchanged',
  );

  const promotedRoutes = Array.from(
    new Set(
      matchingDiffs.length > 0
        ? matchingDiffs.map((r) => r.route)
        : routeSet
          ? Array.from(routeSet)
          : [],
    ),
  );

  await client.approveRun(run.id);

  return {
    promoted: true,
    runId: run.id,
    promotedRoutes,
    mode: client.mode ?? 'cloud-api',
  };
}
