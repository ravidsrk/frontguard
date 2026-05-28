/**
 * Classification accuracy metrics for AI validation.
 *
 * Given a set of predictions and ground-truth labels, computes a confusion
 * matrix and per-category precision/recall/F1, plus the headline metrics the
 * launch gate cares about: overall accuracy and false-positive rate.
 *
 * This module is pure (no I/O) so it can be unit tested and reused by the
 * validation scripts in `scripts/`.
 *
 * @module diff/validation-metrics
 */

import type { ChangeClassification } from '../core/types.js';

/** The four labels the classifier can emit (plus `no_change`). */
export type ValidationLabel = ChangeClassification | 'no_change';

/** All labels, in a stable order for matrix rows/columns. */
export const VALIDATION_LABELS: ValidationLabel[] = [
  'regression',
  'intentional',
  'content_update',
  'no_change',
];

/** A single prediction paired with its human-labeled ground truth. */
export interface Prediction {
  /** Identifier for the sample (e.g. `repo#pr/route`). */
  id: string;
  /** What the AI predicted. */
  predicted: ValidationLabel;
  /** The correct (human-assigned) label. */
  actual: ValidationLabel;
}

/** Precision / recall / F1 for a single category. */
export interface CategoryMetrics {
  label: ValidationLabel;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Number of ground-truth samples with this label (the support). */
  support: number;
}

/** Aggregate validation result. */
export interface ValidationMetrics {
  /** Total number of samples. */
  total: number;
  /** Number of correct predictions. */
  correct: number;
  /** Overall accuracy (correct / total), 0–1. */
  accuracy: number;
  /**
   * False-positive rate: of all samples that were NOT regressions, the
   * fraction the model incorrectly flagged as regressions. This is the #1
   * launch-gate metric (target < 0.15).
   */
  falsePositiveRate: number;
  /** Per-category precision/recall/F1. */
  perCategory: Record<ValidationLabel, CategoryMetrics>;
  /** Confusion matrix: `matrix[actual][predicted]` = count. */
  confusionMatrix: Record<ValidationLabel, Record<ValidationLabel, number>>;
}

/** Builds an empty label→count map. */
function emptyCounts(): Record<ValidationLabel, number> {
  return {
    regression: 0,
    intentional: 0,
    content_update: 0,
    no_change: 0,
  };
}

/**
 * Computes classification metrics from a list of predictions.
 *
 * @param predictions - Predicted vs actual labels for each sample.
 * @returns Aggregate accuracy, false-positive rate, and per-category metrics.
 */
export function computeMetrics(predictions: Prediction[]): ValidationMetrics {
  const total = predictions.length;

  // Build confusion matrix.
  const confusionMatrix: Record<ValidationLabel, Record<ValidationLabel, number>> = {
    regression: emptyCounts(),
    intentional: emptyCounts(),
    content_update: emptyCounts(),
    no_change: emptyCounts(),
  };

  let correct = 0;
  for (const p of predictions) {
    confusionMatrix[p.actual][p.predicted]++;
    if (p.predicted === p.actual) correct++;
  }

  // Per-category precision/recall/F1.
  const perCategory = {} as Record<ValidationLabel, CategoryMetrics>;
  for (const label of VALIDATION_LABELS) {
    const tp = confusionMatrix[label][label];
    // False positives: predicted=label but actual≠label.
    let fp = 0;
    for (const actual of VALIDATION_LABELS) {
      if (actual !== label) fp += confusionMatrix[actual][label];
    }
    // False negatives: actual=label but predicted≠label.
    let fn = 0;
    for (const predicted of VALIDATION_LABELS) {
      if (predicted !== label) fn += confusionMatrix[label][predicted];
    }
    const support = VALIDATION_LABELS.reduce(
      (sum, predicted) => sum + confusionMatrix[label][predicted],
      0,
    );
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    perCategory[label] = {
      label,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision,
      recall,
      f1,
      support,
    };
  }

  // False-positive rate: among NON-regression samples, fraction predicted as regression.
  let nonRegressionTotal = 0;
  let falselyFlagged = 0;
  for (const p of predictions) {
    if (p.actual !== 'regression') {
      nonRegressionTotal++;
      if (p.predicted === 'regression') falselyFlagged++;
    }
  }
  const falsePositiveRate =
    nonRegressionTotal === 0 ? 0 : falselyFlagged / nonRegressionTotal;

  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    falsePositiveRate,
    perCategory,
    confusionMatrix,
  };
}

/** Launch-gate thresholds (from IMPLEMENTATION_PLAN Task 1.4). */
export interface GateThresholds {
  /** Minimum overall accuracy (default 0.70). */
  minAccuracy: number;
  /** Maximum false-positive rate (default 0.15). */
  maxFalsePositiveRate: number;
}

/** Default launch-gate thresholds. */
export const DEFAULT_GATE: GateThresholds = {
  minAccuracy: 0.7,
  maxFalsePositiveRate: 0.15,
};

/** Result of evaluating metrics against the launch gate. */
export interface GateResult {
  passed: boolean;
  reasons: string[];
}

/**
 * Evaluates metrics against the launch gate. Returns `passed: false` with
 * human-readable reasons if any threshold is violated.
 */
export function evaluateGate(
  metrics: ValidationMetrics,
  thresholds: GateThresholds = DEFAULT_GATE,
): GateResult {
  const reasons: string[] = [];
  if (metrics.accuracy < thresholds.minAccuracy) {
    reasons.push(
      `Accuracy ${(metrics.accuracy * 100).toFixed(1)}% < required ${(
        thresholds.minAccuracy * 100
      ).toFixed(0)}%`,
    );
  }
  if (metrics.falsePositiveRate > thresholds.maxFalsePositiveRate) {
    reasons.push(
      `False-positive rate ${(metrics.falsePositiveRate * 100).toFixed(1)}% > max ${(
        thresholds.maxFalsePositiveRate * 100
      ).toFixed(0)}%`,
    );
  }
  return { passed: reasons.length === 0, reasons };
}

/**
 * Formats metrics + gate result into a markdown report suitable for
 * `validation/results-v0.2.md`.
 */
export function formatMetricsMarkdown(
  metrics: ValidationMetrics,
  gate: GateResult,
  title = 'AI Classification Validation',
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`, '');
  lines.push(`- **Samples:** ${metrics.total}`);
  lines.push(`- **Accuracy:** ${(metrics.accuracy * 100).toFixed(1)}%`);
  lines.push(`- **False-positive rate:** ${(metrics.falsePositiveRate * 100).toFixed(1)}%`);
  lines.push(`- **Launch gate:** ${gate.passed ? '✅ PASS' : '❌ FAIL'}`);
  if (!gate.passed) {
    for (const r of gate.reasons) lines.push(`  - ${r}`);
  }
  lines.push('', '## Per-Category', '');
  lines.push('| Category | Precision | Recall | F1 | Support |');
  lines.push('|----------|-----------|--------|----|---------|');
  for (const label of VALIDATION_LABELS) {
    const c = metrics.perCategory[label];
    lines.push(
      `| ${label} | ${(c.precision * 100).toFixed(0)}% | ${(c.recall * 100).toFixed(
        0,
      )}% | ${(c.f1 * 100).toFixed(0)}% | ${c.support} |`,
    );
  }
  lines.push('', '## Confusion Matrix', '');
  lines.push(`| actual ＼ predicted | ${VALIDATION_LABELS.join(' | ')} |`);
  lines.push(`|${'---|'.repeat(VALIDATION_LABELS.length + 1)}`);
  for (const actual of VALIDATION_LABELS) {
    const row = VALIDATION_LABELS.map((p) => metrics.confusionMatrix[actual][p]);
    lines.push(`| **${actual}** | ${row.join(' | ')} |`);
  }
  lines.push('');
  return lines.join('\n');
}
