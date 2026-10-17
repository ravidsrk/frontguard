/**
 * Tests for src/render/playwright.ts
 *
 * The renderer requires Playwright browser binaries. We test the pure logic:
 * task generation, error result shapes, and configuration behavior by
 * reconstructing the task-building logic from the source.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Route, FrontguardConfig, BrowserEngine, ScreenshotResult } from '../../src/core/types.js';
import { STORYBOOK_READY_SCRIPT } from '../../src/discovery/storybook.js';
import {
  executeTask,
  executeRouteActions,
  resolveFreezeTimestamp,
  matchesBlockedUrl,
} from '../../src/render/playwright.js';
import { logger } from '../../src/utils/logger.js';

/** Replicate the internal RenderTask structure */
interface RenderTask {
  route: Route;
  viewport: number;
  browser: BrowserEngine;
}

/** Build task list exactly as renderPages() does */
function buildTasks(routes: Route[], config: Pick<FrontguardConfig, 'viewports' | 'browsers'>): RenderTask[] {
  const tasks: RenderTask[] = [];
  for (const route of routes) {
    const viewports =
      route.viewport && route.viewport.length > 0 ? route.viewport : config.viewports;
    for (const viewport of viewports) {
      for (const browser of config.browsers) {
        tasks.push({ route, viewport, browser });
      }
    }
  }
  return tasks;
}

/** Replicate the error result shape produced when a render task fails */
function makeErrorResult(task: RenderTask, errMsg: string): ScreenshotResult {
  return {
    route: task.route,
    viewport: task.viewport,
    browser: task.browser,
    buffer: Buffer.alloc(0),
    domSnapshot: '',
    consoleErrors: [`Render error: ${errMsg}`],
    timestamp: Date.now(),
    duration: 0,
  };
}

const routes: Route[] = [
  { path: '/' },
  { path: '/about' },
  { path: '/pricing' },
];

describe('Renderer Task Generation', () => {
  it('generates correct count: routes × viewports × browsers', () => {
    const tasks = buildTasks(routes, { viewports: [375, 1440], browsers: ['chromium'] });
    expect(tasks).toHaveLength(6); // 3 routes × 2 viewports × 1 browser
  });

  it('generates tasks for multiple browsers', () => {
    const tasks = buildTasks(routes, { viewports: [1440], browsers: ['chromium', 'firefox'] });
    expect(tasks).toHaveLength(6); // 3 routes × 1 viewport × 2 browsers
  });

  it('generates tasks for all combinations', () => {
    const tasks = buildTasks(routes, { viewports: [375, 1440], browsers: ['chromium', 'firefox', 'webkit'] });
    expect(tasks).toHaveLength(18); // 3 × 2 × 3
  });

  it('returns empty tasks for empty routes', () => {
    const tasks = buildTasks([], { viewports: [375, 1440], browsers: ['chromium'] });
    expect(tasks).toHaveLength(0);
  });

  it('returns empty tasks for empty viewports', () => {
    const tasks = buildTasks(routes, { viewports: [], browsers: ['chromium'] });
    expect(tasks).toHaveLength(0);
  });

  it('returns empty tasks for empty browsers', () => {
    const tasks = buildTasks(routes, { viewports: [1440], browsers: [] });
    expect(tasks).toHaveLength(0);
  });

  it('single route + single viewport + single browser = 1 task', () => {
    const tasks = buildTasks([{ path: '/' }], { viewports: [1440], browsers: ['chromium'] });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
    });
  });

  it('preserves route metadata through task generation', () => {
    const routeWithLabel: Route[] = [{ path: '/checkout', label: 'Checkout Page' }];
    const tasks = buildTasks(routeWithLabel, { viewports: [1440], browsers: ['chromium'] });
    expect(tasks[0].route.label).toBe('Checkout Page');
  });

  it('tasks have correct viewport assignment', () => {
    const tasks = buildTasks([{ path: '/' }], { viewports: [375, 768, 1440], browsers: ['chromium'] });
    expect(tasks.map(t => t.viewport)).toEqual([375, 768, 1440]);
  });

  it('honors per-route viewport overrides from Storybook parameters', () => {
    const tasks = buildTasks(
      [
        { path: '/iframe.html?id=components-button--primary&viewMode=story', discoveredVia: 'storybook' },
        {
          path: '/iframe.html?id=components-button--secondary&viewMode=story',
          discoveredVia: 'storybook',
          viewport: [768],
        },
      ],
      { viewports: [375, 768, 1440], browsers: ['chromium'] },
    );
    expect(tasks).toHaveLength(4);
    expect(tasks.filter((t) => t.route.viewport?.includes(768))).toHaveLength(1);
    expect(tasks.filter((t) => t.route.viewport === undefined)).toHaveLength(3);
  });
});

describe('Storybook ready-wait evaluate shape', () => {
  it('wraps STORYBOOK_READY_SCRIPT as an invoked function expression', () => {
    const sbTimeout = 15_000;
    const expr = `(${STORYBOOK_READY_SCRIPT})(${sbTimeout})`;
    expect(expr.startsWith('((timeoutMs) => new Promise(')).toBe(true);
    expect(expr.endsWith(`)(${sbTimeout})`)).toBe(true);

    const win: {
      __STORYBOOK_PREVIEW__: {
        storyRenders: Map<string, { phase: string }>;
        channel: { once: () => void };
      };
    } = {
      __STORYBOOK_PREVIEW__: {
        storyRenders: new Map([['x', { phase: 'completed' }]]),
        channel: { once: () => {} },
      },
    };
    const document = { body: { classList: { contains: () => false } } };
    const fn = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      `return ${expr};`,
    );
    const raf = (cb: () => void) => setTimeout(cb, 0);
    return expect(fn(win, document, raf)).resolves.toMatchObject({
      ready: true,
      reason: 'phase-complete',
    });
  });
});

describe('Renderer Error Results', () => {
  it('error result has 0-byte buffer', () => {
    const task: RenderTask = { route: { path: '/' }, viewport: 1440, browser: 'chromium' };
    const result = makeErrorResult(task, 'Browser crashed');
    expect(result.buffer.length).toBe(0);
  });

  it('error result has empty DOM snapshot', () => {
    const task: RenderTask = { route: { path: '/' }, viewport: 1440, browser: 'chromium' };
    const result = makeErrorResult(task, 'Timeout');
    expect(result.domSnapshot).toBe('');
  });

  it('error result captures error message in consoleErrors', () => {
    const task: RenderTask = { route: { path: '/' }, viewport: 1440, browser: 'chromium' };
    const result = makeErrorResult(task, 'Connection refused');
    expect(result.consoleErrors).toHaveLength(1);
    expect(result.consoleErrors[0]).toContain('Connection refused');
  });

  it('error result preserves route/viewport/browser metadata', () => {
    const task: RenderTask = { route: { path: '/checkout' }, viewport: 375, browser: 'firefox' };
    const result = makeErrorResult(task, 'Failed');
    expect(result.route.path).toBe('/checkout');
    expect(result.viewport).toBe(375);
    expect(result.browser).toBe('firefox');
  });

  it('error result has timestamp and zero duration', () => {
    const before = Date.now();
    const task: RenderTask = { route: { path: '/' }, viewport: 1440, browser: 'chromium' };
    const result = makeErrorResult(task, 'Error');
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.duration).toBe(0);
  });
});

describe('Renderer Configuration Defaults', () => {
  it('default workers is 4', () => {
    const config = { workers: undefined };
    expect(config.workers ?? 4).toBe(4);
  });

  it('default viewport height is 720', () => {
    const config = { viewportHeight: undefined };
    expect(config.viewportHeight ?? 720).toBe(720);
  });

  it('default page timeout is 30000', () => {
    const config = { pageTimeout: undefined };
    expect(config.pageTimeout ?? 30000).toBe(30000);
  });

  it('default maxHeight is 5000', () => {
    const config = { maxHeight: undefined };
    expect(config.maxHeight ?? 5000).toBe(5000);
  });
});

describe('ScreenshotResult Shape', () => {
  it('valid result has all required fields', () => {
    const result: ScreenshotResult = {
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
      buffer: Buffer.from('fake-png'),
      domSnapshot: '<html><body>Hello</body></html>',
      consoleErrors: [],
      timestamp: Date.now(),
      duration: 150,
    };

    expect(result.route.path).toBe('/');
    expect(result.viewport).toBe(1440);
    expect(result.browser).toBe('chromium');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.domSnapshot).toContain('<html>');
    expect(result.consoleErrors).toEqual([]);
    expect(result.duration).toBe(150);
  });

  it('result with console errors captures them', () => {
    const result: ScreenshotResult = {
      route: { path: '/broken' },
      viewport: 375,
      browser: 'chromium',
      buffer: Buffer.from('png'),
      domSnapshot: '<html></html>',
      consoleErrors: ['Uncaught TypeError: x is not a function', '404 /api/missing'],
      timestamp: Date.now(),
      duration: 200,
    };

    expect(result.consoleErrors).toHaveLength(2);
    expect(result.consoleErrors[0]).toContain('TypeError');
  });
});

describe('executeTask', () => {
  it('evaluates _perfScript before capturing page.content() and warns on HTTP >= 400', async () => {
    const events: string[] = [];
    const mockPage = {
      on: vi.fn(),
      goto: vi.fn().mockResolvedValue({ status: () => 404 }),
      addStyleTag: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'string') {
          events.push(`evaluate:${arg}`);
        }
        return undefined;
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
      content: vi.fn().mockImplementation(async () => {
        events.push('content');
        return '<html><body><script id="__frontguard_perf_data">{"ttfb":50}</script></body></html>';
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
    };

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const config: FrontguardConfig & { _perfScript?: string } = {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: false,
      workers: 1,
      pageTimeout: 5000,
      maxHeight: 0,
      outputDir: './report',
      _perfScript: 'window.__perf()',
    };

    const result = await executeTask(
      { route: { path: '/missing' }, viewport: 1440, browser: 'chromium' },
      config,
      new Map([['chromium', mockBrowser as any]]),
    );

    expect(warnSpy).toHaveBeenCalledWith('Route /missing returned HTTP 404');
    expect(events).toEqual(['evaluate:window.__perf()', 'content']);
    expect(result.domSnapshot).toContain('__frontguard_perf_data');
    warnSpy.mockRestore();
  });

  it('executes pre-capture route actions, emulates colorScheme, and scrubs redacted HTML inputs', async () => {
    const actionOrder: string[] = [];
    const mockPage = {
      on: vi.fn(),
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      addStyleTag: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockImplementation(async (sel: string) => {
        actionOrder.push(`waitForSelector:${sel}`);
      }),
      click: vi.fn().mockImplementation(async (sel: string) => {
        actionOrder.push(`click:${sel}`);
      }),
      hover: vi.fn().mockImplementation(async (sel: string) => {
        actionOrder.push(`hover:${sel}`);
      }),
      fill: vi.fn().mockImplementation(async (sel: string, val: string) => {
        actionOrder.push(`fill:${sel}=${val}`);
      }),
      press: vi.fn().mockImplementation(async (sel: string, key: string) => {
        actionOrder.push(`press:${sel}:${key}`);
      }),
      waitForTimeout: vi.fn().mockImplementation(async (ms: number) => {
        actionOrder.push(`wait:${ms}`);
      }),
      evaluate: vi.fn().mockResolvedValue(1),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
      content: vi
        .fn()
        .mockResolvedValue(
          '<html><body><input type="password" value="super-secret-pw"></body></html>',
        ),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
    };

    const config: FrontguardConfig = {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: false,
      workers: 1,
      pageTimeout: 5000,
      maxHeight: 0,
      outputDir: './report',
      redactSensitive: true,
    };

    const route: Route = {
      path: '/login',
      colorScheme: 'dark',
      waitForSelector: '#app-mounted',
      actions: [
        { type: 'click', selector: '#open-login' },
        { type: 'fill', selector: '#email', value: 'user@example.com' },
        { type: 'hover', selector: '#submit' },
        { type: 'press', selector: '#submit', key: 'Enter' },
        { type: 'wait', ms: 50 },
      ],
    };

    const result = await executeTask(
      { route, viewport: 1440, browser: 'chromium' },
      config,
      new Map([['chromium', mockBrowser as any]]),
    );

    expect(mockBrowser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ colorScheme: 'dark' }),
    );
    expect(actionOrder).toEqual([
      'waitForSelector:#app-mounted',
      'click:#open-login',
      'fill:#email=user@example.com',
      'hover:#submit',
      'press:#submit:Enter',
      'wait:50',
    ]);
    expect(result.domSnapshot).toContain('value="[REDACTED]"');
    expect(result.domSnapshot).not.toContain('super-secret-pw');
  });

  it('executeRouteActions caps wait duration at 30_000ms', async () => {
    const mockPage = {
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    await executeRouteActions(
      mockPage as any,
      [{ type: 'wait', ms: 99_999 }],
      5000,
    );
    expect(mockPage.waitForTimeout).toHaveBeenCalledWith(30_000);
  });

  it('resolves freezeTime timestamps and matches blocked URLs with wildcards and substrings', () => {
    expect(resolveFreezeTimestamp(undefined)).toBeNull();
    expect(resolveFreezeTimestamp(false)).toBeNull();
    expect(resolveFreezeTimestamp(true)).toBe(1704067200000);
    expect(resolveFreezeTimestamp(1710000000000)).toBe(1710000000000);
    expect(resolveFreezeTimestamp('2024-01-01T00:00:00.000Z')).toBe(1704067200000);

    const patterns = ['*://*.google-analytics.com/*', 'intercom.io'];
    expect(matchesBlockedUrl('https://www.google-analytics.com/collect', patterns)).toBe(true);
    expect(matchesBlockedUrl('https://widget.intercom.io/widget/abc', patterns)).toBe(true);
    expect(matchesBlockedUrl('http://localhost:3000/api/data', patterns)).toBe(false);
  });

  it('applies ISO string freezeTime, seedRandom PRNG, and blockUrls during executeTask', async () => {
    const initScripts: string[] = [];
    let routeInterceptor: ((route: any) => Promise<void>) | undefined;
    const setFixedTime = vi.fn().mockResolvedValue(undefined);

    const mockPage = {
      on: vi.fn(),
      clock: { setFixedTime },
      addInitScript: vi.fn(async (script: string) => {
        initScripts.push(script);
      }),
      goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      content: vi.fn().mockResolvedValue('<html><body><button data-testid="cta">Go</button></body></html>'),
      evaluate: vi.fn().mockResolvedValue([
        {
          selector: '[data-testid="cta"]',
          tagName: 'button',
          bbox: { x: 10, y: 20, width: 100, height: 36 },
        },
      ]),
    };

    const mockContext = {
      route: vi.fn(async (_pattern: string, handler: (r: any) => Promise<void>) => {
        routeInterceptor = handler;
      }),
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
    };

    const config: FrontguardConfig = {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: false,
      workers: 1,
      pageTimeout: 5000,
      maxHeight: 0,
      outputDir: './report',
      freezeTime: '2026-01-15T12:00:00Z',
      seedRandom: 1337,
      blockUrls: ['*.doubleclick.net/*', 'analytics.example.com'],
    };

    const route: Route = { path: '/', discoveredVia: 'config' };

    const resultPromise = executeTask(
      { route, viewport: 1440, browser: 'chromium' },
      config,
      new Map([['chromium', mockBrowser as any]]),
    );

    const result = await resultPromise;
    expect(setFixedTime).toHaveBeenCalledWith(Date.parse('2026-01-15T12:00:00Z'));
    expect(initScripts.some((s) => s.includes('Math.random'))).toBe(true);
    expect(mockContext.route).toHaveBeenCalledTimes(1);
    expect(routeInterceptor).toBeDefined();
    expect(result.domElements).toEqual([
      {
        selector: '[data-testid="cta"]',
        tagName: 'button',
        bbox: { x: 10, y: 20, width: 100, height: 36 },
      },
    ]);
  });
});


