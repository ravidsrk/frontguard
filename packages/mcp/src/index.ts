/**
 * Frontguard MCP server — stdio entry.
 *
 * Registers four tools (`list_regressions`, `get_suggested_fix`,
 * `accept_baseline`, `recent_runs`) and connects them to a stdio transport
 * so editor agents (Claude Code, Cursor, Copilot) can call them in-loop.
 *
 * The server starts even without `FRONTGUARD_API_KEY` set — the SDK lists
 * the tool catalog first; auth is enforced on each tool call. Missing-key
 * errors are returned as MCP tool errors with a human-readable message so
 * the agent can surface a clear "configure the key" hint.
 *
 * @module @frontguard/mcp
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireAuth, MissingApiKeyError, MissingApiUrlError } from './auth.js';
import {
  CloudApiError,
  CloudClient,
  createLocalReportClient,
  resolveLocalReportPath,
} from './client/cloud.js';
import {
  acceptBaseline,
  acceptBaselineInputSchema,
  acceptBaselineOutputSchema,
  getSuggestedFix,
  getSuggestedFixInputSchema,
  getSuggestedFixOutputSchema,
  inspectDiffClusterDom,
  inspectDiffClusterDomInputSchema,
  inspectDiffClusterDomOutputSchema,
  listRegressions,
  listRegressionsInputSchema,
  listRegressionsOutputSchema,
  promoteBaseline,
  promoteBaselineInputSchema,
  promoteBaselineOutputSchema,
  recentRuns,
  recentRunsInputSchema,
  recentRunsOutputSchema,
  verifyCssPatch,
  verifyCssPatchInputSchema,
  verifyCssPatchOutputSchema,
} from './tools/index.js';

const SERVER_NAME = '@frontguard/mcp';
const SERVER_VERSION = '0.2.3';

/**
 * Build a fresh {@link McpServer} with all Frontguard tools registered.
 * Exported so tests can drive it without spawning a subprocess.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'Frontguard MCP server. Use `list_regressions` to see what visual regressions a PR has, `inspect_diff_cluster_dom` to inspect cluster bounding boxes and grounded DOM targets, `get_suggested_fix` to read the AI patch for a specific diff, `verify_css_patch` to validate candidate CSS fixes, `promote_baseline` to promote reviewed visual changes, and `recent_runs` to browse history. `accept_baseline` currently records whole-run approval.',
    },
  );

  server.registerTool(
    'list_regressions',
    {
      title: 'List regressions for a PR',
      description:
        'Return the visual regressions Frontguard detected on a given GitHub PR (or run id). Each row carries a `diffId` you can pass to `get_suggested_fix`.',
      inputSchema: listRegressionsInputSchema,
      outputSchema: listRegressionsOutputSchema,
    },
    async (args) => withCloudClient(async (client) => listRegressions(client, args)),
  );

  server.registerTool(
    'get_suggested_fix',
    {
      title: 'Get the suggested fix for a diff',
      description:
        'Return the AI-generated patch for a single diff (keyed by the `diffId` from `list_regressions`).',
      inputSchema: getSuggestedFixInputSchema,
      outputSchema: getSuggestedFixOutputSchema,
    },
    async (args) => withCloudClient(async (client) => getSuggestedFix(client, args)),
  );

  server.registerTool(
    'accept_baseline',
    {
      title: 'Record whole-run baseline approval',
      description:
        'Record run-scoped whole-run approval after `confirm_all_regressions_reviewed: true`. Screenshot promotion is not implemented yet; use the CLI or composite Action to update baselines.',
      inputSchema: acceptBaselineInputSchema,
      outputSchema: acceptBaselineOutputSchema,
    },
    async (args) => withCloudClient(async (client) => acceptBaseline(client, args)),
  );

  server.registerTool(
    'recent_runs',
    {
      title: 'List recent Frontguard runs',
      description:
        'List the most recent runs the API key has access to. Optional `repo` and `branch` filters narrow the results.',
      inputSchema: recentRunsInputSchema,
      outputSchema: recentRunsOutputSchema,
    },
    async (args) => withCloudClient(async (client) => recentRuns(client, args)),
  );

  server.registerTool(
    'inspect_diff_cluster_dom',
    {
      title: 'Inspect diff cluster and grounded DOM target',
      description:
        'Inspect a specific visual regression diff cluster, returning its bounding box, AI classification, suggested fix, and grounded DOM target selector.',
      inputSchema: inspectDiffClusterDomInputSchema,
      outputSchema: inspectDiffClusterDomOutputSchema,
    },
    async (args) => withCloudClient(async (client) => inspectDiffClusterDom(client, args)),
  );

  server.registerTool(
    'verify_css_patch',
    {
      title: 'Verify a candidate CSS patch before applying',
      description:
        'Validate a candidate CSS patch against a visual regression diff for syntax correctness, target selector alignment, and layout-destroying properties.',
      inputSchema: verifyCssPatchInputSchema,
      outputSchema: verifyCssPatchOutputSchema,
    },
    async (args) => withCloudClient(async (client) => verifyCssPatch(client, args)),
  );

  server.registerTool(
    'promote_baseline',
    {
      title: 'Promote reviewed visual baselines',
      description:
        'Promote reviewed visual changes to baseline after `confirm_reviewed: true`, optionally scoped to specific routes.',
      inputSchema: promoteBaselineInputSchema,
      outputSchema: promoteBaselineOutputSchema,
    },
    async (args) => withCloudClient(async (client) => promoteBaseline(client, args)),
  );

  return server;
}

/**
 * Wraps a tool body: builds a fresh {@link CloudClient}, runs the handler,
 * and shapes errors into the MCP `CallToolResult` envelope. Auth errors are
 * returned as `isError: true` so the agent sees them as tool errors rather
 * than as the server crashing.
 */
async function withCloudClient<T extends object>(
  fn: (client: CloudClient) => Promise<T>,
): Promise<CallToolResult> {
  try {
    const localReportPath = resolveLocalReportPath();
    const client = localReportPath
      ? createLocalReportClient(localReportPath)
      : new CloudClient(requireAuth());
    const data = await fn(client);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch (err) {
    return toolError(err);
  }
}

function toolError(err: unknown): CallToolResult {
  if (err instanceof MissingApiKeyError || err instanceof MissingApiUrlError) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message }],
    };
  }
  if (err instanceof CloudApiError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Frontguard cloud-api error (${err.status}): ${err.body || err.message}`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: `Frontguard MCP error: ${message}` }],
  };
}

/** Process entry — connects the server to stdio. */
export async function main(): Promise<void> {
  process.stderr.write(`frontguard-mcp v${SERVER_VERSION} starting on stdio\n`);
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** True when this module is the process entry (not when imported from tests). */
export function isInvokedDirectly(argv: string[] = process.argv): boolean {
  if (typeof process === 'undefined' || !argv[1]) return false;
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(argv[1]))
    );
  } catch {
    return false;
  }
}

const invokedDirectly = isInvokedDirectly();

if (invokedDirectly) {
  main().catch((err) => {
    // Log to stderr so stdout stays a clean JSON-RPC channel for the SDK.
    process.stderr.write(`[frontguard-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
