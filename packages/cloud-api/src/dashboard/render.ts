/**
 * Monitoring dashboard renderer (Task 6.3).
 *
 * Produces a self-contained dark-theme HTML page summarising a user's monitors:
 * status badges, last-run times, intervals, and recent run history. Pure
 * function (data → HTML string) so it's trivially testable.
 *
 * @module dashboard/render
 */

import type { Monitor, MonitorRun, MonitorAlertState } from '../db/monitors.js';
import type { ScreenshotRecord, ScreenshotDecision } from '../db/store.js';
import type { IgnoreMask } from '../db/masks.js';
import type { RunAttachment } from '../db/attachments.js';
import { attachmentLabel } from '../db/attachments.js';
import type { Run } from '../types.js';
import { flakeScore, renderFlakeBadge } from './flake.js';

/** Slugifies a route path the same way screenshotKey() does. */
function routeSlug(route: string): string {
  return route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
}

/**
 * Stable group key for a screenshot's (route, viewport, browser) triple.
 * The diff viewer uses this to pair a diff with its baseline/current siblings.
 */
export function screenshotGroupKey(s: Pick<ScreenshotRecord, 'route' | 'viewport' | 'browser'>): string {
  return `${routeSlug(s.route)}|${s.viewport}|${s.browser}`;
}

/** Spend-cap header data for the dashboard. */
export interface SpendCap {
  /** Current month's run count. */
  runs: number;
  /** Plan's monthly run limit (null = unlimited). */
  runsLimit: number | null;
  /** Plan display name (Free, Pro, Business). */
  planName: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Shared warm industrial dark-theme stylesheet used across all dashboard pages. */
const SHARED_STYLES = `
  :root { --bg:#0d0c0b; --panel:#131210; --panel-raised:#1f1c19; --border:#2a2622; --text:#f5f1ea; --muted:#8c847a; --accent:#e8862e; --accent-hi:#f59b45; --green:#4fb477; --amber:#e8862e; --red:#e5484d; --mono:'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  * { box-sizing: border-box; }
  :focus-visible { outline: 2px solid var(--accent-hi); outline-offset: 2px; }
  body { margin:0; font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text); }
  .skip-link { position:absolute; left:-9999px; top:8px; z-index:100; padding:8px 14px; background:var(--accent); color:#0d0c0b; font-weight:700; border-radius:6px; text-decoration:none; }
  .skip-link:focus { left:16px; }
  header { padding:20px 24px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; background:var(--panel); }
  header h1 { font-size:18px; margin:0; letter-spacing:-0.01em; }
  header a { color:var(--accent); text-decoration:none; font-size:14px; margin-left:auto; }
  .wrap { max-width:1040px; margin:0 auto; padding:24px; }
  a { color:var(--accent); }
  .stats { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px 20px; flex:1; min-width:120px; }
  .stat .n { font-size:28px; font-weight:700; font-variant-numeric: tabular-nums; font-family:var(--mono); }
  .stat .l { color:var(--muted); font-size:13px; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  th,td { text-align:left; padding:12px 16px; border-bottom:1px solid var(--border); font-size:14px; vertical-align:top; font-variant-numeric: tabular-nums; }
  th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; background:var(--panel-raised); }
  tr:last-child td { border-bottom:none; }
  .mname { font-weight:600; }
  .murl { color:var(--muted); font-size:12px; font-family:var(--mono); }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; font-variant-numeric: tabular-nums; }
  .badge.ok { background:rgba(79,180,119,.15); color:var(--green); }
  .badge.err { background:rgba(229,72,77,.15); color:var(--red); }
  .badge.warn { background:rgba(232,134,46,.15); color:var(--amber); }
  .badge.idle { background:rgba(140,132,122,.15); color:var(--muted); }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .dot.on { background:var(--green); } .dot.off { background:var(--muted); }
  h2 { font-size:15px; margin:32px 0 12px; letter-spacing:-0.01em; }
  ul.activity { list-style:none; padding:0; margin:0; background:var(--panel); border:1px solid var(--border); border-radius:8px; }
  ul.activity li { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--border); font-size:14px; }
  ul.activity li:last-child { border-bottom:none; }
  .atime { color:var(--muted); font-size:12px; min-width:70px; font-family:var(--mono); font-variant-numeric: tabular-nums; }
  .aurl { flex:1; font-family:var(--mono); font-size:13px; }
  .empty { color:var(--muted); text-align:center; }
  code { background:rgba(245,241,234,.08); padding:2px 6px; border-radius:4px; font-size:12px; font-family:var(--mono); }
  form.inline { display:inline; margin:0; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:20px; margin-bottom:24px; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input, textarea, select { width:100%; padding:8px 10px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:14px; font-family:inherit; }
  .grid2 { display:flex; gap:16px; flex-wrap:wrap; }
  .grid2 > div { flex:1; min-width:180px; }
  button, .btn { cursor:pointer; padding:6px 12px; border-radius:6px; border:1px solid var(--border); background:var(--panel-raised); color:var(--text); font-size:13px; font-weight:600; text-decoration:none; display:inline-block; }
  button.primary, .btn.primary { background:var(--accent); color:#0d0c0b; border-color:var(--accent); margin-top:16px; }
  button.primary:hover, .btn.primary:hover { background:var(--accent-hi); border-color:var(--accent-hi); }
  button.danger { color:var(--red); border-color:rgba(229,72,77,.4); }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .shots { display:flex; gap:16px; flex-wrap:wrap; }
  .shot { flex:1; min-width:200px; }
  .shot img { width:100%; border:1px solid var(--border); border-radius:6px; background:#000; }
  .shot .cap { color:var(--muted); font-size:12px; margin-bottom:6px; text-transform:uppercase; font-family:var(--mono); }
  .group { margin-bottom:24px; }
  .login { max-width:420px; margin:80px auto; text-align:center; }
  .login .btn { margin-top:20px; font-size:15px; padding:10px 20px; }
  .snooze-banner { display:flex; align-items:center; gap:8px; padding:10px 14px; margin-bottom:16px; background:rgba(232,134,46,.12); border:1px solid var(--amber); border-radius:8px; color:var(--amber); font-size:13px; font-weight:600; }
  .run-summary { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 16px; margin-bottom:16px; background:var(--panel); border:1px solid var(--border); border-radius:8px; font-size:13px; }

  /* --- Flake badge (Task 15.2) ----------------------------------------- */
  .flake { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:700; font-variant-numeric: tabular-nums; font-family:var(--mono); }
  .flake-dot { width:6px; height:6px; border-radius:50%; }
  .flake-green { background:rgba(79,180,119,.14); color:var(--green); }
  .flake-green .flake-dot { background:var(--green); }
  .flake-yellow { background:rgba(232,134,46,.16); color:var(--amber); }
  .flake-yellow .flake-dot { background:var(--amber); }
  .flake-red { background:rgba(229,72,77,.16); color:var(--red); }
  .flake-red .flake-dot { background:var(--red); }

  /* --- Spend-cap header bar (Task 15.7) -------------------------------- */
  .spend { display:flex; align-items:center; gap:10px; padding:6px 12px; border:1px solid var(--border); border-radius:8px; font-size:12px; background:var(--panel-raised); }
  .spend .label { color:var(--muted); }
  .spend .bar { width:120px; height:6px; background:var(--bg); border-radius:3px; overflow:hidden; }
  .spend .fill { height:100%; background:var(--green); transition:width .2s; }
  .spend.warn .fill { background:var(--amber); }
  .spend.crit .fill { background:var(--red); }
  .spend.crit { border-color:rgba(229,72,77,.4); }
  .spend strong { color:var(--text); font-weight:700; font-variant-numeric: tabular-nums; font-family:var(--mono); }

  /* --- History page filters (Task 15.1) -------------------------------- */
  .filters { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 20px; }
  .filters .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:14px; border:1px solid var(--border); background:var(--panel); color:var(--text); font-size:12px; text-decoration:none; }
  .filters .chip.active { border-color:var(--accent); color:var(--accent); }
  .filters select { width:auto; padding:4px 8px; font-size:12px; }
  th a, th a:visited { color:var(--muted); text-decoration:none; }
  th a.sorted { color:var(--accent); }

  /* --- Diff viewer (Task 15.3) ----------------------------------------- */
  .viewer-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:16px; padding:10px 14px; background:var(--panel); border:1px solid var(--border); border-radius:8px; }
  .viewer-toolbar .spacer { flex:1; }
  .viewer-toolbar kbd { background:var(--panel-raised); border:1px solid var(--border); border-radius:4px; padding:1px 6px; font-size:11px; font-family:var(--mono); color:var(--muted); }
  .viewer-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px; }
  .viewer-cell { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:12px; position:relative; }
  .viewer-cell .cap { color:var(--muted); font-size:12px; text-transform:uppercase; margin-bottom:8px; letter-spacing:.04em; font-family:var(--mono); }
  .viewer-cell img { width:100%; display:block; border-radius:4px; background:#000; }
  .viewer-cell .ph { color:var(--muted); text-align:center; padding:40px 12px; border:1px dashed var(--border); border-radius:4px; }
  .viewer-stage { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px; position:relative; min-height:400px; }
  .viewer-stage .stage-inner { position:relative; display:inline-block; max-width:100%; }
  .viewer-stage img { display:block; max-width:100%; }
  .viewer-stage .layer { position:absolute; inset:0; pointer-events:none; }
  .viewer-stage .layer.diff-overlay { mix-blend-mode:screen; opacity:.85; }
  .viewer-stage .layer.heatmap { filter:hue-rotate(180deg) saturate(2.5) contrast(1.5); opacity:.85; }
  .viewer-stage .mask { position:absolute; background:rgba(232,134,46,.18); border:2px dashed var(--accent); box-sizing:border-box; }
  .viewer-stage.painting { cursor:crosshair; }
  .viewer-stage.painting .layer { pointer-events:auto; }
  .nav-arrows { display:flex; gap:8px; align-items:center; }
  .nav-arrows a, .nav-arrows .disabled { padding:4px 10px; border:1px solid var(--border); border-radius:6px; font-size:12px; color:var(--accent); text-decoration:none; }
  .nav-arrows .disabled { color:var(--muted); opacity:.5; pointer-events:none; }

  /* --- Bulk approve (Task 15.4) ---------------------------------------- */
  .bulk-bar { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--panel); border:1px solid var(--border); border-radius:8px; margin-bottom:16px; }
  .bulk-bar .count { font-weight:700; font-variant-numeric: tabular-nums; }
  .bulk-bar .actions { margin-left:auto; }
  .group .group-head { display:flex; align-items:center; gap:10px; margin:24px 0 8px; }
  .group .group-head h2 { margin:0; }
  .group .group-head input[type=checkbox] { width:16px; height:16px; accent-color:var(--accent); margin:0; }
  .group .group-decision { font-size:12px; padding:2px 8px; border-radius:10px; }
  .group .group-decision.accepted { background:rgba(79,180,119,.15); color:var(--green); }
  .group .group-decision.rejected { background:rgba(229,72,77,.15); color:var(--red); }

  /* --- Attachments + masks settings (Tasks 15.5/15.6) ----------------- */
  ul.attachments { list-style:none; padding:0; margin:0; background:var(--panel); border:1px solid var(--border); border-radius:8px; }
  ul.attachments li { display:flex; gap:12px; align-items:center; padding:10px 14px; border-bottom:1px solid var(--border); font-size:13px; }
  ul.attachments li:last-child { border-bottom:none; }
  ul.attachments .kind { color:var(--muted); min-width:90px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; font-family:var(--mono); }
  ul.attachments .size { color:var(--muted); font-size:12px; margin-left:auto; font-family:var(--mono); font-variant-numeric: tabular-nums; }
  .mask-thumb { display:flex; gap:12px; align-items:center; padding:10px 14px; border-bottom:1px solid var(--border); }
  .mask-thumb .swatch { width:48px; height:32px; border:2px dashed var(--accent); background:rgba(232,134,46,.18); border-radius:4px; flex-shrink:0; }
  .mask-thumb .meta { flex:1; font-size:13px; }
  .mask-thumb .meta .where { color:var(--muted); font-size:12px; font-family:var(--mono); }

  /* --- Responsive breakpoints ------------------------------------------ */
  @media (max-width: 768px) {
    header { flex-wrap:wrap; padding:16px; }
    header a { margin-left:0; }
    .wrap { padding:16px; }
    table { display:block; overflow-x:auto; -webkit-overflow-scrolling:touch; }
    .viewer-grid { grid-template-columns:1fr; }
    .viewer-toolbar { gap:6px; padding:10px; }
    .bulk-bar { flex-wrap:wrap; }
  }
  @media (max-width: 640px) {
    .stats { flex-direction:column; }
    .grid2 { flex-direction:column; }
    .shots { flex-direction:column; }
    ul.activity li { flex-wrap:wrap; }
    .group .group-head { flex-wrap:wrap; }
  }
`;

/** Renders the standard dark-theme document shell. */
function page(title: string, bodyInner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<style>${SHARED_STYLES}</style>
</head>
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>
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
 * Renders the spend-cap progress chip shown in the dashboard header (Task 15.7).
 * Returns an empty string when the plan is unlimited. Colour transitions:
 * green < 80%, yellow 80–94%, red ≥ 95%.
 */
export function renderSpendChip(cap?: SpendCap): string {
  if (!cap || cap.runsLimit == null) {
    return cap?.planName
      ? `<div class="spend"><span class="label">Plan:</span><strong>${escapeHtml(cap.planName)}</strong><span class="label">Unlimited</span></div>`
      : '';
  }
  const ratio = cap.runsLimit > 0 ? Math.min(1, cap.runs / cap.runsLimit) : 0;
  const pct = Math.round(ratio * 100);
  const tier = pct >= 95 ? 'crit' : pct >= 80 ? 'warn' : '';
  return `<div class="spend ${tier}" title="${cap.runs} of ${cap.runsLimit} runs used on the ${escapeHtml(cap.planName)} plan">
    <span class="label">${escapeHtml(cap.planName)} usage</span>
    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
    <strong>${cap.runs}/${cap.runsLimit}</strong>
    <span class="label">(${pct}%)</span>
  </div>`;
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
 * @param flakeByMonitor - Optional per-monitor stability score (0–100).
 * @param spend       - Optional spend-cap info for the header bar.
 */
export function renderDashboard(
  monitors: Monitor[],
  recentRuns: Run[],
  now = new Date(),
  sessioned = false,
  flakeByMonitor: Record<string, number> = {},
  spend?: SpendCap,
): string {
  const passing = monitors.filter((m) => m.lastStatus === 'passed').length;
  const failing = monitors.filter((m) => m.lastStatus === 'regression').length;
  const enabled = monitors.filter((m) => m.enabled).length;

  const actionsCol = sessioned ? '<th>Actions</th>' : '';
  const colspan = sessioned ? 8 : 7;

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
          const flake = renderFlakeBadge(flakeByMonitor[m.id] ?? 100);
          return `<tr>
        <td>
          ${nameCell}
          <div class="murl">${escapeHtml(m.url)}</div>
        </td>
        <td>${statusBadge(m.lastStatus)}</td>
        <td>${flake}</td>
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
          const urlEl =
            sessioned && r.id
              ? `<a href="/dashboard/runs/${escapeHtml(r.id)}" class="aurl">${escapeHtml(r.url)}</a>`
              : `<span class="aurl">${escapeHtml(r.url)}</span>`;
          return `<li>
          <span class="atime">${relativeTime(r.completedAt ?? r.createdAt, now)}</span>
          ${urlEl}
          <span class="badge ${regr > 0 ? 'err' : 'ok'}">${regr > 0 ? `${regr} regression(s)` : 'clean'}</span>
        </li>`;
        })
        .join('\n')
    : '<li class="empty">No recent runs.</li>';

  const createForm = sessioned ? renderCreateForm() : '';
  const spendChip = sessioned ? renderSpendChip(spend) : '';
  const settingsLink = sessioned ? '<a href="/dashboard/settings/masks">Masks</a>' : '';
  const headerExtra = sessioned
    ? `${spendChip}${settingsLink}<a href="/auth/github?redirect=/dashboard">Account</a>`
    : '';

  const inner = `<header><h1>🛡 Frontguard Monitoring</h1>${headerExtra}</header>
<div class="wrap" id="main-content" role="main">
  <div class="stats">
    <div class="stat"><div class="n">${monitors.length}</div><div class="l">Monitors</div></div>
    <div class="stat"><div class="n">${enabled}</div><div class="l">Enabled</div></div>
    <div class="stat"><div class="n" style="color:var(--green)">${passing}</div><div class="l">Passing</div></div>
    <div class="stat"><div class="n" style="color:var(--red)">${failing}</div><div class="l">Failing</div></div>
  </div>

  <table>
    <thead><tr><th>Monitor</th><th>Status</th><th>Stability</th><th>Routes</th><th>Interval</th><th>Last run</th><th>State</th>${actionsCol}</tr></thead>
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
        <div><label for="create-name">Name</label><input id="create-name" name="name" required placeholder="Marketing site"/></div>
        <div><label for="create-url">URL</label><input id="create-url" name="url" required type="url" placeholder="https://example.com"/></div>
      </div>
      <div class="grid2">
        <div><label for="create-routes">Routes (comma-separated)</label><input id="create-routes" name="routes" placeholder="/, /pricing, /blog"/></div>
        <div><label for="create-interval">Interval (minutes)</label><input id="create-interval" name="intervalMinutes" type="number" value="60" min="5"/></div>
      </div>
      <div class="grid2">
        <div><label for="create-threshold">Alert threshold (0–1)</label><input id="create-threshold" name="alertThreshold" type="number" min="0" max="1" step="0.01" value="0.05"/></div>
        <div><label for="create-slack">Slack webhook URL</label><input id="create-slack" name="slack" type="url" placeholder="https://hooks.slack.com/…"/></div>
      </div>
      <label for="create-email">Alert emails (comma-separated)</label>
      <input id="create-email" name="email" placeholder="alerts@example.com, oncall@example.com"/>
      <button type="submit" class="primary">Create monitor</button>
    </form>
  </div>`;
}

/** Renders the login page with a "Sign in with GitHub" button. */
export function renderLogin(): string {
  const inner = `<header><h1>🛡 Frontguard Monitoring</h1></header>
<div class="wrap" id="main-content" role="main">
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
    case 'completed':
      return '<span class="badge ok">✓ completed</span>';
    case 'regression':
      return '<span class="badge err">✘ regression</span>';
    case 'failed':
      return '<span class="badge err">✘ failed</span>';
    case 'running':
    case 'queued':
      return `<span class="badge idle">• ${escapeHtml(status)}</span>`;
    default:
      return '<span class="badge warn">⚠ error</span>';
  }
}

/**
 * Renders the per-monitor detail page: configuration, an editable alert config
 * + snooze form, and a timeline of recent runs (newest first).
 *
 * @param monitor    - The monitor.
 * @param runs       - Recent monitor runs (already newest-first).
 * @param now        - Current time (injectable for tests).
 * @param alertState - Optional alert state for active snooze banner.
 */
export function renderMonitorDetail(
  monitor: Monitor,
  runs: MonitorRun[],
  now: Date | number = new Date(),
  alertState?: MonitorAlertState | null,
): string {
  const nowDate = typeof now === 'number' ? new Date(now) : now;
  const id = escapeHtml(monitor.id);
  const slack = escapeHtml(monitor.alerts?.slack ?? '');
  const emails = escapeHtml((monitor.alerts?.email ?? []).join(', '));
  const score = flakeScore(runs);
  const badge = renderFlakeBadge(score);

  const isSnoozed =
    alertState?.snoozedUntil && new Date(alertState.snoozedUntil).getTime() > nowDate.getTime();
  const snoozeBanner = isSnoozed
    ? `<div class="snooze-banner">⏸ Alerts snoozed until ${escapeHtml(alertState!.snoozedUntil!)}</div>`
    : '';

  const timeline = runs.length
    ? runs
        .map((r) => {
          const runLink = r.id
            ? `<a href="/dashboard/runs/${escapeHtml(r.id)}">View screenshots</a>`
            : '';
          return `<tr>
        <td>${relativeTime(r.createdAt, nowDate)}</td>
        <td>${runStatusBadge(r.status)}</td>
        <td>${r.regressionsCount}</td>
        <td>${r.attempts}</td>
        <td>${runLink}</td>
      </tr>`;
        })
        .join('\n')
    : '<tr><td colspan="5" class="empty">No runs recorded yet.</td></tr>';

  const inner = `<header><h1>🛡 ${escapeHtml(monitor.name)}</h1><a href="/dashboard">← Dashboard</a></header>
<div class="wrap" id="main-content" role="main">
  ${snoozeBanner}
  <div class="card">
    <div class="mname">${escapeHtml(monitor.name)}</div>
    <div class="murl">${escapeHtml(monitor.url)}</div>
    <p>${statusBadge(monitor.lastStatus)} · ${badge} · ${monitor.routes.length} route(s) · every ${monitor.intervalMinutes}m · ${monitor.enabled ? 'Enabled' : 'Disabled'}</p>
    <p><a class="btn" href="/dashboard/monitors/${id}/history">View 30-run history →</a></p>
  </div>

  <h2>Alert configuration</h2>
  <div class="card">
    <form method="post" action="/dashboard/monitors/${id}/alerts">
      <div class="grid2">
        <div><label for="alert-threshold">Alert threshold (0–1)</label><input id="alert-threshold" name="alertThreshold" type="number" min="0" max="1" step="0.01" value="${monitor.alertThreshold}"/></div>
        <div><label for="alert-slack">Slack webhook URL</label><input id="alert-slack" name="slack" type="url" value="${slack}" placeholder="https://hooks.slack.com/…"/></div>
      </div>
      <label for="alert-email">Alert emails (comma-separated)</label>
      <input id="alert-email" name="email" value="${emails}" placeholder="alerts@example.com"/>
      <button type="submit" class="primary">Save alerts</button>
    </form>
  </div>

  <h2>Snooze alerts</h2>
  <div class="card">
    <form method="post" action="/dashboard/monitors/${id}/snooze" class="actions">
      <input id="snooze-hours" name="hours" type="number" value="24" min="0" max="720" aria-label="Snooze hours" style="max-width:120px"/>
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
 * Renders the screenshot comparison page for a run. Groups screenshots by
 * route + viewport + browser; each group shows baseline | current | diff
 * side by side. When `sessioned` is true the page becomes interactive: each
 * group has a select checkbox feeding a sticky "Accept N baselines" bulk
 * action, and the diff thumbnail links to the full-screen diff viewer.
 *
 * Image `src` URLs point at the session-authed `/dashboard/screenshots/...`
 * route (not the `/v1` guard).
 *
 * @param runId       - The run id.
 * @param screenshots - Screenshot metadata for the run.
 * @param opts        - Optional interactive features and run metadata.
 */
export function renderScreenshotComparison(
  runId: string,
  screenshots: ScreenshotRecord[],
  opts: {
    sessioned?: boolean;
    decisions?: ScreenshotDecision[];
    attachments?: RunAttachment[];
    run?: Run | null;
  } = {},
): string {
  const rid = escapeHtml(runId);
  const sessioned = !!opts.sessioned;
  const decisions = opts.decisions ?? [];
  const decisionByShot = new Map<string, ScreenshotDecision>();
  for (const d of decisions) decisionByShot.set(d.screenshotId, d);

  // Group by `route|viewport|browser` so each (route, viewport, browser)
  // triple gets a self-contained baseline/current/diff trio.
  const groups = new Map<string, ScreenshotRecord[]>();
  for (const s of screenshots) {
    const key = screenshotGroupKey(s);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const groupsHtml = groups.size
    ? [...groups.entries()]
        .map(([key, shots]) => {
          const [routeSlugged, viewportStr, browser] = key.split('|');
          const diffShot = shots.find((s) => s.type === 'diff');
          const anyShot = shots[0];
          const route = anyShot.route;
          const viewportNum = anyShot.viewport;
          const decision = diffShot ? decisionByShot.get(diffShot.id) : undefined;
          const matchedResult =
            opts.run?.results?.find(
              (r) =>
                r.route === route &&
                r.viewport === viewportNum &&
                (!r.browser || !browser || r.browser === browser),
            ) ?? opts.run?.results?.find((r) => r.route === route && r.viewport === viewportNum);

          const cols = (['baseline', 'current', 'diff'] as const)
            .map((type) => {
              const shot = shots.find((s) => s.type === type);
              if (!shot) return `<div class="shot"><div class="cap">${type}</div><div class="murl">— none —</div></div>`;
              const img = `<img alt="${escapeHtml(type)}" src="/dashboard/screenshots/${rid}/${escapeHtml(shot.id)}/raw"/>`;
              if (type === 'diff' && sessioned) {
                return `<div class="shot"><div class="cap">${type}</div><a href="/dashboard/runs/${rid}/diffs/${escapeHtml(shot.id)}">${img}</a></div>`;
              }
              return `<div class="shot"><div class="cap">${type}</div>${img}</div>`;
            })
            .join('\n');

          const checkbox =
            sessioned && diffShot
              ? `<input type="checkbox" class="diff-select" name="diff_ids" value="${escapeHtml(diffShot.id)}" form="bulk-approve-form" aria-label="Select for bulk approve"/>`
              : '';
          const decisionLabel = decision
            ? `<span class="group-decision ${escapeHtml(decision.decision)}">${decision.decision}</span>`
            : '';
          const resultMeta = matchedResult
            ? `<span class="murl">${matchedResult.diffPercentage.toFixed(2)}%</span> <span class="badge ${(matchedResult.classification ?? matchedResult.status) === 'regression' ? 'err' : 'ok'}">${escapeHtml(matchedResult.classification ?? matchedResult.status)}</span>`
            : '';
          const viewerLink =
            sessioned && diffShot
              ? `<a class="btn" href="/dashboard/runs/${rid}/diffs/${escapeHtml(diffShot.id)}">Open diff viewer</a>`
              : '';

          return `<div class="group" data-key="${escapeHtml(routeSlugged)}-${escapeHtml(viewportStr)}">
        <div class="group-head">
          ${checkbox}
          <h2>${escapeHtml(route)} @ ${escapeHtml(viewportStr)}px${browser ? ' · ' + escapeHtml(browser) : ''}</h2>
          ${resultMeta}
          ${decisionLabel}
          <span class="spacer" style="flex:1"></span>
          ${viewerLink}
        </div>
        <div class="shots">${cols}</div>
      </div>`;
        })
        .join('\n')
    : '<p class="empty">No screenshots captured for this run.</p>';

  const diffShots = screenshots.filter((s) => s.type === 'diff');
  const bulkBar =
    sessioned && diffShots.length
      ? `<form id="bulk-approve-form" class="bulk-bar" method="post" action="/dashboard/runs/${rid}/approve" onsubmit="return confirmBulkApprove(event)">
    <span class="count" id="bulk-count">0 selected</span>
    <span class="label">Select diffs above and click Accept to promote those baselines.</span>
    <div class="actions">
      <button type="button" id="select-all" class="btn">Select all</button>
      <button type="submit" class="primary">Accept selected baselines</button>
    </div>
  </form>`
      : '';

  const attachmentsLink =
    sessioned && opts.attachments?.length
      ? `<p><a class="btn" href="/dashboard/runs/${rid}/attachments">View ${opts.attachments.length} attachment${opts.attachments.length === 1 ? '' : 's'} →</a></p>`
      : '';

  const runSummary = opts.run
    ? `<div class="run-summary">
    <span><strong>Target:</strong> <code>${escapeHtml(opts.run.url)}</code></span>
    ${runStatusBadge(opts.run.status)}
    <span class="murl">Created ${escapeHtml(opts.run.createdAt)}</span>
  </div>`
    : '';

  const bulkScript = sessioned
    ? `<script>
(function(){
  function updateCount(){
    var n = document.querySelectorAll('.diff-select:checked').length;
    var el = document.getElementById('bulk-count');
    if (el) el.textContent = n + ' selected';
  }
  document.addEventListener('change', function(e){
    if (e.target && e.target.classList && e.target.classList.contains('diff-select')) updateCount();
  });
  var sa = document.getElementById('select-all');
  if (sa) sa.addEventListener('click', function(){
    var boxes = document.querySelectorAll('.diff-select');
    var allOn = Array.prototype.every.call(boxes, function(b){ return b.checked; });
    boxes.forEach(function(b){ b.checked = !allOn; });
    updateCount();
  });
  window.confirmBulkApprove = function(e){
    var n = document.querySelectorAll('.diff-select:checked').length;
    if (n === 0) { e.preventDefault(); alert('Select at least one diff to accept.'); return false; }
    return confirm('Accept ' + n + ' baseline' + (n === 1 ? '' : 's') + '?');
  };
})();
</script>`
    : '';

  const inner = `<header><h1>🛡 Screenshot comparison</h1><a href="/dashboard">← Dashboard</a></header>
<div class="wrap" id="main-content" role="main">
  <p class="murl">Run <code>${rid}</code></p>
  ${runSummary}
  ${attachmentsLink}
  ${bulkBar}
  ${groupsHtml}
  ${bulkScript}
</div>`;
  return page('Frontguard — Screenshots', inner);
}

// ---------------------------------------------------------------------------
// Per-monitor history view (Task 15.1)
// ---------------------------------------------------------------------------

/** Filter parameters for the history view. */
export interface HistoryFilters {
  status?: 'all' | 'passed' | 'regression' | 'error';
  attempts?: 'all' | 'first-try' | 'retried';
  sort?: 'newest' | 'oldest';
}

/**
 * Renders the 30-run history page for a monitor. Each row shows status,
 * stability score, attempts, and a link to the run. Filterable by status +
 * retry state; sortable newest/oldest.
 *
 * Filtering and sorting happen in the renderer so the route can pass the raw
 * run list — keeps the store API simple.
 */
export function renderMonitorHistory(
  monitor: Monitor,
  runs: MonitorRun[],
  filters: HistoryFilters = {},
  now = new Date(),
): string {
  const status = filters.status ?? 'all';
  const attempts = filters.attempts ?? 'all';
  const sort = filters.sort ?? 'newest';
  const id = escapeHtml(monitor.id);

  let filtered = runs.slice();
  if (status !== 'all') filtered = filtered.filter((r) => r.status === status);
  if (attempts === 'first-try') filtered = filtered.filter((r) => r.attempts === 1);
  if (attempts === 'retried') filtered = filtered.filter((r) => r.attempts > 1);

  filtered.sort((a, b) => {
    const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sort === 'newest' ? -t : t;
  });

  const score = flakeScore(runs);
  const badge = renderFlakeBadge(score);

  function chipLink(group: 'status' | 'attempts', value: string, label: string): string {
    const active = (group === 'status' ? status : attempts) === value;
    const params = new URLSearchParams();
    params.set('status', group === 'status' ? value : status);
    params.set('attempts', group === 'attempts' ? value : attempts);
    params.set('sort', sort);
    return `<a class="chip${active ? ' active' : ''}" href="?${params.toString()}">${escapeHtml(label)}</a>`;
  }
  function sortLink(value: 'newest' | 'oldest', label: string): string {
    const params = new URLSearchParams();
    params.set('status', status);
    params.set('attempts', attempts);
    params.set('sort', value);
    const active = sort === value;
    return `<a class="${active ? 'sorted' : ''}" href="?${params.toString()}">${escapeHtml(label)}</a>`;
  }

  const rowsHtml = filtered.length
    ? filtered
        .map((r) => {
          const link = `<a href="/dashboard/runs/${escapeHtml(r.id)}">View →</a>`;
          return `<tr>
        <td>${relativeTime(r.createdAt, now)}</td>
        <td>${runStatusBadge(r.status)}</td>
        <td>${r.regressionsCount}</td>
        <td>${r.attempts}${r.attempts > 1 ? ' <span class="badge warn" style="font-size:10px">retried</span>' : ''}</td>
        <td>${link}</td>
      </tr>`;
        })
        .join('\n')
    : '<tr><td colspan="5" class="empty">No runs match the current filters.</td></tr>';

  const inner = `<header><h1>🛡 ${escapeHtml(monitor.name)} — history</h1><a href="/dashboard/monitors/${id}">← Monitor</a></header>
<div class="wrap" id="main-content" role="main">
  <div class="card">
    <div class="mname">${escapeHtml(monitor.name)}</div>
    <div class="murl">${escapeHtml(monitor.url)}</div>
    <p>Stability across last ${runs.length} run${runs.length === 1 ? '' : 's'}: ${badge}</p>
  </div>

  <div class="filters">
    <span class="label" style="color:var(--muted);align-self:center;margin-right:4px">Status:</span>
    ${chipLink('status', 'all', 'All')}
    ${chipLink('status', 'passed', 'Passed')}
    ${chipLink('status', 'regression', 'Regression')}
    ${chipLink('status', 'error', 'Error')}
    <span class="label" style="color:var(--muted);align-self:center;margin:0 4px 0 12px">Attempts:</span>
    ${chipLink('attempts', 'all', 'All')}
    ${chipLink('attempts', 'first-try', 'First try')}
    ${chipLink('attempts', 'retried', 'Retried')}
  </div>

  <table>
    <thead><tr>
      <th>${sortLink('newest', 'When ↓')} / ${sortLink('oldest', '↑')}</th>
      <th>Status</th>
      <th>Regressions</th>
      <th>Attempts</th>
      <th></th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>`;
  return page(`Frontguard — ${monitor.name} history`, inner);
}

// ---------------------------------------------------------------------------
// Diff viewer (Task 15.3)
// ---------------------------------------------------------------------------

/** A neighbour diff used for prev/next navigation in the viewer. */
export interface DiffNeighbour {
  id: string;
  route: string;
  viewport: number;
}

/** Inputs for the diff viewer page. */
export interface DiffViewerData {
  runId: string;
  diff: ScreenshotRecord;
  baseline?: ScreenshotRecord;
  current?: ScreenshotRecord;
  prev?: DiffNeighbour;
  next?: DiffNeighbour;
  masks: IgnoreMask[];
}

/**
 * Renders the full-screen diff viewer with overlay/heatmap/swipe toggle,
 * opacity/swipe slider, drag-paint mask creation, and keyboard shortcuts
 * (A/R/I/←/→). All routes are POSTed by the inline script using fetch so
 * the page doesn't full-reload between actions.
 */
export function renderDiffViewer(data: DiffViewerData): string {
  const rid = escapeHtml(data.runId);
  const did = escapeHtml(data.diff.id);
  const route = escapeHtml(data.diff.route);
  const viewport = data.diff.viewport;
  const browser = escapeHtml(data.diff.browser);
  const currentUrl = data.current ? `/dashboard/screenshots/${rid}/${escapeHtml(data.current.id)}/raw` : '';
  const baselineUrl = data.baseline ? `/dashboard/screenshots/${rid}/${escapeHtml(data.baseline.id)}/raw` : '';
  const diffUrl = `/dashboard/screenshots/${rid}/${did}/raw`;

  const prevLink = data.prev
    ? `<a href="/dashboard/runs/${rid}/diffs/${escapeHtml(data.prev.id)}" title="Previous (←)">← Prev</a>`
    : '<span class="disabled" title="No previous diff">← Prev</span>';
  const nextLink = data.next
    ? `<a href="/dashboard/runs/${rid}/diffs/${escapeHtml(data.next.id)}" title="Next (→)">Next →</a>`
    : '<span class="disabled" title="No next diff">Next →</span>';

  const masksJson = JSON.stringify(
    data.masks.map((m) => ({ id: m.id, x: m.x, y: m.y, width: m.width, height: m.height, label: m.label ?? '' })),
  );

  const inner = `<header><h1>🛡 Diff viewer</h1><a href="/dashboard/runs/${rid}">← Run</a></header>
<div class="wrap" id="main-content" role="main">
  <div class="viewer-toolbar">
    <strong>${route}</strong>
    <span class="murl">@ ${viewport}px · ${browser}</span>
    <span class="spacer"></span>
    <div class="nav-arrows">${prevLink}${nextLink}</div>
    <span class="spacer" style="flex:0 0 16px"></span>
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin:0">
      <input type="radio" name="mode" value="overlay" checked style="width:auto;margin:0"/> Overlay
    </label>
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin:0">
      <input type="radio" name="mode" value="heatmap" style="width:auto;margin:0"/> Heatmap
    </label>
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);margin:0">
      <input type="radio" name="mode" value="swipe" style="width:auto;margin:0"/> Swipe
    </label>
    <input type="range" id="stage-slider" min="0" max="100" value="50" aria-label="Comparison slider" style="width:110px;accent-color:var(--accent)"/>
    <span class="spacer" style="flex:0 0 16px"></span>
    <button type="button" id="approve" title="Accept this baseline (A)">Accept <kbd>A</kbd></button>
    <button type="button" id="reject" class="danger" title="Reject this diff (R)">Reject <kbd>R</kbd></button>
    <button type="button" id="paint" title="Paint ignore region (I)">Ignore region <kbd>I</kbd></button>
  </div>

  <div class="viewer-grid">
    <div class="viewer-cell">
      <div class="cap">Baseline</div>
      ${data.baseline ? `<img alt="baseline" src="${baselineUrl}"/>` : '<div class="ph">No baseline</div>'}
    </div>
    <div class="viewer-cell">
      <div class="cap">Current</div>
      ${data.current ? `<img alt="current" src="${currentUrl}"/>` : '<div class="ph">No current</div>'}
    </div>
    <div class="viewer-cell">
      <div class="cap">Diff</div>
      <img alt="diff" src="${diffUrl}"/>
    </div>
  </div>

  <div class="viewer-stage" id="stage">
    <div class="stage-inner" id="stage-inner">
      ${data.baseline ? `<img id="swipe-base-img" class="layer" style="display:none" alt="baseline" src="${baselineUrl}"/>` : ''}
      ${data.current ? `<img id="base-img" alt="current" src="${currentUrl}"/>` : `<img id="base-img" alt="diff" src="${diffUrl}"/>`}
      <img id="diff-overlay" class="layer diff-overlay" alt="diff overlay" src="${diffUrl}"/>
      <div id="mask-layer" class="layer" style="pointer-events:none"></div>
    </div>
  </div>

  <p class="murl" style="margin-top:12px">
    Shortcuts: <kbd>A</kbd> accept · <kbd>R</kbd> reject · <kbd>I</kbd> paint mask · <kbd>←</kbd>/<kbd>→</kbd> prev/next.
  </p>
</div>

<script>
(function(){
  var runId = ${JSON.stringify(data.runId)};
  var diffId = ${JSON.stringify(data.diff.id)};
  var route = ${JSON.stringify(data.diff.route)};
  var viewport = ${JSON.stringify(data.diff.viewport)};
  var prevHref = ${data.prev ? JSON.stringify(`/dashboard/runs/${data.runId}/diffs/${data.prev.id}`) : 'null'};
  var nextHref = ${data.next ? JSON.stringify(`/dashboard/runs/${data.runId}/diffs/${data.next.id}`) : 'null'};
  var existingMasks = ${masksJson};

  var stage = document.getElementById('stage');
  var inner = document.getElementById('stage-inner');
  var overlay = document.getElementById('diff-overlay');
  var maskLayer = document.getElementById('mask-layer');
  var baseImg = document.getElementById('base-img');
  var swipeBase = document.getElementById('swipe-base-img');
  var slider = document.getElementById('stage-slider');
  var currentMode = 'overlay';

  function syncSize(){
    if (!baseImg || !maskLayer) return;
    maskLayer.style.width = baseImg.clientWidth + 'px';
    maskLayer.style.height = baseImg.clientHeight + 'px';
  }
  if (baseImg) baseImg.addEventListener('load', function(){ syncSize(); renderMasks(); });
  window.addEventListener('resize', function(){ syncSize(); renderMasks(); });

  function imgScale(){
    if (!baseImg) return 1;
    return baseImg.naturalWidth ? baseImg.clientWidth / baseImg.naturalWidth : 1;
  }

  function renderMasks(){
    if (!maskLayer) return;
    var scale = imgScale();
    maskLayer.innerHTML = '';
    existingMasks.forEach(function(m){
      var d = document.createElement('div');
      d.className = 'mask';
      d.style.left = (m.x * scale) + 'px';
      d.style.top = (m.y * scale) + 'px';
      d.style.width = (m.width * scale) + 'px';
      d.style.height = (m.height * scale) + 'px';
      if (m.label) d.title = m.label;
      maskLayer.appendChild(d);
    });
  }

  // Mode toggle: overlay vs heatmap vs swipe + slider control.
  function applyMode(){
    var val = slider ? Number(slider.value) : 50;
    if (!overlay) return;
    overlay.classList.remove('diff-overlay', 'heatmap');
    overlay.classList.add('layer');
    if (currentMode === 'swipe') {
      overlay.style.display = 'none';
      if (swipeBase) swipeBase.style.display = 'block';
      if (baseImg) baseImg.style.cssText = 'clip-path: inset(0 0 0 ' + val + '%)';
    } else {
      overlay.style.display = 'block';
      if (swipeBase) swipeBase.style.display = 'none';
      if (baseImg) baseImg.style.cssText = '';
      overlay.classList.add(currentMode === 'heatmap' ? 'heatmap' : 'diff-overlay');
      overlay.style.opacity = String(val / 100);
    }
  }

  document.querySelectorAll('input[name=mode]').forEach(function(r){
    r.addEventListener('change', function(){
      currentMode = r.value;
      applyMode();
    });
  });
  if (slider) {
    slider.addEventListener('input', applyMode);
  }

  // Painting state.
  var painting = false, startX = 0, startY = 0, dragRect = null;
  function enterPaintMode(){
    painting = true;
    stage.classList.add('painting');
    maskLayer.style.pointerEvents = 'auto';
  }
  function exitPaintMode(){
    painting = false;
    stage.classList.remove('painting');
    maskLayer.style.pointerEvents = 'none';
    if (dragRect && dragRect.parentNode) dragRect.parentNode.removeChild(dragRect);
    dragRect = null;
  }

  document.getElementById('paint').addEventListener('click', function(){
    if (painting) exitPaintMode(); else enterPaintMode();
  });

  if (maskLayer) {
    maskLayer.addEventListener('mousedown', function(e){
      if (!painting) return;
      var rect = maskLayer.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      dragRect = document.createElement('div');
      dragRect.className = 'mask';
      dragRect.style.left = startX + 'px';
      dragRect.style.top = startY + 'px';
      dragRect.style.width = '0px';
      dragRect.style.height = '0px';
      maskLayer.appendChild(dragRect);
      e.preventDefault();
    });
    maskLayer.addEventListener('mousemove', function(e){
      if (!painting || !dragRect) return;
      var rect = maskLayer.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var l = Math.min(startX, x), t = Math.min(startY, y);
      var w = Math.abs(x - startX), h = Math.abs(y - startY);
      dragRect.style.left = l + 'px';
      dragRect.style.top = t + 'px';
      dragRect.style.width = w + 'px';
      dragRect.style.height = h + 'px';
    });
    maskLayer.addEventListener('mouseup', function(e){
      if (!painting || !dragRect) return;
      var w = parseInt(dragRect.style.width, 10) || 0;
      var h = parseInt(dragRect.style.height, 10) || 0;
      if (w < 6 || h < 6) { exitPaintMode(); return; }
      var scale = imgScale() || 1;
      var l = parseInt(dragRect.style.left, 10) || 0;
      var t = parseInt(dragRect.style.top, 10) || 0;
      var body = new URLSearchParams({
        route: route,
        viewport: String(viewport),
        x: String(Math.round(l / scale)),
        y: String(Math.round(t / scale)),
        width: String(Math.round(w / scale)),
        height: String(Math.round(h / scale)),
      });
      fetch('/dashboard/masks', { method: 'POST', body: body, credentials: 'same-origin' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          if (j && j.mask) {
            existingMasks.push(j.mask);
            renderMasks();
          }
        })
        .finally(function(){ exitPaintMode(); });
    });
  }

  function post(path){
    return fetch(path, { method: 'POST', credentials: 'same-origin' });
  }
  function approve(){
    post('/dashboard/runs/' + encodeURIComponent(runId) + '/diffs/' + encodeURIComponent(diffId) + '/accept')
      .then(function(){ if (nextHref) location.href = nextHref; else location.href = '/dashboard/runs/' + encodeURIComponent(runId); });
  }
  function reject(){
    post('/dashboard/runs/' + encodeURIComponent(runId) + '/diffs/' + encodeURIComponent(diffId) + '/reject')
      .then(function(){ if (nextHref) location.href = nextHref; else location.href = '/dashboard/runs/' + encodeURIComponent(runId); });
  }
  document.getElementById('approve').addEventListener('click', approve);
  document.getElementById('reject').addEventListener('click', reject);

  document.addEventListener('keydown', function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'a' || e.key === 'A') approve();
    else if (e.key === 'r' || e.key === 'R') reject();
    else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); if (painting) exitPaintMode(); else enterPaintMode(); }
    else if (e.key === 'ArrowLeft' && prevHref) location.href = prevHref;
    else if (e.key === 'ArrowRight' && nextHref) location.href = nextHref;
    else if (e.key === 'Escape' && painting) exitPaintMode();
  });

  syncSize();
  renderMasks();
})();
</script>`;

  return page(`Frontguard — Diff ${data.diff.route} @ ${data.diff.viewport}`, inner);
}

// ---------------------------------------------------------------------------
// Masks settings page (Task 15.5)
// ---------------------------------------------------------------------------

/** Renders the saved-masks settings page. */
export function renderMasksSettings(masks: IgnoreMask[], now = new Date()): string {
  const rows = masks.length
    ? masks
        .map((m) => {
          return `<div class="mask-thumb">
        <div class="swatch" style="width:${Math.min(80, m.width / 6)}px;height:${Math.min(40, m.height / 6)}px"></div>
        <div class="meta">
          <div><strong>${m.width}×${m.height}px</strong> at (${m.x}, ${m.y})${m.label ? ' — ' + escapeHtml(m.label) : ''}</div>
          <div class="where">${escapeHtml(m.route)} @ ${m.viewport}px · added ${relativeTime(m.createdAt, now)}</div>
        </div>
        <form class="inline" method="post" action="/dashboard/settings/masks/${escapeHtml(m.id)}/delete">
          <button type="submit" class="danger">Delete</button>
        </form>
      </div>`;
        })
        .join('\n')
    : '<p class="empty">No saved masks. Paint one from the diff viewer (press <kbd>I</kbd>).</p>';

  const inner = `<header><h1>🛡 Ignore regions</h1><a href="/dashboard">← Dashboard</a></header>
<div class="wrap" id="main-content" role="main">
  <p class="murl">Masks tell visual diffs to skip a rectangle on a given route + viewport (e.g. live timestamps, ads). Painted in the diff viewer.</p>
  <div class="card" style="padding:0">
    ${rows}
  </div>
</div>`;
  return page('Frontguard — Masks', inner);
}

// ---------------------------------------------------------------------------
// Attachments list page (Task 15.6)
// ---------------------------------------------------------------------------

/** Renders a downloadable list of run attachments. */
export function renderRunAttachments(runId: string, attachments: RunAttachment[]): string {
  const rid = escapeHtml(runId);
  const items = attachments.length
    ? attachments
        .map((a) => {
          const sz = a.sizeBytes ? formatBytes(a.sizeBytes) : '';
          return `<li>
        <span class="kind">${escapeHtml(attachmentLabel(a.kind))}</span>
        <a href="/dashboard/runs/${rid}/attachments/${escapeHtml(a.id)}/download">${escapeHtml(a.name)}</a>
        <span class="size">${sz}</span>
      </li>`;
        })
        .join('\n')
    : '<li class="empty" style="justify-content:center">No attachments for this run.</li>';

  const inner = `<header><h1>🛡 Attachments</h1><a href="/dashboard/runs/${rid}">← Run</a></header>
<div class="wrap" id="main-content" role="main">
  <p class="murl">Run <code>${rid}</code> · traces, DOM snapshots, console logs, and any other artifacts captured during the run.</p>
  <ul class="attachments">${items}</ul>
</div>`;
  return page('Frontguard — Run attachments', inner);
}

/** Human-readable byte size. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
