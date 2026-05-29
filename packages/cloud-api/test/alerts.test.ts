import { describe, it, expect } from 'vitest';
import {
  buildSlackPayload,
  buildEmailHtml,
  sendSlackAlert,
  sendEmailAlert,
  dispatchAlerts,
  dispatchAlertsWithState,
  alertFingerprint,
  type MonitorAlert,
} from '../src/alerts/index.js';
import { InMemoryStore } from '../src/db/store.js';
import type { Monitor } from '../src/db/monitors.js';

const monitor: Monitor = {
  id: 'm1',
  userId: 'u1',
  name: 'Prod',
  url: 'https://example.com',
  routes: ['/'],
  viewports: [1440],
  intervalMinutes: 60,
  alertThreshold: 0.05,
  enabled: true,
  createdAt: 'now',
  alerts: { slack: 'https://hooks.slack.com/x', email: ['a@b.com'] },
};

const alerts: MonitorAlert[] = [
  { url: 'https://example.com', route: '/', viewport: 1440, diffPercentage: 0.12, threshold: 0.05 },
];

describe('alert payload builders', () => {
  it('builds a Slack Block Kit payload', () => {
    const p = buildSlackPayload(monitor, alerts) as { text: string; blocks: unknown[] };
    expect(p.text).toContain('1 visual regression');
    expect(p.blocks.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(p)).toContain('12.00%');
  });

  it('builds an HTML email with escaped content', () => {
    const html = buildEmailHtml(monitor, alerts);
    expect(html).toContain('1 visual regression');
    expect(html).toContain('<table');
    expect(html).toContain('12.00%');
  });
});

describe('sendSlackAlert', () => {
  it('returns ok on 200', async () => {
    const fakeFetch = (async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const res = await sendSlackAlert('https://hook', monitor, alerts, fakeFetch);
    expect(res).toEqual({ channel: 'slack', ok: true, error: undefined });
  });
  it('reports failure on non-2xx without throwing', async () => {
    const fakeFetch = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const res = await sendSlackAlert('https://hook', monitor, alerts, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('500');
  });
  it('catches network errors', async () => {
    const fakeFetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await sendSlackAlert('https://hook', monitor, alerts, fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('network down');
  });
});

describe('sendEmailAlert', () => {
  it('fails gracefully without RESEND_API_KEY', async () => {
    const res = await sendEmailAlert({}, ['a@b.com'], monitor, alerts);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('RESEND_API_KEY');
  });
  it('sends via Resend when configured', async () => {
    let captured: { url: string; auth: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await sendEmailAlert(
      { RESEND_API_KEY: 'k', ALERT_FROM_EMAIL: 'x@frontguard.dev' },
      ['a@b.com'],
      monitor,
      alerts,
      fakeFetch,
    );
    expect(res.ok).toBe(true);
    expect(captured!.url).toContain('resend.com');
    expect(captured!.auth).toBe('Bearer k');
  });
});

describe('dispatchAlerts', () => {
  it('dispatches to both configured channels', async () => {
    const fakeFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const results = await dispatchAlerts({ RESEND_API_KEY: 'k' }, monitor, alerts, fakeFetch);
    expect(results.map((r) => r.channel).sort()).toEqual(['email', 'slack']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('returns empty for no alerts', async () => {
    expect(await dispatchAlerts({}, monitor, [])).toEqual([]);
  });

  it('skips unconfigured channels', async () => {
    const fakeFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const slackOnly = { ...monitor, alerts: { slack: 'https://hook' } };
    const results = await dispatchAlerts({}, slackOnly, alerts, fakeFetch);
    expect(results.map((r) => r.channel)).toEqual(['slack']);
  });
});

describe('alertFingerprint', () => {
  it('is stable regardless of order and ignores diff percentage', () => {
    const a: MonitorAlert[] = [
      { url: 'u', route: '/a', viewport: 1440, diffPercentage: 0.2, threshold: 0.05 },
      { url: 'u', route: '/b', viewport: 375, diffPercentage: 0.3, threshold: 0.05 },
    ];
    const b: MonitorAlert[] = [
      { url: 'u', route: '/b', viewport: 375, diffPercentage: 0.9, threshold: 0.05 },
      { url: 'u', route: '/a', viewport: 1440, diffPercentage: 0.1, threshold: 0.05 },
    ];
    expect(alertFingerprint(a)).toBe(alertFingerprint(b));
  });
  it('differs for different route sets', () => {
    const a: MonitorAlert[] = [{ url: 'u', route: '/a', viewport: 1440, diffPercentage: 0.2, threshold: 0.05 }];
    const b: MonitorAlert[] = [{ url: 'u', route: '/c', viewport: 1440, diffPercentage: 0.2, threshold: 0.05 }];
    expect(alertFingerprint(a)).not.toBe(alertFingerprint(b));
  });
});

describe('dispatchAlertsWithState (dedup + snooze)', () => {
  const mon: Monitor = {
    id: 'm1', userId: 'u1', name: 'Prod', url: 'https://x.com',
    routes: ['/'], viewports: [1440], intervalMinutes: 60, alertThreshold: 0.05,
    alerts: { slack: 'https://hook' }, enabled: true, createdAt: '2026-01-01T00:00:00Z',
  };
  const sample: MonitorAlert[] = [
    { url: 'https://x.com', route: '/', viewport: 1440, diffPercentage: 0.2, threshold: 0.05 },
  ];
  const okFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

  it('sends the first time and records fingerprint', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    const res = await dispatchAlertsWithState({}, store, mon, sample, now, okFetch);
    expect(res.reason).toBe('sent');
    const state = await store.getAlertState('m1');
    expect(state?.lastFingerprint).toBe(alertFingerprint(sample));
  });

  it('suppresses a duplicate identical regression set', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await dispatchAlertsWithState({}, store, mon, sample, now, okFetch);
    const res = await dispatchAlertsWithState({}, store, mon, sample, now, okFetch);
    expect(res.reason).toBe('duplicate');
    expect(res.deliveries).toEqual([]);
  });

  it('re-alerts when the regression set changes', async () => {
    const store = new InMemoryStore();
    const now = new Date('2026-01-01T12:00:00Z');
    await dispatchAlertsWithState({}, store, mon, sample, now, okFetch);
    const changed: MonitorAlert[] = [
      ...sample,
      { url: 'https://x.com', route: '/pricing', viewport: 1440, diffPercentage: 0.3, threshold: 0.05 },
    ];
    const res = await dispatchAlertsWithState({}, store, mon, changed, now, okFetch);
    expect(res.reason).toBe('sent');
  });

  it('suppresses while snoozed, resumes after snooze expires', async () => {
    const store = new InMemoryStore();
    await store.setAlertState({ monitorId: 'm1', snoozedUntil: '2026-01-01T18:00:00Z' });

    const during = await dispatchAlertsWithState({}, store, mon, sample, new Date('2026-01-01T12:00:00Z'), okFetch);
    expect(during.reason).toBe('snoozed');

    const after = await dispatchAlertsWithState({}, store, mon, sample, new Date('2026-01-01T19:00:00Z'), okFetch);
    expect(after.reason).toBe('sent');
  });

  it('returns no-alerts for an empty set', async () => {
    const store = new InMemoryStore();
    const res = await dispatchAlertsWithState({}, store, mon, [], new Date(), okFetch);
    expect(res.reason).toBe('no-alerts');
  });
});
