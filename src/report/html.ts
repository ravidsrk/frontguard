/**
 * Self-contained HTML report generator for Frontguard.
 *
 * Produces a single HTML file with all CSS/JS inline and images
 * embedded as base64 data URIs. No external dependencies required
 * to view the report.
 *
 * @module report/html
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Reporter, PipelineStage, RunResult, DiffResult } from '../core/types.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// HTML Reporter
// ---------------------------------------------------------------------------

export class HTMLReporter implements Reporter {
  private errors: Error[] = [];

  onStageStart(_stage: PipelineStage, _detail?: string): void {}
  onStageProgress(_stage: PipelineStage, _current: number, _total: number, _detail?: string): void {}
  onStageComplete(_stage: PipelineStage, _detail?: string): void {}

  onError(error: Error): void {
    this.errors.push(error);
    logger.error(`Pipeline error captured for HTML report: ${error.message}`);
  }

  onComplete(result: RunResult): void {
    try {
      this.writeReport(result, result.config.outputDir);
    } catch (err) {
      logger.error(`Failed to write HTML report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Generate a complete, self-contained HTML report string.
   */
  generateReport(result: RunResult): string {
    const routes = [...new Set(result.diffs.map((d) => d.route.path))];
    const routeData = routes.map((path) => {
      const diffs = result.diffs.filter((d) => d.route.path === path);
      const worstStatus = getWorstStatus(diffs);
      return { path, diffs, status: worstStatus };
    });

    return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frontguard Visual Regression Report</title>
<style>${getCSS()}</style>
</head>
<body>
${renderErrorBanner(this.errors)}
${renderHeader(result)}
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h3>Routes</h3>
      <div class="filter-buttons" id="filters" role="toolbar" aria-label="Filter routes by status">
        <button class="filter-btn active" data-filter="all" aria-label="Show all routes">All (${routes.length})</button>
        <button class="filter-btn" data-filter="regression" aria-label="Show regressions only">✘ Regressions (${result.summary.regressions})</button>
        <button class="filter-btn" data-filter="changed" aria-label="Show warnings only">⚠ Warnings (${result.summary.warnings})</button>
        <button class="filter-btn" data-filter="new" aria-label="Show new pages only">★ New (${result.summary.newPages})</button>
        <button class="filter-btn" data-filter="pass" aria-label="Show passed pages only">✓ Passed (${result.summary.passed})</button>
      </div>
    </div>
    <ul class="route-list" id="route-list" role="listbox" aria-label="Route list">
      ${routeData.map((r, i) => renderSidebarItem(r.path, r.status, i)).join('\n      ')}
    </ul>
    <div class="empty-filter-state" id="empty-filter-state" style="display:none" aria-live="polite">
      <p>No routes match this filter</p>
    </div>
  </aside>
  <main class="main" id="main">
    <div class="placeholder" id="placeholder">
      <p>← Select a route from the sidebar to view details</p>
    </div>
    ${routeData.map((r, i) => renderRouteDetail(r.path, r.diffs, i)).join('\n    ')}
  </main>
</div>
${renderTimingFooter(result)}
<script>${getJS()}</script>
</body>
</html>`;
  }

  /**
   * Write the HTML report file to disk.
   */
  writeReport(result: RunResult, outputDir: string): void {
    mkdirSync(outputDir, { recursive: true });
    const html = this.generateReport(result);
    const reportPath = join(outputDir, 'report.html');
    writeFileSync(reportPath, html, 'utf-8');
    logger.info(`HTML report written to ${reportPath}`);
  }
}

// ---------------------------------------------------------------------------
// Status Helpers
// ---------------------------------------------------------------------------

const STATUS_PRIORITY: Record<string, number> = {
  regression: 4,
  error: 3,
  changed: 2,
  flaky: 1,
  new: 0,
  pass: -1,
};

function getWorstStatus(diffs: DiffResult[]): string {
  let worst = 'pass';
  let worstPriority = -1;
  for (const d of diffs) {
    const p = STATUS_PRIORITY[d.status] ?? -1;
    if (p > worstPriority) {
      worst = d.status;
      worstPriority = p;
    }
  }
  return worst;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return '<span class="icon icon-pass">✓</span>';
    case 'changed': return '<span class="icon icon-warning">⚠</span>';
    case 'regression': return '<span class="icon icon-regression">✘</span>';
    case 'new': return '<span class="icon icon-new">★</span>';
    case 'error': return '<span class="icon icon-regression">✘</span>';
    case 'flaky': return '<span class="icon icon-warning">~</span>';
    default: return '<span class="icon">?</span>';
  }
}

function severityBadge(severity: string): string {
  const cls = severity === 'critical' ? 'badge-critical' : severity === 'warning' ? 'badge-warning' : 'badge-info';
  return `<span class="badge ${cls}">${severity}</span>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bufferToDataUri(buf: Buffer | undefined): string {
  if (!buf || buf.length === 0) return '';
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Render Functions
// ---------------------------------------------------------------------------

function renderErrorBanner(errors: Error[]): string {
  if (errors.length === 0) return '';

  const errorItems = errors.map((e) =>
    `<li>${escapeHtml(e.message)}${e.stack ? `<pre class="error-stack">${escapeHtml(e.stack)}</pre>` : ''}</li>`
  ).join('\n');

  return `<div class="error-banner">
  <div class="error-banner-header">
    <span class="error-banner-icon">🚨</span>
    <strong>${errors.length} Pipeline Error${errors.length !== 1 ? 's' : ''} Occurred</strong>
  </div>
  <ul class="error-banner-list">
    ${errorItems}
  </ul>
</div>`;
}

function renderHeader(result: RunResult): string {
  const s = result.summary;
  return `<header class="header">
  <div class="header-title">
    <h1>🛡️ Frontguard</h1>
    <span class="header-subtitle">Visual Regression Report</span>
  </div>
  <div class="stats">
    <div class="stat"><span class="stat-value">${s.total}</span><span class="stat-label">Total</span></div>
    <div class="stat stat-pass"><span class="stat-value">${s.passed}</span><span class="stat-label">Passed</span></div>
    <div class="stat stat-regression"><span class="stat-value">${s.regressions}</span><span class="stat-label">Regressions</span></div>
    <div class="stat stat-warning"><span class="stat-value">${s.warnings}</span><span class="stat-label">Warnings</span></div>
    <div class="stat stat-new"><span class="stat-value">${s.newPages}</span><span class="stat-label">New</span></div>
  </div>
</header>`;
}

function renderSidebarItem(path: string, status: string, index: number): string {
  return `<li class="route-item" data-index="${index}" data-status="${status}">
        ${statusIcon(status)}
        <span class="route-path">${escapeHtml(path)}</span>
      </li>`;
}

function renderRouteDetail(path: string, diffs: DiffResult[], index: number): string {
  const diffCards = diffs.map((diff) => {
    const baselineUri = bufferToDataUri(diff.baselineImage);
    const currentUri = bufferToDataUri(diff.currentImage);
    const diffUri = bufferToDataUri(diff.diffImage);

    let aiSection = '';
    if (diff.aiAnalysis) {
      const ai = diff.aiAnalysis;
      aiSection = `<div class="ai-analysis">
          <h4>🤖 AI Analysis ${severityBadge(ai.severity)}</h4>
          <p><strong>Classification:</strong> ${escapeHtml(ai.classification)}</p>
          <p>${escapeHtml(ai.explanation)}</p>
          ${ai.suggestedFix ? `<p><strong>Suggested fix:</strong> ${escapeHtml(ai.suggestedFix)}</p>` : ''}
          <p class="confidence">Confidence: ${Math.round(ai.confidence * 100)}%</p>
        </div>`;
    }

    return `<div class="diff-card status-${diff.status}">
        <div class="diff-header">
          ${statusIcon(diff.status)}
          <span class="diff-label">${diff.viewport}px · ${diff.browser}</span>
          <span class="diff-percentage">${diff.diffPercentage.toFixed(2)}% changed</span>
        </div>
        ${diff.error ? `<div class="diff-error">${escapeHtml(diff.error)}</div>` : ''}
        <div class="image-row">
          ${baselineUri ? `<div class="image-col"><h5>Baseline</h5><img src="${baselineUri}" alt="baseline" loading="lazy"></div>` : ''}
          ${currentUri ? `<div class="image-col"><h5>Current</h5><img src="${currentUri}" alt="current" loading="lazy"></div>` : ''}
          ${diffUri ? `<div class="image-col"><h5>Diff</h5><img src="${diffUri}" alt="diff" loading="lazy"></div>` : ''}
        </div>
        ${aiSection}
      </div>`;
  }).join('\n      ');

  return `<div class="route-detail" id="route-${index}" style="display:none">
      <h2>${escapeHtml(path)}</h2>
      ${diffCards}
    </div>`;
}

function renderTimingFooter(result: RunResult): string {
  const t = result.timing;
  const totalSec = (t.total / 1000).toFixed(1);
  return `<footer class="footer">
  <span>Completed in ${totalSec}s</span>
  <span class="footer-breakdown">
    Discovery ${(t.discovery / 1000).toFixed(1)}s ·
    Render ${(t.render / 1000).toFixed(1)}s ·
    Compare ${(t.compare / 1000).toFixed(1)}s
    ${t.ai > 0 ? ` · AI ${(t.ai / 1000).toFixed(1)}s` : ''}
  </span>
  <span>Generated by Frontguard</span>
</footer>`;
}

// ---------------------------------------------------------------------------
// Inline CSS
// ---------------------------------------------------------------------------

function getCSS(): string {
  return `
:root {
  --bg: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #1c2128;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --green: #3fb950;
  --yellow: #d29922;
  --red: #f85149;
  --blue: #58a6ff;
  --purple: #bc8cff;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
}

/* Error Banner */
.error-banner {
  background: rgba(248, 81, 73, 0.15);
  border: 2px solid var(--red);
  border-radius: 8px;
  margin: 16px 24px;
  padding: 16px;
}
.error-banner-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: var(--red);
  margin-bottom: 12px;
}
.error-banner-icon { font-size: 20px; }
.error-banner-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.error-banner-list li {
  background: rgba(248, 81, 73, 0.08);
  border-left: 3px solid var(--red);
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  border-radius: 0 4px 4px 0;
}
.error-stack {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}
.header-title { display: flex; align-items: baseline; gap: 12px; }
.header-title h1 { font-size: 20px; font-weight: 700; }
.header-subtitle { color: var(--text-muted); font-size: 14px; }
.stats { display: flex; gap: 20px; }
.stat { text-align: center; }
.stat-value { display: block; font-size: 24px; font-weight: 700; }
.stat-label { display: block; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-pass .stat-value { color: var(--green); }
.stat-regression .stat-value { color: var(--red); }
.stat-warning .stat-value { color: var(--yellow); }
.stat-new .stat-value { color: var(--blue); }

/* Layout */
.layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 280px;
  min-width: 280px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.sidebar-header h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 12px; }
.filter-buttons { display: flex; flex-wrap: wrap; gap: 4px; }
.filter-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--text-muted); color: var(--text); }
.filter-btn.active { background: var(--blue); border-color: var(--blue); color: #fff; }

.route-list { list-style: none; }
.empty-filter-state { padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.route-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.route-item:hover { background: var(--bg-elevated); }
.route-item.active { background: var(--bg-elevated); border-left: 3px solid var(--blue); }
.route-path { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.icon { font-weight: 700; font-size: 14px; flex-shrink: 0; }
.icon-pass { color: var(--green); }
.icon-warning { color: var(--yellow); }
.icon-regression { color: var(--red); }
.icon-new { color: var(--blue); }

/* Main */
.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 16px;
}
.route-detail h2 { font-size: 18px; margin-bottom: 16px; }

/* Diff Cards */
.diff-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}
.diff-card.status-regression { border-color: var(--red); }
.diff-card.status-changed { border-color: var(--yellow); }
.diff-card.status-new { border-color: var(--blue); }

.diff-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.diff-label { font-weight: 600; }
.diff-percentage { margin-left: auto; color: var(--text-muted); font-size: 13px; }
.diff-error {
  padding: 8px 16px;
  background: rgba(248, 81, 73, 0.1);
  color: var(--red);
  font-size: 13px;
}

.image-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
}
.image-col h5 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; }
.image-col img {
  width: 100%;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: #000;
}

/* AI Analysis */
.ai-analysis {
  padding: 16px;
  border-top: 1px solid var(--border);
  background: rgba(88, 166, 255, 0.05);
}
.ai-analysis h4 { font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.ai-analysis p { margin-bottom: 6px; font-size: 13px; }
.confidence { color: var(--text-muted); font-size: 12px; }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.badge-critical { background: rgba(248, 81, 73, 0.2); color: var(--red); }
.badge-warning { background: rgba(210, 153, 34, 0.2); color: var(--yellow); }
.badge-info { background: rgba(88, 166, 255, 0.2); color: var(--blue); }

/* Footer */
.footer {
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 8px;
}
.footer-breakdown { color: var(--text-muted); }

/* Responsive */
@media (max-width: 768px) {
  .layout { flex-direction: column; }
  .sidebar { width: 100%; min-width: auto; max-height: 40vh; border-right: none; border-bottom: 1px solid var(--border); }
  .header { flex-direction: column; align-items: flex-start; }
  .stats { flex-wrap: wrap; }
  .image-row { grid-template-columns: 1fr; }
  .footer { flex-direction: column; align-items: flex-start; }
}
`;
}

// ---------------------------------------------------------------------------
// Inline JavaScript
// ---------------------------------------------------------------------------

function getJS(): string {
  return `
(function() {
  const routeList = document.getElementById('route-list');
  const mainArea = document.getElementById('main');
  const placeholder = document.getElementById('placeholder');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const routeItems = document.querySelectorAll('.route-item');

  // Route selection
  routeList.addEventListener('click', function(e) {
    const item = e.target.closest('.route-item');
    if (!item) return;

    const index = item.dataset.index;

    // Update active state in sidebar
    routeItems.forEach(function(el) { el.classList.remove('active'); });
    item.classList.add('active');

    // Show corresponding detail
    document.querySelectorAll('.route-detail').forEach(function(el) { el.style.display = 'none'; });
    if (placeholder) placeholder.style.display = 'none';

    var detail = document.getElementById('route-' + index);
    if (detail) detail.style.display = 'block';
  });

  // Filter buttons
  var emptyState = document.getElementById('empty-filter-state');
  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      var filter = btn.dataset.filter;
      var visibleCount = 0;

      routeItems.forEach(function(item) {
        if (filter === 'all') {
          item.style.display = '';
          visibleCount++;
        } else {
          var show = item.dataset.status === filter;
          item.style.display = show ? '' : 'none';
          if (show) visibleCount++;
        }
      });

      if (emptyState) {
        emptyState.style.display = visibleCount === 0 ? '' : 'none';
      }
    });
  });

  // Auto-select first route if only a few
  if (routeItems.length > 0 && routeItems.length <= 20) {
    routeItems[0].click();
  }
})();
`;
}
