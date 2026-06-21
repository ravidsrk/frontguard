import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { InMemoryStore } from '../src/db/store.js';
import { isMonitorDue, type Monitor } from '../src/db/monitors.js';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';

/** Demo userId derivation used by the dev-mode auth guard. */
const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;

/** Upgrades a token's demo user to a plan that allows production monitoring. */
async function upgradeToPaid(token = 'owner', plan = 'business'): Promise<void> {
  const store = getMemoryStore();
  const id = demoId(token);
  if (await store.getUser(id)) await store.updateUserPlan(id, plan);
  else await store.createUser({ id, plan, createdAt: new Date().toISOString() });
}

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
  beforeEach(async () => {
    resetMemoryStore();
    // Production monitoring requires a paid plan; grant it to the test users.
    await upgradeToPaid('owner');
    await upgradeToPaid('alice');
    await upgradeToPaid('bob');
  });
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

  it('rejects monitor creation on a free plan (productionMonitoring gated)', async () => {
    // 'free-user' is not upgraded in beforeEach, so it defaults to the free plan.
    const res = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('free-user'),
      body: JSON.stringify({ name: 'M', url: 'https://example.com' }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/not available on the Free plan/i);
  });

  it('rejects monitor creation on the pro plan (production monitoring is Business-only)', async () => {
    await upgradeToPaid('pro-user', 'pro');
    const res = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('pro-user'),
      body: JSON.stringify({ name: 'M', url: 'https://example.com' }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/not available on the Pro plan/i);
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

  it('PATCH leaves omitted fields untouched (no reset to create defaults)', async () => {
    // Regression guard for the Zod 3->4 default-in-optional behavior: the update
    // schema must NOT re-apply create defaults to fields the PATCH omits.
    // Create with values that all differ from the create defaults
    // (routes ['/'], viewports [1440], intervalMinutes 60, alertThreshold 0.05).
    const createRes = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        name: 'M',
        url: 'https://example.com',
        routes: ['/', '/pricing'],
        viewports: [375, 1440],
        intervalMinutes: 30,
        alertThreshold: 0.2,
      }),
    });
    const { id } = await createRes.json();

    // PATCH only the name; every other field is omitted from the body.
    const patchRes = await app.request(`/v1/monitors/${id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();

    expect(patched.name).toBe('Renamed');
    // Omitted fields must keep their stored values, not snap back to defaults.
    expect(patched.routes).toEqual(['/', '/pricing']);
    expect(patched.viewports).toEqual([375, 1440]);
    expect(patched.intervalMinutes).toBe(30);
    expect(patched.alertThreshold).toBe(0.2);
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

  async function createMonitor(headers = auth(), body: Record<string, unknown> = {}): Promise<string> {
    const res = await app.request('/v1/monitors', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'M', url: 'https://example.com', ...body }),
    });
    return (await res.json()).id;
  }

  it('returns run history for a monitor', async () => {
    const id = await createMonitor();
    // Seed a history record directly via the store.
    const store = getMemoryStore();
    await store.addMonitorRun({
      id: 'r1', monitorId: id, userId: `demo:${'x'}`, status: 'passed',
      regressionsCount: 0, attempts: 1, createdAt: '2026-01-01T00:00:00Z',
    });
    const res = await app.request(`/v1/monitors/${id}/runs`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects run history for non-owners', async () => {
    const id = await createMonitor(auth('alice'));
    const res = await app.request(`/v1/monitors/${id}/runs`, { headers: auth('bob') });
    expect(res.status).toBe(404);
  });

  it('sends a test alert to configured channels', async () => {
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const id = await createMonitor(auth(), { alerts: { slack: 'https://hooks.example.com/x' } });
      const res = await app.request(`/v1/monitors/${id}/test-alert`, { method: 'POST', headers: auth() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBe(true);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('rejects a test alert when no channels are configured', async () => {
    const id = await createMonitor();
    const res = await app.request(`/v1/monitors/${id}/test-alert`, { method: 'POST', headers: auth() });
    expect(res.status).toBe(400);
  });

  it('snoozes and clears snooze', async () => {
    const id = await createMonitor();
    const snooze = await app.request(`/v1/monitors/${id}/snooze`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ hours: 5 }),
    });
    expect(snooze.status).toBe(200);
    expect((await snooze.json()).snoozedUntil).toBeTruthy();

    const clear = await app.request(`/v1/monitors/${id}/snooze`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ hours: 0 }),
    });
    expect((await clear.json()).snoozedUntil).toBeNull();
  });
});
