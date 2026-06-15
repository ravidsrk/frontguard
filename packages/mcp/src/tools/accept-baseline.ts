/**
 * `accept_baseline` — promote a run's current screenshots to the new
 * baseline. Mirrors `POST /v1/baselines/:runId/approve` and accepts either
 * a run id or a diff id (which carries the run id in its prefix).
 *
 * @module tools/accept-baseline
 */

import { z } from 'zod';
import type { CloudClient } from '../client/cloud.js';
import { parseDiffId } from '../client/cloud.js';

export const acceptBaselineInputSchema = {
  diff_id: z
    .string()
    .min(3)
    .describe(
      'Either a diff id from `list_regressions` (e.g. `run_abc:/home:1280`) or a bare run id. Approval is run-scoped — the whole run is approved as a new baseline.',
    ),
} as const;

export type AcceptBaselineInput = { diff_id: string };

export interface AcceptBaselineResult {
  approved: boolean;
  runId: string;
}

export async function acceptBaseline(
  client: CloudClient,
  input: AcceptBaselineInput,
): Promise<AcceptBaselineResult> {
  const parsed = parseDiffId(input.diff_id);
  const runId = parsed ? parsed.runId : input.diff_id;
  const res = await client.approveBaseline(runId);
  return { approved: res.approved, runId: res.runId };
}
