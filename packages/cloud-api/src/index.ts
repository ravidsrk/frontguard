import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Run } from './types.js';
import { processRun } from './processor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Variables = {
  apiKey: string;
};

const app = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// In-memory store (will migrate to KV / D1 later)
// ---------------------------------------------------------------------------
const runs = new Map<string, Run>();

// ---------------------------------------------------------------------------
// Simple rate limiter - 100 requests per minute per API key
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// ---------------------------------------------------------------------------
// Zod validation schema for POST /v1/run
// ---------------------------------------------------------------------------
const runRequestSchema = z.object({
  url: z.string().url('url must be a valid URL'),
  routes: z
    .array(
      z.object({
        path: z.string(),
        name: z.string().optional(),
      }),
    )
    .optional(),
  viewports: z.array(z.number().int().min(320).max(3840)).optional(),
  browsers: z.array(z.enum(['chromium', 'firefox', 'webkit'])).optional(),
  threshold: z.number().min(0).max(1).optional(),
  ai: z
    .object({
      provider: z.string(),
      model: z.string().optional(),
    })
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Middleware — CORS (explicit origins)
// ---------------------------------------------------------------------------
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow frontguard.dev, localhost dev, and Fly.io previews
      const allowed = [
        'https://frontguard.dev',
        'https://www.frontguard.dev',
        'https://docs.frontguard.dev',
      ];
      if (!origin) return origin; // Allow non-browser requests (CLI, curl)
      if (origin.startsWith('http://localhost:')) return origin; // Local dev
      if (allowed.includes(origin)) return origin;
      return undefined; // Block others
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Middleware — Security headers
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '0');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
});

// ---------------------------------------------------------------------------
// Middleware — Auth for all /v1/* routes
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return c.json({ error: 'Missing API key' }, 401);
  // Store for downstream use
  c.set('apiKey', apiKey);
  await next();
});

// ---------------------------------------------------------------------------
// Middleware — Rate limiting for all /v1/* routes
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const apiKey = c.get('apiKey') as string;
  const now = Date.now();
  const window = 60_000; // 1 minute
  const limit = 100;

  let entry = rateLimitMap.get(apiKey);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + window };
    rateLimitMap.set(apiKey, entry);
  }

  entry.count++;
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
  c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > limit) {
    return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
  }

  await next();
});

// ---------------------------------------------------------------------------
// Health check (outside /v1/* — no auth required)
// ---------------------------------------------------------------------------
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// ---------------------------------------------------------------------------
// POST /v1/run — Submit a visual regression run
// ---------------------------------------------------------------------------
app.post('/v1/run', async (c) => {
  const body = await c.req.json();

  // Validate request body with Zod
  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid request',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const data = parsed.data;
  const runId = crypto.randomUUID();
  const run: Run = {
    id: runId,
    status: 'queued',
    url: data.url,
    routes: data.routes || [{ path: '/' }],
    viewports: data.viewports || [1440],
    browsers: data.browsers || ['chromium'],
    threshold: data.threshold || 0.01,
    ai: data.ai ? { provider: data.ai.provider, model: data.ai.model ?? '' } : null,
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
