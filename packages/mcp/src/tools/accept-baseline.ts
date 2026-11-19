/**
 * `accept_baseline` records whole-run approval through Cloud API
 * `POST /v1/baselines/:runId/approve`. Refused in `local-report` mode because
 * local reports are read-only and never modify local files or git baselines.
 *
 * @module tools/accept-baseline
 */

import { z } from 'zod';
import { assertValidRunId, type CloudClient } from '../client/cloud.js';

export const acceptBaselineInputSchema = {
  run_id: z
    .string()
    .min(3)
    .max(128)
    .describe(
      'Frontguard run id to approve (e.g. `run_abc123` from `list_regressions` or `recent_runs`). Refused in local-report mode.',
    ),
  confirm_all_regressions_reviewed: z
    .literal(true)
    .describe(
      'Must be `true`. Set only after you have reviewed every regression returned by `list_regressions` for this run.',
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
  if (client.mode === 'local-report') {
    throw new Error(
      'accept_baseline is not supported in local-report mode: local JSON reports are read-only and never modified. Run `npx frontguard update-baselines --confirm-baselines` to update local baselines.',
    );
  }
  const runId = assertValidRunId(input.run_id);
  const res = await client.approveBaseline(runId);
  return { approved: res.approved, runId: res.runId };
}
