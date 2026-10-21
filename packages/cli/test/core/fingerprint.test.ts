import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BaselineManifest,
  FrontguardConfig,
  RendererFingerprint,
  Reporter,
  Route,
  ScreenshotResult,
} from '../../src/core/types.js';
import { CLI_VERSION } from '../../src/version.js';
import { comparisonExitCode, runExitCode } from '../../src/cli/exit-code.js';
import {
  CAPTURE_SCREENSHOT_OPTIONS,
  PIXELMATCH_OPTIONS,
  currentFingerprint,
  fingerprintDiffs,
  formatFingerprintWarning,
  missingFingerprintWarning,
  parseBaselineManifest,
  rendererBypassReason,
  stampBaselineManifest,
} from '../../src/core/fingerprint.js';

const require = createRequire(import.meta.url);

const graph = vi.hoisted(() => ({
  getChangedFiles: vi.fn(() => ['src/pages/about.tsx']),
  getChangedPaths: vi.fn(() => ({ present: ['src/pages/about.tsx'], removed: [] as string[] })),
  incompleteAnalysisReason: vi.fn(() => null),
  mapRoutesToFiles: vi.fn((routes: { path: string }[]) => {
    const mapped = new Map<string, string[]>();
    for (const route of routes) {
      mapped.set(route.path, [route.path === '/' ? 'src/pages/index.tsx' : `src/pages${route.path}.tsx`]);
    }
    return mapped;
  }),
  filterAffectedRoutes: vi.fn((routes: { path: string }[]) =>
    routes.filter((route) => route.path === '/about'),
  ),
  buildDependencyGraph: vi.fn(() => new Map<string, Set<string>>()),
}));

const pipelineMocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  init: vi.fn(),
  readManifest: vi.fn(),
  readBaseline: vi.fn(),
}));

vi.mock('../../src/graph/resolver.js', () => ({
  getChangedFiles: graph.getChangedFiles,
  getChangedPaths: graph.getChangedPaths,
  incompleteAnalysisReason: graph.incompleteAnalysisReason,
  mapRoutesToFiles: graph.mapRoutesToFiles,
  filterAffectedRoutes: graph.filterAffectedRoutes,
}));

vi.mock('../../src/graph/parser.js', () => ({
  buildDependencyGraph: graph.buildDependencyGraph,
}));

vi.mock('../../src/render/playwright.js', () => ({
  renderPages: pipelineMocks.renderPages,
}));

vi.mock('../../src/diff/pixel.js', () => ({
  compareScreenshot: pipelineMocks.compareScreenshot,
  createNewPageResult: (shot: ScreenshotResult) => ({
    route: shot.route,
    viewport: shot.viewport,
    browser: shot.browser,
    status: 'new' as const,
    diffPercentage: 100,
  }),
}));

vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    init = pipelineMocks.init;
    readManifest = pipelineMocks.readManifest;
    readBaseline = pipelineMocks.readBaseline;
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runPipeline } from '../../src/core/pipeline.js';
import { logger } from '../../src/utils/logger.js';

function installedPin(name: string): { browserVersion?: string; title?: string } | undefined {
  const playwrightPkg = require.resolve('playwright/package.json');
  const fromPlaywright = createRequire(playwrightPkg);
  const pkgPath = fromPlaywright.resolve('playwright-core/package.json');
  const json = JSON.parse(readFileSync(join(dirname(pkgPath), 'browsers.json'), 'utf8')) as {
    browsers?: { name?: string; browserVersion?: string; title?: string }[];
  };
  return json.browsers?.find((pin) => pin.name === name);
}

function shot(path = '/'): ScreenshotResult {
  return {
    route: { path, discoveredVia: 'config' },
    viewport: 1440,
    browser: 'chromium',
    buffer: Buffer.from(`png-${path}`),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: 1,
    duration: 1,
  };
}

function makeConfig(overrides: Partial<FrontguardConfig> = {}): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    routes: ['/', '/about'],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    ignore: [],
    smartRender: true,
    outputDir: '/tmp/frontguard-fingerprint-test',
    ...overrides,
  };
}

function reporter(): Reporter {
  return {
    onStageStart: vi.fn(),
    onStageProgress: vi.fn(),
    onStageComplete: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}

function warnText(): string[] {
  return vi.mocked(logger.warn).mock.calls.map((call) => String(call[0]));
}

function manifestFor(fingerprint: RendererFingerprint | undefined, routes = ['/', '/about']): BaselineManifest {
  const routeEntries: BaselineManifest['routes'] = {};
  for (const path of routes) {
    routeEntries[path] = {
      viewports: [1440],
      browsers: ['chromium'],
      lastUpdated: '2026-01-01T00:00:00.000Z',
      snapshots: fingerprint
        ? {
            '1440/chromium': {
              sha256: 'abc',
              updatedAt: '2026-01-01T00:00:00.000Z',
              fingerprint,
            },
          }
        : undefined,
    };
  }
  return {
    schemaVersion: fingerprint ? 2 : 1,
    createdBy: 'frontguard@test',
    updatedAt: '2026-01-01T00:00:00.000Z',
    routes: routeEntries,
  };
}

describe('currentFingerprint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records the installed renderer and the screenshot options already in use', () => {
    vi.stubEnv('FRONTGUARD_IMAGE_DIGEST', '');
    const fingerprint = currentFingerprint('chromium', 'routes');
    const playwrightVersion = (require('playwright/package.json') as { version: string }).version;
    const pixelmatchVersion = (require('pixelmatch/package.json') as { version: string }).version;
    const shell = installedPin('chromium-headless-shell');

    expect(fingerprint.frontguard).toBe(CLI_VERSION);
    expect(fingerprint.playwright).toBe(playwrightVersion);
    expect(fingerprint.pixelmatch.version).toBe(pixelmatchVersion);
    expect(fingerprint.pixelmatch.version.startsWith('7.')).toBe(true);
    expect(fingerprint.pixelmatch.options).toEqual({ threshold: 0.1, includeAA: false });
    expect(PIXELMATCH_OPTIONS).toEqual({ threshold: 0.1, includeAA: false });
    expect(fingerprint.screenshot).toEqual({ fullPage: true, type: 'png' });
    expect(CAPTURE_SCREENSHOT_OPTIONS).toEqual({ fullPage: true, type: 'png' });
    expect(fingerprint.os).toBe(process.platform);
    expect(fingerprint.arch).toBe(process.arch);
    expect(fingerprint.deviceScaleFactor).toBe(1);
    expect(fingerprint.browser.name).toBe('chromium');
    expect(fingerprint.browser.version).toBe(shell?.browserVersion);
    expect(fingerprint.browser.channel).toBe(shell?.title);
    expect(fingerprint.imageDigest).toBeUndefined();
    expect(fingerprint.captureRunner).toBe('routes');
  });

  it('records a container image digest only when the env var is set', () => {
    vi.stubEnv('FRONTGUARD_IMAGE_DIGEST', 'sha256:abc');
    expect(currentFingerprint('chromium').imageDigest).toBe('sha256:abc');
  });
});

describe('fingerprint comparison', () => {
  it('names each differing field and ignores a missing fingerprint for bypass', () => {
    const current = currentFingerprint('chromium', 'routes');
    const baseline: RendererFingerprint = {
      ...current,
      browser: { ...current.browser, version: '0.0.0-baseline', channel: 'Old Channel' },
      pixelmatch: {
        ...current.pixelmatch,
        version: '7.0.0-baseline',
        options: { threshold: 0.2, includeAA: true },
      },
      os: current.os === 'linux' ? 'darwin' : 'linux',
    };

    const fields = fingerprintDiffs(baseline, current).map((diff) => diff.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'browser.version',
        'browser.channel',
        'pixelmatch.version',
        'pixelmatch.options.includeAA',
        'pixelmatch.options.threshold',
        'os',
      ]),
    );
    const warning = formatFingerprintWarning(
      fingerprintDiffs(baseline, current).map((diff) => `${diff.field}: baseline vs current`),
    );
    expect(warning).toContain('not a pixel failure');
    expect(warning).toContain('browser.version');
    expect(warning).toContain('pixelmatch.version');

    const reason = rendererBypassReason(manifestFor(baseline), ['chromium']);
    expect(reason).toContain('browser.version');
    expect(reason).toContain('0.0.0-baseline');
    expect(reason).toContain('browser.channel');
    expect(reason).toContain('pixelmatch.version');
    expect(reason).toContain('pixelmatch.options');
    expect(reason).toContain('rendering all routes');
    expect(reason).not.toContain('os');

    const osOnly: RendererFingerprint = { ...current, os: current.os === 'linux' ? 'darwin' : 'linux' };
    expect(rendererBypassReason(manifestFor(osOnly), ['chromium'])).toBeUndefined();
    expect(rendererBypassReason(manifestFor(undefined), ['chromium'])).toBeUndefined();

    const otherBrowser: RendererFingerprint = {
      ...baseline,
      browser: { ...baseline.browser, name: 'webkit' },
    };
    expect(rendererBypassReason(manifestFor(otherBrowser), ['chromium'])).toBeUndefined();
  });

  it('loads a schema 1 manifest with unknown fields and preserves captureRunner', () => {
    const raw = {
      schemaVersion: 1,
      createdBy: 'frontguard@old',
      updatedAt: '2020-01-01T00:00:00.000Z',
      futureField: { ok: true },
      routes: {
        '/': {
          viewports: [1440],
          browsers: ['chromium'],
          lastUpdated: '2020-01-01T00:00:00.000Z',
          snapshots: {
            '1440/chromium': {
              sha256: 'old',
              updatedAt: '2020-01-01T00:00:00.000Z',
              custom: true,
              fingerprint: currentFingerprint('chromium', 'ladle'),
            },
          },
        },
      },
    };
    const parsed = parseBaselineManifest(JSON.stringify(raw));
    expect(parsed?.schemaVersion).toBe(1);
    expect((parsed as { futureField?: { ok: boolean } } | null)?.futureField).toEqual({ ok: true });
    expect(parseBaselineManifest('{')).toBeNull();
    expect(parseBaselineManifest(JSON.stringify({ routes: [] }))).toBeNull();

    const stamped = stampBaselineManifest(parsed!, [shot()]);
    expect(stamped.schemaVersion).toBe(2);
    expect((stamped as { futureField?: { ok: boolean } }).futureField).toEqual({ ok: true });
    const snapshot = stamped.routes['/']?.snapshots?.['1440/chromium'];
    expect(snapshot?.fingerprint?.captureRunner).toBe('ladle');
    expect((snapshot as { custom?: boolean } | undefined)?.custom).toBe(true);
    expect(snapshot?.fingerprint?.screenshot).toEqual({ fullPage: true, type: 'png' });

    const story = stampBaselineManifest(parsed!, [
      { ...shot(), route: { path: '/', discoveredVia: 'storybook' } },
    ]);
    expect(story.routes['/']?.snapshots?.['1440/chromium']?.fingerprint?.captureRunner).toBe('storybook');

    const explicit = stampBaselineManifest(story, [shot()]);
    expect(explicit.routes['/']?.snapshots?.['1440/chromium']?.fingerprint?.captureRunner).toBe('routes');
  });

  it('does not let a retired snapshot force a full render', () => {
    const current = currentFingerprint('chromium', 'routes');
    const stale: RendererFingerprint = {
      ...current,
      browser: { ...current.browser, version: '0.0.0-retired' },
    };
    const retiredRoute = manifestFor(stale, ['/retired']);
    expect(
      rendererBypassReason(retiredRoute, ['chromium'], {
        routes: [{ path: '/' }],
        viewports: [1440],
      }),
    ).toBeUndefined();

    const retiredViewport = manifestFor(stale, ['/']);
    const snapshots = retiredViewport.routes['/']?.snapshots;
    if (!snapshots?.['1440/chromium']) throw new Error('fixture snapshot missing');
    snapshots['390/chromium'] = snapshots['1440/chromium'];
    delete snapshots['1440/chromium'];
    expect(
      rendererBypassReason(retiredViewport, ['chromium'], {
        routes: [{ path: '/' }],
        viewports: [1440],
      }),
    ).toBeUndefined();
    expect(
      rendererBypassReason(retiredViewport, ['chromium'], {
        routes: [{ path: '/' }],
        viewports: [390],
      }),
    ).toContain('browser.version');
  });

  it('treats a route viewport override as an active fingerprint', () => {
    const current = currentFingerprint('chromium', 'routes');
    const stale: RendererFingerprint = {
      ...current,
      browser: { ...current.browser, version: '0.0.0-override' },
    };
    const manifest = manifestFor(stale, ['/']);
    const snapshots = manifest.routes['/']?.snapshots;
    if (!snapshots?.['1440/chromium']) throw new Error('fixture snapshot missing');
    snapshots['390/chromium'] = snapshots['1440/chromium'];
    delete snapshots['1440/chromium'];

    expect(
      rendererBypassReason(manifest, ['chromium'], {
        routes: [{ path: '/', viewport: [390] }],
        viewports: [1440],
      }),
    ).toContain('browser.version');

    expect(
      rendererBypassReason(manifest, ['chromium'], {
        routes: [{ path: '/' }],
        viewports: [1440],
      }),
    ).toBeUndefined();

    expect(
      rendererBypassReason(manifest, ['chromium'], {
        routes: [{ path: '/', viewport: [] }],
        viewports: [1440],
      }),
    ).toBeUndefined();
  });

  it('unions widths when the same path is selected twice', () => {
    const current = currentFingerprint('chromium', 'routes');
    const stale: RendererFingerprint = {
      ...current,
      browser: { ...current.browser, version: '0.0.0-split' },
    };
    const manifest = manifestFor(current, ['/']);
    const snapshots = manifest.routes['/']?.snapshots;
    if (!snapshots?.['1440/chromium']) throw new Error('fixture snapshot missing');
    snapshots['375/chromium'] = {
      ...snapshots['1440/chromium'],
      fingerprint: stale,
    };

    expect(
      rendererBypassReason(manifest, ['chromium'], {
        routes: [
          { path: '/', viewport: [375] },
          { path: '/', viewport: [1440] },
        ],
        viewports: [375, 1440],
      }),
    ).toContain('browser.version');

    const overrideOnly = manifestFor(stale, ['/']);
    const overrideSnapshots = overrideOnly.routes['/']?.snapshots;
    if (!overrideSnapshots?.['1440/chromium']) throw new Error('fixture snapshot missing');
    overrideSnapshots['390/chromium'] = overrideSnapshots['1440/chromium'];
    delete overrideSnapshots['1440/chromium'];
    expect(
      rendererBypassReason(overrideOnly, ['chromium'], {
        routes: [{ path: '/', viewport: [390] }, { path: '/' }],
        viewports: [1440],
      }),
    ).toContain('browser.version');
    expect(
      rendererBypassReason(overrideOnly, ['chromium'], {
        routes: [{ path: '/' }, { path: '/', viewport: [390] }],
        viewports: [1440],
      }),
    ).toContain('browser.version');
  });
});

describe('pipeline fingerprint policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineMocks.init.mockResolvedValue(undefined);
    pipelineMocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
    pipelineMocks.renderPages.mockImplementation(async (routes: Route[]) =>
      routes.map((route) => shot(route.path)),
    );
    pipelineMocks.compareScreenshot.mockImplementation((current: ScreenshotResult) => ({
      route: current.route,
      viewport: current.viewport,
      browser: current.browser,
      status: 'pass' as const,
      diffPercentage: 0,
    }));
    graph.filterAffectedRoutes.mockImplementation((routes: { path: string }[]) =>
      routes.filter((route) => route.path === '/about'),
    );
  });

  it('warns field by field and exits 2 in strict mode without reporting a pixel failure as exit 1', async () => {
    const current = currentFingerprint('chromium', 'routes');
    const baseline: RendererFingerprint = {
      ...current,
      browser: { ...current.browser, version: '0.0.0-baseline' },
      pixelmatch: { ...current.pixelmatch, version: '7.0.0-baseline' },
    };
    pipelineMocks.readManifest.mockResolvedValue(manifestFor(baseline));
    pipelineMocks.compareScreenshot.mockImplementation((shotResult: ScreenshotResult) => ({
      route: shotResult.route,
      viewport: shotResult.viewport,
      browser: shotResult.browser,
      status: 'regression' as const,
      diffPercentage: 4,
    }));

    const result = await runPipeline(makeConfig({ fingerprint: 'strict' }), reporter());
    const rendered = pipelineMocks.renderPages.mock.calls[0]?.[0] as Route[];

    expect(rendered.map((route) => route.path)).toEqual(['/', '/about']);
    const warnings = warnText().join('\n');
    expect(warnings).toContain('rendering all routes');
    expect(warnings).toContain('browser.version');
    expect(warnings).toContain('0.0.0-baseline');
    expect(warnings).toContain(current.browser.version);
    expect(warnings).toContain('pixelmatch.version');
    expect(warnings).toContain('7.0.0-baseline');
    expect(warnings).toContain(current.pixelmatch.version);
    expect(warnings).toContain('not a pixel failure');
    expect(result.fingerprintCheck?.fields).toEqual(
      expect.arrayContaining(['browser.version', 'pixelmatch.version']),
    );
    expect(result.fingerprintCheck?.strictFailure).toBe(true);
    expect(result.summary.regressions).toBeGreaterThan(0);
    expect(comparisonExitCode(result.summary)).toBe(1);
    expect(runExitCode(result.summary, result.fingerprintCheck)).toBe(2);
  });

  it('keeps smart filtering when the stored fingerprint still matches', async () => {
    pipelineMocks.readManifest.mockResolvedValue(
      manifestFor(currentFingerprint('chromium', 'routes')),
    );

    await runPipeline(makeConfig(), reporter());
    const rendered = pipelineMocks.renderPages.mock.calls[0]?.[0] as Route[];

    expect(rendered.map((route) => route.path)).toEqual(['/about']);
    expect(warnText().join('\n')).not.toContain('renderer fingerprint');
  });

  it('warns once for a schema 1 baseline and does not fail strict mode or bypass filtering', async () => {
    pipelineMocks.readManifest.mockResolvedValue(manifestFor(undefined));

    const result = await runPipeline(
      makeConfig({ fingerprint: 'strict', smartRender: false }),
      reporter(),
    );
    const rendered = pipelineMocks.renderPages.mock.calls[0]?.[0] as Route[];
    const missing = warnText().filter((line) => line === missingFingerprintWarning());

    expect(rendered.map((route) => route.path).sort()).toEqual(['/', '/about']);
    expect(missing).toHaveLength(1);
    expect(result.fingerprintCheck?.missing).toBe(true);
    expect(result.fingerprintCheck?.strictFailure).toBe(false);
    expect(result.summary.passed).toBe(2);
    expect(runExitCode(result.summary, result.fingerprintCheck)).toBe(0);
    expect(warnText().join('\n')).not.toContain('rendering all routes');
  });

  it('skips the bypass when the baseline manifest cannot be read', async () => {
    pipelineMocks.readManifest.mockRejectedValue(new Error('manifest unreadable'));

    const scoped = await runPipeline(makeConfig({ smartRender: true }), reporter());
    const scopedRoutes = pipelineMocks.renderPages.mock.calls[0]?.[0] as Route[];
    expect(scopedRoutes.map((route) => route.path)).toEqual(['/about']);
    expect(scoped.fingerprintCheck?.strictFailure).toBe(false);
    expect(warnText().join('\n')).not.toContain('renderer fingerprint');

    vi.clearAllMocks();
    pipelineMocks.init.mockResolvedValue(undefined);
    pipelineMocks.readManifest.mockRejectedValue(new Error('manifest unreadable'));
    pipelineMocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
    pipelineMocks.renderPages.mockImplementation(async (routes: Route[]) =>
      routes.map((route) => shot(route.path)),
    );
    pipelineMocks.compareScreenshot.mockImplementation((current: ScreenshotResult) => ({
      route: current.route,
      viewport: current.viewport,
      browser: current.browser,
      status: 'pass' as const,
      diffPercentage: 0,
    }));

    await runPipeline(makeConfig({ smartRender: false }), reporter());
    const info = vi.mocked(logger.info).mock.calls.map((call) => String(call[0])).join('\n');
    expect(info).toContain('disabled');
    expect(info).not.toContain('renderer fingerprint');
    expect(warnText().join('\n')).not.toContain('renderer fingerprint');
  });
});

describe('screenshot option source', () => {
  it('does not inline a different screenshot option at the capture call sites', () => {
    const source = readFileSync(new URL('../../src/render/playwright.ts', import.meta.url), 'utf8');
    expect(source.match(/screenshot\(CAPTURE_SCREENSHOT_OPTIONS\)/g)).toHaveLength(3);
    expect(source).not.toMatch(/screenshot\(\{\s*fullPage:/);
  });
});
