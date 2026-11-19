/**
 * Shared Chromium launch arguments and pure deterministic render helpers
 * (zero Playwright runtime import so plugins/tests stay decoupled).
 *
 * By default, Chromium's OS sandbox stays enabled. Containerized environments
 * that lack unprivileged user namespaces can opt in explicitly via
 * `FRONTGUARD_CHROMIUM_NO_SANDBOX=1` (set inside our own Dockerfiles).
 *
 * @module render/chromium-args
 */

export function chromiumLaunchArgs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.FRONTGUARD_CHROMIUM_NO_SANDBOX === '1') {
    return ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'];
  }
  return ['--disable-gpu'];
}

/**
 * Resolve `freezeTime` config (`true`, epoch ms number, or ISO 8601 string)
 * to a numeric epoch millisecond timestamp, or `null` when disabled.
 */
export function resolveFreezeTimestamp(
  freezeTime: boolean | number | string | undefined,
): number | null {
  if (freezeTime === undefined || freezeTime === false) return null;
  if (freezeTime === true) return 1704067200000; // 2024-01-01T00:00:00.000Z
  if (typeof freezeTime === 'number') return freezeTime;
  if (typeof freezeTime === 'string') {
    const parsed = Date.parse(freezeTime);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Check whether a request URL matches any configured `blockUrls` pattern.
 * Supports `*` wildcards as well as case-insensitive substring matching
 * in guaranteed linear time (no regex backtracking / ReDoS).
 */
export function matchesBlockedUrl(url: string, patterns: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim().toLowerCase();
    if (!pattern) continue;
    if (!pattern.includes('*')) {
      if (lowerUrl.includes(pattern)) return true;
      continue;
    }
    const parts = pattern.split('*').filter(Boolean);
    if (parts.length === 0) return true;
    let pos = 0;
    let matched = true;
    for (const part of parts) {
      const idx = lowerUrl.indexOf(part, pos);
      if (idx === -1) {
        matched = false;
        break;
      }
      pos = idx + part.length;
    }
    if (matched) return true;
  }
  return false;
}
