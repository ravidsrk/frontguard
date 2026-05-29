import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderDashboard,
  relativeTime,
  renderLogin,
  renderMonitorDetail,
  renderScreenshotComparison,
} from '../src/dashboard/render.js';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import {
  resetMemoryScreenshotStore,
  getMemoryScreenshotStore,
} from '../src/storage/screenshots.js';
import { createSessionCookie, DEV_SESSION_SECRET } from '../src/auth/session.js';
import type { Monitor, MonitorRun } from '../src/db/monitors.js';
import type { Run } from '../src/types.js';
import type { ScreenshotRecord } from '../src/db/store.js';

/** Builds a valid fg_session Cookie header for the given userId. */
async function sessionHeader(userId: string): Promise<{ Cookie: string }> {
  const value = await createSessionCookie(userId, DEV_SESSION_SECRET);
  return { Cookie: `fg_session=${value}` };
}

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 'm1', userId: 'u1', name: 'Home', url: 'https://example.com',
    routes: ['/'], viewports: [1440], intervalMinutes: 60, alertThreshold: 0.05,
    enabled: true, createdAt: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('relativeTime', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  it('handles never/just-now/minutes/hours/days', () => {
    expect(relativeTime(undefined, now)).toBe('never');
    expect(relativeTime('2026-01-01T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-01-01T11:30:00Z', now)).toBe('30m ago');
    expect(relativeTime('2026-01-01T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2025-12-30T12:00:00Z', now)).toBe('2d ago');
  });
});

describe('renderDashboard', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('renders stats and a monitor row', () => {
    const html = renderDashboard(
      [makeMonitor({ lastStatus: 'passed', lastRunAt: '2026-01-01T11:30:00Z' })],
      [],
      now,
    );
    expect(html).toContain('Frontguard Monitoring');
    expect(html).toContain('Home');
    expect(html).toContain('✓ Passing');
    expect(html).toContain('30m ago');
  });

  it('shows an empty state with no monitors', () => {
    const html = renderDashboard([], [], now);
    expect(html).toContain('No monitors yet');
  });

  it('renders recent activity with regression count', () => {
    const run: Run = {
      id: 'r1', status: 'completed', url: 'https://example.com', routes: [{ path: '/' }],
      viewports: [1440], browsers: ['chromium'], threshold: 0.05, ai: null,
      createdAt: '2026-01-01T11:00:00Z', completedAt: '2026-01-01T11:01:00Z',
      results: [
        { route: '/', viewport: 1440, status: 'regression', diffPercentage: 5, classification: 'regression', timestamp: 'now' },
      ],
      reportUrl: null,
    };
    const html = renderDashboard([], [run], now);
    expect(html).toContain('1 regression(s)');
  });

  it('escapes HTML in monitor names', () => {
    const html = renderDashboard([makeMonitor({ name: '<script>x</script>' })], [], now);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('GET /v1/dashboard route', () => {
  beforeEach(() => resetMemoryStore());

  it('returns HTML for the authenticated user', async () => {
    const res = await app.request('/v1/dashboard', {
      headers: { Authorization: 'Bearer owner' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Frontguard Monitoring');
  });

  it('requires auth', async () => {
    const res = await app.request('/v1/dashboard');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// New render functions
// ---------------------------------------------------------------------------
describe('renderLogin', () => {
  it('shows a Sign in with GitHub button', () => {
    const html = renderLogin();
    expect(html).toContain('Sign in with GitHub');
    expect(html).toContain('/auth/github?redirect=/dashboard');
  });
});

describe('renderMonitorDetail', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  it('renders the run timeline newest-first with statuses', () => {
    const monitor = makeMonitor({ name: 'Detail', alerts: { slack: 'https://hooks.slack.com/x' } });
    const runs: MonitorRun[] = [
      {
        id: 'run-a', monitorId: 'm1', userId: 'u1', status: 'regression',
        regressionsCount: 2, attempts: 1, createdAt: '2026-01-01T11:00:00Z',
      },
    ];
    const html = renderMonitorDetail(monitor, runs, now);
    expect(html).toContain('Run timeline');
    expect(html).toContain('✘ regression');
    expect(html).toContain('/dashboard/runs/run-a');
    // Alert config form pre-fills the slack webhook.
    expect(html).toContain('https://hooks.slack.com/x');
    expect(html).toContain('/dashboard/monitors/m1/snooze');
  });

  it('escapes monitor name', () => {
    const html = renderMonitorDetail(makeMonitor({ name: '<b>x</b>' }), [], now);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('renderScreenshotComparison', () => {
  it('groups by route+viewport with baseline/current/diff columns', () => {
    const shots: ScreenshotRecord[] = [
      { id: 's1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'baseline', r2Key: 'k1', createdAt: 'now' },
      { id: 's2', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'current', r2Key: 'k2', createdAt: 'now' },
      { id: 's3', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k3', createdAt: 'now' },
    ];
    const html = renderScreenshotComparison('r1', shots);
    expect(html).toContain('/ @ 1440px');
    expect(html).toContain('/dashboard/screenshots/r1/s1/raw');
    expect(html).toContain('/dashboard/screenshots/r1/s2/raw');
    expect(html).toContain('/dashboard/screenshots/r1/s3/raw');
    expect(html).toContain('baseline');
    expect(html).toContain('current');
    expect(html).toContain('diff');
  });

  it('shows empty state with no screenshots', () => {
    expect(renderScreenshotComparison('r1', [])).toContain('No screenshots');
  });
});

// ---------------------------------------------------------------------------
// Session-authed browser dashboard at /dashboard
// ---------------------------------------------------------------------------
describe('GET /dashboard (session)', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  it('shows the login page without a session', async () => {
    const res = await app.request('/dashboard');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Sign in with GitHub');
  });

  it('renders the interactive dashboard with a valid session cookie', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'mm', userId: 'alice', name: 'AliceSite' }));
    const res = await app.request('/dashboard', { headers: await sessionHeader('alice') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AliceSite');
    expect(html).toContain('Create monitor');
    // Interactive controls present.
    expect(html).toContain('/dashboard/monitors/mm/toggle');
    expect(html).toContain('/dashboard/monitors/mm/delete');
  });
});

describe('dashboard monitor CRUD via forms', () => {
  beforeEach(() => resetMemoryStore());

  it('creates a monitor from form fields', async () => {
    const res = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: {
        ...(await sessionHeader('bob')),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: 'My Site', url: 'https://my.site', routes: '/, /pricing',
        intervalMinutes: '30', alertThreshold: '0.1',
        slack: 'https://hooks.slack.com/abc', email: 'a@x.com, b@x.com',
      }).toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dashboard');
    const monitors = await getMemoryStore().listMonitors('bob');
    expect(monitors).toHaveLength(1);
    expect(monitors[0].name).toBe('My Site');
    expect(monitors[0].routes).toEqual(['/', '/pricing']);
    expect(monitors[0].intervalMinutes).toBe(30);
    expect(monitors[0].alerts?.slack).toBe('https://hooks.slack.com/abc');
    expect(monitors[0].alerts?.email).toEqual(['a@x.com', 'b@x.com']);
  });

  it('requires a session to create', async () => {
    const res = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=x&url=https://x.com',
    });
    expect(res.status).toBe(302);
    expect(await getMemoryStore().listMonitors('bob')).toHaveLength(0);
  });

  it('toggles enabled state', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 't1', userId: 'carol', enabled: true }));
    const res = await app.request('/dashboard/monitors/t1/toggle', {
      method: 'POST',
      headers: await sessionHeader('carol'),
    });
    expect(res.status).toBe(302);
    expect((await store.getMonitor('t1'))!.enabled).toBe(false);
  });

  it('deletes a monitor', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'd1', userId: 'dave' }));
    const res = await app.request('/dashboard/monitors/d1/delete', {
      method: 'POST',
      headers: await sessionHeader('dave'),
    });
    expect(res.status).toBe(302);
    expect(await store.getMonitor('d1')).toBeNull();
  });

  it('does not toggle a monitor owned by someone else', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'x1', userId: 'owner', enabled: true }));
    const res = await app.request('/dashboard/monitors/x1/toggle', {
      method: 'POST',
      headers: await sessionHeader('intruder'),
    });
    expect(res.status).toBe(302);
    // Unchanged.
    expect((await store.getMonitor('x1'))!.enabled).toBe(true);
  });
});

describe('per-monitor detail page', () => {
  beforeEach(() => resetMemoryStore());

  it('renders monitor detail with run timeline', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'mon', userId: 'eve', name: 'EveSite' }));
    await store.addMonitorRun({
      id: 'mr1', monitorId: 'mon', userId: 'eve', status: 'passed',
      regressionsCount: 0, attempts: 1, createdAt: '2026-01-01T10:00:00Z',
    });
    const res = await app.request('/dashboard/monitors/mon', { headers: await sessionHeader('eve') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('EveSite');
    expect(html).toContain('Run timeline');
    expect(html).toContain('✓ passed');
  });

  it('rejects cross-user access with 404', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'mon2', userId: 'eve' }));
    const res = await app.request('/dashboard/monitors/mon2', {
      headers: await sessionHeader('mallory'),
    });
    expect(res.status).toBe(404);
  });
});

describe('alert config + snooze via dashboard', () => {
  beforeEach(() => resetMemoryStore());

  it('updates alert config', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'a1', userId: 'frank' }));
    const res = await app.request('/dashboard/monitors/a1/alerts', {
      method: 'POST',
      headers: {
        ...(await sessionHeader('frank')),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        alertThreshold: '0.2', slack: 'https://hooks.slack.com/z', email: 'team@x.com',
      }).toString(),
    });
    expect(res.status).toBe(302);
    const m = await store.getMonitor('a1');
    expect(m!.alertThreshold).toBe(0.2);
    expect(m!.alerts?.slack).toBe('https://hooks.slack.com/z');
    expect(m!.alerts?.email).toEqual(['team@x.com']);
  });

  it('sets and clears a snooze', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 's1', userId: 'grace' }));
    const set = await app.request('/dashboard/monitors/s1/snooze', {
      method: 'POST',
      headers: {
        ...(await sessionHeader('grace')),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'hours=12',
    });
    expect(set.status).toBe(302);
    expect((await store.getAlertState('s1'))!.snoozedUntil).toBeTruthy();

    const clear = await app.request('/dashboard/monitors/s1/snooze', {
      method: 'POST',
      headers: {
        ...(await sessionHeader('grace')),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'hours=0',
    });
    expect(clear.status).toBe(302);
    expect((await store.getAlertState('s1'))!.snoozedUntil).toBeUndefined();
  });
});

describe('screenshot comparison view', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  function makeRun(id: string): Run {
    return {
      id, status: 'completed', url: 'https://example.com', routes: [{ path: '/' }],
      viewports: [1440], browsers: ['chromium'], threshold: 0.05, ai: null,
      createdAt: '2026-01-01T11:00:00Z', results: null, reportUrl: null,
    };
  }

  it('renders comparison page for an owned run', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRun('run1'), 'henry');
    await store.addScreenshot({ id: 'sc1', runId: 'run1', route: '/', viewport: 1440, browser: 'chromium', type: 'current', r2Key: 'henry/run1/root-1440-chromium-current.png', createdAt: 'now' });
    const res = await app.request('/dashboard/runs/run1', { headers: await sessionHeader('henry') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/dashboard/screenshots/run1/sc1/raw');
  });

  it('rejects cross-user access to a run with 404', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRun('run2'), 'henry');
    const res = await app.request('/dashboard/runs/run2', { headers: await sessionHeader('isaac') });
    expect(res.status).toBe(404);
  });

  it('serves raw screenshot bytes for the owner', async () => {
    const store = getMemoryStore();
    const blobs = getMemoryScreenshotStore();
    await store.createRun(makeRun('run3'), 'henry');
    await store.addScreenshot({ id: 'sc3', runId: 'run3', route: '/', viewport: 1440, browser: 'chromium', type: 'current', r2Key: 'henry/run3/img.png', createdAt: 'now' });
    await blobs.put('henry/run3/img.png', new Uint8Array([1, 2, 3, 4]));
    const res = await app.request('/dashboard/screenshots/run3/sc3/raw', {
      headers: await sessionHeader('henry'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects raw screenshot access for a non-owner with 404', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRun('run4'), 'henry');
    await store.addScreenshot({ id: 'sc4', runId: 'run4', route: '/', viewport: 1440, browser: 'chromium', type: 'current', r2Key: 'henry/run4/img.png', createdAt: 'now' });
    const res = await app.request('/dashboard/screenshots/run4/sc4/raw', {
      headers: await sessionHeader('intruder'),
    });
    expect(res.status).toBe(404);
  });

  it('rejects raw screenshot access without a session with 401', async () => {
    const res = await app.request('/dashboard/screenshots/run4/sc4/raw');
    expect(res.status).toBe(401);
  });
});
