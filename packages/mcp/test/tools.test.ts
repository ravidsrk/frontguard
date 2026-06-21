/**
 * Exercises each MCP tool through both layers:
 *
 *  1. The pure handler function (synchronous shape assertions).
 *  2. The end-to-end SDK loop (in-process transport pair, real `tools/call`).
 *
 * The cloud-api is stubbed via a `fetch` override so the suite stays hermetic.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createServer } from '../src/index.js';
import { CloudClient, diffIdFor, parseDiffId } from '../src/client/cloud.js';
import {
  acceptBaseline,
  acceptBaselineOutputSchema,
  getSuggestedFix,
  getSuggestedFixOutputSchema,
  listRegressions,
  listRegressionsOutputSchema,
  recentRuns,
  recentRunsOutputSchema,
} from '../src/tools/index.js';

// ---------------------------------------------------------------------------
// Fixtures + stub fetch
// ---------------------------------------------------------------------------

const SAMPLE_RUN = {
  id: 'run_pr42',
  status: 'completed' as const,
  url: 'https://shop.example.com',
  routes: [{ path: '/' }, { path: '/pricing' }],
  viewports: [375, 1280],
  browsers: ['chromium'],
  threshold: 0.05,
  createdAt: '2026-06-10T10:00:00.000Z',
  completedAt: '2026-06-10T10:00:42.000Z',
  duration: 42_000,
  baselinesApproved: false,
  reportUrl: 'https://api.frontguard.dev/v1/reports/run_pr42',
  github: { owner: 'acme', repo: 'shop', prNumber: 42, commitSha: 'abc1234' },
  results: [
    {
      route: '/',
      viewport: 375,
      status: 'pass',
      diffPercentage: 0,
      timestamp: '2026-06-10T10:00:10.000Z',
    },
    {
      route: '/pricing',
      viewport: 1280,
      status: 'regression',
      diffPercentage: 0.087,
      classification: 'regression',
      timestamp: '2026-06-10T10:00:20.000Z',
      suggestedFix: {
        fixType: 'css',
        category: 'overflow-fix',
        patch: '.pricing-card { overflow: hidden; }',
        confidence: 0.82,
        explanation: 'Pricing card content overflowed at 1280px; clip overflow.',
        target: '.pricing-card',
      },
    },
  ],
};

const OTHER_RUN = {
  id: 'run_pr99',
  status: 'completed' as const,
  url: 'https://shop.example.com',
  routes: [{ path: '/' }],
  viewports: [1280],
  browsers: ['chromium'],
  threshold: 0.05,
  createdAt: '2026-06-11T08:00:00.000Z',
  completedAt: '2026-06-11T08:00:30.000Z',
  duration: 30_000,
  baselinesApproved: true,
  reportUrl: 'https://api.frontguard.dev/v1/reports/run_pr99',
  github: { owner: 'acme', repo: 'shop', prNumber: 99, commitSha: 'def5678' },
  results: [
    {
      route: '/',
      viewport: 1280,
      status: 'pass',
      diffPercentage: 0,
      timestamp: '2026-06-11T08:00:10.000Z',
    },
  ],
};

interface StubState {
  approved: string[];
}

function makeStubFetch(state: StubState): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = init?.headers ? new Headers(init.headers).get('Authorization') : null;
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const path = new URL(url).pathname;

    if (method === 'GET' && path === '/v1/runs') {
      return Response.json({ runs: [SAMPLE_RUN, OTHER_RUN], total: 2 });
    }
    if (method === 'GET' && path === '/v1/runs/run_pr42') {
      return Response.json(SAMPLE_RUN);
    }
    if (method === 'GET' && path === '/v1/runs/run_pr99') {
      return Response.json(OTHER_RUN);
    }
    if (method === 'GET' && path.startsWith('/v1/runs/')) {
      return Response.json({ error: 'Run not found' }, { status: 404 });
    }
    if (method === 'POST' && /^\/v1\/baselines\/.+\/approve$/.test(path)) {
      const runId = decodeURIComponent(path.split('/')[3]);
      state.approved.push(runId);
      return Response.json({ approved: true, runId });
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
}

const AUTH = { apiKey: 'fg_test', apiUrl: 'https://api.frontguard.dev' };

function buildClient(state: StubState): CloudClient {
  return new CloudClient(AUTH, { fetch: makeStubFetch(state) });
}

// ---------------------------------------------------------------------------
// Pure-handler tests
// ---------------------------------------------------------------------------

describe('list_regressions', () => {
  it('returns regressions for a PR number when github linkage is set', async () => {
    const client = buildClient({ approved: [] });
    const out = await listRegressions(client, { pr_id: 42 });
    expect(out.count).toBe(1);
    expect(out.runId).toBe('run_pr42');
    const row = out.regressions[0];
    expect(row.route).toBe('/pricing');
    expect(row.viewport).toBe(1280);
    expect(row.status).toBe('regression');
    expect(row.hasSuggestedFix).toBe(true);
    expect(row.prNumber).toBe(42);
    expect(row.repo).toBe('acme/shop');
    expect(row.diffId).toBe('run_pr42:/pricing:1280');
  });

  it('resolves a bare run id directly', async () => {
    const client = buildClient({ approved: [] });
    const out = await listRegressions(client, { pr_id: 'run_pr42' });
    expect(out.runId).toBe('run_pr42');
    expect(out.count).toBe(1);
  });

  it('respects the repo filter', async () => {
    const client = buildClient({ approved: [] });
    const out = await listRegressions(client, { pr_id: 42, repo: 'acme/other' });
    expect(out.count).toBe(0);
    expect(out.notFound?.reason).toMatch(/No Frontguard run found/);
  });

  it('reports notFound when no PR linkage matches', async () => {
    const client = buildClient({ approved: [] });
    const out = await listRegressions(client, { pr_id: 1234 });
    expect(out.runId).toBe(null);
    expect(out.notFound?.reason).toMatch(/No Frontguard run found for pr_id=1234/);
  });

  it('does not treat first-time baseline status=new as a regression', async () => {
    const runWithNewBaseline = {
      ...SAMPLE_RUN,
      id: 'run_new_baseline',
      results: [
        {
          route: '/',
          viewport: 1280,
          status: 'new',
          diffPercentage: 0,
          timestamp: '2026-06-10T10:00:10.000Z',
        },
        {
          route: '/pricing',
          viewport: 1280,
          status: 'regression',
          diffPercentage: 0.087,
          classification: 'regression',
          timestamp: '2026-06-10T10:00:20.000Z',
        },
      ],
    };
    const client = new CloudClient(AUTH, {
      fetch: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const path = new URL(url).pathname;
        if (path === '/v1/runs/run_new_baseline') return Response.json(runWithNewBaseline);
        return makeStubFetch({ approved: [] })(input, init);
      }) as typeof fetch,
    });
    const out = await listRegressions(client, { pr_id: 'run_new_baseline' });
    expect(out.count).toBe(1);
    expect(out.regressions[0].route).toBe('/pricing');
  });
});

describe('get_suggested_fix', () => {
  it('returns the fix for an existing diff id', async () => {
    const client = buildClient({ approved: [] });
    const out = await getSuggestedFix(client, { diff_id: 'run_pr42:/pricing:1280' });
    expect(out.runId).toBe('run_pr42');
    expect(out.route).toBe('/pricing');
    expect(out.viewport).toBe(1280);
    expect(out.fix?.patch).toContain('.pricing-card');
    expect(out.fix?.confidence).toBeCloseTo(0.82, 2);
  });

  it('returns a reason when the diff has no AI fix', async () => {
    const client = buildClient({ approved: [] });
    const out = await getSuggestedFix(client, { diff_id: 'run_pr42:/:375' });
    expect(out.fix).toBe(null);
    expect(out.reason).toMatch(/No AI fix available/);
  });

  it('returns a reason for invalid diff_id format', async () => {
    const client = buildClient({ approved: [] });
    const out = await getSuggestedFix(client, { diff_id: 'not-a-diff' });
    expect(out.fix).toBe(null);
    expect(out.reason).toMatch(/Invalid diff_id format/);
  });

  it('returns a reason when the diff is missing in the run', async () => {
    const client = buildClient({ approved: [] });
    const out = await getSuggestedFix(client, { diff_id: 'run_pr42:/missing:9999' });
    expect(out.fix).toBe(null);
    expect(out.reason).toMatch(/Diff not found/);
  });
});

describe('accept_baseline', () => {
  it('approves a run when all regressions were reviewed', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    const out = await acceptBaseline(client, {
      run_id: 'run_pr42',
      confirm_all_regressions_reviewed: true,
    });
    expect(out).toEqual({ approved: true, runId: 'run_pr42' });
    expect(state.approved).toEqual(['run_pr42']);
  });

  it('approves a different run id', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    const out = await acceptBaseline(client, {
      run_id: 'run_pr99',
      confirm_all_regressions_reviewed: true,
    });
    expect(out).toEqual({ approved: true, runId: 'run_pr99' });
    expect(state.approved).toEqual(['run_pr99']);
  });

  it('rejects when confirm_all_regressions_reviewed is missing (direct handler)', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    await expect(acceptBaseline(client, { run_id: 'run_pr42' })).rejects.toThrow(
      /confirm_all_regressions_reviewed must be true/,
    );
    expect(state.approved).toEqual([]);
  });

  it('rejects when confirm_all_regressions_reviewed is false (direct handler)', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    await expect(
      acceptBaseline(client, {
        run_id: 'run_pr42',
        confirm_all_regressions_reviewed: false,
      }),
    ).rejects.toThrow(/confirm_all_regressions_reviewed must be true/);
    expect(state.approved).toEqual([]);
  });
});

describe('recent_runs', () => {
  it('lists runs newest-first by default', async () => {
    const client = buildClient({ approved: [] });
    const out = await recentRuns(client, {});
    expect(out.count).toBe(2);
    expect(out.runs[0].runId).toBe('run_pr99');
    expect(out.runs[1].runId).toBe('run_pr42');
    expect(out.runs[1].regressionsCount).toBe(1);
    expect(out.runs[0].baselinesApproved).toBe(true);
  });

  it('filters by repo', async () => {
    const client = buildClient({ approved: [] });
    const out = await recentRuns(client, { repo: 'acme/shop' });
    expect(out.count).toBe(2);
  });

  it('returns no matches when repo does not match', async () => {
    const client = buildClient({ approved: [] });
    const out = await recentRuns(client, { repo: 'someone/else' });
    expect(out.count).toBe(0);
  });

  it('respects the limit', async () => {
    const client = buildClient({ approved: [] });
    const out = await recentRuns(client, { limit: 1 });
    expect(out.count).toBe(1);
    expect(out.runs[0].runId).toBe('run_pr99');
  });

  it('does not count status=new rows in regressionsCount (mcp-8)', async () => {
    const runWithNewBaseline = {
      ...SAMPLE_RUN,
      id: 'run_new_only',
      results: [
        {
          route: '/',
          viewport: 1280,
          status: 'new',
          diffPercentage: 0,
          timestamp: '2026-06-10T10:00:10.000Z',
        },
      ],
    };
    const client = new CloudClient(AUTH, {
      fetch: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const path = new URL(url).pathname;
        if (path === '/v1/runs') {
          return Response.json({ runs: [runWithNewBaseline], total: 1 });
        }
        return makeStubFetch({ approved: [] })(input, init);
      }) as typeof fetch,
    });
    const out = await recentRuns(client, {});
    expect(out.runs[0].regressionsCount).toBe(0);
  });
});

describe('diffId helpers', () => {
  it('round-trips through diffIdFor + parseDiffId', () => {
    const id = diffIdFor('run_pr42', { route: '/pricing', viewport: 1280 });
    expect(parseDiffId(id)).toEqual({ runId: 'run_pr42', route: '/pricing', viewport: 1280 });
  });

  it('rejects malformed ids', () => {
    expect(parseDiffId('just-run')).toBeNull();
    expect(parseDiffId('run::')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end SDK loop (real MCP protocol, in-memory transport)
// ---------------------------------------------------------------------------

describe('MCP server tools/list + tools/call', () => {
  const ORIG_FETCH = globalThis.fetch;
  const ORIG_KEY = process.env.FRONTGUARD_API_KEY;
  const ORIG_URL = process.env.FRONTGUARD_API_URL;
  let state: StubState;

  beforeEach(() => {
    state = { approved: [] };
    process.env.FRONTGUARD_API_KEY = 'fg_test';
    process.env.FRONTGUARD_API_URL = 'https://api.frontguard.dev';
    globalThis.fetch = makeStubFetch(state);
  });

  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.FRONTGUARD_API_KEY;
    else process.env.FRONTGUARD_API_KEY = ORIG_KEY;
    if (ORIG_URL === undefined) delete process.env.FRONTGUARD_API_URL;
    else process.env.FRONTGUARD_API_URL = ORIG_URL;
  });

  async function connectPair() {
    const server = createServer();
    const client = new Client({ name: 'frontguard-mcp-test', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client };
  }

  it('advertises all four tools via tools/list', async () => {
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'accept_baseline',
      'get_suggested_fix',
      'list_regressions',
      'recent_runs',
    ]);
    await client.close();
    await server.close();
  });

  it('accept_baseline description states run-scoped approval (mcp-6)', async () => {
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const tool = res.tools.find((t) => t.name === 'accept_baseline');
    expect(tool?.description).toMatch(/run-scoped/i);
    expect(tool?.description).toMatch(/confirm_all_regressions_reviewed/i);
    await client.close();
    await server.close();
  });

  function extractText(res: CallToolResult): string {
    const part = res.content?.[0];
    if (!part || part.type !== 'text') throw new Error('expected text content');
    return part.text;
  }

  function extractStructuredContent(res: CallToolResult): Record<string, unknown> {
    expect(res.structuredContent).toBeDefined();
    expect(res.structuredContent).not.toBeNull();
    return res.structuredContent as Record<string, unknown>;
  }

  it.each([
    {
      name: 'list_regressions',
      arguments: { pr_id: 42 },
      schema: listRegressionsOutputSchema,
    },
    {
      name: 'get_suggested_fix',
      arguments: { diff_id: 'run_pr42:/pricing:1280' },
      schema: getSuggestedFixOutputSchema,
    },
    {
      name: 'accept_baseline',
      arguments: { run_id: 'run_pr42', confirm_all_regressions_reviewed: true },
      schema: acceptBaselineOutputSchema,
    },
    {
      name: 'recent_runs',
      arguments: {},
      schema: recentRunsOutputSchema,
    },
  ])('$name advertises outputSchema and returns validated structuredContent', async (toolCase) => {
    const { client, server } = await connectPair();
    const listed = await client.listTools();
    const tool = listed.tools.find((t) => t.name === toolCase.name);
    expect(tool?.outputSchema).toBeDefined();

    const res = (await client.callTool({
      name: toolCase.name,
      arguments: toolCase.arguments,
    })) as CallToolResult;
    expect(res.isError).toBeFalsy();

    const structuredContent = extractStructuredContent(res);
    expect(() => toolCase.schema.parse(structuredContent)).not.toThrow();
    expect(JSON.parse(extractText(res))).toEqual(JSON.parse(JSON.stringify(structuredContent)));

    await client.close();
    await server.close();
  });

  it('list_regressions returns JSON text content', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({ name: 'list_regressions', arguments: { pr_id: 42 } })) as CallToolResult;
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(extractText(res));
    expect(data.count).toBe(1);
    expect(data.runId).toBe('run_pr42');
    await client.close();
    await server.close();
  });

  it('get_suggested_fix returns the patch payload', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({
      name: 'get_suggested_fix',
      arguments: { diff_id: 'run_pr42:/pricing:1280' },
    })) as CallToolResult;
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(extractText(res));
    expect(data.fix.patch).toContain('.pricing-card');
    await client.close();
    await server.close();
  });

  it('accept_baseline approves the right run', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({
      name: 'accept_baseline',
      arguments: { run_id: 'run_pr42', confirm_all_regressions_reviewed: true },
    })) as CallToolResult;
    expect(res.isError).toBeFalsy();
    expect(state.approved).toEqual(['run_pr42']);
    await client.close();
    await server.close();
  });

  it('accept_baseline rejects missing confirm_all_regressions_reviewed without approving', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({
      name: 'accept_baseline',
      arguments: { run_id: 'run_pr42' },
    })) as CallToolResult;
    expect(res.isError).toBe(true);
    expect(state.approved).toEqual([]);
    await client.close();
    await server.close();
  });

  it('accept_baseline rejects false confirm_all_regressions_reviewed without approving', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({
      name: 'accept_baseline',
      arguments: { run_id: 'run_pr42', confirm_all_regressions_reviewed: false },
    })) as CallToolResult;
    expect(res.isError).toBe(true);
    expect(state.approved).toEqual([]);
    await client.close();
    await server.close();
  });

  it('recent_runs returns the run list', async () => {
    const { client, server } = await connectPair();
    const res = (await client.callTool({ name: 'recent_runs', arguments: {} })) as CallToolResult;
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(extractText(res));
    expect(data.count).toBe(2);
    await client.close();
    await server.close();
  });

  it('returns a tool error (not a crash) when FRONTGUARD_API_KEY is missing', async () => {
    delete process.env.FRONTGUARD_API_KEY;
    const { client, server } = await connectPair();
    const res = (await client.callTool({ name: 'list_regressions', arguments: { pr_id: 42 } })) as CallToolResult;
    expect(res.isError).toBe(true);
    expect(extractText(res)).toMatch(/FRONTGUARD_API_KEY/);
    await client.close();
    await server.close();
  });
});
