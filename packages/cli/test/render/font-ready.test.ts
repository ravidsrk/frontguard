import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FrontguardConfig } from '../../src/core/types.js';
import { comparisonExitCode } from '../../src/cli/exit-code.js';

const harness = vi.hoisted(() => {
  const screenshot = vi.fn();
  const evaluate = vi.fn(async (fn: unknown) => {
    const source = typeof fn === 'function' ? Function.prototype.toString.call(fn) : String(fn);
    if (source.includes('document.fonts.ready')) return new Promise(() => {});
    return undefined;
  });
  const page = {
    on: vi.fn(),
    goto: vi.fn(async () => ({ status: () => 200 })),
    addStyleTag: vi.fn(async () => undefined),
    evaluate,
    screenshot,
    content: vi.fn(async () => '<html></html>'),
    close: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
    })),
    close: vi.fn(async () => undefined),
  };
  return { screenshot, browser };
});

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn(async () => harness.browser) },
  firefox: { launch: vi.fn() },
  webkit: { launch: vi.fn() },
}));

import { FONT_READY_TIMEOUT_MS, renderPages } from '../../src/render/playwright.js';

const config: FrontguardConfig = {
  version: 1,
  baseUrl: 'http://localhost:3000',
  viewports: [1280],
  browsers: ['chromium'],
  threshold: 0.1,
  ignore: [],
  smartRender: true,
  workers: 1,
  pageTimeout: 5_000,
  maxHeight: 0,
  outputDir: '/tmp/frontguard-font-ready',
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('document.fonts.ready timeout', () => {
  it('fails the named route with exit 2 when fonts never become ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    const pending = renderPages([{ path: '/checkout', label: 'Checkout' }], config);
    await vi.advanceTimersByTimeAsync(FONT_READY_TIMEOUT_MS);
    const results = await pending;

    expect(results).toHaveLength(1);
    expect(results[0]?.buffer).toHaveLength(0);
    expect(results[0]?.consoleErrors[0]).toContain('Render error:');
    expect(results[0]?.consoleErrors[0]).toContain('/checkout');
    expect(results[0]?.consoleErrors[0]).toContain('document.fonts.ready');
    expect(harness.screenshot).not.toHaveBeenCalled();
    expect(
      comparisonExitCode({
        total: 1,
        passed: 0,
        regressions: 0,
        warnings: 0,
        newPages: 0,
        errors: 1,
      }),
    ).toBe(2);
  });
});

describe('capture screenshot options', () => {
  it('passes the previous full-page PNG options explicitly', () => {
    const source = readFileSync(new URL('../../src/render/playwright.ts', import.meta.url), 'utf8');
    expect(source.match(/screenshot\(CAPTURE_SCREENSHOT_OPTIONS\)/g)).toHaveLength(3);
    expect(source).not.toMatch(/screenshot\(\{\s*fullPage:/);
  });
});
