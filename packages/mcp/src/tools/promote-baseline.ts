/**
 * `promote_baseline` — record whole-run approval and report truthful cloud
 * baseline promotion state from `POST /v1/baselines/:runId/approve`.
 *
 * Requires an explicit `run_id` (bare PR numbers are rejected to prevent
 * cross-repository ambiguity). `routes` cannot scope the approval: the call
 * is refused unless every changed route in the run is listed. Local-report
 * mode refuses it outright.
 *
 * @module tools/promote-baseline
 */

import { z } from 'zod';
import { assertValidRunId, type CloudClient } from '../client/cloud.js';

export const promoteBaselineInputSchema = {
  run_id: z
    .string()
    .min(1)
    .max(128)
    .describe(
      'Explicit Frontguard run id of the reviewed run (e.g. `run_abc123` from `list_regressions` or `recent_runs`). Bare PR numbers are rejected.',
    ),
  routes: z
    .array(z.string().min(1).max(256))
    .max(500)
    .optional()
    .describe(
      'Optional list of reviewed route paths. It does not scope the approval, which is whole-run: the call is refused unless every changed route in the run is listed. Defaults to all changed routes.',
    ),
  confirm_reviewed: z
    .boolean()
    .describe('Must be true to confirm the visual changes were reviewed before approval is recorded.'),
} as const;

export type PromoteBaselineInput = {
  run_id: string;
  routes?: string[];
  confirm_reviewed: boolean;
};

export interface PromoteBaselineResult {
  /** Whole-run approval was recorded by Cloud API. */
  approvalRecorded: true;
  /** Truthful screenshot promotion status based on the Cloud API approve response. */
  screenshotsPromoted: boolean;
  runId: string;
  /** Routes the caller reviewed (all changed routes when `routes` is omitted). */
  reviewedRoutes: string[];
  mode: 'local-report' | 'cloud-api';
}

export const promoteBaselineOutputSchema = z.object({
  approvalRecorded: z.literal(true),
  screenshotsPromoted: z.boolean(),
  runId: z.string(),
  reviewedRoutes: z.array(z.string()),
  mode: z.enum(['local-report', 'cloud-api']),
});

export async function promoteBaseline(
  client: CloudClient,
  input: PromoteBaselineInput,
): Promise<PromoteBaselineResult> {
  if (input.confirm_reviewed !== true) {
    throw new Error(
      'confirm_reviewed must be true — review visual changes before recording approval.',
    );
  }

  if (client.mode === 'local-report') {
    throw new Error(
      'Baseline promotion is not supported in local-report mode and does not write the frontguard-baselines branch. The local write is the CLI command `npx frontguard update-baselines --confirm-baselines`. Setting confirm_reviewed: true is not a human review.',
    );
  }

  const trimmedRunId = input.run_id.trim();
  if (/^\d+$/.test(trimmedRunId)) {
    throw new Error(
      'promote_baseline requires an explicit run_id (e.g. "run_abc123" from list_regressions or recent_runs). Bare PR numbers are rejected because they are ambiguous across repositories.',
    );
  }
  const safeRunId = assertValidRunId(trimmedRunId);

  const run = await client.getRun(safeRunId);
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
        `Cannot partially promote routes [${Array.from(routeSet).join(', ')}] because cloud baseline approval is whole-run and would also approve unreviewed routes: ${unselectedChangedRoutes.join(', ')}. Include all changed routes, or have a human update baselines locally with the CLI.`,
      );
    }
  }

  const matchingDiffs = results.filter((r) =>
    routeSet ? routeSet.has(r.route) : r.status !== 'pass' && r.status !== 'unchanged',
  );

  const reviewedRoutes = Array.from(
    new Set(
      matchingDiffs.length > 0
        ? matchingDiffs.map((r) => r.route)
        : routeSet
          ? Array.from(routeSet)
          : [],
    ),
  );

  // Cloud API POST /v1/baselines/:runId/approve updates baselinesApproved and
  // promotes the run's current screenshots to active baselines.
  const res = await client.approveRun(run.id);
  const screenshotsPromoted =
    typeof res.screenshotsPromoted === 'boolean'
      ? res.screenshotsPromoted
      : Boolean(res.approved);

  return {
    approvalRecorded: true,
    screenshotsPromoted,
    runId: run.id,
    reviewedRoutes,
    mode: client.mode ?? 'cloud-api',
  };
}
