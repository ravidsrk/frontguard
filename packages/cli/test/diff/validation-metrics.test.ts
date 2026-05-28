import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  evaluateGate,
  formatMetricsMarkdown,
  DEFAULT_GATE,
  type Prediction,
} from '../../src/diff/validation-metrics.js';

function pred(predicted: string, actual: string, id = Math.random().toString()): Prediction {
  return { id, predicted: predicted as never, actual: actual as never };
}

describe('computeMetrics', () => {
  it('computes 100% accuracy for all-correct predictions', () => {
    const m = computeMetrics([
      pred('regression', 'regression'),
      pred('intentional', 'intentional'),
      pred('no_change', 'no_change'),
    ]);
    expect(m.accuracy).toBe(1);
    expect(m.correct).toBe(3);
    expect(m.falsePositiveRate).toBe(0);
  });

  it('computes accuracy for mixed predictions', () => {
    const m = computeMetrics([
      pred('regression', 'regression'),
      pred('regression', 'intentional'), // wrong + false positive
      pred('no_change', 'no_change'),
      pred('intentional', 'intentional'),
    ]);
    expect(m.total).toBe(4);
    expect(m.correct).toBe(3);
    expect(m.accuracy).toBe(0.75);
  });

  it('computes false-positive rate correctly', () => {
    // 3 non-regression samples, 1 falsely flagged as regression → FPR = 1/3
    const m = computeMetrics([
      pred('regression', 'intentional'),
      pred('intentional', 'intentional'),
      pred('no_change', 'no_change'),
      pred('regression', 'regression'), // a true regression, not counted in FPR denom
    ]);
    expect(m.falsePositiveRate).toBeCloseTo(1 / 3, 5);
  });

  it('builds a correct confusion matrix', () => {
    const m = computeMetrics([
      pred('regression', 'regression'),
      pred('intentional', 'regression'),
    ]);
    expect(m.confusionMatrix.regression.regression).toBe(1);
    expect(m.confusionMatrix.regression.intentional).toBe(1);
  });

  it('computes precision and recall per category', () => {
    const m = computeMetrics([
      pred('regression', 'regression'), // TP
      pred('regression', 'intentional'), // FP for regression
      pred('intentional', 'regression'), // FN for regression
    ]);
    const reg = m.perCategory.regression;
    expect(reg.truePositives).toBe(1);
    expect(reg.falsePositives).toBe(1);
    expect(reg.falseNegatives).toBe(1);
    expect(reg.precision).toBeCloseTo(0.5, 5);
    expect(reg.recall).toBeCloseTo(0.5, 5);
    expect(reg.f1).toBeCloseTo(0.5, 5);
  });

  it('handles empty predictions without dividing by zero', () => {
    const m = computeMetrics([]);
    expect(m.accuracy).toBe(0);
    expect(m.falsePositiveRate).toBe(0);
    expect(m.total).toBe(0);
  });
});

describe('evaluateGate', () => {
  it('passes when accuracy and FPR meet thresholds', () => {
    const preds: Prediction[] = [];
    for (let i = 0; i < 8; i++) preds.push(pred('intentional', 'intentional'));
    for (let i = 0; i < 2; i++) preds.push(pred('regression', 'regression'));
    const gate = evaluateGate(computeMetrics(preds));
    expect(gate.passed).toBe(true);
    expect(gate.reasons).toHaveLength(0);
  });

  it('fails when accuracy below threshold', () => {
    const preds: Prediction[] = [];
    for (let i = 0; i < 6; i++) preds.push(pred('intentional', 'regression'));
    for (let i = 0; i < 4; i++) preds.push(pred('regression', 'regression'));
    const gate = evaluateGate(computeMetrics(preds));
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Accuracy'))).toBe(true);
  });

  it('fails when false-positive rate too high', () => {
    // All non-regression samples flagged as regression → FPR = 100%
    const preds = [
      pred('regression', 'intentional'),
      pred('regression', 'content_update'),
      pred('regression', 'no_change'),
      pred('regression', 'regression'),
    ];
    const gate = evaluateGate(computeMetrics(preds));
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('False-positive'))).toBe(true);
  });

  it('respects custom thresholds', () => {
    const m = computeMetrics([pred('regression', 'regression'), pred('intentional', 'regression')]);
    expect(evaluateGate(m, { minAccuracy: 0.9, maxFalsePositiveRate: 0.15 }).passed).toBe(false);
    expect(evaluateGate(m, { minAccuracy: 0.4, maxFalsePositiveRate: 0.5 }).passed).toBe(true);
  });

  it('default gate thresholds are 70% / 15%', () => {
    expect(DEFAULT_GATE.minAccuracy).toBe(0.7);
    expect(DEFAULT_GATE.maxFalsePositiveRate).toBe(0.15);
  });
});

describe('formatMetricsMarkdown', () => {
  it('produces a markdown report with key sections', () => {
    const m = computeMetrics([pred('regression', 'regression'), pred('no_change', 'no_change')]);
    const md = formatMetricsMarkdown(m, evaluateGate(m));
    expect(md).toContain('# AI Classification Validation');
    expect(md).toContain('Accuracy');
    expect(md).toContain('Per-Category');
    expect(md).toContain('Confusion Matrix');
    expect(md).toContain('✅ PASS');
  });
});
