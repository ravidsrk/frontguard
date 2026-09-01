/**
 * `accept_baseline` records whole-run approval through
 * `POST /v1/baselines/:runId/approve`. The cloud endpoint does not yet
 * promote screenshots to baseline records.
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
      'Frontguard run id to approve (e.g. `run_abc123` from `list_regressions` or `recent_runs`). Approval is run-scoped but does not yet promote screenshots.',
    ),
  confirm_all_regressions_reviewed: z
    .literal(true)
    .describe(
      'Must be `true`. Set only after you have reviewed every regression returned by `list_regressions` for this run. The cloud API records whole-run approval only.',
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

export const acceptBaselineOutputSchema = z.object({
  approved: z.boolean(),
  runId: z.string(),
});

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
