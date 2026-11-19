import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Run } from "./types.js";
import { NO_COMPARISON_ERROR, processRun, type ProcessorEnv } from "./processor.js";
import type { BaselineRestore, BaselineBucket } from "./daytona-runner.js";
import {
  emitRunTelemetry,
  runMetricsFromRun,
  type OtelEnv,
} from "./otel/index.js";
import {
  getStore,
  isProduction,
  isProductionMisconfigured,
  type Bindings,
} from "./db/factory.js";
import {
  apiRateLimiter,
  clientIpFromHeaders,
  enforceRateLimit,
} from "./rate-limit.js";
import { currentMonth, type Store } from "./db/store.js";
import { hashKey } from "./auth/keys.js";
import { allocateDemoUserId } from "./auth/demo-user.js";
import {
  canUserApproveRun,
  canUserDeleteRun,
  isRunAccessibleByUser,
} from "./auth/run-access.js";
import { authRoutes } from "./routes/auth.js";
import { keyRoutes } from "./routes/keys.js";
import { screenshotRoutes } from "./routes/screenshots.js";
import { casRoutes } from "./routes/cas.js";
import { getScreenshotStore, type R2Bucket } from "./storage/screenshots.js";
import {
  persistScreenshots,
  promoteRunCurrentScreenshotsToBaseline,
  selectApprovedBaselineScreenshots,
  type PendingScreenshot,
} from "./storage/persist-screenshots.js";
import { completeCheckRun } from "./github-callback.js";
import { monitorRoutes } from "./routes/monitors.js";
import { dashboardRoutes, sessionDashboardRoutes } from "./routes/dashboard.js";
import { hasValidSessionSecret } from "./auth/session.js";
import { teamRoutes } from "./routes/teams.js";
import { can, roleAtLeast } from "./db/teams.js";
import { billingRoutes } from "./routes/billing.js";
import { checkLimit, getPlan } from "./billing/plans.js";
import {
  MAX_ROUTES,
  MAX_VIEWPORTS,
  MAX_BROWSERS,
  MAX_FAN_OUT,
  clampLimit,
  plannedScreenshotCount,
} from "./limits.js";
import { evaluateSpendCap } from "./billing/spend-cap.js";
import { runScheduledChecks } from "./scheduler.js";
import type { AlertEnv } from "./alerts/index.js";
import { PACKAGE_VERSION } from "./version.js";
import {
  SafeRenderTargetError,
  assertSafeRenderTarget,
  assertSafeRoutePaths,
} from "./security/render-target.js";
import {
  approvalsToReviewEvents,
  deriveRunPixelmatchStatus,
  evaluatePromotionGate,
} from "./review-policy.js";
import { recordDeadLetter } from "./dead-letter.js";
import { OPENAPI_SPEC } from "./openapi-spec.js";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------
type Variables = {
  apiKey: string;
  userId: string;
  store: Store;
};

/** Constant-time UTF-8 string comparison (Workers + Node safe). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost(:\d+)?$/;
const VERCEL_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ---------------------------------------------------------------------------
// Zod validation schema for POST /v1/run
// ---------------------------------------------------------------------------
const runRequestSchema = z.object({
  url: z.url("url must be a valid URL"),
  routes: z
    .array(
      z.object({
        path: z.string().min(1),
        name: z.string().optional(),
      }),
    )
    .min(1)
    .max(MAX_ROUTES)
    .optional(),
  viewports: z
    .array(z.number().int().min(320).max(3840))
    .min(1)
    .max(MAX_VIEWPORTS)
    .optional(),
  browsers: z
    .array(z.enum(["chromium", "firefox", "webkit"]))
    .min(1)
    .max(MAX_BROWSERS)
    .optional(),
  threshold: z.number().min(0).max(1).optional(),
  ai: z
    .object({
      provider: z.string().min(1),
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

const approveBaselineOptionsSchema = z
  .object({
    actorKind: z.enum(["human", "agent", "model"]).optional(),
    confirmHumanReview: z.boolean().optional(),
    judgeMode: z.boolean().optional(),
    axeBlocked: z.boolean().optional(),
    axeViolationSummary: z.string().max(500).optional(),
  })
  .optional();

// ---------------------------------------------------------------------------
// Middleware — CORS (explicit origins; localhost allowed strictly outside prod)
// ---------------------------------------------------------------------------
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = ["https://frontguard.dev", "https://www.frontguard.dev"];
      if (!origin) return origin;
      if (allowed.includes(origin)) return origin;
      if (!isProduction(c.env) && LOCALHOST_ORIGIN_RE.test(origin)) {
        return origin;
      }
      return undefined;
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Middleware — Security headers
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "0");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction(c.env)) {
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  if (!c.res.headers.has("Content-Security-Policy")) {
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
});

// ---------------------------------------------------------------------------
// Middleware — Fail closed when production is declared but DB is missing (SEC-6)
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  if (isProductionMisconfigured(c.env)) {
    return c.text(
      "Service misconfigured (DB binding missing in production)",
      503,
    );
  }
  await next();
});

// ---------------------------------------------------------------------------
// Middleware — Resolve the store for every request (D1 in prod, memory in dev)
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  c.set("store", getStore(c.env));
  await next();
});

// ---------------------------------------------------------------------------
// Health check (outside /v1/* — no auth required)
// ---------------------------------------------------------------------------
app.get("/health", (c) => c.json({ status: "ok", version: PACKAGE_VERSION }));

// Public OpenAPI contract (mirrors apps/web/public/openapi.json)
app.get("/openapi.json", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(OPENAPI_SPEC);
});

// ---------------------------------------------------------------------------
// Auth + API-key management routes (mounted before the /v1 guard so the OAuth
// callback and key bootstrap don't require a pre-existing key).
// ---------------------------------------------------------------------------
app.route("/auth", authRoutes);
app.route("/v1/keys", keyRoutes);
app.route("/v1/billing", billingRoutes);

// Fail closed (sec-1, cloud-4): in production the dashboard session secret MUST
// be configured (set + >= 32 chars). Without it we refuse to serve any
// dashboard route rather than silently signing `fg_session` cookies with the
// insecure fallback that ships in the published source — which would let anyone
// reading the OSS repo forge a cookie for any user. Returns 503 so an operator
// who forgot `wrangler secret put DASHBOARD_SESSION_SECRET` gets a clear signal.
// Dev/tests (ENVIRONMENT not set to production) keep their no-config UX.
const requireDashboardSecret: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (c, next) => {
  if (isProduction(c.env) && !hasValidSessionSecret(c.env)) {
    return c.text(
      "Dashboard not configured (DASHBOARD_SESSION_SECRET missing)",
      503,
    );
  }
  await next();
};
app.use("/dashboard", requireDashboardSecret);
app.use("/dashboard/*", requireDashboardSecret);

// Browser dashboard (session-cookie auth) — mounted before the /v1 guard so it
// is NOT behind the API-key requirement.
app.route("/dashboard", sessionDashboardRoutes);

// ---------------------------------------------------------------------------
// Middleware — Auth for all /v1/* routes
// ---------------------------------------------------------------------------
app.use("/v1/*", async (c, next) => {
  const clientIp = clientIpFromHeaders((name) => c.req.header(name));
  const apiKey = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!apiKey) {
    const blocked = enforceRateLimit(c, `unauth:${clientIp}`);
    if (blocked) return blocked;
    return c.json({ error: "Missing API key" }, 401);
  }

  const store = c.get("store");
  let userId: string;

  if (isProduction(c.env)) {
    // Production: resolve the key hash to a user.
    const keyHash = await hashKey(apiKey);
    const record = await store.getApiKey(keyHash);
    if (!record) {
      const blocked = enforceRateLimit(c, `unauth:${clientIp}`);
      if (blocked) return blocked;
      return c.json({ error: "Invalid API key" }, 401);
    }
    userId = record.userId;
    await store.touchApiKey(keyHash, new Date().toISOString());
  } else {
    // Dev / tests: accept any token and scope data to a per-token demo user.
    // After erasure the old id stays locked, so the same token gets a new id.
    userId = await allocateDemoUserId(store, apiKey);
    if (!(await store.getUser(userId))) {
      await store.createUser({
        id: userId,
        plan: "free",
        createdAt: new Date().toISOString(),
      });
    }
  }

  c.set("apiKey", apiKey);
  c.set("userId", userId);
  await next();
});

// ---------------------------------------------------------------------------
// Middleware — Rate limiting for all /v1/* routes (keyed per authenticated user)
// ---------------------------------------------------------------------------
app.use("/v1/*", async (c, next) => {
  const blocked = enforceRateLimit(c, `user:${c.get("userId")}`);
  if (blocked) return blocked;
  await next();
});

// ---------------------------------------------------------------------------
// Screenshot + monitor routes (mounted after the /v1 auth guard above).
// ---------------------------------------------------------------------------
app.route("/v1/screenshots", screenshotRoutes);
app.route("/v1/monitors", monitorRoutes);
app.route("/v1/dashboard", dashboardRoutes);
app.route("/v1/teams", teamRoutes);
app.route("/v1/cas", casRoutes);

// ---------------------------------------------------------------------------
// POST /v1/run — Submit a visual regression run
// ---------------------------------------------------------------------------
app.post("/v1/run", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    const fields = Object.keys(fieldErrors);
    return c.json(
      {
        error: `Invalid request: missing or invalid field(s): ${fields.join(", ")}`,
        details: fieldErrors,
      },
      400,
    );
  }

  const data = parsed.data;

  // Cross-service contract (#401): checkRunId / installationId may only be
  // supplied by authenticated GitHub App service-to-service requests.
  if (data.checkRunId !== undefined || data.installationId !== undefined) {
    const expectedSecret = c.env?.FRONTGUARD_CALLBACK_SECRET;
    const providedSecret = c.req.header("X-Frontguard-Callback-Secret");
    if (
      !expectedSecret ||
      !providedSecret ||
      !timingSafeEqualStr(providedSecret, expectedSecret)
    ) {
      return c.json(
        {
          error:
            "checkRunId and installationId require authenticated service-to-service authorization",
        },
        403,
      );
    }
  }

  const routes = data.routes ?? [{ path: "/" }];
  const viewports = data.viewports ?? [1440];
  const browsers = data.browsers ?? ["chromium"];

  try {
    await assertSafeRenderTarget(data.url);
    assertSafeRoutePaths(data.url, routes);
  } catch (err) {
    if (err instanceof SafeRenderTargetError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }

  const store = c.get("store");
  const userId = c.get("userId");

  if (await store.accountWritesClosed(userId)) {
    return c.json({ error: "Account erasure is in progress" }, 409);
  }

  const plannedScreenshots = plannedScreenshotCount(
    routes,
    viewports,
    browsers,
  );
  if (plannedScreenshots > MAX_FAN_OUT) {
    return c.json(
      {
        error: `Fan-out exceeds maximum (${plannedScreenshots} screenshots; limit is ${MAX_FAN_OUT}).`,
        fanOut: plannedScreenshots,
        maxFanOut: MAX_FAN_OUT,
      },
      400,
    );
  }

  // Project scoping (Task 8.1): if a projectId is supplied, the caller must be
  // a member of the project's team with run_tests capability (unless projectId
  // is a GitHub repository slug on a CI run with github metadata).
  let projectTeamId: string | undefined;
  if (data.projectId) {
    const project = await store.getProjectById(data.projectId);
    if (project) {
      const member = await store.getMember(project.teamId, userId);
      if (!member || !can(member.role, "run_tests")) {
        return c.json({ error: "Not a member of the project team" }, 403);
      }
      projectTeamId = project.teamId;
    } else if (!data.github) {
      return c.json({ error: "Project not found" }, 404);
    }
  }

  // Plan enforcement (Task 8.2, DM-3): resolve plan from team scope when present.
  // Paid team plans meter against a shared team_usage pool; personal/free runs
  // stay on the per-user counter. Reject mismatched ?teamId= vs projectId and
  // enforce run_tests capability so read-only viewers cannot bill team quota.
  const queryTeamId = c.req.query("teamId");
  if (queryTeamId && projectTeamId && queryTeamId !== projectTeamId) {
    return c.json(
      { error: "teamId does not match the project's team" },
      400,
    );
  }
  const billingTeamId = queryTeamId ?? projectTeamId;
  let planId = "free";
  if (billingTeamId) {
    const member = await store.getMember(billingTeamId, userId);
    if (!member)
      return c.json({ error: "Not a member of the requested team" }, 403);
    if (!can(member.role, "run_tests")) {
      return c.json(
        { error: "Read-only viewers cannot submit team runs" },
        403,
      );
    }
    const team = await store.getTeam(billingTeamId);
    if (team) planId = team.plan;
  } else {
    const user = await store.getUser(userId);
    if (user) planId = user.plan;
  }
  const plan = getPlan(planId);
  if (plan.id !== "free" && !billingTeamId) {
    return c.json(
      {
        error:
          "Paid plan runs require a team scope (?teamId= or projectId on a team project).",
      },
      400,
    );
  }
  const month = currentMonth();
  const meterTeam = billingTeamId != null && plan.id !== "free";

  // Gate AI classification on plan entitlement before reserving run/screenshot quota.
  const aiCallsLimit = plan.limits.aiCallsPerMonth;
  if (data.ai && aiCallsLimit === 0) {
    return c.json(
      {
        error: `AI diff classification is not available on the ${plan.name} plan.`,
        upgradeUrl: "https://frontguard.dev/pricing",
      },
      402,
    );
  }

  // Enforce monthly sandbox compute minutes cap (sandboxMinutesPerMonth) using
  // the monotonic usage counter so deleted runs cannot reset monthly usage.
  const sandboxLimit = plan.limits.sandboxMinutesPerMonth;
  if (sandboxLimit !== null) {
    const usedSandboxMinutes = meterTeam
      ? ((await store.getTeamUsage(billingTeamId!, month)).sandboxMinutesUsed ?? 0)
      : ((await store.getUsage(userId, month)).sandboxMinutesUsed ?? 0);
    const sandboxCheck = checkLimit(plan, "sandboxMinutesPerMonth", usedSandboxMinutes);
    if (!sandboxCheck.allowed) {
      return c.json(
        {
          error: `Monthly sandbox compute limit reached (${sandboxLimit} minutes on the ${plan.name} plan).`,
          limit: sandboxLimit,
          current: usedSandboxMinutes,
          upgradeUrl: "https://frontguard.dev/pricing",
        },
        402,
      );
    }
  }

  // Atomic monthly reservations (CONC-1, COST-1, DM-3): reserve the run and
  // planned screenshot count up front so concurrent submissions cannot overshoot
  // limits and giant fan-out cannot spend compute before metering.
  const runLimit = plan.limits.runsPerMonth;
  if (runLimit !== null) {
    const reserved = meterTeam
      ? await store.tryReserveTeamRun(billingTeamId!, month, runLimit)
      : await store.tryReserveRun(userId, month, runLimit);
    if (!reserved) {
      const usage = meterTeam
        ? await store.getTeamUsage(billingTeamId!, month)
        : await store.getUsage(userId, month);
      return c.json(
        {
          error: `Monthly run limit reached (${runLimit} on the ${plan.name} plan).`,
          limit: runLimit,
          current: usage.runsCount,
          upgradeUrl: "https://frontguard.dev/pricing",
        },
        402,
      );
    }
  } else if (meterTeam) {
    await store.incrementTeamUsage(billingTeamId!, month, 1, 0);
  } else {
    await store.incrementUsage(userId, month, 1, 0);
  }

  const screenshotLimit = plan.limits.screenshotsPerMonth;
  if (screenshotLimit !== null) {
    const reserved = meterTeam
      ? await store.tryReserveTeamScreenshots(
          billingTeamId!,
          month,
          screenshotLimit,
          plannedScreenshots,
        )
      : await store.tryReserveScreenshots(
          userId,
          month,
          screenshotLimit,
          plannedScreenshots,
        );
    if (!reserved) {
      if (meterTeam) {
        await store.incrementTeamUsage(billingTeamId!, month, -1, 0);
      } else {
        await store.incrementUsage(userId, month, -1, 0);
      }
      const usage = meterTeam
        ? await store.getTeamUsage(billingTeamId!, month)
        : await store.getUsage(userId, month);
      return c.json(
        {
          error: `Monthly screenshot limit reached (${screenshotLimit} on the ${plan.name} plan).`,
          limit: screenshotLimit,
          current: usage.screenshotsCount,
          requested: plannedScreenshots,
          upgradeUrl: "https://frontguard.dev/pricing",
        },
        402,
      );
    }
  } else if (plannedScreenshots > 0) {
    if (meterTeam) {
      await store.incrementTeamUsage(
        billingTeamId!,
        month,
        0,
        plannedScreenshots,
      );
    } else {
      await store.incrementUsage(userId, month, 0, plannedScreenshots);
    }
  }

  // Reserve AI classification budget when AI analysis is requested.
  if (data.ai) {
    if (aiCallsLimit !== null) {
      const reservedAi = meterTeam
        ? await store.tryReserveTeamAiCalls(
            billingTeamId!,
            month,
            aiCallsLimit,
            plannedScreenshots,
          )
        : await store.tryReserveAiCalls(
            userId,
            month,
            aiCallsLimit,
            plannedScreenshots,
          );
      if (!reservedAi) {
        if (meterTeam) {
          await store.incrementTeamUsage(
            billingTeamId!,
            month,
            -1,
            -plannedScreenshots,
          );
        } else {
          await store.incrementUsage(userId, month, -1, -plannedScreenshots);
        }
        const usage = meterTeam
          ? await store.getTeamUsage(billingTeamId!, month)
          : await store.getUsage(userId, month);
        return c.json(
          {
            error: `Monthly AI classification limit reached (${aiCallsLimit} on the ${plan.name} plan).`,
            limit: aiCallsLimit,
            current: usage.aiCallsUsed ?? 0,
            requested: plannedScreenshots,
            upgradeUrl: "https://frontguard.dev/pricing",
          },
          402,
        );
      }
    } else if (meterTeam) {
      await store.incrementTeamAiCalls(billingTeamId!, month, plannedScreenshots);
    } else {
      await store.incrementAiCalls(userId, month, plannedScreenshots);
    }
  }

  const runId = crypto.randomUUID();
  const run: Run = {
    id: runId,
    status: "queued",
    url: data.url,
    routes,
    viewports,
    browsers,
    threshold: data.threshold ?? 0.01,
    ai: data.ai
      ? { provider: data.ai.provider, model: data.ai.model ?? "" }
      : null,
    createdAt: new Date().toISOString(),
    results: null,
    reportUrl: null,
    projectId: data.projectId,
    github: data.github,
    checkRunId: data.checkRunId,
    installationId: data.installationId,
  };

  await store.createRun(run, userId);

  // Spend-cap check (Task 15.7): fire an 80%/95% warning email once per tier.
  // Best-effort — failures must never block the run submission.
  try {
    const u = await store.getUser(userId);
    if (u) {
      await evaluateSpendCap(
        c.env ?? {},
        store,
        u,
        plan,
        month,
        new Date(),
        fetch,
        meterTeam ? billingTeamId : undefined,
      );
    }
  } catch (err) {
    console.warn("[spend-cap] evaluation failed", err);
  }

  // Record project run submission to the team activity feed.
  if (data.projectId && projectTeamId) {
    await store.recordActivity({
      id: crypto.randomUUID(),
      teamId: projectTeamId,
      userId,
      action: "run.submitted",
      target: runId,
      metadata: JSON.stringify({ projectId: data.projectId, url: run.url }),
      createdAt: new Date().toISOString(),
    });
  }

  // Persist screenshots produced by the sandbox to R2 + metadata store.
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const routePaths = routes.map((r) => (typeof r === "string" ? r : r.path));
  const onScreenshots = async (shots: PendingScreenshot[]): Promise<void> => {
    await persistScreenshots(store, blobs, userId, runId, shots, routePaths);
  };

  // Resolve the project's prior approved baselines so the sandbox can detect
  // regressions instead of always emitting new_baseline (cloud-1). The route
  // metadata lives in D1 (the R2 key slug is lossy), so we read it from the
  // baseline run's screenshot records. Only when a project scope and an R2
  // binding both exist; otherwise the run proceeds baseline-free.
  let baselineRestore: BaselineRestore | undefined;
  const screenshotsBucket = c.env?.SCREENSHOTS as BaselineBucket | undefined;
  const effectiveProjectId =
    run.projectId ??
    (run.github?.owner && run.github?.repo
      ? `${run.github.owner}/${run.github.repo}`
      : undefined);
  if (effectiveProjectId && screenshotsBucket) {
    const baselineRun = await store.getProjectBaseline(effectiveProjectId, userId);
    if (baselineRun) {
      const baselineShots = selectApprovedBaselineScreenshots(
        await store.listScreenshots(baselineRun.id),
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
  // binding carries DAYTONA_API_KEY (Workers has no Node env). Keep the
  // promise alive past the 202 response via waitUntil (REL-1).
  const allowAi = Boolean(run.ai) && plan.limits.aiCallsPerMonth !== 0;
  const processing = processRun(
    run,
    (c.env ?? {}) as ProcessorEnv,
    onScreenshots,
    baselineRestore,
    { allowAi },
  )
    .catch((err: Error) => {
      run.status = "failed";
      run.error = err.message;
    })
    .finally(async () => {
      // Screenshots were reserved at submit time (COST-1).
      // A closed erasure lock parks the finished run and applies it if writes
      // reopen. A finished erasure skips the write so this cannot recreate rows.
      await store.commitFinishedRun(userId, run, async () => {
        if (run.status !== "failed") return;
        await recordDeadLetter(store, {
          kind: "run",
          sourceId: runId,
          userId,
          error: run.error ?? "background run failed",
          attempt: 1,
        });
      });

      // Record monotonic sandbox minutes so deleting runs cannot bypass caps.
      if (
        typeof run.duration === "number" &&
        Number.isFinite(run.duration) &&
        run.duration > 0
      ) {
        const minutes = Math.max(1, Math.ceil(run.duration / 60_000));
        try {
          if (meterTeam) {
            await store.addTeamSandboxMinutes(billingTeamId!, month, minutes);
          } else {
            await store.addSandboxMinutes(userId, month, minutes);
          }
        } catch {
          /* non-fatal */
        }
      }

      // Await GitHub Check Run callback & OTLP export inside waitUntil so
      // Cloudflare Workers does not terminate the isolate mid-flight.
      const sideEffects: Promise<unknown>[] = [
        emitRunTelemetry((c.env ?? {}) as OtelEnv, runMetricsFromRun(run)),
      ];
      if (run.github) {
        sideEffects.push(completeCheckRun(c.env ?? {}, run));
      }
      await Promise.allSettled(sideEffects);
    });
  try {
    c.executionCtx.waitUntil(processing);
  } catch {
    // Dev/tests without a Workers ExecutionContext (app.request) — unchanged
    // fire-and-forget path. Production fetch always supplies executionCtx.
    void processing;
  }

  return c.json(
    {
      id: runId,
      status: "queued",
      reportUrl: `/v1/reports/${runId}`,
      statusUrl: `/v1/runs/${runId}`,
    },
    202,
  );
});

// ---------------------------------------------------------------------------
// GET /v1/runs/:id — Check run status
// ---------------------------------------------------------------------------
app.get("/v1/runs/:id", async (c) => {
  const store = c.get("store");
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await isRunAccessibleByUser(store, id, userId))) {
    return c.json({ error: "Run not found" }, 404);
  }
  const run = await store.getRun(id);
  if (!run) return c.json({ error: "Run not found" }, 404);
  return c.json(run);
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
app.get("/v1/runs", async (c) => {
  const store = c.get("store");
  const userId = c.get("userId");
  const teamId = c.req.query("teamId");
  const limit = clampLimit(c.req.query("limit"), 50, 200);

  if (teamId) {
    const member = await store.getMember(teamId, userId);
    if (!member)
      return c.json({ error: "Not a member of the requested team" }, 403);
    const runs = await store.listRuns(userId, {
      teamIds: [teamId],
      includeOwn: false,
      limit,
    });
    return c.json({ runs, total: runs.length });
  }

  const teams = await store.listTeamsForUser(userId);
  const runs = await store.listRuns(userId, {
    teamIds: teams.map((t) => t.id),
    limit,
  });
  return c.json({ runs, total: runs.length });
});

// ---------------------------------------------------------------------------
// GET /v1/reports/:id — Get HTML report
// ---------------------------------------------------------------------------
app.get("/v1/reports/:id", async (c) => {
  const store = c.get("store");
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!(await isRunAccessibleByUser(store, id, userId))) {
    return c.json({ error: "Run not found" }, 404);
  }
  const run = await store.getRun(id);
  if (!run) return c.json({ error: "Run not found" }, 404);

  if (run.status !== "completed") {
    return c.json({ error: "Run not yet completed", status: run.status }, 202);
  }
  if (run.reportHtml) {
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    );
    return c.html(run.reportHtml);
  }
  return c.json({ error: "No report available" }, 404);
});

// ---------------------------------------------------------------------------
// POST /v1/baselines/:runId/approve — Approve new baselines
// ---------------------------------------------------------------------------
app.post("/v1/baselines/:runId/approve", async (c) => {
  const store = c.get("store");
  const userId = c.get("userId");
  const id = c.req.param("runId");
  const run = await store.getRun(id);
  if (!run || !(await isRunAccessibleByUser(store, id, userId))) {
    return c.json({ error: "Run not found" }, 404);
  }

  if (!(await canUserApproveRun(store, id, userId))) {
    return c.json(
      {
        error:
          "Only a designated reviewer or team admin/owner can approve baselines",
      },
      403,
    );
  }

  const rawBody = await c.req.json().catch(() => undefined);
  const parsedOpts = approveBaselineOptionsSchema.safeParse(rawBody);
  if (!parsedOpts.success) {
    return c.json({ error: "Invalid approval options" }, 400);
  }
  const opts = parsedOpts.data;

  const existingApprovals = await store.listApprovals(id);
  const nowIso = new Date().toISOString();
  const events = approvalsToReviewEvents([
    { reviewerUserId: userId, status: "approved", createdAt: nowIso },
    ...existingApprovals,
  ]);
  const gate = evaluatePromotionGate({
    reviews: events,
    actorKind: opts?.actorKind ?? "human",
    confirmHumanReview: opts?.confirmHumanReview ?? true,
    judgeMode: opts?.judgeMode ?? false,
    axeBlocked: opts?.axeBlocked ?? false,
    axeViolationSummary: opts?.axeViolationSummary,
    pixelmatchStatus: deriveRunPixelmatchStatus(run, NO_COMPARISON_ERROR),
  });
  if (!gate.allowed) {
    return c.json(
      {
        approved: false,
        runId: id,
        error: gate.reason,
        tally: gate.tally,
      },
      409,
    );
  }

  await store.updateRun(id, { baselinesApproved: true });
  await promoteRunCurrentScreenshotsToBaseline(store, id);
  return c.json({ approved: true, runId: id });
});

// ---------------------------------------------------------------------------
// DELETE /v1/account — Erase the calling account
//
// Deletes the user and the baselines, reports, and other rows that account
// owns. A different account's rows are not deleted. This does not deploy.
// ---------------------------------------------------------------------------
app.delete("/v1/account", async (c) => {
  const store = c.get("store");
  const userId = c.get("userId");
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const result = await store.eraseAccount(userId, blobs);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// DELETE /v1/runs/:id — Delete a run
// ---------------------------------------------------------------------------
app.delete("/v1/runs/:id", async (c) => {
  const store = c.get("store");
  const id = c.req.param("id");
  const userId = c.get("userId");
  const run = await store.getRun(id);
  if (!run) {
    return c.json({ deleted: false });
  }
  const ownerId = await store.getRunOwner(id);
  const allowed = await canUserDeleteRun(store, id, userId);
  if (!allowed) {
    const visibleOrFormerOwner =
      ownerId === userId || (await isRunAccessibleByUser(store, id, userId));
    if (visibleOrFormerOwner) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return c.json({ deleted: false });
  }

  const effectiveOwner = ownerId ?? userId;
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const attachments = await store.listAttachments(id);
  const deleted = await store.deleteRun(id, effectiveOwner);
  if (deleted) {
    // Best-effort cleanup of R2 screenshot and attachment blobs for this run.
    try {
      await blobs.deleteRun(effectiveOwner, id);
      for (const att of attachments) {
        await blobs.delete(att.r2Key);
      }
    } catch {
      /* non-fatal */
    }
  }
  return c.json({ deleted });
});

// ---------------------------------------------------------------------------
// GET /v1/usage — Usage stats for API key
// ---------------------------------------------------------------------------
app.get("/v1/usage", async (c) => {
  const store = c.get("store");
  const usage = await store.getUsage(c.get("userId"), currentMonth());
  return c.json({
    runs: usage.runsCount,
    screenshots: usage.screenshotsCount,
    period: "current_month",
    limits: { runs: 500, screenshots: 35000 },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/integrations/vercel/install — Register a Vercel integration install
// ---------------------------------------------------------------------------
app.post("/v1/integrations/vercel/install", async (c) => {
  const configuredSecret = c.env?.VERCEL_INTEGRATION_SECRET;
  if (configuredSecret) {
    const provided = c.req.header("X-Vercel-Integration-Secret");
    if (!provided || !timingSafeEqualStr(provided, configuredSecret)) {
      return c.json(
        { error: "Invalid Vercel integration authorization" },
        403,
      );
    }
  } else if (isProduction(c.env)) {
    return c.json({ error: "Vercel integration is not configured" }, 503);
  }

  const store = c.get("store");
  const userId = c.get("userId");
  let body: {
    configurationId?: string;
    vercelTeamId?: string | null;
    vercelUserId?: string | null;
    installationType?: string;
    teamId?: string;
    projectId?: string;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.configurationId || !VERCEL_ID_RE.test(body.configurationId)) {
    return c.json({ error: "configurationId is required and must be valid" }, 400);
  }
  if (body.vercelTeamId && !VERCEL_ID_RE.test(body.vercelTeamId)) {
    return c.json({ error: "Invalid vercelTeamId" }, 400);
  }
  if (body.vercelUserId && !VERCEL_ID_RE.test(body.vercelUserId)) {
    return c.json({ error: "Invalid vercelUserId" }, 400);
  }

  const teamKey = body.vercelTeamId ?? body.configurationId;
  const teamId = body.teamId ?? `vercel_${teamKey}`;
  const now = new Date().toISOString();
  const existing = await store.getTeam(teamId);
  if (existing) {
    // Prevent cross-tenant takeover / audit injection: caller must be an active
    // admin or owner of the existing team.
    const member = await store.getMember(teamId, userId);
    if (!member || !roleAtLeast(member.role, "admin")) {
      return c.json(
        { error: "Only team owners/admins can manage Vercel installations" },
        403,
      );
    }
  } else if (body.teamId) {
    return c.json({ error: "Team not found" }, 404);
  } else {
    await store.createTeam(
      {
        id: teamId,
        name: body.vercelTeamId
          ? `Vercel (${body.vercelTeamId})`
          : `Vercel (${body.configurationId})`,
        plan: "free",
        createdAt: now,
      },
      userId,
    );
  }

  if (body.projectId) {
    const project = await store.getProjectById(body.projectId);
    if (!project || project.teamId !== teamId) {
      return c.json({ error: "Project not found in target team" }, 404);
    }
  }

  await store.recordActivity({
    id: crypto.randomUUID(),
    teamId,
    userId,
    action: "integration.vercel.installed",
    target: body.configurationId,
    metadata: JSON.stringify({
      configurationId: body.configurationId,
      vercelTeamId: body.vercelTeamId ?? null,
      vercelUserId: body.vercelUserId ?? null,
      installationType: body.installationType ?? "external",
      ...(body.projectId ? { projectId: body.projectId } : {}),
    }),
    createdAt: now,
  });

  return c.json(
    {
      installed: true,
      teamId,
      configurationId: body.configurationId,
    },
    existing ? 200 : 201,
  );
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
          `[scheduler] checked=${res.checked} processed=${res.processed} deferred=${res.deferred} alerted=${res.alerted} errors=${res.errors}`,
        );
      }),
    );
  },
};

// Also export the Hono app for tests and embedding.
export { app, apiRateLimiter };
