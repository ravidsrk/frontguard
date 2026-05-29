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

import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings } from '../db/factory.js';
import type { Store } from '../db/store.js';
import type { Monitor } from '../db/monitors.js';

type Variables = { store: Store; userId: string };

export const monitorRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  routes: z.array(z.string()).min(1).default(['/']),
  viewports: z.array(z.number().int().min(320).max(3840)).default([1440]),
  intervalMinutes: z.number().int().min(5).max(10_080).default(60),
  alertThreshold: z.number().min(0).max(1).default(0.05),
  alerts: z
    .object({
      slack: z.string().url().optional(),
      email: z.array(z.string().email()).optional(),
    })
    .optional(),
  enabled: z.boolean().default(true),
});

const updateSchema = createSchema.partial();

monitorRoutes.get('/', async (c) => {
  const monitors = await c.get('store').listMonitors(c.get('userId'));
  return c.json({ monitors, total: monitors.length });
});

monitorRoutes.post('/', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Invalid monitor', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const d = parsed.data;
  const monitor: Monitor = {
    id: crypto.randomUUID(),
    userId: c.get('userId'),
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
  await c.get('store').createMonitor(monitor);
  return c.json(monitor, 201);
});

monitorRoutes.get('/:id', async (c) => {
  const m = await c.get('store').getMonitor(c.req.param('id'));
  if (!m || m.userId !== c.get('userId')) return c.json({ error: 'Monitor not found' }, 404);
  return c.json(m);
});

monitorRoutes.patch('/:id', async (c) => {
  const store = c.get('store');
  const id = c.req.param('id');
  const m = await store.getMonitor(id);
  if (!m || m.userId !== c.get('userId')) return c.json({ error: 'Monitor not found' }, 404);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Invalid update', details: parsed.error.flatten().fieldErrors }, 400);
  }
  await store.updateMonitor(id, parsed.data);
  return c.json(await store.getMonitor(id));
});

monitorRoutes.delete('/:id', async (c) => {
  const deleted = await c.get('store').deleteMonitor(c.req.param('id'), c.get('userId'));
  return c.json({ deleted });
});
