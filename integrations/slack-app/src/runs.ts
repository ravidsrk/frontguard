/**
 * Cloud-API run submission + Slack `response_url` delivery.
 *
 * The slash-command handler must reply within 3 seconds. We use that ack to
 * say "queued"; the actual run is submitted to the Frontguard Cloud API in
 * the background, and once it finishes we deliver a follow-up message via
 * Slack's `response_url` (valid for ~30 minutes).
 *
 * Pure, testable core — the HTTP shell lives in `handler.ts`.
 *
 * @module runs
 */

import { buildVisualResultBlocks, type RunSummary } from './slack-api.js';

/** URL validation: only `http(s)` schemes are accepted for runs. */
export function isAllowedRunUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Shape of the Cloud API run-submission response. Mirrors `POST /v1/run`.
 *
 * @see packages/cloud-api/src/index.ts
 */
export interface CloudRunResponse {
  id: string;
  status: string;
  reportUrl?: string;
  statusUrl?: string;
}

/**
 * One per-route result inside a completed run. Mirrors the cloud-api wire shape
 * (`RunResult`): each result carries a `status` STRING, not a boolean flag.
 *
 * Per-result `status` ∈ `passed | regression | changed | warning |
 * new_baseline | failed` (`failed` is defensive; the API does not emit it today
 * but the type is widened so we don't ignore it if it appears).
 *
 * @see packages/cloud-api/src/types.ts:30 (RunResult)
 */
export interface CloudRunResult {
  route?: string;
  viewport?: number;
  status?: string;
  diffPercentage?: number;
  classification?: string;
  timestamp?: string;
}

/** Shape of a completed run, polled via `GET /v1/runs/:id`. */
export interface CloudRunStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  url?: string;
  reportUrl?: string | null;
  error?: string;
  results?: CloudRunResult[] | null;
}

export interface SubmitRunOptions {
  apiBaseUrl: string;
  apiKey: string;
  url: string;
}

/**
 * Submits a visual-regression run to the Frontguard Cloud API. Throws on a
 * non-2xx response so the caller can surface a Slack-side error.
 */
export async function submitCloudRun(
  opts: SubmitRunOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudRunResponse> {
  const res = await fetchImpl(`${opts.apiBaseUrl.replace(/\/$/, '')}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ url: opts.url }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`Cloud API run submission failed: HTTP ${res.status} ${detail}`);
  }
  const data = (await res.json()) as CloudRunResponse;
  if (!data.id) throw new Error('Cloud API run submission returned no run id');
  return data;
}

/**
 * Polls `GET /v1/runs/:id` until the run reaches a terminal state or the
 * deadline elapses. Returns the latest status seen (which may still be
 * `running` if the deadline hit first).
 */
export async function pollRunUntilTerminal(opts: {
  apiBaseUrl: string;
  apiKey: string;
  runId: string;
  /** Max wall-clock seconds to wait. Default 25 minutes (Slack response_url is good for 30). */
  maxWaitMs?: number;
  /** Poll interval. Default 5 s. */
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  /** Injectable timer (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (tests). */
  now?: () => number;
}): Promise<CloudRunStatus> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const maxWaitMs = opts.maxWaitMs ?? 25 * 60_000;
  const interval = opts.intervalMs ?? 5_000;

  const deadline = now() + maxWaitMs;
  let last: CloudRunStatus = { id: opts.runId, status: 'queued' };
  while (now() < deadline) {
    const res = await fetchImpl(
      `${opts.apiBaseUrl.replace(/\/$/, '')}/v1/runs/${encodeURIComponent(opts.runId)}`,
      { headers: { Authorization: `Bearer ${opts.apiKey}` } },
    );
    if (res.ok) {
      last = (await res.json()) as CloudRunStatus;
      if (last.status === 'completed' || last.status === 'failed') return last;
    }
    // Sleep without exceeding the deadline.
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(interval, remaining));
  }
  return last;
}

/**
 * Counts regressions and warnings in a polled run.
 *
 * Reads the per-result `status` string from the real cloud-api wire shape —
 * mirroring `isFailingRun()`/`summarizeResults()` in
 * `integrations/netlify/lib/core.js`:
 *   - `regression` / `changed` / `failed` are failure-worthy → counted as
 *     regressions (RunSummary has no separate `failed` bucket, so a per-result
 *     `failed` folds in here);
 *   - `warning` is a soft warning;
 *   - `passed` / `new_baseline` are clean and counted as neither.
 */
export function summarizeRun(run: CloudRunStatus, fallbackUrl: string): RunSummary {
  const results = run.results ?? [];
  let regressions = 0;
  let warnings = 0;
  for (const r of results) {
    const status = r && typeof r === 'object' ? r.status : undefined;
    if (status === 'regression' || status === 'changed' || status === 'failed') regressions++;
    else if (status === 'warning') warnings++;
  }
  return {
    url: run.url ?? fallbackUrl,
    total: results.length,
    regressions,
    warnings,
    reportUrl: run.reportUrl ?? undefined,
  };
}

/**
 * Posts a delayed Slack message to a `response_url`. Slack expects a JSON
 * body with `response_type` + `text` (and optional `blocks`). Never throws —
 * returns `{ ok }` so a failed post can't crash the worker.
 */
export async function postSlackResponse(
  responseUrl: string,
  body: { response_type: 'in_channel' | 'ephemeral'; text: string; blocks?: unknown[]; replace_original?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Builds the follow-up Slack response body for a completed (or failed) run.
 */
export function buildFollowUpResponse(run: CloudRunStatus, fallbackUrl: string): {
  response_type: 'in_channel';
  text: string;
  blocks: unknown[];
  replace_original: false;
} {
  if (run.status === 'failed') {
    return {
      response_type: 'in_channel',
      text: `Frontguard check failed for ${fallbackUrl}: ${run.error ?? 'unknown error'}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:warning: Frontguard check *failed* for \`${fallbackUrl}\`\n_${run.error ?? 'unknown error'}_`,
          },
        },
      ],
      replace_original: false,
    };
  }

  const summary = summarizeRun(run, fallbackUrl);
  const headline =
    summary.regressions > 0
      ? `${summary.regressions} visual regression(s) on ${summary.url}`
      : summary.warnings > 0
        ? `${summary.warnings} visual change(s) on ${summary.url}`
        : `No visual regressions on ${summary.url}`;

  return {
    response_type: 'in_channel',
    text: `Frontguard — ${headline}`,
    blocks: buildVisualResultBlocks(summary),
    replace_original: false,
  };
}

/**
 * End-to-end: poll the run to completion and deliver the follow-up message
 * to Slack's `response_url`. Designed for `ctx.waitUntil(...)` on Workers.
 * Errors are caught and reported back to Slack (never thrown).
 */
export async function deliverRunResult(opts: {
  apiBaseUrl: string;
  apiKey: string;
  runId: string;
  url: string;
  responseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxWaitMs?: number;
  intervalMs?: number;
}): Promise<void> {
  try {
    const final = await pollRunUntilTerminal({
      apiBaseUrl: opts.apiBaseUrl,
      apiKey: opts.apiKey,
      runId: opts.runId,
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
      now: opts.now,
      maxWaitMs: opts.maxWaitMs,
      intervalMs: opts.intervalMs,
    });
    await postSlackResponse(opts.responseUrl, buildFollowUpResponse(final, opts.url), opts.fetchImpl);
  } catch (err) {
    await postSlackResponse(
      opts.responseUrl,
      {
        response_type: 'in_channel',
        text: `Frontguard check errored for ${opts.url}: ${err instanceof Error ? err.message : String(err)}`,
        replace_original: false,
      },
      opts.fetchImpl,
    );
  }
}
