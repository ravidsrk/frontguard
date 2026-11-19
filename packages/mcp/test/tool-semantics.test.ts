/**
 * Contract tests for what four tools claim (#383). Agents act on result
 * fields and descriptions, so a static check must not read as "apply", and an
 * approval must not read as "promoted".
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer } from '../src/index.js';
import { CloudClient, createLocalReportClient } from '../src/client/cloud.js';
import {
  getSuggestedFix,
  listRegressions,
  listRegressionsInputSchema,
  promoteBaselineOutputSchema,
  verifyCssPatchOutputSchema,
} from '../src/tools/index.js';
import { NO_FIX_REASON } from '../src/tools/get-suggested-fix.js';
import { VERIFY_CSS_PASS_NEXT_STEP } from '../src/tools/verify-css-patch.js';

const RUN = {
  id: 'run_cards',
  status: 'completed' as const,
  url: 'https://shop.example.com',
  createdAt: '2026-06-10T10:00:00.000Z',
  reportUrl: 'https://api.example.test/v1/reports/run_cards',
  github: { owner: 'acme', repo: 'shop', prNumber: 12, commitSha: 'c0ffee1' },
  results: [
    {
      route: '/',
      viewport: 1280,
      status: 'regression',
      diffPercentage: 0.06,
      timestamp: '2026-06-10T10:00:10.000Z',
      clusters: [
        {
          id: 1,
          bbox: { x: 0, y: 300, width: 400, height: 200 },
          targetSelector: '.cards > div:nth-child(1)',
        },
      ],
    },
    {
      route: '/pricing',
      viewport: 1280,
      status: 'changed',
      diffPercentage: 0.02,
      timestamp: '2026-06-10T10:00:20.000Z',
    },
  ],
};

function stubFetch(approved: string[]): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const path = new URL(url).pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && path === '/v1/runs') return Response.json({ runs: [RUN], total: 1 });
    if (method === 'GET' && path === `/v1/runs/${RUN.id}`) return Response.json(RUN);
    if (method === 'POST' && path === `/v1/baselines/${RUN.id}/approve`) {
      approved.push(path);
      return Response.json({ approved: true, runId: RUN.id });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }) as typeof fetch;
}

function textOf(res: CallToolResult): string {
  const part = res.content?.[0];
  if (!part || part.type !== 'text') throw new Error('expected text content');
  return part.text;
}

describe('tool semantics (#383)', () => {
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let approvedPaths: string[];

  beforeEach(() => {
    approvedPaths = [];
    globalThis.fetch = stubFetch(approvedPaths);
    delete process.env.FRONTGUARD_LOCAL_REPORT;
    process.env.FRONTGUARD_API_KEY = 'fg_test';
    process.env.FRONTGUARD_API_URL = 'https://api.example.test';
    process.env.FRONTGUARD_MCP_WRITES = '1';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...savedEnv };
  });

  async function connect(): Promise<{ client: Client; tools: Map<string, Tool>; close: () => Promise<void> }> {
    const server = createServer();
    const client = new Client({ name: 'semantics-test', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]));
    return {
      client,
      tools,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  describe('verify_css_patch', () => {
    it('says in its description that it renders nothing', async () => {
      const { tools, close } = await connect();
      try {
        const description = tools.get('verify_css_patch')?.description ?? '';
        expect(description).toMatch(/^Statically check/);
        expect(description).toMatch(/renders nothing/);
        expect(description).toMatch(/re-run `frontguard run` to confirm the pixels/);
        expect(description).not.toMatch(/\bapply\b.*recommend|recommendation/i);
        expect(tools.get('verify_css_patch')?.title).toBe('Statically check a candidate CSS patch');
      } finally {
        await close();
      }
    });

    it('returns staticCheck "pass" with rendered: false for the width: 100% probe that used to say "apply"', async () => {
      const { client, close } = await connect();
      try {
        const res = (await client.callTool({
          name: 'verify_css_patch',
          arguments: {
            diff_id: 'run_cards:/:1280',
            target_selector: '.cards > div:nth-child(1)',
            css_patch: 'width: 100%',
          },
        })) as CallToolResult;
        expect(res.isError).toBeFalsy();
        const out = verifyCssPatchOutputSchema.parse(res.structuredContent);
        expect(out).toEqual({
          diffId: 'run_cards:/:1280',
          staticCheck: 'pass',
          rendered: false,
          validSyntax: true,
          selectorMatchedTarget: true,
          dangerousProperties: [],
          knownTargets: ['.cards > div:nth-child(1)'],
          normalizedPatch: '.cards > div:nth-child(1) { width: 100%; }',
          reason: expect.stringMatching(/Nothing was rendered, so the pixels are unconfirmed/),
          nextStep: VERIFY_CSS_PASS_NEXT_STEP,
        });
        expect(VERIFY_CSS_PASS_NEXT_STEP).toBe(
          'Apply the patch locally and re-run `frontguard run` to confirm the pixels.',
        );
        expect(textOf(res)).not.toMatch(/recommendation|"apply"/);
      } finally {
        await close();
      }
    });

    it('returns staticCheck "fail" with a refine step for a denied property', async () => {
      const { client, close } = await connect();
      try {
        const res = (await client.callTool({
          name: 'verify_css_patch',
          arguments: {
            diff_id: 'run_cards:/:1280',
            target_selector: '.cards > div:nth-child(1)',
            css_patch: 'display: none !important',
          },
        })) as CallToolResult;
        const out = verifyCssPatchOutputSchema.parse(res.structuredContent);
        expect(out.staticCheck).toBe('fail');
        expect(out.rendered).toBe(false);
        expect(out.nextStep).toBe(
          'Remove display: none !important from the patch, then call verify_css_patch again.',
        );
      } finally {
        await close();
      }
    });
  });

  describe('promote_baseline', () => {
    it('describes explicit run_id, truthful screenshotsPromoted, local-report refusal, and the all-routes rule', async () => {
      const { tools, close } = await connect();
      try {
        const tool = tools.get('promote_baseline');
        const description = tool?.description ?? '';
        expect(description).toMatch(/whole-run approval/);
        expect(description).toMatch(/explicit `run_id`/);
        expect(description).toMatch(/returning `screenshotsPromoted` from the Cloud API response/);
        expect(description).toMatch(/`routes` does not scope the approval/);
        expect(description).toMatch(/refused unless every changed route in the run is included/);
        expect(description).toMatch(/Refused in local-report mode/);
        expect(description).not.toMatch(/scoped to specific routes/);
        expect(tool?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
        expect(tool?._meta).toMatchObject({ 'anthropic/requiresUserInteraction': true });
      } finally {
        await close();
      }
    });

    it('returns truthful approvalRecorded/screenshotsPromoted, requires explicit run_id, and hits the same endpoint as accept_baseline', async () => {
      const { client, close } = await connect();
      try {
        const barePr = (await client.callTool({
          name: 'promote_baseline',
          arguments: { run_id: '12', routes: ['/', '/pricing'], confirm_reviewed: true },
        })) as CallToolResult;
        expect(barePr.isError).toBe(true);
        expect(textOf(barePr)).toMatch(/explicit run_id/i);

        const promoted = (await client.callTool({
          name: 'promote_baseline',
          arguments: { run_id: 'run_cards', routes: ['/', '/pricing'], confirm_reviewed: true },
        })) as CallToolResult;
        expect(promoted.isError).toBeFalsy();
        expect(promoteBaselineOutputSchema.parse(promoted.structuredContent)).toEqual({
          approvalRecorded: true,
          screenshotsPromoted: true,
          runId: 'run_cards',
          reviewedRoutes: ['/', '/pricing'],
          mode: 'cloud-api',
        });
        expect(promoted.structuredContent).not.toHaveProperty('promoted');
        expect(promoted.structuredContent).not.toHaveProperty('promotedRoutes');

        const accepted = (await client.callTool({
          name: 'accept_baseline',
          arguments: { run_id: 'run_cards', confirm_all_regressions_reviewed: true },
        })) as CallToolResult;
        expect(accepted.isError).toBeFalsy();
        expect(approvedPaths).toEqual([
          '/v1/baselines/run_cards/approve',
          '/v1/baselines/run_cards/approve',
        ]);
      } finally {
        await close();
      }
    });

    it('refuses a route subset instead of scoping the approval', async () => {
      const { client, close } = await connect();
      try {
        const res = (await client.callTool({
          name: 'promote_baseline',
          arguments: { run_id: 'run_cards', routes: ['/'], confirm_reviewed: true },
        })) as CallToolResult;
        expect(res.isError).toBe(true);
        expect(textOf(res)).toMatch(/whole-run and would also approve unreviewed routes: \/pricing/);
        expect(approvedPaths).toEqual([]);
      } finally {
        await close();
      }
    });

    it('stays unregistered without FRONTGUARD_MCP_WRITES=1', async () => {
      delete process.env.FRONTGUARD_MCP_WRITES;
      const { tools, close } = await connect();
      try {
        expect(tools.has('promote_baseline')).toBe(false);
        expect(tools.has('accept_baseline')).toBe(false);
      } finally {
        await close();
      }
    });
  });

  describe('get_suggested_fix', () => {
    it('says fixes need an ai provider and generateFixes, in the hint and the description', async () => {
      const client = new CloudClient(
        { apiKey: 'fg_test', apiUrl: 'https://api.example.test' },
        { fetch: stubFetch([]) },
      );
      const out = await getSuggestedFix(client, { diff_id: 'run_cards:/pricing:1280' });
      expect(out.fix).toBeNull();
      expect(out.reason).toBe(NO_FIX_REASON);
      expect(out.reason).toMatch(/an `ai` provider and `generateFixes: true`/);

      const { tools, close } = await connect();
      try {
        expect(tools.get('get_suggested_fix')?.description).toMatch(
          /`ai` provider and `generateFixes: true`/,
        );
      } finally {
        await close();
      }
    });
  });

  describe('list_regressions', () => {
    it('has no branch input and does not advertise one', async () => {
      expect(Object.keys(listRegressionsInputSchema)).toEqual(['pr_id', 'repo', 'limit', 'cursor']);
      const { client, tools, close } = await connect();
      try {
        const tool = tools.get('list_regressions');
        expect(Object.keys(tool?.inputSchema.properties ?? {})).not.toContain('branch');
        expect(tool?.description).not.toMatch(/branch|reserved/i);
        expect(tool?.description).toMatch(/`"latest"`/);
        // Old clients that still send branch are not broken: unknown keys are dropped.
        const res = (await client.callTool({
          name: 'list_regressions',
          arguments: { pr_id: 12, branch: 'main' },
        })) as CallToolResult;
        expect(res.isError).toBeFalsy();
        expect(res.structuredContent).toMatchObject({ runId: 'run_cards', total: 2 });
      } finally {
        await close();
      }
    });

    it('keeps the CI hint for notFound in cloud mode', async () => {
      const client = new CloudClient(
        { apiKey: 'fg_test', apiUrl: 'https://api.example.test' },
        { fetch: stubFetch([]) },
      );
      const out = await listRegressions(client, { pr_id: 999 });
      expect(out.notFound?.reason).toBe(
        'No Frontguard run found for pr_id=999. The CI integration may not have completed yet.',
      );
    });

    it('names the report run id and suggests pr_id "latest" for notFound in local-report mode', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'fg-mcp-383-'));
      const reportPath = join(dir, 'report.json');
      writeFileSync(reportPath, JSON.stringify({ id: 'run_nightly', diffs: [] }));
      try {
        const client = createLocalReportClient(reportPath);
        const out = await listRegressions(client, { pr_id: 42 });
        expect(out.runId).toBe(null);
        const reason = out.notFound?.reason ?? '';
        expect(reason).toMatch(/local report/);
        expect(reason).toContain('"run_nightly"');
        expect(reason).toContain('pr_id: "latest"');
        expect(reason).not.toMatch(/CI integration/);

        const filtered = await listRegressions(client, { pr_id: 'latest', repo: 'acme/shop' });
        expect(filtered.notFound?.reason).toMatch(/pr_id: "latest" and no repo filter/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it.each([
    ['writes off', undefined],
    ['writes on', '1'],
  ])('keeps every description and the server instructions under 4,096 chars (%s)', async (_label, writes) => {
    if (writes) process.env.FRONTGUARD_MCP_WRITES = writes;
    else delete process.env.FRONTGUARD_MCP_WRITES;
    const { client, tools, close } = await connect();
    try {
      expect(tools.size).toBe(writes ? 8 : 6);
      for (const tool of tools.values()) {
        expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(0);
        expect(tool.description?.length ?? 0, tool.name).toBeLessThan(4096);
      }
      const instructions = client.getInstructions() ?? '';
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions.length).toBeLessThan(4096);
      expect(instructions).toMatch(/renders nothing/);
    } finally {
      await close();
    }
  });
});
