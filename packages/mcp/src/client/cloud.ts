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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FrontguardAuth } from '../auth.js';

// ---------------------------------------------------------------------------
// Wire-format types (kept loose — the cloud-api owns the source of truth).
// ---------------------------------------------------------------------------

export interface CloudRunResult {
  route: string;
  viewport: number;
  /** Browser engine (chromium/firefox/webkit). Disambiguates multi-browser runs. */
  browser?: string;
  status: string;
  diffPercentage: number;
  classification?: string;
  timestamp: string;
  suggestedFix?: CloudSuggestedFix;
  /** Stable id assigned by the cloud-api when present; we synthesize one otherwise. */
  diffId?: string;
}

export interface CloudSuggestedFix {
  fixType: 'css' | 'html' | 'config';
  category: string;
  patch: string;
  confidence: number;
  explanation: string;
  target?: string;
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

  constructor(
    private readonly auth: FrontguardAuth,
    opts: CloudClientOptions = {},
  ) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
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

/** Reads a local `@frontguard/cli` JSON report file and normalizes it into a {@link CloudRun}. */
export function loadLocalReportAsRun(reportPath: string): CloudRun {
  const rawText = readFileSync(reportPath, 'utf8');
  const parsed = JSON.parse(rawText) as unknown;
  const now = new Date().toISOString();

  if (Array.isArray(parsed)) {
    const results: CloudRunResult[] = parsed.map((item: Record<string, unknown>) => ({
      route: String(item.route ?? '/'),
      viewport: Number(item.viewport ?? 1440),
      ...(item.browser ? { browser: String(item.browser) } : {}),
      status: String(item.status ?? 'unchanged'),
      diffPercentage: Number(item.diffPercentage ?? 0),
      ...(item.classification ? { classification: String(item.classification) } : {}),
      timestamp: String(item.timestamp ?? now),
      ...(item.suggestedFix ? { suggestedFix: item.suggestedFix as CloudSuggestedFix } : {}),
      ...(item.diffId ? { diffId: String(item.diffId) } : {}),
    }));
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
  const rawResults = (
    Array.isArray(obj.results) ? obj.results : Array.isArray(obj.diffs) ? obj.diffs : []
  ) as Array<Record<string, unknown>>;
  const results: CloudRunResult[] = rawResults.map((item) => ({
    route: String(item.route ?? '/'),
    viewport: Number(item.viewport ?? 1440),
    ...(item.browser ? { browser: String(item.browser) } : {}),
    status: String(item.status ?? 'unchanged'),
    diffPercentage: Number(item.diffPercentage ?? 0),
    ...(item.classification ? { classification: String(item.classification) } : {}),
    timestamp: String(item.timestamp ?? obj.createdAt ?? obj.timestamp ?? now),
    ...(item.suggestedFix ? { suggestedFix: item.suggestedFix as CloudSuggestedFix } : {}),
    ...(item.diffId ? { diffId: String(item.diffId) } : {}),
  }));

  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : 'run_local',
    status: 'completed',
    url: typeof obj.url === 'string' ? obj.url : typeof obj.baseUrl === 'string' ? obj.baseUrl : 'http://localhost',
    createdAt:
      typeof obj.createdAt === 'string'
        ? obj.createdAt
        : typeof obj.timestamp === 'string'
          ? obj.timestamp
          : now,
    results,
    reportUrl: typeof obj.reportUrl === 'string' ? obj.reportUrl : reportPath,
    ...(obj.github ? { github: obj.github as CloudRun['github'] } : {}),
  };
}

/** Creates a {@link CloudClient}-compatible adapter backed by a local CLI report file. */
export function createLocalReportClient(reportPath: string): CloudClient {
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
      return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 });
    }
    if (method === 'POST' && /^\/v1\/baselines\/[^/]+\/approve$/.test(url.pathname)) {
      return new Response(JSON.stringify({ approved: true, runId: run.id }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  return new CloudClient({ apiKey: 'local', apiUrl: 'http://frontguard.local' }, { fetch: localFetch });
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
  const rest = diffId.slice(first + 1); // `route…:viewport[:browser]`
  if (!runId || !rest) return null;

  const lastColon = rest.lastIndexOf(':');
  if (lastColon === -1) return null; // need at least `route:viewport`

  const lastSeg = rest.slice(lastColon + 1);
  const lastIsNumeric = lastSeg !== '' && Number.isFinite(Number(lastSeg));

  if (lastIsNumeric) {
    // 3-segment legacy form: `route:viewport`.
    const route = rest.slice(0, lastColon);
    if (!route) return null;
    return { runId, route, viewport: Number(lastSeg) };
  }

  // 4-segment form: `route:viewport:browser`.
  const browser = lastSeg;
  const beforeBrowser = rest.slice(0, lastColon); // `route:viewport`
  const vpColon = beforeBrowser.lastIndexOf(':');
  if (vpColon === -1) return null;
  const vpSeg = beforeBrowser.slice(vpColon + 1);
  const route = beforeBrowser.slice(0, vpColon);
  if (!route || !browser || vpSeg === '' || !Number.isFinite(Number(vpSeg))) return null;
  return { runId, route, viewport: Number(vpSeg), browser };
}
