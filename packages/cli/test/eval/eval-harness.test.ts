/**
 * Runs the AI eval in mock mode: canned answers through the real request
 * building, structured outputs, parsing, validation and scoring. No network.
 */

import { describe, it, expect } from 'vitest';
import { runEval } from '../../scripts/eval/runner.js';
import { score } from '../../scripts/eval/metrics.js';
import { syntheticCases } from '../../scripts/eval/synthetic.js';
import { createMockTransport } from '../../scripts/eval/mock.js';
import type { EvalCaseResult } from '../../scripts/eval/types.js';

describe('AI eval harness (mock mode)', () => {
  const allSyntheticCases = syntheticCases();

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'scores every synthetic case for %s',
    async (provider) => {
      const report = await runEval({ provider, mock: true, cases: allSyntheticCases });

      expect(report.mock).toBe(true);
      expect(report.metrics.errors).toBe(0);
      expect(report.metrics.accuracy).toBe(1);
      expect(report.metrics.gated).toBe(1);
      expect(report.metrics.ambiguous.total).toBe(3);
      for (const c of Object.values(report.metrics.perClass)) {
        expect(c.recall === null || c.recall === 1).toBe(true);
      }
      const modelCases = report.cases.filter((c) => !c.gated).length;
      expect(report.usage.totals.calls).toBe(modelCases);
      expect(report.usage.calls.every((c) => c.structured)).toBe(true);
    },
    60_000,
  );

  it('sends each provider its structured-output schema', async () => {
    const cases = allSyntheticCases.filter((c) => c.id === 'syn-dark-theme');
    for (const provider of ['openai', 'anthropic', 'gemini'] as const) {
      const transport = createMockTransport(cases);
      await runEval({ provider, mock: true, cases, fetchImpl: transport.fetchImpl });
      const body = transport.requests[0].body as Record<string, any>;
      if (provider === 'openai') expect(body.response_format.json_schema.strict).toBe(true);
      if (provider === 'anthropic') expect(body.output_config.format.type).toBe('json_schema');
      if (provider === 'gemini') expect(body.generationConfig.responseJsonSchema).toBeDefined();
    }
  });

  it('keeps synthetic expectations strict: one label unless marked ambiguous', () => {
    for (const c of allSyntheticCases) {
      if (c.ambiguous) expect(c.expected.length).toBeGreaterThan(1);
      else expect(c.expected).toHaveLength(1);
    }
  });
});

describe('score', () => {
  const row = (id: string, expected: string, got: string | undefined, extra: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
    id,
    set: 'synthetic',
    description: id,
    expected: [expected as 'regression'],
    ambiguous: false,
    gated: false,
    diffPercentage: 1,
    got: got as 'regression' | undefined,
    correct: expected === got,
    ...extra,
  });

  it('computes per-class precision and recall and keeps errors in the denominator', () => {
    const m = score([
      row('a', 'regression', 'regression'),
      row('b', 'regression', 'intentional'),
      row('c', 'intentional', 'intentional'),
      row('d', 'content_update', undefined, { error: 'timeout' }),
      row('e', 'intentional', 'intentional', { ambiguous: true, expected: ['intentional', 'regression'] }),
      row('f', 'pass', 'pass', { gated: true, expected: ['pass'] }),
    ]);
    expect(m.scored).toBe(4);
    expect(m.correct).toBe(2);
    expect(m.accuracy).toBe(0.5);
    expect(m.errors).toBe(1);
    expect(m.perClass.regression).toMatchObject({ support: 2, tp: 1, fn: 1, precision: 1, recall: 0.5 });
    expect(m.perClass.intentional).toMatchObject({ support: 1, tp: 1, fp: 1, precision: 0.5, recall: 1 });
    expect(m.perClass.content_update).toMatchObject({ support: 1, tp: 0, recall: 0, precision: null });
    expect(m.confusion.content_update.error).toBe(1);
    expect(m.ambiguous).toEqual({ total: 1, agreeing: 1 });
  });
});
