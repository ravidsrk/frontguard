import { describe, it, expect } from 'vitest';
import app from '../src/index.js';

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
    expect(body.version).toBe('0.1.0');
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
