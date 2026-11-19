/**
 * GitHub PR comment reporter for Frontguard.
 *
 * Generates a markdown comment with visual regression results and posts
 * it to the relevant pull request. Updates existing comments on re-runs.
 *
 * @module report/github-pr
 */

import type { Reporter, PipelineStage, RunResult, DiffResult, PerfReport } from '../core/types.js';
import { isHttpUrl } from '../discovery/story-url.js';
import { logger } from '../utils/logger.js';
import { redact } from '../utils/redact.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMENT_MARKER = '<!-- frontguard-report -->';
const MAX_COMMENT_SIZE = 60_000; // GitHub's comment limit is ~65536, leave margin
const MAX_COMMENT_PAGES = 10;
const TRUSTED_BOT_LOGINS = new Set([
  'github-actions[bot]',
  'frontguard[bot]',
  'frontguard-bot[bot]',
]);
const DEFAULT_GITHUB_API = 'https://api.github.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function escapeHtmlInline(text: string): string {
  return redact(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMarkdownText(text: string): string {
  return redact(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\|/g, '\\|')
    .replace(/@([a-zA-Z0-9-]+)/g, '@\u200b$1');
}

function escapeBlockquote(text: string): string {
  return escapeMarkdownText(text)
    .split(/\r?\n/)
    .map((line) => `> ${line.replace(/^(\s*\/)/, '$1\u200b')}`)
    .join('\n');
}

function markdownFence(content: string, lang: string): string {
  const clean = redact(content);
  let longest = 2;
  const runs = clean.match(/`+/g);
  if (runs) {
    for (const r of runs) if (r.length > longest) longest = r.length;
  }
  const fence = '`'.repeat(longest + 1);
  return `${fence}${lang}\n${clean}\n${fence}`;
}

/** Formats a perf metric value with its unit (ms → s, bytes → KB). */
function formatPerfValue(value: number, unit: string): string {
  if (unit === 'ms') return `${(value / 1000).toFixed(2)}s`;
  if (unit === 'KB') return `${value.toFixed(0)}KB`;
  if (unit === 'reqs') return `${Math.round(value)} reqs`;
  if (unit === '') return value.toFixed(3);
  return `${value}${unit}`;
}

/** Formats a relative delta fraction as a signed percentage (0.33 → "+33%"). */
function formatDeltaPct(frac: number): string {
  const pct = Math.round(frac * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** Inline code span. A longer fence keeps backticks inside the excerpt literal. */
function markdownCode(raw: string): string {
  const text = redact(raw).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
  let run = 0;
  let longest = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

// ---------------------------------------------------------------------------
// GitHub PR Reporter
// ---------------------------------------------------------------------------

export class GitHubPRReporter implements Reporter {
  private owner: string;
  private repo: string;
  private prNumber: number;
  private requestTimeoutMs: number;
  private apiUrl: string;
  /** Perf results keyed by `route@viewport`, populated per `generateComment`. */
  private perfByKey = new Map<string, PerfReport>();

  constructor(options?: {
    owner?: string;
    repo?: string;
    prNumber?: number;
    requestTimeoutMs?: number;
    apiUrl?: string;
  }) {
    this.owner = options?.owner ?? '';
    this.repo = options?.repo ?? '';
    this.prNumber = options?.prNumber ?? 0;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.apiUrl = (
      options?.apiUrl ?? process.env.GITHUB_API_URL ?? DEFAULT_GITHUB_API
    ).replace(/\/+$/, '');

    // Auto-detect from GitHub Actions environment
    if (!this.owner || !this.repo) {
      const repository = process.env.GITHUB_REPOSITORY ?? '';
      const parts = repository.split('/');
      if (parts.length === 2) {
        this.owner = parts[0];
        this.repo = parts[1];
      }
    }

    if (!this.prNumber) {
      // GITHUB_REF format: refs/pull/123/merge
      const ref = process.env.GITHUB_REF ?? '';
      const match = ref.match(/refs\/pull\/(\d+)/);
      if (match) {
        this.prNumber = parseInt(match[1], 10);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Reporter Interface (stage callbacks are no-ops for PR reporter)
  // -----------------------------------------------------------------------

  onStageStart(_stage: PipelineStage, _detail?: string): void {}
  onStageProgress(_stage: PipelineStage, _current: number, _total: number, _detail?: string): void {}
  onStageComplete(_stage: PipelineStage, _detail?: string): void {}

  onError(error: Error): void {
    logger.error(`GitHub PR reporter error: ${redact(error.message)}`);
  }

  async onComplete(result: RunResult): Promise<void> {
    try {
      const markdown = this.generateComment(result);
      await this.postComment(markdown);
    } catch (err) {
      logger.error(
        `Failed to post GitHub PR comment: ${redact(err instanceof Error ? err.message : String(err))}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Markdown Generation
  // -----------------------------------------------------------------------

  generateComment(result: RunResult): string {
    const { summary } = result;
    const sections: string[] = [];

    // Index perf results by route@viewport so each diff can be annotated with
    // the budget violations for the same page (perf ↔ visual correlation).
    this.perfByKey = new Map(
      (result.perf ?? []).map((p) => [`${p.route}@${p.viewport}`, p]),
    );

    // Marker for finding existing comments
    sections.push(COMMENT_MARKER);

    // If all pages pass (no regressions, warnings, errors, or new), show clean
    // badge — but still surface accessibility violations if any were found.
    const allPassing = summary.regressions === 0 && summary.warnings === 0 && summary.errors === 0 && summary.newPages === 0;
    const hasA11yViolations = !!result.accessibility?.some((r) => r.violations.length > 0);
    const hasPerfViolations = !!result.perf?.some(
      (p) => p.violations.length > 0 || (p.regressions?.length ?? 0) > 0,
    );
    if (allPassing && summary.total > 0) {
      sections.push(`# ✅ Frontguard — All ${summary.total} pages match baselines`);
      if (hasA11yViolations) {
        sections.push(this.generateAccessibilitySection(result));
      }
      if (hasPerfViolations) {
        sections.push(this.generatePerformanceSection(result));
      }
      if (result.thirdPartyScripts && result.thirdPartyScripts.some((t) => t.added.length > 0 || t.removed.length > 0)) {
        sections.push(this.generateThirdPartyScriptsSection(result));
      }
      const passingText = this.textSnapshotSection(result);
      if (passingText) sections.push(passingText);
      sections.push(this.generateFooter(result));
      let passingMarkdown = redact(sections.join('\n\n'));
      if (passingMarkdown.length > MAX_COMMENT_SIZE) {
        passingMarkdown = this.truncateComment(passingMarkdown, result);
      }
      return passingMarkdown;
    }

    // Header with badge
    sections.push(this.generateHeader(result));

    // Regressions
    const regressions = result.diffs.filter((d) => d.status === 'regression');
    if (regressions.length > 0) {
      sections.push(this.generateRegressionsSection(regressions));
    }

    // Warnings
    const warnings = result.diffs.filter((d) => d.status === 'changed');
    if (warnings.length > 0) {
      sections.push(this.generateWarningsSection(warnings));
    }

    // New pages
    const newPages = result.diffs.filter((d) => d.status === 'new');
    if (newPages.length > 0) {
      sections.push(this.generateNewPagesSection(newPages, result));
    }

    const textSection = this.textSnapshotSection(result);
    if (textSection) sections.push(textSection);

    // Accessibility (Task 5.1)
    if (result.accessibility && result.accessibility.some((r) => r.violations.length > 0)) {
      sections.push(this.generateAccessibilitySection(result));
    }

    // Performance — budget violations + run-over-run regressions, correlated
    // with the visual diffs above.
    if (result.perf && result.perf.some((p) => p.violations.length > 0 || (p.regressions?.length ?? 0) > 0)) {
      sections.push(this.generatePerformanceSection(result));
    }

    // Third-party script changes.
    if (result.thirdPartyScripts && result.thirdPartyScripts.some((t) => t.added.length > 0 || t.removed.length > 0)) {
      sections.push(this.generateThirdPartyScriptsSection(result));
    }

    // Summary table
    sections.push(this.generateSummaryTable(result));

    // Footer
    sections.push(this.generateFooter(result));

    let markdown = redact(sections.join('\n\n'));

    // Size check — truncate if needed
    if (markdown.length > MAX_COMMENT_SIZE) {
      markdown = this.truncateComment(markdown, result);
    }

    return markdown;
  }

  private textSnapshotSection(result: RunResult): string | undefined {
    if (!result.textSnapshots || result.textSnapshots.length === 0) return undefined;
    const lines = ['## Text snapshots', '', 'These do not change the pixel result.', ''];
    for (const row of result.textSnapshots) {
      if (row.status === 'match') continue;
      const detail = row.excerpt ? ` (${markdownCode(row.excerpt)})` : '';
      lines.push(
        `- ${markdownCode(row.route)} @ ${row.viewport}px [${escapeMarkdownText(row.browser)}] ${escapeMarkdownText(row.kind)}: ${escapeMarkdownText(row.status)}${detail}`,
      );
    }
    if (lines.length === 4) lines.push('- All captured text snapshots match.');
    return lines.join('\n');
  }

  private generateHeader(result: RunResult): string {
    const { summary } = result;
    let badge: string;
    let status: string;

    if (result.baselineRefusal) {
      badge = '🔴';
      status = 'Baseline update refused';
    } else if (result.baselineUpdate) {
      badge = '🟢';
      status = `${summary.total} baseline${summary.total !== 1 ? 's' : ''} explicitly accepted`;
    } else if (summary.errors > 0) {
      badge = '🔴';
      status = `${summary.errors} visual test error${summary.errors !== 1 ? 's' : ''}`;
    } else if (summary.regressions > 0) {
      badge = '🔴';
      status = `${summary.regressions} visual regression${summary.regressions !== 1 ? 's' : ''} detected`;
    } else if (summary.newPages > 0) {
      badge = '🟡';
      status = `${summary.newPages} new screenshot${summary.newPages !== 1 ? 's' : ''} require baseline acceptance`;
    } else if (summary.warnings > 0) {
      badge = '🟡';
      status = `${summary.warnings} visual change${summary.warnings !== 1 ? 's' : ''} detected`;
    } else {
      badge = '🟢';
      status = 'All visual tests passed';
    }

    return `# ${badge} Frontguard — ${status}\n\n` +
      `| Total | Passed | Regressions | Warnings | New |\n` +
      `|:---:|:---:|:---:|:---:|:---:|\n` +
      `| ${summary.total} | ✅ ${summary.passed} | ${summary.regressions > 0 ? '❌' : '✅'} ${summary.regressions} | ${summary.warnings > 0 ? '⚠️' : '✅'} ${summary.warnings} | 🆕 ${summary.newPages} |`;
  }

  private generateRegressionsSection(regressions: DiffResult[]): string {
    const lines: string[] = ['## ❌ Regressions', ''];

    for (const diff of regressions) {
      const label = `${markdownCode(escapeHtmlInline(diff.route.path))} @ ${diff.viewport}px (${escapeHtmlInline(diff.browser)})`;
      const windowNote =
        diff.windowMax !== undefined && diff.windowMax > 64
          ? `, 16×16 window ${diff.windowMax}`
          : '';
      lines.push(`<details open>`);
      lines.push(`<summary>${label} — ${diff.diffPercentage.toFixed(2)}% changed${windowNote}</summary>`);
      lines.push('');

      // Embed image thumbnails when upload URLs are available; otherwise fall
      // back to a text-only summary (legacy behaviour).
      lines.push(this.renderImageGrid(diff));

      if (diff.dimensionNote) {
        lines.push(escapeBlockquote(`Note: ${diff.dimensionNote}`));
        lines.push('');
      }

      // AI analysis with a classification badge.
      if (diff.aiAnalysis) {
        const ai = diff.aiAnalysis;
        const severityEmoji =
          ai.severity === 'critical' ? '🔴' :
          ai.severity === 'warning' ? '🟡' : 'ℹ️';
        const classBadge =
          ai.classification === 'regression' ? '🔴 Regression' :
          ai.classification === 'intentional' ? '🟢 Intentional' : '🟡 Content update';

        lines.push(`> ${severityEmoji} **AI Analysis** — ${classBadge} (${Math.round(ai.confidence * 100)}% confidence)`);
        lines.push(`>`);
        lines.push(escapeBlockquote(ai.explanation));
        if (ai.suggestedFix && !diff.suggestedFix) {
          lines.push(`>`);
          lines.push(escapeBlockquote(`**Suggested fix:** ${ai.suggestedFix}`));
        }
        lines.push('');
      } else if (diff.aiError) {
        lines.push(escapeBlockquote(`AI analysis unavailable: ${diff.aiError}`));
        lines.push('');
      }

      // Structured AI fix (Task 4.3)
      if (diff.suggestedFix) {
        lines.push(...this.renderFix(diff));
      }

      // Perf ↔ visual correlation: surface budget violations and run-over-run
      // regressions for this page.
      lines.push(...this.renderPerfForDiff(diff));

      lines.push('</details>');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Renders an inline performance note for a diff when the same route ×
   * viewport breached a perf budget or regressed since the last run — joining
   * the visual change with the performance change ("this page shifted *and* is
   * over its LCP budget" / "*and* its TTFB is up 35% since last run"). Returns
   * an empty array when there is nothing to report.
   */
  private renderPerfForDiff(diff: DiffResult): string[] {
    const perf = this.perfByKey.get(`${diff.route.path}@${diff.viewport}`);
    if (!perf) return [];
    const parts: string[] = [];
    if (perf.violations.length > 0) {
      parts.push(
        'over budget: ' +
          perf.violations
            .map((v) => `${v.metric} ${formatPerfValue(v.actual, v.unit)} > ${formatPerfValue(v.budget, v.unit)}`)
            .join(', '),
      );
    }
    if (perf.regressions && perf.regressions.length > 0) {
      parts.push(
        'regressed since last run: ' +
          perf.regressions
            .map((r) => `${r.metric} ${formatDeltaPct(r.deltaPct)} (${formatPerfValue(r.previous, r.unit)} → ${formatPerfValue(r.current, r.unit)})`)
            .join(', '),
      );
    }
    if (parts.length === 0) return [];
    return [`> ⚡ **Performance** — ${parts.join('; ')}`, ''];
  }

  /**
   * Renders a summary section of perf-budget violations and run-over-run
   * regressions across the run.
   */
  private generatePerformanceSection(result: RunResult): string {
    const perf = result.perf ?? [];
    const withViolations = perf.filter((p) => p.violations.length > 0);
    const withRegressions = perf.filter((p) => (p.regressions?.length ?? 0) > 0);
    const violationCount = withViolations.reduce((n, p) => n + p.violations.length, 0);
    const lines: string[] = ['## ⚡ Performance', ''];

    if (violationCount > 0) {
      lines.push(`**${violationCount} budget violation${violationCount !== 1 ? 's' : ''}**`, '');
      lines.push('| Route | Viewport | Metric | Actual | Budget |');
      lines.push('|:---|:---:|:---|:---:|:---:|');
      for (const p of withViolations) {
        for (const v of p.violations) {
          lines.push(
            `| ${markdownCode(p.route)} | ${p.viewport}px | ${escapeMarkdownText(v.metric)} | ${formatPerfValue(v.actual, v.unit)} | ${formatPerfValue(v.budget, v.unit)} |`,
          );
        }
      }
      lines.push('');
    }

    if (withRegressions.length > 0) {
      const regCount = withRegressions.reduce((n, p) => n + (p.regressions?.length ?? 0), 0);
      lines.push(`**${regCount} regression${regCount !== 1 ? 's' : ''} since last run**`, '');
      lines.push('| Route | Viewport | Metric | Previous | Current | Δ |');
      lines.push('|:---|:---:|:---|:---:|:---:|:---:|');
      for (const p of withRegressions) {
        for (const r of p.regressions ?? []) {
          lines.push(
            `| ${markdownCode(p.route)} | ${p.viewport}px | ${escapeMarkdownText(r.metric)} | ${formatPerfValue(r.previous, r.unit)} | ${formatPerfValue(r.current, r.unit)} | ${formatDeltaPct(r.deltaPct)} |`,
          );
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Renders a section listing third-party script origins that appeared or
   * disappeared since the previous run.
   */
  private generateThirdPartyScriptsSection(result: RunResult): string {
    const changed = (result.thirdPartyScripts ?? []).filter(
      (t) => t.added.length > 0 || t.removed.length > 0,
    );
    const lines: string[] = ['## 🧩 Third-party scripts', ''];
    for (const t of changed) {
      lines.push(`<details>`);
      lines.push(
        `<summary>${markdownCode(escapeHtmlInline(t.route))} @ ${t.viewport}px — ${t.added.length} added, ${t.removed.length} removed</summary>`,
      );
      lines.push('');
      for (const o of t.added) lines.push(`- ➕ ${markdownCode(o)}`);
      for (const o of t.removed) lines.push(`- ➖ ${markdownCode(o)}`);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Renders a collapsible structured-fix block with the CSS patch in a
   * fenced `diff` code block. Verified fixes are visually distinct.
   */
  private renderFix(diff: DiffResult): string[] {
    const fix = diff.suggestedFix;
    if (!fix) return [];
    const verified = diff.fixVerification?.verified;
    const badge =
      verified === true
        ? '✅ **Verified** — re-rendered within threshold'
        : verified === false
          ? '⚠️ Unverified — could not confirm in sandbox'
          : '💡 Suggested';
    const lines: string[] = [];
    lines.push('<details open>');
    lines.push(
      `<summary>🔧 Suggested fix — ${escapeHtmlInline(fix.category)} (${Math.round(fix.confidence * 100)}% confidence)</summary>`,
    );
    lines.push('');
    lines.push(badge);
    lines.push('');
    lines.push(escapeBlockquote(fix.explanation));
    lines.push('');
    if (fix.target) lines.push(`Target: ${markdownCode(fix.target)}`);
    lines.push('');
    // Present CSS as a diff block with a dynamic fence so backticks cannot escape.
    const diffBody = fix.patch
      .split('\n')
      .map((line) => `+ ${line}`)
      .join('\n');
    lines.push(markdownFence(diffBody, 'diff'));
    lines.push('');
    lines.push('</details>');
    lines.push('');
    return lines;
  }

  /** Renders the accessibility violations section. */
  private generateAccessibilitySection(result: RunResult): string {
    const a11y = result.accessibility ?? [];
    const withViolations = a11y.filter((r) => r.violations.length > 0);
    const total = withViolations.reduce((n, r) => n + r.violations.length, 0);
    const lines: string[] = [`## ♿ Accessibility (${total} violation${total !== 1 ? 's' : ''})`, ''];

    for (const r of withViolations) {
      lines.push(`<details>`);
      lines.push(
        `<summary>${escapeHtmlInline(r.route)} @ ${r.viewport}px — ${r.violations.length} violation(s)</summary>`,
      );
      lines.push('');
      lines.push('| Impact | Rule | Description | Element |');
      lines.push('|--------|------|-------------|---------|');
      for (const v of r.violations) {
        const emoji =
          v.impact === 'critical' ? '🔴' :
          v.impact === 'serious' ? '🟠' :
          v.impact === 'moderate' ? '🟡' : '🔵';
        const target = v.nodes[0]?.target?.join(', ') ?? '';
        const ruleCell = isHttpUrl(v.helpUrl)
          ? `[${escapeMarkdownText(v.id)}](${encodeURI(v.helpUrl).replace(/\)/g, '%29')})`
          : escapeMarkdownText(v.id);
        lines.push(
          `| ${emoji} ${escapeMarkdownText(v.impact)} | ${ruleCell} | ${escapeMarkdownText(v.help)} | ${markdownCode(target)} |`,
        );
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    return lines.join('\n');
  }

  private generateWarningsSection(warnings: DiffResult[]): string {
    const lines: string[] = ['## ⚠️ Warnings', ''];

    for (const diff of warnings) {
      const label = `${markdownCode(escapeHtmlInline(diff.route.path))} @ ${diff.viewport}px (${escapeHtmlInline(diff.browser)})`;
      lines.push(`<details>`);
      lines.push(`<summary>${label} — ${diff.diffPercentage.toFixed(2)}% changed</summary>`);
      lines.push('');

      lines.push(this.renderImageGrid(diff));

      if (diff.dimensionNote) {
        lines.push(escapeBlockquote(`Note: ${diff.dimensionNote}`));
        lines.push('');
      }

      if (diff.aiAnalysis) {
        lines.push(escapeBlockquote(`**AI:** ${diff.aiAnalysis.explanation}`));
        lines.push('');
      } else if (diff.aiError) {
        lines.push(escapeBlockquote(`AI analysis unavailable: ${diff.aiError}`));
        lines.push('');
      }

      lines.push(...this.renderPerfForDiff(diff));

      lines.push('</details>');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Renders a baseline/current/diff image grid for a diff.
   */
  private renderImageGrid(diff: DiffResult): string {
    const hasImages =
      Boolean(diff.baselineImageUrl) ||
      Boolean(diff.currentImageUrl) ||
      Boolean(diff.diffImageUrl);

    if (!hasImages) {
      return `> 📸 **Baseline → Current** (${diff.diffPercentage.toFixed(2)}% diff)\n`;
    }

    const cell = (url: string | undefined, alt: string): string => {
      if (!url || !isHttpUrl(url)) return '<em>n/a</em>';
      const safeUrl = escapeHtmlInline(url);
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer"><img src="${safeUrl}" width="280" alt="${alt}"/></a>`;
    };

    return [
      '<table>',
      '<tr><th>Baseline</th><th>Current</th><th>Diff</th></tr>',
      '<tr>',
      `<td>${cell(diff.baselineImageUrl, 'baseline')}</td>`,
      `<td>${cell(diff.currentImageUrl, 'current')}</td>`,
      `<td>${cell(diff.diffImageUrl, 'diff')}</td>`,
      '</tr>',
      '</table>',
      '',
    ].join('\n');
  }

  private generateNewPagesSection(newPages: DiffResult[], result: RunResult): string {
    const lines: string[] = ['## 🆕 New Pages', ''];

    const pageList = newPages.map((d) => `- ${markdownCode(d.route.path)} @ ${d.viewport}px`);
    lines.push(...pageList);
    lines.push('');
    if (result.baselineRefusal) {
      lines.push(escapeBlockquote(`Baselines were not written. ${result.baselineRefusal}`));
      lines.push('> The pixel status is unchanged.');
    } else if (result.baselineUpdate) {
      lines.push(
        '> These screenshots were explicitly accepted and committed to the local `frontguard-baselines` branch.',
      );
    } else {
      lines.push(
        '> These pages have no accepted baseline yet. Review them, then run `frontguard update-baselines --confirm-baselines` to capture and accept fresh baselines.',
      );
    }

    return lines.join('\n');
  }

  private generateSummaryTable(result: RunResult): string {
    const viewports = [...new Set(result.diffs.map((d) => d.viewport))].sort((a, b) => a - b);
    const routes = [...new Set(result.diffs.map((d) => d.route.path))];
    const browsers = [...new Set(result.diffs.map((d) => d.browser))];

    if (routes.length === 0) return '';

    const lines: string[] = ['## 📊 Route Summary', ''];

    // Table header
    const vpHeaders = viewports.map((vp) => `${vp}px`);
    lines.push(`| Route | Browser | ${vpHeaders.join(' | ')} |`);
    lines.push(`|:---|:---|${vpHeaders.map(() => ':---:').join('|')}|`);

    // Table rows
    for (const route of routes) {
      for (const browser of browsers) {
        if (!result.diffs.some((d) => d.route.path === route && d.browser === browser)) continue;
        const cells = viewports.map((vp) => {
          const diff = result.diffs.find(
            (d) => d.route.path === route && d.viewport === vp && d.browser === browser,
          );
          if (!diff) return '–';
          switch (diff.status) {
            case 'pass': return '✓';
            case 'changed': return '⚠';
            case 'regression': return '✘';
            case 'new': return '★';
            case 'error': return '✘';
            case 'flaky': return '⚠';
            default: return '–';
          }
        });
        lines.push(`| ${markdownCode(route)} | ${escapeMarkdownText(browser)} | ${cells.join(' | ')} |`);
      }
    }

    return lines.join('\n');
  }

  private generateFooter(result: RunResult): string {
    const totalSec = (result.timing.total / 1000).toFixed(1);
    return `---\n` +
      `<sub>🛡️ Frontguard visual regression test · ` +
      `${result.summary.total} comparisons in ${totalSec}s · ` +
      `📎 Report directory: ${markdownCode(result.config.outputDir)}</sub>`;
  }

  private truncateComment(markdown: string, result: RunResult): string {
    // Keep header + summary + truncation notice
    const header = this.generateHeader(result);
    const footer = this.generateFooter(result);

    const truncated = `${COMMENT_MARKER}\n\n` +
      `${header}\n\n` +
      `> ⚠️ **Report truncated** — Full report exceeds GitHub's comment size limit.\n` +
      `> See the workflow artifact when an HTML report was generated.\n\n` +
      `${this.generateSummaryTable(result)}\n\n` +
      `${footer}`;

    return truncated;
  }

  // -----------------------------------------------------------------------
  // GitHub API — Post / Update Comment
  // -----------------------------------------------------------------------

  async postComment(markdown: string): Promise<void> {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      logger.warn(
        'GITHUB_TOKEN not set — cannot post PR comment. ' +
        'Set the GITHUB_TOKEN environment variable to enable PR comments.'
      );
      return;
    }

    if (!this.owner || !this.repo || !this.prNumber) {
      logger.warn(
        'Cannot determine GitHub repository or PR number. ' +
        'Ensure GITHUB_REPOSITORY and GITHUB_REF environment variables are set, ' +
        'or pass owner/repo/prNumber to the reporter constructor.'
      );
      return;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      // Find existing comment
      const existingId = await this.findExistingComment(headers);

      if (existingId) {
        // Update existing comment
        await this.updateComment(existingId, markdown, headers);
        logger.info('Updated existing Frontguard PR comment');
      } else {
        // Create new comment
        await this.createComment(markdown, headers);
        logger.info('Created new Frontguard PR comment');
      }
    } catch (err) {
      if (err instanceof Error) {
        this.handleGitHubError(err);
      }
      throw err;
    }
  }

  private async findExistingComment(headers: Record<string, string>): Promise<number | null> {
    let authenticatedLogin: string | null | undefined;
    const getAuthenticatedLogin = async (): Promise<string | null> => {
      if (authenticatedLogin !== undefined) return authenticatedLogin;
      try {
        const res = await fetch(`${this.apiUrl}/user`, {
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        if (!res.ok) {
          authenticatedLogin = null;
          return null;
        }
        const data = (await res.json()) as { login?: unknown };
        authenticatedLogin = typeof data.login === 'string' ? data.login.toLowerCase() : null;
        return authenticatedLogin;
      } catch {
        authenticatedLogin = null;
        return null;
      }
    };

    for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
      const url = `${this.apiUrl}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments?per_page=100&page=${page}`;
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // PR might not exist or be in a fork
          logger.warn('PR not found — it may be from a fork with restricted permissions.');
          return null;
        }
        throw new Error(`GitHub API error (${response.status}): ${await response.text()}`);
      }

      const comments = (await response.json()) as Array<{
        id: number;
        body?: string;
        user?: { login?: string; type?: string } | null;
      }>;
      for (const comment of comments) {
        if (!comment.body?.includes(COMMENT_MARKER)) continue;
        const login = comment.user?.login?.toLowerCase();
        if (!login) continue;
        if (TRUSTED_BOT_LOGINS.has(login)) {
          return comment.id;
        }
        const me = await getAuthenticatedLogin();
        if (me !== null && login === me) {
          return comment.id;
        }
      }

      if (comments.length < 100) return null;
    }
    return null;
  }

  private async createComment(body: string, headers: Record<string, string>): Promise<void> {
    const url = `${this.apiUrl}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Failed to create comment (${response.status}): ${await response.text()}`);
    }
  }

  private async updateComment(commentId: number, body: string, headers: Record<string, string>): Promise<void> {
    const url = `${this.apiUrl}/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Failed to update comment (${response.status}): ${await response.text()}`);
    }
  }

  private handleGitHubError(err: Error): void {
    const msg = err.message;

    if (msg.includes('403')) {
      logger.error(
        'GitHub API permission denied (403). ' +
        'Ensure the GITHUB_TOKEN has `write` permission for pull requests. ' +
        'Built-in fork PR comments are unsupported because fork tokens are read-only. ' +
        'Use a separate privileged workflow that only reads trusted artifacts and never executes fork code.'
      );
    } else if (msg.includes('422')) {
      logger.error(
        'GitHub API validation failed (422). ' +
        'The comment body may be too large or contain invalid content.'
      );
    } else if (msg.includes('429')) {
      logger.error(
        'GitHub API rate limit exceeded (429). ' +
        'Wait a few minutes and try again, or use a PAT with higher limits.'
      );
    }
  }
}
