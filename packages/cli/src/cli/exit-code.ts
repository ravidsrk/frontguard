import type { FingerprintCheck, RunResult } from '../core/types.js';

export function comparisonExitCode(
  summary: RunResult['summary'],
  failureCount = summary.regressions,
): 0 | 1 | 2 {
  if (summary.total === 0 || summary.errors > 0) {
    return 2;
  }
  if (failureCount > 0 || summary.newPages > 0) {
    return 1;
  }
  return 0;
}

/**
 * Pixelmatch still chooses 0 or 1. A strict fingerprint mismatch is an
 * untrusted comparison and exits 2, even when pixels would have exited 1.
 * A missing fingerprint does not set `strictFailure`.
 */
export function runExitCode(
  summary: RunResult['summary'],
  fingerprintCheck?: Pick<FingerprintCheck, 'strictFailure'>,
  failureCount = summary.regressions,
): 0 | 1 | 2 {
  if (fingerprintCheck?.strictFailure) return 2;
  return comparisonExitCode(summary, failureCount);
}
