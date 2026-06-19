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

/** A single regression or check-failure alert from a monitor run. */
export interface MonitorAlert {
  url: string;
  route: string;
  viewport: number;
  diffPercentage: number;
  threshold: number;
  /** Regression (default) or a hard check failure (target down / sandbox error). */
  kind?: 'regression' | 'error';
  /** Human-readable detail for error alerts. */
  message?: string;
}

/**
 * Alert severity tiers, derived from how far diff exceeds threshold.
 * - low: < 2× threshold (minor regression)
 * - medium: 2–4× threshold
 * - high: ≥ 4× threshold (major regression)
 */
export type AlertSeverity = 'low' | 'medium' | 'high';

/** Maps (diff, threshold) to a severity tier. */
export function alertSeverity(diffPercentage: number, threshold: number): AlertSeverity {
  if (threshold <= 0) return diffPercentage >= 0.1 ? 'high' : diffPercentage >= 0.02 ? 'medium' : 'low';
  const ratio = diffPercentage / threshold;
  if (ratio >= 4) return 'high';
  if (ratio >= 2) return 'medium';
  return 'low';
}

/**
 * Coarse-bins a diff percentage so the fingerprint changes only when the
 * magnitude meaningfully changes (not on every tiny fluctuation). Buckets:
 * 0=0%, 1=<1%, 2=1–5%, 3=5–10%, 4=10–25%, 5=≥25%.
 */
export function diffBucket(diffPercentage: number): number {
  const pct = diffPercentage * 100;
  if (pct <= 0) return 0;
  if (pct < 1) return 1;
  if (pct < 5) return 2;
  if (pct < 10) return 3;
  if (pct < 25) return 4;
  return 5;
}

/**
 * Builds a stable fingerprint of a regression set, used to suppress duplicate
 * alerts. Includes route+viewport plus per-alert severity and a coarse
 * diff-percentage bucket (P2-4) so an escalating regression — same routes,
 * worse magnitude — re-alerts instead of being swallowed as a duplicate.
 *
 * Bucketing (not the raw percentage) means tiny fluctuations still dedup:
 * 6.1% → 6.4% stays in bucket 3, no re-alert. 6% → 12% crosses to bucket 4
 * and *does* re-alert. Order-independent: alerts are sorted before joining.
 */
export function alertFingerprint(alerts: MonitorAlert[]): string {
  return alerts
    .map((a) => {
      if (a.kind === 'error') {
        return `error:${a.message ?? 'check-failed'}`;
      }
      return `${a.route}@${a.viewport}:${alertSeverity(a.diffPercentage, a.threshold)}:${diffBucket(a.diffPercentage)}`;
    })
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
  channel: 'slack' | 'email' | 'pagerduty';
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
  const isError = alerts.some((a) => a.kind === 'error');
  const lines = alerts
    .map((a) => {
      if (a.kind === 'error') {
        return `• Check failed — ${a.message ?? 'target unreachable or sandbox error'}`;
      }
      return `• \`${a.route}\` @ ${a.viewport}px — *${(a.diffPercentage * 100).toFixed(2)}%* changed (threshold ${(a.threshold * 100).toFixed(1)}%)`;
    })
    .join('\n');
  const headline = isError
    ? `🚨 Frontguard: monitor check failed on ${monitor.name}`
    : `🚨 Frontguard: ${alerts.length} visual regression(s) on ${monitor.name}`;
  return {
    text: headline,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: isError ? '🚨 Monitor check failed' : `🚨 ${alerts.length} visual regression(s)`,
        },
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
  const isError = alerts.some((a) => a.kind === 'error');
  const rows = alerts
    .map((a) => {
      if (a.kind === 'error') {
        return `<tr><td colspan="3">${escapeHtml(a.message ?? 'Check failed')}</td></tr>`;
      }
      return `<tr><td>${escapeHtml(a.route)}</td><td>${a.viewport}px</td><td>${(a.diffPercentage * 100).toFixed(2)}%</td></tr>`;
    })
    .join('');
  return `<h2>🚨 Frontguard — ${isError ? 'monitor check failed' : `${alerts.length} visual regression(s)`}</h2>
<p><strong>Monitor:</strong> ${escapeHtml(monitor.name)}<br/>
<strong>URL:</strong> ${escapeHtml(monitor.url)}</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>Route</th><th>Viewport</th><th>Diff</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Builds a PagerDuty Events API v2 payload for a set of alerts. Exposed for
 * testing.
 *
 * The `dedup_key` reuses {@link alertFingerprint} so PagerDuty groups identical
 * regression sets into a single incident (matching our own alert dedup), while
 * a *different* regression set opens a distinct incident.
 */
export function buildPagerDutyPayload(
  routingKey: string,
  monitor: Monitor,
  alerts: MonitorAlert[],
): unknown {
  return {
    routing_key: routingKey,
    event_action: 'trigger',
    dedup_key: `frontguard-${monitor.id}-${alertFingerprint(alerts)}`,
    payload: {
      summary: `Frontguard: ${alerts.length} visual regression(s) on ${monitor.name}`,
      source: monitor.url,
      severity: 'warning',
      custom_details: {
        monitor: monitor.name,
        url: monitor.url,
        regressions: alerts.map((a) => ({
          route: a.route,
          viewport: a.viewport,
          diff_percentage: Number((a.diffPercentage * 100).toFixed(2)),
          threshold: Number((a.threshold * 100).toFixed(2)),
        })),
      },
    },
  };
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

/** Triggers a PagerDuty incident via the Events API v2. Never throws. */
export async function sendPagerDutyAlert(
  routingKey: string,
  monitor: Monitor,
  alerts: MonitorAlert[],
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDeliveryResult> {
  try {
    const res = await fetchImpl('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPagerDutyPayload(routingKey, monitor, alerts)),
    });
    return { channel: 'pagerduty', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { channel: 'pagerduty', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends a usage-cap warning email via Resend (Task 15.7). Triggered when a
 * user's monthly run count crosses 80% or 95% of their plan limit. Never
 * throws — failures are reported on the return value.
 *
 * The dashboard caller persists the highest tier already alerted so we never
 * re-email the same tier in the same month.
 */
export async function sendUsageWarningEmail(
  env: AlertEnv,
  recipients: string[],
  data: { plan: string; tier: 80 | 95; used: number; limit: number },
  fetchImpl: typeof fetch = fetch,
): Promise<AlertDeliveryResult> {
  if (!env.RESEND_API_KEY) {
    return { channel: 'email', ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (recipients.length === 0) {
    return { channel: 'email', ok: false, error: 'No recipients' };
  }
  const pct = Math.round((data.used / data.limit) * 100);
  const upgradeUrl = (env.PUBLIC_BASE_URL ?? 'https://frontguard.dev') + '/pricing';
  const tone = data.tier === 95 ? 'critical' : 'warning';
  const subject = `[Frontguard] ${pct}% of monthly runs used on the ${data.plan} plan`;
  const html = `<h2>${pct}% of your monthly run quota is used</h2>
<p>Your <strong>${escapeHtml(data.plan)}</strong> plan has used <strong>${data.used}</strong> of <strong>${data.limit}</strong> runs this month (${pct}%).</p>
<p>${data.tier === 95
    ? 'You are about to hit your monthly limit. Additional runs will be rejected once you reach 100%.'
    : "You're approaching your monthly limit. Consider upgrading to avoid interruption."}
</p>
<p><a href="${escapeHtml(upgradeUrl)}">Upgrade your plan →</a></p>`;
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
        subject,
        html,
        tags: [{ name: 'kind', value: `usage-${tone}` }],
      }),
    });
    return { channel: 'email', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { channel: 'email', ok: false, error: err instanceof Error ? err.message : String(err) };
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
  if (monitor.alerts?.pagerduty) {
    results.push(await sendPagerDutyAlert(monitor.alerts.pagerduty, monitor, alerts, fetchImpl));
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
