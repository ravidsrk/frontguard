/**
 * Per-run model-call accounting and the `ai.maxCalls` budget.
 *
 * The pipeline reserves a slot before each logical model call (analysis, fix,
 * judge). Past the cap, the call is skipped and counted; the pixel result is
 * never changed by a skip. Each completed call reports one record (all
 * attempts) through {@link AIUsageTracker.record}.
 *
 * @module core/ai-usage
 */

import type { AICallRecord } from '../diff/ai-provider.js';
import type { AIUsageSummary } from './types.js';

/** OTel attribute names for model-call spans (numbers only; no URLs or content). */
export const AI_SPAN_ATTRIBUTES = {
  calls: 'frontguard.ai.calls',
  errors: 'frontguard.ai.errors',
  inputTokens: 'frontguard.ai.input_tokens',
  outputTokens: 'frontguard.ai.output_tokens',
  skipped: 'frontguard.ai.skipped',
} as const;

export class AIUsageTracker {
  private readonly records: AICallRecord[] = [];
  private reserved = 0;
  private skippedBudget = 0;

  constructor(private readonly maxCalls?: number) {}

  /**
   * Reserves one model call. Returns false (and counts a skip) once the
   * configured `ai.maxCalls` has been used up.
   */
  tryReserve(): boolean {
    if (this.maxCalls !== undefined && this.reserved >= this.maxCalls) {
      this.skippedBudget += 1;
      return false;
    }
    this.reserved += 1;
    return true;
  }

  /** Records one finished call. Bound so it can be passed as `onCall`. */
  readonly record = (call: AICallRecord): void => {
    this.records.push(call);
  };

  /** Calls skipped because the budget ran out. */
  get skipped(): number {
    return this.skippedBudget;
  }

  /** Records added since `index` (for per-stage span attributes). */
  since(index: number): AICallRecord[] {
    return this.records.slice(index);
  }

  /** Number of records so far. */
  get count(): number {
    return this.records.length;
  }

  summary(): AIUsageSummary {
    const totals = {
      calls: this.records.length,
      ok: 0,
      errors: 0,
      attempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
    for (const r of this.records) {
      if (r.outcome === 'ok') totals.ok += 1;
      else totals.errors += 1;
      totals.attempts += r.attempts;
      totals.inputTokens += r.inputTokens ?? 0;
      totals.outputTokens += r.outputTokens ?? 0;
      totals.latencyMs += r.latencyMs;
    }
    return {
      calls: [...this.records],
      totals,
      skipped: { budget: this.skippedBudget },
      ...(this.maxCalls !== undefined ? { maxCalls: this.maxCalls } : {}),
    };
  }

  /** Numeric span attributes for the records since `index`, plus skips so far. */
  spanAttributes(index: number): Record<string, number> {
    const recent = this.since(index);
    return {
      [AI_SPAN_ATTRIBUTES.calls]: recent.length,
      [AI_SPAN_ATTRIBUTES.errors]: recent.filter((r) => r.outcome === 'error').length,
      [AI_SPAN_ATTRIBUTES.inputTokens]: recent.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
      [AI_SPAN_ATTRIBUTES.outputTokens]: recent.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
      [AI_SPAN_ATTRIBUTES.skipped]: this.skippedBudget,
    };
  }
}

/** One-line human summary, e.g. for the console report. */
export function formatAIUsage(summary: AIUsageSummary): string {
  const t = summary.totals;
  const parts = [
    `${t.calls} model call(s)`,
    `${t.inputTokens} input / ${t.outputTokens} output tokens`,
    `${t.latencyMs}ms`,
  ];
  if (t.errors > 0) parts.push(`${t.errors} failed`);
  if (summary.skipped.budget > 0) {
    parts.push(`${summary.skipped.budget} skipped (ai.maxCalls=${summary.maxCalls ?? '?'})`);
  }
  return parts.join(', ');
}
