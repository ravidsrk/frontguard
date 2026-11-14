/** Shared types for the AI eval harness (`npm run eval:ai`). */

import type { ModelClassificationLabel } from '../../src/diff/ai-provider.js';

export type EvalLabel = ModelClassificationLabel;

export interface EvalCase {
  id: string;
  set: 'synthetic' | 'ui';
  description: string;
  /** Acceptable answers. One entry unless `ambiguous`. `['pass']` for gated cases. */
  expected: Array<EvalLabel | 'pass'>;
  /** Genuinely ambiguous: reported separately, excluded from precision/recall. */
  ambiguous?: boolean;
  /** Pixel-identical: Frontguard never sends it to a model. Excluded from scoring. */
  gated?: boolean;
  viewport: number;
  before: Buffer;
  after: Buffer;
  /** HTML sources for rendered cases, used by the fix eval. */
  html?: { before: string; after: string };
}

export interface EvalCaseResult {
  id: string;
  set: EvalCase['set'];
  description: string;
  expected: EvalCase['expected'];
  ambiguous: boolean;
  gated: boolean;
  diffPercentage: number;
  got?: EvalLabel | 'pass';
  severity?: string;
  confidence?: number;
  explanation?: string;
  correct: boolean;
  error?: string;
}

export interface ClassMetrics {
  support: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface EvalMetrics {
  /** Clear, non-gated cases. */
  scored: number;
  correct: number;
  accuracy: number | null;
  errors: number;
  gated: number;
  perClass: Record<EvalLabel, ClassMetrics>;
  /** Rows: expected class. Columns: answer (or `error`). */
  confusion: Record<EvalLabel, Record<EvalLabel | 'error', number>>;
  ambiguous: { total: number; agreeing: number };
}

export interface FixEvalResult {
  id: string;
  generated: boolean;
  /** Changed-pixel ratio between the patched page and the baseline (0–1). */
  residualRatio?: number;
  restored: boolean;
  patch?: string;
  error?: string;
}
