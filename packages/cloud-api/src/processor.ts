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

/** Subset of the Worker env that `processRun` reads. */
export interface ProcessorEnv {
  DAYTONA_API_KEY?: string;
}

/**
 * Process a visual regression run.
 *
 * When `env.DAYTONA_API_KEY` is set, spins up an ephemeral Daytona sandbox
 * with Playwright and runs real screenshots. Otherwise, falls back to
 * baseline-marker results (for dev/testing).
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
      // Lazy-import to avoid loading @daytonaio/sdk when not needed
      const { executeInSandbox } = await import('./daytona-runner.js');
      const sandboxResult = await executeInSandbox({
        url: run.url,
        routes: run.routes,
        viewports: run.viewports,
        browsers: run.browsers,
        threshold: run.threshold,
        ai: run.ai ?? undefined,
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
      // No Daytona configured — emit a baseline-marker result per
      // route×viewport so the CLI/dashboard can show the run completed.
      // The actual diff comes from the sandbox path above; we never fake a
      // diff percentage here.
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
      run.completedAt = new Date().toISOString();
      run.reportHtml = generateReportHtml(run);
    }

    run.status = 'completed';
    run.reportUrl = `/v1/reports/${run.id}`;
  } catch (err) {
    run.status = 'failed';
    run.error = err instanceof Error ? err.message : String(err);
  }
}
