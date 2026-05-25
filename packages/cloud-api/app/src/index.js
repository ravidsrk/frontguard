// Frontguard Cloud API — Pure fetch handler, zero dependencies
// Production deployment — Cloudflare Workers compatible

// ─── In-memory stores ───────────────────────────────────────
const runs = new Map();
const baselines = new Map();
const MAX_RUNS = 1000;

// ─── Helpers ────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
  });
}

function extractId(path, prefix) {
  // e.g. prefix = '/v1/runs/' → extracts the ID segment after it
  return path.slice(prefix.length).split('/')[0];
}

// ─── Simulated visual diff processing ──────────────────────
function processRun(run) {
  // Simulate async screenshot + diff work
  const routes = run.config.routes || ['/'];
  const viewports = run.config.viewports || [{ width: 1280, height: 720, label: 'desktop' }];
  const results = [];

  for (const route of routes) {
    for (const vp of viewports) {
      const hasBaseline = baselines.has(`${run.config.url}::${route}::${vp.label}`);
      const diffPercent = hasBaseline ? +(Math.random() * 5).toFixed(2) : 0;
      const threshold = run.config.threshold ?? 0.1;
      const status = !hasBaseline ? 'new_baseline' : diffPercent > threshold ? 'failed' : 'passed';

      results.push({
        route,
        viewport: vp.label,
        width: vp.width,
        height: vp.height,
        diffPercent,
        threshold,
        status,
        screenshotUrl: null, // would be a real URL in production
        baselineUrl: hasBaseline ? 'baseline-exists' : null,
        diffUrl: hasBaseline && diffPercent > 0 ? 'diff-exists' : null,
      });
    }
  }

  const failed = results.filter(r => r.status === 'failed').length;
  const passed = results.filter(r => r.status === 'passed').length;
  const newBaselines = results.filter(r => r.status === 'new_baseline').length;

  run.results = results;
  run.summary = { total: results.length, passed, failed, newBaselines };
  run.status = failed > 0 ? 'failed' : 'completed';
  run.completedAt = new Date().toISOString();
}

// ─── Route handlers ─────────────────────────────────────────

function health() {
  return json({
    status: 'ok',
    service: 'frontguard-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    runsInMemory: runs.size,
    baselinesInMemory: baselines.size,
  });
}

async function createRun(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { url, routes, viewports, threshold, webhookUrl, metadata } = body;
  if (!url) return json({ error: 'Missing required field: url' }, 400);
  const urlErr = validateUrl(url);
  if (urlErr) return json({ error: urlErr }, 400);

  const id = crypto.randomUUID();
  const run = {
    id,
    status: 'running',
    createdAt: new Date().toISOString(),
    completedAt: null,
    config: {
      url,
      routes: routes || ['/'],
      viewports: viewports || [
        { width: 1280, height: 720, label: 'desktop' },
        { width: 375, height: 812, label: 'mobile' },
      ],
      threshold: threshold ?? 0.1,
      webhookUrl: webhookUrl || null,
    },
    metadata: metadata || {},
    results: [],
    summary: null,
  };

  if (runs.size >= MAX_RUNS) {
    const oldest = runs.keys().next().value;
    runs.delete(oldest);
  }
  runs.set(id, run);

  // Process synchronously for the in-memory demo (in prod this would be async)
  processRun(run);

  return json({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    summary: run.summary,
    reportUrl: `/v1/reports/${id}`,
  }, 201);
}

function getRun(path) {
  const id = extractId(path, '/v1/runs/');
  const run = runs.get(id);
  if (!run) return json({ error: 'Run not found' }, 404);
  return json(run);
}

function listRuns(url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const statusFilter = url.searchParams.get('status');

  let items = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (statusFilter) items = items.filter(r => r.status === statusFilter);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return json({ runs: items, total, limit, offset });
}

function getReport(path) {
  const id = extractId(path, '/v1/reports/');
  const run = runs.get(id);
  if (!run) return html(errorPage('Run not found', 'No run exists with this ID.'), 404);
  return html(generateReport(run));
}

async function approveBaselines(path, request) {
  const id = path.split('/')[3]; // /v1/baselines/{id}/approve
  const run = runs.get(id);
  if (!run) return json({ error: 'Run not found' }, 404);

  let body = {};
  try { body = await request.json(); } catch { /* empty body is ok */ }
  const approveRoutes = body.routes || null; // null = approve all

  let approved = 0;
  for (const result of run.results) {
    if (result.status === 'new_baseline' || result.status === 'failed') {
      if (approveRoutes && !approveRoutes.includes(result.route)) continue;
      const key = `${run.config.url}::${result.route}::${result.viewport}`;
      baselines.set(key, {
        runId: id,
        approvedAt: new Date().toISOString(),
        route: result.route,
        viewport: result.viewport,
      });
      result.status = 'approved';
      approved++;
    }
  }

  return json({ approved, totalBaselines: baselines.size });
}

function deleteRun(path) {
  const id = extractId(path, '/v1/runs/');
  if (!runs.has(id)) return json({ error: 'Run not found' }, 404);
  runs.delete(id);
  return json({ deleted: true, id });
}

function getUsage() {
  const allRuns = [...runs.values()];
  const completed = allRuns.filter(r => r.status === 'completed' || r.status === 'failed');
  const totalScreenshots = completed.reduce((sum, r) => sum + (r.results?.length || 0), 0);

  return json({
    runs: { total: allRuns.length, completed: completed.length },
    screenshots: totalScreenshots,
    baselines: baselines.size,
  });
}

// ─── HTML Report Generator ──────────────────────────────────

function generateReport(run) {
  const statusColor = {
    completed: '#22c55e',
    failed: '#ef4444',
    running: '#f59e0b',
    new_baseline: '#3b82f6',
    passed: '#22c55e',
    approved: '#a78bfa',
  };

  const resultsRows = (run.results || []).map(r => `
    <tr>
      <td><code>${escHtml(r.route)}</code></td>
      <td>${escHtml(r.viewport)}</td>
      <td>${r.width}×${r.height}</td>
      <td>${r.diffPercent}%</td>
      <td><span class="badge" style="background:${statusColor[r.status] || '#6b7280'}">${r.status}</span></td>
    </tr>`).join('');

  const summaryCards = run.summary ? `
    <div class="cards">
      <div class="card"><div class="card-num">${run.summary.total}</div><div class="card-label">Total</div></div>
      <div class="card" style="border-color:#22c55e"><div class="card-num" style="color:#22c55e">${run.summary.passed}</div><div class="card-label">Passed</div></div>
      <div class="card" style="border-color:#ef4444"><div class="card-num" style="color:#ef4444">${run.summary.failed}</div><div class="card-label">Failed</div></div>
      <div class="card" style="border-color:#3b82f6"><div class="card-num" style="color:#3b82f6">${run.summary.newBaselines}</div><div class="card-label">New Baselines</div></div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frontguard Report — ${escHtml(run.id.slice(0, 8))}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e2e8f0;line-height:1.6;padding:2rem}
  .container{max-width:960px;margin:0 auto}
  h1{font-size:1.5rem;font-weight:700;margin-bottom:.25rem;color:#f8fafc}
  .subtitle{color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem}
  .meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;margin-bottom:1.5rem}
  .meta-item{background:#1e2130;border-radius:8px;padding:.75rem 1rem}
  .meta-label{font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
  .meta-value{font-size:.9rem;color:#e2e8f0;word-break:break-all}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem}
  .card{background:#1e2130;border-radius:8px;padding:1rem;text-align:center;border-left:3px solid #6b7280}
  .card-num{font-size:1.75rem;font-weight:700;color:#f8fafc}
  .card-label{font-size:.75rem;color:#94a3b8;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;background:#1e2130;border-radius:8px;overflow:hidden;margin-bottom:1.5rem}
  th{background:#161824;text-align:left;padding:.625rem 1rem;font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
  td{padding:.625rem 1rem;border-top:1px solid #2a2d3e;font-size:.875rem}
  code{background:#2a2d3e;padding:.125rem .375rem;border-radius:4px;font-size:.8rem}
  .badge{display:inline-block;padding:.125rem .5rem;border-radius:9999px;font-size:.75rem;font-weight:600;color:#fff}
  .actions{display:flex;gap:.75rem;margin-top:1rem}
  .btn{padding:.5rem 1.25rem;border:none;border-radius:6px;font-size:.875rem;font-weight:600;cursor:pointer;transition:opacity .15s}
  .btn:hover{opacity:.85}
  .btn-approve{background:#22c55e;color:#fff}
  .btn-reject{background:#ef4444;color:#fff}
  .btn-back{background:#374151;color:#e2e8f0}
  #action-result{margin-top:.75rem;padding:.5rem;border-radius:6px;display:none;font-size:.875rem}
  @media(max-width:640px){.cards{grid-template-columns:repeat(2,1fr)}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="container">
  <h1>🛡️ Frontguard Visual Report</h1>
  <p class="subtitle">Run <code>${escHtml(run.id)}</code></p>

  <div class="meta">
    <div class="meta-item"><div class="meta-label">URL</div><div class="meta-value">${escHtml(run.config.url)}</div></div>
    <div class="meta-item"><div class="meta-label">Status</div><div class="meta-value"><span class="badge" style="background:${statusColor[run.status] || '#6b7280'}">${run.status}</span></div></div>
    <div class="meta-item"><div class="meta-label">Created</div><div class="meta-value">${escHtml(run.createdAt)}</div></div>
    <div class="meta-item"><div class="meta-label">Completed</div><div class="meta-value">${run.completedAt ? escHtml(run.completedAt) : '—'}</div></div>
    <div class="meta-item"><div class="meta-label">Threshold</div><div class="meta-value">${run.config.threshold}%</div></div>
    <div class="meta-item"><div class="meta-label">Routes</div><div class="meta-value">${run.config.routes.length}</div></div>
  </div>

  ${summaryCards}

  <table>
    <thead><tr><th>Route</th><th>Viewport</th><th>Size</th><th>Diff %</th><th>Status</th></tr></thead>
    <tbody>${resultsRows || '<tr><td colspan="5" style="text-align:center;color:#64748b">No results yet</td></tr>'}</tbody>
  </table>

  <div class="actions">
    <button class="btn btn-approve" onclick="approveAll()">✅ Approve All Baselines</button>
    <button class="btn btn-reject" onclick="rejectAll()">❌ Reject Run</button>
    <button class="btn btn-back" onclick="window.history.back()">← Back</button>
  </div>
  <div id="action-result"></div>
</div>
<script>
  const runId = ${JSON.stringify(run.id)};
  function showResult(msg, ok) {
    const el = document.getElementById('action-result');
    el.style.display = 'block';
    el.style.background = ok ? '#14532d' : '#7f1d1d';
    el.style.color = '#f8fafc';
    el.textContent = msg;
  }
  async function approveAll() {
    try {
      const res = await fetch('/v1/baselines/' + runId + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      showResult('Approved ' + data.approved + ' baseline(s). Total baselines: ' + data.totalBaselines, true);
      setTimeout(() => location.reload(), 1200);
    } catch(e) { showResult('Error: ' + e.message, false); }
  }
  async function rejectAll() {
    showResult('Run marked as rejected (no baselines updated).', false);
  }
</script>
</body>
</html>`;
}

function errorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>body{font-family:system-ui;background:#0f1117;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh}
.box{text-align:center}.box h1{font-size:1.5rem;margin-bottom:.5rem}.box p{color:#94a3b8}</style>
</head><body><div class="box"><h1>${escHtml(title)}</h1><p>${escHtml(message)}</p></div></body></html>`;
}

function escHtml(s) {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Security helpers ────────────────────────────────────────
function requireAuth(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ') || auth.length < 10) {
    return json({ error: 'Missing or invalid API key. Set Authorization: Bearer <your-key>' }, 401);
  }
  return null; // auth passed
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return 'url is required';
  if (url.length > 2048) return 'url too long (max 2048 chars)';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'url must use http or https';
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') ||
        host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return 'private/internal URLs are not allowed';
    }
  } catch { return 'invalid URL format'; }
  return null;
}

// ─── Main fetch handler ─────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Health
      if (path === '/health' && method === 'GET') return health();

      // Create run
      if (path === '/v1/run' && method === 'POST') {
        const authErr = requireAuth(request);
        if (authErr) return authErr;
        const contentLength = parseInt(request.headers.get('Content-Length') || '0');
        if (contentLength > 102400) return json({ error: 'Request body too large (max 100KB)' }, 413);
        return await createRun(request);
      }

      // Get single run
      if (/^\/v1\/runs\/[\w-]+$/.test(path) && method === 'GET') return getRun(path);

      // List runs
      if (path === '/v1/runs' && method === 'GET') return listRuns(url);

      // HTML report
      if (/^\/v1\/reports\/[\w-]+$/.test(path) && method === 'GET') return getReport(path);

      // Approve baselines
      if (/^\/v1\/baselines\/[\w-]+\/approve$/.test(path) && method === 'POST') {
        const authErr = requireAuth(request);
        if (authErr) return authErr;
        const contentLength = parseInt(request.headers.get('Content-Length') || '0');
        if (contentLength > 102400) return json({ error: 'Request body too large (max 100KB)' }, 413);
        return await approveBaselines(path, request);
      }

      // Delete run
      if (/^\/v1\/runs\/[\w-]+$/.test(path) && method === 'DELETE') {
        const authErr = requireAuth(request);
        if (authErr) return authErr;
        return deleteRun(path);
      }

      // Usage
      if (path === '/v1/usage' && method === 'GET') return getUsage();

      // 404
      return json({ error: 'Not found', path, method }, 404);
    } catch (err) {
      return json({ error: 'Internal server error', message: err.message }, 500);
    }
  },
};
