/**
 * Monitor management routes (Task 6.1).
 *
 * CRUD for scheduled production monitors. Mounted after the `/v1/*` auth guard,
 * so `store` and `userId` are available on the context.
 *
 * - `GET    /v1/monitors`        → list the caller's monitors.
 * - `POST   /v1/monitors`        → create a monitor.
 * - `GET    /v1/monitors/:id`    → fetch one (owner-scoped).
 * - `PATCH  /v1/monitors/:id`    → update fields (enable/disable, interval, …).
 * - `DELETE /v1/monitors/:id`    → delete.
 *
 * @module routes/monitors
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../db/factory.js";
import type { Store } from "../db/store.js";
import type { Monitor } from "../db/monitors.js";
import {
  dispatchAlerts,
  type AlertEnv,
  type MonitorAlert,
} from "../alerts/index.js";
import { getPlan, checkLimit, hasFeature } from "../billing/plans.js";

type Variables = { store: Store; userId: string };

export const monitorRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

// Field-level validation rules, WITHOUT create-time defaults. Create layers
// defaults on top; update derives a `.partial()` from the bare base so an
// omitted PATCH field stays absent from `parsed.data`. (Zod 4 applies a field's
// `.default()` even when the field is optional, so `createSchema.partial()`
// would resurrect create defaults on omitted fields and reset stored values.)
const baseShape = {
  name: z.string().min(1).max(100),
  url: z.url(),
  routes: z.array(z.string()).min(1),
  viewports: z.array(z.number().int().min(320).max(3840)),
  intervalMinutes: z.number().int().min(5).max(10_080),
  alertThreshold: z.number().min(0).max(1),
  alerts: z
    .object({
      slack: z.url().optional(),
      email: z.array(z.email()).optional(),
      pagerduty: z.string().min(1).optional(),
    })
    .optional(),
  enabled: z.boolean(),
};

const createSchema = z.object({
  ...baseShape,
  routes: baseShape.routes.default(["/"]),
  viewports: baseShape.viewports.default([1440]),
  intervalMinutes: baseShape.intervalMinutes.default(60),
  alertThreshold: baseShape.alertThreshold.default(0.05),
  enabled: baseShape.enabled.default(true),
});

const updateSchema = z.object(baseShape).partial();

monitorRoutes.get("/", async (c) => {
  const monitors = await c.get("store").listMonitors(c.get("userId"));
  return c.json({ monitors, total: monitors.length });
});

monitorRoutes.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid monitor",
        details: z.flattenError(parsed.error).fieldErrors,
      },
      400,
    );
  }
  const store = c.get("store");
  const userId = c.get("userId");

  // Plan enforcement (Task 8.2): production monitoring is a paid feature and
  // the number of monitors is plan-capped.
  const user = await store.getUser(userId);
  const plan = getPlan(user?.plan);
  if (!hasFeature(plan, "productionMonitoring")) {
    return c.json(
      {
        error: `Production monitoring is not available on the ${plan.name} plan.`,
        upgradeUrl: "https://frontguard.dev/pricing",
      },
      402,
    );
  }
  const existing = await store.listMonitors(userId);
  const monitorLimit = checkLimit(plan, "monitors", existing.length, 1);
  if (!monitorLimit.allowed) {
    return c.json(
      {
        error: `Monitor limit reached (${monitorLimit.limit} on the ${plan.name} plan).`,
        limit: monitorLimit.limit,
        current: monitorLimit.current,
        upgradeUrl: "https://frontguard.dev/pricing",
      },
      402,
    );
  }

  const d = parsed.data;
  const monitor: Monitor = {
    id: crypto.randomUUID(),
    userId,
    name: d.name,
    url: d.url,
    routes: d.routes,
    viewports: d.viewports,
    intervalMinutes: d.intervalMinutes,
    alertThreshold: d.alertThreshold,
    alerts: d.alerts,
    enabled: d.enabled,
    createdAt: new Date().toISOString(),
  };
  await store.createMonitor(monitor);
  return c.json(monitor, 201);
});

monitorRoutes.get("/:id", async (c) => {
  const m = await c.get("store").getMonitor(c.req.param("id"));
  if (!m || m.userId !== c.get("userId"))
    return c.json({ error: "Monitor not found" }, 404);
  return c.json(m);
});

monitorRoutes.patch("/:id", async (c) => {
  const store = c.get("store");
  const id = c.req.param("id");
  const m = await store.getMonitor(id);
  if (!m || m.userId !== c.get("userId"))
    return c.json({ error: "Monitor not found" }, 404);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid update",
        details: z.flattenError(parsed.error).fieldErrors,
      },
      400,
    );
  }
  await store.updateMonitor(id, parsed.data);
  return c.json(await store.getMonitor(id));
});

monitorRoutes.delete("/:id", async (c) => {
  const deleted = await c
    .get("store")
    .deleteMonitor(c.req.param("id"), c.get("userId"));
  return c.json({ deleted });
});

// GET /v1/monitors/:id/runs — per-monitor run history (Task 6.1).
monitorRoutes.get("/:id/runs", async (c) => {
  const store = c.get("store");
  const id = c.req.param("id");
  const m = await store.getMonitor(id);
  if (!m || m.userId !== c.get("userId"))
    return c.json({ error: "Monitor not found" }, 404);
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const runs = await store.listMonitorRuns(id, limit);
  return c.json({ runs, total: runs.length });
});

// POST /v1/monitors/:id/test-alert — send a sample alert to configured channels (Task 6.2).
monitorRoutes.post("/:id/test-alert", async (c) => {
  const store = c.get("store");
  const id = c.req.param("id");
  const m = await store.getMonitor(id);
  if (!m || m.userId !== c.get("userId"))
    return c.json({ error: "Monitor not found" }, 404);
  const hasChannel =
    !!m.alerts?.slack ||
    (!!m.alerts?.email && m.alerts.email.length > 0) ||
    !!m.alerts?.pagerduty;
  if (!hasChannel) {
    return c.json(
      { error: "No alert channels configured for this monitor" },
      400,
    );
  }
  const sample: MonitorAlert[] = [
    {
      url: m.url,
      route: m.routes[0] ?? "/",
      viewport: m.viewports[0] ?? 1440,
      diffPercentage: m.alertThreshold + 0.1,
      threshold: m.alertThreshold,
    },
  ];
  // Test alerts bypass dedup/snooze on purpose (always delivered).
  const deliveries = await dispatchAlerts(c.env as AlertEnv, m, sample, fetch);
  return c.json({ sent: true, deliveries });
});

// POST /v1/monitors/:id/snooze — suppress alerts for N hours (Task 6.2).
const snoozeSchema = z.object({
  hours: z.number().min(0).max(720).default(24),
});
monitorRoutes.post("/:id/snooze", async (c) => {
  const store = c.get("store");
  const id = c.req.param("id");
  const m = await store.getMonitor(id);
  if (!m || m.userId !== c.get("userId"))
    return c.json({ error: "Monitor not found" }, 404);

  const parsed = snoozeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid snooze",
        details: z.flattenError(parsed.error).fieldErrors,
      },
      400,
    );
  }
  const existing = await store.getAlertState(id);
  const snoozedUntil =
    parsed.data.hours === 0
      ? undefined // hours=0 clears the snooze
      : new Date(Date.now() + parsed.data.hours * 3_600_000).toISOString();
  await store.setAlertState({
    monitorId: id,
    lastFingerprint: existing?.lastFingerprint,
    lastAlertAt: existing?.lastAlertAt,
    snoozedUntil,
  });
  return c.json({ snoozedUntil: snoozedUntil ?? null });
});
