import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Run } from './types.js';
import { processRun } from './processor.js';

const app = new Hono();

// ---------------------------------------------------------------------------
// In-memory store (will migrate to KV / D1 later)
// ---------------------------------------------------------------------------
const runs = new Map<string, Run>();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use('*', cors());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// ---------------------------------------------------------------------------
// POST /v1/run — Submit a visual regression run
// ---------------------------------------------------------------------------
app.post('/v1/run', async (c) => {
  // Auth check
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return c.json({ error: 'Missing API key' }, 401);

  const body = await c.req.json();

  // Validate: url is required
  if (!body.url) return c.json({ error: 'url is required' }, 400);

  const runId = crypto.randomUUID();
  const run: Run = {
    id: runId,
    status: 'queued',
    url: body.url,
    routes: body.routes || [{ path: '/' }],
    viewports: body.viewports || [1440],
    browsers: body.browsers || ['chromium'],
    threshold: body.threshold || 0.01,
    ai: body.ai || null,
    createdAt: new Date().toISOString(),
    results: null,
    reportUrl: null,
  };

  // Store run
  runs.set(runId, run);

  // Process async (simulate for now — real impl would queue to worker)
  processRun(run).catch((err: Error) => {
    run.status = 'failed';
    run.error = err.message;
  });

  return c.json(
    {
      id: runId,
      status: 'queued',
      reportUrl: `/v1/reports/${runId}`,
      statusUrl: `/v1/runs/${runId}`,
    },
    202,
  );
});

// ---------------------------------------------------------------------------
// GET /v1/runs/:id — Check run status
// ---------------------------------------------------------------------------
app.get('/v1/runs/:id', (c) => {
  const run = runs.get(c.req.param('id'));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json(run);
});

// ---------------------------------------------------------------------------
// GET /v1/runs — List runs
// ---------------------------------------------------------------------------
app.get('/v1/runs', (c) => {
  const allRuns = Array.from(runs.values())
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 50);
  return c.json({ runs: allRuns, total: allRuns.length });
});

// ---------------------------------------------------------------------------
// GET /v1/reports/:id — Get HTML report
// ---------------------------------------------------------------------------
app.get('/v1/reports/:id', (c) => {
  const run = runs.get(c.req.param('id'));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  if (run.status !== 'completed') {
    return c.json({ error: 'Run not yet completed', status: run.status }, 202);
  }
  if (run.reportHtml) {
    return c.html(run.reportHtml);
  }
  return c.json({ error: 'No report available' }, 404);
});

// ---------------------------------------------------------------------------
// POST /v1/baselines/:runId/approve — Approve new baselines
// ---------------------------------------------------------------------------
app.post('/v1/baselines/:runId/approve', async (c) => {
  const run = runs.get(c.req.param('runId'));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  run.baselinesApproved = true;
  return c.json({ approved: true, runId: run.id });
});

// ---------------------------------------------------------------------------
// DELETE /v1/runs/:id — Delete a run
// ---------------------------------------------------------------------------
app.delete('/v1/runs/:id', (c) => {
  const deleted = runs.delete(c.req.param('id'));
  return c.json({ deleted });
});

// ---------------------------------------------------------------------------
// GET /v1/usage — Usage stats for API key
// ---------------------------------------------------------------------------
app.get('/v1/usage', (c) => {
  const total = runs.size;
  const screenshots = Array.from(runs.values()).reduce(
    (sum, r) => sum + (r.results?.length || 0),
    0,
  );
  return c.json({
    runs: total,
    screenshots,
    period: 'current_month',
    limits: { runs: 500, screenshots: 5000 },
  });
});

// ---------------------------------------------------------------------------
// Export — Cloudflare Workers / mogra.xyz compatible
// ---------------------------------------------------------------------------
export default app;
