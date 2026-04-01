/**
 * Preview URL auto-detection for CI/CD environments.
 *
 * Detects deployment preview URLs from popular hosting platforms
 * (Vercel, Netlify, Cloudflare Pages, Railway, Render, AWS Amplify, Surge)
 * via their well-known environment variables.
 *
 * Also provides a polling utility to wait for a deployment to become ready
 * before starting the visual regression run.
 *
 * @module utils/preview-url
 */

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformDetection {
  /** Platform name for logging. */
  name: string;
  /** Environment variable(s) to check, in priority order. */
  envVars: string[];
  /** Whether the env var value needs an https:// prefix. */
  needsHttps: boolean;
}

interface WaitForUrlOptions {
  /** Maximum number of polling attempts (default: 10). */
  maxAttempts?: number;
  /** Interval between attempts in milliseconds (default: 15000). */
  intervalMs?: number;
}

// ---------------------------------------------------------------------------
// Platform registry
// ---------------------------------------------------------------------------

const PLATFORMS: PlatformDetection[] = [
  {
    name: 'Frontguard (explicit)',
    envVars: ['FRONTGUARD_URL'],
    needsHttps: false,
  },
  {
    name: 'Vercel',
    envVars: ['VERCEL_URL', 'VERCEL_PREVIEW_URL'],
    needsHttps: true,
  },
  {
    name: 'Netlify',
    envVars: ['DEPLOY_PRIME_URL', 'DEPLOY_URL'],
    needsHttps: false,
  },
  {
    name: 'Cloudflare Pages',
    envVars: ['CF_PAGES_URL'],
    needsHttps: false,
  },
  {
    name: 'Railway',
    envVars: ['RAILWAY_STATIC_URL'],
    needsHttps: true,
  },
  {
    name: 'Render',
    envVars: ['RENDER_EXTERNAL_URL'],
    needsHttps: false,
  },
  {
    name: 'AWS Amplify',
    envVars: ['AMPLIFY_URL'],
    needsHttps: false,
  },
  {
    name: 'Surge',
    envVars: ['SURGE_URL'],
    needsHttps: false,
  },
];

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

/**
 * Ensures a URL has an https:// prefix and no trailing slash.
 */
function normalizeUrl(raw: string, needsHttps: boolean): string {
  let url = raw.trim();

  // Add https:// if needed and not already present
  if (needsHttps && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // Strip trailing slash
  url = url.replace(/\/+$/, '');

  return url;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Auto-detects a deployment preview URL from CI environment variables.
 *
 * Checks platforms in priority order:
 *   1. FRONTGUARD_URL (explicit override)
 *   2. VERCEL_URL / VERCEL_PREVIEW_URL (Vercel)
 *   3. DEPLOY_PRIME_URL / DEPLOY_URL (Netlify)
 *   4. CF_PAGES_URL (Cloudflare Pages)
 *   5. RAILWAY_STATIC_URL (Railway)
 *   6. RENDER_EXTERNAL_URL (Render)
 *   7. AMPLIFY_URL (AWS Amplify)
 *   8. SURGE_URL (Surge)
 *
 * @returns Normalized URL string or null if no platform detected.
 */
export function detectPreviewUrl(): string | null {
  for (const platform of PLATFORMS) {
    for (const envVar of platform.envVars) {
      const value = process.env[envVar];
      if (value && value.trim().length > 0) {
        const url = normalizeUrl(value, platform.needsHttps);
        logger.info(`Detected preview URL: ${url} (${platform.name} via $${envVar})`);
        return url;
      }
    }
  }

  logger.debug('No preview URL detected from environment variables');
  return null;
}

// ---------------------------------------------------------------------------
// Wait for URL readiness
// ---------------------------------------------------------------------------

/**
 * Polls a URL until it returns a successful response (HTTP 200–399).
 *
 * Useful for waiting on preview deployments that take time to become ready
 * after the CI trigger.
 *
 * @param url     - The URL to poll.
 * @param options - Polling configuration.
 * @returns `true` if the URL responded successfully, `false` if all attempts failed.
 */
export async function waitForUrl(
  url: string,
  options: WaitForUrlOptions = {},
): Promise<boolean> {
  const maxAttempts = options.maxAttempts ?? 10;
  const intervalMs = options.intervalMs ?? 15_000;

  logger.info(`Waiting for ${url} to be ready (max ${maxAttempts} attempts, ${intervalMs / 1000}s interval)…`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status >= 200 && response.status < 400) {
        logger.info(`✓ URL is ready (HTTP ${response.status}) after attempt ${attempt}/${maxAttempts}`);
        return true;
      }

      logger.debug(`Attempt ${attempt}/${maxAttempts}: HTTP ${response.status} — not ready yet`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`Attempt ${attempt}/${maxAttempts}: ${msg}`);
    }

    if (attempt < maxAttempts) {
      logger.info(`Waiting for deployment… attempt ${attempt}/${maxAttempts}`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  logger.warn(`URL ${url} did not respond after ${maxAttempts} attempts`);
  return false;
}
