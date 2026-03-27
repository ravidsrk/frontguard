import type { Run, RunResult } from './types.js';
import { generateReportHtml } from './report-html.js';

/**
 * Process a visual regression run.
 *
 * In production this would queue work to a rendering service with real
 * browser instances (Playwright). For the MVP we generate placeholder
 * results so the full API flow can be exercised end-to-end.
 */
export async function processRun(run: Run): Promise<void> {
  run.status = 'running';

  const results: RunResult[] = [];

  for (const route of run.routes) {
    for (const viewport of run.viewports) {
      // In production: call Playwright rendering service
      // For MVP: store placeholder results
      results.push({
        route: route.path || (route as unknown as string),
        viewport,
        status: 'captured',
        diffPercentage: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }

  run.results = results;
  run.status = 'completed';
  run.completedAt = new Date().toISOString();

  // Generate report HTML
  run.reportHtml = generateReportHtml(run);
  run.reportUrl = `/v1/reports/${run.id}`;
}
