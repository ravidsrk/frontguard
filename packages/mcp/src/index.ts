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

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireAuth, MissingApiKeyError, MissingApiUrlError } from './auth.js';
import { CloudApiError, CloudClient } from './client/cloud.js';
import {
  acceptBaseline,
  acceptBaselineInputSchema,
  getSuggestedFix,
  getSuggestedFixInputSchema,
  listRegressions,
  listRegressionsInputSchema,
  recentRuns,
  recentRunsInputSchema,
} from './tools/index.js';

const SERVER_NAME = '@frontguard/mcp';
const SERVER_VERSION = '0.2.0';

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
        'Frontguard MCP server. Use `list_regressions` to see what visual regressions a PR has, `get_suggested_fix` to read the AI patch for a specific diff, `accept_baseline` to promote new screenshots, and `recent_runs` to browse history.',
    },
  );

  server.registerTool(
    'list_regressions',
    {
      title: 'List regressions for a PR',
      description:
        'Return the visual regressions Frontguard detected on a given GitHub PR (or run id). Each row carries a `diffId` you can pass to `get_suggested_fix`.',
      inputSchema: listRegressionsInputSchema,
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
    },
    async (args) => withCloudClient(async (client) => getSuggestedFix(client, args)),
  );

  server.registerTool(
    'accept_baseline',
    {
      title: 'Accept the run as the new baseline',
      description:
        'Promote a run’s current screenshots to the new baseline. Accepts a `diffId` (the run id is extracted from it) or a bare run id.',
      inputSchema: acceptBaselineInputSchema,
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
    },
    async (args) => withCloudClient(async (client) => recentRuns(client, args)),
  );

  return server;
}

/**
 * Wraps a tool body: builds a fresh {@link CloudClient}, runs the handler,
 * and shapes errors into the MCP `CallToolResult` envelope. Auth errors are
 * returned as `isError: true` so the agent sees them as tool errors rather
 * than as the server crashing.
 */
async function withCloudClient<T>(
  fn: (client: CloudClient) => Promise<T>,
): Promise<CallToolResult> {
  try {
    const auth = requireAuth();
    const client = new CloudClient(auth);
    const data = await fn(client);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run only when invoked directly (not when imported from tests).
const invokedDirectly = (() => {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    // Log to stderr so stdout stays a clean JSON-RPC channel for the SDK.
    process.stderr.write(`[frontguard-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
