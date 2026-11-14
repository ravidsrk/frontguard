/**
 * Hand-rolled OTLP/HTTP JSON traces for the CLI.
 *
 * Export is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. This module does
 * not use the `@opentelemetry/*` SDK. Those root package overrides exist
 * because `@daytona/sdk` depends on them. The cloud API already has its own
 * hand-rolled metrics exporter in `packages/cloud-api/src/otel/index.ts`.
 * Spans carry counts only: screenshots, and for model calls the number of calls,
 * errors, budget skips and tokens. No URL, path, DOM, prompt, or image bytes.
 *
 * @module utils/otel
 */

import { randomBytes } from 'node:crypto';
import { CLI_VERSION } from '../version.js';

const EXPORT_TIMEOUT_MS = 1500;
const SHOTS_ATTRIBUTE = 'frontguard.shots';

/** The only attributes a span may carry. All are non-negative integers. */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  SHOTS_ATTRIBUTE,
  'frontguard.ai.calls',
  'frontguard.ai.errors',
  'frontguard.ai.input_tokens',
  'frontguard.ai.output_tokens',
  'frontguard.ai.skipped',
]);

/** Ends a span. A second call is ignored. */
export interface CliSpan {
  end(status: 'ok' | 'error', attributes?: Record<string, number>): void;
}

/** One CLI run's traces. `flush` never throws. */
export interface CliTrace {
  start(name: string): CliSpan;
  flush(): Promise<void>;
}

interface RecordedSpan {
  name: string;
  spanId: string;
  startMs: number;
  endMs?: number;
  status?: 'ok' | 'error';
  attributes?: Record<string, number>;
}

const NOOP_SPAN: CliSpan = { end() {} };

const NOOP_TRACE: CliTrace = {
  start() {
    return NOOP_SPAN;
  },
  async flush() {},
};

/** Millisecond precision, without rounding through an unsafe integer. */
function unixNano(ms: number): string {
  return `${Math.max(0, Math.round(ms))}000000`;
}

function tracesUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/traces')) return trimmed;
  return `${trimmed}/v1/traces`;
}

/** Parses `OTEL_EXPORTER_OTLP_HEADERS` (`key=value` pairs separated by commas). */
function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
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

/** Keeps allowed, finite, non-negative attributes, rounded to integers. */
function allowedAttributes(attributes: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!attributes) return undefined;
  const kept: Record<string, number> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!ALLOWED_ATTRIBUTES.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    kept[key] = Math.round(value);
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

function spanPayload(traceId: string, span: RecordedSpan): unknown {
  const attributes = Object.entries(span.attributes ?? {}).map(([key, value]) => ({
    key,
    value: { intValue: String(value) },
  }));
  return {
    traceId,
    spanId: span.spanId,
    name: span.name,
    kind: 1,
    startTimeUnixNano: unixNano(span.startMs),
    endTimeUnixNano: unixNano(span.endMs ?? span.startMs),
    attributes,
    status: { code: span.status === 'error' ? 2 : 1 },
  };
}

/**
 * Starts a no-op tracer when no endpoint is configured. Otherwise records
 * spans and posts them once. Redirects are not followed, so a collector
 * response cannot send `OTEL_EXPORTER_OTLP_HEADERS` to another host.
 */
export function createCliTrace(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): CliTrace {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return NOOP_TRACE;

  const url = tracesUrl(endpoint);
  const headers = parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  const traceId = randomBytes(16).toString('hex');
  const spans: RecordedSpan[] = [];
  let flushed = false;

  return {
    start(name: string): CliSpan {
      if (flushed) return NOOP_SPAN;
      const span: RecordedSpan = {
        name,
        spanId: randomBytes(8).toString('hex'),
        startMs: Date.now(),
      };
      spans.push(span);
      return {
        end(status, attributes) {
          if (span.endMs !== undefined) return;
          span.endMs = Math.max(span.startMs, Date.now());
          span.status = status;
          span.attributes = allowedAttributes(attributes);
        },
      };
    },
    async flush() {
      if (flushed) return;
      flushed = true;
      if (spans.length === 0) return;
      const now = Date.now();
      for (const span of spans) {
        if (span.endMs === undefined) {
          span.endMs = Math.max(span.startMs, now);
          span.status = 'error';
        }
      }
      try {
        await fetchImpl(url, {
          method: 'POST',
          redirect: 'error',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            resourceSpans: [
              {
                resource: {
                  attributes: [{ key: 'service.name', value: { stringValue: 'frontguard-cli' } }],
                },
                scopeSpans: [
                  {
                    scope: { name: 'frontguard.cli', version: CLI_VERSION },
                    spans: spans.map((span) => spanPayload(traceId, span)),
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
        });
      } catch {
        // A failed export must not change the command result.
      }
    },
  };
}

/** Flushes after `run` returns or throws. */
export async function withCliTrace<T>(
  run: (trace: CliTrace) => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const trace = createCliTrace(env, fetchImpl);
  try {
    return await run(trace);
  } finally {
    await trace.flush();
  }
}
