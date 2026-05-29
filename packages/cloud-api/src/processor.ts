import type { Run, RunResult } from './types.js';
import { generateReportHtml } from './report-html.js';
import type { PendingScreenshot } from './storage/persist-screenshots.js';

/**
 * Optional hook invoked with the screenshots a run produced, so the caller can
 * persist them (R2 + metadata). Kept as a callback to keep `processRun`
 * decoupled from storage bindings and easy to test.
 */
export type ScreenshotSink = (screenshots: PendingScreenshot[]) => Promise<void>;

/**
 * Process a visual regression run.
 *
 * When DAYTONA_API_KEY is set, spins up an ephemeral Daytona sandbox
 * with Playwright and runs real screenshots. Otherwise, falls back to
 * simulated results (for dev/testing).
 *
 * If `onScreenshots` is supplied, any screenshots downloaded from the sandbox
 * are handed to it for persistence before the function resolves.
 */
export async function processRun(run: Run, onScreenshots?: ScreenshotSink): Promise<void> {
  run.status = 'running';

  try {
    const hasDaytona = !!(process.env.DAYTONA_API_KEY);

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
      });

      run.results = sandboxResult.results.map((r) => ({
        route: r.route,
        viewport: r.viewport,
        status: r.status,
        diffPercentage: r.diffPercentage,
        classification: r.classification,
        timestamp: r.timestamp || new Date().toISOString(),
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
      // Simulated results for dev/testing (no Daytona)
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
