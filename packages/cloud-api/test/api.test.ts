import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Stub the daytona-runner before importing the app — pulling in the real
// module loads the Daytona SDK (and transitively the `ws` package, which
// isn't present in this Workers-targeted package). The Daytona-routing test
// below drives this mock to assert the real diff path is wired up.
const executeInSandbox = vi.fn();
vi.mock('../src/daytona-runner.js', () => ({ executeInSandbox }));

import { app } from '../src/index.js';
import { createSqliteD1 } from './helpers/sqlite-d1.js';

const PKG_VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
).version as string;

/**
 * Helper — fire a request against the Hono app with a default Bearer token.
 * Any string satisfies the auth check in the current implementation.
 */
const request = (path: string, init?: RequestInit) =>
  app.request(path, {
    ...init,
    headers: {
      Authorization: 'Bearer test-api-key',
      ...init?.headers,
    },
  });

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  // P2-3: /health used to hardcode "0.1.0" while everything else shipped as
  // 0.2.x — anyone polling the API saw stale-looking infra. Sourcing from
  // package.json keeps the health endpoint aligned with the canonical version
  // automatically.
  it('reports the package.json version (P2-3)', async () => {
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.version).toBe(PKG_VERSION);
    expect(body.version).not.toBe('0.1.0');
  });
});

// ---------------------------------------------------------------------------
// OpenAPI contract
// ---------------------------------------------------------------------------
describe('GET /openapi.json', () => {
  it('returns the public OpenAPI document without auth', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths['/health']).toBeDefined();
    expect(body.paths['/v1/run']).toBeDefined();
    expect(body.paths['/auth']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/run — create a visual regression run
// ---------------------------------------------------------------------------
describe('POST /v1/run', () => {
  it('rejects requests without Authorization header (401)', async () => {
    const res = await app.request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('API key');
  });

  it('rejects requests without a url field (400)', async () => {
    const res = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('url');
  });

  it('creates a run and returns 202 with id + queued status', async () => {
    const res = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    expect(body.status).toBe('queued');
    expect(body.reportUrl).toContain(body.id);
    expect(body.statusUrl).toContain(body.id);
  });

  it('rejects ?teamId for a team the caller is not a member of (no plan bypass)', async () => {
    const { getMemoryStore } = await import('../src/db/factory.js');
    // Create a business team owned by someone else.
    const teamRes = await request('/v1/teams', {
      method: 'POST',
      body: JSON.stringify({ name: 'BizCo' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer team-owner' },
    });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'business' });

    // A different caller tries to inherit the business plan via teamId → 403.
    const res = await app.request(`/v1/run?teamId=${teamId}`, {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer outsider' },
    });
    expect(res.status).toBe(403);
  });

  it('applies default routes, viewports, browsers, and threshold', async () => {
    const createRes = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { id } = await createRes.json();

    // Give the async processRun a tick to finish
    await new Promise((r) => setTimeout(r, 50));

    const getRes = await request(`/v1/runs/${id}`);
    const run = await getRes.json();
    expect(run.routes).toEqual([{ path: '/' }]);
    expect(run.viewports).toEqual([1440]);
    expect(run.browsers).toEqual(['chromium']);
    expect(run.threshold).toBe(0.01);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/runs — list runs
// ---------------------------------------------------------------------------
describe('GET /v1/runs', () => {
  it('returns an array of runs', async () => {
    const res = await request('/v1/runs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toBeDefined();
    expect(Array.isArray(body.runs)).toBe(true);
    expect(typeof body.total).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/runs/:id — single run status
// ---------------------------------------------------------------------------
describe('GET /v1/runs/:id', () => {
  it('returns 404 for unknown run', async () => {
    const res = await request('/v1/runs/nonexistent-id');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns the run after creation', async () => {
    const createRes = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { id } = await createRes.json();

    const getRes = await request(`/v1/runs/${id}`);
    expect(getRes.status).toBe(200);
    const run = await getRes.json();
    expect(run.id).toBe(id);
    expect(run.url).toBe('https://example.com');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/reports/:id — HTML report
// ---------------------------------------------------------------------------
describe('GET /v1/reports/:id', () => {
  it('returns 404 for unknown run', async () => {
    const res = await request('/v1/reports/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns HTML report after processing completes', async () => {
    const createRes = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { id } = await createRes.json();

    // Wait for async processRun to finish
    await new Promise((r) => setTimeout(r, 100));

    const reportRes = await request(`/v1/reports/${id}`);
    // Should be 200 with HTML content
    expect(reportRes.status).toBe(200);
    const html = await reportRes.text();
    expect(html).toContain('<!DOCTYPE html>');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/usage — usage stats
// ---------------------------------------------------------------------------
describe('GET /v1/usage', () => {
  it('returns usage stats with limits', async () => {
    const res = await request('/v1/usage');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.runs).toBe('number');
    expect(typeof body.screenshots).toBe('number');
    expect(body.period).toBe('current_month');
    expect(body.limits).toBeDefined();
    expect(body.limits.runs).toBe(500);
    expect(body.limits.screenshots).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/runs/:id — delete a run
// ---------------------------------------------------------------------------
describe('DELETE /v1/runs/:id', () => {
  it('deletes an existing run and returns deleted: true', async () => {
    // Create
    const createRes = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { id } = await createRes.json();

    // Delete
    const deleteRes = await request(`/v1/runs/${id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.deleted).toBe(true);

    // Verify gone
    const getRes = await request(`/v1/runs/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('returns deleted: false for unknown run', async () => {
    const res = await request('/v1/runs/does-not-exist', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/run — Daytona pipeline wiring (IN-2 / P0-6)
// ---------------------------------------------------------------------------
//
// When the Worker env binds DAYTONA_API_KEY, the run must execute the real
// sandbox pipeline — not the simulated path. The shim previously deployed
// at app/src/index.js bypassed this entirely and produced Math.random()
// diffs; this test guards the unified entry against the same regression.
describe('POST /v1/run — Daytona binding routes to the real pipeline', () => {
  it('hands a real diff result back when env.DAYTONA_API_KEY is set', async () => {
    // Drive the top-level vi.mock — the real Daytona SDK is never loaded.
    // The returned diff is intentionally non-zero and non-random; the old
    // shim emitted +(Math.random() * 5).toFixed(2) for every comparison and
    // this test would fail against that path.
    executeInSandbox.mockReset();
    executeInSandbox.mockResolvedValue({
      results: [
        { route: '/', viewport: 1440, browser: 'chromium', status: 'changed', diffPercentage: 4.21, classification: 'regression', timestamp: new Date().toISOString() },
      ],
      reportHtml: '<html>real</html>',
      duration: 42,
      screenshots: [],
    });

    const createRes = await app.request(
      '/v1/run',
      {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer daytona-caller' },
      },
      { DAYTONA_API_KEY: 'dt_test_key' },
    );
    expect(createRes.status).toBe(202);
    const { id } = await createRes.json();

    // Give processRun a tick to finish.
    await new Promise((r) => setTimeout(r, 50));

    const getRes = await app.request(`/v1/runs/${id}`, {
      headers: { Authorization: 'Bearer daytona-caller' },
    });
    const run = await getRes.json();
    expect(run.status).toBe('completed');
    expect(run.results).toHaveLength(1);
    expect(run.results[0].diffPercentage).toBe(4.21);
    expect(run.results[0].classification).toBe('regression');
    expect(executeInSandbox).toHaveBeenCalledOnce();
    expect(executeInSandbox.mock.calls[0]![0]).toMatchObject({ daytonaApiKey: 'dt_test_key' });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/baselines/:runId/approve — approve baselines
// ---------------------------------------------------------------------------
describe('POST /v1/baselines/:runId/approve', () => {
  it('returns 404 for unknown run', async () => {
    const res = await request('/v1/baselines/no-such-run/approve', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('approves baselines for an existing run', async () => {
    const createRes = await request('/v1/run', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { id } = await createRes.json();

    const res = await request(`/v1/baselines/${id}/approve`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toBe(true);
    expect(body.runId).toBe(id);

    // Verify flag set on the run
    const getRes = await request(`/v1/runs/${id}`);
    const run = await getRes.json();
    expect(run.baselinesApproved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dashboard fail-closed guard (sec-1, cloud-4)
// ---------------------------------------------------------------------------
//
// In production (a real D1 `DB` binding present) the dashboard MUST refuse to
// serve unless `DASHBOARD_SESSION_SECRET` is configured with a real >= 32-char
// value. Otherwise cookies would be signed with the insecure fallback that
// ships in published source — a forge-any-user's-session vulnerability.
describe('GET /dashboard — production session-secret fail-closed', () => {
  // SEC-6: production requires ENVIRONMENT=production (not DB presence alone).
  const prodEnv = (secret?: string) => ({
    ENVIRONMENT: 'production' as const,
    DB: createSqliteD1().db,
    ...(secret ? { DASHBOARD_SESSION_SECRET: secret } : {}),
  });
  const STRONG_SECRET = 'a'.repeat(40);

  it('returns 503 with the configured message when the secret is missing in prod', async () => {
    const res = await app.request('/dashboard', {}, prodEnv());
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('Dashboard not configured (DASHBOARD_SESSION_SECRET missing)');
  });

  it('returns 503 when the secret is set but shorter than 32 chars in prod', async () => {
    const res = await app.request('/dashboard', {}, prodEnv('too-short-secret'));
    expect(res.status).toBe(503);
  });

  it('fails closed on dashboard sub-paths too (POST /dashboard/monitors)', async () => {
    const res = await app.request('/dashboard/monitors', { method: 'POST' }, prodEnv());
    expect(res.status).toBe(503);
  });

  it('serves the dashboard (login page) in prod when a strong secret is set', async () => {
    const res = await app.request('/dashboard', {}, prodEnv(STRONG_SECRET));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('serves the dashboard in dev (ENVIRONMENT unset) without any secret configured', async () => {
    const res = await app.request('/dashboard');
    expect(res.status).toBe(200);
  });
});
