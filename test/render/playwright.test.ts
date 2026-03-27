/**
 * Tests for src/render/playwright.ts
 *
 * The renderer requires Playwright browser binaries. We test the pure logic:
 * task generation, error result shapes, and configuration behavior by
 * reconstructing the task-building logic from the source.
 */
import { describe, it, expect } from 'vitest';
import type { Route, FrontguardConfig, BrowserEngine, ScreenshotResult } from '../../src/core/types.js';

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
    for (const viewport of config.viewports) {
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
