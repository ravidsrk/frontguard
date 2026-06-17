/**
 * Regression test for mcp-9: the diffId must encode the browser dimension.
 *
 * The daytona-runner emits one result per browser×viewport×route, but the
 * legacy diffId was `runId:route:viewport` only, so two browsers regressing the
 * same route+viewport produced an identical diffId and `get_suggested_fix`
 * returned a non-deterministic first match. The id now appends `:browser`, and
 * `parseDiffId` peels viewport/browser from the right so routes containing
 * colons still round-trip. Legacy 3-segment ids stay valid.
 */
import { describe, it, expect } from 'vitest';
import { CloudClient, diffIdFor, parseDiffId } from '../src/client/cloud.js';
import { getSuggestedFix } from '../src/tools/get-suggested-fix.js';

const FIX_CHROMIUM = {
  fixType: 'css' as const,
  category: 'overflow-fix',
  patch: '.hero { overflow: hidden; } /* chromium */',
  confidence: 0.8,
  explanation: 'Chromium-specific overflow at 1440px.',
};
const FIX_FIREFOX = {
  fixType: 'css' as const,
  category: 'flex-gap',
  patch: '.hero { gap: 1rem; } /* firefox */',
  confidence: 0.74,
  explanation: 'Firefox flex gap rendering at 1440px.',
};

const TWO_BROWSER_RUN = {
  id: 'run_mb',
  status: 'completed' as const,
  url: 'https://shop.example.com',
  routes: [{ path: '/' }],
  viewports: [1440],
  browsers: ['chromium', 'firefox'],
  threshold: 0.05,
  createdAt: '2026-06-10T10:00:00.000Z',
  reportUrl: '/v1/reports/run_mb',
  results: [
    { route: '/', viewport: 1440, browser: 'chromium', status: 'regression', diffPercentage: 0.09, classification: 'regression', timestamp: 't1', suggestedFix: FIX_CHROMIUM },
    { route: '/', viewport: 1440, browser: 'firefox', status: 'regression', diffPercentage: 0.12, classification: 'regression', timestamp: 't2', suggestedFix: FIX_FIREFOX },
  ],
};

function clientFor(run: typeof TWO_BROWSER_RUN): CloudClient {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const auth = init?.headers ? new Headers(init.headers).get('Authorization') : null;
    if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
    if (new URL(url).pathname === `/v1/runs/${run.id}`) return Response.json(run);
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
  return new CloudClient({ apiKey: 'fg_test', apiUrl: 'https://api.frontguard.dev' }, { fetch: fetchImpl });
}

describe('diffId encodes browser (mcp-9)', () => {
  it('includes the browser in the id', () => {
    const id = diffIdFor('r1', { route: '/', viewport: 1440, browser: 'firefox' });
    expect(id).toContain('firefox');
    expect(id).toBe('r1:/:1440:firefox');
  });

  it('round-trips all four fields even when the route contains colons', () => {
    const id = diffIdFor('r1', { route: '/path:with:colons', viewport: 1440, browser: 'chromium' });
    expect(parseDiffId(id)).toEqual({
      runId: 'r1',
      route: '/path:with:colons',
      viewport: 1440,
      browser: 'chromium',
    });
  });

  it('two browsers on the same route+viewport no longer collide', () => {
    const chromium = { route: '/', viewport: 1440, browser: 'chromium' };
    const firefox = { route: '/', viewport: 1440, browser: 'firefox' };
    expect(diffIdFor('run_mb', chromium)).not.toBe(diffIdFor('run_mb', firefox));
  });

  it('get_suggested_fix resolves the specific browser fix', async () => {
    const client = clientFor(TWO_BROWSER_RUN);
    const firefoxId = diffIdFor('run_mb', { route: '/', viewport: 1440, browser: 'firefox' });
    const out = await getSuggestedFix(client, { diff_id: firefoxId });
    expect(out.browser).toBe('firefox');
    expect(out.fix).toEqual(FIX_FIREFOX);

    const chromiumId = diffIdFor('run_mb', { route: '/', viewport: 1440, browser: 'chromium' });
    const outC = await getSuggestedFix(client, { diff_id: chromiumId });
    expect(outC.fix).toEqual(FIX_CHROMIUM);
  });

  it('backward-compat: a legacy 3-segment id parses with browser undefined and falls back to the first match', async () => {
    const legacy = 'run_mb:/:1440';
    const parsed = parseDiffId(legacy);
    expect(parsed).toEqual({ runId: 'run_mb', route: '/', viewport: 1440 });
    expect(parsed?.browser).toBeUndefined();

    const client = clientFor(TWO_BROWSER_RUN);
    const out = await getSuggestedFix(client, { diff_id: legacy });
    // First matching result wins (legacy behavior) — chromium is first.
    expect(out.fix).toEqual(FIX_CHROMIUM);
  });
});
