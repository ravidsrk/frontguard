/**
 * OpenTelemetry metrics export (OTLP/HTTP).
 *
 * Emits run/monitor completion metrics to any OTLP-compatible collector
 * (Datadog, Grafana, Honeycomb, …) so Frontguard can be the visual-quality
 * module in your observability stack. Implemented as plain OTLP/HTTP JSON over
 * `fetch` — no `@opentelemetry/*` SDK — so it runs unchanged on Cloudflare
 * Workers. Best-effort: a failed export is never allowed to break a run.
 *
 * Enabled by setting `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `https://otlp.example.com`).
 * Metrics are POSTed to `<endpoint>/v1/metrics`. Optional headers (e.g. an API
 * key) come from `OTEL_EXPORTER_OTLP_HEADERS` as `key1=value1,key2=value2`.
 *
 * @module otel
 */

import type { Run } from '../types.js';

/** Bindings needed for OTLP export (from Worker secrets). */
export interface OtelEnv {
  /** OTLP/HTTP base endpoint. When unset, export is disabled (no-op). */
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  /** Comma-separated `key=value` headers (e.g. `api-key=abc,x-tenant=acme`). */
  OTEL_EXPORTER_OTLP_HEADERS?: string;
}

/** Normalised metrics for a single completed run. */
export interface RunMetrics {
  runId: string;
  /** Final status of the run. */
  status: Run['status'];
  /** Wall-clock duration in milliseconds (0 if unknown). */
  durationMs: number;
  /** Total route × viewport comparisons. */
  total: number;
  /** Number of regressions. */
  regressions: number;
  /** Number of below-threshold changes / warnings. */
  warnings: number;
  /** Extra string attributes (e.g. AI provider). */
  attributes?: Record<string, string>;
}

/** Result of an export attempt. */
export interface OtelExportResult {
  ok: boolean;
  /** True when no endpoint is configured (export skipped, not failed). */
  skipped?: boolean;
  error?: string;
}

/** Derives {@link RunMetrics} from a completed {@link Run}. */
export function runMetricsFromRun(run: Run): RunMetrics {
  const results = run.results ?? [];
  const regressions = results.filter((r) => r.status === 'regression').length;
  const warnings = results.filter((r) => r.status === 'changed' || r.status === 'warning').length;
  let durationMs = run.duration ?? 0;
  if (!durationMs && run.completedAt) {
    durationMs = Math.max(0, new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime());
  }
  const attributes: Record<string, string> = {};
  if (run.ai) attributes['ai.provider'] = run.ai.provider;
  return {
    runId: run.id,
    status: run.status,
    durationMs,
    total: results.length,
    regressions,
    warnings,
    attributes,
  };
}

/** Parses an `OTEL_EXPORTER_OTLP_HEADERS` string into a header record. */
export function parseOtlpHeaders(raw?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

/** Builds an OTLP attribute entry. */
function attr(key: string, value: string): unknown {
  return { key, value: { stringValue: value } };
}

/**
 * Builds an OTLP/HTTP JSON metrics payload for a single run. Counts are emitted
 * with DELTA temporality (each export is that run's contribution); duration is a
 * gauge. Exposed for testing.
 */
export function buildOtlpMetricsPayload(metrics: RunMetrics, nowMs: number): unknown {
  const timeUnixNano = String(Math.round(nowMs) * 1_000_000);
  const pointAttrs = [
    attr('run.id', metrics.runId),
    attr('run.status', metrics.status),
    ...Object.entries(metrics.attributes ?? {}).map(([k, v]) => attr(k, v)),
  ];

  const sum = (name: string, value: number) => ({
    name,
    unit: '1',
    sum: {
      aggregationTemporality: 1, // DELTA
      isMonotonic: true,
      dataPoints: [{ asInt: String(value), timeUnixNano, startTimeUnixNano: timeUnixNano, attributes: pointAttrs }],
    },
  });

  return {
    resourceMetrics: [
      {
        resource: { attributes: [attr('service.name', 'frontguard')] },
        scopeMetrics: [
          {
            scope: { name: 'frontguard.cloud', version: '0.2.0' },
            metrics: [
              sum('frontguard.runs', 1),
              sum('frontguard.comparisons', metrics.total),
              sum('frontguard.regressions', metrics.regressions),
              sum('frontguard.warnings', metrics.warnings),
              {
                name: 'frontguard.run.duration',
                unit: 'ms',
                gauge: {
                  dataPoints: [{ asInt: String(metrics.durationMs), timeUnixNano, attributes: pointAttrs }],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** POSTs an OTLP metrics payload to a collector. Never throws. */
export async function sendOtlpMetrics(
  endpoint: string,
  headers: Record<string, string>,
  payload: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<OtelExportResult> {
  const url = `${endpoint.replace(/\/+$/, '')}/v1/metrics`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Exports run metrics to the configured OTLP collector. No-op (returns
 * `{ ok: true, skipped: true }`) when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, so
 * it is safe to call unconditionally on every run completion.
 */
export async function emitRunTelemetry(
  env: OtelEnv,
  metrics: RunMetrics,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<OtelExportResult> {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return { ok: true, skipped: true };
  const headers = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  const payload = buildOtlpMetricsPayload(metrics, nowMs);
  return sendOtlpMetrics(endpoint, headers, payload, fetchImpl);
}
