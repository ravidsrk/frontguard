import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Run } from './types.js';
import { processRun, type ProcessorEnv } from './processor.js';
import type { BaselineRestore, BaselineBucket } from './daytona-runner.js';
import { emitRunTelemetry, runMetricsFromRun, type OtelEnv } from './otel/index.js';
import { getStore, isProduction, type Bindings } from './db/factory.js';
import { currentMonth, type Store } from './db/store.js';
import { hashKey } from './auth/keys.js';
import { authRoutes } from './routes/auth.js';
import { keyRoutes } from './routes/keys.js';
import { screenshotRoutes } from './routes/screenshots.js';
import { getScreenshotStore, type R2Bucket } from './storage/screenshots.js';
import { persistScreenshots, type PendingScreenshot } from './storage/persist-screenshots.js';
import { completeCheckRun } from './github-callback.js';
import { monitorRoutes } from './routes/monitors.js';
import { dashboardRoutes, sessionDashboardRoutes } from './routes/dashboard.js';
import { hasValidSessionSecret } from './auth/session.js';
import { teamRoutes } from './routes/teams.js';
import { can } from './db/teams.js';
import { billingRoutes } from './routes/billing.js';
import { getPlan, checkLimit } from './billing/plans.js';
import { evaluateSpendCap } from './billing/spend-cap.js';
import { runScheduledChecks } from './scheduler.js';
import type { AlertEnv } from './alerts/index.js';
import { PACKAGE_VERSION } from './version.js';

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
  projectId: z.string().optional(),
  // CI linkage (Tasks 7.1/7.2): forwarded by the Vercel/GitHub integrations so
  // the run can post a PR comment and complete the originating Check Run.
  github: z
    .object({
      owner: z.string(),
      repo: z.string(),
      prNumber: z.number().int().optional(),
      commitSha: z.string().optional(),
    })
    .optional(),
  checkRunId: z.number().int().optional(),
  installationId: z.number().int().optional(),
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
app.get('/health', (c) => c.json({ status: 'ok', version: PACKAGE_VERSION }));

// ---------------------------------------------------------------------------
// Auth + API-key management routes (mounted before the /v1 guard so the OAuth
// callback and key bootstrap don't require a pre-existing key).
// ---------------------------------------------------------------------------
app.route('/auth', authRoutes);
app.route('/v1/keys', keyRoutes);
app.route('/v1/billing', billingRoutes);

// Fail closed (sec-1, cloud-4): in production the dashboard session secret MUST
// be configured (set + >= 32 chars). Without it we refuse to serve any
// dashboard route rather than silently signing `fg_session` cookies with the
// insecure fallback that ships in the published source — which would let anyone
// reading the OSS repo forge a cookie for any user. Returns 503 so an operator
// who forgot `wrangler secret put DASHBOARD_SESSION_SECRET` gets a clear signal.
// Dev/tests (no D1 `DB` binding) are unaffected and keep their no-config UX.
const requireDashboardSecret: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  if (isProduction(c.env) && !hasValidSessionSecret(c.env)) {
    return c.text('Dashboard not configured (DASHBOARD_SESSION_SECRET missing)', 503);
  }
  await next();
};
app.use('/dashboard', requireDashboardSecret);
app.use('/dashboard/*', requireDashboardSecret);

// Browser dashboard (session-cookie auth) — mounted before the /v1 guard so it
// is NOT behind the API-key requirement.
app.route('/dashboard', sessionDashboardRoutes);

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

  // Project scoping (Task 8.1): if a projectId is supplied, the caller must be
  // a member of the project's team with run_tests capability.
  let projectTeamId: string | undefined;
  if (data.projectId) {
    const project = await store.getProjectById(data.projectId);
    if (!project) return c.json({ error: 'Project not found' }, 404);
    const member = await store.getMember(project.teamId, userId);
    if (!member || !can(member.role, 'run_tests')) {
      return c.json({ error: 'Not a member of the project team' }, 403);
    }
    projectTeamId = project.teamId;
  }

  // Plan enforcement (Task 8.2): block runs that exceed the monthly limit.
  // Plan is resolved from the optional team scope, else the user's default.
  // A team's plan may only be claimed by an actual member of that team —
  // otherwise any user could pass ?teamId=<business-team> to bypass limits.
  const teamId = c.req.query('teamId');
  let planId = 'free';
  if (teamId) {
    const member = await store.getMember(teamId, userId);
    if (!member) return c.json({ error: 'Not a member of the requested team' }, 403);
    const team = await store.getTeam(teamId);
    if (team) planId = team.plan;
  } else {
    const user = await store.getUser(userId);
    if (user) planId = user.plan;
  }
  const plan = getPlan(planId);
  const usage = await store.getUsage(userId, currentMonth());
  const limitCheck = checkLimit(plan, 'runsPerMonth', usage.runsCount, 1);
  if (!limitCheck.allowed) {
    return c.json(
      {
        error: `Monthly run limit reached (${limitCheck.limit} on the ${plan.name} plan).`,
        limit: limitCheck.limit,
        current: limitCheck.current,
        upgradeUrl: 'https://frontguard.dev/pricing',
      },
      402,
    );
  }

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
    projectId: data.projectId,
    github: data.github,
    checkRunId: data.checkRunId,
    installationId: data.installationId,
  };

  await store.createRun(run, userId);
  await store.incrementUsage(userId, currentMonth(), 1, 0);

  // Spend-cap check (Task 15.7): fire an 80%/95% warning email once per tier.
  // Best-effort — failures must never block the run submission.
  try {
    const u = await store.getUser(userId);
    if (u) {
      await evaluateSpendCap(c.env ?? {}, store, u, plan, currentMonth());
    }
  } catch (err) {
    console.warn('[spend-cap] evaluation failed', err);
  }

  // Record project run submission to the team activity feed.
  if (data.projectId && projectTeamId) {
    await store.recordActivity({
      id: crypto.randomUUID(),
      teamId: projectTeamId,
      userId,
      action: 'run.submitted',
      target: runId,
      metadata: JSON.stringify({ projectId: data.projectId, url: run.url }),
      createdAt: new Date().toISOString(),
    });
  }

  // Persist screenshots produced by the sandbox to R2 + metadata store.
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  let persistedShots = 0;
  const onScreenshots = async (shots: PendingScreenshot[]): Promise<void> => {
    persistedShots = await persistScreenshots(store, blobs, userId, runId, shots);
  };

  // Resolve the project's prior approved baselines so the sandbox can detect
  // regressions instead of always emitting new_baseline (cloud-1). The route
  // metadata lives in D1 (the R2 key slug is lossy), so we read it from the
  // baseline run's screenshot records. Only when a project scope and an R2
  // binding both exist; otherwise the run proceeds baseline-free.
  let baselineRestore: BaselineRestore | undefined;
  const screenshotsBucket = c.env?.SCREENSHOTS as BaselineBucket | undefined;
  if (run.projectId && screenshotsBucket) {
    const baselineRun = await store.getProjectBaseline(run.projectId);
    if (baselineRun) {
      const baselineShots = (await store.listScreenshots(baselineRun.id)).filter(
        (s) => s.type === 'baseline',
      );
      if (baselineShots.length > 0) {
        baselineRestore = {
          bucket: screenshotsBucket,
          baselines: baselineShots.map((s) => ({
            route: s.route,
            viewport: s.viewport,
            browser: s.browser,
            r2Key: s.r2Key,
          })),
        };
      }
    }
  }

  // Process async — mutates `run`, then persists the final state. The env
  // binding carries DAYTONA_API_KEY (Workers has no Node env).
  processRun(run, (c.env ?? {}) as ProcessorEnv, onScreenshots, baselineRestore)
    .catch((err: Error) => {
      run.status = 'failed';
      run.error = err.message;
    })
    .finally(() => {
      // Meter the number of screenshots actually persisted, falling back to the
      // result count when no screenshots were captured (e.g. simulated runs).
      const screenshots = persistedShots || (run.results?.length ?? 0);
      void store.updateRun(runId, run);
      if (screenshots > 0) void store.incrementUsage(userId, currentMonth(), 0, screenshots);
      // Complete the originating GitHub Check Run, if this run came from CI.
      if (run.github) void completeCheckRun(c.env ?? {}, run);
      // Export OTLP metrics (no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set).
      void emitRunTelemetry((c.env ?? {}) as OtelEnv, runMetricsFromRun(run));
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
  const userId = c.get('userId');
  const id = c.req.param('id');
  const run = await store.getRun(id);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  // Allow access if the user owns the run directly.
  if ((await store.getRunOwner(id)) === userId) {
    return c.json(run);
  }

  // Allow access if the run belongs to a project in a team the user is a member of.
  if (run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (member) {
        return c.json(run);
      }
    }
  }

  return c.json({ error: 'Run not found' }, 404);
});

// ---------------------------------------------------------------------------
// GET /v1/runs — List runs
//
// Team-scoped (mcp-7): mirrors POST /v1/run's team handling. By default the
// caller sees their own runs plus runs from every team they belong to, so a
// personal MCP key still finds the runs a CI service account submitted under a
// shared team. An explicit `?teamId=` narrows to that team only and 403s for a
// non-member.
// ---------------------------------------------------------------------------
app.get('/v1/runs', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const teamId = c.req.query('teamId');

  if (teamId) {
    const member = await store.getMember(teamId, userId);
    if (!member) return c.json({ error: 'Not a member of the requested team' }, 403);
    const runs = await store.listRuns(userId, { teamIds: [teamId], includeOwn: false, limit: 50 });
    return c.json({ runs, total: runs.length });
  }

  const teams = await store.listTeamsForUser(userId);
  const runs = await store.listRuns(userId, { teamIds: teams.map((t) => t.id), limit: 50 });
  return c.json({ runs, total: runs.length });
});

// ---------------------------------------------------------------------------
// GET /v1/reports/:id — Get HTML report
// ---------------------------------------------------------------------------
app.get('/v1/reports/:id', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const id = c.req.param('id');
  const run = await store.getRun(id);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  // Check access: user must own the run or be a member of its project's team.
  let hasAccess = (await store.getRunOwner(id)) === userId;
  if (!hasAccess && run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (member) hasAccess = true;
    }
  }
  if (!hasAccess) return c.json({ error: 'Run not found' }, 404);

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
  const userId = c.get('userId');
  const id = c.req.param('runId');
  const run = await store.getRun(id);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  // Check access: user must own the run or be a member of its project's team.
  let hasAccess = (await store.getRunOwner(id)) === userId;
  if (!hasAccess && run.projectId) {
    const project = await store.getProjectById(run.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (member) hasAccess = true;
    }
  }
  if (!hasAccess) return c.json({ error: 'Run not found' }, 404);

  await store.updateRun(id, { baselinesApproved: true });
  return c.json({ approved: true, runId: id });
});

// ---------------------------------------------------------------------------
// DELETE /v1/runs/:id — Delete a run
// ---------------------------------------------------------------------------
app.delete('/v1/runs/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const userId = c.get('userId');
  const deleted = await store.deleteRun(id, userId);
  if (deleted) {
    // Best-effort cleanup of R2 screenshot blobs for this run.
    try {
      const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
      await blobs.deleteRun(userId, id);
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
