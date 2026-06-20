/**
 * `accept_baseline` — promote a run's current screenshots to the new
 * baseline. Mirrors `POST /v1/baselines/:runId/approve`, which is
 * run-scoped: every diff in the run is promoted together.
 *
 * @module tools/accept-baseline
 */

import { z } from 'zod';
import type { CloudClient } from '../client/cloud.js';

export const acceptBaselineInputSchema = {
  run_id: z
    .string()
    .min(3)
    .describe(
      'Frontguard run id to approve (e.g. `run_abc123` from `list_regressions` or `recent_runs`). Approval is run-scoped — every screenshot in the run is promoted.',
    ),
  confirm_all_regressions_reviewed: z
    .literal(true)
    .describe(
      'Must be `true`. Set only after you have reviewed every regression returned by `list_regressions` for this run — the cloud-api promotes the entire run, not individual diffs.',
    ),
} as const;

export type AcceptBaselineInput = {
  run_id: string;
  confirm_all_regressions_reviewed?: boolean;
};

export interface AcceptBaselineResult {
  approved: boolean;
  runId: string;
}

export async function acceptBaseline(
  client: CloudClient,
  input: AcceptBaselineInput,
): Promise<AcceptBaselineResult> {
  if (input.confirm_all_regressions_reviewed !== true) {
    throw new Error(
      'confirm_all_regressions_reviewed must be true — review every regression from list_regressions before approving the baseline.',
    );
  }
  const res = await client.approveBaseline(input.run_id);
  return { approved: res.approved, runId: res.runId };
}