import { describe, it, expect, beforeEach } from 'vitest';
import { renderDashboard, relativeTime } from '../src/dashboard/render.js';
import { app } from '../src/index.js';
import { resetMemoryStore } from '../src/db/factory.js';
import type { Monitor } from '../src/db/monitors.js';
import type { Run } from '../src/types.js';

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
