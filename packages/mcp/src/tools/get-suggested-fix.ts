/**
 * `get_suggested_fix` — return the AI-generated patch for a single diff,
 * keyed by the synthetic `diffId` returned by `list_regressions`.
 *
 * @module tools/get-suggested-fix
 */

import { z } from 'zod';
import type { CloudClient, CloudSuggestedFix } from '../client/cloud.js';
import { diffIdFor, parseDiffId } from '../client/cloud.js';

export const getSuggestedFixInputSchema = {
  diff_id: z
    .string()
    .min(3)
    .describe(
      'A diff id from `list_regressions` — encodes the run id, route, and viewport (e.g. `run_abc:/pricing:1280`).',
    ),
} as const;

export type GetSuggestedFixInput = { diff_id: string };

export interface SuggestedFixResult {
  diffId: string;
  runId: string;
  route: string;
  viewport: number;
  fix: CloudSuggestedFix | null;
  /** Set when the diff exists but no AI-generated fix is available. */
  reason?: string;
}

export async function getSuggestedFix(
  client: CloudClient,
  input: GetSuggestedFixInput,
): Promise<SuggestedFixResult> {
  const parsed = parseDiffId(input.diff_id);
  if (!parsed) {
    return {
      diffId: input.diff_id,
      runId: '',
      route: '',
      viewport: 0,
      fix: null,
      reason: 'Invalid diff_id format — expected `<runId>:<route>:<viewport>`.',
    };
  }

  const { runId, route, viewport } = parsed;
  const run = await client.getRun(runId);
  const match = (run.results ?? []).find(
    (r) => r.route === route && r.viewport === viewport,
  );

  if (!match) {
    return {
      diffId: input.diff_id,
      runId,
      route,
      viewport,
      fix: null,
      reason: `Diff not found in run ${runId} — route=${route} viewport=${viewport}.`,
    };
  }

  if (!match.suggestedFix) {
    return {
      diffId: diffIdFor(runId, match),
      runId,
      route,
      viewport,
      fix: null,
      reason:
        'No AI fix available for this diff. Re-run with an `ai` provider configured to generate suggestions.',
    };
  }

  return {
    diffId: diffIdFor(runId, match),
    runId,
    route,
    viewport,
    fix: match.suggestedFix,
  };
}
