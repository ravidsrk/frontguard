import { describe, it, expect } from 'vitest';
import {
  parseOtlpHeaders,
  runMetricsFromRun,
  buildOtlpMetricsPayload,
  sendOtlpMetrics,
  emitRunTelemetry,
  type RunMetrics,
} from '../src/otel/index.js';
import type { Run } from '../src/types.js';

const baseRun: Run = {
  id: 'run-1',
  status: 'completed',
  url: 'https://example.com',
  routes: [{ path: '/' }],
  viewports: [1440],
  browsers: ['chromium'],
  threshold: 0.1,
  ai: { provider: 'openai', model: 'gpt-4o' },
  createdAt: '2026-06-04T12:00:00.000Z',
  completedAt: '2026-06-04T12:00:03.000Z',
  results: [
    { route: '/', viewport: 1440, status: 'regression', diffPercentage: 12, timestamp: 'x' },
    { route: '/a', viewport: 1440, status: 'changed', diffPercentage: 2, timestamp: 'x' },
    { route: '/b', viewport: 1440, status: 'pass', diffPercentage: 0, timestamp: 'x' },
  ],
  reportUrl: null,
};

const sampleMetrics: RunMetrics = {
  runId: 'run-1',
  status: 'completed',
  durationMs: 3000,
  total: 3,
  regressions: 1,
  warnings: 1,
  attributes: { 'ai.provider': 'openai' },
};

describe('parseOtlpHeaders', () => {
  it('parses comma-separated key=value pairs', () => {
    expect(parseOtlpHeaders('api-key=abc,x-tenant=acme')).toEqual({ 'api-key': 'abc', 'x-tenant': 'acme' });
  });
  it('returns empty for undefined/empty and skips malformed pairs', () => {
    expect(parseOtlpHeaders(undefined)).toEqual({});
    expect(parseOtlpHeaders('justkey,=noval,good=1')).toEqual({ good: '1' });
  });
  it('keeps "=" inside values', () => {
    expect(parseOtlpHeaders('auth=Bearer x=y')).toEqual({ auth: 'Bearer x=y' });
  });
});

describe('runMetricsFromRun', () => {
  it('derives counts and duration from a run', () => {
    const m = runMetricsFromRun(baseRun);
    expect(m).toMatchObject({ runId: 'run-1', status: 'completed', total: 3, regressions: 1, warnings: 1 });
    expect(m.durationMs).toBe(3000);
    expect(m.attributes?.['ai.provider']).toBe('openai');
  });
  it('falls back to 0 duration with no completedAt', () => {
    const m = runMetricsFromRun({ ...baseRun, completedAt: undefined, duration: undefined });
    expect(m.durationMs).toBe(0);
  });
});

describe('buildOtlpMetricsPayload', () => {
  it('emits the five metrics with delta sums and a duration gauge', () => {
    const payload = buildOtlpMetricsPayload(sampleMetrics, 1_700_000_000_000) as {
      resourceMetrics: Array<{ scopeMetrics: Array<{ metrics: Array<{ name: string; sum?: { aggregationTemporality: number }; gauge?: unknown }> }> }>;
    };
    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    const names = metrics.map((m) => m.name);
    expect(names).toEqual([
      'frontguard.runs',
      'frontguard.comparisons',
      'frontguard.regressions',
      'frontguard.warnings',
      'frontguard.run.duration',
    ]);
    // Counts are delta (temporality 1); duration is a gauge.
    expect(metrics[0].sum?.aggregationTemporality).toBe(1);
    expect(metrics[4].gauge).toBeDefined();
    // Timestamp converted to nanoseconds.
    expect(JSON.stringify(payload)).toContain('1700000000000000000');
  });

  it('includes run id and status as data-point attributes', () => {
    const json = JSON.stringify(buildOtlpMetricsPayload(sampleMetrics, 1));
    expect(json).toContain('run.id');
    expect(json).toContain('run-1');
    expect(json).toContain('run.status');
  });
});

describe('sendOtlpMetrics', () => {
  it('POSTs to <endpoint>/v1/metrics and reports ok', async () => {
    let capturedUrl = '';
    const fakeFetch = (async (url: string) => {
      capturedUrl = url;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await sendOtlpMetrics('https://otlp.example.com/', {}, {}, fakeFetch);
    expect(res.ok).toBe(true);
    expect(capturedUrl).toBe('https://otlp.example.com/v1/metrics');
  });
  it('reports failure on non-2xx and never throws on network error', async () => {
    const bad = (async () => new Response('no', { status: 503 })) as unknown as typeof fetch;
    expect((await sendOtlpMetrics('https://x', {}, {}, bad)).error).toContain('503');
    const boom = (async () => { throw new Error('dns'); }) as unknown as typeof fetch;
    const res = await sendOtlpMetrics('https://x', {}, {}, boom);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('dns');
  });
});

describe('emitRunTelemetry', () => {
  it('is a no-op (skipped) when no endpoint is configured', async () => {
    let called = false;
    const fakeFetch = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    const res = await emitRunTelemetry({}, sampleMetrics, fakeFetch);
    expect(res).toEqual({ ok: true, skipped: true });
    expect(called).toBe(false);
  });
  it('exports with parsed headers when an endpoint is configured', async () => {
    let captured: { url: string; headers: Record<string, string> } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, headers: init.headers as Record<string, string> };
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await emitRunTelemetry(
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com', OTEL_EXPORTER_OTLP_HEADERS: 'api-key=secret' },
      sampleMetrics,
      fakeFetch,
      1_700_000_000_000,
    );
    expect(res.ok).toBe(true);
    expect(captured!.url).toBe('https://otlp.example.com/v1/metrics');
    expect(captured!.headers['api-key']).toBe('secret');
  });
});
