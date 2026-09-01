import { describe, expect, it } from 'vitest';
import { compareDiffToThreshold } from '../../src/diff/threshold.js';

describe('compareDiffToThreshold', () => {
  it.each([
    [29, 0.29],
    [0.35000000000000003, 0.0035],
  ])('treats %s percentage points as equal to ratio %s', (diffPercentage, threshold) => {
    expect(compareDiffToThreshold(diffPercentage, threshold)).toBe(0);
  });

  it('preserves meaningful differences around the boundary', () => {
    expect(compareDiffToThreshold(2.99, 0.03)).toBe(-1);
    expect(compareDiffToThreshold(3.01, 0.03)).toBe(1);
  });

  it('fails closed for non-finite values', () => {
    expect(compareDiffToThreshold(Number.NaN, 0.03)).toBe(1);
    expect(compareDiffToThreshold(3, Number.POSITIVE_INFINITY)).toBe(1);
  });
});
