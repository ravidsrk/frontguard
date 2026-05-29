/**
 * Dashboard routes (Task 6.3).
 *
 * Two surfaces share the same renderer:
 *
 * - {@link dashboardRoutes} — read-only HTML, mounted at `/v1/dashboard` behind
 *   the API-key guard (back-compat).
 * - {@link sessionDashboardRoutes} — the browser dashboard, mounted at
 *   `/dashboard` (NOT behind the `/v1` guard). Authenticates via the signed
 *   `fg_session` cookie and provides interactive CRUD, a screenshot comparison
 *   view, per-monitor run timelines, and alert configuration.
 *
 * @module routes/dashboard
 */

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings } from '../db/factory.js';
import { getStore } from '../db/factory.js';
import type { Store } from '../db/store.js';
import type { Monitor } from '../db/monitors.js';
import {
  renderDashboard,
  renderLogin,
  renderMonitorDetail,
  renderScreenshotComparison,
} from '../dashboard/render.js';
import { SESSION_COOKIE, sessionSecret, verifySessionCookie } from '../auth/session.js';
import { getScreenshotStore, type R2Bucket } from '../storage/screenshots.js';

type Variables = { store: Store; userId: string };

// ---------------------------------------------------------------------------
// Read-only dashboard (API-key guarded, mounted at /v1/dashboard).
// ---------------------------------------------------------------------------
export const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRoutes.get('/', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const [monitors, runs] = await Promise.all([store.listMonitors(userId), store.listRuns(userId, 10)]);
  return c.html(renderDashboard(monitors, runs));
});

// ---------------------------------------------------------------------------
// Browser dashboard (session-cookie auth, mounted at /dashboard).
// ---------------------------------------------------------------------------
export const sessionDashboardRoutes = new Hono<{ Bindings: Bindings }>();

/** Parses comma-separated values into a trimmed, non-empty string array. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// GET /dashboard — login page or the interactive dashboard.
sessionDashboardRoutes.get('/', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const [monitors, runs] = await Promise.all([store.listMonitors(userId), store.listRuns(userId, 10)]);
  return c.html(renderDashboard(monitors, runs, new Date(), true));
});

// POST /dashboard/monitors — create a monitor from form fields.
sessionDashboardRoutes.post('/monitors', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  const form = await c.req.parseBody();

  const name = String(form.name ?? '').trim();
  const url = String(form.url ?? '').trim();
  if (!name || !url) return c.redirect('/dashboard', 302);

  const routes = parseList(String(form.routes ?? ''));
  const slack = String(form.slack ?? '').trim();
  const email = parseList(String(form.email ?? ''));
  const intervalMinutes = Number(form.intervalMinutes ?? 60) || 60;
  const alertThreshold = Number(form.alertThreshold ?? 0.05);

  const alerts =
    slack || email.length
      ? { ...(slack ? { slack } : {}), ...(email.length ? { email } : {}) }
      : undefined;

  const monitor: Monitor = {
    id: crypto.randomUUID(),
    userId,
    name,
    url,
    routes: routes.length ? routes : ['/'],
    viewports: [1440],
    intervalMinutes,
    alertThreshold: Number.isFinite(alertThreshold) ? alertThreshold : 0.05,
    alerts,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await store.createMonitor(monitor);
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/toggle — enable/disable.
sessionDashboardRoutes.post('/monitors/:id/toggle', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    await store.updateMonitor(id, { enabled: !m.enabled });
  }
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/delete — delete (owner-scoped).
sessionDashboardRoutes.post('/monitors/:id/delete', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  await store.deleteMonitor(c.req.param('id'), userId);
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/alerts — update alert config.
sessionDashboardRoutes.post('/monitors/:id/alerts', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    const form = await c.req.parseBody();
    const slack = String(form.slack ?? '').trim();
    const email = parseList(String(form.email ?? ''));
    const threshold = Number(form.alertThreshold);
    const alerts =
      slack || email.length
        ? { ...(slack ? { slack } : {}), ...(email.length ? { email } : {}) }
        : undefined;
    const patch: Partial<Monitor> = { alerts };
    if (Number.isFinite(threshold)) patch.alertThreshold = threshold;
    await store.updateMonitor(id, patch);
  }
  return c.redirect(`/dashboard/monitors/${id}`, 302);
});

// POST /dashboard/monitors/:id/snooze — suppress alerts for N hours.
sessionDashboardRoutes.post('/monitors/:id/snooze', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    const form = await c.req.parseBody();
    const hours = Number(form.hours ?? 24);
    const existing = await store.getAlertState(id);
    const snoozedUntil =
      !Number.isFinite(hours) || hours <= 0
        ? undefined
        : new Date(Date.now() + hours * 3_600_000).toISOString();
    await store.setAlertState({
      monitorId: id,
      lastFingerprint: existing?.lastFingerprint,
      lastAlertAt: existing?.lastAlertAt,
      snoozedUntil,
    });
  }
  return c.redirect(`/dashboard/monitors/${id}`, 302);
});

// GET /dashboard/monitors/:id — per-monitor detail with run timeline.
sessionDashboardRoutes.get('/monitors/:id', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (!m || m.userId !== userId) return c.html(renderLogin(), 404);
  const runs = await store.listMonitorRuns(id, 50);
  return c.html(renderMonitorDetail(m, runs));
});

// GET /dashboard/runs/:runId — screenshot comparison view.
sessionDashboardRoutes.get('/runs/:runId', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) {
    return c.html(renderLogin(), 404);
  }
  const shots = await store.listScreenshots(runId);
  return c.html(renderScreenshotComparison(runId, shots));
});

// GET /dashboard/screenshots/:runId/:id/raw — session-authed raw image bytes.
sessionDashboardRoutes.get('/screenshots/:runId/:id/raw', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  const id = c.req.param('id');
  if ((await store.getRunOwner(runId)) !== userId) {
    return c.json({ error: 'Run not found' }, 404);
  }
  const shots = await store.listScreenshots(runId);
  const meta = shots.find((s) => s.id === id);
  if (!meta) return c.json({ error: 'Screenshot not found' }, 404);

  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const bytes = await blobs.get(meta.r2Key);
  if (!bytes) return c.json({ error: 'Image data not available' }, 404);

  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'private, max-age=86400',
  });
});
