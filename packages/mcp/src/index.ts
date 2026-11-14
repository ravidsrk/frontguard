/**
 * Frontguard MCP server — stdio entry.
 *
 * Registers six read tools (`list_regressions`, `list_horizontal_overflow`,
 * `get_suggested_fix`, `recent_runs`, `inspect_diff_cluster_dom`,
 * `verify_css_patch`) and connects them to a stdio transport.
 * `promote_baseline` and `accept_baseline` are registered only when
 * `FRONTGUARD_MCP_WRITES=1`, so editor agents (Claude Code, Cursor, Copilot)
 * can call the read tools in-loop without a baseline write. Both write tools
 * record whole-run approval through the same endpoint; neither promotes
 * screenshots.
 * Supports both Cloud API mode and local CLI report mode (`FRONTGUARD_LOCAL_REPORT`).
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
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { requireAuth, MissingApiKeyError, MissingApiUrlError } from './auth.js';
import {
  CloudApiError,
  CloudClient,
  cloudApiErrorHint,
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
  listHorizontalOverflow,
  listHorizontalOverflowInputSchema,
  listHorizontalOverflowOutputSchema,
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
export const MCP_REGISTRY_NAME = 'io.github.ravidsrk/frontguard';
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [
  '2026-07-28',
  '2025-11-25',
  ...SUPPORTED_PROTOCOL_VERSIONS.filter((v) => v !== '2025-11-25'),
] as const;

const ServerDiscoverRequestSchema = z.object({
  method: z.literal('server/discover'),
  params: z
    .object({
      protocolVersion: z.string().optional(),
      capabilities: z.record(z.string(), z.unknown()).optional(),
      clientInfo: z
        .object({
          name: z.string(),
          version: z.string(),
        })
        .optional(),
    })
    .optional(),
});

const READ_INSTRUCTIONS =
  'Use `list_regressions` to see what visual regressions a PR or run has (`pr_id: "latest"` reads the newest run, or the local report), `inspect_diff_cluster_dom` to inspect cluster bounding boxes and grounded DOM targets, `get_suggested_fix` to read the stored AI patch for a specific diff, `verify_css_patch` to statically check candidate CSS fixes (it renders nothing; re-run `frontguard run` to confirm pixels), `recent_runs` to browse history, and `list_horizontal_overflow` to list visible unclipped boxes past the right edge. Horizontal overflow does not change the pixel result. The two list tools return at most `limit` rows (default 25, max 200) with `total` and `nextCursor`; pass `nextCursor` back as `cursor` for the next page.';

/** Instructions match the tools this process actually registers. */
export function serverInstructions(env: NodeJS.ProcessEnv = process.env): string {
  if (mcpWritesEnabled(env)) {
    return (
      'Frontguard MCP server. ' +
      READ_INSTRUCTIONS +
      ' Write tools are enabled: `promote_baseline` and `accept_baseline` both record whole-run approval through the same endpoint and promote no screenshots. A human still confirms baseline files with `frontguard update-baselines --confirm-baselines`.'
    );
  }
  return (
    'Frontguard MCP server. ' +
    READ_INSTRUCTIONS +
    ' This server is read-only. `promote_baseline` and `accept_baseline` are not registered. A human reviews the report and runs `frontguard update-baselines --confirm-baselines`.'
  );
}

/**
 * MCP annotations are untrusted hints. A client may skip a prompt because of
 * them, and an untrusted server can lie. They do not enforce anything; #287
 * is the control that keeps baseline writes away from the agent.
 */
function readOnlyAnnotations(title: string): {
  title: string;
  annotations: {
    title: string;
    readOnlyHint: true;
    openWorldHint: false;
    destructiveHint: false;
  };
} {
  return {
    title,
    annotations: {
      title,
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  };
}

/** Claude Code prompts on this flag even in auto and bypass-permissions modes. */
const REQUIRES_USER_INTERACTION = {
  'anthropic/requiresUserInteraction': true,
} as const;

function destructiveAnnotations(title: string): {
  title: string;
  annotations: {
    title: string;
    readOnlyHint: false;
    destructiveHint: true;
    openWorldHint: false;
  };
  _meta: { 'anthropic/requiresUserInteraction': true };
} {
  return {
    title,
    annotations: {
      title,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    _meta: REQUIRES_USER_INTERACTION,
  };
}

/** Write tools stay unregistered unless this env var is exactly `1`. */
export function mcpWritesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FRONTGUARD_MCP_WRITES === '1';
}

function registerProtocolHandlers(server: McpServer, instructions: string): void {
  const serverCapabilities = { tools: { listChanged: true } } as const;

  // Negotiate both 2025-11-25 and 2026-07-28 on `initialize`
  server.server.setRequestHandler(InitializeRequestSchema, async (request) => {
    const requestedVersion = request.params.protocolVersion;
    const negotiated = (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(
      requestedVersion,
    )
      ? requestedVersion
      : LATEST_PROTOCOL_VERSION;
    return {
      protocolVersion: negotiated,
      capabilities: serverCapabilities,
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      ...(instructions ? { instructions } : {}),
    };
  });

  // Support MCP 2026-07-28 `server/discover` initialization/discovery handshake
  server.server.setRequestHandler(ServerDiscoverRequestSchema, async (request) => {
    const requestedVersion = request.params?.protocolVersion;
    const negotiated =
      requestedVersion &&
      (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requestedVersion)
        ? requestedVersion
        : '2026-07-28';
    return {
      protocolVersion: negotiated,
      supportedProtocolVersions: ['2025-11-25', '2026-07-28'],
      capabilities: serverCapabilities,
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        mcpName: MCP_REGISTRY_NAME,
      },
      ...(instructions ? { instructions } : {}),
    };
  });
}

function registerCoreTools(server: McpServer, writesEnabled: boolean): void {
  server.registerTool(
    'list_regressions',
    {
      ...readOnlyAnnotations('List regressions for a PR'),
      description:
        'Return the visual regressions Frontguard detected for a GitHub PR number, a run id, or `"latest"` (the newest run; in local-report mode, the report\'s run). Rows come worst first (regression and error before changed, then by `diffPercentage`), at most `limit` per page (default 25, max 200); pass `nextCursor` back as `cursor` for more. Run fields (`runId`, `reportUrl`, PR, repo, commit) are top level. Each row carries a `diffId` for `inspect_diff_cluster_dom`, `get_suggested_fix` and `verify_css_patch`, plus a `clusterCount`.',
      inputSchema: listRegressionsInputSchema,
      outputSchema: listRegressionsOutputSchema,
    },
    async (args) => withCloudClient(async (client) => listRegressions(client, args)),
  );

  server.registerTool(
    'list_horizontal_overflow',
    {
      ...readOnlyAnnotations('List horizontal overflow'),
      description:
        'List horizontal overflow from a run (the newest run when `run_id` is omitted). A flagged row is a visible unclipped box past the right edge, with selector and pixels. Only flagged rows are returned unless `flagged_only` is false. Rows come largest element `overflowPx` first, at most `limit` per page (default 25, max 200); pass `nextCursor` back as `cursor` for more. scrollWidth and innerWidth are recorded. This does not change the pixel result or the exit code.',
      inputSchema: listHorizontalOverflowInputSchema,
      outputSchema: listHorizontalOverflowOutputSchema,
    },
    async (args) => withCloudClient(async (client) => listHorizontalOverflow(client, args)),
  );

  server.registerTool(
    'get_suggested_fix',
    {
      ...readOnlyAnnotations('Get the suggested fix for a diff'),
      description:
        'Return the AI-generated patch for a single diff (keyed by the `diffId` from `list_regressions`). Fixes exist only when the run had an `ai` provider and `generateFixes: true`; otherwise `fix` is null and `reason` says why.',
      inputSchema: getSuggestedFixInputSchema,
      outputSchema: getSuggestedFixOutputSchema,
    },
    async (args) => withCloudClient(async (client) => getSuggestedFix(client, args)),
  );

  if (writesEnabled) {
    server.registerTool(
      'accept_baseline',
      {
        ...destructiveAnnotations('Record whole-run baseline approval'),
        description:
          'Record run-scoped whole-run approval after `confirm_all_regressions_reviewed: true`. Screenshot promotion is not implemented yet; use the CLI or composite Action to update baselines.',
        inputSchema: acceptBaselineInputSchema,
        outputSchema: acceptBaselineOutputSchema,
      },
      async (args) => withCloudClient(async (client) => acceptBaseline(client, args)),
    );
  }
}

function registerExtendedTools(server: McpServer, writesEnabled: boolean): void {
  server.registerTool(
    'recent_runs',
    {
      ...readOnlyAnnotations('List recent Frontguard runs'),
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
      ...readOnlyAnnotations('Inspect diff cluster and grounded DOM target'),
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
      ...readOnlyAnnotations('Statically check a candidate CSS patch'),
      description:
        'Statically check a candidate CSS patch for a diff from `list_regressions`: brace balance and declaration syntax, a deny list (`@import`, external `url()`, `expression()`, `display: none !important`, hiding root containers), and whether `target_selector` matches a selector recorded for the diff. It renders nothing and cannot confirm a visual fix: `staticCheck: "pass"` comes with `rendered: false`, so apply the patch locally and re-run `frontguard run` to confirm the pixels.',
      inputSchema: verifyCssPatchInputSchema,
      outputSchema: verifyCssPatchOutputSchema,
    },
    async (args) => withCloudClient(async (client) => verifyCssPatch(client, args)),
  );

  if (writesEnabled) {
    server.registerTool(
      'promote_baseline',
      {
        ...destructiveAnnotations('Record run approval (promotes no screenshots)'),
        description:
          'Record whole-run approval for a reviewed run after `confirm_reviewed: true`. It calls the same endpoint as `accept_baseline` and promotes no screenshots (`screenshotsPromoted: false`). `routes` does not scope the approval: the call is refused unless every changed route in the run is included. Refused in local-report mode. A human updates baseline files with `frontguard update-baselines --confirm-baselines`.',
        inputSchema: promoteBaselineInputSchema,
        outputSchema: promoteBaselineOutputSchema,
      },
      async (args) => withCloudClient(async (client) => promoteBaseline(client, args)),
    );
  }
}

/**
 * Build a fresh {@link McpServer} with Frontguard tools registered.
 * Exported so tests can drive it without spawning a subprocess.
 */
export function createServer(): McpServer {
  const instructions = serverInstructions();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions,
    },
  );
  const writesEnabled = mcpWritesEnabled();
  registerCoreTools(server, writesEnabled);
  registerExtendedTools(server, writesEnabled);
  registerProtocolHandlers(server, instructions);
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
    // Compact JSON: the text block lands in the agent's context (#379).
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
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
      content: [{ type: 'text', text: cloudApiErrorText(err) }],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: `Frontguard MCP error: ${message}` }],
  };
}

/**
 * One short line for a cloud-api failure: method, path, status, a hint for
 * the status, and the body without markup, capped (#379). A proxy's 502 page
 * would otherwise put kilobytes of HTML into the agent's context.
 */
function cloudApiErrorText(err: CloudApiError): string {
  const path = err.path.length > 120 ? `${err.path.slice(0, 119)}…` : err.path;
  const hint = cloudApiErrorHint(err.status, err.mode);
  const source = err.mode === 'local-report' ? 'local report' : 'cloud-api';
  return [
    `Frontguard ${source} error: ${err.method} ${path} returned ${err.status}.`,
    ...(hint ? [hint] : []),
    ...(err.summary ? [`Body: ${err.summary}`] : []),
  ].join(' ');
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
