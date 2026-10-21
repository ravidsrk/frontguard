/**
 * Gate for `update-baselines` and `run --update-baselines`.
 *
 * `--confirm-baselines` is the human opt-in. Judge mode cannot supply it, and
 * an advisory caption cannot set it. An agent setting `confirm_reviewed: true`
 * on itself is not a human review.
 */

export interface BaselineWriteIntent {
  writing: boolean;
  confirmBaselines: boolean;
  judgeMode: boolean;
}

export function baselineWriteBlockReason(intent: BaselineWriteIntent): string | null {
  if (!intent.writing) return null;
  if (intent.judgeMode) {
    return (
      'Refusing to write baselines: --mode judge cannot confirm a baseline write, ' +
      'even when --confirm-baselines is present. An advisory caption cannot set the flag. ' +
      'An agent setting confirm_reviewed: true on itself is not a human review.'
    );
  }
  if (!intent.confirmBaselines) {
    return (
      'Refusing to write baselines without --confirm-baselines. ' +
      'An advisory caption cannot set the flag. ' +
      'An agent setting confirm_reviewed: true on itself is not a human review.'
    );
  }
  return null;
}
