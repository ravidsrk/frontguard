/**
 * Alert delivery (Task 6.2).
 *
 * Sends regression alerts to Slack (incoming webhook) and email (Resend API).
 * Both senders are best-effort: a failure is logged and returned as a result,
 * never thrown, so one failing channel never blocks the others or the cron run.
 *
 * @module alerts
 */

import type { Monitor } from '../db/monitors.js';
import type { Store } from '../db/store.js';

/** A single regression detected during a monitor check. */
export interface MonitorAlert {
  url: string;
  route: string;
  viewport: number;
  diffPercentage: number;
  threshold: number;
}

/**
 * Builds a stable fingerprint of a regression set, used to suppress duplicate
 * alerts. Only the affected route+viewport pairs matter — the diff percentage
 * fluctuates run-to-run, so it's excluded.
 */
export function alertFingerprint(alerts: MonitorAlert[]): string {
  return alerts
    .map((a) => `${a.route}@${a.viewport}`)
    .sort()
    .join('|');
}

/** Why a dispatch was (or wasn't) attempted — returned for logging/tests. */
export type AlertDispatchReason = 'sent' | 'snoozed' | 'duplicate' | 'no-alerts';

/** Result of a stateful dispatch attempt. */
export interface StatefulDispatchResult {
  reason: AlertDispatchReason;
  deliveries: AlertDeliveryResult[];
}

/** Result of attempting to deliver to one channel. */
export interface AlertDeliveryResult {
  channel: 'slack' | 'email';
  ok: boolean;
  error?: string;
}

/** Bindings needed for alert delivery (from Worker secrets). */
export interface AlertEnv {
  /** Resend API key for email. */
  RESEND_API_KEY?: string;
  /** From address for alert emails. */
  ALERT_FROM_EMAIL?: string;
  /** Public base URL for building report links. */
  PUBLIC_BASE_URL?: string;
}

/**
 * Builds a Slack message payload (Block Kit) for a set of alerts.
 * Exposed for testing.
 */
export function buildSlackPayload(monitor: Monitor, alerts: MonitorAlert[]): unknown {
  const lines = alerts
    .map(
      (a) =>
        `• \`${a.route}\` @ ${a.viewport}px — *${(a.diffPercentage * 100).toFixed(2)}%* changed (threshold ${(a.threshold * 100).toFixed(1)}%)`,
    )
    .join('\n');
  return {
    text: `🚨 Frontguard: ${alerts.length} visual regression(s) on ${monitor.name}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🚨 ${alerts.length} visual regression(s)` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Monitor:* ${monitor.name}\n*URL:* ${monitor.url}` },
      },
      { type: 'section', text: { type: 'mrkdwn', text: lines } },
    ],
  };
}

/**
 * Builds an HTML email body for a set of alerts. Exposed for testing.
 */
export function buildEmailHtml(monitor: Monitor, alerts: MonitorAlert[]): string {
  const rows = alerts
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.route)}</td><td>${a.viewport}px</td><td>${(a.diffPercentage * 100).toFixed(2)}%</td></tr>`,
    )
    .join('');
  return `<h2>🚨 Frontguard — ${alerts.length} visual regression(s)</h2>
<p><strong>Monitor:</strong> ${escapeHtml(monitor.name)}<br/>
<strong>URL:</strong> ${escapeHtml(monitor.url)}</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>Route</th><th>Viewport</th><th>Diff</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Posts a Slack alert via an incoming webhook. Never throws. */
export async function sendSlackAlert(
  webhookUrl: string,
  monitor: Monitor,
  alerts: MonitorAlert[],
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDeliveryResult> {
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSlackPayload(monitor, alerts)),
    });
    return { channel: 'slack', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { channel: 'slack', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends an email alert via the Resend API. Never throws. */
export async function sendEmailAlert(
  env: AlertEnv,
  recipients: string[],
  monitor: Monitor,
  alerts: MonitorAlert[],
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDeliveryResult> {
  if (!env.RESEND_API_KEY) {
    return { channel: 'email', ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.ALERT_FROM_EMAIL ?? 'alerts@frontguard.dev',
        to: recipients,
        subject: `🚨 Frontguard: ${alerts.length} regression(s) on ${monitor.name}`,
        html: buildEmailHtml(monitor, alerts),
      }),
    });
    return { channel: 'email', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { channel: 'email', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Dispatches alerts to all channels configured on a monitor. Returns a result
 * per attempted channel.
 */
export async function dispatchAlerts(
  env: AlertEnv,
  monitor: Monitor,
  alerts: MonitorAlert[],
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDeliveryResult[]> {
  if (alerts.length === 0) return [];
  const results: AlertDeliveryResult[] = [];
  if (monitor.alerts?.slack) {
    results.push(await sendSlackAlert(monitor.alerts.slack, monitor, alerts, fetchImpl));
  }
  if (monitor.alerts?.email && monitor.alerts.email.length > 0) {
    results.push(await sendEmailAlert(env, monitor.alerts.email, monitor, alerts, fetchImpl));
  }
  return results;
}

/**
 * Dispatches alerts with deduplication and snooze support (Task 6.2).
 *
 * - **Snooze:** if the monitor is snoozed past `now`, nothing is sent.
 * - **Dedup:** if the regression set's fingerprint matches the last alerted
 *   fingerprint, the alert is suppressed (the same regression won't alert
 *   twice). A *different* regression set always alerts.
 *
 * Alert state is read from and written back to the {@link Store}.
 */
export async function dispatchAlertsWithState(
  env: AlertEnv,
  store: Store,
  monitor: Monitor,
  alerts: MonitorAlert[],
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<StatefulDispatchResult> {
  if (alerts.length === 0) return { reason: 'no-alerts', deliveries: [] };

  const state = await store.getAlertState(monitor.id);

  // Snooze check.
  if (state?.snoozedUntil && new Date(state.snoozedUntil).getTime() > now.getTime()) {
    return { reason: 'snoozed', deliveries: [] };
  }

  // Dedup check.
  const fingerprint = alertFingerprint(alerts);
  if (state?.lastFingerprint === fingerprint) {
    return { reason: 'duplicate', deliveries: [] };
  }

  const deliveries = await dispatchAlerts(env, monitor, alerts, fetchImpl);

  // Record the fingerprint so an identical regression set won't re-alert.
  await store.setAlertState({
    monitorId: monitor.id,
    lastFingerprint: fingerprint,
    lastAlertAt: now.toISOString(),
    snoozedUntil: state?.snoozedUntil,
  });

  return { reason: 'sent', deliveries };
}
