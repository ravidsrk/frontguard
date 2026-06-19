/**
 * Pre-deploy guard for wrangler binding placeholders (OPS-2).
 *
 * Tracked wrangler.toml files may document placeholder IDs for onboarding, but
 * `wrangler deploy` must not run until real IDs are supplied via env/secrets.
 *
 * @module ops/wrangler-guard
 */

/** Pattern matching documented placeholder binding ids in wrangler configs. */
export const WRANGLER_PLACEHOLDER_PATTERN = /REPLACE_WITH/i;

/**
 * Returns true when `content` still contains a placeholder binding id.
 */
export function hasWranglerPlaceholder(content: string): boolean {
  return WRANGLER_PLACEHOLDER_PATTERN.test(content);
}

/**
 * Scans wrangler config contents and returns paths that still contain placeholders.
 */
export function findWranglerPlaceholderOffenders(
  configs: ReadonlyArray<{ path: string; content: string }>,
): string[] {
  return configs.filter((c) => hasWranglerPlaceholder(c.content)).map((c) => c.path);
}

/**
 * Throws when any config still contains a placeholder binding id.
 */
export function assertNoWranglerPlaceholders(
  configs: ReadonlyArray<{ path: string; content: string }>,
): void {
  const offenders = findWranglerPlaceholderOffenders(configs);
  if (offenders.length > 0) {
    throw new Error(
      `Wrangler config(s) contain placeholder binding id(s) — replace before deploy: ${offenders.join(', ')}`,
    );
  }
}