import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createServer,
  MCP_REGISTRY_NAME,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '..', '..');

const DiscoverResponseSchema = z.object({
  protocolVersion: z.string(),
  supportedProtocolVersions: z.array(z.string()),
  capabilities: z.record(z.string(), z.unknown()),
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
    mcpName: z.string(),
  }),
  instructions: z.string().optional(),
});

const InitializeResponseSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.record(z.string(), z.unknown()),
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
  instructions: z.string().optional(),
});

describe('MCP protocol compatibility & registry packaging (#310)', () => {
  let reportDir: string;
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    reportDir = mkdtempSync(join(tmpdir(), 'frontguard-mcp-310-'));
    mkdirSync(reportDir, { recursive: true });
    const sampleRun = {
      id: 'run_pr42',
      status: 'completed' as const,
      url: 'https://shop.example.com',
      routes: [{ path: '/pricing' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      createdAt: '2026-06-10T10:00:00.000Z',
      completedAt: '2026-06-10T10:00:42.000Z',
      duration: 42_000,
      baselinesApproved: false,
      reportUrl: 'https://your-frontguard-api.example.com/v1/reports/run_pr42',
      github: { owner: 'acme', repo: 'shop', prNumber: 42, commitSha: 'abc1234' },
      results: [
        {
          route: '/pricing',
          viewport: 1440,
          browser: 'chromium',
          status: 'regression',
          diffPercentage: 0.0325,
          classification: 'regression',
          timestamp: '2026-06-10T10:00:20.000Z',
          suggestedFix: {
            fixType: 'css',
            category: 'spacing-fix',
            patch: '.cta-btn { margin-left: 0; }',
            confidence: 0.9,
            explanation: 'Reset CTA left margin',
            target: '.cta-btn',
          },
          clusters: [
            {
              id: 1,
              bbox: { x: 100, y: 200, width: 120, height: 44 },
              targetSelector: '.cta-btn',
            },
          ],
        },
      ],
      horizontalOverflow: [
        {
          route: '/pricing',
          viewport: 1440,
          browser: 'chromium',
          innerWidth: 1440,
          scrollWidth: 1480,
          flagged: true,
          elements: [{ selector: '.cta-btn', overflowPx: 40 }],
        },
      ],
    };

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(url).pathname;
      if (method === 'GET' && path === '/v1/runs') {
        return Response.json({ runs: [sampleRun], total: 1 });
      }
      if (method === 'GET' && path === '/v1/runs/run_pr42') {
        return Response.json(sampleRun);
      }
      if (method === 'POST' && /^\/v1\/baselines\/.+\/approve$/.test(path)) {
        return Response.json({ approved: true, runId: 'run_pr42' });
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    }) as typeof fetch;

    delete process.env.FRONTGUARD_LOCAL_REPORT;
    process.env.FRONTGUARD_API_URL = 'https://your-frontguard-api.example.com';
    process.env.FRONTGUARD_API_KEY = 'fg_live_test_310';
    process.env.FRONTGUARD_MCP_WRITES = '1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...savedEnv };
    rmSync(reportDir, { recursive: true, force: true });
  });

  it('criterion 1: all 8 tools pass contract tests against both 2025-11-25 and 2026-07-28 clients with outputSchema, structuredContent, and JSON text mirror', async () => {
    expect(SUPPORTED_MCP_PROTOCOL_VERSIONS).toContain('2025-11-25');
    expect(SUPPORTED_MCP_PROTOCOL_VERSIONS).toContain('2026-07-28');

    for (const protocolVersion of ['2025-11-25', '2026-07-28'] as const) {
      const server = createServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({
        name: `contract-client-${protocolVersion}`,
        version: '1.0.0',
      });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      if (protocolVersion === '2026-07-28') {
        const discovered = await client.request(
          {
            method: 'server/discover',
            params: {
              protocolVersion: '2026-07-28',
              capabilities: {},
              clientInfo: { name: 'mcp-2026-client', version: '1.0.0' },
            },
          },
          DiscoverResponseSchema,
        );
        expect(discovered.protocolVersion).toBe('2026-07-28');
        expect(discovered.supportedProtocolVersions).toEqual(['2025-11-25', '2026-07-28']);
        expect(discovered.serverInfo.mcpName).toBe(MCP_REGISTRY_NAME);
      }

      const initResp = await client.request(
        {
          method: 'initialize',
          params: {
            protocolVersion,
            capabilities: {},
            clientInfo: { name: `init-client-${protocolVersion}`, version: '1.0.0' },
          },
        },
        InitializeResponseSchema,
      );
      expect(initResp.protocolVersion).toBe(protocolVersion);

      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(8);
      for (const tool of listed.tools) {
        expect(tool.outputSchema).toBeDefined();
      }

      const calls: Array<{ name: string; args: Record<string, unknown> }> = [
        { name: 'list_regressions', args: { pr_id: 42 } },
        { name: 'list_horizontal_overflow', args: { run_id: 'run_pr42' } },
        { name: 'get_suggested_fix', args: { diff_id: 'run_pr42:/pricing:1440' } },
        { name: 'recent_runs', args: {} },
        {
          name: 'inspect_diff_cluster_dom',
          args: { diff_id: 'run_pr42:/pricing:1440', cluster_id: 1 },
        },
        {
          name: 'verify_css_patch',
          args: {
            diff_id: 'run_pr42:/pricing:1440',
            target_selector: '.cta-btn',
            css_patch: '.cta-btn { margin-left: 0; }',
          },
        },
        {
          name: 'accept_baseline',
          args: { run_id: 'run_pr42', confirm_all_regressions_reviewed: true },
        },
        {
          name: 'promote_baseline',
          args: { run_id: 'run_pr42', confirm_reviewed: true },
        },
      ];

      for (const call of calls) {
        const result = await client.callTool({
          name: call.name,
          arguments: call.args,
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toBeDefined();
        const textBlock = (result.content as Array<{ type: string; text?: string }>)[0];
        expect(textBlock?.type).toBe('text');
        expect(JSON.parse(textBlock.text!)).toEqual(result.structuredContent);
      }

      await client.close();
      await server.close();
    }
  });

  it('criterion 2: tools/list order is identical across runs', async () => {
    const orders: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const server = createServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'order-check', version: '1.0.0' });
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      orders.push(tools.map((t) => t.name));
      await client.close();
      await server.close();
    }

    expect(orders[0]).toEqual([
      'list_regressions',
      'list_horizontal_overflow',
      'get_suggested_fix',
      'accept_baseline',
      'recent_runs',
      'inspect_diff_cluster_dom',
      'verify_css_patch',
      'promote_baseline',
    ]);
    expect(orders[1]).toEqual(orders[0]);
    expect(orders[2]).toEqual(orders[0]);
  });

  it('criterion 3: package.json, server.json, and release.yml carry matching version and MCP Registry metadata', () => {
    const rootVersion = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string;
      mcpName: string;
      files: string[];
    };
    const serverJson = JSON.parse(readFileSync(join(packageRoot, 'server.json'), 'utf8')) as {
      name: string;
      version: string;
      packages: Array<{ identifier: string; version: string }>;
    };
    const releaseYml = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

    expect(pkg.mcpName).toBe(MCP_REGISTRY_NAME);
    expect(pkg.version).toBe(rootVersion);
    expect(pkg.files).toContain('server.json');

    expect(serverJson.name).toBe(MCP_REGISTRY_NAME);
    expect(serverJson.version).toBe(rootVersion);
    expect(serverJson.packages[0]?.identifier).toBe('@frontguard/mcp');
    expect(serverJson.packages[0]?.version).toBe(rootVersion);

    expect(releaseYml).toContain('Publish MCP Registry entry (server.json)');
    expect(releaseYml).toContain('mcp-publisher');
    expect(releaseYml).toContain('packages/mcp/server.json');
  });
});
