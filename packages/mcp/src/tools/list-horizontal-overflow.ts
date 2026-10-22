/**
 * `list_horizontal_overflow` — report horizontal viewport overflow for a run.
 *
 * Rows come from the local CLI JSON report or from a cloud run payload that
 * already carries `horizontalOverflow`. A flagged row is a visible unclipped
 * box past the right edge. Nothing here changes a pixel status or an exit code.
 *
 * @module tools/list-horizontal-overflow
 */

import { z } from 'zod';
import type { CloudClient, CloudHorizontalOverflow } from '../client/cloud.js';

export const listHorizontalOverflowInputSchema = {
  run_id: z
    .string()
    .min(1)
    .optional()
    .describe('Run id. Omit it to read the newest run, including the local report.'),
} as const;

export type ListHorizontalOverflowInput = {
  run_id?: string;
};

export interface ListHorizontalOverflowResult {
  count: number;
  flagged: number;
  runId: string | null;
  rows: CloudHorizontalOverflow[];
  notFound?: { reason: string };
}

const elementSchema = z.object({
  selector: z.string(),
  overflowPx: z.number(),
});

const rowSchema = z.object({
  route: z.string(),
  viewport: z.number(),
  browser: z.string().optional(),
  innerWidth: z.number(),
  scrollWidth: z.number(),
  flagged: z.boolean(),
  elements: z.array(elementSchema),
});

export const listHorizontalOverflowOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  flagged: z.number().int().nonnegative(),
  runId: z.string().nullable(),
  rows: z.array(rowSchema),
  notFound: z.object({ reason: z.string() }).optional(),
});

export async function listHorizontalOverflow(
  client: CloudClient,
  input: ListHorizontalOverflowInput,
): Promise<ListHorizontalOverflowResult> {
  const run = input.run_id
    ? await client.getRun(input.run_id)
    : (await client.listRuns()).runs[0];
  if (!run) {
    return {
      count: 0,
      flagged: 0,
      runId: null,
      rows: [],
      notFound: { reason: 'No run found' },
    };
  }
  const rows = run.horizontalOverflow ?? [];
  return {
    count: rows.length,
    flagged: rows.filter((row) => row.flagged).length,
    runId: run.id,
    rows,
  };
}
