/**
 * Re-exports the MCP tool implementations + their Zod input schemas.
 *
 * Each tool is a pure function: `(client, input) => result`. The server
 * entry wires them to `McpServer.registerTool` and handles auth + error
 * shaping — keeping the tool logic pure makes them trivial to unit test.
 */

export {
  listRegressions,
  listRegressionsInputSchema,
  type ListRegressionsInput,
  type ListRegressionsResult,
  type RegressionRow,
} from './list-regressions.js';

export {
  getSuggestedFix,
  getSuggestedFixInputSchema,
  type GetSuggestedFixInput,
  type SuggestedFixResult,
} from './get-suggested-fix.js';

export {
  acceptBaseline,
  acceptBaselineInputSchema,
  type AcceptBaselineInput,
  type AcceptBaselineResult,
} from './accept-baseline.js';

export {
  recentRuns,
  recentRunsInputSchema,
  type RecentRunsInput,
  type RecentRunsResult,
  type RecentRunSummary,
} from './recent-runs.js';
