/**
 * Optional runner config, the baseline-runner warning, and the shared
 * pixelmatch gate. Ladle and Histoire routes are the same Route type
 * Storybook discovery returns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema } from '../../src/core/config.js';
import { compareScreenshot } from '../../src/diff/pixel.js';
import {
  notedCaptureRunners,
  selectedCaptureRunner,
  warnIfCaptureRunnerChanged,
} from '../../src/discovery/capture-runner.js';
import type { Route, ScreenshotResult } from '../../src/core/types.js';
import { logger } from '../../src/utils/logger.js';
import { createTestPng } from '../fixtures/helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function minimalConfig(overrides: Record<string, unknown> = {}) {
  return { baseUrl: 'http://localhost:3000', ...overrides };
}

describe('ladle and histoire config stay off by default', () => {
  it('accepts a config with neither runner', () => {
    const parsed = configSchema.parse(minimalConfig());
    expect(parsed.ladle).toBeUndefined();
    expect(parsed.histoire).toBeUndefined();
    expect(parsed.captureRunner).toBeUndefined();
    expect(selectedCaptureRunner(parsed)).toBeNull();
  });

  it('treats an empty ladle or histoire block as off', () => {
    const parsed = configSchema.parse(minimalConfig({ ladle: {}, histoire: {} }));
    expect(selectedCaptureRunner(parsed)).toBeNull();
  });

  it('requires url or dir when filters are set', () => {
    const ladle = configSchema.safeParse(minimalConfig({ ladle: { stories: ['Control/*'] } }));
    expect(ladle.success).toBe(false);
    if (!ladle.success) {
      expect(ladle.error.issues.map((issue) => issue.message).join(' ')).toMatch(/ladle/);
    }
    const histoire = configSchema.safeParse(
      minimalConfig({ histoire: { fetchTimeoutMs: 1000 } }),
    );
    expect(histoire.success).toBe(false);
  });

  it('rejects an invalid runner URL and an unknown captureRunner', () => {
    const badUrl = configSchema.safeParse(minimalConfig({ ladle: { url: 'not-a-url' } }));
    expect(badUrl.success).toBe(false);
    const badRunner = configSchema.safeParse(minimalConfig({ captureRunner: 'playwright' }));
    expect(badRunner.success).toBe(false);
  });

  it('selects one runner, with Storybook ahead of Ladle and Histoire', () => {
    const storybook = configSchema.parse(
      minimalConfig({
        storybook: { url: 'http://localhost:6006' },
        ladle: { dir: 'build' },
        histoire: { dir: '.histoire/dist' },
      }),
    );
    expect(selectedCaptureRunner(storybook)).toBe('storybook');

    const ladle = configSchema.parse(
      minimalConfig({
        ladle: { dir: 'build' },
        histoire: { url: 'http://127.0.0.1:4173' },
      }),
    );
    expect(selectedCaptureRunner(ladle)).toBe('ladle');

    const histoire = configSchema.parse(minimalConfig({ histoire: { dir: '.histoire/dist' } }));
    expect(selectedCaptureRunner(histoire)).toBe('histoire');
  });
});

describe('warnIfCaptureRunnerChanged', () => {
  it('warns when the env or config note names a different runner', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    warnIfCaptureRunnerChanged('ladle', { captureRunner: 'storybook' }, {});
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('Baselines from the previous runner are not comparable');
    expect(message).toContain('16 of 22 shots 1px wider or taller');
    expect(message).toContain('https://x.com/gregberge_/status/2110303101538451874');
    expect(message).toContain('vendor measurement, not a Frontguard statistic');
    expect(message).toContain('pixelmatch stays the only pass/fail gate');
    expect(message).toContain('storybook → ladle');

    warn.mockClear();
    warnIfCaptureRunnerChanged('histoire', {}, { FRONTGUARD_CAPTURE_RUNNER: 'ladle' });
    expect(String(warn.mock.calls[0]?.[0])).toContain('ladle → histoire');
  });

  it('stays quiet when the note matches, and when no note is set', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    warnIfCaptureRunnerChanged(
      'ladle',
      { captureRunner: 'ladle' },
      { FRONTGUARD_CAPTURE_RUNNER: 'ladle' },
    );
    warnIfCaptureRunnerChanged('storybook', {}, {});
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports an unknown note without throwing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(notedCaptureRunners({}, { FRONTGUARD_CAPTURE_RUNNER: 'not-a-runner' })).toEqual([
      'not-a-runner',
    ]);
    expect(() =>
      warnIfCaptureRunnerChanged('ladle', {}, { FRONTGUARD_CAPTURE_RUNNER: 'not-a-runner' }),
    ).not.toThrow();
    expect(String(warn.mock.calls[0]?.[0])).toContain('not-a-runner → ladle');
  });
});

describe('story routes share the pixelmatch gate', () => {
  it('does not branch comparison on discoveredVia', () => {
    const source = readFileSync(join(__dirname, '../../src/diff/pixel.ts'), 'utf8');
    expect(source).not.toContain('discoveredVia');
    expect(source).toContain('pixelmatch');
  });

  it('does not pass a shot that is 1px wider, for every story runner', () => {
    const baseline = createTestPng(10, 10);
    const wider = createTestPng(11, 10);
    const routes: Route[] = [
      { path: '/iframe.html?id=button--primary&viewMode=story', discoveredVia: 'storybook' },
      {
        path: '/?story=control--first&mode=preview',
        discoveredVia: 'ladle',
        waitForSelector: '[data-storyloaded]',
      },
      {
        path: '/__sandbox.html?storyId=button&variantId=primary',
        discoveredVia: 'histoire',
      },
    ];
    for (const route of routes) {
      const current: ScreenshotResult = {
        route,
        viewport: 1440,
        browser: 'chromium',
        buffer: wider,
        domSnapshot: '<html></html>',
        consoleErrors: [],
        timestamp: 0,
        duration: 1,
      };
      const result = compareScreenshot(current, baseline, 0);
      expect(result.status).not.toBe('pass');
      expect(result.comparisonMethod).toBe('pixelmatch');
      expect(result.route).toBe(route);
    }
  });
});
