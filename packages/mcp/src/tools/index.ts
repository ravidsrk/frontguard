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
  listRegressionsOutputSchema,
  type ListRegressionsInput,
  type ListRegressionsResult,
  type RegressionRow,
} from './list-regressions.js';

export {
  getSuggestedFix,
  getSuggestedFixInputSchema,
  getSuggestedFixOutputSchema,
  type GetSuggestedFixInput,
  type SuggestedFixResult,
} from './get-suggested-fix.js';

export {
  acceptBaseline,
  acceptBaselineInputSchema,
  acceptBaselineOutputSchema,
  type AcceptBaselineInput,
  type AcceptBaselineResult,
} from './accept-baseline.js';

export {
  recentRuns,
  recentRunsInputSchema,
  recentRunsOutputSchema,
  type RecentRunsInput,
  type RecentRunsResult,
  type RecentRunSummary,
} from './recent-runs.js';
