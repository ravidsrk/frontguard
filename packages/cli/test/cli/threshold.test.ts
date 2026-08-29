import { describe, expect, it } from 'vitest';
import { parseThresholdRatio } from '../../src/cli/threshold.js';

describe('parseThresholdRatio', () => {
  it.each([
    ['0', 0, false],
    ['0.001', 0.001, false],
    ['0.01', 0.01, false],
    ['0.1', 0.1, false],
    ['1', 1, false],
    ['1.01', 0.0101, true],
    ['5', 0.05, true],
    ['100', 1, true],
  ])('normalizes %s to a ratio', (raw, ratio, legacyPercentage) => {
    expect(parseThresholdRatio(raw)).toEqual({ ratio, legacyPercentage });
  });

  it.each(['', '-0.01', '101', '1foo', 'NaN', 'Infinity'])('rejects invalid input %j', (raw) => {
    expect(() => parseThresholdRatio(raw)).toThrow(/threshold/i);
  });
});
