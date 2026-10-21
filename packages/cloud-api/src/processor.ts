import type { Run, RunResult } from './types.js';
import { generateReportHtml } from './report-html.js';
import type { PendingScreenshot } from './storage/persist-screenshots.js';
import type { BaselineRestore } from './daytona-runner.js';

/**
 * Optional hook invoked with the screenshots a run produced, so the caller can
 * persist them (R2 + metadata). Kept as a callback to keep `processRun`
 * decoupled from storage bindings and easy to test.
 */
export type ScreenshotSink = (screenshots: PendingScreenshot[]) => Promise<void>;

/** Statuses that mean a route was diffed against a baseline. `new` / `new_baseline` are not comparisons. */
const COMPARISON_STATUSES = new Set(['pass', 'changed', 'regression', 'unchanged', 'warning', 'flaky']);

/** Error recorded when a run ends without a baseline comparison. Such a run is never `completed`. */
export const NO_COMPARISON_ERROR = 'Run finished without a baseline comparison';

/** True when one sandbox result is a baseline diff, not a first capture or an error. */
export function isBaselineComparison(result: { status?: string; comparisonMethod?: string }): boolean {
  if (result.comparisonMethod === 'pixelmatch' || result.comparisonMethod === 'byte-identical') return true;
  return result.status != null && COMPARISON_STATUSES.has(result.status);
}

/** Subset of the Worker env that `processRun` reads. */
export interface ProcessorEnv {
  DAYTONA_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  FRONTGUARD_OPENAI_KEY?: string;
  FRONTGUARD_ANTHROPIC_KEY?: string;
}

/**
 * Process a visual regression run.
 *
 * When `env.DAYTONA_API_KEY` is set, spins up an ephemeral Daytona sandbox
 * with Playwright and runs real screenshots. The run is `completed` only when
 * at least one result is a baseline comparison. Otherwise it is `failed`.
 * With no Daytona key there is nothing to compare, so the run is `failed`
 * rather than reported `completed`.
 *
 * Workers do not expose Node's env globals, so the secret is read from the
 * Worker binding the caller passes in.
 *
 * If `onScreenshots` is supplied, any screenshots downloaded from the sandbox
 * are handed to it for persistence before the function resolves.
 *
 * `baselineRestore`, when supplied, carries the project's prior baselines so the
 * sandbox can compare against them instead of treating every screenshot as a
 * new baseline (cloud-1).
 */
export async function processRun(
  run: Run,
  env: ProcessorEnv,
  onScreenshots?: ScreenshotSink,
  baselineRestore?: BaselineRestore,
): Promise<void> {
  run.status = 'running';

  try {
    const hasDaytona = !!env.DAYTONA_API_KEY;

    if (hasDaytona) {
      // Lazy-import to avoid loading @daytona/sdk when not needed
      const { executeInSandbox } = await import('./daytona-runner.js');
      const openaiKey = env.OPENAI_API_KEY ?? env.FRONTGUARD_OPENAI_KEY;
      const anthropicKey = env.ANTHROPIC_API_KEY ?? env.FRONTGUARD_ANTHROPIC_KEY;
      const sandboxResult = await executeInSandbox({
        url: run.url,
        routes: run.routes,
        viewports: run.viewports,
        browsers: run.browsers,
        threshold: run.threshold,
        ai: run.ai ?? undefined,
        ...(openaiKey ? { openaiKey } : {}),
        ...(anthropicKey ? { anthropicKey } : {}),
        daytonaApiKey: env.DAYTONA_API_KEY,
        baselineRestore,
      });

      run.results = sandboxResult.results.map((r) => ({
        route: r.route,
        viewport: r.viewport,
        // Preserve the browser dimension — the sandbox emits one result per
        // browser×viewport×route, and the MCP diffId encodes browser so
        // multi-browser runs don't collapse to one diff (mcp-9).
        browser: r.browser,
        status: r.status,
        diffPercentage: r.diffPercentage,
        classification: r.classification,
        timestamp: r.timestamp || new Date().toISOString(),
        // Carry the AI-generated fix through to D1 (results is a JSON blob) so
        // the MCP `get_suggested_fix` tool can return it instead of a canned
        // null (mcp-2).
        ...(r.suggestedFix ? { suggestedFix: r.suggestedFix } : {}),
      }));

      // Empty output and first-capture markers are not comparisons. The old
      // path still set `completed` after a CLI invocation that never diffed.
      if (!sandboxResult.results.some((r) => isBaselineComparison(r))) {
        run.status = 'failed';
        run.error = NO_COMPARISON_ERROR;
        return;
      }

      run.completedAt = new Date().toISOString();

      if (onScreenshots && sandboxResult.screenshots?.length) {
        try {
          await onScreenshots(sandboxResult.screenshots);
        } catch {
          // Persistence is best-effort and must not fail the run.
        }
      }

      if (sandboxResult.reportHtml && sandboxResult.reportHtml !== '<p>No report generated</p>') {
        run.reportHtml = sandboxResult.reportHtml;
      } else {
        run.reportHtml = generateReportHtml(run);
      }
    } else {
      // No sandbox, so nothing was diffed against a baseline. Record the
      // marker the caller would have seen, but do not report the run completed.
      const results: RunResult[] = [];
      for (const route of run.routes) {
        for (const viewport of run.viewports) {
          results.push({
            route: typeof route === 'string' ? route : route.path,
            viewport,
            status: 'new_baseline',
            diffPercentage: 0,
            timestamp: new Date().toISOString(),
          });
        }
      }
      run.results = results;
      run.status = 'failed';
      run.error = NO_COMPARISON_ERROR;
      return;
    }

    run.status = 'completed';
    run.reportUrl = `/v1/reports/${run.id}`;
  } catch (err) {
    run.status = 'failed';
    run.error = err instanceof Error ? err.message : String(err);
  }
}
