/**
 * GitHub PR comment reporter for Frontguard.
 *
 * Generates a markdown comment with visual regression results and posts
 * it to the relevant pull request. Updates existing comments on re-runs.
 *
 * @module report/github-pr
 */

import type { Reporter, PipelineStage, RunResult, DiffResult } from '../core/types.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMENT_MARKER = '<!-- frontguard-report -->';
const MAX_COMMENT_SIZE = 60_000; // GitHub's comment limit is ~65536, leave margin
const GITHUB_API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// GitHub PR Reporter
// ---------------------------------------------------------------------------

export class GitHubPRReporter implements Reporter {
  private owner: string;
  private repo: string;
  private prNumber: number;

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

    // Marker for finding existing comments
    sections.push(COMMENT_MARKER);

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
      lines.push(`<details>`);
      lines.push(`<summary>${label} — ${diff.diffPercentage.toFixed(2)}% changed</summary>`);
      lines.push('');

      // Image placeholders (would be replaced with actual uploaded image URLs in a real CI)
      lines.push('| Baseline | Current | Diff |');
      lines.push('|:---:|:---:|:---:|');
      lines.push(`| ![baseline](baseline) | ![current](current) | ![diff](diff) |`);
      lines.push('');

      // AI analysis
      if (diff.aiAnalysis) {
        const ai = diff.aiAnalysis;
        const severityEmoji =
          ai.severity === 'critical' ? '🔴' :
          ai.severity === 'warning' ? '🟡' : 'ℹ️';

        lines.push(`> ${severityEmoji} **AI Analysis** (${Math.round(ai.confidence * 100)}% confidence)`);
        lines.push(`>`);
        lines.push(`> ${ai.explanation}`);
        if (ai.suggestedFix) {
          lines.push(`>`);
          lines.push(`> **Suggested fix:** ${ai.suggestedFix}`);
        }
        lines.push('');
      }

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

      lines.push('| Baseline | Current | Diff |');
      lines.push('|:---:|:---:|:---:|');
      lines.push(`| ![baseline](baseline) | ![current](current) | ![diff](diff) |`);
      lines.push('');

      if (diff.aiAnalysis) {
        lines.push(`> **AI:** ${diff.aiAnalysis.explanation}`);
        lines.push('');
      }

      lines.push('</details>');
      lines.push('');
    }

    return lines.join('\n');
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
          case 'pass': return '✅';
          case 'changed': return '⚠️';
          case 'regression': return '❌';
          case 'new': return '🆕';
          case 'error': return '💥';
          case 'flaky': return '🔄';
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
      `[View full report](${result.config.outputDir}/report.html)</sub>`;
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
