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

import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
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
import {
  CSRF_FIELD,
  CSRF_HEADER,
  SESSION_COOKIE,
  createCsrfToken,
  sessionSecret,
  verifyCsrfToken,
  verifySessionCookie,
} from '../auth/session.js';
import {
  canUserApproveRun,
  canUserMutateRun,
  isRunAccessibleByUser,
} from '../auth/run-access.js';
import { getScreenshotStore, type R2Bucket } from '../storage/screenshots.js';
import { promoteRunCurrentScreenshotsToBaseline } from '../storage/persist-screenshots.js';
import { checkLimit, getPlan, hasFeature, highestPlanId } from '../billing/plans.js';
import {
  SafeRenderTargetError,
  assertSafeRenderTarget,
  assertSafeRoutePaths,
  assertSafeSlackWebhookUrl,
} from '../security/render-target.js';
import {
  MAX_ALERT_EMAILS,
  MAX_ATTACHMENTS_PER_RUN,
  MAX_ATTACHMENT_BYTES,
  MAX_FAN_OUT,
  MAX_ROUTES,
} from '../limits.js';
import { clientIpFromHeaders, enforceRateLimit } from '../rate-limit.js';
import {
  approvalsToReviewEvents,
  deriveRunPixelmatchStatus,
  evaluatePromotionGate,
} from '../review-policy.js';
import { NO_COMPARISON_ERROR } from '../processor.js';

type Variables = { store: Store; userId: string };

const emailValidator = z.email();

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildDashboardCsp(cspNonce?: string): string {
  const scriptSrc = cspNonce ? `'nonce-${cspNonce}'` : "'none'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function renderHtmlWithCsp(
  c: Context,
  html: string,
  status: 200 | 404 = 200,
  cspNonce?: string,
): Response {
  c.header('Content-Security-Policy', buildDashboardCsp(cspNonce));
  return c.html(html, status);
}

/** Sanitizes an attachment filename for safe use inside Content-Disposition. */
function sanitizeDownloadFilename(raw: string): string {
  const base = raw
    .replace(/[\r\n\x00-\x1f\x7f]/g, '')
    .replace(/["\\/]/g, '_')
    .trim()
    .slice(0, 200);
  return base || 'attachment';
}

/** Downgrades active web document MIME types to `application/octet-stream` on download. */
function safeDownloadContentType(raw: string | undefined): string {
  if (!raw) return 'application/octet-stream';
  const lower = raw.toLowerCase();
  if (
    lower.includes('html') ||
    lower.includes('svg') ||
    lower.includes('javascript') ||
    lower.includes('xml') ||
    lower.includes('xhtml')
  ) {
    return 'application/octet-stream';
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Read-only dashboard (API-key guarded, mounted at /v1/dashboard).
// ---------------------------------------------------------------------------
export const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRoutes.get('/', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const [monitors, runs] = await Promise.all([
    store.listMonitors(userId),
    store.listRuns(userId, { limit: 10 }),
  ]);
  return renderHtmlWithCsp(c, renderDashboard(monitors, runs));
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
  const teams = await store.listTeamsForUser(userId);
  const bestTeam = teams.reduce<(typeof teams)[number] | undefined>((best, t) => {
    if (!best) return t;
    return highestPlanId([best.plan, t.plan]) === t.plan && t.plan !== best.plan ? t : best;
  }, undefined);
  const plan = getPlan(highestPlanId([user?.plan, bestTeam?.plan]));
  const month = currentMonth();
  const usage = await store.getUsage(userId, month);
  let runsCount = usage.runsCount;
  if (bestTeam) {
    const teamUsage = await store.getTeamUsage(bestTeam.id, month);
    runsCount = Math.max(runsCount, teamUsage.runsCount);
  }
  return { runs: runsCount, runsLimit: plan.limits.runsPerMonth, planName: plan.name };
}

// ---------------------------------------------------------------------------
// Browser dashboard (session-cookie auth, mounted at /dashboard).
// ---------------------------------------------------------------------------
export const sessionDashboardRoutes = new Hono<{ Bindings: Bindings }>();

type DashboardSession =
  | { ok: true; userId: string; sessionCookie: string; csrfToken: string; store: Store }
  | { ok: false; rateLimited?: Response };

/**
 * Verifies the `fg_session` cookie, confirms the user record still exists
 * (immediately invalidating sessions for erased/deleted accounts), enforces
 * per-user / per-IP rate limiting, and derives the session's CSRF token.
 */
async function resolveDashboardSession(
  c: Context<{ Bindings: Bindings }>,
): Promise<DashboardSession> {
  const clientIp = clientIpFromHeaders((name) => c.req.header(name));
  const sessionCookie = getCookie(c, SESSION_COOKIE);
  const secret = sessionSecret(c.env);
  const userId = await verifySessionCookie(sessionCookie, secret);

  if (!userId || !sessionCookie) {
    const blocked = enforceRateLimit(c, `dash:${clientIp}`);
    return { ok: false, rateLimited: blocked ?? undefined };
  }

  const store = getStore(c.env);
  const user = await store.getUser(userId);
  if (!user) {
    const blocked = enforceRateLimit(c, `dash:${clientIp}`);
    return { ok: false, rateLimited: blocked ?? undefined };
  }

  const blocked = enforceRateLimit(c, `user:${userId}`);
  if (blocked) {
    return { ok: false, rateLimited: blocked };
  }

  const csrfToken = await createCsrfToken(sessionCookie, secret);
  return { ok: true, userId, sessionCookie, csrfToken, store };
}

/** Checks Fetch Metadata (`Sec-Fetch-Site`) and `Origin` headers against cross-site POSTs. */
function checkSameOriginHeaders(c: Context<{ Bindings: Bindings }>): Response | null {
  const secFetchSite = c.req.header('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return c.json({ error: 'Cross-site request rejected' }, 403);
  }
  const origin = c.req.header('origin');
  if (origin) {
    const reqOrigin = new URL(c.req.url).origin;
    let apiOrigin: string | null = null;
    if (c.env?.API_BASE_URL) {
      try {
        apiOrigin = new URL(c.env.API_BASE_URL).origin;
      } catch {
        apiOrigin = null;
      }
    }
    if (origin !== reqOrigin && origin !== apiOrigin) {
      return c.json({ error: 'Cross-origin request rejected' }, 403);
    }
  }
  return null;
}

/** Verifies the session-bound CSRF token from `X-CSRF-Token` header or `_csrf` body field. */
async function verifyDashboardCsrf(
  c: Context<{ Bindings: Bindings }>,
  sessionCookie: string,
  bodyToken?: unknown,
): Promise<Response | null> {
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;

  let token: string | undefined = c.req.header(CSRF_HEADER);
  if (!token && typeof bodyToken === 'string') {
    token = bodyToken;
  }
  if (!token) {
    const ct = c.req.header('content-type') ?? '';
    if (
      bodyToken === undefined &&
      (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data'))
    ) {
      const form = await c.req.parseBody().catch(() => ({}));
      const raw = (form as Record<string, unknown>)[CSRF_FIELD];
      if (typeof raw === 'string') token = raw;
    }
  }
  if (!token || !(await verifyCsrfToken(sessionCookie, token, sessionSecret(c.env)))) {
    return c.json({ error: 'Invalid or missing CSRF token' }, 403);
  }
  return null;
}

/** Parses comma-separated values into a trimmed, non-empty string array. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Validates an email list for dashboard monitor forms. */
function validateAlertEmails(emails: string[]): string | null {
  if (emails.length > MAX_ALERT_EMAILS) {
    return `Too many alert emails (maximum ${MAX_ALERT_EMAILS})`;
  }
  for (const addr of emails) {
    if (!emailValidator.safeParse(addr).success) {
      return `Invalid alert email address: ${addr}`;
    }
  }
  return null;
}

// GET /dashboard — login page or the interactive dashboard.
sessionDashboardRoutes.get('/', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store, csrfToken } = session;
  const [monitors, runs, spend] = await Promise.all([
    store.listMonitors(userId),
    store.listRuns(userId, { limit: 10 }),
    spendCapFor(store, userId),
  ]);
  const flakes = await flakeMap(store, monitors);
  return renderHtmlWithCsp(
    c,
    renderDashboard(monitors, runs, new Date(), true, flakes, spend, { csrfToken }),
  );
});

// POST /dashboard/monitors — create a monitor from form fields.
sessionDashboardRoutes.post('/monitors', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;

  const { userId, sessionCookie, store } = session;
  const form = await c.req.parseBody();
  const csrfRejection = await verifyDashboardCsrf(c, sessionCookie, form[CSRF_FIELD]);
  if (csrfRejection) return csrfRejection;

  if (await store.accountWritesClosed(userId)) {
    return c.json({ error: 'Account erasure is in progress' }, 409);
  }

  const name = String(form.name ?? '').trim();
  const url = String(form.url ?? '').trim();
  if (!name || !url) return c.redirect('/dashboard', 302);
  if (name.length > 100) {
    return c.json({ error: 'Monitor name must be 100 characters or fewer' }, 400);
  }

  // Enforce the same plan & quota gates as POST /v1/monitors.
  const user = await store.getUser(userId);
  const plan = getPlan(user?.plan);
  if (!hasFeature(plan, 'productionMonitoring')) {
    return c.json(
      {
        error: `Production monitoring is not available on the ${plan.name} plan.`,
        upgradeUrl: 'https://frontguard.dev/pricing',
      },
      402,
    );
  }
  const existing = await store.listMonitors(userId);
  const monitorLimit = checkLimit(plan, 'monitors', existing.length, 1);
  if (!monitorLimit.allowed) {
    return c.json(
      {
        error: `Monitor limit reached (${monitorLimit.limit} on the ${plan.name} plan).`,
        limit: monitorLimit.limit,
        current: monitorLimit.current,
        upgradeUrl: 'https://frontguard.dev/pricing',
      },
      402,
    );
  }

  const parsedRoutes = parseList(String(form.routes ?? ''));
  const routes = parsedRoutes.length ? parsedRoutes : ['/'];
  if (routes.length > MAX_ROUTES || routes.length > MAX_FAN_OUT) {
    return c.json({ error: `Monitor routes exceed maximum of ${MAX_ROUTES}` }, 400);
  }

  const rawInterval = form.intervalMinutes !== undefined && String(form.intervalMinutes).trim() !== ''
    ? Number(form.intervalMinutes)
    : 60;
  if (!Number.isInteger(rawInterval) || rawInterval < 5 || rawInterval > 10_080) {
    return c.json({ error: 'Interval must be an integer between 5 and 10080 minutes' }, 400);
  }

  const slack = String(form.slack ?? '').trim();
  const email = parseList(String(form.email ?? ''));
  const emailErr = validateAlertEmails(email);
  if (emailErr) return c.json({ error: emailErr }, 400);

  try {
    await assertSafeRenderTarget(url);
    assertSafeRoutePaths(url, routes);
    if (slack) {
      await assertSafeSlackWebhookUrl(slack);
    }
  } catch (err) {
    if (err instanceof SafeRenderTargetError) {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: 'Invalid monitor URL' }, 400);
  }

  const requestedThreshold = Number(form.alertThreshold ?? 0.05);
  const alertThreshold =
    Number.isFinite(requestedThreshold) && requestedThreshold >= 0 && requestedThreshold <= 1
      ? requestedThreshold
      : 0.05;

  const alerts =
    slack || email.length
      ? { ...(slack ? { slack } : {}), ...(email.length ? { email } : {}) }
      : undefined;

  const monitor: Monitor = {
    id: crypto.randomUUID(),
    userId,
    name,
    url,
    routes,
    viewports: [1440],
    intervalMinutes: rawInterval,
    alertThreshold,
    alerts,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await store.createMonitor(monitor);
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/toggle — enable/disable.
sessionDashboardRoutes.post('/monitors/:id/toggle', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie);
  if (csrfRejection) return csrfRejection;
  const { userId, store } = session;
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    await store.updateMonitor(id, { enabled: !m.enabled });
  }
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/delete — delete (owner-scoped).
sessionDashboardRoutes.post('/monitors/:id/delete', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie);
  if (csrfRejection) return csrfRejection;
  await session.store.deleteMonitor(c.req.param('id'), session.userId);
  return c.redirect('/dashboard', 302);
});

// POST /dashboard/monitors/:id/alerts — update alert config.
sessionDashboardRoutes.post('/monitors/:id/alerts', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;
  const form = await c.req.parseBody();
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie, form[CSRF_FIELD]);
  if (csrfRejection) return csrfRejection;

  const { userId, store } = session;
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    const slack = String(form.slack ?? '').trim();
    const email = parseList(String(form.email ?? ''));
    const emailErr = validateAlertEmails(email);
    if (emailErr) return c.json({ error: emailErr }, 400);
    if (slack) {
      try {
        await assertSafeSlackWebhookUrl(slack);
      } catch (err) {
        if (err instanceof SafeRenderTargetError) {
          return c.json({ error: err.message }, 400);
        }
        return c.json({ error: 'Invalid Slack webhook URL' }, 400);
      }
    }
    const threshold = Number(form.alertThreshold);
    const alerts =
      slack || email.length
        ? { ...(slack ? { slack } : {}), ...(email.length ? { email } : {}) }
        : undefined;
    const patch: Partial<Monitor> = { alerts };
    if (Number.isFinite(threshold) && threshold >= 0 && threshold <= 1) {
      patch.alertThreshold = threshold;
    }
    await store.updateMonitor(id, patch);
  }
  return c.redirect(`/dashboard/monitors/${encodeURIComponent(id)}`, 302);
});

// POST /dashboard/monitors/:id/snooze — suppress alerts for N hours.
sessionDashboardRoutes.post('/monitors/:id/snooze', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;
  const form = await c.req.parseBody();
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie, form[CSRF_FIELD]);
  if (csrfRejection) return csrfRejection;

  const { userId, store } = session;
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (m && m.userId === userId) {
    const hours = Number(form.hours ?? 24);
    if (!Number.isFinite(hours) || hours < 0 || hours > 720) {
      return c.json({ error: 'Snooze hours must be between 0 and 720' }, 400);
    }
    const existing = await store.getAlertState(id);
    const snoozedUntil =
      hours === 0 ? undefined : new Date(Date.now() + hours * 3_600_000).toISOString();
    await store.setAlertState({
      monitorId: id,
      lastFingerprint: existing?.lastFingerprint,
      lastAlertAt: existing?.lastAlertAt,
      snoozedUntil,
    });
  }
  return c.redirect(`/dashboard/monitors/${encodeURIComponent(id)}`, 302);
});

// GET /dashboard/monitors/:id — per-monitor detail with run timeline.
sessionDashboardRoutes.get('/monitors/:id', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store, csrfToken } = session;
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (!m || m.userId !== userId) return renderHtmlWithCsp(c, renderLogin(), 404);
  const [runs, alertState] = await Promise.all([
    store.listMonitorRuns(id, 50),
    store.getAlertState(id),
  ]);
  return renderHtmlWithCsp(c, renderMonitorDetail(m, runs, new Date(), alertState, { csrfToken }));
});

// GET /dashboard/monitors/:id/history — last 30 runs with filters (Task 15.1).
sessionDashboardRoutes.get('/monitors/:id/history', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store } = session;
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (!m || m.userId !== userId) return renderHtmlWithCsp(c, renderLogin(), 404);
  const runs = await store.listMonitorRuns(id, 30);
  const filters: HistoryFilters = {
    status: (c.req.query('status') as HistoryFilters['status']) ?? 'all',
    attempts: (c.req.query('attempts') as HistoryFilters['attempts']) ?? 'all',
    sort: (c.req.query('sort') as HistoryFilters['sort']) ?? 'newest',
  };
  return renderHtmlWithCsp(c, renderMonitorHistory(m, runs, filters));
});

// GET /dashboard/runs/:runId — screenshot comparison view.
sessionDashboardRoutes.get('/runs/:runId', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store, csrfToken } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) {
    return renderHtmlWithCsp(c, renderLogin(), 404);
  }
  const [shots, decisions, attachments, run] = await Promise.all([
    store.listScreenshots(runId),
    store.listScreenshotDecisions(runId),
    store.listAttachments(runId),
    store.getRun(runId),
  ]);
  const cspNonce = generateCspNonce();
  return renderHtmlWithCsp(
    c,
    renderScreenshotComparison(runId, shots, {
      sessioned: true,
      decisions,
      attachments,
      run,
      csrfToken,
      cspNonce,
    }),
    200,
    cspNonce,
  );
});

// GET /dashboard/runs/:runId/diffs/:diffId — full-screen diff viewer (Task 15.3).
sessionDashboardRoutes.get('/runs/:runId/diffs/:diffId', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store, csrfToken } = session;
  const runId = c.req.param('runId');
  const diffId = c.req.param('diffId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) {
    return renderHtmlWithCsp(c, renderLogin(), 404);
  }
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
  const cspNonce = generateCspNonce();

  return renderHtmlWithCsp(
    c,
    renderDiffViewer({
      runId,
      diff,
      baseline,
      current,
      prev: prev ? { id: prev.id, route: prev.route, viewport: prev.viewport } : undefined,
      next: next ? { id: next.id, route: next.route, viewport: next.viewport } : undefined,
      masks,
      csrfToken,
      cspNonce,
    }),
    200,
    cspNonce,
  );
});

// POST /dashboard/runs/:runId/diffs/:diffId/accept — record a single accept (Task 15.3).
sessionDashboardRoutes.post('/runs/:runId/diffs/:diffId/accept', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie);
  if (csrfRejection) return csrfRejection;
  const { userId, store } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) return c.json({ error: 'Not found' }, 404);
  if (!(await canUserApproveRun(store, runId, userId))) return c.json({ error: 'Forbidden' }, 403);
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
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie);
  if (csrfRejection) return csrfRejection;
  const { userId, store } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) return c.json({ error: 'Not found' }, 404);
  if (!(await canUserApproveRun(store, runId, userId))) return c.json({ error: 'Forbidden' }, 403);
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
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;

  const { userId, sessionCookie, store } = session;
  const runId = c.req.param('runId');
  const contentType = c.req.header('Content-Type') ?? '';
  let diffIds: string[] = [];
  let bodyCsrf: unknown;
  if (contentType.includes('application/json')) {
    const body = (await c.req.json().catch(() => ({}))) as {
      diff_ids?: unknown;
      diffIds?: unknown;
      _csrf?: unknown;
    };
    bodyCsrf = body._csrf;
    const raw = body.diff_ids ?? body.diffIds;
    if (Array.isArray(raw)) diffIds = raw.map(String);
  } else {
    const form = await c.req.parseBody({ all: true });
    bodyCsrf = Array.isArray(form[CSRF_FIELD]) ? form[CSRF_FIELD][0] : form[CSRF_FIELD];
    const raw = form['diff_ids'] ?? form['diff_ids[]'];
    if (Array.isArray(raw)) diffIds = raw.map(String);
    else if (typeof raw === 'string') diffIds = [raw];
  }

  const csrfRejection = await verifyDashboardCsrf(c, sessionCookie, bodyCsrf);
  if (csrfRejection) return csrfRejection;

  if (!(await isRunAccessibleByUser(store, runId, userId))) return c.json({ error: 'Run not found' }, 404);
  if (!(await canUserApproveRun(store, runId, userId))) return c.json({ error: 'Forbidden' }, 403);

  // Deduplicate diff IDs so repeating one ID N times can never satisfy
  // `accepted.length === validDiffIds.size`.
  const uniqueDiffIds = [...new Set(diffIds)];
  if (uniqueDiffIds.length === 0) {
    if (contentType.includes('application/json')) return c.json({ error: 'No diff_ids supplied' }, 400);
    return c.redirect(`/dashboard/runs/${encodeURIComponent(runId)}`, 302);
  }

  const shots = await store.listScreenshots(runId);
  const validDiffIds = new Set(shots.filter((s) => s.type === 'diff').map((s) => s.id));
  const accepted: string[] = [];
  for (const id of uniqueDiffIds) {
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

  // If every diff was accepted, evaluate the multi-user review promotion gate
  // before flipping the run-level baselinesApproved flag.
  let promoted = false;
  if (validDiffIds.size > 0 && accepted.length === validDiffIds.size) {
    const run = await store.getRun(runId);
    const existingApprovals = await store.listApprovals(runId);
    const nowIso = new Date().toISOString();
    const events = approvalsToReviewEvents([
      {
        reviewerUserId: userId,
        status: 'approved',
        createdAt: nowIso,
      },
      ...existingApprovals,
    ]);
    const gate = evaluatePromotionGate({
      reviews: events,
      actorKind: 'human',
      confirmHumanReview: true,
      pixelmatchStatus: run ? deriveRunPixelmatchStatus(run, NO_COMPARISON_ERROR) : 'pass',
    });
    if (!gate.allowed) {
      if (contentType.includes('application/json')) {
        return c.json({ ok: false, promoted: false, error: gate.reason, tally: gate.tally }, 409);
      }
      return c.json({ error: gate.reason }, 409);
    }
    await store.updateRun(runId, { baselinesApproved: true });
    await promoteRunCurrentScreenshotsToBaseline(store, runId);
    promoted = true;
  }

  if (contentType.includes('application/json')) {
    return c.json({ ok: true, accepted: accepted.length, ids: accepted, promoted });
  }
  return c.redirect(`/dashboard/runs/${encodeURIComponent(runId)}`, 302);
});

// POST /dashboard/masks — create an ignore-region mask (Task 15.5).
sessionDashboardRoutes.post('/masks', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;
  const form = await c.req.parseBody();
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie, form[CSRF_FIELD]);
  if (csrfRejection) return csrfRejection;

  const { userId, store } = session;
  if (await store.accountWritesClosed(userId)) {
    return c.json({ error: 'Account erasure is in progress' }, 409);
  }
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
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store, csrfToken } = session;
  const masks = await store.listMasks(userId);
  return renderHtmlWithCsp(c, renderMasksSettings(masks, new Date(), { csrfToken }));
});

// POST /dashboard/settings/masks/:id/delete — remove a saved mask.
sessionDashboardRoutes.post('/settings/masks/:id/delete', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.redirect('/dashboard', 302);
  const csrfRejection = await verifyDashboardCsrf(c, session.sessionCookie);
  if (csrfRejection) return csrfRejection;
  await session.store.deleteMask(c.req.param('id'), session.userId);
  return c.redirect('/dashboard/settings/masks', 302);
});

// GET /dashboard/runs/:runId/attachments — attachments index (Task 15.6).
sessionDashboardRoutes.get('/runs/:runId/attachments', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? renderHtmlWithCsp(c, renderLogin());
  const { userId, store } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) {
    return renderHtmlWithCsp(c, renderLogin(), 404);
  }
  const attachments = await store.listAttachments(runId);
  return renderHtmlWithCsp(c, renderRunAttachments(runId, attachments));
});

// POST /dashboard/runs/:runId/attachments — upload an attachment (multipart).
// Used by the runner / tests to register trace bundles, DOM snapshots, logs.
sessionDashboardRoutes.post('/runs/:runId/attachments', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const originRejection = checkSameOriginHeaders(c);
  if (originRejection) return originRejection;

  const { userId, sessionCookie, store } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) return c.json({ error: 'Run not found' }, 404);
  if (!(await canUserMutateRun(store, runId, userId))) return c.json({ error: 'Forbidden' }, 403);
  if (await store.accountWritesClosed(userId)) {
    return c.json({ error: 'Account erasure is in progress' }, 409);
  }

  // Enforce attachment size cap BEFORE buffering the multipart body into isolate RAM.
  const contentLengthHeader = c.req.header('content-length');
  if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_BYTES + 64 * 1024) {
      return c.json(
        { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_BYTES} bytes` },
        413,
      );
    }
  }

  const form = await c.req.parseBody();
  const csrfRejection = await verifyDashboardCsrf(c, sessionCookie, form[CSRF_FIELD]);
  if (csrfRejection) return csrfRejection;

  const existingAttachments = await store.listAttachments(runId);
  if (existingAttachments.length >= MAX_ATTACHMENTS_PER_RUN) {
    return c.json(
      { error: `Maximum ${MAX_ATTACHMENTS_PER_RUN} attachments per run reached` },
      400,
    );
  }

  const kindRaw = String(form.kind ?? 'other');
  const allowedKinds = ['trace', 'dom-snapshot', 'console-log', 'video', 'other'] as const;
  const kind = (allowedKinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof allowedKinds)[number])
    : 'other';
  const file = form.file as unknown as File | undefined;
  const name = sanitizeDownloadFilename(
    String(form.name ?? (file && 'name' in file ? file.name : 'attachment')),
  );
  if (!file || typeof file === 'string') return c.json({ error: 'Missing file' }, 400);
  if (typeof file.size === 'number' && file.size > MAX_ATTACHMENT_BYTES) {
    return c.json(
      { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_BYTES} bytes` },
      413,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return c.json(
      { error: `Attachment exceeds maximum size of ${MAX_ATTACHMENT_BYTES} bytes` },
      413,
    );
  }

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
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const { userId, store } = session;
  const runId = c.req.param('runId');
  if (!(await isRunAccessibleByUser(store, runId, userId))) return c.json({ error: 'Run not found' }, 404);
  const att = await store.getAttachment(c.req.param('id'));
  if (!att || att.runId !== runId) return c.json({ error: 'Attachment not found' }, 404);
  const blobs = getScreenshotStore(c.env?.SCREENSHOTS as R2Bucket | undefined);
  const bytes = await blobs.get(att.r2Key);
  if (!bytes) return c.json({ error: 'Attachment bytes not available' }, 404);
  const safeName = sanitizeDownloadFilename(att.name);
  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': safeDownloadContentType(att.contentType),
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
});

// GET /dashboard/screenshots/:runId/:id/raw — session-authed raw image bytes.
sessionDashboardRoutes.get('/screenshots/:runId/:id/raw', async (c) => {
  const session = await resolveDashboardSession(c);
  if (!session.ok) return session.rateLimited ?? c.json({ error: 'Unauthorized' }, 401);
  const { userId, store } = session;
  const runId = c.req.param('runId');
  const id = c.req.param('id');
  if (!(await isRunAccessibleByUser(store, runId, userId))) {
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
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400',
  });
});
