import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFigmaPlugin, fetchDesignReference, type FigmaConfig } from '../../src/plugins/figma.js';
import type { PluginContext } from '../../src/core/plugins.js';
import type { DiffResult, ScreenshotResult, RunResult, FrontguardConfig } from '../../src/core/types.js';
import { createTestPng } from '../fixtures/helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<FrontguardConfig>): PluginContext {
  return {
    config: {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 4,
      pageTimeout: 30_000,
      maxHeight: 5_000,
      outputDir: '.frontguard',
      ...overrides,
    },
    metadata: new Map(),
  };
}

function makeScreenshot(path: string, viewport = 1440): ScreenshotResult {
  return {
    route: { path, label: path },
    viewport,
    browser: 'chromium',
    buffer: createTestPng(100, 100, 255, 0, 0),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 100,
  };
}

function makeDiffResult(path: string, viewport = 1440): DiffResult {
  return {
    route: { path, label: path },
    viewport,
    browser: 'chromium',
    status: 'changed',
    diffPercentage: 5,
    currentImage: createTestPng(100, 100, 255, 0, 0),
    baselineImage: createTestPng(100, 100, 200, 0, 0),
  };
}

function makeRunResult(diffs: DiffResult[]): RunResult {
  return {
    summary: {
      total: diffs.length,
      passed: 0,
      regressions: 0,
      warnings: 0,
      newPages: 0,
      errors: 0,
    },
    diffs,
    timing: { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 },
    config: makeContext().config,
  };
}

const validConfig: FigmaConfig = {
  fileKey: 'abc123def456',
  pages: {
    '/': '1:2',
    '/pricing': '1:5',
    '/checkout': '3:8',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFigmaPlugin', () => {
  it('returns a plugin object with name "figma"', () => {
    const plugin = createFigmaPlugin(validConfig);
    expect(plugin.name).toBe('figma');
  });

  it('has all expected lifecycle hooks', () => {
    const plugin = createFigmaPlugin(validConfig);
    expect(typeof plugin.setup).toBe('function');
    expect(typeof plugin.afterRender).toBe('function');
    expect(typeof plugin.afterCompare).toBe('function');
    expect(typeof plugin.afterRun).toBe('function');
    expect(typeof plugin.teardown).toBe('function');
  });

  it('throws when fileKey is missing', () => {
    expect(() =>
      createFigmaPlugin({ fileKey: '', pages: { '/': '1:2' } }),
    ).toThrow('"fileKey" is required');
  });

  it('throws when fileKey is not a string', () => {
    expect(() =>
      // @ts-expect-error testing runtime validation
      createFigmaPlugin({ fileKey: 123, pages: { '/': '1:2' } }),
    ).toThrow('"fileKey" is required');
  });

  it('throws when pages is empty', () => {
    expect(() =>
      createFigmaPlugin({ fileKey: 'abc', pages: {} }),
    ).toThrow('"pages" is required');
  });

  it('throws when pages is missing', () => {
    expect(() =>
      // @ts-expect-error testing runtime validation
      createFigmaPlugin({ fileKey: 'abc' }),
    ).toThrow('"pages" is required');
  });
});

describe('FigmaPlugin.setup', () => {
  const originalEnv = process.env['FIGMA_ACCESS_TOKEN'];

  afterEach(() => {
    // Restore environment
    if (originalEnv !== undefined) {
      process.env['FIGMA_ACCESS_TOKEN'] = originalEnv;
    } else {
      delete process.env['FIGMA_ACCESS_TOKEN'];
    }
  });

  it('warns when no access token is available', async () => {
    delete process.env['FIGMA_ACCESS_TOKEN'];
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: undefined });
    const ctx = makeContext();

    // Spy on logger.warn
    const { logger } = await import('../../src/utils/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');

    await plugin.setup!(ctx);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No access token found'),
    );

    warnSpy.mockRestore();
  });

  it('stores token from config in metadata', async () => {
    delete process.env['FIGMA_ACCESS_TOKEN'];
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: 'test-token-123' });
    const ctx = makeContext();

    await plugin.setup!(ctx);

    expect(ctx.metadata.get('figma:accessToken')).toBe('test-token-123');
  });

  it('falls back to FIGMA_ACCESS_TOKEN env var', async () => {
    process.env['FIGMA_ACCESS_TOKEN'] = 'env-token-456';
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: undefined });
    const ctx = makeContext();

    await plugin.setup!(ctx);

    expect(ctx.metadata.get('figma:accessToken')).toBe('env-token-456');
  });

  it('prefers config accessToken over env var', async () => {
    process.env['FIGMA_ACCESS_TOKEN'] = 'env-token';
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: 'config-token' });
    const ctx = makeContext();

    await plugin.setup!(ctx);

    expect(ctx.metadata.get('figma:accessToken')).toBe('config-token');
  });
});

describe('FigmaPlugin.afterRender', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips when no access token is in metadata', async () => {
    const plugin = createFigmaPlugin(validConfig);
    const ctx = makeContext();
    // Do NOT set figma:accessToken in metadata (simulates no token)

    const screenshots = [makeScreenshot('/')];
    await plugin.afterRender!(screenshots, ctx);

    // fetch should never be called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches Figma images for matching routes', async () => {
    const pngBuffer = createTestPng(100, 100, 0, 255, 0);

    // Mock Figma API response → image URL
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ err: null, images: { '1:2': 'https://figma-cdn.example.com/img.png' } }),
      })
      // Mock downloading the actual image
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength),
      });

    const plugin = createFigmaPlugin({ ...validConfig, accessToken: 'test-token' });
    const ctx = makeContext();
    await plugin.setup!(ctx); // setup stores token + initializes images map

    const screenshots = [makeScreenshot('/')];
    await plugin.afterRender!(screenshots, ctx);

    // Should have called fetch twice (API + image download)
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // First call should be to Figma API
    expect(fetchSpy.mock.calls[0][0]).toContain('api.figma.com/v1/images/abc123def456');
    expect(fetchSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: { 'X-Figma-Token': 'test-token' },
      }),
    );
  });

  it('skips routes not in pages config', async () => {
    const plugin = createFigmaPlugin(validConfig);
    const ctx = makeContext();
    ctx.metadata.set('figma:accessToken', 'test-token');
    ctx.metadata.set('figma:images', new Map());

    const screenshots = [makeScreenshot('/unknown-page')];
    await plugin.afterRender!(screenshots, ctx);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('FigmaPlugin.afterCompare', () => {
  it('skips when no Figma images are available', async () => {
    const plugin = createFigmaPlugin(validConfig);
    const ctx = makeContext();
    // No figma:images in metadata

    const diffs = [makeDiffResult('/')];
    const originalLength = diffs.length;

    await plugin.afterCompare!(diffs, ctx);

    // Should not append anything
    expect(diffs.length).toBe(originalLength);
  });

  it('appends design-compliance diffs when Figma images are available', async () => {
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: 'test-token' });
    const ctx = makeContext();
    await plugin.setup!(ctx);

    const figmaImages = new Map<string, Buffer>();
    figmaImages.set('/:1440', createTestPng(100, 100, 0, 255, 0)); // Green = different from red screenshot
    ctx.metadata.set('figma:images', figmaImages);

    const diffs = [makeDiffResult('/')];
    const originalLength = diffs.length;

    await plugin.afterCompare!(diffs, ctx);

    // Should have appended a design-compliance diff
    expect(diffs.length).toBe(originalLength + 1);
    const complianceDiff = diffs[diffs.length - 1];
    expect(complianceDiff.route.label).toContain('[design-compliance]');
    expect(complianceDiff.diffPercentage).toBeGreaterThan(0);
    expect(complianceDiff.diffImage).toBeDefined();
  });
});

describe('FigmaPlugin.afterRun', () => {
  it('does not throw when no compliance results exist', async () => {
    const plugin = createFigmaPlugin(validConfig);
    const ctx = makeContext();
    const result = makeRunResult([]);

    await expect(plugin.afterRun!(result, ctx)).resolves.toBeUndefined();
  });
});

describe('FigmaPlugin.teardown', () => {
  it('cleans up metadata', async () => {
    const plugin = createFigmaPlugin({ ...validConfig, accessToken: 'test-token' });
    const ctx = makeContext();
    await plugin.setup!(ctx); // setup stores token + images map in metadata

    // Verify setup stored data
    expect(ctx.metadata.has('figma:accessToken')).toBe(true);
    expect(ctx.metadata.has('figma:images')).toBe(true);

    await plugin.teardown!();

    expect(ctx.metadata.has('figma:accessToken')).toBe(false);
    expect(ctx.metadata.has('figma:images')).toBe(false);
  });
});

describe('fetchDesignReference (Task 8.4 — judge mode)', () => {
  const origToken = process.env.FIGMA_ACCESS_TOKEN;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (origToken === undefined) delete process.env.FIGMA_ACCESS_TOKEN;
    else process.env.FIGMA_ACCESS_TOKEN = origToken;
  });

  it('returns null when no token is configured', async () => {
    delete process.env.FIGMA_ACCESS_TOKEN;
    const ref = await fetchDesignReference({ fileKey: 'f', pages: { '/': '1:2' } }, '/');
    expect(ref).toBeNull();
  });

  it('returns null when the route has no page mapping', async () => {
    const ref = await fetchDesignReference(
      { fileKey: 'f', pages: { '/other': '1:2' }, accessToken: 'tok' },
      '/missing',
    );
    expect(ref).toBeNull();
  });

  it('fetches and returns the design PNG when mapped', async () => {
    const png = createTestPng(50, 50, 0, 0, 255);
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('api.figma.com')) {
        return new Response(JSON.stringify({ err: null, images: { '1:2': 'https://cdn/figma.png' } }), { status: 200 });
      }
      return new Response(png, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const ref = await fetchDesignReference(
      { fileKey: 'f', pages: { '/': '1:2' }, accessToken: 'tok' },
      '/',
    );
    expect(ref).not.toBeNull();
    expect(Buffer.isBuffer(ref)).toBe(true);
  });

  it('returns null (no throw) when the Figma API errors', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);
    const ref = await fetchDesignReference(
      { fileKey: 'f', pages: { '/': '1:2' }, accessToken: 'tok' },
      '/',
    );
    expect(ref).toBeNull();
  });
});
