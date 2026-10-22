/**
 * Exercises each MCP tool through both layers:
 *
 *  1. The pure handler function (synchronous shape assertions).
 *  2. The end-to-end SDK loop (in-process transport pair, real `tools/call`).
 *
 * The cloud-api is stubbed via a `fetch` override so the suite stays hermetic.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  InMemoryTransport,
} from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createServer } from '../src/index.js';
import { CloudClient, createLocalReportClient, diffIdFor, parseDiffId } from '../src/client/cloud.js';
import {
  acceptBaseline,
  acceptBaselineOutputSchema,
  getSuggestedFix,
  getSuggestedFixOutputSchema,
  inspectDiffClusterDom,
  inspectDiffClusterDomOutputSchema,
  listHorizontalOverflow,
  listHorizontalOverflowOutputSchema,
  listRegressions,
  listRegressionsOutputSchema,
  promoteBaseline,
  promoteBaselineOutputSchema,
  recentRuns,
  recentRunsOutputSchema,
  verifyCssPatch,
  verifyCssPatchOutputSchema,
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
      clusters: [
        {
          id: 1,
          bbox: { x: 40, y: 120, width: 320, height: 180 },
          targetSelector: '.pricing-card',
        },
      ],
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

  it('resolves a UUIDv4 run id directly via getRun', async () => {
    const uuidRunId = '550e8400-e29b-41d4-a716-446655440000';
    const uuidRun = { ...SAMPLE_RUN, id: uuidRunId };
    const client = new CloudClient(AUTH, {
      fetch: (async (input: Parameters<typeof fetch>[0]) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const path = new URL(url).pathname;
        if (path === `/v1/runs/${uuidRunId}`) return Response.json(uuidRun);
        return new Response('Not found', { status: 404 });
      }) as typeof fetch,
    });
    const out = await listRegressions(client, { pr_id: uuidRunId });
    expect(out.runId).toBe(uuidRunId);
    expect(out.count).toBe(1);
    expect(out.regressions[0].diffId).toBe(`${uuidRunId}:/pricing:1280`);
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

describe('inspect_diff_cluster_dom', () => {
  it('returns structured diff cluster inspection and grounded target selector', async () => {
    const client = buildClient({ approved: [] });
    const out = await inspectDiffClusterDom(client, {
      diff_id: 'run_pr42:/pricing:1280',
      cluster_id: 1,
    });
    expect(out.diffId).toBe('run_pr42:/pricing:1280');
    expect(out.route).toBe('/pricing');
    expect(out.viewport).toBe(1280);
    expect(out.classification).toBe('regression');
    expect(out.explanation).toContain('Pricing card content overflowed');
    expect(out.suggestedFix?.target).toBe('.pricing-card');
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].id).toBe(1);
    expect(out.clusters[0].targetSelector).toBe('.pricing-card');
  });

  it('supports @ separator in diff_id', async () => {
    const client = buildClient({ approved: [] });
    const out = await inspectDiffClusterDom(client, {
      diff_id: 'run_pr42:/pricing@1280',
    });
    expect(out.route).toBe('/pricing');
    expect(out.viewport).toBe(1280);
    expect(out.clusters[0].targetSelector).toBe('.pricing-card');
  });

  it('throws when requested cluster_id does not exist on the diff', async () => {
    const client = buildClient({ approved: [] });
    await expect(
      inspectDiffClusterDom(client, {
        diff_id: 'run_pr42:/pricing:1280',
        cluster_id: 99,
      }),
    ).rejects.toThrow(/Cluster #99 not found/);
  });

  it('preserves per-cluster targetSelector from report JSON before falling back to suggestedFix.target', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fg-mcp-clusters-'));
    const reportPath = join(tmpDir, 'report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        id: 'run_local',
        results: [
          {
            route: '/pricing',
            viewport: 1280,
            status: 'regression',
            diffPercentage: 0.04,
            classification: 'regression',
            suggestedFix: {
              fixType: 'css',
              category: 'layout-fix',
              patch: '.pricing-section { gap: 16px; }',
              confidence: 0.88,
              explanation: 'Section layout shifted',
              target: '.pricing-section',
            },
            clusters: [
              {
                id: 1,
                bbox: { x: 10, y: 20, width: 100, height: 40 },
                targetSelector: '[data-testid="pro-badge"]',
              },
              {
                id: 2,
                bbox: { x: 200, y: 80, width: 140, height: 50 },
              },
            ],
          },
        ],
      }),
    );
    try {
      const localClient = createLocalReportClient(reportPath);
      const out = await inspectDiffClusterDom(localClient, {
        diff_id: 'run_local:/pricing:1280',
      });
      expect(out.clusters).toHaveLength(2);
      expect(out.clusters[0].targetSelector).toBe('[data-testid="pro-badge"]');
      expect(out.clusters[1].targetSelector).toBe('.pricing-section');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('verify_css_patch', () => {
  it('recommends apply for a valid, grounded CSS patch and preserves string whitespace', async () => {
    const client = buildClient({ approved: [] });
    const out = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.pricing-card',
      css_patch: '.pricing-card { content: "a   b"; overflow: hidden; }',
    });
    expect(out.validSyntax).toBe(true);
    expect(out.selectorMatchedTarget).toBe(true);
    expect(out.dangerousProperties).toEqual([]);
    expect(out.normalizedPatch).toContain('"a   b"');
    expect(out.recommendation).toBe('apply');
  });

  it('rejects a CSS patch with unbalanced braces or malformed property names', async () => {
    const client = buildClient({ approved: [] });
    const out = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.pricing-card',
      css_patch: '.pricing-card { overflow: hidden;',
    });
    expect(out.validSyntax).toBe(false);
    expect(out.recommendation).toBe('reject');
    expect(out.reason).toMatch(/unbalanced braces|invalid syntax/i);

    const badProp = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.pricing-card',
      css_patch: '.pricing-card { color red: blue; }',
    });
    expect(badProp.validSyntax).toBe(false);
    expect(badProp.recommendation).toBe('reject');
  });

  it('rejects dangerous @import and external url() injection', async () => {
    const client = buildClient({ approved: [] });
    const out = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.pricing-card',
      css_patch:
        '@import url("https://evil.example.com/x.css"); .pricing-card { background: url(https://evil.example.com/bg.png); }',
    });
    expect(out.dangerousProperties).toContain('@import');
    expect(out.dangerousProperties).toContain('url()');
    expect(out.recommendation).toBe('reject');
  });

  it('recommends refine when target_selector or rule selector does not match recorded diff target', async () => {
    const client = buildClient({ approved: [] });
    const out = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.unrelated-footer',
      css_patch: '.unrelated-footer { overflow: hidden; }',
    });
    expect(out.validSyntax).toBe(true);
    expect(out.selectorMatchedTarget).toBe(false);
    expect(out.recommendation).toBe('refine');

    const mismatchedRule = await verifyCssPatch(client, {
      diff_id: 'run_pr42:/pricing:1280',
      target_selector: '.pricing-card',
      css_patch: '.other-selector { overflow: hidden; }',
    });
    expect(mismatchedRule.validSyntax).toBe(true);
    expect(mismatchedRule.selectorMatchedTarget).toBe(false);
    expect(mismatchedRule.recommendation).toBe('refine');
  });
});

describe('promote_baseline', () => {
  it('rejects when confirm_reviewed is false', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    await expect(
      promoteBaseline(client, {
        run_id: 'run_pr42',
        confirm_reviewed: false,
      }),
    ).rejects.toThrow(/confirm_reviewed must be true/);
    expect(state.approved).toEqual([]);
  });

  it('rejects baseline promotion in local-report mode', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fg-mcp-promote-'));
    const reportPath = join(tmpDir, 'report.json');
    writeFileSync(reportPath, JSON.stringify({ id: 'run_local', results: [] }));
    try {
      const localClient = createLocalReportClient(reportPath);
      await expect(
        promoteBaseline(localClient, {
          run_id: 'run_local',
          confirm_reviewed: true,
        }),
      ).rejects.toThrow(/not supported in local-report mode/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('promotes changed routes when confirm_reviewed is true', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    const out = await promoteBaseline(client, {
      run_id: 'run_pr42',
      confirm_reviewed: true,
    });
    expect(out).toEqual({
      promoted: true,
      runId: 'run_pr42',
      promotedRoutes: ['/pricing'],
      mode: 'cloud-api',
    });
    expect(state.approved).toEqual(['run_pr42']);
  });

  it('filters to requested routes subset when all changed routes are included and resolves PR numbers', async () => {
    const state: StubState = { approved: [] };
    const client = buildClient(state);
    const out = await promoteBaseline(client, {
      run_id: '42',
      routes: ['/pricing'],
      confirm_reviewed: true,
    });
    expect(out.promoted).toBe(true);
    expect(out.runId).toBe('run_pr42');
    expect(out.promotedRoutes).toEqual(['/pricing']);
    expect(state.approved).toEqual(['run_pr42']);

    await expect(
      promoteBaseline(client, {
        run_id: '42',
        routes: ['/'],
        confirm_reviewed: true,
      }),
    ).rejects.toThrow(/Cannot partially promote routes/);
  });
});

describe('diffId helpers', () => {
  it('round-trips through diffIdFor + parseDiffId and preserves @ inside routes', () => {
    const id = diffIdFor('run_pr42', { route: '/pricing', viewport: 1280 });
    expect(parseDiffId(id)).toEqual({ runId: 'run_pr42', route: '/pricing', viewport: 1280 });
    expect(parseDiffId('run_pr42:/users/alice@example.com@1280@webkit')).toEqual({
      runId: 'run_pr42',
      route: '/users/alice@example.com',
      viewport: 1280,
      browser: 'webkit',
    });
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
  const ORIG_WRITES = process.env.FRONTGUARD_MCP_WRITES;
  let state: StubState;

  beforeEach(() => {
    state = { approved: [] };
    process.env.FRONTGUARD_API_KEY = 'fg_test';
    process.env.FRONTGUARD_API_URL = 'https://api.frontguard.dev';
    process.env.FRONTGUARD_MCP_WRITES = '1';
    globalThis.fetch = makeStubFetch(state);
  });

  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
    if (ORIG_KEY === undefined) delete process.env.FRONTGUARD_API_KEY;
    else process.env.FRONTGUARD_API_KEY = ORIG_KEY;
    if (ORIG_URL === undefined) delete process.env.FRONTGUARD_API_URL;
    else process.env.FRONTGUARD_API_URL = ORIG_URL;
    if (ORIG_WRITES === undefined) delete process.env.FRONTGUARD_MCP_WRITES;
    else process.env.FRONTGUARD_MCP_WRITES = ORIG_WRITES;
  });

  async function connectPair() {
    const server = createServer();
    const client = new Client({ name: 'frontguard-mcp-test', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client };
  }

  it('advertises read tools without write tools unless FRONTGUARD_MCP_WRITES=1', async () => {
    delete process.env.FRONTGUARD_MCP_WRITES;
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_suggested_fix',
      'inspect_diff_cluster_dom',
      'list_horizontal_overflow',
      'list_regressions',
      'recent_runs',
      'verify_css_patch',
    ]);
    expect(names).not.toContain('promote_baseline');
    expect(names).not.toContain('accept_baseline');
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toMatch(/not registered/);
    expect(instructions).toMatch(/update-baselines --confirm-baselines/);
    expect(instructions).not.toMatch(/`promote_baseline` promotes/);
    await client.close();
    await server.close();
  });

  it('advertises all eight tools via tools/list when writes are enabled', async () => {
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'accept_baseline',
      'get_suggested_fix',
      'inspect_diff_cluster_dom',
      'list_horizontal_overflow',
      'list_regressions',
      'promote_baseline',
      'recent_runs',
      'verify_css_patch',
    ]);
    await client.close();
    await server.close();
  });

  it('lists read-only and destructive annotations, and keeps descriptions under 4096 characters', async () => {
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const byName = new Map(res.tools.map((tool) => [tool.name, tool]));

    const readOnly = [
      ['list_regressions', 'List regressions for a PR'],
      ['get_suggested_fix', 'Get the suggested fix for a diff'],
      ['recent_runs', 'List recent Frontguard runs'],
      ['inspect_diff_cluster_dom', 'Inspect diff cluster and grounded DOM target'],
      ['verify_css_patch', 'Verify a candidate CSS patch before applying'],
      ['list_horizontal_overflow', 'List horizontal overflow'],
    ] as const;
    for (const [name, title] of readOnly) {
      const tool = byName.get(name);
      expect(tool?.title).toBe(title);
      expect(tool?.annotations).toEqual({
        title,
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      });
      expect(tool?._meta?.['anthropic/requiresUserInteraction']).toBeUndefined();
      expect(tool?.description?.length ?? 0).toBeLessThan(4096);
    }

    const destructive = [
      ['promote_baseline', 'Promote reviewed visual baselines'],
      ['accept_baseline', 'Record whole-run baseline approval'],
    ] as const;
    for (const [name, title] of destructive) {
      const tool = byName.get(name);
      expect(tool?.title).toBe(title);
      expect(tool?.annotations).toEqual({
        title,
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      });
      expect(tool?._meta).toMatchObject({ 'anthropic/requiresUserInteraction': true });
      expect(tool?.description?.length ?? 0).toBeLessThan(4096);
    }

    const instructions = client.getInstructions() ?? '';
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThan(4096);
    expect(instructions).toMatch(/`promote_baseline` promotes/);
    expect(instructions).toMatch(/`accept_baseline` records/);

    await client.close();
    await server.close();
  });

  it('accept_baseline description states run-scoped approval (mcp-6)', async () => {
    const { client, server } = await connectPair();
    const res = await client.listTools();
    const tool = res.tools.find((t) => t.name === 'accept_baseline');
    expect(tool?.description).toMatch(/run-scoped/i);
    expect(tool?.description).toMatch(/confirm_all_regressions_reviewed/i);
    expect(tool?.description).toMatch(/promotion is not implemented/i);
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
    {
      name: 'inspect_diff_cluster_dom',
      arguments: { diff_id: 'run_pr42:/pricing:1280', cluster_id: 1 },
      schema: inspectDiffClusterDomOutputSchema,
    },
    {
      name: 'verify_css_patch',
      arguments: {
        diff_id: 'run_pr42:/pricing:1280',
        target_selector: '.pricing-card',
        css_patch: '.pricing-card { overflow: hidden; }',
      },
      schema: verifyCssPatchOutputSchema,
    },
    {
      name: 'promote_baseline',
      arguments: { run_id: 'run_pr42', confirm_reviewed: true },
      schema: promoteBaselineOutputSchema,
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

  it('serves local CLI JSON reports via FRONTGUARD_LOCAL_REPORT without FRONTGUARD_API_KEY', async () => {
    delete process.env.FRONTGUARD_API_KEY;
    const tmpDir = mkdtempSync(join(tmpdir(), 'fg-mcp-local-'));
    const reportPath = join(tmpDir, 'report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        url: 'http://localhost:3000',
        timestamp: '2026-06-15T12:00:00.000Z',
        results: [
          {
            route: '/pricing',
            viewport: 1280,
            status: 'regression',
            diffPercentage: 0.045,
            classification: 'regression',
            suggestedFix: {
              fixType: 'css',
              category: 'spacing-fix',
              patch: '.pricing { gap: 16px; }',
              confidence: 0.9,
              explanation: 'Spacing changed on pricing grid',
              target: '.pricing',
            },
            clusters: [
              {
                id: 1,
                bbox: { x: 10, y: 20, width: 100, height: 40 },
                targetSelector: '.pricing',
              },
            ],
          },
        ],
      }),
    );
    process.env.FRONTGUARD_LOCAL_REPORT = reportPath;
    delete process.env.FRONTGUARD_MCP_WRITES;
    const previousCwd = process.cwd();
    const repoDir = mkdtempSync(join(tmpdir(), 'fg-mcp-local-git-'));
    execFileSync('git', ['init', '-q'], { cwd: repoDir });
    process.chdir(repoDir);
    try {
      const localClient = createLocalReportClient(reportPath);
      const listed = await listRegressions(localClient, { pr_id: 'run_local' });
      expect(listed.count).toBe(1);
      expect(listed.regressions[0].route).toBe('/pricing');

      const inspected = await inspectDiffClusterDom(localClient, {
        diff_id: 'run_local:/pricing:1280',
      });
      expect(inspected.clusters[0]?.targetSelector).toBe('.pricing');

      const { client, server } = await connectPair();
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toContain('promote_baseline');
      expect(names).not.toContain('accept_baseline');
      const res = (await client.callTool({
        name: 'inspect_diff_cluster_dom',
        arguments: { diff_id: 'run_local:/pricing:1280', cluster_id: 1 },
      })) as CallToolResult;
      expect(res.isError).toBeFalsy();
      const data = JSON.parse(extractText(res));
      expect(data.clusters[0].targetSelector).toBe('.pricing');
      await client.close();
      await server.close();

      expect(() =>
        execFileSync('git', ['rev-parse', '--verify', 'refs/heads/frontguard-baselines'], {
          cwd: repoDir,
          stdio: 'ignore',
        }),
      ).toThrow();
    } finally {
      process.chdir(previousCwd);
      delete process.env.FRONTGUARD_LOCAL_REPORT;
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('list_horizontal_overflow', () => {
  it('reads flagged and unflagged rows from a local report without changing pixel status', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fg-mcp-overflow-'));
    const reportPath = join(tmpDir, 'report.json');
    writeFileSync(
      reportPath,
      JSON.stringify({
        id: 'run_local',
        diffs: [{ route: '/pricing', viewport: 800, status: 'pass', diffPercentage: 0 }],
        horizontalOverflow: [
          {
            route: '/pricing',
            viewport: 800,
            browser: 'chromium',
            innerWidth: 800,
            scrollWidth: 1400,
            flagged: true,
            elements: [{ selector: '[data-testid="wide"]', overflowPx: 600 }],
          },
          {
            route: '/ghost',
            viewport: 800,
            browser: 'chromium',
            innerWidth: 800,
            scrollWidth: 1400,
            flagged: false,
            elements: [],
          },
        ],
      }),
    );
    try {
      const client = createLocalReportClient(reportPath);
      const listed = await listHorizontalOverflow(client, {});
      expect(listHorizontalOverflowOutputSchema.parse(listed)).toMatchObject({
        count: 2,
        flagged: 1,
        runId: 'run_local',
      });
      expect(listed.rows[0]?.elements[0]?.selector).toBe('[data-testid="wide"]');
      expect(listed.rows[1]?.flagged).toBe(false);
      const run = await client.getRun('run_local');
      expect(run.results?.[0]?.status).toBe('pass');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
