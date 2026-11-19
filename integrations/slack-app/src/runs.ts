/**
 * Cloud-API run submission + Workers-safe Slack `response_url` delivery.
 *
 * The slash-command handler must reply within Slack's 3-second deadline, and
 * Cloudflare Workers bound `waitUntil` background execution to ~30 seconds.
 * Ack-path I/O (DoH + submit) is strictly bounded under 2 seconds, and
 * background polling is strictly capped within Workers limits (with optional
 * Queue or webhook callback support for long-running checks).
 *
 * Pure, testable core — the HTTP shell lives in `handler.ts`.
 *
 * @module runs
 */

import {
  isIpLiteral,
  isPrivateOrLoopbackHost,
  resolveHostAddresses,
  SafeRenderTargetError,
  type HostResolver,
} from '@frontguard/cloud-api/render-target';
import {
  buildVisualResultBlocks,
  escapeSlackMrkdwn,
  postSlackMessage,
  type RunSummary,
} from './slack-api.js';

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/** Default ack-path timeout for submitting a run (keeps total ack < 2s). */
export const DEFAULT_SUBMIT_TIMEOUT_MS = 1_500;
/** Default ack-path timeout for DoH resolution. */
export const DEFAULT_DNS_TIMEOUT_MS = 800;
/** Default Workers-safe poll wall-clock budget (20s < 30s Workers limit). */
export const DEFAULT_POLL_MAX_WAIT_MS = 20_000;
/** Hard ceiling for waitUntil polling inside a Worker isolate. */
export const MAX_POLL_WAIT_MS = 25_000;
const POLL_REQUEST_TIMEOUT_MS = 5_000;
const SLACK_RESPONSE_TIMEOUT_MS = 10_000;

/**
 * Validates and canonicalizes a slash-command target URL:
 * - `https:` scheme only (no `http:`, `javascript:`, `file:`, etc.)
 * - No control characters, embedded whitespace, or embedded credentials
 * - Valid public hostname (never private / loopback / link-local hosts)
 * - Percent-encodes `<`, `>`, and `` ` `` to prevent Slack mrkdwn injection
 */
export function canonicalizeRunUrl(value: string): string | null {
  if (typeof value !== 'string') return null;
  if (CONTROL_CHARS_RE.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host || isPrivateOrLoopbackHost(host)) return null;

  const base =
    parsed.pathname === '/' && !parsed.search && !parsed.hash && !trimmed.endsWith('/')
      ? parsed.origin
      : parsed.href;
  return base.replace(/[<>\`]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/**
 * URL validation for slash-command runs: `https:` only, valid hostname, no
 * control chars/whitespace, and never private / loopback / link-local hosts.
 */
export function isAllowedRunUrl(value: string): boolean {
  return canonicalizeRunUrl(value) !== null;
}

/**
 * Validates that a Slack `response_url` is strictly `https:` on
 * `hooks.slack.com` or `*.slack.com` (no SSRF or credential leakage).
 */
export function isAllowedSlackResponseUrl(responseUrl: string): boolean {
  if (typeof responseUrl !== 'string' || !responseUrl || CONTROL_CHARS_RE.test(responseUrl)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(responseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'hooks.slack.com' || (host.endsWith('.slack.com') && host.length > '.slack.com'.length);
}

/**
 * Defense-in-depth SSRF check before forwarding a Slack-submitted URL to the
 * Cloud API. Rejects non-https and private host literals synchronously, then
 * resolves hostnames with a tight timeout and re-checks resolved addresses.
 */
export async function assertSafeRunUrl(
  url: string,
  opts: { resolveHost?: HostResolver; dnsTimeoutMs?: number } = {},
): Promise<void> {
  if (typeof url !== 'string' || CONTROL_CHARS_RE.test(url) || /\s/.test(url.trim())) {
    throw new SafeRenderTargetError('invalid_url', 'url must be a valid URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new SafeRenderTargetError('invalid_url', 'url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new SafeRenderTargetError('scheme_not_allowed', 'url must use https');
  }

  if (parsed.username || parsed.password) {
    throw new SafeRenderTargetError('invalid_url', 'url must not contain credentials');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || isPrivateOrLoopbackHost(host)) {
    throw new SafeRenderTargetError(
      'private_host',
      'url must not target a private, loopback, or link-local host',
    );
  }

  if (isIpLiteral(host)) return;

  const resolveHost = opts.resolveHost ?? resolveHostAddresses;
  const dnsTimeoutMs = opts.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: string[];
  try {
    addresses = await Promise.race([
      resolveHost(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new SafeRenderTargetError(
                'dns_resolution_failed',
                `DNS resolution timed out for host: ${host}`,
              ),
            ),
          dnsTimeoutMs,
        );
      }),
    ]);
  } catch (err) {
    if (err instanceof SafeRenderTargetError) throw err;
    throw new SafeRenderTargetError('dns_resolution_failed', `could not resolve host: ${host}`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new SafeRenderTargetError('dns_resolution_failed', `could not resolve host: ${host}`);
  }

  for (const addr of addresses) {
    if (isPrivateOrLoopbackHost(addr)) {
      throw new SafeRenderTargetError(
        'dns_private',
        'url resolves to a private, loopback, or link-local address',
      );
    }
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
  /** Request timeout in ms. Default 1500ms to stay well inside Slack's 3s ack deadline. */
  timeoutMs?: number;
}

/**
 * Submits a visual-regression run to the Frontguard Cloud API. Throws on a
 * non-2xx response so the caller can surface a Slack-side error.
 */
export async function submitCloudRun(
  opts: SubmitRunOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudRunResponse> {
  const res = await fetchImpl(`${opts.apiBaseUrl.replace(/\/+$/, '')}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ url: opts.url }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS),
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
 * Polls `GET /v1/runs/:id` for a Workers-safe bounded window (default 20s,
 * hard-capped at 25s so `waitUntil` never breaches Cloudflare Workers' 30s
 * wall-clock limit). Fails fast on permanent 4xx errors.
 */
export async function pollRunUntilTerminal(opts: {
  apiBaseUrl: string;
  apiKey: string;
  runId: string;
  /** Max wall-clock ms to wait. Default 20s, clamped to <= 25s for Workers safety. */
  maxWaitMs?: number;
  /** Poll interval. Default 2 s. */
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
  const requestedWait = opts.maxWaitMs ?? DEFAULT_POLL_MAX_WAIT_MS;
  const maxWaitMs = Math.max(0, Math.min(requestedWait, MAX_POLL_WAIT_MS));
  const interval = opts.intervalMs ?? 2_000;

  const deadline = now() + maxWaitMs;
  let last: CloudRunStatus = { id: opts.runId, status: 'queued' };
  while (now() < deadline) {
    const res = await fetchImpl(
      `${opts.apiBaseUrl.replace(/\/+$/, '')}/v1/runs/${encodeURIComponent(opts.runId)}`,
      {
        headers: { Authorization: `Bearer ${opts.apiKey}` },
        signal: AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
      },
    );
    if (res.ok) {
      last = (await res.json()) as CloudRunStatus;
      if (last.status === 'completed' || last.status === 'failed') return last;
    } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new Error(`Cloud API poll failed: HTTP ${res.status}`);
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(interval, remaining));
  }
  return last;
}

/**
 * Counts regressions and warnings in a polled run.
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
 * Posts a delayed Slack message to a validated `response_url` strictly hosted on
 * `hooks.slack.com` / `*.slack.com`. Never throws — returns `{ ok }`.
 */
export async function postSlackResponse(
  responseUrl: string,
  body: { response_type: 'in_channel' | 'ephemeral'; text: string; blocks?: unknown[]; replace_original?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  if (!isAllowedSlackResponseUrl(responseUrl)) {
    return { ok: false, error: 'Invalid Slack response_url host (must be https://*.slack.com)' };
  }
  try {
    const res = await fetchImpl(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SLACK_RESPONSE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Builds the follow-up Slack response body for a completed, failed, or
 * still-running run. Escapes all untrusted `mrkdwn` fields to neutralize
 * `<!channel>`/`<!here>`/`<!everyone>` and formatting injection.
 */
export function buildFollowUpResponse(run: CloudRunStatus, fallbackUrl: string): {
  response_type: 'in_channel' | 'ephemeral';
  text: string;
  blocks: unknown[];
  replace_original: false;
} {
  const safeFallbackUrl = escapeSlackMrkdwn(fallbackUrl);

  if (run.status === 'failed') {
    const safeError = escapeSlackMrkdwn(run.error ?? 'unknown error');
    return {
      response_type: 'in_channel',
      text: `Frontguard check failed for ${safeFallbackUrl}: ${safeError}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:warning: Frontguard check *failed* for \`${safeFallbackUrl}\`\n${safeError}`,
          },
        },
      ],
      replace_original: false,
    };
  }

  if (run.status !== 'completed') {
    const safeStatus = escapeSlackMrkdwn(run.status || 'running');
    const safeRunId = escapeSlackMrkdwn(run.id);
    return {
      response_type: 'ephemeral',
      text: `Frontguard check ${safeRunId} for ${safeFallbackUrl} is still ${safeStatus}. Check your Frontguard dashboard for final results.`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass_flowing_sand: Frontguard check *${safeRunId}* for \`${safeFallbackUrl}\` is still *${safeStatus}*. Check your Frontguard dashboard once it finishes.`,
          },
        },
      ],
      replace_original: false,
    };
  }

  const summary = summarizeRun(run, fallbackUrl);
  const safeUrl = escapeSlackMrkdwn(summary.url);
  const headline =
    summary.regressions > 0
      ? `${summary.regressions} visual regression(s) on ${safeUrl}`
      : summary.warnings > 0
        ? `${summary.warnings} visual change(s) on ${safeUrl}`
        : `No visual regressions on ${safeUrl}`;

  return {
    response_type: 'in_channel',
    text: `Frontguard — ${headline}`,
    blocks: buildVisualResultBlocks(summary),
    replace_original: false,
  };
}

/**
 * End-to-end: runs a bounded Workers-safe status check and delivers the
 * follow-up message to Slack's `response_url`. Errors are caught and reported
 * back cleanly with escaped `mrkdwn`.
 */
export async function deliverRunResult(opts: {
  apiBaseUrl: string;
  apiKey: string;
  runId: string;
  url: string;
  responseUrl: string;
  botToken?: string;
  channelId?: string;
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
    const followUp = buildFollowUpResponse(final, opts.url);
    const posted = opts.responseUrl
      ? await postSlackResponse(opts.responseUrl, followUp, opts.fetchImpl)
      : { ok: false };
    if (!posted.ok && opts.botToken && opts.channelId) {
      await postSlackMessage(
        opts.botToken,
        opts.channelId,
        followUp.blocks,
        followUp.text,
        opts.fetchImpl,
      );
    }
  } catch (err) {
    const safeUrl = escapeSlackMrkdwn(opts.url);
    const safeErr = escapeSlackMrkdwn(err instanceof Error ? err.message : String(err));
    const errorText = `Frontguard check errored for ${safeUrl}: ${safeErr}`;
    const posted = opts.responseUrl
      ? await postSlackResponse(
          opts.responseUrl,
          {
            response_type: 'ephemeral',
            text: errorText,
            replace_original: false,
          },
          opts.fetchImpl,
        )
      : { ok: false };
    if (!posted.ok && opts.botToken && opts.channelId) {
      await postSlackMessage(opts.botToken, opts.channelId, [], errorText, opts.fetchImpl);
    }
  }
}
