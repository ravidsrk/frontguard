/** Scoring for the AI eval harness: accuracy, per-class precision/recall, confusion. */

import { CLASSIFICATIONS } from '../../src/diff/ai-provider.js';
import type { ClassMetrics, EvalCaseResult, EvalLabel, EvalMetrics } from './types.js';

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/** Scores case results. Gated and ambiguous cases are excluded from accuracy and per-class metrics. */
export function score(results: EvalCaseResult[]): EvalMetrics {
  const scoredCases = results.filter((r) => !r.gated && !r.ambiguous);
  const labels = [...CLASSIFICATIONS] as EvalLabel[];
  const confusion = Object.fromEntries(
    labels.map((expected) => [expected, Object.fromEntries([...labels, 'error'].map((l) => [l, 0]))]),
  ) as EvalMetrics['confusion'];

  for (const r of scoredCases) {
    const expected = r.expected[0] as EvalLabel;
    const column = r.error || !r.got || r.got === 'pass' ? 'error' : r.got;
    confusion[expected][column] += 1;
  }

  const perClass = Object.fromEntries(
    labels.map((label) => {
      const tp = confusion[label][label];
      const support = Object.values(confusion[label]).reduce((a, b) => a + b, 0);
      const fp = labels.filter((other) => other !== label).reduce((n, other) => n + confusion[other][label], 0);
      const fn = support - tp;
      const precision = ratio(tp, tp + fp);
      const recall = ratio(tp, support);
      const f1 =
        precision === null || recall === null || precision + recall === 0
          ? null
          : (2 * precision * recall) / (precision + recall);
      const m: ClassMetrics = { support, tp, fp, fn, precision, recall, f1 };
      return [label, m];
    }),
  ) as Record<EvalLabel, ClassMetrics>;

  const correct = scoredCases.filter((r) => r.correct).length;
  const ambiguous = results.filter((r) => r.ambiguous && !r.gated);
  return {
    scored: scoredCases.length,
    correct,
    accuracy: ratio(correct, scoredCases.length),
    errors: results.filter((r) => r.error).length,
    gated: results.filter((r) => r.gated).length,
    perClass,
    confusion,
    ambiguous: { total: ambiguous.length, agreeing: ambiguous.filter((r) => r.correct).length },
  };
}

/** Renders metrics as a short plain-text table. */
export function formatMetrics(m: EvalMetrics): string {
  const pct = (v: number | null) => (v === null ? '  n/a' : `${(v * 100).toFixed(0).padStart(4)}%`);
  const lines = [
    `Accuracy (clear cases): ${pct(m.accuracy)}  (${m.correct}/${m.scored}; ${m.errors} errors, ${m.gated} gated)`,
    `Ambiguous cases agreeing with an accepted label: ${m.ambiguous.agreeing}/${m.ambiguous.total}`,
    '',
    'class            support  precision  recall    f1',
  ];
  for (const [label, c] of Object.entries(m.perClass)) {
    lines.push(`${label.padEnd(16)} ${String(c.support).padStart(7)}  ${pct(c.precision).padStart(9)}  ${pct(c.recall).padStart(6)} ${pct(c.f1)}`);
  }
  return lines.join('\n');
}
