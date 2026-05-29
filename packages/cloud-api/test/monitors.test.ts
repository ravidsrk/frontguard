import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../src/db/store.js';
import { isMonitorDue, type Monitor } from '../src/db/monitors.js';
import { app } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 'm1',
    userId: 'u1',
    name: 'Home',
    url: 'https://example.com',
    routes: ['/'],
    viewports: [1440],
    intervalMinutes: 60,
    alertThreshold: 0.05,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('isMonitorDue', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('is due when never run', () => {
    expect(isMonitorDue(makeMonitor(), now)).toBe(true);
  });
  it('is not due when disabled', () => {
    expect(isMonitorDue(makeMonitor({ enabled: false }), now)).toBe(false);
  });
  it('is due when interval has elapsed', () => {
    expect(isMonitorDue(makeMonitor({ lastRunAt: '2026-01-01T10:30:00Z' }), now)).toBe(true);
  });
  it('is not due before interval elapses', () => {
    expect(isMonitorDue(makeMonitor({ lastRunAt: '2026-01-01T11:30:00Z' }), now)).toBe(false);
  });
});

describe('InMemoryStore monitors', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('creates, lists, updates, deletes monitors', async () => {
    await store.createMonitor(makeMonitor());
    expect((await store.listMonitors('u1')).length).toBe(1);
    await store.updateMonitor('m1', { enabled: false });
    expect((await store.getMonitor('m1'))?.enabled).toBe(false);
    expect(await store.deleteMonitor('m1', 'u2')).toBe(false);
    expect(await store.deleteMonitor('m1', 'u1')).toBe(true);
  });

  it('lists only due monitors', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    await store.createMonitor(makeMonitor({ id: 'due', lastRunAt: '2026-01-01T10:00:00Z' }));
    await store.createMonitor(makeMonitor({ id: 'fresh', lastRunAt: '2026-01-01T11:59:00Z' }));
    await store.createMonitor(makeMonitor({ id: 'off', enabled: false }));
    const due = await store.listDueMonitors(now);
    expect(due.map((m) => m.id)).toEqual(['due']);
  });
});

describe('/v1/monitors routes (dev mode)', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t = 'owner') => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('creates and lists a monitor', async () => {
    const createRes = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'Prod home', url: 'https://example.com', routes: ['/', '/pricing'] }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.routes).toEqual(['/', '/pricing']);
    expect(created.intervalMinutes).toBe(60);

    const listRes = await app.request('/v1/monitors', { headers: auth() });
    expect((await listRes.json()).total).toBe(1);
  });

  it('rejects invalid monitor config', async () => {
    const res = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: '', url: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });

  it('updates and deletes a monitor', async () => {
    const createRes = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ name: 'M', url: 'https://example.com' }),
    });
    const { id } = await createRes.json();

    const patchRes = await app.request(`/v1/monitors/${id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ enabled: false, intervalMinutes: 120 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.enabled).toBe(false);
    expect(patched.intervalMinutes).toBe(120);

    const delRes = await app.request(`/v1/monitors/${id}`, { method: 'DELETE', headers: auth() });
    expect((await delRes.json()).deleted).toBe(true);
  });

  it('enforces ownership', async () => {
    const createRes = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ name: 'M', url: 'https://example.com' }),
    });
    const { id } = await createRes.json();
    const res = await app.request(`/v1/monitors/${id}`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });
});
