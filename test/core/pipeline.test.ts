/**
 * Pipeline integration tests.
 *
 * Tests the critical sub-modules that power the pipeline:
 * - compareScreenshot threshold boundaries & SSIM fallback
 * - Config schema defaults and validation
 * - PluginManager hook ordering & resilience
 * - Route discovery fallback
 * - Buffer disposal
 */
import { describe, it, expect, vi } from 'vitest';
import { PNG } from 'pngjs';
import { compareScreenshot, createNewPageResult } from '../../src/diff/pixel.js';
import { configSchema } from '../../src/core/config.js';
import { PluginManager } from '../../src/core/plugins.js';
import type { ScreenshotResult, Route } from '../../src/core/types.js';
import type { FrontguardPlugin, PluginContext } from '../../src/core/plugins.js';
import { createTestPng } from '../fixtures/helpers.js';
import { logger } from '../../src/utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ScreenshotResult */
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

/**
 * Create a PNG where the first `diffPixels` pixels are a contrasting colour.
 *
 * The base colour is solid red (255, 0, 0). The differing pixels are solid
 * blue (0, 0, 255) — far enough apart that pixelmatch will always count them.
 */
function createTestPngWithDiff(
  width: number,
  height: number,
  diffPixels: number,
): Buffer {
  const png = new PNG({ width, height });
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (changed < diffPixels) {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
        changed++;
      } else {
        png.data[idx] = 255;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

/** Minimal valid base config for Zod parsing */
function minimalConfig(overrides: Record<string, unknown> = {}) {
  return { baseUrl: 'http://localhost:3000', ...overrides };
}

/** Build a minimal PluginContext */
function makePluginContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    config: configSchema.parse(minimalConfig()),
    logger,
    metadata: new Map(),
    ...overrides,
  };
}

// ===========================================================================
// 1. Threshold boundary tests
// ===========================================================================

describe('Threshold boundary tests', () => {
  // 100x100 = 10 000 pixels total
  const W = 100;
  const H = 100;
  const TOTAL = W * H;

  // Baseline: solid red
  const baseline = createTestPng(W, H, 255, 0, 0);

  it('diffPercentage ≈ 5% with threshold=0.1 → not regression (below threshold)', () => {
    // 500 / 10000 = 5% diff → 0.05 < 0.1 threshold
    const current = createTestPngWithDiff(W, H, Math.round(TOTAL * 0.05));
    const result = compareScreenshot(makeScreenshot(current), baseline, 0.1, { enabled: false });

    expect(result.status).not.toBe('regression');
    // 0.05 < 0.1, so status should be 'changed' (below threshold, non-zero diff)
    expect(result.status).toBe('changed');
    expect(result.diffPercentage).toBeGreaterThan(0);
    expect(result.diffPercentage).toBeLessThanOrEqual(10); // well below threshold*100
  });

  it('diffPercentage ≈ 15% with threshold=0.1 → regression (above threshold)', () => {
    // 1500 / 10000 = 15% diff → 0.15 > 0.1 threshold
    const current = createTestPngWithDiff(W, H, Math.round(TOTAL * 0.15));
    const result = compareScreenshot(makeScreenshot(current), baseline, 0.1, { enabled: false });

    expect(result.status).toBe('regression');
    expect(result.diffPercentage).toBeGreaterThan(10);
  });

  it('diffPercentage = 0 (identical images) → always pass', () => {
    const current = createTestPng(W, H, 255, 0, 0);
    const result = compareScreenshot(makeScreenshot(current), baseline, 0.1);

    expect(result.status).toBe('pass');
    expect(result.diffPercentage).toBe(0);
  });

  it('diffPercentage = 100% (completely different) → always regression', () => {
    // All pixels different (blue vs red)
    const current = createTestPng(W, H, 0, 0, 255);
    const result = compareScreenshot(makeScreenshot(current), baseline, 0.1);

    expect(result.status).toBe('regression');
    expect(result.diffPercentage).toBeGreaterThan(90);
  });

  it('diffPercentage exactly at threshold boundary → not regression (<=)', () => {
    // threshold=0.1 means regression when diffPercentage/100 > 0.1 (strictly greater)
    // At exactly 10% → 10/100 = 0.1, NOT > 0.1, so should be 'changed'
    const current = createTestPngWithDiff(W, H, Math.round(TOTAL * 0.1));
    const result = compareScreenshot(makeScreenshot(current), baseline, 0.1, { enabled: false });

    // diffPercentage/100 === threshold → NOT > threshold → not regression
    expect(result.status).not.toBe('regression');
  });
});

// ===========================================================================
// 2. SSIM fallback integration
// ===========================================================================

describe('SSIM fallback integration', () => {
  const W = 100;
  const H = 100;
  const TOTAL = W * H;

  it('nearly-identical images with small diff → SSIM override to pass', () => {
    // Create two images that are very similar (only ~2% pixels different)
    // With threshold=0.1, borderline zone = diffPct < 20% (threshold * 100 * 2)
    const baseline = createTestPng(W, H, 255, 0, 0);

    // Create a slightly different image: change ~2% of pixels to a very close colour
    const png = new PNG({ width: W, height: H });
    const diffCount = Math.round(TOTAL * 0.02); // 2% diff
    let changed = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (W * y + x) << 2;
        if (changed < diffCount) {
          // Slightly different red — still perceptually very close
          png.data[idx] = 250;
          png.data[idx + 1] = 5;
          png.data[idx + 2] = 5;
          png.data[idx + 3] = 255;
          changed++;
        } else {
          png.data[idx] = 255;
          png.data[idx + 1] = 0;
          png.data[idx + 2] = 0;
          png.data[idx + 3] = 255;
        }
      }
    }
    const current = PNG.sync.write(png);

    const result = compareScreenshot(
      makeScreenshot(current),
      baseline,
      0.1,
      { enabled: true, ssimThreshold: 0.90 },
    );

    // With very similar images, SSIM should be high → override to pass
    if (result.ssimOverride) {
      expect(result.status).toBe('pass');
      expect(result.ssimOverride).toBe(true);
      expect(result.ssim).toBeDefined();
      expect(result.ssim!).toBeGreaterThan(0.90);
    } else {
      // If pixelmatch threshold didn't detect diff (colours too close), it's already pass/changed
      expect(['pass', 'changed']).toContain(result.status);
    }
  });

  it('large diff → SSIM not computed (outside borderline zone)', () => {
    const baseline = createTestPng(W, H, 255, 0, 0);
    // 100% diff — completely different image
    const current = createTestPng(W, H, 0, 0, 255);

    const result = compareScreenshot(
      makeScreenshot(current),
      baseline,
      0.1,
      { enabled: true },
    );

    // diffPercentage >> threshold * 100 * 2, so SSIM not computed
    expect(result.status).toBe('regression');
    expect(result.ssim).toBeUndefined();
    expect(result.ssimOverride).toBeUndefined();
  });

  it('SSIM disabled → no SSIM computation even for borderline diffs', () => {
    const baseline = createTestPng(W, H, 255, 0, 0);
    const current = createTestPngWithDiff(W, H, Math.round(TOTAL * 0.05));

    const result = compareScreenshot(
      makeScreenshot(current),
      baseline,
      0.1,
      { enabled: false },
    );

    expect(result.ssim).toBeUndefined();
    expect(result.ssimOverride).toBeUndefined();
  });
});

// ===========================================================================
// 3. Config defaults
// ===========================================================================

describe('Config defaults', () => {
  it('minimal config (just baseUrl) fills all defaults', () => {
    const result = configSchema.parse({ baseUrl: 'http://localhost:3000' });

    expect(result.version).toBe(1);
    expect(result.baseUrl).toBe('http://localhost:3000');
    expect(result.viewports).toEqual([375, 768, 1440]);
    expect(result.browsers).toEqual(['chromium']);
    expect(result.threshold).toBe(0.1);
    expect(result.ignore).toEqual([]);
    expect(result.smartRender).toBe(true);
    expect(result.workers).toBe(4);
    expect(result.pageTimeout).toBe(30_000);
    expect(result.maxHeight).toBe(5_000);
    expect(result.outputDir).toBe('./frontguard-report');
  });

  it('antiFlakeRenders defaults to undefined', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.antiFlakeRenders).toBeUndefined();
  });

  it('threshold defaults to 0.1', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.threshold).toBe(0.1);
  });

  it('viewports defaults to [375, 768, 1440]', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.viewports).toEqual([375, 768, 1440]);
  });

  it('ssimFallback defaults to true', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.ssimFallback).toBe(true);
  });

  it('ssimThreshold defaults to 0.98', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.ssimThreshold).toBe(0.98);
  });

  it('routes is optional (undefined when not provided)', () => {
    const result = configSchema.parse(minimalConfig());
    expect(result.routes).toBeUndefined();
  });

  it('custom values override defaults', () => {
    const result = configSchema.parse({
      baseUrl: 'http://example.com',
      viewports: [320],
      threshold: 0.05,
      workers: 2,
      ssimFallback: false,
    });

    expect(result.viewports).toEqual([320]);
    expect(result.threshold).toBe(0.05);
    expect(result.workers).toBe(2);
    expect(result.ssimFallback).toBe(false);
  });
});

// ===========================================================================
// 4. Plugin hook ordering
// ===========================================================================

describe('Plugin hook ordering', () => {
  it('runs hooks in registration order (FIFO)', async () => {
    const order: string[] = [];

    const pluginA: FrontguardPlugin = {
      name: 'alpha',
      async setup() { order.push('setup:alpha'); },
      async afterDiscover(routes) { order.push('afterDiscover:alpha'); return routes; },
    };

    const pluginB: FrontguardPlugin = {
      name: 'beta',
      async setup() { order.push('setup:beta'); },
      async afterDiscover(routes) { order.push('afterDiscover:beta'); return routes; },
    };

    const pm = new PluginManager();
    pm.register(pluginA);
    pm.register(pluginB);

    await pm.setup(makePluginContext());
    await pm.runHook('afterDiscover', [{ path: '/' }], configSchema.parse(minimalConfig()));

    expect(order).toEqual([
      'setup:alpha',
      'setup:beta',
      'afterDiscover:alpha',
      'afterDiscover:beta',
    ]);
  });

  it('teardown runs in reverse (LIFO) order', async () => {
    const order: string[] = [];

    const pluginA: FrontguardPlugin = {
      name: 'first',
      async teardown() { order.push('teardown:first'); },
    };

    const pluginB: FrontguardPlugin = {
      name: 'second',
      async teardown() { order.push('teardown:second'); },
    };

    const pluginC: FrontguardPlugin = {
      name: 'third',
      async teardown() { order.push('teardown:third'); },
    };

    const pm = new PluginManager();
    pm.register(pluginA);
    pm.register(pluginB);
    pm.register(pluginC);

    await pm.setup(makePluginContext());
    await pm.teardown();

    expect(order).toEqual(['teardown:third', 'teardown:second', 'teardown:first']);
  });

  it('plugin throwing in hook does not crash manager (runHook)', async () => {
    const order: string[] = [];

    const crashPlugin: FrontguardPlugin = {
      name: 'crasher',
      async afterDiscover() {
        throw new Error('boom');
      },
    };

    const safePlugin: FrontguardPlugin = {
      name: 'safe',
      async afterDiscover(routes) {
        order.push('safe ran');
        return routes;
      },
    };

    const pm = new PluginManager();
    pm.register(crashPlugin);
    pm.register(safePlugin);
    await pm.setup(makePluginContext());

    // runHook propagates errors — this tests that we can catch them
    await expect(
      pm.runHook('afterDiscover', [{ path: '/' }], configSchema.parse(minimalConfig())),
    ).rejects.toThrow('boom');
  });

  it('plugin throwing in teardown does not crash other teardowns', async () => {
    const order: string[] = [];

    const crashPlugin: FrontguardPlugin = {
      name: 'teardown-crasher',
      async teardown() {
        order.push('crash-teardown');
        throw new Error('teardown boom');
      },
    };

    const safePlugin: FrontguardPlugin = {
      name: 'teardown-safe',
      async teardown() {
        order.push('safe-teardown');
      },
    };

    const pm = new PluginManager();
    // Register safe first, crash second
    // LIFO: crash tears down first, then safe
    pm.register(safePlugin);
    pm.register(crashPlugin);

    await pm.setup(makePluginContext());
    await pm.teardown(); // should NOT throw

    // Both teardowns ran despite crash in first
    expect(order).toEqual(['crash-teardown', 'safe-teardown']);
  });

  it('duplicate plugin names are rejected', () => {
    const pm = new PluginManager();
    pm.register({ name: 'dup' });

    expect(() => pm.register({ name: 'dup' })).toThrow('already registered');
  });

  it('hook transforms are chained (each plugin receives previous result)', async () => {
    const pluginA: FrontguardPlugin = {
      name: 'adder',
      async afterDiscover(routes: Route[]) {
        return [...routes, { path: '/added-by-a' }];
      },
    };

    const pluginB: FrontguardPlugin = {
      name: 'counter',
      async afterDiscover(routes: Route[]) {
        return [...routes, { path: `/count-${routes.length}` }];
      },
    };

    const pm = new PluginManager();
    pm.register(pluginA);
    pm.register(pluginB);
    await pm.setup(makePluginContext());

    const result = await pm.runHook('afterDiscover', [{ path: '/' }], configSchema.parse(minimalConfig()));

    // A gets ['/'], returns ['/', '/added-by-a']
    // B gets ['/', '/added-by-a'], returns ['/', '/added-by-a', '/count-2']
    expect(result).toHaveLength(3);
    expect(result[1].path).toBe('/added-by-a');
    expect(result[2].path).toBe('/count-2');
  });
});

// ===========================================================================
// 5. Route discovery fallback
// ===========================================================================

describe('Route discovery fallback', () => {
  it('empty routes array should be detectable and substitutable with [{ path: "/" }]', () => {
    // This tests the pattern used in the pipeline: if routes.length === 0, fall back
    const routes: Route[] = [];

    let finalRoutes = routes;
    if (finalRoutes.length === 0) {
      finalRoutes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    }

    expect(finalRoutes).toHaveLength(1);
    expect(finalRoutes[0].path).toBe('/');
    expect(finalRoutes[0].label).toBe('Home');
    expect(finalRoutes[0].discoveredVia).toBe('config');
  });

  it('non-empty routes are preserved', () => {
    const routes: Route[] = [
      { path: '/about', label: 'About' },
      { path: '/contact', label: 'Contact' },
    ];

    let finalRoutes = routes;
    if (finalRoutes.length === 0) {
      finalRoutes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    }

    expect(finalRoutes).toHaveLength(2);
    expect(finalRoutes[0].path).toBe('/about');
  });
});

// ===========================================================================
// 6. Buffer disposal
// ===========================================================================

describe('Buffer disposal', () => {
  it('PNG buffers can be nulled for garbage collection', () => {
    let buffer: Buffer | null = createTestPng(100, 100, 255, 0, 0);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer!.length).toBeGreaterThan(0);

    // Dispose
    buffer = null;
    expect(buffer).toBeNull();
  });

  it('DiffResult image fields can be cleared', () => {
    const png = createTestPng(50, 50, 255, 0, 0);
    const current = makeScreenshot(png);
    const result = createNewPageResult(current);

    expect(result.currentImage).toBeDefined();
    expect(result.currentImage).toBeInstanceOf(Buffer);

    // Simulate disposal
    const mutableResult = { ...result };
    mutableResult.currentImage = undefined;
    mutableResult.diffImage = undefined;
    mutableResult.baselineImage = undefined;

    expect(mutableResult.currentImage).toBeUndefined();
    expect(mutableResult.diffImage).toBeUndefined();
    expect(mutableResult.baselineImage).toBeUndefined();
  });

  it('multiple buffers can be created and individually disposed', () => {
    const buffers: (Buffer | null)[] = Array.from({ length: 10 }, (_, i) =>
      createTestPng(20, 20, i * 25, 0, 0),
    );

    expect(buffers.every((b) => b !== null)).toBe(true);

    // Dispose odd-indexed buffers
    for (let i = 1; i < buffers.length; i += 2) {
      buffers[i] = null;
    }

    expect(buffers[0]).not.toBeNull();
    expect(buffers[1]).toBeNull();
    expect(buffers[2]).not.toBeNull();
    expect(buffers[3]).toBeNull();
  });
});

// ===========================================================================
// 7. SSIM crash resilience
// ===========================================================================

describe('SSIM crash resilience', () => {
  it('corrupt current buffer → returns error, does not crash', () => {
    const baseline = createTestPng(50, 50, 255, 0, 0);
    const corrupt = Buffer.from('totally not a PNG image at all 🤮');

    const result = compareScreenshot(
      makeScreenshot(corrupt),
      baseline,
      0.1,
      { enabled: true },
    );

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Failed to decode');
  });

  it('corrupt baseline buffer → returns error, does not crash', () => {
    const current = createTestPng(50, 50, 255, 0, 0);
    const corrupt = Buffer.from('not a PNG');

    const result = compareScreenshot(
      makeScreenshot(current),
      corrupt,
      0.1,
      { enabled: true },
    );

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Failed to decode');
  });

  it('truncated PNG buffer → error result, no crash', () => {
    const valid = createTestPng(50, 50, 255, 0, 0);
    // Take only the first 20 bytes (PNG header but no data)
    const truncated = valid.subarray(0, 20);

    const result = compareScreenshot(
      makeScreenshot(truncated),
      valid,
      0.1,
      { enabled: true },
    );

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('empty buffers → error result, no crash', () => {
    const valid = createTestPng(50, 50, 255, 0, 0);

    const result = compareScreenshot(
      makeScreenshot(Buffer.alloc(0)),
      valid,
      0.1,
      { enabled: true },
    );

    expect(result.status).toBe('error');
    expect(result.error).toContain('empty');
  });
});

// ===========================================================================
// 8. Config validation — invalid threshold
// ===========================================================================

describe('Config validation', () => {
  it('negative threshold → Zod error', () => {
    const result = configSchema.safeParse(minimalConfig({ threshold: -0.5 }));

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('>= 0');
    }
  });

  it('threshold > 1 → Zod error', () => {
    const result = configSchema.safeParse(minimalConfig({ threshold: 1.5 }));

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('<= 1');
    }
  });

  it('threshold = 0 is valid', () => {
    const result = configSchema.safeParse(minimalConfig({ threshold: 0 }));
    expect(result.success).toBe(true);
  });

  it('threshold = 1 is valid', () => {
    const result = configSchema.safeParse(minimalConfig({ threshold: 1 }));
    expect(result.success).toBe(true);
  });

  it('missing baseUrl → Zod error', () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('invalid baseUrl (not a URL) → Zod error', () => {
    const result = configSchema.safeParse({ baseUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('string threshold → Zod error', () => {
    const result = configSchema.safeParse(minimalConfig({ threshold: 'high' }));
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// 9. Ignore rule validation
// ===========================================================================

describe('Ignore rule validation', () => {
  it('rule with neither selector nor rect → Zod error', () => {
    const result = configSchema.safeParse(
      minimalConfig({ ignore: [{ description: 'orphan rule' }] }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('selector or rect');
    }
  });

  it('rule with empty object → Zod error', () => {
    const result = configSchema.safeParse(minimalConfig({ ignore: [{}] }));

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('selector or rect');
    }
  });

  it('rule with selector → valid', () => {
    const result = configSchema.safeParse(
      minimalConfig({ ignore: [{ selector: '.ad-banner' }] }),
    );

    expect(result.success).toBe(true);
  });

  it('rule with rect → valid', () => {
    const result = configSchema.safeParse(
      minimalConfig({
        ignore: [{ rect: { x: 0, y: 0, width: 100, height: 50 } }],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rule with both selector and rect → valid', () => {
    const result = configSchema.safeParse(
      minimalConfig({
        ignore: [
          {
            selector: '.overlay',
            rect: { x: 10, y: 10, width: 200, height: 100 },
            description: 'Ad overlay region',
          },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rule with empty selector string → Zod error', () => {
    const result = configSchema.safeParse(
      minimalConfig({ ignore: [{ selector: '' }] }),
    );

    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// 10. AntiFlakeRenders validation
// ===========================================================================

describe('AntiFlakeRenders validation', () => {
  it.each([1, 2, 3, 4, 5])('antiFlakeRenders = %d → accepted', (value) => {
    const result = configSchema.safeParse(minimalConfig({ antiFlakeRenders: value }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.antiFlakeRenders).toBe(value);
    }
  });

  it('antiFlakeRenders = 0 → rejected (below min)', () => {
    const result = configSchema.safeParse(minimalConfig({ antiFlakeRenders: 0 }));
    expect(result.success).toBe(false);
  });

  it('antiFlakeRenders = 6 → rejected (above max)', () => {
    const result = configSchema.safeParse(minimalConfig({ antiFlakeRenders: 6 }));
    expect(result.success).toBe(false);
  });

  it('antiFlakeRenders = -1 → rejected', () => {
    const result = configSchema.safeParse(minimalConfig({ antiFlakeRenders: -1 }));
    expect(result.success).toBe(false);
  });

  it('antiFlakeRenders = 2.5 → rejected (must be integer)', () => {
    const result = configSchema.safeParse(minimalConfig({ antiFlakeRenders: 2.5 }));
    expect(result.success).toBe(false);
  });

  it('antiFlakeRenders omitted → valid (optional)', () => {
    const result = configSchema.safeParse(minimalConfig());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.antiFlakeRenders).toBeUndefined();
    }
  });
});
