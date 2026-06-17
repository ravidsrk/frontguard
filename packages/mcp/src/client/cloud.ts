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

import type { FrontguardAuth } from '../auth.js';

// ---------------------------------------------------------------------------
// Wire-format types (kept loose — the cloud-api owns the source of truth).
// ---------------------------------------------------------------------------

export interface CloudRunResult {
  route: string;
  viewport: number;
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

  /** POST /v1/baselines/:runId/approve — accept the run's diffs as the new baseline. */
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
 * Stable id for a diff inside a run. The cloud-api does not currently expose
 * a per-diff primary key, so we derive one from `runId + route + viewport` —
 * agents call back with this id and we map it back to the originating run.
 */
export function diffIdFor(runId: string, result: Pick<CloudRunResult, 'route' | 'viewport'>): string {
  return `${runId}:${result.route}:${result.viewport}`;
}

/** Parse a {@link diffIdFor} string. */
export function parseDiffId(diffId: string): { runId: string; route: string; viewport: number } | null {
  const idx1 = diffId.indexOf(':');
  const idx2 = diffId.lastIndexOf(':');
  if (idx1 === -1 || idx1 === idx2) return null;
  const runId = diffId.slice(0, idx1);
  const route = diffId.slice(idx1 + 1, idx2);
  const viewport = Number(diffId.slice(idx2 + 1));
  if (!runId || !route || !Number.isFinite(viewport)) return null;
  return { runId, route, viewport };
}
