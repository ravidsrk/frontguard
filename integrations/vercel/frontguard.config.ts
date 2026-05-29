/**
 * Frontguard config for the Vercel integration.
 *
 * Projects using the Frontguard-for-Vercel integration can drop this file in
 * their repo root to control which routes/viewports are tested on every preview
 * deployment. The integration reads the route list from the `FRONTGUARD_ROUTES`
 * project env var (comma-separated) at runtime; this file documents the shape
 * and serves as the source of truth you can sync into that env var.
 *
 * Required project env vars (set in Vercel → Project → Settings → Environment):
 * - `FRONTGUARD_API_URL`  — Frontguard Cloud API base URL.
 * - `FRONTGUARD_API_KEY`  — Frontguard API key used to submit runs.
 * - `FRONTGUARD_ROUTES`   — comma-separated routes, e.g. "/,/about,/pricing".
 */
export interface FrontguardVercelConfig {
  /** Routes to test on each preview deployment. */
  routes: string[];
  /** Viewport widths (px) to capture. */
  viewports?: number[];
  /** Browsers to render with. */
  browsers?: Array<'chromium' | 'firefox' | 'webkit'>;
  /** Per-pixel diff threshold (0–1). */
  threshold?: number;
}

export default {
  routes: ['/', '/about', '/pricing'],
  viewports: [375, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
} satisfies FrontguardVercelConfig;
