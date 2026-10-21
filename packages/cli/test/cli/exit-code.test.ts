import { describe, expect, it } from 'vitest';
import type { RunResult } from '../../src/core/types.js';
import { comparisonExitCode, runExitCode } from '../../src/cli/exit-code.js';

function summary(overrides: Partial<RunResult['summary']> = {}): RunResult['summary'] {
  return {
    total: 1,
    passed: 1,
    regressions: 0,
    warnings: 0,
    newPages: 0,
    errors: 0,
    ...overrides,
  };
}

describe('comparisonExitCode', () => {
  it('fails comparisons with unaccepted new pages', () => {
    expect(comparisonExitCode(summary({ passed: 0, newPages: 1 }))).toBe(1);
  });

  it('returns a tool error when no screenshots were compared', () => {
    expect(comparisonExitCode(summary({ total: 0, passed: 0 }))).toBe(2);
  });

  it('preserves regression, tool-error, and success exit codes', () => {
    expect(comparisonExitCode(summary({ passed: 0, regressions: 1 }))).toBe(1);
    expect(comparisonExitCode(summary({ passed: 0, errors: 1 }))).toBe(2);
    expect(comparisonExitCode(summary({ passed: 0, regressions: 1, errors: 1 }))).toBe(2);
    expect(comparisonExitCode(summary({ warnings: 1 }))).toBe(0);
  });

  it('lets mode-specific failures override regressions without losing shared precedence', () => {
    expect(comparisonExitCode(summary({ passed: 0, regressions: 1 }), 0)).toBe(0);
    expect(comparisonExitCode(summary(), 1)).toBe(1);
    expect(comparisonExitCode(summary({ total: 0, passed: 0 }), 0)).toBe(2);
    expect(comparisonExitCode(summary({ passed: 0, errors: 1 }), 1)).toBe(2);
    expect(comparisonExitCode(summary({ passed: 0, newPages: 1 }), 0)).toBe(1);
  });
});

describe('runExitCode', () => {
  it('exits 2 for a strict fingerprint mismatch and leaves pixel failures at 1', () => {
    const pixels = summary({ passed: 0, regressions: 1 });
    expect(comparisonExitCode(pixels)).toBe(1);
    expect(runExitCode(pixels, { strictFailure: true })).toBe(2);
    expect(runExitCode(pixels, { strictFailure: false })).toBe(1);
    expect(runExitCode(summary(), { strictFailure: false })).toBe(0);
  });
});
