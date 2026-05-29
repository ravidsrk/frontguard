import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Run } from './types.js';
import { processRun } from './processor.js';
import { getStore, isProduction, type Bindings } from './db/factory.js';
import { currentMonth, type Store } from './db/store.js';
import { hashKey } from './auth/keys.js';
import { authRoutes } from './routes/auth.js';
import { keyRoutes } from './routes/keys.js';
import { screenshotRoutes } from './routes/screenshots.js';
import { getScreenshotStore, type R2Bucket } from './storage/screenshots.js';
import { monitorRoutes } from './routes/monitors.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { teamRoutes } from './routes/teams.js';
import { runScheduledChecks } from './scheduler.js';
import type { AlertEnv } from './alerts/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Variables = {
  apiKey: string;
  userId: string;
  store: Store;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
      const allowed = [
        'https://frontguard.dev',
        'https://www.frontguard.dev',
        'https://docs.frontguard.dev',
      ];
      if (!origin) return origin;
      if (origin.startsWith('http://localhost:')) return origin;
      if (allowed.includes(origin)) return origin;
      return undefined;
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
// Middleware — Resolve the store for every request (D1 in prod, memory in dev)
// ---------------------------------------------------------------------------
app.use('*', async (c, next) => {
  c.set('store', getStore(c.env));
  await next();
});

// ---------------------------------------------------------------------------
// Health check (outside /v1/* — no auth required)
// ---------------------------------------------------------------------------
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// ---------------------------------------------------------------------------
// Auth + API-key management routes (mounted before the /v1 guard so the OAuth
// callback and key bootstrap don't require a pre-existing key).
// ---------------------------------------------------------------------------
app.route('/auth', authRoutes);
app.route('/v1/keys', keyRoutes);

// ---------------------------------------------------------------------------
// Middleware — Auth for all /v1/* routes
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey) return c.json({ error: 'Missing API key' }, 401);

  const store = c.get('store');
  let userId: string;

  if (isProduction(c.env)) {
    // Production: resolve the key hash to a user.
    const keyHash = await hashKey(apiKey);
    const record = await store.getApiKey(keyHash);
    if (!record) return c.json({ error: 'Invalid API key' }, 401);
    userId = record.userId;
    await store.touchApiKey(keyHash, new Date().toISOString());
  } else {
    // Dev / tests: accept any token and scope data to a per-token demo user.
    userId = `demo:${await hashKey(apiKey)}`;
    if (!(await store.getUser(userId))) {
      await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });
    }
  }

  c.set('apiKey', apiKey);
  c.set('userId', userId);
  await next();
});

// ---------------------------------------------------------------------------
// Middleware — Rate limiting for all /v1/* routes
// ---------------------------------------------------------------------------
app.use('/v1/*', async (c, next) => {
  const apiKey = c.get('apiKey');
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
// Screenshot + monitor routes (mounted after the /v1 auth guard above).
// ---------------------------------------------------------------------------
app.route('/v1/screenshots', screenshotRoutes);
app.route('/v1/monitors', monitorRoutes);
app.route('/v1/dashboard', dashboardRoutes);
app.route('/v1/teams', teamRoutes);

// ---------------------------------------------------------------------------
// POST /v1/run — Submit a visual regression run
// ---------------------------------------------------------------------------
app.post('/v1/run', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const fields = Object.keys(fieldErrors);
    return c.json(
      {
        error: `Invalid request: missing or invalid field(s): ${fields.join(', ')}`,
        details: fieldErrors,
      },
      400,
    );
  }

  const data = parsed.data;
  const store = c.get('store');
  const userId = c.get('userId');
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

  await store.createRun(run, userId);
  await store.incrementUsage(userId, currentMonth(), 1, 0);

  // Process async — mutates `run`, then persists the final state.
  processRun(run)
    .catch((err: Error) => {
      run.status = 'failed';
      run.error = err.message;
    })
    .finally(() => {
      const screenshots = run.results?.length ?? 0;
      void store.updateRun(runId, run);
      if (screenshots > 0) void store.incrementUsage(userId, currentMonth(), 0, screenshots);
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
app.get('/v1/runs/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const run = await store.getRun(id);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  if ((await store.getRunOwner(id)) !== c.get('userId')) {
    return c.json({ error: 'Run not found' }, 404);
  }
  return c.json(run);
});

// ---------------------------------------------------------------------------
// GET /v1/runs — List runs
// ---------------------------------------------------------------------------
app.get('/v1/runs', async (c) => {
  const store = c.get('store');
  const allRuns = await store.listRuns(c.get('userId'), 50);
  return c.json({ runs: allRuns, total: allRuns.length });
});

// ---------------------------------------------------------------------------
// GET /v1/reports/:id — Get HTML report
// ---------------------------------------------------------------------------
app.get('/v1/reports/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const run = await store.getRun(id);
  if (!run || (await store.getRunOwner(id)) !== c.get('userId')) {
    return c.json({ error: 'Run not found' }, 404);
  }
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
  const store = c.get('store');
  const id = c.req.param('runId');
  const run = await store.getRun(id);
  if (!run || (await store.getRunOwner(id)) !== c.get('userId')) {
    return c.json({ error: 'Run not found' }, 404);
  }
  await store.updateRun(id, { baselinesApproved: true });
  return c.json({ approved: true, runId: id });
});

// ---------------------------------------------------------------------------
// DELETE /v1/runs/:id — Delete a run
// ---------------------------------------------------------------------------
app.delete('/v1/runs/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const deleted = await store.deleteRun(id, c.get('userId'));
  if (deleted) {
    // Best-effort cleanup of R2 screenshot blobs for this run.
    try {
      const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
      await blobs.deleteRun(id);
    } catch {
      /* non-fatal */
    }
  }
  return c.json({ deleted });
});

// ---------------------------------------------------------------------------
// GET /v1/usage — Usage stats for API key
// ---------------------------------------------------------------------------
app.get('/v1/usage', async (c) => {
  const store = c.get('store');
  const usage = await store.getUsage(c.get('userId'), currentMonth());
  return c.json({
    runs: usage.runsCount,
    screenshots: usage.screenshotsCount,
    period: 'current_month',
    limits: { runs: 500, screenshots: 5000 },
  });
});

// ---------------------------------------------------------------------------
// Export — Cloudflare Workers compatible (fetch + scheduled cron, Task 6.1)
// ---------------------------------------------------------------------------

/** Minimal Workers types to avoid a @cloudflare/workers-types dependency. */
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: app.fetch,
  /** Cron trigger — runs due monitors. */
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings & AlertEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runScheduledChecks(env).then((res) => {
        console.log(
          `[scheduler] checked=${res.checked} alerted=${res.alerted} errors=${res.errors}`,
        );
      }),
    );
  },
};

// Also export the Hono app for tests and embedding.
export { app };
