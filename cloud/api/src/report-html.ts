import type { Run } from './types.js';

export function generateReportHtml(run: Run): string {
  const resultsRows = (run.results || [])
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.route)}</td>
        <td>${r.viewport}px</td>
        <td class="${r.diffPercentage > (run.threshold * 100) ? 'diff-fail' : 'diff-pass'}">${r.diffPercentage.toFixed(2)}%</td>
        <td><span class="badge badge-${r.status === 'captured' ? 'ok' : 'warn'}">${r.status}</span></td>
        <td>${r.classification || '—'}</td>
        <td>${r.timestamp}</td>
      </tr>`
    )
    .join('\n');

  const totalDiffs = (run.results || []).filter(
    (r) => r.diffPercentage > run.threshold * 100
  ).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Frontguard Report — ${escapeHtml(run.id.slice(0, 8))}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e8;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #fff; }
    .subtitle { color: #888; font-size: 0.875rem; margin-bottom: 2rem; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .meta-card {
      background: #14141f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      padding: 1rem;
    }
    .meta-card label { display: block; font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
    .meta-card .value { font-size: 1rem; color: #fff; word-break: break-all; }
    .status-completed { color: #4ade80; }
    .status-failed { color: #f87171; }
    .status-running { color: #facc15; }
    .status-queued { color: #60a5fa; }
    .summary {
      display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap;
    }
    .summary-item {
      background: #14141f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      text-align: center;
    }
    .summary-item .num { font-size: 2rem; font-weight: 700; color: #fff; }
    .summary-item .label { font-size: 0.75rem; color: #888; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
    th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      border-bottom: 1px solid #2a2a3a;
      background: #14141f;
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #1a1a2a;
      font-size: 0.875rem;
    }
    tr:hover td { background: #14141f; }
    .diff-pass { color: #4ade80; font-weight: 600; }
    .diff-fail { color: #f87171; font-weight: 600; }
    .badge {
      display: inline-block;
      padding: 0.2em 0.6em;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-ok { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a44; }
    .badge-warn { background: #ca8a0422; color: #facc15; border: 1px solid #ca8a0444; }
    .actions { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .btn {
      padding: 0.6rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-approve { background: #16a34a; color: #fff; }
    .btn-reject { background: #dc2626; color: #fff; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .footer { color: #444; font-size: 0.75rem; text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #1a1a2a; }
    @media (max-width: 640px) {
      body { padding: 1rem; }
      .meta-grid { grid-template-columns: 1fr; }
      table { font-size: 0.75rem; }
      th, td { padding: 0.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛡️ Frontguard Visual Report</h1>
    <p class="subtitle">Run <code>${escapeHtml(run.id)}</code></p>

    <div class="meta-grid">
      <div class="meta-card">
        <label>Target URL</label>
        <div class="value">${escapeHtml(run.url)}</div>
      </div>
      <div class="meta-card">
        <label>Status</label>
        <div class="value status-${run.status}">${run.status.toUpperCase()}</div>
      </div>
      <div class="meta-card">
        <label>Created</label>
        <div class="value">${run.createdAt}</div>
      </div>
      <div class="meta-card">
        <label>Completed</label>
        <div class="value">${run.completedAt || '—'}</div>
      </div>
      <div class="meta-card">
        <label>Threshold</label>
        <div class="value">${(run.threshold * 100).toFixed(1)}%</div>
      </div>
      <div class="meta-card">
        <label>Browsers</label>
        <div class="value">${run.browsers.join(', ')}</div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-item">
        <div class="num">${(run.results || []).length}</div>
        <div class="label">Screenshots</div>
      </div>
      <div class="summary-item">
        <div class="num diff-${totalDiffs > 0 ? 'fail' : 'pass'}">${totalDiffs}</div>
        <div class="label">Diffs Found</div>
      </div>
      <div class="summary-item">
        <div class="num">${run.viewports.length}</div>
        <div class="label">Viewports</div>
      </div>
      <div class="summary-item">
        <div class="num">${run.routes.length}</div>
        <div class="label">Routes</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Route</th>
          <th>Viewport</th>
          <th>Diff %</th>
          <th>Status</th>
          <th>Classification</th>
          <th>Timestamp</th>
        </tr>
      </thead>
      <tbody>
        ${resultsRows || '<tr><td colspan="6" style="text-align:center;color:#666;">No results yet</td></tr>'}
      </tbody>
    </table>

    <div class="actions">
      <button class="btn btn-approve" id="approveBtn" onclick="approveBaselines()">
        ✓ Approve Baselines
      </button>
      <button class="btn btn-reject" id="rejectBtn" onclick="rejectBaselines()">
        ✗ Reject
      </button>
    </div>

    <div id="actionStatus" style="margin-bottom:1rem;font-size:0.875rem;"></div>

    <div class="footer">
      Frontguard v0.1.0 · Visual regression testing for the modern web
    </div>
  </div>

  <script>
    const RUN_ID = '${run.id}';

    async function approveBaselines() {
      const btn = document.getElementById('approveBtn');
      const status = document.getElementById('actionStatus');
      btn.disabled = true;
      try {
        const res = await fetch('/v1/baselines/' + RUN_ID + '/approve', { method: 'POST' });
        const data = await res.json();
        if (data.approved) {
          status.innerHTML = '<span style="color:#4ade80;">✓ Baselines approved successfully.</span>';
        } else {
          status.innerHTML = '<span style="color:#f87171;">Failed to approve baselines.</span>';
        }
      } catch (err) {
        status.innerHTML = '<span style="color:#f87171;">Error: ' + err.message + '</span>';
      } finally {
        btn.disabled = false;
      }
    }

    async function rejectBaselines() {
      const status = document.getElementById('actionStatus');
      status.innerHTML = '<span style="color:#facc15;">Baselines rejected. No changes saved.</span>';
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
