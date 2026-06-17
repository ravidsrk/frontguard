import { describe, it, expect } from 'vitest';
import {
  submitCloudRun,
  pollRunUntilTerminal,
  postSlackResponse,
  buildFollowUpResponse,
  summarizeRun,
  deliverRunResult,
  isAllowedRunUrl,
  type CloudRunStatus,
} from '../src/runs.js';

interface Recorded {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: string;
}

function recordingFetch(plan: Array<(req: Recorded) => Response | Promise<Response>>): {
  fetch: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fn = (async (input: string, init?: RequestInit) => {
    const rec: Recorded = {
      url: typeof input === 'string' ? input : String(input),
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(rec);
    const handler = plan[calls.length - 1];
    if (!handler) throw new Error(`Unexpected fetch #${calls.length} to ${rec.url}`);
    return handler(rec);
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

describe('isAllowedRunUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isAllowedRunUrl('https://example.com')).toBe(true);
    expect(isAllowedRunUrl('http://example.com')).toBe(true);
  });
  it('rejects other schemes', () => {
    expect(isAllowedRunUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedRunUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedRunUrl('not-a-url')).toBe(false);
  });
});

describe('submitCloudRun', () => {
  it('POSTs /v1/run with the bearer token and url', async () => {
    const { fetch, calls } = recordingFetch([
      () =>
        new Response(JSON.stringify({ id: 'run_1', status: 'queued', statusUrl: '/v1/runs/run_1' }), {
          status: 202,
        }),
    ]);
    const out = await submitCloudRun(
      { apiBaseUrl: 'https://api.frontguard.dev', apiKey: 'fg_x', url: 'https://example.com' },
      fetch,
    );
    expect(out.id).toBe('run_1');
    expect(calls[0].url).toBe('https://api.frontguard.dev/v1/run');
    expect(calls[0].method).toBe('POST');
    expect((calls[0].headers as Record<string, string>).Authorization).toBe('Bearer fg_x');
    expect(JSON.parse(calls[0].body!)).toEqual({ url: 'https://example.com' });
  });

  it('strips a trailing slash on the base URL', async () => {
    const { fetch, calls } = recordingFetch([
      () => new Response(JSON.stringify({ id: 'r' }), { status: 202 }),
    ]);
    await submitCloudRun(
      { apiBaseUrl: 'https://api.frontguard.dev/', apiKey: 'x', url: 'https://example.com' },
      fetch,
    );
    expect(calls[0].url).toBe('https://api.frontguard.dev/v1/run');
  });

  it('throws on a non-2xx response with HTTP status in the message', async () => {
    const { fetch } = recordingFetch([
      () => new Response('bad', { status: 402 }),
    ]);
    await expect(
      submitCloudRun(
        { apiBaseUrl: 'https://api.frontguard.dev', apiKey: 'x', url: 'https://example.com' },
        fetch,
      ),
    ).rejects.toThrow(/HTTP 402/);
  });

  it('throws when the body has no run id', async () => {
    const { fetch } = recordingFetch([
      () => new Response(JSON.stringify({ status: 'queued' }), { status: 202 }),
    ]);
    await expect(
      submitCloudRun(
        { apiBaseUrl: 'https://api.frontguard.dev', apiKey: 'x', url: 'https://example.com' },
        fetch,
      ),
    ).rejects.toThrow(/no run id/);
  });
});

describe('pollRunUntilTerminal', () => {
  it('returns immediately once the run completes', async () => {
    const { fetch, calls } = recordingFetch([
      () => new Response(JSON.stringify({ id: 'r', status: 'running' }), { status: 200 }),
      () => new Response(JSON.stringify({ id: 'r', status: 'completed' }), { status: 200 }),
    ]);
    let t = 0;
    const out = await pollRunUntilTerminal({
      apiBaseUrl: 'https://api.frontguard.dev',
      apiKey: 'x',
      runId: 'r',
      fetchImpl: fetch,
      sleep: async () => {
        t += 100;
      },
      now: () => t,
      intervalMs: 100,
      maxWaitMs: 10_000,
    });
    expect(out.status).toBe('completed');
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.frontguard.dev/v1/runs/r');
    expect((calls[0].headers as Record<string, string>).Authorization).toBe('Bearer x');
  });

  it('returns the last seen state when the deadline elapses', async () => {
    const { fetch } = recordingFetch([
      () => new Response(JSON.stringify({ id: 'r', status: 'running' }), { status: 200 }),
      () => new Response(JSON.stringify({ id: 'r', status: 'running' }), { status: 200 }),
      () => new Response(JSON.stringify({ id: 'r', status: 'running' }), { status: 200 }),
    ]);
    let t = 0;
    const out = await pollRunUntilTerminal({
      apiBaseUrl: 'https://api.frontguard.dev',
      apiKey: 'x',
      runId: 'r',
      fetchImpl: fetch,
      sleep: async () => {
        t += 50;
      },
      now: () => t,
      intervalMs: 50,
      maxWaitMs: 120,
    });
    expect(out.status).toBe('running');
  });

  it('skips a failed poll without crashing', async () => {
    const { fetch, calls } = recordingFetch([
      () => new Response('err', { status: 500 }),
      () => new Response(JSON.stringify({ id: 'r', status: 'completed' }), { status: 200 }),
    ]);
    let t = 0;
    const out = await pollRunUntilTerminal({
      apiBaseUrl: 'https://api.frontguard.dev',
      apiKey: 'x',
      runId: 'r',
      fetchImpl: fetch,
      sleep: async () => {
        t += 10;
      },
      now: () => t,
      intervalMs: 10,
      maxWaitMs: 1_000,
    });
    expect(out.status).toBe('completed');
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('summarizeRun + buildFollowUpResponse', () => {
  // Real cloud-api wire shape: each result carries a `status` string
  // (`passed | regression | changed | warning | new_baseline | failed`), NOT a
  // boolean flag. Mirrors integrations/netlify/test/core.test.js FIXTURE_FAILING
  // and the canonical RunResult in packages/cloud-api/src/types.ts:30.
  const completed: CloudRunStatus = {
    id: 'r',
    status: 'completed',
    url: 'https://example.com',
    reportUrl: 'https://frontguard.dev/r/r',
    results: [
      { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
      { route: '/pricing', viewport: 1440, status: 'regression', diffPercentage: 3.4, timestamp: 't' },
      { route: '/about', viewport: 1440, status: 'changed', diffPercentage: 1.1, timestamp: 't' },
      { route: '/blog', viewport: 1440, status: 'warning', diffPercentage: 0.2, timestamp: 't' },
    ],
  };

  it('counts regressions and warnings from per-result status', () => {
    expect(summarizeRun(completed, 'https://fallback')).toEqual({
      url: 'https://example.com',
      total: 4,
      regressions: 2, // regression + changed
      warnings: 1,
      reportUrl: 'https://frontguard.dev/r/r',
    });
  });

  it('builds an in-channel response for a completed run', () => {
    const body = buildFollowUpResponse(completed, 'https://fallback');
    expect(body.response_type).toBe('in_channel');
    expect(body.text).toContain('2 visual regression');
    expect(body.replace_original).toBe(false);
    expect(Array.isArray(body.blocks)).toBe(true);
  });

  // Regression test for [int-1]: the Slack app previously typed `results` as
  // `Array<{ regression?: boolean; warning?: boolean }>` and counted those
  // booleans, which never exist on the wire. The real cloud-api emits per-result
  // `status` strings, so every completed run reported "No visual regressions"
  // regardless of outcome. This fixture mirrors the dossier's Evidence repro:
  // a run with `status: 'regression'`/`'changed'` alongside `'passed'`.
  it('[int-1] reports a regression when results carry status regression/changed', () => {
    const run: CloudRunStatus = {
      id: 'r',
      status: 'completed',
      url: 'https://example.com',
      results: [
        { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
        { route: '/pricing', viewport: 1440, status: 'regression', diffPercentage: 4.2, timestamp: 't' },
        { route: '/about', viewport: 1440, status: 'changed', diffPercentage: 1.0, timestamp: 't' },
      ],
    };
    const summary = summarizeRun(run, 'https://fallback');
    expect(summary.regressions).toBeGreaterThanOrEqual(1);
    expect(summary.regressions).toBe(2); // regression + changed
    const body = buildFollowUpResponse(run, 'https://fallback');
    expect(body.text).toContain('visual regression');
    expect(body.text).not.toContain('No visual regressions');
  });

  it('[int-1] folds a per-result failed status into regressions', () => {
    const run: CloudRunStatus = {
      id: 'r',
      status: 'completed',
      url: 'https://example.com',
      results: [{ route: '/', viewport: 1440, status: 'failed', diffPercentage: 0, timestamp: 't' }],
    };
    expect(summarizeRun(run, 'https://fallback').regressions).toBe(1);
  });

  it('[int-1] reports a clean run only for passed/new_baseline statuses', () => {
    const run: CloudRunStatus = {
      id: 'r',
      status: 'completed',
      url: 'https://example.com',
      results: [
        { route: '/', viewport: 1440, status: 'passed', diffPercentage: 0, timestamp: 't' },
        { route: '/x', viewport: 1440, status: 'new_baseline', diffPercentage: 0, timestamp: 't' },
      ],
    };
    const summary = summarizeRun(run, 'https://fallback');
    expect(summary.regressions).toBe(0);
    expect(summary.warnings).toBe(0);
    expect(buildFollowUpResponse(run, 'https://fallback').text).toContain('No visual regressions');
  });

  it('builds a failure message for a failed run', () => {
    const body = buildFollowUpResponse(
      { id: 'r', status: 'failed', error: 'sandbox crashed' },
      'https://example.com',
    );
    expect(body.text).toContain('failed');
    expect(body.text).toContain('sandbox crashed');
  });
});

describe('postSlackResponse', () => {
  it('POSTs JSON to the response_url', async () => {
    const { fetch, calls } = recordingFetch([() => new Response('ok', { status: 200 })]);
    const out = await postSlackResponse(
      'https://hooks.slack.com/x',
      { response_type: 'in_channel', text: 'hello' },
      fetch,
    );
    expect(out.ok).toBe(true);
    expect(calls[0].url).toBe('https://hooks.slack.com/x');
    expect(JSON.parse(calls[0].body!)).toMatchObject({ response_type: 'in_channel', text: 'hello' });
  });

  it('returns ok:false on a non-2xx (no throw)', async () => {
    const { fetch } = recordingFetch([() => new Response('nope', { status: 500 })]);
    const out = await postSlackResponse(
      'https://hooks.slack.com/x',
      { response_type: 'ephemeral', text: 'hi' },
      fetch,
    );
    expect(out.ok).toBe(false);
    expect(out.error).toContain('500');
  });

  it('catches network errors', async () => {
    const fakeFetch = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const out = await postSlackResponse(
      'https://hooks.slack.com/x',
      { response_type: 'ephemeral', text: 'hi' },
      fakeFetch,
    );
    expect(out.ok).toBe(false);
    expect(out.error).toBe('boom');
  });
});

describe('deliverRunResult', () => {
  it('polls then posts the follow-up to the response_url', async () => {
    const { fetch, calls } = recordingFetch([
      () =>
        new Response(JSON.stringify({ id: 'r', status: 'completed', results: [] }), { status: 200 }),
      () => new Response('ok', { status: 200 }),
    ]);
    await deliverRunResult({
      apiBaseUrl: 'https://api.frontguard.dev',
      apiKey: 'x',
      runId: 'r',
      url: 'https://example.com',
      responseUrl: 'https://hooks.slack.com/y',
      fetchImpl: fetch,
      sleep: async () => undefined,
      now: () => 0,
      intervalMs: 1,
      maxWaitMs: 100,
    });
    expect(calls[0].url).toContain('/v1/runs/r');
    expect(calls[1].url).toBe('https://hooks.slack.com/y');
    const body = JSON.parse(calls[1].body!);
    expect(body.text).toContain('No visual regressions');
  });

  it('reports the poll error back through the response_url', async () => {
    const fakeFetch = (async (url: string) => {
      if (url.includes('/v1/runs/')) throw new Error('upstream down');
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const captured: Array<{ url: string; body?: string }> = [];
    const wrapped = (async (url: string, init?: RequestInit) => {
      captured.push({ url, body: init?.body as string });
      return fakeFetch(url, init);
    }) as unknown as typeof fetch;

    await deliverRunResult({
      apiBaseUrl: 'https://api.frontguard.dev',
      apiKey: 'x',
      runId: 'r',
      url: 'https://example.com',
      responseUrl: 'https://hooks.slack.com/y',
      fetchImpl: wrapped,
      sleep: async () => undefined,
      now: () => 0,
      intervalMs: 1,
      maxWaitMs: 5,
    });

    const slackCall = captured.find((c) => c.url === 'https://hooks.slack.com/y');
    expect(slackCall).toBeTruthy();
    expect(slackCall!.body).toContain('errored');
    expect(slackCall!.body).toContain('upstream down');
  });
});
