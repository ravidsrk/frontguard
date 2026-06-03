/**
 * Console reporter for Frontguard.
 *
 * Renders real-time progress with spinners during the pipeline run,
 * then prints a rich summary table with route statuses, regressions,
 * warnings, and AI analysis.
 *
 * @module report/console
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { Reporter, PipelineStage, RunResult } from '../core/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<PipelineStage, string> = {
  init: '⚙  Loading config',
  discover: '🔍 Discovering routes',
  filter: '📊 Filtering',
  render: '🖥  Rendering',
  compare: '🔍 Comparing',
  analyze: '🤖 Analyzing',
  fix: '🔧 Generating fixes',
  report: '📄 Reporting',
};

const STATUS_ICONS: Record<string, string> = {
  pass: chalk.green('✓'),
  changed: chalk.yellow('⚠'),
  regression: chalk.red('✘'),
  new: chalk.blue('★'),
  error: chalk.red('✘'),
  flaky: chalk.yellow('~'),
};

// ---------------------------------------------------------------------------
// Progress Bar Helper
// ---------------------------------------------------------------------------

function progressBar(current: number, total: number, width = 20): string {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `[${chalk.green('█'.repeat(filled))}${chalk.gray('░'.repeat(empty))}] ${current}/${total}`;
}

// ---------------------------------------------------------------------------
// Console Reporter
// ---------------------------------------------------------------------------

export class ConsoleReporter implements Reporter {
  private spinner: Ora | null = null;
  private currentStage: PipelineStage | null = null;

  onStageStart(stage: PipelineStage, detail?: string): void {
    this.currentStage = stage;
    const label = STAGE_LABELS[stage] ?? stage;
    const text = detail ? `${label} ${chalk.dim(`— ${detail}`)}` : label;

    this.spinner = ora({
      text,
      color: 'cyan',
      spinner: 'dots',
    }).start();
  }

  onStageProgress(stage: PipelineStage, current: number, total: number, detail?: string): void {
    if (!this.spinner) return;

    const label = STAGE_LABELS[stage] ?? stage;
    const bar = progressBar(current, total);
    const detailSuffix = detail ? ` ${chalk.dim(detail)}` : '';
    this.spinner.text = `${label} ${bar}${detailSuffix}`;
  }

  onStageComplete(stage: PipelineStage, detail?: string): void {
    if (this.spinner) {
      const label = STAGE_LABELS[stage] ?? stage;
      const text = detail ? `${label} ${chalk.dim(`— ${detail}`)}` : label;
      this.spinner.succeed(text);
      this.spinner = null;
    }
    this.currentStage = null;
  }

  onError(error: Error): void {
    if (this.spinner) {
      this.spinner.fail(chalk.red(error.message));
      this.spinner = null;
    } else {
      console.error(chalk.red(`\n  ✘ ${error.message}`));
    }
  }

  onComplete(result: RunResult): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }

    console.log('');

    if (result.diffs.length === 0) {
      console.log(chalk.dim('  No routes were tested. Add routes to your config or use --url with --routes.'));
      console.log('');
      return;
    }

    this.printRouteTable(result);

    const hasRegressions = result.summary.regressions > 0;
    const hasWarnings = result.summary.warnings > 0;
    const hasErrors = result.summary.errors > 0;

    if (!hasRegressions && !hasWarnings && !hasErrors) {
      console.log(chalk.green.bold('  ✅ All pages match baselines'));
      console.log('');
    } else {
      this.printRegressions(result);
      this.printWarnings(result);
    }

    this.printAccessibility(result);
    this.printPerformance(result);
    this.printThirdPartyScripts(result);
    this.printSummary(result);
  }

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  private printAccessibility(result: RunResult): void {
    const a11y = result.accessibility;
    if (!a11y || a11y.length === 0) return;
    const withViolations = a11y.filter((r) => r.violations.length > 0);
    if (withViolations.length === 0) {
      console.log(chalk.green('  ♿ Accessibility: no violations'));
      console.log('');
      return;
    }
    const total = withViolations.reduce((n, r) => n + r.violations.length, 0);
    console.log(chalk.yellow.bold(`  ♿ ACCESSIBILITY (${total} violation${total !== 1 ? 's' : ''})`));
    console.log('');
    for (const r of withViolations) {
      console.log(chalk.yellow(`    ${r.route} @ ${r.viewport}px`));
      for (const v of r.violations) {
        const impactColor =
          v.impact === 'critical' ? chalk.red :
          v.impact === 'serious' ? chalk.redBright :
          v.impact === 'moderate' ? chalk.yellow : chalk.blue;
        const target = v.nodes[0]?.target?.join(', ') ?? '';
        console.log(
          `      ${impactColor(`[${v.impact}]`)} ${chalk.bold(v.id)}: ${v.help}` +
            (target ? chalk.dim(` (${target})`) : ''),
        );
      }
      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Performance budgets (correlated with visual diffs)
  // -------------------------------------------------------------------------

  private printPerformance(result: RunResult): void {
    const perf = (result.perf ?? []).filter((p) => p.violations.length > 0);
    if (perf.length === 0) return;
    const total = perf.reduce((n, p) => n + p.violations.length, 0);
    console.log(chalk.yellow.bold(`  ⚡ PERFORMANCE BUDGETS (${total} violation${total !== 1 ? 's' : ''})`));
    console.log('');
    for (const p of perf) {
      console.log(chalk.yellow(`    ${p.route} @ ${p.viewport}px`));
      for (const v of p.violations) {
        console.log(
          `      ${chalk.bold(v.metric)}: ${formatPerf(v.actual, v.unit)} ` +
            chalk.dim(`(budget ${formatPerf(v.budget, v.unit)})`),
        );
      }
      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Third-party scripts
  // -------------------------------------------------------------------------

  private printThirdPartyScripts(result: RunResult): void {
    const changed = (result.thirdPartyScripts ?? []).filter(
      (t) => t.added.length > 0 || t.removed.length > 0,
    );
    if (changed.length === 0) return;
    console.log(chalk.cyan.bold('  🧩 THIRD-PARTY SCRIPTS'));
    console.log('');
    for (const t of changed) {
      console.log(chalk.cyan(`    ${t.route} @ ${t.viewport}px`));
      for (const o of t.added) console.log(`      ${chalk.green('+')} ${o}`);
      for (const o of t.removed) console.log(`      ${chalk.red('-')} ${o}`);
      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Route Table
  // -------------------------------------------------------------------------

  private printRouteTable(result: RunResult): void {
    const viewports = [...new Set(result.diffs.map((d) => d.viewport))].sort((a, b) => a - b);
    const routes = [...new Set(result.diffs.map((d) => d.route.path))];

    if (routes.length === 0) {
      console.log(chalk.dim('  No routes tested.'));
      return;
    }

    // Header
    const vpHeaders = viewports.map((vp) => chalk.dim(padCenter(`${vp}px`, 8)));
    const routeColWidth = Math.max(30, ...routes.map((r) => r.length + 2));
    const header = `  ${chalk.bold(padRight('Route', routeColWidth))}${vpHeaders.join(' ')}`;
    console.log(header);
    console.log(chalk.dim(`  ${'─'.repeat(routeColWidth + viewports.length * 9)}`));

    // Rows
    for (const route of routes) {
      const cells = viewports.map((vp) => {
        const diff = result.diffs.find((d) => d.route.path === route && d.viewport === vp);
        if (!diff) return chalk.dim(padCenter('–', 8));
        const icon = STATUS_ICONS[diff.status] ?? chalk.dim('?');
        return padCenter(icon, 8);
      });

      const routeLabel = padRight(route, routeColWidth);
      console.log(`  ${routeLabel}${cells.join(' ')}`);
    }

    console.log('');
  }

  // -------------------------------------------------------------------------
  // Regressions Detail
  // -------------------------------------------------------------------------

  private printRegressions(result: RunResult): void {
    const regressions = result.diffs.filter((d) => d.status === 'regression');
    if (regressions.length === 0) return;

    console.log(chalk.red.bold(`  ✘ REGRESSIONS (${regressions.length})`));
    console.log('');

    for (const diff of regressions) {
      const label = `${diff.route.path} @ ${diff.viewport}px`;
      console.log(chalk.red(`    ${label}`));
      console.log(chalk.dim(`    Diff: ${diff.diffPercentage.toFixed(2)}% pixels changed`));

      if (diff.aiAnalysis) {
        const ai = diff.aiAnalysis;
        const severityColor =
          ai.severity === 'critical' ? chalk.red :
          ai.severity === 'warning' ? chalk.yellow :
          chalk.blue;

        console.log(chalk.dim(`    AI: `) + severityColor(`[${ai.severity}]`) + ` ${ai.explanation}`);
        if (ai.suggestedFix && !diff.suggestedFix) {
          console.log(chalk.dim(`    Fix: `) + ai.suggestedFix);
        }
        console.log(chalk.dim(`    Confidence: ${Math.round(ai.confidence * 100)}%`));
      }

      // Structured AI fix (Task 4.3)
      if (diff.suggestedFix) {
        const fix = diff.suggestedFix;
        const verified = diff.fixVerification?.verified;
        const badge =
          verified === true
            ? chalk.green('✓ verified')
            : verified === false
              ? chalk.yellow('⚠ unverified')
              : chalk.dim('suggested');
        console.log(
          chalk.cyan(`    🔧 Fix available `) +
            chalk.dim(`(${Math.round(fix.confidence * 100)}% confidence, ${fix.category}) `) +
            badge,
        );
        console.log(chalk.dim(`    ${fix.explanation}`));
        // Indent the patch.
        for (const line of fix.patch.split('\n')) {
          console.log(chalk.green(`      ${line}`));
        }
      }

      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Warnings Detail
  // -------------------------------------------------------------------------

  private printWarnings(result: RunResult): void {
    const warnings = result.diffs.filter((d) => d.status === 'changed');
    if (warnings.length === 0) return;

    console.log(chalk.yellow.bold(`  ⚠ WARNINGS (${warnings.length})`));
    console.log('');

    for (const diff of warnings) {
      const label = `${diff.route.path} @ ${diff.viewport}px`;
      console.log(chalk.yellow(`    ${label}`));
      console.log(chalk.dim(`    Diff: ${diff.diffPercentage.toFixed(2)}% pixels changed`));

      if (diff.aiAnalysis) {
        console.log(chalk.dim(`    AI: `) + diff.aiAnalysis.explanation);
      }

      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  private printSummary(result: RunResult): void {
    const { summary, timing, config } = result;

    const parts: string[] = [];

    if (summary.regressions > 0) {
      parts.push(chalk.red(`${summary.regressions} regression${summary.regressions !== 1 ? 's' : ''}`));
    }
    if (summary.warnings > 0) {
      parts.push(chalk.yellow(`${summary.warnings} warning${summary.warnings !== 1 ? 's' : ''}`));
    }
    if (summary.passed > 0) {
      parts.push(chalk.green(`${summary.passed} passed`));
    }
    if (summary.newPages > 0) {
      parts.push(chalk.blue(`${summary.newPages} new`));
    }
    if (summary.errors > 0) {
      parts.push(chalk.red(`${summary.errors} error${summary.errors !== 1 ? 's' : ''}`));
    }

    console.log(`  ${parts.join(chalk.dim(' · '))}`);

    // Report path
    const reportPath = `${config.outputDir}/report.html`;
    console.log(chalk.dim(`  Report: ${reportPath}`));

    // Timing
    const totalSec = (timing.total / 1000).toFixed(1);
    const breakdown = [
      timing.discovery > 0 ? `discover ${(timing.discovery / 1000).toFixed(1)}s` : null,
      timing.render > 0 ? `render ${(timing.render / 1000).toFixed(1)}s` : null,
      timing.compare > 0 ? `compare ${(timing.compare / 1000).toFixed(1)}s` : null,
      timing.ai > 0 ? `AI ${(timing.ai / 1000).toFixed(1)}s` : null,
    ].filter(Boolean).join(', ');

    console.log(chalk.dim(`  Done in ${totalSec}s${breakdown ? ` (${breakdown})` : ''}`));
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// String Helpers
// ---------------------------------------------------------------------------

function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function padCenter(str: string, width: number): string {
  // Strip ANSI for length calculation
  const stripped = str.replace(/\u001b\[[0-9;]*m/g, '');
  const remaining = width - stripped.length;
  if (remaining <= 0) return str;
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

/** Formats a perf metric value with its unit (ms → s, bytes already KB). */
function formatPerf(value: number, unit: string): string {
  if (unit === 'ms') return `${(value / 1000).toFixed(2)}s`;
  if (unit === 'KB') return `${value.toFixed(0)}KB`;
  if (unit === 'reqs') return `${Math.round(value)} reqs`;
  if (unit === '') return value.toFixed(3);
  return `${value}${unit}`;
}
