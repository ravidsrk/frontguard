/**
 * Request and fan-out caps for POST /v1/run (COST-1).
 *
 * @module limits
 */

/** Maximum routes per run submission. */
export const MAX_ROUTES = 50;

/** Maximum viewports per run submission. */
export const MAX_VIEWPORTS = 6;

/** Maximum browsers per run submission. */
export const MAX_BROWSERS = 3;

/** Maximum screenshots per run (routes × viewports × browsers). */
export const MAX_FAN_OUT = 100;

/** Planned screenshot count for a run config. */
export function plannedScreenshotCount(
  routes: unknown[],
  viewports: unknown[],
  browsers: unknown[],
): number {
  return routes.length * viewports.length * browsers.length;
}