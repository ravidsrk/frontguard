/**
 * Optional pin for smartFilter's git diff.
 *
 * `FRONTGUARD_DIFF_BASE` replaces `origin/main` when it is set. A value that
 * starts with `-` or contains whitespace is ignored so it cannot become a
 * git flag. Unset keeps the existing origin/main...HEAD fallback.
 */
export function pinnedDiffBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.FRONTGUARD_DIFF_BASE;
  if (typeof raw !== 'string') return null;
  const base = raw.trim();
  if (base.length === 0 || base.startsWith('-') || /\s/.test(base)) return null;
  return base;
}
