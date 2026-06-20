import { describe, expect, it } from 'vitest';

import { REGRESSION_STATUSES, isRegressionResult } from '../src/tools/_regression.js';

describe('regression status helper (mcp-8)', () => {
  it('does not treat first-time baseline status=new as a regression', () => {
    expect(REGRESSION_STATUSES.has('new')).toBe(false);
    expect(isRegressionResult({ status: 'new', classification: undefined })).toBe(false);
  });

  it('still counts regression, changed, and error statuses', () => {
    expect(isRegressionResult({ status: 'regression' })).toBe(true);
    expect(isRegressionResult({ status: 'changed' })).toBe(true);
    expect(isRegressionResult({ status: 'error' })).toBe(true);
    expect(isRegressionResult({ status: 'pass', classification: 'regression' })).toBe(true);
  });
});