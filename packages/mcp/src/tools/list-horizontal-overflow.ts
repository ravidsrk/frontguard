/**
 * `list_horizontal_overflow` — report horizontal viewport overflow for a run.
 *
 * Rows come from the local CLI JSON report or from a cloud run payload that
 * already carries `horizontalOverflow`. A flagged row is a visible unclipped
 * box past the right edge. Nothing here changes a pixel status or an exit code.
 *
 * Only flagged rows are returned by default, largest element `overflowPx`
 * first, in pages of `limit` rows (#379).
 *
 * @module tools/list-horizontal-overflow
 */

import { z } from 'zod';
import type { CloudClient, CloudHorizontalOverflow } from '../client/cloud.js';
import { pageCursorInput, pageLimitInput, paginate } from './_paging.js';
import { newestRun } from './_runs.js';
import {
  capSingleLine,
  MAX_LABEL_LENGTH,
  MAX_OVERFLOW_ELEMENTS_PER_ROW,
  MAX_ROUTE_LENGTH,
  MAX_SELECTOR_LENGTH,
} from './_sanitize.js';

export const listHorizontalOverflowInputSchema = {
  run_id: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Run id. Omit it to read the newest run, including the local report.'),
  flagged_only: z
    .boolean()
    .default(true)
    .describe(
      'Return only flagged rows (a visible unclipped box past the right edge). Default true. Pass false to include rows that only scroll.',
    ),
  limit: pageLimitInput,
  cursor: pageCursorInput,
} as const;

export type ListHorizontalOverflowInput = {
  run_id?: string;
  /** Default true. */
  flagged_only?: boolean;
  /** Rows per page. Default 25, max 200. */
  limit?: number;
  /** `nextCursor` from the previous page. */
  cursor?: string;
};

export interface ListHorizontalOverflowResult {
  runId: string | null;
  /** The filter applied to `rows`. */
  flaggedOnly: boolean;
  /** Rows matching the filter in the whole run. */
  total: number;
  /** Rows in this page. */
  count: number;
  /** Flagged rows in the whole run, whatever the filter. */
  flagged: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Largest element `overflowPx` first. */
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
  runId: z.string().nullable(),
  flaggedOnly: z.boolean(),
  total: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  flagged: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  rows: z.array(rowSchema),
  notFound: z.object({ reason: z.string() }).optional(),
});

function largestOverflowPx(row: CloudHorizontalOverflow): number {
  let largest = 0;
  for (const el of row.elements) {
    if (Number.isFinite(el.overflowPx) && el.overflowPx > largest) largest = el.overflowPx;
  }
  return largest;
}

export async function listHorizontalOverflow(
  client: CloudClient,
  input: ListHorizontalOverflowInput,
): Promise<ListHorizontalOverflowResult> {
  const flaggedOnly = input.flagged_only ?? true;
  const run = input.run_id
    ? await client.getRun(input.run_id)
    : newestRun((await client.listRuns()).runs);
  if (!run) {
    return {
      runId: null,
      flaggedOnly,
      total: 0,
      count: 0,
      flagged: 0,
      nextCursor: null,
      rows: [],
      notFound: { reason: 'No run found' },
    };
  }
  const all = (run.horizontalOverflow ?? []).map((row) => ({
    route: capSingleLine(row.route, MAX_ROUTE_LENGTH),
    viewport: row.viewport,
    ...(row.browser ? { browser: capSingleLine(row.browser, MAX_LABEL_LENGTH) } : {}),
    innerWidth: row.innerWidth,
    scrollWidth: row.scrollWidth,
    flagged: row.flagged,
    elements: (row.elements ?? []).slice(0, MAX_OVERFLOW_ELEMENTS_PER_ROW).map((el) => ({
      selector: capSingleLine(el.selector, MAX_SELECTOR_LENGTH),
      overflowPx: el.overflowPx,
    })),
  }));
  // Array#sort is stable, so rows with equal overflow keep report order.
  const rows = (flaggedOnly ? all.filter((row) => row.flagged) : [...all]).sort(
    (a, b) => largestOverflowPx(b) - largestOverflowPx(a),
  );
  const page = paginate(rows, {
    runId: run.id,
    limit: input.limit,
    cursor: input.cursor,
    filter: flaggedOnly ? 'flagged' : 'all',
  });
  return {
    runId: run.id,
    flaggedOnly,
    total: page.total,
    count: page.count,
    flagged: all.filter((row) => row.flagged).length,
    nextCursor: page.nextCursor,
    rows: page.rows,
  };
}
