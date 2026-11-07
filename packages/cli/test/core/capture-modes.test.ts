import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  duplicateBaselineKeyMessage,
  configSchema,
  projectedCaptureCount,
  resolveRouteModes,
} from '../../src/core/config.js';
import {
  baselineSnapshotKey,
  currentFingerprint,
  emptyBaselineManifest,
  fingerprintDiffs,
  noteComparedFingerprint,
  createFingerprintAccum,
  finishFingerprintCheck,
  stampBaselineManifest,
} from '../../src/core/fingerprint.js';
import { baselineStoragePath } from '../../src/storage/git-orphan.js';
import {
  CaptureEnvironmentMismatchError,
  probeCaptureEnvironment,
  projectCaptureTasks,
  projectedCaptureCount as playwrightProjectedCaptureCount,
} from '../../src/render/playwright.js';
import { toRouteObjects } from '../../src/core/pipeline-discover.js';
import type { FrontguardConfig, ScreenshotResult } from '../../src/core/types.js';

function makeBaseConfig(overrides: Partial<FrontguardConfig> = {}): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.01,
    ignore: [],
    smartRender: false,
    workers: 2,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: './frontguard-report',
    ...overrides,
  };
}

describe('Named capture modes (#309)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('criterion 1: one route with light and dark modes writes two mode-keyed baseline paths while keeping default baselines unmoved', () => {
    // Existing single-mode / default mode stays on baselines/<route>/<viewport>/<browser>.png
    expect(baselineStoragePath('/', 1440, 'chromium')).toBe('baselines/_root/1440/chromium.png');
    expect(baselineStoragePath('/', 1440, 'chromium', 'default')).toBe(
      'baselines/_root/1440/chromium.png',
    );
    expect(baselineSnapshotKey(1440, 'chromium')).toBe('1440/chromium');
    expect(baselineSnapshotKey(1440, 'chromium', 'default')).toBe('1440/chromium');

    // Named modes get baselines/<route>/<viewport>/<mode>/<browser>.png
    expect(baselineStoragePath('/', 1440, 'chromium', 'light')).toBe(
      'baselines/_root/1440/light/chromium.png',
    );
    expect(baselineStoragePath('/', 1440, 'chromium', 'dark')).toBe(
      'baselines/_root/1440/dark/chromium.png',
    );
    expect(baselineSnapshotKey(1440, 'chromium', 'light')).toBe('1440/light/chromium');
    expect(baselineSnapshotKey(1440, 'chromium', 'dark')).toBe('1440/dark/chromium');

    const config = makeBaseConfig({
      modes: {
        light: { colorScheme: 'light' },
        dark: { colorScheme: 'dark' },
      },
      routes: ['/'],
    });
    const routes = toRouteObjects(config.routes!);
    const tasks = projectCaptureTasks(routes, config);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => baselineStoragePath(t.route.path, t.viewport, t.browser, t.mode))).toEqual([
      'baselines/_root/1440/light/chromium.png',
      'baselines/_root/1440/dark/chromium.png',
    ]);
  });

  it('criterion 2: two routes entries for the same path and viewport with different modes are accepted and write distinct files', () => {
    const parsed = configSchema.safeParse({
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      modes: {
        light: { colorScheme: 'light', locale: 'en-US' },
        dark: { colorScheme: 'dark', locale: 'en-US', contrast: 'more' },
      },
      routes: [
        { path: '/pricing', modes: ['light'] },
        { path: '/pricing', modes: ['dark'] },
      ],
    });
    expect(parsed.success).toBe(true);

    const collision = duplicateBaselineKeyMessage({
      viewports: [1440],
      browsers: ['chromium'],
      modes: {
        light: { colorScheme: 'light' },
        dark: { colorScheme: 'dark' },
      },
      routes: [
        { path: '/pricing', modes: ['light'] },
        { path: '/pricing', modes: ['dark'] },
      ],
    });
    expect(collision).toBeNull();

    // Still rejects when two entries resolve to the SAME mode on the same path and viewport
    const duplicateModeCollision = duplicateBaselineKeyMessage({
      viewports: [1440],
      browsers: ['chromium'],
      modes: {
        dark: { colorScheme: 'dark' },
      },
      routes: [
        { path: '/pricing', modes: ['dark'] },
        { path: '/pricing', modes: ['dark'] },
      ],
    });
    expect(duplicateModeCollision).toContain('baselines/pricing/1440/dark/chromium.png');

    // Supports per-route opt-out via modes: false
    const optOutModes = resolveRouteModes(
      { path: '/health', modes: false },
      { light: { colorScheme: 'light' }, dark: { colorScheme: 'dark' } },
    );
    expect(optOutModes).toEqual([{ name: undefined, settings: undefined }]);
  });

  it('criterion 3: changing a mode settings bundle under the same mode name emits a fingerprint warning on the next run', () => {
    const initialShot: ScreenshotResult = {
      route: {
        path: '/checkout',
        discoveredVia: 'config',
        mode: 'a11y-dark',
        modeConfig: {
          colorScheme: 'dark',
          reducedMotion: 'reduce',
          forcedColors: 'none',
          contrast: 'more',
          locale: 'en-US',
          timezoneId: 'UTC',
        },
      },
      viewport: 1440,
      browser: 'chromium',
      mode: 'a11y-dark',
      modeConfig: {
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        forcedColors: 'none',
        contrast: 'more',
        locale: 'en-US',
        timezoneId: 'UTC',
      },
      buffer: Buffer.from('png-bytes'),
      domSnapshot: '<html></html>',
      consoleErrors: [],
      timestamp: Date.now(),
      duration: 25,
    };

    const manifest = stampBaselineManifest(emptyBaselineManifest(), [initialShot]);
    expect(manifest.routes['/checkout']?.snapshots?.['1440/a11y-dark/chromium']?.fingerprint?.mode).toEqual({
      name: 'a11y-dark',
      settings: {
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        forcedColors: 'none',
        contrast: 'more',
        locale: 'en-US',
        timezoneId: 'UTC',
      },
    });

    // Next run changes contrast and locale under the same mode name 'a11y-dark'
    const updatedShot: ScreenshotResult = {
      ...initialShot,
      route: {
        ...initialShot.route,
        modeConfig: {
          colorScheme: 'dark',
          reducedMotion: 'reduce',
          forcedColors: 'active',
          contrast: 'more',
          locale: 'fr-FR',
          timezoneId: 'Europe/Paris',
        },
      },
      modeConfig: {
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        forcedColors: 'active',
        contrast: 'more',
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
      },
    };

    const accum = createFingerprintAccum();
    noteComparedFingerprint(accum, manifest, true, updatedShot);
    const check = finishFingerprintCheck(accum, 'warn');

    expect(check.fields).toContain('mode.settings.forcedColors');
    expect(check.fields).toContain('mode.settings.locale');
    expect(check.fields).toContain('mode.settings.timezoneId');
    expect(check.lines.join('\n')).toContain('mode.settings.locale (/checkout @ 1440px [chromium] (a11y-dark))');

    // Direct fingerprintDiffs check
    const fp1 = currentFingerprint('chromium', 'routes', {
      name: 'dark',
      settings: { colorScheme: 'dark', reducedMotion: 'no-preference' },
    });
    const fp2 = currentFingerprint('chromium', 'routes', {
      name: 'dark',
      settings: { colorScheme: 'dark', reducedMotion: 'reduce' },
    });
    expect(fingerprintDiffs(fp1, fp2)).toEqual([
      {
        field: 'mode.settings.reducedMotion',
        baseline: 'no-preference',
        current: 'reduce',
      },
    ]);
  });

  it('criterion 4: a forced-colors or locale probe mismatch throws CaptureEnvironmentMismatchError to exit 2 before comparison', async () => {
    const fakePageMatching = {
      evaluate: vi.fn().mockResolvedValue({
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        forcedColors: 'active',
        contrast: 'more',
        devicePixelRatio: 1,
        language: 'de-DE',
        timeZone: 'Europe/Berlin',
      }),
    };

    await expect(
      probeCaptureEnvironment(
        fakePageMatching,
        {
          colorScheme: 'dark',
          reducedMotion: 'reduce',
          forcedColors: 'active',
          contrast: 'more',
          locale: 'de-DE',
          timezoneId: 'Europe/Berlin',
          devicePixelRatio: 1,
        },
        '/account',
        'de-high-contrast',
      ),
    ).resolves.toMatchObject({
      forcedColors: 'active',
      language: 'de-DE',
    });

    const fakePageMismatch = {
      evaluate: vi.fn().mockResolvedValue({
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        forcedColors: 'none',
        contrast: 'no-preference',
        devicePixelRatio: 1,
        language: 'en-US',
        timeZone: 'UTC',
      }),
    };

    await expect(
      probeCaptureEnvironment(
        fakePageMismatch,
        {
          forcedColors: 'active',
          locale: 'de-DE',
          devicePixelRatio: 1,
        },
        '/account',
        'de-high-contrast',
      ),
    ).rejects.toThrow(CaptureEnvironmentMismatchError);

    await expect(
      probeCaptureEnvironment(
        fakePageMismatch,
        {
          colorScheme: 'light',
          reducedMotion: 'no-preference',
          forcedColors: 'active',
          contrast: 'more',
          locale: 'de-DE',
          timezoneId: 'Europe/Berlin',
          devicePixelRatio: 2,
        },
        '/account',
        'de-high-contrast',
      ),
    ).rejects.toThrow(/forcedColors expected active, got none; contrast expected more, got no-preference; devicePixelRatio expected 2, got 1; locale expected de-DE, got en-US; timezoneId expected Europe\/Berlin, got UTC/);
  });

  it('criterion 5: projected capture count equals actual capture task count across global modes, per-route modes, and opt-outs', () => {
    const config = makeBaseConfig({
      viewports: [375, 1440],
      browsers: ['chromium', 'firefox'],
      modes: {
        light: { colorScheme: 'light' },
        dark: { colorScheme: 'dark' },
        hc: { forcedColors: 'active', contrast: 'more' },
      },
      routes: [
        '/', // 2 viewports × 3 global modes × 2 browsers = 12
        { path: '/login', viewport: [375], modes: ['light', 'dark'] }, // 1 viewport × 2 modes × 2 browsers = 4
        { path: '/status', modes: false }, // 2 viewports × 1 default mode × 2 browsers = 4
      ],
    });

    const routes = toRouteObjects(config.routes!);
    const projected = projectedCaptureCount(routes, config);
    const playwrightProjected = playwrightProjectedCaptureCount(routes, config);
    const tasks = projectCaptureTasks(routes, config);

    expect(projected).toBe(20);
    expect(playwrightProjected).toBe(20);
    expect(tasks.length).toBe(projected);
  });
});
