/**
 * Thin client for the Frontguard Cloud API and local CLI report adapter.
 *
 * Only the surface the MCP tools need: list runs, fetch a run by id,
 * approve baselines. The whole package intentionally avoids depending on
 * `@frontguard/cli` at runtime — it carries Playwright and Daytona, both
 * of which are huge and not needed inside a stdio MCP server.
 *
 * `FRONTGUARD_API_URL` sets the endpoint; point it at a self-hosted cloud-api
 * (`https://`) or local `wrangler dev` (`http://localhost:...`).
 *
 * @module client/cloud
 */

import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateCloudApiUrl, type FrontguardAuth } from '../auth.js';

// ---------------------------------------------------------------------------
// Wire-format types (kept loose — the cloud-api owns the source of truth).
// ---------------------------------------------------------------------------

export interface CloudDiffCluster {
  id?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  targetSelector?: string;
}

export interface CloudRunResult {
  route: string;
  viewport: number;
  /** Browser engine (chromium/firefox/webkit). Disambiguates multi-browser runs. */
  browser?: string;
  status: string;
  diffPercentage: number;
  classification?: string;
  explanation?: string;
  timestamp: string;
  suggestedFix?: CloudSuggestedFix;
  /** Stable id assigned by the cloud-api when present; we synthesize one otherwise. */
  diffId?: string;
  clusters?: CloudDiffCluster[];
}

export interface CloudSuggestedFix {
  fixType: 'css' | 'html' | 'config';
  category: string;
  patch: string;
  confidence: number;
  explanation: string;
  target?: string;
  verified?: boolean;
}

export interface CloudHorizontalOverflow {
  route: string;
  viewport: number;
  browser?: string;
  innerWidth: number;
  scrollWidth: number;
  /** True only when a visible unclipped box passes the right edge. */
  flagged: boolean;
  elements: Array<{ selector: string; overflowPx: number }>;
}

export interface CloudRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  url: string;
  routes?: Array<{ path: string }>;
  viewports?: number[];
  browsers?: string[];
  threshold?: number;
  createdAt: string;
  completedAt?: string;
  duration?: number;
  results: CloudRunResult[] | null;
  reportUrl: string | null;
  baselinesApproved?: boolean;
  /** Present on CLI JSON reports. Does not change pixel status. */
  horizontalOverflow?: CloudHorizontalOverflow[];
  projectId?: string;
  error?: string;
  github?: {
    owner: string;
    repo: string;
    prNumber?: number;
    commitSha?: string;
  };
}

export interface CloudListRunsResponse {
  runs: CloudRun[];
  total: number;
}

export interface CloudApproveResponse {
  approved: boolean;
  runId: string;
  /** Present when the cloud-api explicitly reports whether screenshots were promoted. */
  screenshotsPromoted?: boolean;
}

// ---------------------------------------------------------------------------
// Security constants, secret redaction, and runId validation
// ---------------------------------------------------------------------------

/** Strict allowlist for run IDs interpolated into REST paths (blocks `.`, `..`, `%2F`, `/`). */
export const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

/** Default HTTP timeout for Cloud API requests (30 seconds). */
export const DEFAULT_CLOUD_TIMEOUT_MS = 30_000;

/** Default maximum HTTP response size accepted from Cloud API (10 MiB). */
export const MAX_CLOUD_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Maximum local report JSON file size accepted in local-report mode (25 MiB). */
export const MAX_LOCAL_REPORT_BYTES = 25 * 1024 * 1024;

/** Cloud error bodies are cut to this many characters before they reach the agent (#379). */
export const ERROR_BODY_LIMIT = 300;

const MAX_ERROR_READ_BYTES = 64 * 1024;

const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /sk_(?:live|test)_[a-zA-Z0-9]{20,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /anthropic-[a-zA-Z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /fg_[a-zA-Z0-9_-]{8,}/g,
  /figd_[a-zA-Z0-9_-]{16,}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /gh[psou]_[a-zA-Z0-9]{36,}/g,
  /glpat-[a-zA-Z0-9_-]{20,}/g,
  /xai-[a-zA-Z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[bpors]-[a-zA-Z0-9-]{10,}/g,
  /vercel_[a-zA-Z0-9_-]{24,}/g,
  /\b(?:Bearer|Basic)\s+[a-zA-Z0-9_\-/.+=]{12,}/gi,
];

const KV_SECRET_RE =
  /((?:x-api-key|x-goog-api-key|authorization|api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[a-zA-Z0-9_\-/.+=]{12,}(["']?)/gi;

const URL_USERINFO_RE = /(https?:\/\/)([^/\s@]+@)/gi;
const URL_QUERY_SECRET_RE = /([?&](?:key|api_key|apikey|token|access_token|secret)=)[^&\s"'<>]+/gi;

/** Redact tokens, API keys, URL userinfo, and an optional literal secret from text. */
export function redactSecrets(text: string, literalSecret?: string): string {
  if (!text) return text;
  let out = text;
  if (literalSecret && literalSecret.length >= 4) {
    out = out.replaceAll(literalSecret, '[REDACTED]');
  }
  out = out.replace(URL_USERINFO_RE, '$1REDACTED@');
  out = out.replace(URL_QUERY_SECRET_RE, '$1REDACTED');
  out = out.replace(KV_SECRET_RE, '$1[REDACTED]$2');
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

/** True when `runId` satisfies {@link RUN_ID_PATTERN}. */
export function isValidRunId(runId: string): boolean {
  return typeof runId === 'string' && RUN_ID_PATTERN.test(runId);
}

/** Validate `runId` against {@link RUN_ID_PATTERN} or throw an error. */
export function assertValidRunId(runId: string): string {
  if (!isValidRunId(runId)) {
    throw new Error(
      'Invalid run_id format — must match /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/ (no path separators or traversal segments).',
    );
  }
  return runId;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type CloudClientMode = 'local-report' | 'cloud-api';

export interface CloudClientOptions {
  /** Override the global `fetch` (used by tests). */
  fetch?: typeof fetch;
  /** Execution mode of this client instance. */
  mode?: CloudClientMode;
  /** Request timeout in milliseconds (default: 30s). */
  timeoutMs?: number;
  /** Maximum response body size in bytes (default: 10 MiB). */
  maxResponseBytes?: number;
}

/**
 * Turn a raw cloud-api error body into one short, secret-redacted line: drop
 * scripts, styles and tags (proxies answer 502 with whole HTML pages), collapse
 * whitespace, and cap the result at `limit` characters.
 */
export function summarizeErrorBody(
  body: string,
  limit: number = ERROR_BODY_LIMIT,
  literalSecret?: string,
): string {
  const looksLikeHtml = /<!doctype|<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/i.test(body);
  const plain = looksLikeHtml
    ? body
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/<[^>]*$/, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, '&')
    : body;
  const text = redactSecrets(plain, literalSecret).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * What an agent (or its user) should check for a given status. A local
 * report has no API key or URL, so only its 404 gets a hint, and that hint
 * points at the report instead of FRONTGUARD_API_URL.
 */
export function cloudApiErrorHint(
  status: number,
  mode: CloudClientMode = 'cloud-api',
): string | null {
  if (mode === 'local-report') {
    return status === 404
      ? 'Check the run id. A local report holds one run; list_regressions with pr_id "latest" returns its diffIds.'
      : null;
  }
  if (status === 401 || status === 403) return 'Check FRONTGUARD_API_KEY.';
  if (status === 404) return 'Check the run id and FRONTGUARD_API_URL.';
  if (status === 429 || status >= 500) {
    return 'The cloud-api is unavailable. Retry later or check FRONTGUARD_API_URL.';
  }
  if (status >= 200 && status < 300) {
    return 'The response was not JSON. Check that FRONTGUARD_API_URL points at a Frontguard cloud-api.';
  }
  return null;
}

export class CloudApiError extends Error {
  /** {@link body} without markup and with secrets redacted, capped at {@link ERROR_BODY_LIMIT} characters. */
  public readonly summary: string;

  constructor(
    public status: number,
    public method: string,
    public path: string,
    public body: string,
    /** Which client failed: the cloud-api or the local report adapter. */
    public mode: CloudClientMode = 'cloud-api',
    literalSecret?: string,
  ) {
    const summary = summarizeErrorBody(body, ERROR_BODY_LIMIT, literalSecret);
    super(
      `Frontguard ${mode === 'local-report' ? 'local report' : 'cloud-api'} ${method} ${path} failed: ${status} ${summary}`,
    );
    this.name = 'CloudApiError';
    this.summary = summary;
  }
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (err as { name?: string } | null)?.name === 'AbortError';
}

function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: unknown; cause?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  const causeMsg =
    e.cause && typeof e.cause === 'object' && typeof (e.cause as { message?: unknown }).message === 'string'
      ? (e.cause as { message: string }).message
      : '';
  return /redirect/i.test(msg) || /redirect/i.test(causeMsg);
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
  }
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const onAbort = () => rejectPromise(new DOMException('The operation was aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolvePromise(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        rejectPromise(err);
      },
    );
  });
}

async function readResponseTextBounded(
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
  truncateOnLimit: boolean,
): Promise<string> {
  const contentLengthRaw =
    res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : null;
  if (!truncateOnLimit && contentLengthRaw !== null) {
    const len = Number(contentLengthRaw);
    if (Number.isFinite(len) && len > maxBytes) {
      await res.body?.cancel?.().catch(() => {});
      throw new Error(`Response exceeded ${maxBytes}-byte size limit.`);
    }
  }

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const onAbort = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        const { done, value } = await raceWithAbort(reader.read(), signal);
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        if (total + value.byteLength > maxBytes) {
          if (truncateOnLimit) {
            const remaining = Math.max(0, maxBytes - total);
            if (remaining > 0) chunks.push(value.subarray(0, remaining));
            await reader.cancel().catch(() => {});
            break;
          }
          await reader.cancel().catch(() => {});
          throw new Error(`Response exceeded ${maxBytes}-byte size limit.`);
        }
        chunks.push(value);
        total += value.byteLength;
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  const text = await raceWithAbort(res.text(), signal);
  const byteLen = Buffer.byteLength(text, 'utf8');
  if (byteLen > maxBytes) {
    if (truncateOnLimit) {
      return Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
    }
    throw new Error(`Response exceeded ${maxBytes}-byte size limit.`);
  }
  return text;
}

export class CloudClient {
  private readonly fetchImpl: typeof fetch;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  public readonly mode: CloudClientMode;

  constructor(
    private readonly auth: FrontguardAuth,
    opts: CloudClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.mode = opts.mode ?? 'cloud-api';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_CLOUD_TIMEOUT_MS;
    this.maxResponseBytes = opts.maxResponseBytes ?? MAX_CLOUD_RESPONSE_BYTES;
    if (!this.fetchImpl) {
      throw new Error('Global fetch is not available — Node 18+ is required');
    }
    this.apiUrl =
      this.mode === 'local-report' ? auth.apiUrl.replace(/\/+$/, '') : validateCloudApiUrl(auth.apiUrl);
  }

  /** GET /v1/runs — list runs the API key has access to. */
  async listRuns(): Promise<CloudListRunsResponse> {
    return this.request<CloudListRunsResponse>('GET', '/v1/runs');
  }

  /** GET /v1/runs/:id — fetch a single run. */
  async getRun(runId: string): Promise<CloudRun> {
    const safeId = assertValidRunId(runId);
    return this.request<CloudRun>('GET', `/v1/runs/${encodeURIComponent(safeId)}`);
  }

  /** POST /v1/baselines/:runId/approve — record whole-run approval and promote cloud baselines. */
  async approveBaseline(runId: string): Promise<CloudApproveResponse> {
    const safeId = assertValidRunId(runId);
    return this.request<CloudApproveResponse>(
      'POST',
      `/v1/baselines/${encodeURIComponent(safeId)}/approve`,
    );
  }

  /** Alias for {@link approveBaseline} used by `promote_baseline`. */
  async approveRun(runId: string): Promise<CloudApproveResponse> {
    return this.approveBaseline(runId);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const secret = this.mode === 'cloud-api' ? this.auth.apiKey : undefined;
    const ct = new AbortController();
    const timer = setTimeout(() => ct.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.auth.apiKey}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: ct.signal,
          redirect: 'error',
        });
      } catch (err) {
        if (isAbortError(err, ct.signal)) {
          throw new Error(
            `Frontguard cloud-api ${method} ${path} timed out after ${Math.round(this.timeoutMs / 1000)}s.`,
          );
        }
        if (isRedirectError(err)) {
          throw new Error(
            `Frontguard cloud-api ${method} ${path} refused a redirect to protect FRONTGUARD_API_KEY.`,
          );
        }
        const msg = redactSecrets(err instanceof Error ? err.message : String(err), secret);
        throw new Error(`Frontguard cloud-api ${method} ${path} failed: ${msg}`);
      }

      if (!res.ok) {
        const errText = await readResponseTextBounded(
          res,
          Math.min(this.maxResponseBytes, MAX_ERROR_READ_BYTES),
          ct.signal,
          true,
        ).catch(() => '');
        throw new CloudApiError(
          res.status,
          method,
          path,
          errText || res.statusText,
          this.mode,
          secret,
        );
      }

      let text: string;
      try {
        text = await readResponseTextBounded(res, this.maxResponseBytes, ct.signal, false);
      } catch (err) {
        if (isAbortError(err, ct.signal)) {
          throw new Error(
            `Frontguard cloud-api ${method} ${path} timed out while reading response body.`,
          );
        }
        throw err;
      }

      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new CloudApiError(
          res.status,
          method,
          path,
          `non-JSON body: ${text}`,
          this.mode,
          secret,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Local CLI report resolution & read-only adapter
// ---------------------------------------------------------------------------

function resolveReportFileFromPath(candidatePath: string): string {
  let st;
  try {
    st = lstatSync(candidatePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new Error(`Local Frontguard report not found at "${candidatePath}".`);
    }
    throw err;
  }

  if (st.isSymbolicLink()) {
    throw new Error(
      `Refusing to read local Frontguard report from symlink "${candidatePath}". Point FRONTGUARD_LOCAL_REPORT at a regular file or directory.`,
    );
  }

  if (st.isDirectory()) {
    for (const name of ['report.json', 'results.json']) {
      const child = join(candidatePath, name);
      let childStat;
      try {
        childStat = lstatSync(child);
      } catch {
        continue;
      }
      if (childStat.isSymbolicLink()) {
        throw new Error(
          `Refusing to read local Frontguard report symlink "${child}".`,
        );
      }
      if (childStat.isFile()) {
        return child;
      }
    }
    throw new Error(
      `No report.json or results.json regular file found in local report directory "${candidatePath}".`,
    );
  }

  if (!st.isFile()) {
    throw new Error(
      `Local Frontguard report path "${candidatePath}" is not a regular file.`,
    );
  }

  return candidatePath;
}

/**
 * Resolves a local CLI report path ONLY when `FRONTGUARD_LOCAL_REPORT` is
 * explicitly set. Never silently auto-loads `./frontguard-report/report.json`
 * from arbitrary cloned repositories. Supports either a regular JSON file or
 * a directory containing `report.json` / `results.json`, and refuses symlinks.
 */
export function resolveLocalReportPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const explicit = env.FRONTGUARD_LOCAL_REPORT?.trim();
  if (!explicit) return null;
  return resolveReportFileFromPath(resolve(cwd, explicit));
}

function readLocalReportTextSafe(reportPath: string, maxBytes: number): { filePath: string; text: string } {
  const filePath = resolveReportFileFromPath(reportPath);
  const openFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let fd: number;
  try {
    fd = openSync(filePath, openFlags);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ELOOP') {
      throw new Error(`Refusing to follow symlink for local Frontguard report "${filePath}".`);
    }
    throw err;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`Local Frontguard report "${filePath}" is not a regular file.`);
    }
    if (stat.size > maxBytes) {
      throw new Error(
        `Local Frontguard report "${filePath}" (${stat.size} bytes) exceeds the ${maxBytes}-byte limit.`,
      );
    }
    return { filePath, text: readFileSync(fd, 'utf8') };
  } finally {
    closeSync(fd);
  }
}

function normalizeLocalSuggestedFix(raw: unknown): CloudSuggestedFix | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.patch !== 'string') return undefined;
  const fixType =
    obj.fixType === 'css' || obj.fixType === 'html' || obj.fixType === 'config'
      ? obj.fixType
      : 'css';
  return {
    fixType,
    category: typeof obj.category === 'string' ? obj.category : 'other',
    patch: obj.patch,
    confidence: typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0,
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    ...(typeof obj.target === 'string' ? { target: obj.target } : {}),
    ...(typeof obj.verified === 'boolean' ? { verified: obj.verified } : {}),
  };
}

function normalizeLocalClusters(raw: unknown): CloudDiffCluster[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const clusters: CloudDiffCluster[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    clusters.push(item as CloudDiffCluster);
  }
  return clusters;
}

function normalizeLocalDiffItem(
  item: Record<string, unknown>,
  fallbackTimestamp: string,
): CloudRunResult {
  const rawRoute = item.route;
  const route =
    typeof rawRoute === 'string'
      ? rawRoute
      : rawRoute && typeof rawRoute === 'object' && typeof (rawRoute as { path?: unknown }).path === 'string'
        ? (rawRoute as { path: string }).path
        : '/';
  const aiAnalysis =
    item.aiAnalysis && typeof item.aiAnalysis === 'object' && !Array.isArray(item.aiAnalysis)
      ? (item.aiAnalysis as Record<string, unknown>)
      : undefined;
  const classification =
    typeof item.classification === 'string'
      ? item.classification
      : typeof aiAnalysis?.classification === 'string'
        ? aiAnalysis.classification
        : undefined;

  const explanation =
    typeof item.explanation === 'string'
      ? item.explanation
      : typeof aiAnalysis?.explanation === 'string'
        ? aiAnalysis.explanation
        : undefined;
  const clusters =
    normalizeLocalClusters(item.clusters) ?? normalizeLocalClusters(aiAnalysis?.clusters);
  const suggestedFix = normalizeLocalSuggestedFix(item.suggestedFix);

  return {
    route,
    viewport: Number(item.viewport ?? 1440),
    ...(item.browser ? { browser: String(item.browser) } : {}),
    status: String(item.status ?? 'unchanged'),
    diffPercentage: Number(item.diffPercentage ?? 0),
    ...(classification ? { classification } : {}),
    ...(explanation ? { explanation } : {}),
    timestamp: String(item.timestamp ?? fallbackTimestamp),
    ...(suggestedFix ? { suggestedFix } : {}),
    ...(item.diffId ? { diffId: String(item.diffId) } : {}),
    ...(clusters ? { clusters } : {}),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Reads a local `@frontguard/cli` JSON report file (or directory) and normalizes it into a {@link CloudRun}. */
export function loadLocalReportAsRun(
  reportPath: string,
  opts: { maxBytes?: number } = {},
): CloudRun {
  const maxBytes = opts.maxBytes ?? MAX_LOCAL_REPORT_BYTES;
  const { filePath, text: rawText } = readLocalReportTextSafe(reportPath, maxBytes);
  const parsed = JSON.parse(rawText) as unknown;
  const now = new Date().toISOString();

  if (Array.isArray(parsed)) {
    const results: CloudRunResult[] = parsed
      .filter(isPlainRecord)
      .map((item) => normalizeLocalDiffItem(item, now));
    return {
      id: 'run_local',
      status: 'completed',
      url: 'http://localhost',
      createdAt: results[0]?.timestamp ?? now,
      results,
      reportUrl: filePath,
    };
  }

  if (!isPlainRecord(parsed)) {
    throw new Error(`Local Frontguard report "${filePath}" must contain a JSON object or array.`);
  }

  const obj = parsed;
  const configObj = isPlainRecord(obj.config) ? obj.config : undefined;
  const fallbackTs = String(obj.createdAt ?? obj.timestamp ?? now);
  const rawResults = Array.isArray(obj.results)
    ? obj.results
    : Array.isArray(obj.diffs)
      ? obj.diffs
      : [];
  const results: CloudRunResult[] = rawResults
    .filter(isPlainRecord)
    .map((item) => normalizeLocalDiffItem(item, fallbackTs));

  const resolvedUrl =
    typeof obj.url === 'string'
      ? obj.url
      : typeof obj.baseUrl === 'string'
        ? obj.baseUrl
        : typeof configObj?.baseUrl === 'string'
          ? configObj.baseUrl
          : 'http://localhost';
  const horizontalOverflow = readHorizontalOverflow(obj.horizontalOverflow);

  const rawId = typeof obj.id === 'string' && isValidRunId(obj.id) ? obj.id : 'run_local';

  return {
    id: rawId,
    status: 'completed',
    url: resolvedUrl,
    ...(Array.isArray(configObj?.viewports)
      ? { viewports: (configObj.viewports as unknown[]).map(Number) }
      : {}),
    ...(Array.isArray(configObj?.browsers)
      ? { browsers: (configObj.browsers as unknown[]).map(String) }
      : {}),
    ...(typeof configObj?.threshold === 'number' ? { threshold: configObj.threshold } : {}),
    createdAt:
      typeof obj.createdAt === 'string'
        ? obj.createdAt
        : typeof obj.timestamp === 'string'
          ? obj.timestamp
          : now,
    results,
    reportUrl: typeof obj.reportUrl === 'string' ? obj.reportUrl : filePath,
    ...(typeof obj.baselinesApproved === 'boolean'
      ? { baselinesApproved: obj.baselinesApproved }
      : {}),
    ...(isPlainRecord(obj.github) ? { github: obj.github as CloudRun['github'] } : {}),
    ...(horizontalOverflow ? { horizontalOverflow } : {}),
  };
}

function readHorizontalOverflow(raw: unknown): CloudHorizontalOverflow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: CloudHorizontalOverflow[] = [];
  for (const item of raw) {
    if (!isPlainRecord(item)) continue;
    if (typeof item.route !== 'string') continue;
    const elements = Array.isArray(item.elements)
      ? item.elements.flatMap((el) => {
          if (!isPlainRecord(el)) return [];
          if (typeof el.selector !== 'string' || typeof el.overflowPx !== 'number') return [];
          return [{ selector: el.selector, overflowPx: el.overflowPx }];
        })
      : [];
    rows.push({
      route: item.route,
      viewport: Number(item.viewport ?? 0),
      ...(typeof item.browser === 'string' ? { browser: item.browser } : {}),
      innerWidth: Number(item.innerWidth ?? 0),
      scrollWidth: Number(item.scrollWidth ?? 0),
      flagged: item.flagged === true,
      elements,
    });
  }
  return rows.length > 0 ? rows : undefined;
}

/** Creates a read-only {@link CloudClient}-compatible adapter backed by a local CLI report file or directory. */
export function createLocalReportClient(reportPath: string): CloudClient {
  const runNotFound = (requestedId: string, runId: string): Response =>
    new Response(
      JSON.stringify({
        error: `Run ${requestedId} is not in the local report. The report's run id is ${runId}.`,
      }),
      { status: 404 },
    );

  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    const run = loadLocalReportAsRun(reportPath);

    if (method === 'GET' && url.pathname === '/v1/runs') {
      return new Response(JSON.stringify({ runs: [run], total: 1 }), { status: 200 });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/runs/')) {
      const requestedId = decodeURIComponent(url.pathname.slice('/v1/runs/'.length));
      if (requestedId === run.id || requestedId === 'run_local' || requestedId === 'local') {
        return new Response(JSON.stringify(run), { status: 200 });
      }
      return runNotFound(requestedId, run.id);
    }
    if (method === 'POST' && /^\/v1\/baselines\/[^/]+\/approve$/.test(url.pathname)) {
      return new Response(
        JSON.stringify({
          error:
            'Local report mode is read-only and never modifies report files or baselines. Run `npx frontguard update-baselines --confirm-baselines` to update local baselines.',
        }),
        { status: 405 },
      );
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  return new CloudClient(
    { apiKey: 'local', apiUrl: 'http://frontguard.local' },
    { fetch: localFetch, mode: 'local-report' },
  );
}

/**
 * Stable id for a diff inside a run. The cloud-api does not currently expose
 * a per-diff primary key, so we derive one from `runId + route + viewport`,
 * plus `browser` when known — the sandbox emits one result per
 * browser×viewport×route, so without the browser dimension two browsers
 * regressing the same route+viewport collapse to one diffId (mcp-9).
 *
 * Legacy 3-segment ids (no browser) are still produced when `browser` is
 * absent, so existing agent sessions keep working.
 */
export function diffIdFor(
  runId: string,
  result: Pick<CloudRunResult, 'route' | 'viewport' | 'browser'>,
): string {
  const base = `${runId}:${result.route}:${result.viewport}`;
  return result.browser ? `${base}:${result.browser}` : base;
}

/**
 * Parse a {@link diffIdFor} string back into its parts.
 *
 * Routes can contain colons, so we never split naively. Instead we peel from
 * the right: `runId` is everything before the first colon (validated against
 * {@link RUN_ID_PATTERN}); the viewport is the trailing numeric segment,
 * optionally followed by a non-numeric browser segment.
 */
export function parseDiffId(
  diffId: string,
): { runId: string; route: string; viewport: number; browser?: string } | null {
  if (typeof diffId !== 'string' || diffId.length === 0) return null;
  const first = diffId.indexOf(':');
  if (first === -1) return null;
  const runId = diffId.slice(0, first);
  const rawRest = diffId.slice(first + 1); // `route…:viewport[:browser]` or `route@viewport[@browser]`
  if (!isValidRunId(runId) || !rawRest) return null;

  const lastDelim = Math.max(rawRest.lastIndexOf(':'), rawRest.lastIndexOf('@'));
  if (lastDelim === -1) return null; // need at least `route:viewport` or `route@viewport`

  const lastSeg = rawRest.slice(lastDelim + 1);
  const lastNum = Number(lastSeg);
  const lastIsViewport =
    lastSeg !== '' && Number.isInteger(lastNum) && lastNum > 0 && lastNum <= 100_000;

  if (lastIsViewport) {
    // 3-segment form: `route:viewport` or `route@viewport`.
    const route = rawRest.slice(0, lastDelim);
    if (!route) return null;
    return { runId, route, viewport: lastNum };
  }

  // 4-segment form: `route:viewport:browser` or `route@viewport@browser`.
  const browser = lastSeg;
  const beforeBrowser = rawRest.slice(0, lastDelim);
  const vpDelim = Math.max(beforeBrowser.lastIndexOf(':'), beforeBrowser.lastIndexOf('@'));
  if (vpDelim === -1) return null;
  const vpSeg = beforeBrowser.slice(vpDelim + 1);
  const vpNum = Number(vpSeg);
  const route = beforeBrowser.slice(0, vpDelim);
  if (
    !route ||
    !browser ||
    vpSeg === '' ||
    !Number.isInteger(vpNum) ||
    vpNum <= 0 ||
    vpNum > 100_000
  ) {
    return null;
  }
  return { runId, route, viewport: vpNum, browser };
}
