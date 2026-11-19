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

/** Maximum email recipients configured per monitor (prevents Resend relay abuse). */
export const MAX_ALERT_EMAILS = 10;

/** Maximum size in bytes of a single dashboard run attachment (10 MB). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Maximum attachments stored on a single run. */
export const MAX_ATTACHMENTS_PER_RUN = 50;

/** Default and maximum page size for list endpoints. */
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

/** Clamps a user-supplied `limit` query parameter to `[1, max]`. */
export function clampLimit(
  raw: string | number | undefined | null,
  defaultLimit = DEFAULT_LIST_LIMIT,
  max = MAX_LIST_LIMIT,
): number {
  if (raw === undefined || raw === null || raw === '') return defaultLimit;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return defaultLimit;
  if (n < 1) return 1;
  return Math.min(Math.floor(n), max);
}

/** Planned screenshot count for a run config. */
export function plannedScreenshotCount(
  routes: unknown[],
  viewports: unknown[],
  browsers: unknown[],
): number {
  return routes.length * viewports.length * browsers.length;
}