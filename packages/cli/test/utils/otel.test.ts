import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCliTrace, withCliTrace } from '../../src/utils/otel.js';

const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/collect',
  OTEL_EXPORTER_OTLP_HEADERS: 'api-key=secret-token,x-tenant=acme',
};

function okFetch() {
  return vi.fn(async () => new Response('{}', { status: 204 })) as unknown as typeof fetch;
}

function posted(fetchImpl: typeof fetch): { url: string; init: RequestInit; body: string } {
  const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
  const call = mock.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit;
  return { url: String(call[0]), init, body: String(init.body) };
}

describe('CLI OTLP traces', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not call fetch when no endpoint is set', async () => {
    const fetchImpl = okFetch();
    const trace = createCliTrace({}, fetchImpl);
    trace.start('frontguard.capture').end('ok', { 'frontguard.shots': 1 });
    await trace.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts capture and compare counts and does not follow a secret into the body', async () => {
    const fetchImpl = okFetch();
    const trace = createCliTrace(env, fetchImpl);
    trace.start('frontguard.capture').end('ok', { 'frontguard.shots': 2 });
    trace.start('frontguard.compare').end('error', { 'frontguard.shots': 1 });
    await trace.flush();

    const { url, init, body } = posted(fetchImpl);
    expect(url).toBe('https://otel.example/collect/v1/traces');
    expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({
      'api-key': 'secret-token',
      'x-tenant': 'acme',
      'content-type': 'application/json',
    });
    expect(body).toContain('frontguard.capture');
    expect(body).toContain('frontguard.compare');
    expect(body).toContain('frontguard-cli');
    expect(body).toContain('"intValue":"2"');
    expect(body).toContain('"code":1');
    expect(body).toContain('"code":2');
    expect(body).not.toContain('secret-token');
    expect(body).not.toContain('https://otel.example');
  });

  it('does not append /v1/traces twice', async () => {
    const fetchImpl = okFetch();
    const trace = createCliTrace(
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otel.example/v1/traces/' },
      fetchImpl,
    );
    trace.start('frontguard.capture').end('ok', { 'frontguard.shots': 1 });
    await trace.flush();
    expect(posted(fetchImpl).url).toBe('https://otel.example/v1/traces');
  });

  it('closes an open span as an error and ignores a second flush', async () => {
    const fetchImpl = okFetch();
    const trace = createCliTrace(env, fetchImpl);
    trace.start('frontguard.capture');
    await trace.flush();
    await trace.flush();
    const { body } = posted(fetchImpl);
    expect(body).toContain('"code":2');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('resolves when the exporter fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    await expect(
      withCliTrace(async (trace) => {
        trace.start('frontguard.capture').end('ok', { 'frontguard.shots': 1 });
        return 'ran';
      }, env, fetchImpl),
    ).resolves.toBe('ran');
  });

  it('still flushes when the traced function throws', async () => {
    const fetchImpl = okFetch();
    await expect(
      withCliTrace(async (trace) => {
        trace.start('frontguard.compare');
        throw new Error('compare failed');
      }, env, fetchImpl),
    ).rejects.toThrow('compare failed');
    expect(posted(fetchImpl).body).toContain('frontguard.compare');
    expect(posted(fetchImpl).body).toContain('"code":2');
  });
});
