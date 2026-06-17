/**
 * Regression test for mcp-2: when the cloud-api wire returns a result with a
 * populated `suggestedFix`, `get_suggested_fix` must return that object — not
 * the canned `{ fix: null, reason: 'Re-run with an ai provider…' }`.
 *
 * The cloud-api now plumbs suggestedFix end to end, so this exercises the MCP
 * side reading it back off the wire.
 */
import { describe, it, expect } from 'vitest';
import { CloudClient, diffIdFor } from '../src/client/cloud.js';
import { getSuggestedFix } from '../src/tools/get-suggested-fix.js';

const FIX = {
  fixType: 'css' as const,
  category: 'overflow-fix',
  patch: '.pricing-card { overflow: hidden; }',
  confidence: 0.82,
  explanation: 'Pricing card content overflowed at 1280px; clip overflow.',
  target: '.pricing-card',
};

const RUN_WITH_FIX = {
  id: 'run_fix',
  status: 'completed' as const,
  url: 'https://shop.example.com',
  routes: [{ path: '/pricing' }],
  viewports: [1280],
  browsers: ['chromium'],
  threshold: 0.05,
  createdAt: '2026-06-10T10:00:00.000Z',
  reportUrl: '/v1/reports/run_fix',
  results: [
    {
      route: '/pricing',
      viewport: 1280,
      status: 'regression',
      diffPercentage: 0.09,
      classification: 'regression',
      timestamp: '2026-06-10T10:00:20.000Z',
      suggestedFix: FIX,
    },
  ],
};

function clientReturning(run: typeof RUN_WITH_FIX): CloudClient {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const auth = init?.headers ? new Headers(init.headers).get('Authorization') : null;
    if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
    const path = new URL(url).pathname;
    if (path === `/v1/runs/${run.id}`) return Response.json(run);
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
  return new CloudClient({ apiKey: 'fg_test', apiUrl: 'https://api.frontguard.dev' }, { fetch: fetchImpl });
}

describe('get_suggested_fix (mcp-2)', () => {
  it('returns the populated fix when the wire carries one', async () => {
    const client = clientReturning(RUN_WITH_FIX);
    const diffId = diffIdFor(RUN_WITH_FIX.id, { route: '/pricing', viewport: 1280 });
    const out = await getSuggestedFix(client, { diff_id: diffId });

    expect(out.fix).toEqual(FIX);
    expect(out.reason).toBeUndefined();
  });

  it('falls back to the canned reason when no fix is present', async () => {
    const noFix = {
      ...RUN_WITH_FIX,
      results: [{ ...RUN_WITH_FIX.results[0], suggestedFix: undefined }],
    };
    const client = clientReturning(noFix);
    const diffId = diffIdFor(noFix.id, { route: '/pricing', viewport: 1280 });
    const out = await getSuggestedFix(client, { diff_id: diffId });

    expect(out.fix).toBeNull();
    expect(out.reason).toMatch(/No AI fix available/i);
  });
});
