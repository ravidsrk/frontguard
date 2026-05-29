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

/** A single regression detected during a monitor check. */
export interface MonitorAlert {
  url: string;
  route: string;
  viewport: number;
  diffPercentage: number;
  threshold: number;
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
