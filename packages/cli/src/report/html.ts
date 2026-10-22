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
import { loadReview } from '../cli/load-review.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// HTML Reporter
// ---------------------------------------------------------------------------

export class HTMLReporter implements Reporter {
  private errors: Error[] = [];

  constructor(private readonly delegate?: Reporter) {}

  onStageStart(stage: PipelineStage, detail?: string): void {
    this.delegate?.onStageStart(stage, detail);
  }

  onStageProgress(stage: PipelineStage, current: number, total: number, detail?: string): void {
    this.delegate?.onStageProgress(stage, current, total, detail);
  }

  onStageComplete(stage: PipelineStage, detail?: string): void {
    this.delegate?.onStageComplete(stage, detail);
  }

  onError(error: Error): void {
    this.delegate?.onError(error);
    this.errors.push(error);
    logger.error(`Pipeline error captured for HTML report: ${error.message}`);
  }

  async onComplete(result: RunResult): Promise<void> {
    await this.writeReport(result, result.config.outputDir);
    await this.delegate?.onComplete(result);
  }

  /**
   * Generate a complete, self-contained HTML report string.
   *
   * @param result - The pipeline run result
   * @param resolveImage - Optional image resolver; defaults to inline base64 data URIs
   */
  generateReport(result: RunResult, resolveImage: ImageResolver = defaultImageResolver): string {
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
      <div class="sidebar-search">
        <input type="search" id="route-search" class="route-search-input" placeholder="Search routes… (/)" aria-label="Search routes">
      </div>
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
    <div class="sidebar-shortcuts">
      <kbd>j</kbd>/<kbd>k</kbd> route · <kbd>1</kbd>-<kbd>4</kbd> view · <kbd>b</kbd> boxes · <kbd>/</kbd> search
    </div>
  </aside>
  <main class="main" id="main">
    <div class="placeholder" id="placeholder">
      <p>← Select a route from the sidebar to view details</p>
    </div>
    ${routeData.map((r, i) => renderRouteDetail(r.path, r.diffs, i, resolveImage)).join('\n    ')}
    ${renderJudgementsSection(result)}
    ${renderAccessibilitySection(result)}
    ${renderTextSnapshotSection(result)}
    ${renderHorizontalOverflowSection(result)}
    ${renderPerformanceSection(result)}
    ${renderThirdPartyScriptsSection(result)}
  </main>
</div>
${renderTimingFooter(result)}
<script>${getJS()}</script>
</body>
</html>`;
  }

  /**
   * Write the HTML report file to disk.
   *
   * Attempts to write PNG images as files under `{outputDir}/images/`
   * and reference them via relative `src="images/..."` paths in the HTML.
   * Falls back to inline base64 data URIs if the images directory cannot
   * be created (e.g. permission issues).
   */
  writeReport(result: RunResult, outputDir: string): Promise<void> {
    mkdirSync(outputDir, { recursive: true });

    // Try to set up file-based image resolver
    let resolveImage: ImageResolver = defaultImageResolver;
    const imagesDir = join(outputDir, 'images');

    try {
      mkdirSync(imagesDir, { recursive: true });

      // File-based resolver: write PNGs to disk, return relative paths
      resolveImage = (buf: Buffer | undefined, name: string): string => {
        if (!buf || buf.length === 0) return '';
        const filename = `${name}.png`;
        try {
          writeFileSync(join(imagesDir, filename), buf);
          return `images/${filename}`;
        } catch {
          // Single-image fallback: if writing this file fails, use data URI
          return bufferToDataUri(buf);
        }
      };

      logger.debug(`Writing report images to ${imagesDir}`);
    } catch {
      // Could not create images directory — fall back to base64
      logger.debug('Could not create images directory, falling back to base64 data URIs');
    }

    const html = this.generateReport(result, resolveImage);
    const reportPath = join(outputDir, 'report.html');
    writeFileSync(reportPath, html, 'utf-8');
    logger.info(`HTML report written to ${reportPath}`);
    return loadReview()
      .then((mod) => mod.writeReviewManifest(result, outputDir))
      .catch(() => {
        // A missing review module must not fail the HTML report.
      });
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

/**
 * Resolves an image buffer to a src string (file path or data URI).
 * The `name` parameter provides a unique filename stem for file-based output.
 */
type ImageResolver = (buf: Buffer | undefined, name: string) => string;

/** Default resolver: inline base64 data URIs (self-contained HTML). */
const defaultImageResolver: ImageResolver = (buf, _name) => bufferToDataUri(buf);

/**
 * Sanitise a route path into a safe filename fragment.
 */
function safeFilenameFragment(route: string): string {
  return route.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '').slice(0, 60) || '_root';
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
  return `<li class="route-item" data-index="${index}" data-status="${status}" data-route="${escapeHtml(path)}">
        ${statusIcon(status)}
        <span class="route-path">${escapeHtml(path)}</span>
      </li>`;
}

function renderRouteDetail(path: string, diffs: DiffResult[], index: number, resolveImage: ImageResolver = defaultImageResolver): string {
  const routeFragment = safeFilenameFragment(path);

  const diffCards = diffs.map((diff, diffIdx) => {
    const prefix = `${index}_${routeFragment}_${diff.viewport}_${diff.browser}_${diffIdx}`;
    const baselineSrc = resolveImage(diff.baselineImage, `${prefix}_baseline`);
    const currentSrc = resolveImage(diff.currentImage, `${prefix}_current`);
    const diffSrc = resolveImage(diff.diffImage, `${prefix}_diff`);
    const hasClusters = Boolean(diff.clusters && diff.clusters.length > 0);

    const pills: string[] = [];
    if (diff.clusters && diff.clusters.length > 0) {
      pills.push(`<span class="meta-pill">${diff.clusters.length} cluster${diff.clusters.length !== 1 ? 's' : ''}</span>`);
    }
    if (diff.ssim !== undefined) {
      pills.push(`<span class="meta-pill">SSIM ${(diff.ssim * 100).toFixed(1)}%</span>`);
    }
    if (diff.stability) {
      if (diff.stability.settled) {
        pills.push(`<span class="meta-pill pill-settled">✓ Settled (${diff.stability.attempts}f)</span>`);
      } else {
        pills.push(`<span class="meta-pill pill-unsettled">⚠ Unsettled (${(diff.stability.unstableRatio * 100).toFixed(2)}% motion)</span>`);
      }
    }
    if (diff.redactedCount && diff.redactedCount > 0) {
      pills.push(`<span class="meta-pill">🔒 ${diff.redactedCount} redacted</span>`);
    }

    let stabilityBanner = '';
    if (diff.stability && !diff.stability.settled) {
      const motionBoxes = (diff.stability.motionClusters ?? [])
        .map((mc) => `<code>(${mc.bbox.x}, ${mc.bbox.y}, ${mc.bbox.width}×${mc.bbox.height})</code>`)
        .join(', ');
      stabilityBanner = `<div class="stability-banner">
          <strong>⚠ Unsettled frame:</strong> Page did not settle after ${diff.stability.attempts} attempts (${(diff.stability.unstableRatio * 100).toFixed(2)}% unstable pixels)${motionBoxes ? ` — motion clusters at ${motionBoxes}` : ''}.
        </div>`;
    }

    let viewToolbar = '';
    let interactiveStages = '';
    if (baselineSrc && currentSrc) {
      const bboxToggleBtn =
        diff.clusters && diff.clusters.length > 0
          ? `<button type="button" class="toggle-bboxes-btn active">b · Clusters (${diff.clusters.length})</button>`
          : '';
      viewToolbar = `<div class="view-mode-toolbar" role="toolbar" aria-label="Comparison view mode">
          <button type="button" class="view-mode-btn active" data-view-mode="side-by-side">1 · Side-by-Side</button>
          <button type="button" class="view-mode-btn" data-view-mode="swipe">2 · Swipe</button>
          <button type="button" class="view-mode-btn" data-view-mode="onion">3 · Onion Skin</button>
          <button type="button" class="view-mode-btn" data-view-mode="diff">4 · Diff Focus</button>
          ${bboxToggleBtn}
        </div>`;

      interactiveStages = `<div class="swipe-stage" style="display:none">
          <div class="stage-controls">
            <label>Baseline ↔ Current</label>
            <input type="range" class="swipe-slider" min="0" max="100" value="50" aria-label="Swipe comparison slider">
          </div>
          <div class="comparison-canvas swipe-canvas">
            <img src="${currentSrc}" alt="current" class="stage-img stage-current" loading="lazy">
            <div class="swipe-clip" style="clip-path: inset(0 50% 0 0);">
              <img src="${baselineSrc}" alt="baseline" class="stage-img stage-baseline" loading="lazy">
            </div>
            <div class="swipe-divider" style="left: 50%;"></div>
            <div class="bbox-overlay"></div>
          </div>
        </div>
        <div class="onion-stage" style="display:none">
          <div class="stage-controls">
            <label>Current Opacity</label>
            <input type="range" class="onion-slider" min="0" max="100" value="50" aria-label="Onion skin opacity slider">
          </div>
          <div class="comparison-canvas onion-canvas">
            <img src="${baselineSrc}" alt="baseline" class="stage-img stage-baseline" loading="lazy">
            <img src="${currentSrc}" alt="current" class="stage-img stage-current onion-overlay-img" style="opacity: 0.5;" loading="lazy">
            <div class="bbox-overlay"></div>
          </div>
        </div>
        <div class="diff-stage" style="display:none">
          <div class="comparison-canvas diff-canvas">
            <img src="${diffSrc || currentSrc}" alt="diff focus" class="stage-img" loading="lazy">
            <div class="bbox-overlay"></div>
          </div>
        </div>`;
    }

    let clustersSection = '';
    if (diff.clusters && diff.clusters.length > 0) {
      const clusterRows = diff.clusters
        .map((c) => {
          const chromaCell =
            c.chromaSSIM !== undefined ? `${(c.chromaSSIM * 100).toFixed(1)}%` : '—';
          const cwCell =
            c.cwSSIM !== undefined ? `${(c.cwSSIM * 100).toFixed(1)}%` : '—';
          const selectorHtml = c.targetSelector
            ? ` <code class="cluster-selector">${escapeHtml(c.targetSelector)}</code>`
            : '';
          return `<tr class="cluster-row" data-cluster-id="${c.id}">
              <td><span class="cluster-id">#${c.id}</span>${selectorHtml}</td>
              <td><code>(${c.bbox.x}, ${c.bbox.y}) ${c.bbox.width}×${c.bbox.height}px</code></td>
              <td>${c.rawDiffPixels}px</td>
              <td>${chromaCell}</td>
              <td>${cwCell}</td>
            </tr>`;
        })
        .join('\n');
      clustersSection = `<div class="clusters-panel">
          <h4>🎯 Diff Clusters (${diff.clusters.length})</h4>
          <table class="clusters-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Bounding Box</th>
                <th>Diff Pixels</th>
                <th>Chroma SSIM</th>
                <th>CW-SSIM</th>
              </tr>
            </thead>
            <tbody>${clusterRows}</tbody>
          </table>
        </div>`;
    }

    let aiSection = '';
    if (diff.aiAnalysis) {
      const ai = diff.aiAnalysis;
      aiSection = `<div class="ai-analysis">
          <h4>🤖 AI Analysis ${severityBadge(ai.severity)}</h4>
          <p><strong>Classification:</strong> ${escapeHtml(ai.classification)}</p>
          <p>${escapeHtml(ai.explanation)}</p>
          ${ai.suggestedFix && !diff.suggestedFix ? `<p><strong>Suggested fix:</strong> ${escapeHtml(ai.suggestedFix)}</p>` : ''}
          <p class="confidence">Confidence: ${Math.round(ai.confidence * 100)}%</p>
        </div>`;
    }

    let fixSection = '';
    if (diff.suggestedFix) {
      const fix = diff.suggestedFix;
      const verified = diff.fixVerification?.verified;
      const verifyClass = verified === true ? 'fix-verified' : verified === false ? 'fix-unverified' : 'fix-suggested';
      const verifyLabel =
        verified === true ? '✓ Verified' : verified === false ? '⚠ Unverified' : '💡 Suggested';
      const patchId = `patch-${prefix}`;
      fixSection = `<div class="fix-panel ${verifyClass}">
          <h4>🔧 Suggested Fix <span class="fix-badge">${verifyLabel}</span>
            <span class="confidence">${Math.round(fix.confidence * 100)}% · ${escapeHtml(fix.category)}</span>
          </h4>
          <p>${escapeHtml(fix.explanation)}</p>
          ${fix.target ? `<p class="fix-target">Target: <code>${escapeHtml(fix.target)}</code></p>` : ''}
          <div class="fix-code-wrap">
            <button class="copy-fix-btn" data-target="${patchId}" type="button">Copy fix</button>
            <pre class="fix-code"><code id="${patchId}">${escapeHtml(fix.patch)}</code></pre>
          </div>
        </div>`;
    }

    const clustersAttr =
      diff.clusters && diff.clusters.length > 0
        ? ` data-clusters="${escapeHtml(
            JSON.stringify(
              diff.clusters.map((c) => ({
                id: c.id,
                x: c.bbox.x,
                y: c.bbox.y,
                width: c.bbox.width,
                height: c.bbox.height,
                rawDiffPixels: c.rawDiffPixels,
                chromaSSIM: c.chromaSSIM,
                cwSSIM: c.cwSSIM,
                ...(c.targetSelector ? { targetSelector: c.targetSelector } : {}),
              })),
            ),
          )}"`
        : '';

    return `<div class="diff-card status-${diff.status}${hasClusters ? ' bboxes-visible' : ''}" data-view-mode="side-by-side"${clustersAttr}>
        <div class="diff-header">
          ${statusIcon(diff.status)}
          <span class="diff-label">${diff.viewport}px · ${diff.browser}</span>
          ${pills.join('\n          ')}
          <span class="diff-percentage">${diff.diffPercentage.toFixed(2)}% changed</span>
        </div>
        ${diff.error ? `<div class="diff-error">${escapeHtml(diff.error)}</div>` : ''}
        ${stabilityBanner}
        ${viewToolbar}
        <div class="image-row">
          ${baselineSrc ? `<div class="image-col"><h5>Baseline</h5><img src="${baselineSrc}" alt="baseline" loading="lazy"></div>` : ''}
          ${currentSrc ? `<div class="image-col"><h5>Current</h5><div class="image-stage-wrap"><img src="${currentSrc}" alt="current" loading="lazy"><div class="bbox-overlay"></div></div></div>` : ''}
          ${diffSrc ? `<div class="image-col"><h5>Diff</h5><div class="image-stage-wrap"><img src="${diffSrc}" alt="diff" loading="lazy"><div class="bbox-overlay"></div></div></div>` : ''}
        </div>
        ${interactiveStages}
        ${clustersSection}
        ${aiSection}
        ${fixSection}
      </div>`;
  }).join('\n      ');

  return `<div class="route-detail" id="route-${index}" style="display:none">
      <h2>${escapeHtml(path)}</h2>
      ${diffCards}
    </div>`;
}

function renderTextSnapshotSection(result: RunResult): string {
  const rows = result.textSnapshots ?? [];
  if (rows.length === 0) return '';
  const notable = rows.filter((row) => row.status !== 'match');
  const body = notable.length === 0
    ? '<p>Text snapshots match. Pixel status is unchanged.</p>'
    : `<ul>${notable.map((row) => `<li>${escapeHtml(row.kind)} ${escapeHtml(row.status)}: ${escapeHtml(row.route)} @ ${row.viewport}px [${escapeHtml(row.browser)}]${row.excerpt ? ` — ${escapeHtml(row.excerpt)}` : ''}</li>`).join('')}</ul>`;
  return `<section class="text-snapshots" id="text-snapshots">
      <h2>Text snapshots</h2>
      <p>These do not change the pixel result. axe-core remains the accessibility check.</p>
      ${body}
    </section>`;
}

function renderHorizontalOverflowSection(result: RunResult): string {
  const rows = (result.horizontalOverflow ?? []).filter((row) => row.flagged);
  if (rows.length === 0) return '';
  const blocks = rows.map((row) => {
    const items = row.elements
      .map((el) => `<li><code>${escapeHtml(el.selector)}</code> ${el.overflowPx}px past the right edge</li>`)
      .join('');
    return `<h3>${escapeHtml(row.route)} @ ${row.viewport}px [${escapeHtml(row.browser)}]</h3>
        <p>scrollWidth ${row.scrollWidth}, innerWidth ${row.innerWidth}.</p>
        <ul>${items}</ul>`;
  }).join('\n');
  return `<section class="overflow-section" id="overflow-section">
      <h2>Horizontal overflow</h2>
      <p>Visible unclipped boxes past the right edge. This does not change the pixel result or the exit code.</p>
      ${blocks}
    </section>`;
}

function renderAccessibilitySection(result: RunResult): string {
  const a11y = result.accessibility ?? [];
  const withViolations = a11y.filter((r) => r.violations.length > 0);
  if (withViolations.length === 0) return '';
  const total = withViolations.reduce((n, r) => n + r.violations.length, 0);

  const blocks = withViolations.map((r) => {
    const rows = r.violations
      .map((v) => {
        const target = escapeHtml(v.nodes[0]?.target?.join(', ') ?? '');
        return `<tr class="a11y-${v.impact}">
            <td><span class="a11y-impact a11y-impact-${v.impact}">${v.impact}</span></td>
            <td><a href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener">${escapeHtml(v.id)}</a></td>
            <td>${escapeHtml(v.help)}</td>
            <td><code>${target}</code></td>
          </tr>`;
      })
      .join('\n');
    return `<h3>${escapeHtml(r.route)} @ ${r.viewport}px</h3>
        <table class="a11y-table">
          <thead><tr><th>Impact</th><th>Rule</th><th>Description</th><th>Element</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
  }).join('\n');

  return `<section class="a11y-section" id="a11y-section">
      <h2>♿ Accessibility (${total} violation${total !== 1 ? 's' : ''})</h2>
      ${blocks}
    </section>`;
}

function formatPerfValue(value: number, unit: string): string {
  if (unit === 'ms') return `${(value / 1000).toFixed(2)}s`;
  if (unit === 'KB') return `${value.toFixed(0)}KB`;
  if (unit === 'reqs') return `${Math.round(value)} reqs`;
  if (unit === '') return value.toFixed(3);
  return `${value}${unit}`;
}

function formatDeltaPct(frac: number): string {
  const pct = Math.round(frac * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function renderPerformanceSection(result: RunResult): string {
  const perf = result.perf ?? [];
  const withViolations = perf.filter((p) => p.violations.length > 0);
  const withRegressions = perf.filter((p) => (p.regressions?.length ?? 0) > 0);
  if (withViolations.length === 0 && withRegressions.length === 0) return '';

  const blocks: string[] = [];

  if (withViolations.length > 0) {
    const total = withViolations.reduce((n, p) => n + p.violations.length, 0);
    const rows = withViolations
      .flatMap((p) =>
        p.violations.map(
          (v) => `<tr>
            <td><code>${escapeHtml(p.route)}</code></td>
            <td>${p.viewport}px</td>
            <td>${escapeHtml(v.metric)}</td>
            <td>${escapeHtml(formatPerfValue(v.actual, v.unit))}</td>
            <td>${escapeHtml(formatPerfValue(v.budget, v.unit))}</td>
          </tr>`,
        ),
      )
      .join('\n');
    blocks.push(`<h3>${total} budget violation${total !== 1 ? 's' : ''}</h3>
      <table class="a11y-table">
        <thead><tr><th>Route</th><th>Viewport</th><th>Metric</th><th>Actual</th><th>Budget</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`);
  }

  if (withRegressions.length > 0) {
    const total = withRegressions.reduce((n, p) => n + (p.regressions?.length ?? 0), 0);
    const rows = withRegressions
      .flatMap((p) =>
        (p.regressions ?? []).map(
          (r) => `<tr>
            <td><code>${escapeHtml(p.route)}</code></td>
            <td>${p.viewport}px</td>
            <td>${escapeHtml(r.metric)}</td>
            <td>${escapeHtml(formatPerfValue(r.previous, r.unit))}</td>
            <td>${escapeHtml(formatPerfValue(r.current, r.unit))}</td>
            <td>${escapeHtml(formatDeltaPct(r.deltaPct))}</td>
          </tr>`,
        ),
      )
      .join('\n');
    blocks.push(`<h3>${total} regression${total !== 1 ? 's' : ''} since last run</h3>
      <table class="a11y-table">
        <thead><tr><th>Route</th><th>Viewport</th><th>Metric</th><th>Previous</th><th>Current</th><th>Δ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`);
  }

  return `<section class="perf-section" id="perf-section">
      <h2>⚡ Performance</h2>
      ${blocks.join('\n')}
    </section>`;
}

function renderThirdPartyScriptsSection(result: RunResult): string {
  const changed = (result.thirdPartyScripts ?? []).filter(
    (t) => t.added.length > 0 || t.removed.length > 0,
  );
  if (changed.length === 0) return '';

  const blocks = changed
    .map((t) => {
      const added = t.added.map((o) => `<li>➕ <code>${escapeHtml(o)}</code></li>`).join('');
      const removed = t.removed.map((o) => `<li>➖ <code>${escapeHtml(o)}</code></li>`).join('');
      return `<h3>${escapeHtml(t.route)} @ ${t.viewport}px</h3><ul>${added}${removed}</ul>`;
    })
    .join('\n');

  return `<section class="tps-section" id="tps-section">
      <h2>🧩 Third-party scripts</h2>
      ${blocks}
    </section>`;
}

function renderJudgementsSection(result: RunResult): string {
  const judgements = result.judgements;
  if (!judgements || judgements.length === 0) return '';

  const blocks = judgements
    .map((j) => {
      const status = j.error ? 'error' : j.pass ? 'pass' : 'regression';
      const statusText = j.error ? 'ERROR' : j.pass ? 'PASS' : 'FAIL';
      const score = `${Math.round(j.confidence * 100)}%`;
      const issuesHtml = j.error
        ? `<div class="error-box"><strong>Error:</strong> ${escapeHtml(j.error)}</div>`
        : j.issues.length > 0
          ? `<ul class="judge-issues">${j.issues
              .map(
                (i) =>
                  `<li>${severityBadge(i.severity)} <strong>${escapeHtml(i.category)}:</strong> ${escapeHtml(i.description)}${
                    i.suggestion ? ` <em>(${escapeHtml(i.suggestion)})</em>` : ''
                  }</li>`,
              )
              .join('\n')}</ul>`
          : `<p class="judge-no-issues">No issues detected.</p>`;

      return `<div class="judge-route" data-pass="${j.pass}">
        <div class="judge-route-header">
          ${statusIcon(status)}
          <strong>${escapeHtml(j.route.path)}</strong>
          <span class="judge-meta">@ ${j.viewport}px [${escapeHtml(j.browser)}] · ${statusText} · Confidence: ${score}</span>
        </div>
        ${issuesHtml}
      </div>`;
    })
    .join('\n');

  return `<section class="judgements-section" id="judgements-section">
      <h2>🧪 Judge Verdicts</h2>
      ${blocks}
    </section>`;
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
.sidebar-search { margin-bottom: 10px; }
.route-search-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 10px;
  font-size: 12px;
  outline: none;
}
.route-search-input:focus { border-color: var(--blue); }
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

.route-list { list-style: none; flex: 1; overflow-y: auto; }
.empty-filter-state { padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.sidebar-shortcuts {
  margin-top: auto;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-elevated);
}
.sidebar-shortcuts kbd {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--text);
}
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
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.diff-label { font-weight: 600; }
.meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(139, 148, 158, 0.15);
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.meta-pill.pill-settled { background: rgba(63, 185, 80, 0.12); color: var(--green); border-color: rgba(63, 185, 80, 0.35); }
.meta-pill.pill-unsettled { background: rgba(210, 153, 34, 0.15); color: var(--yellow); border-color: rgba(210, 153, 34, 0.4); }
.diff-percentage { margin-left: auto; color: var(--text-muted); font-size: 13px; }
.diff-error {
  padding: 8px 16px;
  background: rgba(248, 81, 73, 0.1);
  color: var(--red);
  font-size: 13px;
}
.stability-banner {
  padding: 10px 16px;
  background: rgba(210, 153, 34, 0.12);
  border-bottom: 1px solid rgba(210, 153, 34, 0.35);
  color: var(--yellow);
  font-size: 12px;
}
.stability-banner code {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--text);
}

/* 4-Mode View Switcher Toolbar */
.view-mode-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.view-mode-btn, .toggle-bboxes-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.view-mode-btn:hover, .toggle-bboxes-btn:hover { color: var(--text); border-color: var(--text-muted); }
.view-mode-btn.active { background: var(--blue); border-color: var(--blue); color: #fff; }
.toggle-bboxes-btn { margin-left: auto; }
.toggle-bboxes-btn.active { background: rgba(248, 81, 73, 0.18); border-color: var(--red); color: #ff7b72; }

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
  display: block;
}
.image-stage-wrap, .comparison-canvas {
  position: relative;
  display: inline-block;
  width: 100%;
}
.swipe-stage, .onion-stage, .diff-stage {
  padding: 16px;
}
.stage-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.stage-controls input[type="range"] {
  flex: 1;
  max-width: 320px;
  accent-color: var(--blue);
}
.stage-img {
  width: 100%;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: #000;
  display: block;
}
.swipe-clip, .onion-overlay-img {
  position: absolute;
  inset: 0;
}
.swipe-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--blue);
  pointer-events: none;
}

/* Bounding Box Overlay */
.bbox-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: none;
}
.diff-card.bboxes-visible .bbox-overlay {
  display: block;
}
.bbox-overlay-box {
  position: absolute;
  border: 2px solid var(--red);
  background: rgba(248, 81, 73, 0.18);
  border-radius: 2px;
}
.bbox-overlay-label {
  position: absolute;
  top: -18px;
  left: -2px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 2px;
  white-space: nowrap;
}

/* Diff Clusters Inspector Panel */
.clusters-panel {
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: rgba(248, 81, 73, 0.04);
}
.clusters-panel h4 {
  font-size: 13px;
  margin-bottom: 8px;
}
.clusters-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.clusters-table th, .clusters-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.clusters-table th {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
}
.clusters-table code {
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.cluster-id {
  display: inline-block;
  font-weight: 700;
  color: var(--red);
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

/* Suggested Fix panel */
.fix-panel {
  padding: 16px;
  border-top: 1px solid var(--border);
  background: rgba(63, 185, 80, 0.06);
}
.fix-panel.fix-verified { background: rgba(63, 185, 80, 0.10); border-left: 3px solid #3fb950; }
.fix-panel.fix-unverified { background: rgba(210, 153, 34, 0.08); border-left: 3px solid #d29922; }
.fix-panel.fix-suggested { border-left: 3px solid var(--border); }
.fix-panel h4 { font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fix-panel p { margin-bottom: 6px; font-size: 13px; }
.fix-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.08); }
.fix-target code { font-family: monospace; font-size: 12px; }
.fix-code-wrap { position: relative; margin-top: 8px; }
.fix-code {
  background: #0d1117; border: 1px solid var(--border); border-radius: 6px;
  padding: 12px; overflow-x: auto; font-size: 12px; line-height: 1.5;
}
.fix-code code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #7ee787; white-space: pre; }
.copy-fix-btn {
  position: absolute; top: 8px; right: 8px; z-index: 1;
  background: var(--border); color: var(--text); border: none; border-radius: 4px;
  padding: 4px 10px; font-size: 11px; cursor: pointer;
}
.copy-fix-btn:hover { background: #30363d; }
.copy-fix-btn.copied { background: #238636; color: #fff; }

/* Accessibility section */
.a11y-section { margin-top: 32px; padding: 16px; border-top: 1px solid var(--border); }
.a11y-section h2 { font-size: 18px; margin-bottom: 12px; }
.a11y-section h3 { font-size: 14px; margin: 16px 0 8px; color: var(--text-muted); }
.a11y-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.a11y-table th, .a11y-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.a11y-table code { font-family: ui-monospace, monospace; font-size: 12px; color: #7ee787; }
.a11y-impact { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.a11y-impact-critical { background: rgba(248,81,73,0.2); color: #ff7b72; }
.a11y-impact-serious { background: rgba(219,109,40,0.2); color: #ffa657; }
.a11y-impact-moderate { background: rgba(210,153,34,0.2); color: #e3b341; }
.a11y-impact-minor { background: rgba(88,166,255,0.15); color: #79c0ff; }

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
  const placeholder = document.getElementById('placeholder');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const routeItems = document.querySelectorAll('.route-item');
  const searchInput = document.getElementById('route-search');
  var emptyState = document.getElementById('empty-filter-state');
  var activeFilter = 'all';

  function selectRouteItem(item) {
    if (!item) return;
    const index = item.dataset.index;
    routeItems.forEach(function(el) { el.classList.remove('active'); });
    item.classList.add('active');
    document.querySelectorAll('.route-detail').forEach(function(el) { el.style.display = 'none'; });
    if (placeholder) placeholder.style.display = 'none';
    var detail = document.getElementById('route-' + index);
    if (detail) {
      detail.style.display = 'block';
      detail.querySelectorAll('.diff-card').forEach(renderCardBboxes);
    }
  }

  // Route selection
  if (routeList) {
    routeList.addEventListener('click', function(e) {
      const item = e.target.closest('.route-item');
      if (!item) return;
      selectRouteItem(item);
    });
  }

  function applyRouteFilters() {
    var query = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    var visibleCount = 0;

    routeItems.forEach(function(item) {
      var statusMatch = activeFilter === 'all' || item.dataset.status === activeFilter;
      var routeText = (item.dataset.route || item.textContent || '').toLowerCase();
      var searchMatch = !query || routeText.indexOf(query) !== -1;
      var show = statusMatch && searchMatch;
      item.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? '' : 'none';
    }
  }

  // Filter buttons
  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      applyRouteFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyRouteFilters);
  }

  // View mode switching on a diff-card
  function setCardViewMode(card, mode) {
    if (!card) return;
    card.dataset.viewMode = mode;
    card.querySelectorAll('.view-mode-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.viewMode === mode);
    });
    var imageRow = card.querySelector('.image-row');
    var swipeStage = card.querySelector('.swipe-stage');
    var onionStage = card.querySelector('.onion-stage');
    var diffStage = card.querySelector('.diff-stage');
    if (imageRow) imageRow.style.display = mode === 'side-by-side' ? '' : 'none';
    if (swipeStage) swipeStage.style.display = mode === 'swipe' ? '' : 'none';
    if (onionStage) onionStage.style.display = mode === 'onion' ? '' : 'none';
    if (diffStage) diffStage.style.display = mode === 'diff' ? '' : 'none';
  }

  // Render proportional bounding boxes over images when loaded
  function renderCardBboxes(card) {
    var raw = card.getAttribute('data-clusters');
    if (!raw) return;
    var clusters;
    try { clusters = JSON.parse(raw); } catch (e) { return; }
    if (!Array.isArray(clusters) || clusters.length === 0) return;

    var imgs = card.querySelectorAll('img');
    var refImg = null;
    imgs.forEach(function(img) {
      if (!refImg && img.naturalWidth > 0 && img.naturalHeight > 0) refImg = img;
    });
    if (!refImg) {
      imgs.forEach(function(img) {
        if (!img.dataset.bboxBound) {
          img.dataset.bboxBound = '1';
          img.addEventListener('load', function() { renderCardBboxes(card); });
        }
      });
      return;
    }

    var natW = refImg.naturalWidth;
    var natH = refImg.naturalHeight;
    card.querySelectorAll('.bbox-overlay').forEach(function(overlay) {
      overlay.innerHTML = '';
      clusters.forEach(function(c) {
        var box = document.createElement('div');
        box.className = 'bbox-overlay-box';
        box.style.left = ((c.x / natW) * 100).toFixed(2) + '%';
        box.style.top = ((c.y / natH) * 100).toFixed(2) + '%';
        box.style.width = Math.max(0.5, (c.width / natW) * 100).toFixed(2) + '%';
        box.style.height = Math.max(0.5, (c.height / natH) * 100).toFixed(2) + '%';
        var label = document.createElement('span');
        label.className = 'bbox-overlay-label';
        label.textContent = '#' + c.id;
        box.appendChild(label);
        overlay.appendChild(box);
      });
    });
  }

  // Delegated click & input handlers for view modes, bbox toggles, sliders, and copy-fix
  document.addEventListener('click', function(e) {
    var modeBtn = e.target.closest && e.target.closest('.view-mode-btn');
    if (modeBtn) {
      var card = modeBtn.closest('.diff-card');
      setCardViewMode(card, modeBtn.dataset.viewMode);
      return;
    }

    var bboxBtn = e.target.closest && e.target.closest('.toggle-bboxes-btn');
    if (bboxBtn) {
      var bboxCard = bboxBtn.closest('.diff-card');
      if (bboxCard) {
        var active = bboxCard.classList.toggle('bboxes-visible');
        bboxBtn.classList.toggle('active', active);
        renderCardBboxes(bboxCard);
      }
      return;
    }

    var btn = e.target.closest && e.target.closest('.copy-fix-btn');
    if (!btn) return;
    var code = document.getElementById(btn.getAttribute('data-target'));
    if (!code) return;
    var text = code.textContent || '';
    var done = function() {
      var original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function(){});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });

  document.addEventListener('input', function(e) {
    var target = e.target;
    if (!target || !target.classList) return;
    if (target.classList.contains('swipe-slider')) {
      var stage = target.closest('.swipe-stage');
      if (!stage) return;
      var val = Number(target.value);
      var clip = stage.querySelector('.swipe-clip');
      var divider = stage.querySelector('.swipe-divider');
      if (clip) clip.style.clipPath = 'inset(0 ' + (100 - val) + '% 0 0)';
      if (divider) divider.style.left = val + '%';
    } else if (target.classList.contains('onion-slider')) {
      var oStage = target.closest('.onion-stage');
      if (!oStage) return;
      var overlayImg = oStage.querySelector('.onion-overlay-img');
      if (overlayImg) overlayImg.style.opacity = String(Number(target.value) / 100);
    }
  });

  // Keyboard shortcuts: j/k route, 1-4 view mode, b toggle boxes, / focus search
  document.addEventListener('keydown', function(e) {
    var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    var isInput = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);
    if (isInput) {
      if (e.key === 'Escape' && e.target.blur) e.target.blur();
      return;
    }

    if (e.key === '/') {
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      return;
    }

    if (e.key === 'j' || e.key === 'k') {
      var visible = Array.prototype.filter.call(routeItems, function(el) {
        return el.style.display !== 'none';
      });
      if (visible.length === 0) return;
      var currentIdx = -1;
      visible.forEach(function(el, idx) {
        if (el.classList.contains('active')) currentIdx = idx;
      });
      var nextIdx = e.key === 'j'
        ? Math.min(visible.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
      selectRouteItem(visible[nextIdx]);
      return;
    }

    var modeMap = { '1': 'side-by-side', '2': 'swipe', '3': 'onion', '4': 'diff' };
    if (modeMap[e.key]) {
      document.querySelectorAll('.route-detail').forEach(function(detail) {
        if (detail.style.display !== 'none') {
          detail.querySelectorAll('.diff-card').forEach(function(card) {
            if (card.querySelector('.view-mode-toolbar')) {
              setCardViewMode(card, modeMap[e.key]);
            }
          });
        }
      });
      return;
    }

    if (e.key === 'b') {
      document.querySelectorAll('.route-detail').forEach(function(detail) {
        if (detail.style.display !== 'none') {
          detail.querySelectorAll('.diff-card').forEach(function(card) {
            var active = card.classList.toggle('bboxes-visible');
            var btn = card.querySelector('.toggle-bboxes-btn');
            if (btn) btn.classList.toggle('active', active);
            renderCardBboxes(card);
          });
        }
      });
    }
  });

  // Auto-select first route if only a few
  if (routeItems.length > 0 && routeItems.length <= 20) {
    routeItems[0].click();
  }
})();
`;
}
