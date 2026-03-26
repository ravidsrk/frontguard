import { describe, it, expect } from 'vitest';
import { compareScreenshot, createNewPageResult } from '../../src/diff/pixel.js';
import { createTestPng } from '../fixtures/helpers.js';
import type { ScreenshotResult } from '../../src/core/types.js';

/** Helper to build a minimal ScreenshotResult */
function makeScreenshot(buffer: Buffer, overrides?: Partial<ScreenshotResult>): ScreenshotResult {
  return {
    route: { path: '/test', label: 'Test' },
    viewport: 1440,
    browser: 'chromium',
    buffer,
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 100,
    ...overrides,
  };
}

describe('compareScreenshot', () => {
  it('returns pass with 0% diff for identical images', () => {
    const png = createTestPng(100, 100, 255, 0, 0);
    const current = makeScreenshot(png);
    const result = compareScreenshot(current, Buffer.from(png), 0.1);

    expect(result.status).toBe('pass');
    expect(result.diffPercentage).toBe(0);
    expect(result.route.path).toBe('/test');
    expect(result.viewport).toBe(1440);
    expect(result.browser).toBe('chromium');
  });

  it('detects changes between red and blue images', () => {
    const red = createTestPng(50, 50, 255, 0, 0);
    const blue = createTestPng(50, 50, 0, 0, 255);
    const current = makeScreenshot(red);
    const result = compareScreenshot(current, blue, 0.1);

    expect(result.status).not.toBe('pass');
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffImage).toBeDefined();
    expect(result.diffImage).toBeInstanceOf(Buffer);
  });

  it('handles dimension mismatches without throwing', () => {
    const small = createTestPng(50, 50, 255, 0, 0);
    const large = createTestPng(100, 100, 255, 0, 0);
    const current = makeScreenshot(small);
    const result = compareScreenshot(current, large, 0.1);

    // Should not throw, should produce a result
    expect(result.status).toBeDefined();
    expect(result.error).toContain('Dimension mismatch');
    expect(result.status).toBe('changed');
  });

  it('returns error status for zero-byte current buffer', () => {
    const baseline = createTestPng(10, 10);
    const current = makeScreenshot(Buffer.alloc(0));
    const result = compareScreenshot(current, baseline, 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('empty');
  });

  it('returns error status for zero-byte baseline buffer', () => {
    const png = createTestPng(10, 10);
    const current = makeScreenshot(png);
    const result = compareScreenshot(current, Buffer.alloc(0), 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toContain('empty');
  });

  it('returns error for corrupt PNG data', () => {
    const goodPng = createTestPng(10, 10);
    const corruptBuffer = Buffer.from('not a png at all');
    const current = makeScreenshot(corruptBuffer);
    const result = compareScreenshot(current, goodPng, 0.1);

    expect(result.status).toBe('error');
    expect(result.error).toContain('Failed to decode');
  });

  it('returns regression status when diff exceeds threshold', () => {
    const red = createTestPng(50, 50, 255, 0, 0);
    const blue = createTestPng(50, 50, 0, 0, 255);
    const current = makeScreenshot(red);

    // Very low threshold — any difference is a regression
    const result = compareScreenshot(current, blue, 0.001);

    expect(result.status).toBe('regression');
    expect(result.diffPercentage).toBeGreaterThan(0);
  });

  it('preserves route and viewport metadata in result', () => {
    const png = createTestPng(20, 20, 128, 128, 128);
    const current = makeScreenshot(png, {
      route: { path: '/checkout', label: 'Checkout' },
      viewport: 375,
      browser: 'firefox',
    });
    const result = compareScreenshot(current, Buffer.from(png), 0.1);

    expect(result.route.path).toBe('/checkout');
    expect(result.viewport).toBe(375);
    expect(result.browser).toBe('firefox');
  });
});

describe('createNewPageResult', () => {
  it('returns status new with 0% diff', () => {
    const png = createTestPng(100, 100);
    const current = makeScreenshot(png);
    const result = createNewPageResult(current);

    expect(result.status).toBe('new');
    expect(result.diffPercentage).toBe(0);
    expect(result.diffImage).toBeUndefined();
    expect(result.baselineImage).toBeUndefined();
    expect(result.currentImage).toBe(png);
    expect(result.route.path).toBe('/test');
  });
});
