/**
 * Team invitation email delivery (Task 8.1).
 *
 * Sends a token-based invite link via the Resend API, mirroring the alert
 * email pattern in {@link module:alerts}. Best-effort: never throws and never
 * logs secrets. If `RESEND_API_KEY` is unset, returns `{ ok: false }` cleanly.
 *
 * @module teams/invite-email
 */

import type { AlertEnv } from '../alerts/index.js';
import type { TeamInvitation } from '../db/teams.js';

/** Result of an invite-email send attempt. */
export interface InviteEmailResult {
  ok: boolean;
  error?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Builds the dashboard accept link for an invitation token. */
export function buildAcceptUrl(env: AlertEnv, token: string): string {
  const base = (env.PUBLIC_BASE_URL ?? 'https://frontguard.dev').replace(/\/$/, '');
  return `${base}/dashboard?invite=${encodeURIComponent(token)}`;
}

/** Builds the HTML body for an invitation email. Exposed for testing. */
export function buildInviteHtml(acceptUrl: string, teamName: string, role: string): string {
  return `<h2>You've been invited to join ${escapeHtml(teamName)} on Frontguard</h2>
<p>You've been invited as a <strong>${escapeHtml(role)}</strong>.</p>
<p><a href="${escapeHtml(acceptUrl)}">Accept your invitation</a></p>
<p>Or paste this link into your browser:<br/>${escapeHtml(acceptUrl)}</p>`;
}

/**
 * Sends an invitation email via Resend. Never throws.
 *
 * @param env - Worker bindings (RESEND_API_KEY, ALERT_FROM_EMAIL, PUBLIC_BASE_URL).
 * @param invitation - The invitation (must have an `email`).
 * @param teamName - Display name of the team.
 * @param fetchImpl - Override for testing.
 */
export async function sendInviteEmail(
  env: AlertEnv,
  invitation: TeamInvitation,
  teamName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InviteEmailResult> {
  if (!invitation.email) {
    return { ok: false, error: 'Invitation has no email recipient' };
  }
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const acceptUrl = buildAcceptUrl(env, invitation.token);
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.ALERT_FROM_EMAIL ?? 'alerts@frontguard.dev',
        to: [invitation.email],
        subject: `You've been invited to ${teamName} on Frontguard`,
        html: buildInviteHtml(acceptUrl, teamName, invitation.role),
      }),
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
