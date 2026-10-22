/**
 * Thin client for the Frontguard Cloud API.
 *
 * Only the surface the MCP tools need: list runs, fetch a run by id,
 * approve baselines. The whole package intentionally avoids depending on
 * `@frontguard/cli` at runtime — it carries Playwright and Daytona, both
 * of which are huge and not needed inside a stdio MCP server.
 *
 * `FRONTGUARD_API_URL` overrides the default endpoint; point it at a local
 * `wrangler dev` instance to run the MCP server against a dev cloud-api.
 *
 * @module client/cloud
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FrontguardAuth } from '../auth.js';

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

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface CloudClientOptions {
  /** Override the global `fetch` (used by tests). */
  fetch?: typeof fetch;
  /** Execution mode of this client instance. */
  mode?: 'local-report' | 'cloud-api';
}

export class CloudApiError extends Error {
  constructor(
    public status: number,
    public method: string,
    public path: string,
    public body: string,
  ) {
    super(`Frontguard cloud-api ${method} ${path} failed: ${status} ${body}`);
    this.name = 'CloudApiError';
  }
}

export class CloudClient {
  private readonly fetchImpl: typeof fetch;
  public readonly mode: 'local-report' | 'cloud-api';

  constructor(
    private readonly auth: FrontguardAuth,
    opts: CloudClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.mode = opts.mode ?? 'cloud-api';
    if (!this.fetchImpl) {
      throw new Error('Global fetch is not available — Node 18+ is required');
    }
  }

  /** GET /v1/runs — list runs the API key has access to. */
  async listRuns(): Promise<CloudListRunsResponse> {
    return this.request<CloudListRunsResponse>('GET', '/v1/runs');
  }

  /** GET /v1/runs/:id — fetch a single run. */
  async getRun(runId: string): Promise<CloudRun> {
    return this.request<CloudRun>('GET', `/v1/runs/${encodeURIComponent(runId)}`);
  }

  /** POST /v1/baselines/:runId/approve — record whole-run approval. */
  async approveBaseline(runId: string): Promise<{ approved: boolean; runId: string }> {
    return this.request<{ approved: boolean; runId: string }>(
      'POST',
      `/v1/baselines/${encodeURIComponent(runId)}/approve`,
    );
  }

  /** Alias for approveBaseline used by promote_baseline. */
  async approveRun(runId: string): Promise<{ approved: boolean; runId: string }> {
    return this.approveBaseline(runId);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.auth.apiUrl}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.auth.apiKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new CloudApiError(res.status, method, path, text || res.statusText);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CloudApiError(res.status, method, path, `non-JSON body: ${text.slice(0, 200)}`);
    }
  }
}

/**
 * Resolves a local CLI report path when `FRONTGUARD_LOCAL_REPORT` is set or
 * when `FRONTGUARD_API_KEY` is unset and a default `./frontguard-report/` JSON
 * report exists in the working directory.
 */
export function resolveLocalReportPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const explicit = env.FRONTGUARD_LOCAL_REPORT?.trim();
  if (explicit) return resolve(cwd, explicit);
  if (env.FRONTGUARD_API_KEY?.trim()) return null;
  for (const rel of ['frontguard-report/report.json', 'frontguard-report/results.json']) {
    const candidate = resolve(cwd, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeLocalDiffItem(
  item: Record<string, unknown>,
  fallbackTimestamp: string,
): CloudRunResult {
  const rawRoute = item.route;
  const route =
    typeof rawRoute === 'string'
      ? rawRoute
      : rawRoute && typeof (rawRoute as { path?: unknown }).path === 'string'
        ? (rawRoute as { path: string }).path
        : '/';
  const aiAnalysis =
    item.aiAnalysis && typeof item.aiAnalysis === 'object'
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
  const clusters = Array.isArray(item.clusters)
    ? (item.clusters as CloudDiffCluster[])
    : Array.isArray(aiAnalysis?.clusters)
      ? (aiAnalysis.clusters as CloudDiffCluster[])
      : undefined;

  return {
    route,
    viewport: Number(item.viewport ?? 1440),
    ...(item.browser ? { browser: String(item.browser) } : {}),
    status: String(item.status ?? 'unchanged'),
    diffPercentage: Number(item.diffPercentage ?? 0),
    ...(classification ? { classification } : {}),
    ...(explanation ? { explanation } : {}),
    timestamp: String(item.timestamp ?? fallbackTimestamp),
    ...(item.suggestedFix ? { suggestedFix: item.suggestedFix as CloudSuggestedFix } : {}),
    ...(item.diffId ? { diffId: String(item.diffId) } : {}),
    ...(clusters ? { clusters } : {}),
  };
}

/** Reads a local `@frontguard/cli` JSON report file and normalizes it into a {@link CloudRun}. */
export function loadLocalReportAsRun(reportPath: string): CloudRun {
  const rawText = readFileSync(reportPath, 'utf8');
  const parsed = JSON.parse(rawText) as unknown;
  const now = new Date().toISOString();

  if (Array.isArray(parsed)) {
    const results: CloudRunResult[] = parsed.map((item: Record<string, unknown>) =>
      normalizeLocalDiffItem(item, now),
    );
    return {
      id: 'run_local',
      status: 'completed',
      url: 'http://localhost',
      createdAt: results[0]?.timestamp ?? now,
      results,
      reportUrl: reportPath,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const configObj =
    obj.config && typeof obj.config === 'object'
      ? (obj.config as Record<string, unknown>)
      : undefined;
  const fallbackTs = String(obj.createdAt ?? obj.timestamp ?? now);
  const rawResults = (
    Array.isArray(obj.results) ? obj.results : Array.isArray(obj.diffs) ? obj.diffs : []
  ) as Array<Record<string, unknown>>;
  const results: CloudRunResult[] = rawResults.map((item) =>
    normalizeLocalDiffItem(item, fallbackTs),
  );

  const resolvedUrl =
    typeof obj.url === 'string'
      ? obj.url
      : typeof obj.baseUrl === 'string'
        ? obj.baseUrl
        : typeof configObj?.baseUrl === 'string'
          ? configObj.baseUrl
          : 'http://localhost';
  const horizontalOverflow = readHorizontalOverflow(obj.horizontalOverflow);

  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : 'run_local',
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
    reportUrl: typeof obj.reportUrl === 'string' ? obj.reportUrl : reportPath,
    ...(typeof obj.baselinesApproved === 'boolean'
      ? { baselinesApproved: obj.baselinesApproved }
      : {}),
    ...(obj.github ? { github: obj.github as CloudRun['github'] } : {}),
    ...(horizontalOverflow ? { horizontalOverflow } : {}),
  };
}

function readHorizontalOverflow(raw: unknown): CloudHorizontalOverflow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: CloudHorizontalOverflow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.route !== 'string') continue;
    const elements = Array.isArray(row.elements)
      ? row.elements.flatMap((el) => {
          if (!el || typeof el !== 'object') return [];
          const box = el as Record<string, unknown>;
          if (typeof box.selector !== 'string' || typeof box.overflowPx !== 'number') return [];
          return [{ selector: box.selector, overflowPx: box.overflowPx }];
        })
      : [];
    rows.push({
      route: row.route,
      viewport: Number(row.viewport ?? 0),
      ...(typeof row.browser === 'string' ? { browser: row.browser } : {}),
      innerWidth: Number(row.innerWidth ?? 0),
      scrollWidth: Number(row.scrollWidth ?? 0),
      flagged: row.flagged === true,
      elements,
    });
  }
  return rows.length > 0 ? rows : undefined;
}

/** Creates a {@link CloudClient}-compatible adapter backed by a local CLI report file. */
export function createLocalReportClient(reportPath: string): CloudClient {
  let approvedInMemory = false;

  const localFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    const run = loadLocalReportAsRun(reportPath);
    if (approvedInMemory) {
      run.baselinesApproved = true;
    }

    if (method === 'GET' && url.pathname === '/v1/runs') {
      return new Response(JSON.stringify({ runs: [run], total: 1 }), { status: 200 });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/runs/')) {
      const requestedId = decodeURIComponent(url.pathname.slice('/v1/runs/'.length));
      if (requestedId === run.id || requestedId === 'run_local' || requestedId === 'local') {
        return new Response(JSON.stringify(run), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 });
    }
    const approveMatch = url.pathname.match(/^\/v1\/baselines\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const requestedId = decodeURIComponent(approveMatch[1]);
      if (requestedId !== run.id && requestedId !== 'run_local' && requestedId !== 'local') {
        return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 });
      }
      approvedInMemory = true;
      try {
        const raw = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          (raw as Record<string, unknown>).baselinesApproved = true;
          writeFileSync(reportPath, JSON.stringify(raw, null, 2), 'utf8');
        }
      } catch {
        // Read-only filesystem fallback — approvedInMemory still tracks it for this client instance
      }
      return new Response(JSON.stringify({ approved: true, runId: run.id }), { status: 200 });
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
 * the right: `runId` is everything before the first colon; the viewport is the
 * trailing numeric segment, optionally followed by a non-numeric browser
 * segment. Because viewports are always numeric and browser names never are,
 * this unambiguously distinguishes 3-segment (legacy) from 4-segment ids even
 * when the route itself contains colons.
 */
export function parseDiffId(
  diffId: string,
): { runId: string; route: string; viewport: number; browser?: string } | null {
  const first = diffId.indexOf(':');
  if (first === -1) return null;
  const runId = diffId.slice(0, first);
  const rawRest = diffId.slice(first + 1); // `route…:viewport[:browser]` or `route@viewport[@browser]`
  if (!runId || !rawRest) return null;

  const lastDelim = Math.max(rawRest.lastIndexOf(':'), rawRest.lastIndexOf('@'));
  if (lastDelim === -1) return null; // need at least `route:viewport` or `route@viewport`

  const lastSeg = rawRest.slice(lastDelim + 1);
  const lastIsNumeric = lastSeg !== '' && Number.isFinite(Number(lastSeg));

  if (lastIsNumeric) {
    // 3-segment form: `route:viewport` or `route@viewport`.
    const route = rawRest.slice(0, lastDelim);
    if (!route) return null;
    return { runId, route, viewport: Number(lastSeg) };
  }

  // 4-segment form: `route:viewport:browser` or `route@viewport@browser`.
  const browser = lastSeg;
  const beforeBrowser = rawRest.slice(0, lastDelim);
  const vpDelim = Math.max(beforeBrowser.lastIndexOf(':'), beforeBrowser.lastIndexOf('@'));
  if (vpDelim === -1) return null;
  const vpSeg = beforeBrowser.slice(vpDelim + 1);
  const route = beforeBrowser.slice(0, vpDelim);
  if (!route || !browser || vpSeg === '' || !Number.isFinite(Number(vpSeg))) return null;
  return { runId, route, viewport: Number(vpSeg), browser };
}
