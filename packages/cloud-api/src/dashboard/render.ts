/**
 * Monitoring dashboard renderer (Task 6.3).
 *
 * Produces a self-contained dark-theme HTML page summarising a user's monitors:
 * status badges, last-run times, intervals, and recent run history. Pure
 * function (data → HTML string) so it's trivially testable.
 *
 * @module dashboard/render
 */

import type { Monitor, MonitorRun } from '../db/monitors.js';
import type { ScreenshotRecord } from '../db/store.js';
import type { Run } from '../types.js';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Shared dark-theme stylesheet used across all dashboard pages. */
const SHARED_STYLES = `
  :root { --bg:#0d1117; --panel:#161b22; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text); }
  header { padding:24px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; }
  header h1 { font-size:18px; margin:0; }
  header a { color:var(--accent); text-decoration:none; font-size:14px; margin-left:auto; }
  .wrap { max-width:1000px; margin:0 auto; padding:24px; }
  a { color:var(--accent); }
  .stats { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px 20px; flex:1; min-width:120px; }
  .stat .n { font-size:28px; font-weight:700; }
  .stat .l { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  th,td { text-align:left; padding:12px 16px; border-bottom:1px solid var(--border); font-size:14px; vertical-align:top; }
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
  form.inline { display:inline; margin:0; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:20px; margin-bottom:24px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input, textarea, select { width:100%; padding:8px 10px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:14px; font-family:inherit; }
  .grid2 { display:flex; gap:16px; flex-wrap:wrap; }
  .grid2 > div { flex:1; min-width:180px; }
  button, .btn { cursor:pointer; padding:6px 12px; border-radius:6px; border:1px solid var(--border); background:var(--panel); color:var(--text); font-size:13px; font-weight:600; text-decoration:none; display:inline-block; }
  button.primary { background:var(--accent); color:#0d1117; border-color:var(--accent); margin-top:16px; }
  button.danger { color:#ff7b72; border-color:rgba(248,81,73,.4); }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .shots { display:flex; gap:16px; flex-wrap:wrap; }
  .shot { flex:1; min-width:200px; }
  .shot img { width:100%; border:1px solid var(--border); border-radius:6px; background:#000; }
  .shot .cap { color:var(--muted); font-size:12px; margin-bottom:6px; text-transform:uppercase; }
  .group { margin-bottom:24px; }
  .login { max-width:420px; margin:80px auto; text-align:center; }
  .login .btn { margin-top:20px; font-size:15px; padding:10px 20px; }
`;

/** Renders the standard dark-theme document shell. */
function page(title: string, bodyInner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>${SHARED_STYLES}</style>
</head>
<body>
${bodyInner}
</body>
</html>`;
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
 * Renders the dashboard page. When `sessioned` is true, interactive CRUD forms
 * and per-row controls are included (browser dashboard at `/dashboard`); when
 * false the page is read-only (back-compat `/v1/dashboard`).
 *
 * @param monitors    - The user's monitors.
 * @param recentRuns  - Recent runs (for the activity feed).
 * @param now         - Current time (injectable for tests).
 * @param sessioned   - Whether to render interactive CRUD controls.
 */
export function renderDashboard(
  monitors: Monitor[],
  recentRuns: Run[],
  now = new Date(),
  sessioned = false,
): string {
  const passing = monitors.filter((m) => m.lastStatus === 'passed').length;
  const failing = monitors.filter((m) => m.lastStatus === 'regression').length;
  const enabled = monitors.filter((m) => m.enabled).length;

  const actionsCol = sessioned ? '<th>Actions</th>' : '';
  const colspan = sessioned ? 7 : 6;

  const monitorRows = monitors.length
    ? monitors
        .map((m) => {
          const nameCell = sessioned
            ? `<a href="/dashboard/monitors/${escapeHtml(m.id)}" class="mname">${escapeHtml(m.name)}</a>`
            : `<div class="mname">${escapeHtml(m.name)}</div>`;
          const actions = sessioned
            ? `<td><div class="actions">
          <form class="inline" method="post" action="/dashboard/monitors/${escapeHtml(m.id)}/toggle"><button type="submit">${m.enabled ? 'Disable' : 'Enable'}</button></form>
          <form class="inline" method="post" action="/dashboard/monitors/${escapeHtml(m.id)}/delete"><button type="submit" class="danger">Delete</button></form>
        </div></td>`
            : '';
          return `<tr>
        <td>
          ${nameCell}
          <div class="murl">${escapeHtml(m.url)}</div>
        </td>
        <td>${statusBadge(m.lastStatus)}</td>
        <td>${m.routes.length} route${m.routes.length !== 1 ? 's' : ''}</td>
        <td>${m.intervalMinutes}m</td>
        <td>${relativeTime(m.lastRunAt, now)}</td>
        <td>${m.enabled ? '<span class="dot on"></span>On' : '<span class="dot off"></span>Off'}</td>
        ${actions}
      </tr>`;
        })
        .join('\n')
    : `<tr><td colspan="${colspan}" class="empty">No monitors yet.${sessioned ? ' Create one below.' : ' Create one via <code>POST /v1/monitors</code>.'}</td></tr>`;

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

  const createForm = sessioned ? renderCreateForm() : '';
  const headerExtra = sessioned ? '<a href="/auth/github?redirect=/dashboard">Account</a>' : '';

  const inner = `<header><h1>🛡 Frontguard Monitoring</h1>${headerExtra}</header>
<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="n">${monitors.length}</div><div class="l">Monitors</div></div>
    <div class="stat"><div class="n">${enabled}</div><div class="l">Enabled</div></div>
    <div class="stat"><div class="n" style="color:#3fb950">${passing}</div><div class="l">Passing</div></div>
    <div class="stat"><div class="n" style="color:#ff7b72">${failing}</div><div class="l">Failing</div></div>
  </div>

  <table>
    <thead><tr><th>Monitor</th><th>Status</th><th>Routes</th><th>Interval</th><th>Last run</th><th>State</th>${actionsCol}</tr></thead>
    <tbody>${monitorRows}</tbody>
  </table>
${createForm}
  <h2>Recent activity</h2>
  <ul class="activity">${activity}</ul>
</div>`;

  return page('Frontguard — Monitoring', inner);
}

/** Renders the "create monitor" form (incl. alert channel fields). */
function renderCreateForm(): string {
  return `
  <h2>Create monitor</h2>
  <div class="card">
    <form method="post" action="/dashboard/monitors">
      <div class="grid2">
        <div><label>Name</label><input name="name" required placeholder="Marketing site"/></div>
        <div><label>URL</label><input name="url" required type="url" placeholder="https://example.com"/></div>
      </div>
      <div class="grid2">
        <div><label>Routes (comma-separated)</label><input name="routes" placeholder="/, /pricing, /blog"/></div>
        <div><label>Interval (minutes)</label><input name="intervalMinutes" type="number" value="60" min="5"/></div>
      </div>
      <div class="grid2">
        <div><label>Alert threshold (0–1)</label><input name="alertThreshold" type="number" step="0.01" value="0.05"/></div>
        <div><label>Slack webhook URL</label><input name="slack" type="url" placeholder="https://hooks.slack.com/…"/></div>
      </div>
      <label>Alert emails (comma-separated)</label>
      <input name="email" placeholder="alerts@example.com, oncall@example.com"/>
      <button type="submit" class="primary">Create monitor</button>
    </form>
  </div>`;
}

/** Renders the login page with a "Sign in with GitHub" button. */
export function renderLogin(): string {
  const inner = `<header><h1>🛡 Frontguard Monitoring</h1></header>
<div class="wrap">
  <div class="login">
    <h2>Sign in to your dashboard</h2>
    <p class="murl">Authenticate with GitHub to manage your monitors.</p>
    <a class="btn primary" href="/auth/github?redirect=/dashboard">Sign in with GitHub</a>
  </div>
</div>`;
  return page('Frontguard — Sign in', inner);
}

/** Maps a monitor-run status to a badge. */
function runStatusBadge(status: string): string {
  switch (status) {
    case 'passed':
      return '<span class="badge ok">✓ passed</span>';
    case 'regression':
      return '<span class="badge err">✘ regression</span>';
    default:
      return '<span class="badge warn">⚠ error</span>';
  }
}

/**
 * Renders the per-monitor detail page: configuration, an editable alert config
 * + snooze form, and a timeline of recent runs (newest first).
 *
 * @param monitor - The monitor.
 * @param runs    - Recent monitor runs (already newest-first).
 * @param now     - Current time (injectable for tests).
 */
export function renderMonitorDetail(monitor: Monitor, runs: MonitorRun[], now = new Date()): string {
  const id = escapeHtml(monitor.id);
  const slack = escapeHtml(monitor.alerts?.slack ?? '');
  const emails = escapeHtml((monitor.alerts?.email ?? []).join(', '));

  const timeline = runs.length
    ? runs
        .map((r) => {
          const runLink = r.id
            ? `<a href="/dashboard/runs/${escapeHtml(r.id)}">View screenshots</a>`
            : '';
          return `<tr>
        <td>${relativeTime(r.createdAt, now)}</td>
        <td>${runStatusBadge(r.status)}</td>
        <td>${r.regressionsCount}</td>
        <td>${r.attempts}</td>
        <td>${runLink}</td>
      </tr>`;
        })
        .join('\n')
    : '<tr><td colspan="5" class="empty">No runs recorded yet.</td></tr>';

  const inner = `<header><h1>🛡 ${escapeHtml(monitor.name)}</h1><a href="/dashboard">← Dashboard</a></header>
<div class="wrap">
  <div class="card">
    <div class="mname">${escapeHtml(monitor.name)}</div>
    <div class="murl">${escapeHtml(monitor.url)}</div>
    <p>${statusBadge(monitor.lastStatus)} · ${monitor.routes.length} route(s) · every ${monitor.intervalMinutes}m · ${monitor.enabled ? 'Enabled' : 'Disabled'}</p>
  </div>

  <h2>Alert configuration</h2>
  <div class="card">
    <form method="post" action="/dashboard/monitors/${id}/alerts">
      <div class="grid2">
        <div><label>Alert threshold (0–1)</label><input name="alertThreshold" type="number" step="0.01" value="${monitor.alertThreshold}"/></div>
        <div><label>Slack webhook URL</label><input name="slack" type="url" value="${slack}" placeholder="https://hooks.slack.com/…"/></div>
      </div>
      <label>Alert emails (comma-separated)</label>
      <input name="email" value="${emails}" placeholder="alerts@example.com"/>
      <button type="submit" class="primary">Save alerts</button>
    </form>
  </div>

  <h2>Snooze alerts</h2>
  <div class="card">
    <form method="post" action="/dashboard/monitors/${id}/snooze" class="actions">
      <input name="hours" type="number" value="24" min="0" max="720" style="max-width:120px"/>
      <button type="submit">Snooze (hours)</button>
    </form>
    <p class="murl">Set 0 to clear an active snooze.</p>
  </div>

  <h2>Run timeline</h2>
  <table>
    <thead><tr><th>When</th><th>Status</th><th>Regressions</th><th>Attempts</th><th></th></tr></thead>
    <tbody>${timeline}</tbody>
  </table>
</div>`;
  return page(`Frontguard — ${monitor.name}`, inner);
}

/**
 * Renders the screenshot comparison page for a run, grouping screenshots by
 * route + viewport and showing baseline | current | diff side by side.
 * Image `src` URLs point at the session-authed `/dashboard/screenshots/...`
 * route (not the `/v1` guard).
 *
 * @param runId       - The run id.
 * @param screenshots - Screenshot metadata for the run.
 */
export function renderScreenshotComparison(runId: string, screenshots: ScreenshotRecord[]): string {
  const rid = escapeHtml(runId);
  // Group by `route|viewport`.
  const groups = new Map<string, ScreenshotRecord[]>();
  for (const s of screenshots) {
    const key = `${s.route}|${s.viewport}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const groupsHtml = groups.size
    ? [...groups.entries()]
        .map(([key, shots]) => {
          const [route, viewport] = key.split('|');
          const cols = (['baseline', 'current', 'diff'] as const)
            .map((type) => {
              const shot = shots.find((s) => s.type === type);
              const img = shot
                ? `<img alt="${escapeHtml(type)}" src="/dashboard/screenshots/${rid}/${escapeHtml(shot.id)}/raw"/>`
                : '<div class="murl">— none —</div>';
              return `<div class="shot"><div class="cap">${type}</div>${img}</div>`;
            })
            .join('\n');
          return `<div class="group">
        <h2>${escapeHtml(route)} @ ${escapeHtml(viewport)}px</h2>
        <div class="shots">${cols}</div>
      </div>`;
        })
        .join('\n')
    : '<p class="empty">No screenshots captured for this run.</p>';

  const inner = `<header><h1>🛡 Screenshot comparison</h1><a href="/dashboard">← Dashboard</a></header>
<div class="wrap">
  <p class="murl">Run <code>${rid}</code></p>
  ${groupsHtml}
</div>`;
  return page('Frontguard — Screenshots', inner);
}
