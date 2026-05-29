/**
 * Monitoring dashboard renderer (Task 6.3).
 *
 * Produces a self-contained dark-theme HTML page summarising a user's monitors:
 * status badges, last-run times, intervals, and recent run history. Pure
 * function (data → HTML string) so it's trivially testable.
 *
 * @module dashboard/render
 */

import type { Monitor } from '../db/monitors.js';
import type { Run } from '../types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Maps a monitor's last status to a badge class + label. */
function statusBadge(status?: string): string {
  switch (status) {
    case 'passed':
      return '<span class="badge ok">✓ Passing</span>';
    case 'regression':
      return '<span class="badge err">✘ Regression</span>';
    case 'error':
      return '<span class="badge warn">⚠ Error</span>';
    default:
      return '<span class="badge idle">• Not yet run</span>';
  }
}

/** Human-friendly relative time (e.g. "5m ago"). */
export function relativeTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Renders the dashboard page.
 *
 * @param monitors    - The user's monitors.
 * @param recentRuns  - Recent runs (for the activity feed).
 * @param now         - Current time (injectable for tests).
 */
export function renderDashboard(monitors: Monitor[], recentRuns: Run[], now = new Date()): string {
  const passing = monitors.filter((m) => m.lastStatus === 'passed').length;
  const failing = monitors.filter((m) => m.lastStatus === 'regression').length;
  const enabled = monitors.filter((m) => m.enabled).length;

  const monitorRows = monitors.length
    ? monitors
        .map(
          (m) => `<tr>
        <td>
          <div class="mname">${escapeHtml(m.name)}</div>
          <div class="murl">${escapeHtml(m.url)}</div>
        </td>
        <td>${statusBadge(m.lastStatus)}</td>
        <td>${m.routes.length} route${m.routes.length !== 1 ? 's' : ''}</td>
        <td>${m.intervalMinutes}m</td>
        <td>${relativeTime(m.lastRunAt, now)}</td>
        <td>${m.enabled ? '<span class="dot on"></span>On' : '<span class="dot off"></span>Off'}</td>
      </tr>`,
        )
        .join('\n')
    : `<tr><td colspan="6" class="empty">No monitors yet. Create one via <code>POST /v1/monitors</code>.</td></tr>`;

  const activity = recentRuns.length
    ? recentRuns
        .slice(0, 10)
        .map((r) => {
          const regr = r.results?.filter((x) => x.classification === 'regression').length ?? 0;
          return `<li>
          <span class="atime">${relativeTime(r.completedAt ?? r.createdAt, now)}</span>
          <span class="aurl">${escapeHtml(r.url)}</span>
          <span class="badge ${regr > 0 ? 'err' : 'ok'}">${regr > 0 ? `${regr} regression(s)` : 'clean'}</span>
        </li>`;
        })
        .join('\n')
    : '<li class="empty">No recent runs.</li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Frontguard — Monitoring</title>
<style>
  :root { --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text); }
  header { padding:24px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; }
  header h1 { font-size:18px; margin:0; }
  .wrap { max-width:1000px; margin:0 auto; padding:24px; }
  .stats { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px 20px; flex:1; min-width:120px; }
  .stat .n { font-size:28px; font-weight:700; }
  .stat .l { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  th,td { text-align:left; padding:12px 16px; border-bottom:1px solid var(--border); font-size:14px; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; }
  tr:last-child td { border-bottom:none; }
  .mname { font-weight:600; }
  .murl { color:var(--muted); font-size:12px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; }
  .badge.ok { background:rgba(63,185,80,.15); color:#3fb950; }
  .badge.err { background:rgba(248,81,73,.15); color:#ff7b72; }
  .badge.warn { background:rgba(210,153,34,.15); color:#e3b341; }
  .badge.idle { background:rgba(139,148,158,.15); color:var(--muted); }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .dot.on { background:#3fb950; } .dot.off { background:var(--muted); }
  h2 { font-size:15px; margin:32px 0 12px; }
  ul.activity { list-style:none; padding:0; margin:0; background:var(--panel); border:1px solid var(--border); border-radius:8px; }
  ul.activity li { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--border); font-size:14px; }
  ul.activity li:last-child { border-bottom:none; }
  .atime { color:var(--muted); font-size:12px; min-width:70px; }
  .aurl { flex:1; }
  .empty { color:var(--muted); text-align:center; }
  code { background:rgba(110,118,129,.2); padding:2px 6px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>
<header><h1>🛡 Frontguard Monitoring</h1></header>
<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="n">${monitors.length}</div><div class="l">Monitors</div></div>
    <div class="stat"><div class="n">${enabled}</div><div class="l">Enabled</div></div>
    <div class="stat"><div class="n" style="color:#3fb950">${passing}</div><div class="l">Passing</div></div>
    <div class="stat"><div class="n" style="color:#ff7b72">${failing}</div><div class="l">Failing</div></div>
  </div>

  <table>
    <thead><tr><th>Monitor</th><th>Status</th><th>Routes</th><th>Interval</th><th>Last run</th><th>State</th></tr></thead>
    <tbody>${monitorRows}</tbody>
  </table>

  <h2>Recent activity</h2>
  <ul class="activity">${activity}</ul>
</div>
</body>
</html>`;
}
