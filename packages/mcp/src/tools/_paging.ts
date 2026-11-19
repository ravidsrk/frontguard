/**
 * Bounded pages for the MCP list tools (#379).
 *
 * Tool output lands in the agent's context window, so list tools return at
 * most `limit` rows and an opaque `nextCursor`. The cursor is base64url JSON
 * holding the offset, the run id, the row total and any filter that changes
 * the row set. A cursor from another run, filter or report revision is
 * refused rather than silently skipping or repeating rows.
 *
 * @module tools/_paging
 */

import { z } from 'zod';
import { MAX_CURSOR_LENGTH } from './_sanitize.js';

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 200;

/** `limit` input shared by the paged list tools. */
export const pageLimitInput = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_LIMIT)
  .default(DEFAULT_PAGE_LIMIT)
  .describe(`Maximum rows per page. Default ${DEFAULT_PAGE_LIMIT}, max ${MAX_PAGE_LIMIT}.`);

/** `cursor` input shared by the paged list tools. */
export const pageCursorInput = z
  .string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .optional()
  .describe('The `nextCursor` from the previous page. Omit it for the first page.');

export interface Page<T> {
  /** Rows in the whole (filtered) list. */
  total: number;
  /** Rows in this page. */
  count: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  rows: T[];
}

interface CursorState {
  /** Run id the cursor was issued for. */
  r: string;
  /** Offset of the next row. */
  o: number;
  /** Row total when the cursor was issued. */
  t: number;
  /** Filter key, when the tool has a filter that changes the row set. */
  f?: string;
}

function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): CursorState {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new Error('Invalid cursor. Pass the nextCursor from the previous page, or omit cursor to start over.');
  }
  let state: unknown;
  try {
    state = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    state = null;
  }
  const s = state as Partial<CursorState> | null;
  if (
    !s ||
    typeof s !== 'object' ||
    typeof s.r !== 'string' ||
    !Number.isInteger(s.o) ||
    (s.o as number) < 0 ||
    !Number.isInteger(s.t) ||
    (s.f !== undefined && typeof s.f !== 'string')
  ) {
    throw new Error('Invalid cursor. Pass the nextCursor from the previous page, or omit cursor to start over.');
  }
  return s as CursorState;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** Slice one page of `rows` (already filtered and sorted) for `runId`. */
export function paginate<T>(
  rows: readonly T[],
  opts: { runId: string; limit?: number; cursor?: string; filter?: string },
): Page<T> {
  const total = rows.length;
  let offset = 0;
  if (opts.cursor !== undefined) {
    const state = decodeCursor(opts.cursor);
    if (state.r !== opts.runId) {
      throw new Error(
        `This cursor belongs to run ${state.r}, but the call resolved run ${opts.runId}. Omit cursor to start over.`,
      );
    }
    if ((state.f ?? '') !== (opts.filter ?? '')) {
      throw new Error('This cursor was issued with different filters. Omit cursor to start over.');
    }
    if (state.t !== total) {
      throw new Error(
        `Run ${opts.runId} changed since this cursor was issued (${state.t} rows then, ${total} now). Omit cursor to start over.`,
      );
    }
    offset = state.o;
  }
  const page = rows.slice(offset, offset + clampLimit(opts.limit));
  const next = offset + page.length;
  return {
    total,
    count: page.length,
    nextCursor:
      next < total
        ? encodeCursor({ r: opts.runId, o: next, t: total, ...(opts.filter ? { f: opts.filter } : {}) })
        : null,
    rows: page,
  };
}
