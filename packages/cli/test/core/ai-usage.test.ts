import { describe, it, expect } from 'vitest';
import {
  AIUsageTracker,
  AI_SPAN_ATTRIBUTES,
  DEFAULT_AI_MAX_CALLS,
  formatAIUsage,
} from '../../src/core/ai-usage.js';
import type { AICallRecord } from '../../src/diff/ai-provider.js';

function call(overrides: Partial<AICallRecord> = {}): AICallRecord {
  return {
    label: 'analyze / @1440',
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    outcome: 'ok',
    attempts: 1,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 50,
    structured: true,
    ...overrides,
  };
}

describe('AIUsageTracker', () => {
  it('defaults to DEFAULT_AI_MAX_CALLS (50) when maxCalls is omitted', () => {
    expect(DEFAULT_AI_MAX_CALLS).toBe(50);
    const t = new AIUsageTracker();
    for (let i = 0; i < DEFAULT_AI_MAX_CALLS; i++) expect(t.tryReserve()).toBe(true);
    expect(t.tryReserve()).toBe(false);
    expect(t.skipped).toBe(1);
    expect(t.summary().maxCalls).toBe(DEFAULT_AI_MAX_CALLS);
  });

  it('allows zero calls when maxCalls is explicitly 0', () => {
    const t = new AIUsageTracker(0);
    expect(t.tryReserve()).toBe(false);
    expect(t.tryReserve()).toBe(false);
    expect(t.skipped).toBe(2);
    expect(t.summary()).toMatchObject({ skipped: { budget: 2 }, maxCalls: 0 });
  });

  it('treats Infinity as unlimited', () => {
    const t = new AIUsageTracker(Number.POSITIVE_INFINITY);
    for (let i = 0; i < 100; i++) expect(t.tryReserve()).toBe(true);
    expect(t.skipped).toBe(0);
    expect(t.summary().maxCalls).toBeUndefined();
  });

  it('enforces ai.maxCalls and counts skips', () => {
    const t = new AIUsageTracker(2);
    expect([t.tryReserve(), t.tryReserve(), t.tryReserve(), t.tryReserve()]).toEqual([true, true, false, false]);
    expect(t.skipped).toBe(2);
    expect(t.summary()).toMatchObject({ skipped: { budget: 2 }, maxCalls: 2 });
  });

  it('totals calls, attempts, tokens and latency', () => {
    const t = new AIUsageTracker();
    t.record(call());
    t.record(call({ outcome: 'error', attempts: 3, inputTokens: undefined, outputTokens: undefined, latencyMs: 400, errorKind: 'server' }));
    expect(t.summary().totals).toEqual({
      calls: 2,
      ok: 1,
      errors: 1,
      attempts: 4,
      inputTokens: 1000,
      outputTokens: 50,
      latencyMs: 500,
    });
    expect(t.count).toBe(2);
  });

  it('builds span attributes for records since an index', () => {
    const t = new AIUsageTracker(1);
    t.record(call());
    const start = t.count;
    t.record(call({ inputTokens: 10, outputTokens: 2 }));
    t.tryReserve();
    t.tryReserve();
    expect(t.spanAttributes(start)).toEqual({
      [AI_SPAN_ATTRIBUTES.calls]: 1,
      [AI_SPAN_ATTRIBUTES.errors]: 0,
      [AI_SPAN_ATTRIBUTES.inputTokens]: 10,
      [AI_SPAN_ATTRIBUTES.outputTokens]: 2,
      [AI_SPAN_ATTRIBUTES.skipped]: 1,
    });
  });

  it('formats a one-line summary', () => {
    const t = new AIUsageTracker(1);
    t.record(call());
    t.record(call({ outcome: 'error' }));
    t.tryReserve();
    t.tryReserve();
    expect(formatAIUsage(t.summary())).toBe(
      '2 model call(s), 2000 input / 100 output tokens, 200ms, 1 failed, 1 skipped (ai.maxCalls=1)',
    );
  });
});
