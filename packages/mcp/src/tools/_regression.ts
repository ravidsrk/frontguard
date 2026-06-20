/**
 * Shared regression-status helpers for MCP list/count tools (mcp-8).
 *
 * First-time baselines use `status: 'new'` in the CLI; they are not regressions.
 *
 * @module tools/_regression
 */

import type { CloudRunResult } from '../client/cloud.js';

/** Statuses that surface as regressions in MCP list/count tools. */
export const REGRESSION_STATUSES = new Set(['regression', 'changed', 'error']);

export function isRegressionResult(
  result: Pick<CloudRunResult, 'status' | 'classification'>,
): boolean {
  return REGRESSION_STATUSES.has(result.status) || result.classification === 'regression';
}