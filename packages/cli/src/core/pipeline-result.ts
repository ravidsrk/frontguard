/** Assembles a RunResult. Judge warnings do not become regressions. */

import type {
  FrontguardConfig,
  DiffResult,
  RunResult,
  RunTiming,
  JudgeResult,
} from './types.js';

/**
 * Builds a {@link RunResult} from judge verdicts.
 *
 * Model notes are advisory. A failing verdict increments `warnings` and leaves
 * `regressions` at 0, so {@link comparisonExitCode} does not turn it into exit 1.
 * A verdict that could not be produced increments `errors` and still exits 2.
 */
export function buildJudgeResult(
  judgements: JudgeResult[],
  timing: RunTiming,
  _totalStart: number,
  config: FrontguardConfig,
): RunResult {
  const errors = judgements.filter((j) => j.error).length;
  const failed = judgements.filter((j) => !j.pass && !j.error).length;
  const passed = judgements.filter((j) => j.pass).length;
  const warningPasses = judgements.filter(
    (j) => j.pass && j.issues.some((i) => i.severity === 'warning'),
  ).length;

  return {
    summary: {
      total: judgements.length,
      passed,
      regressions: 0,
      warnings: warningPasses + failed,
      newPages: 0,
      errors,
    },
    diffs: [],
    judgements,
    timing,
    config,
  };
}

export function buildResult(
  diffs: DiffResult[],
  timing: RunTiming,
  _totalStart: number,
  config: FrontguardConfig,
): RunResult {
  const summary = {
    total: diffs.length,
    passed: diffs.filter((d) => d.status === 'pass').length,
    regressions: diffs.filter((d) => d.status === 'regression').length,
    warnings: diffs.filter(
      (d) => d.status === 'changed' && d.diffPercentage > 0,
    ).length,
    newPages: diffs.filter((d) => d.status === 'new').length,
    errors: diffs.filter((d) => d.status === 'error').length,
  };

  return {
    summary,
    diffs,
    timing,
    config,
  };
}
