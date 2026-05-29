/**
 * Dashboard route (Task 6.3).
 *
 * `GET /v1/dashboard` → server-rendered HTML monitoring dashboard for the
 * authenticated user. Mounted after the `/v1/*` auth guard.
 *
 * @module routes/dashboard
 */

import { Hono } from 'hono';
import type { Bindings } from '../db/factory.js';
import type { Store } from '../db/store.js';
import { renderDashboard } from '../dashboard/render.js';

type Variables = { store: Store; userId: string };

export const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRoutes.get('/', async (c) => {
  const store = c.get('store');
  const userId = c.get('userId');
  const [monitors, runs] = await Promise.all([store.listMonitors(userId), store.listRuns(userId, 10)]);
  return c.html(renderDashboard(monitors, runs));
});
