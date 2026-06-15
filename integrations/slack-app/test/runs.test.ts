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
  const completed: CloudRunStatus = {
    id: 'r',
    status: 'completed',
    url: 'https://example.com',
    reportUrl: 'https://frontguard.dev/r/r',
    results: [{ regression: true }, { warning: true }, {}],
  };

  it('counts regressions and warnings', () => {
    expect(summarizeRun(completed, 'https://fallback')).toEqual({
      url: 'https://example.com',
      total: 3,
      regressions: 1,
      warnings: 1,
      reportUrl: 'https://frontguard.dev/r/r',
    });
  });

  it('builds an in-channel response for a completed run', () => {
    const body = buildFollowUpResponse(completed, 'https://fallback');
    expect(body.response_type).toBe('in_channel');
    expect(body.text).toContain('1 visual regression');
    expect(body.replace_original).toBe(false);
    expect(Array.isArray(body.blocks)).toBe(true);
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
