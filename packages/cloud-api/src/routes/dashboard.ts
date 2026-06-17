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
import { currentMonth, type Store } from '../db/store.js';
import type { Monitor } from '../db/monitors.js';
import {
  renderDashboard,
  renderLogin,
  renderMonitorDetail,
  renderMonitorHistory,
  renderScreenshotComparison,
  renderDiffViewer,
  renderMasksSettings,
  renderRunAttachments,
  screenshotGroupKey,
  type SpendCap,
  type HistoryFilters,
} from '../dashboard/render.js';
import { flakeScore } from '../dashboard/flake.js';
import { SESSION_COOKIE, sessionSecret, verifySessionCookie } from '../auth/session.js';
import { getScreenshotStore, type R2Bucket } from '../storage/screenshots.js';
import { getPlan } from '../billing/plans.js';

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

/**
 * Computes per-monitor flake scores from each monitor's last 30 runs. Done
 * concurrently across monitors so an account with many monitors still loads
 * the dashboard quickly.
 */
async function flakeMap(store: Store, monitors: Monitor[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    monitors.map(async (m) => [m.id, flakeScore(await store.listMonitorRuns(m.id, 30))] as const),
  );
  return Object.fromEntries(entries);
}

/** Builds the dashboard's spend-cap chip from the user's plan + usage. */
async function spendCapFor(store: Store, userId: string): Promise<SpendCap | undefined> {
  const user = await store.getUser(userId);
  const plan = getPlan(user?.plan);
  const usage = await store.getUsage(userId, currentMonth());
  return { runs: usage.runsCount, runsLimit: plan.limits.runsPerMonth, planName: plan.name };
}

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
  const [monitors, runs, spend] = await Promise.all([
    store.listMonitors(userId),
    store.listRuns(userId, 10),
    spendCapFor(store, userId),
  ]);
  const flakes = await flakeMap(store, monitors);
  return c.html(renderDashboard(monitors, runs, new Date(), true, flakes, spend));
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

// GET /dashboard/monitors/:id/history — last 30 runs with filters (Task 15.1).
sessionDashboardRoutes.get('/monitors/:id/history', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (!m || m.userId !== userId) return c.html(renderLogin(), 404);
  const runs = await store.listMonitorRuns(id, 30);
  const filters: HistoryFilters = {
    status: (c.req.query('status') as HistoryFilters['status']) ?? 'all',
    attempts: (c.req.query('attempts') as HistoryFilters['attempts']) ?? 'all',
    sort: (c.req.query('sort') as HistoryFilters['sort']) ?? 'newest',
  };
  return c.html(renderMonitorHistory(m, runs, filters));
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
  const [shots, decisions, attachments] = await Promise.all([
    store.listScreenshots(runId),
    store.listScreenshotDecisions(runId),
    store.listAttachments(runId),
  ]);
  return c.html(
    renderScreenshotComparison(runId, shots, { sessioned: true, decisions, attachments }),
  );
});

// GET /dashboard/runs/:runId/diffs/:diffId — full-screen diff viewer (Task 15.3).
sessionDashboardRoutes.get('/runs/:runId/diffs/:diffId', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  const diffId = c.req.param('diffId');
  if ((await store.getRunOwner(runId)) !== userId) return c.html(renderLogin(), 404);
  const shots = await store.listScreenshots(runId);
  const diff = shots.find((s) => s.id === diffId && s.type === 'diff');
  if (!diff) return c.json({ error: 'Diff not found' }, 404);
  const groupKey = screenshotGroupKey(diff);
  const baseline = shots.find((s) => s.type === 'baseline' && screenshotGroupKey(s) === groupKey);
  const current = shots.find((s) => s.type === 'current' && screenshotGroupKey(s) === groupKey);

  // Build prev/next over the run's diff screenshots, ordered as listed.
  const diffs = shots.filter((s) => s.type === 'diff');
  const idx = diffs.findIndex((s) => s.id === diffId);
  const prev = idx > 0 ? diffs[idx - 1] : undefined;
  const next = idx >= 0 && idx < diffs.length - 1 ? diffs[idx + 1] : undefined;
  const masks = await store.listMasksForTarget(userId, diff.route, diff.viewport);

  return c.html(
    renderDiffViewer({
      runId,
      diff,
      baseline,
      current,
      prev: prev ? { id: prev.id, route: prev.route, viewport: prev.viewport } : undefined,
      next: next ? { id: next.id, route: next.route, viewport: next.viewport } : undefined,
      masks,
    }),
  );
});

// POST /dashboard/runs/:runId/diffs/:diffId/accept — record a single accept (Task 15.3).
sessionDashboardRoutes.post('/runs/:runId/diffs/:diffId/accept', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.json({ error: 'Not found' }, 404);
  const shots = await store.listScreenshots(runId);
  const diff = shots.find((s) => s.id === c.req.param('diffId') && s.type === 'diff');
  if (!diff) return c.json({ error: 'Diff not found' }, 404);
  await store.addScreenshotDecision({
    id: crypto.randomUUID(),
    screenshotId: diff.id,
    runId,
    userId,
    decision: 'accepted',
    createdAt: new Date().toISOString(),
  });
  return c.json({ ok: true, accepted: 1 });
});

// POST /dashboard/runs/:runId/diffs/:diffId/reject — record a single reject.
sessionDashboardRoutes.post('/runs/:runId/diffs/:diffId/reject', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.json({ error: 'Not found' }, 404);
  const shots = await store.listScreenshots(runId);
  const diff = shots.find((s) => s.id === c.req.param('diffId') && s.type === 'diff');
  if (!diff) return c.json({ error: 'Diff not found' }, 404);
  await store.addScreenshotDecision({
    id: crypto.randomUUID(),
    screenshotId: diff.id,
    runId,
    userId,
    decision: 'rejected',
    createdAt: new Date().toISOString(),
  });
  return c.json({ ok: true, rejected: 1 });
});

// POST /dashboard/runs/:runId/approve — bulk-accept N baselines (Task 15.4).
// Accepts diff_ids[] either from urlencoded form (browser submit) or JSON.
sessionDashboardRoutes.post('/runs/:runId/approve', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.json({ error: 'Run not found' }, 404);

  const contentType = c.req.header('Content-Type') ?? '';
  let diffIds: string[] = [];
  if (contentType.includes('application/json')) {
    const body = (await c.req.json().catch(() => ({}))) as { diff_ids?: unknown; diffIds?: unknown };
    const raw = body.diff_ids ?? body.diffIds;
    if (Array.isArray(raw)) diffIds = raw.map(String);
  } else {
    const form = await c.req.parseBody({ all: true });
    const raw = form['diff_ids'] ?? form['diff_ids[]'];
    if (Array.isArray(raw)) diffIds = raw.map(String);
    else if (typeof raw === 'string') diffIds = [raw];
  }

  if (diffIds.length === 0) {
    if (contentType.includes('application/json')) return c.json({ error: 'No diff_ids supplied' }, 400);
    return c.redirect(`/dashboard/runs/${runId}`, 302);
  }

  const shots = await store.listScreenshots(runId);
  const validDiffIds = new Set(shots.filter((s) => s.type === 'diff').map((s) => s.id));
  const accepted: string[] = [];
  for (const id of diffIds) {
    if (!validDiffIds.has(id)) continue;
    await store.addScreenshotDecision({
      id: crypto.randomUUID(),
      screenshotId: id,
      runId,
      userId,
      decision: 'accepted',
      createdAt: new Date().toISOString(),
    });
    accepted.push(id);
  }
  // If every diff was accepted, also flip the run-level baselinesApproved flag.
  if (accepted.length === validDiffIds.size) {
    await store.updateRun(runId, { baselinesApproved: true });
  }

  if (contentType.includes('application/json')) {
    return c.json({ ok: true, accepted: accepted.length, ids: accepted });
  }
  return c.redirect(`/dashboard/runs/${runId}`, 302);
});

// POST /dashboard/masks — create an ignore-region mask (Task 15.5).
sessionDashboardRoutes.post('/masks', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const form = await c.req.parseBody();
  const route = String(form.route ?? '').trim();
  const viewport = Number(form.viewport ?? 0);
  const x = Math.max(0, Math.round(Number(form.x ?? 0)));
  const y = Math.max(0, Math.round(Number(form.y ?? 0)));
  const width = Math.max(1, Math.round(Number(form.width ?? 0)));
  const height = Math.max(1, Math.round(Number(form.height ?? 0)));
  const label = form.label ? String(form.label).trim() : undefined;
  if (!route || !Number.isFinite(viewport) || viewport <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return c.json({ error: 'Invalid mask: route, viewport, width, height required' }, 400);
  }
  const mask = {
    id: crypto.randomUUID(),
    userId,
    route,
    viewport,
    x,
    y,
    width,
    height,
    label,
    createdAt: new Date().toISOString(),
  };
  await store.createMask(mask);
  return c.json({ ok: true, mask });
});

// GET /dashboard/settings/masks — list saved masks (Task 15.5).
sessionDashboardRoutes.get('/settings/masks', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const masks = await store.listMasks(userId);
  return c.html(renderMasksSettings(masks));
});

// POST /dashboard/settings/masks/:id/delete — remove a saved mask.
sessionDashboardRoutes.post('/settings/masks/:id/delete', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.redirect('/dashboard', 302);
  const store = getStore(c.env);
  await store.deleteMask(c.req.param('id'), userId);
  return c.redirect('/dashboard/settings/masks', 302);
});

// GET /dashboard/runs/:runId/attachments — attachments index (Task 15.6).
sessionDashboardRoutes.get('/runs/:runId/attachments', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.html(renderLogin());
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.html(renderLogin(), 404);
  const attachments = await store.listAttachments(runId);
  return c.html(renderRunAttachments(runId, attachments));
});

// POST /dashboard/runs/:runId/attachments — upload an attachment (multipart).
// Used by the runner / tests to register trace bundles, DOM snapshots, logs.
sessionDashboardRoutes.post('/runs/:runId/attachments', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.json({ error: 'Run not found' }, 404);

  const form = await c.req.parseBody();
  const kindRaw = String(form.kind ?? 'other');
  const allowedKinds = ['trace', 'dom-snapshot', 'console-log', 'video', 'other'] as const;
  const kind = (allowedKinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof allowedKinds)[number])
    : 'other';
  const file = form.file as unknown as File | undefined;
  const name = String(form.name ?? (file && 'name' in file ? file.name : 'attachment'));
  if (!file || typeof file === 'string') return c.json({ error: 'Missing file' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const r2Key = `${userId}/${runId}/attachments/${crypto.randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  await blobs.put(r2Key, bytes);

  const att = {
    id: crypto.randomUUID(),
    runId,
    kind,
    name,
    r2Key,
    contentType: (file as { type?: string }).type || undefined,
    sizeBytes: bytes.byteLength,
    createdAt: new Date().toISOString(),
  };
  await store.addAttachment(att);
  return c.json({ ok: true, attachment: att });
});

// GET /dashboard/runs/:runId/attachments/:id/download — stream R2 bytes back.
sessionDashboardRoutes.get('/runs/:runId/attachments/:id/download', async (c) => {
  const userId = await verifySessionCookie(getCookie(c, SESSION_COOKIE), sessionSecret(c.env));
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const store = getStore(c.env);
  const runId = c.req.param('runId');
  if ((await store.getRunOwner(runId)) !== userId) return c.json({ error: 'Run not found' }, 404);
  const att = await store.getAttachment(c.req.param('id'));
  if (!att || att.runId !== runId) return c.json({ error: 'Attachment not found' }, 404);
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const bytes = await blobs.get(att.r2Key);
  if (!bytes) return c.json({ error: 'Attachment bytes not available' }, 404);
  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': att.contentType ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${att.name.replace(/"/g, '')}"`,
    'Cache-Control': 'private, max-age=3600',
  });
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
