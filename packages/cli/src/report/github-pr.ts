/**
 * GitHub PR comment reporter for Frontguard.
 *
 * Generates a markdown comment with visual regression results and posts
 * it to the relevant pull request. Updates existing comments on re-runs.
 *
 * @module report/github-pr
 */

import type { Reporter, PipelineStage, RunResult, DiffResult, PerfReport } from '../core/types.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMENT_MARKER = '<!-- frontguard-report -->';
const MAX_COMMENT_SIZE = 60_000; // GitHub's comment limit is ~65536, leave margin
const GITHUB_API = 'https://api.github.com';

/** Formats a perf metric value with its unit (ms → s, bytes → KB). */
function formatPerfValue(value: number, unit: string): string {
  if (unit === 'ms') return `${(value / 1000).toFixed(2)}s`;
  if (unit === 'KB') return `${value.toFixed(0)}KB`;
  if (unit === 'reqs') return `${Math.round(value)} reqs`;
  if (unit === '') return value.toFixed(3);
  return `${value}${unit}`;
}

// ---------------------------------------------------------------------------
// GitHub PR Reporter
// ---------------------------------------------------------------------------

export class GitHubPRReporter implements Reporter {
  private owner: string;
  private repo: string;
  private prNumber: number;
  /** Perf results keyed by `route@viewport`, populated per `generateComment`. */
  private perfByKey = new Map<string, PerfReport>();

  constructor(options?: { owner?: string; repo?: string; prNumber?: number }) {
    this.owner = options?.owner ?? '';
    this.repo = options?.repo ?? '';
    this.prNumber = options?.prNumber ?? 0;

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
    logger.error(`GitHub PR reporter error: ${error.message}`);
  }

  async onComplete(result: RunResult): Promise<void> {
    try {
      const markdown = this.generateComment(result);
      await this.postComment(markdown);
    } catch (err) {
      logger.error(`Failed to post GitHub PR comment: ${err instanceof Error ? err.message : String(err)}`);
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
    const hasPerfViolations = !!result.perf?.some((p) => p.violations.length > 0);
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
      sections.push(this.generateFooter(result));
      return sections.join('\n\n');
    }

    // Header with badge
    sections.push(this.generateHeader(summary));

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
      sections.push(this.generateNewPagesSection(newPages));
    }

    // Accessibility (Task 5.1)
    if (result.accessibility && result.accessibility.some((r) => r.violations.length > 0)) {
      sections.push(this.generateAccessibilitySection(result));
    }

    // Performance budgets — correlated with the visual diffs above.
    if (result.perf && result.perf.some((p) => p.violations.length > 0)) {
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

    let markdown = sections.join('\n\n');

    // Size check — truncate if needed
    if (markdown.length > MAX_COMMENT_SIZE) {
      markdown = this.truncateComment(markdown, result);
    }

    return markdown;
  }

  private generateHeader(summary: RunResult['summary']): string {
    let badge: string;
    let status: string;

    if (summary.regressions > 0) {
      badge = '🔴';
      status = `${summary.regressions} visual regression${summary.regressions !== 1 ? 's' : ''} detected`;
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
      const label = `\`${diff.route.path}\` @ ${diff.viewport}px (${diff.browser})`;
      lines.push(`<details open>`);
      lines.push(`<summary>${label} — ${diff.diffPercentage.toFixed(2)}% changed</summary>`);
      lines.push('');

      // Embed image thumbnails when upload URLs are available; otherwise fall
      // back to a text-only summary (legacy behaviour).
      lines.push(this.renderImageGrid(diff));

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
        lines.push(`> ${ai.explanation}`);
        if (ai.suggestedFix && !diff.suggestedFix) {
          lines.push(`>`);
          lines.push(`> **Suggested fix:** ${ai.suggestedFix}`);
        }
        lines.push('');
      }

      // Structured AI fix (Task 4.3)
      if (diff.suggestedFix) {
        lines.push(...this.renderFix(diff));
      }

      // Perf ↔ visual correlation: surface budget violations for this page.
      lines.push(...this.renderPerfForDiff(diff));

      lines.push('</details>');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Renders an inline performance note for a diff when the same route ×
   * viewport breached a perf budget — joining the visual regression with the
   * performance regression ("this page shifted *and* is over its LCP budget").
   * Returns an empty array when there is nothing to report.
   */
  private renderPerfForDiff(diff: DiffResult): string[] {
    const perf = this.perfByKey.get(`${diff.route.path}@${diff.viewport}`);
    if (!perf || perf.violations.length === 0) return [];
    const items = perf.violations
      .map((v) => `${v.metric} ${formatPerfValue(v.actual, v.unit)} > ${formatPerfValue(v.budget, v.unit)}`)
      .join(', ');
    return [`> ⚡ **Performance** — over budget: ${items}`, ''];
  }

  /**
   * Renders a summary section of all perf-budget violations across the run.
   */
  private generatePerformanceSection(result: RunResult): string {
    const withViolations = (result.perf ?? []).filter((p) => p.violations.length > 0);
    const total = withViolations.reduce((n, p) => n + p.violations.length, 0);
    const lines: string[] = [`## ⚡ Performance budgets (${total} violation${total !== 1 ? 's' : ''})`, ''];
    lines.push('| Route | Viewport | Metric | Actual | Budget |');
    lines.push('|:---|:---:|:---|:---:|:---:|');
    for (const p of withViolations) {
      for (const v of p.violations) {
        lines.push(
          `| \`${p.route}\` | ${p.viewport}px | ${v.metric} | ${formatPerfValue(v.actual, v.unit)} | ${formatPerfValue(v.budget, v.unit)} |`,
        );
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
      lines.push(`<summary>\`${t.route}\` @ ${t.viewport}px — ${t.added.length} added, ${t.removed.length} removed</summary>`);
      lines.push('');
      for (const o of t.added) lines.push(`- ➕ \`${o}\``);
      for (const o of t.removed) lines.push(`- ➖ \`${o}\``);
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
      `<summary>🔧 Suggested fix — ${fix.category} (${Math.round(fix.confidence * 100)}% confidence)</summary>`,
    );
    lines.push('');
    lines.push(badge);
    lines.push('');
    lines.push(`> ${fix.explanation}`);
    lines.push('');
    if (fix.target) lines.push(`Target: \`${fix.target}\``);
    lines.push('');
    // Present CSS as a diff block (additions) for "Apply Fix" copy-paste.
    lines.push('```diff');
    for (const line of fix.patch.split('\n')) {
      lines.push(`+ ${line}`);
    }
    lines.push('```');
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
      lines.push(`<summary>${r.route} @ ${r.viewport}px — ${r.violations.length} violation(s)</summary>`);
      lines.push('');
      lines.push('| Impact | Rule | Description | Element |');
      lines.push('|--------|------|-------------|---------|');
      for (const v of r.violations) {
        const emoji =
          v.impact === 'critical' ? '🔴' :
          v.impact === 'serious' ? '🟠' :
          v.impact === 'moderate' ? '🟡' : '🔵';
        const target = (v.nodes[0]?.target?.join(', ') ?? '').replace(/\|/g, '\\|');
        lines.push(
          `| ${emoji} ${v.impact} | [${v.id}](${v.helpUrl}) | ${v.help.replace(/\|/g, '\\|')} | \`${target}\` |`,
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
      const label = `\`${diff.route.path}\` @ ${diff.viewport}px (${diff.browser})`;
      lines.push(`<details>`);
      lines.push(`<summary>${label} — ${diff.diffPercentage.toFixed(2)}% changed</summary>`);
      lines.push('');

      lines.push(this.renderImageGrid(diff));

      if (diff.aiAnalysis) {
        lines.push(`> **AI:** ${diff.aiAnalysis.explanation}`);
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
   *
   * If image URLs were uploaded (`baselineImageUrl` etc.), produces an HTML
   * `<table>` of 280px-wide thumbnails linking to full-size images. If no URLs
   * are present (no image upload configured), falls back to a text summary —
   * preserving the previous behaviour.
   */
  private renderImageGrid(diff: DiffResult): string {
    const hasImages =
      Boolean(diff.baselineImageUrl) ||
      Boolean(diff.currentImageUrl) ||
      Boolean(diff.diffImageUrl);

    if (!hasImages) {
      return `> 📸 **Baseline → Current** (${diff.diffPercentage.toFixed(2)}% diff)\n`;
    }

    const cell = (url: string | undefined, alt: string): string =>
      url
        ? `<a href="${url}" target="_blank"><img src="${url}" width="280" alt="${alt}"/></a>`
        : '<em>n/a</em>';

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

  private generateNewPagesSection(newPages: DiffResult[]): string {
    const lines: string[] = ['## 🆕 New Pages', ''];

    const pageList = newPages.map((d) => `- \`${d.route.path}\` @ ${d.viewport}px`);
    lines.push(...pageList);
    lines.push('');
    lines.push('> These pages have no baseline yet. Screenshots have been saved as the new baseline.');

    return lines.join('\n');
  }

  private generateSummaryTable(result: RunResult): string {
    const viewports = [...new Set(result.diffs.map((d) => d.viewport))].sort((a, b) => a - b);
    const routes = [...new Set(result.diffs.map((d) => d.route.path))];

    if (routes.length === 0) return '';

    const lines: string[] = ['## 📊 Route Summary', ''];

    // Table header
    const vpHeaders = viewports.map((vp) => `${vp}px`);
    lines.push(`| Route | ${vpHeaders.join(' | ')} |`);
    lines.push(`|:---|${vpHeaders.map(() => ':---:').join('|')}|`);

    // Table rows
    for (const route of routes) {
      const cells = viewports.map((vp) => {
        const diff = result.diffs.find((d) => d.route.path === route && d.viewport === vp);
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
      lines.push(`| \`${route}\` | ${cells.join(' | ')} |`);
    }

    return lines.join('\n');
  }

  private generateFooter(result: RunResult): string {
    const totalSec = (result.timing.total / 1000).toFixed(1);
    return `---\n` +
      `<sub>🛡️ Frontguard visual regression test · ` +
      `${result.summary.total} comparisons in ${totalSec}s · ` +
      `📎 See the full HTML report with screenshots in the CI artifacts</sub>`;
  }

  private truncateComment(markdown: string, result: RunResult): string {
    // Keep header + summary + truncation notice
    const header = this.generateHeader(result.summary);
    const footer = this.generateFooter(result);

    const truncated = `${COMMENT_MARKER}\n\n` +
      `${header}\n\n` +
      `> ⚠️ **Report truncated** — Full report exceeds GitHub's comment size limit.\n` +
      `> See the full HTML report for complete details.\n\n` +
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
    const url = `${GITHUB_API}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments?per_page=100`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        // PR might not exist or be in a fork
        logger.warn('PR not found — it may be from a fork with restricted permissions.');
        return null;
      }
      throw new Error(`GitHub API error (${response.status}): ${await response.text()}`);
    }

    const comments = await response.json() as Array<{id: number; body?: string}>;

    for (const comment of comments) {
      if (comment.body?.includes(COMMENT_MARKER)) {
        return comment.id;
      }
    }

    return null;
  }

  private async createComment(body: string, headers: Record<string, string>): Promise<void> {
    const url = `${GITHUB_API}/repos/${this.owner}/${this.repo}/issues/${this.prNumber}/comments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create comment (${response.status}): ${await response.text()}`);
    }
  }

  private async updateComment(commentId: number, body: string, headers: Record<string, string>): Promise<void> {
    const url = `${GITHUB_API}/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
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
        'For fork PRs, use `pull_request_target` instead of `pull_request`.'
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
