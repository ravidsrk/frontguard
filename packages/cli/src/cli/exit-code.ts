import type { RunResult } from '../core/types.js';

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
