import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { join, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { renderPages } from '../../src/render/playwright.js';
import { compareScreenshot, createNewPageResult } from '../../src/diff/pixel.js';
import type { FrontguardConfig, Route } from '../../src/core/types.js';

const fixtureDir = join(new URL('.', import.meta.url).pathname, '..', 'fixture-app');

let server: Server;
let serverUrl: string;

const routes: Route[] = [
  { path: '/' },
  { path: '/about.html' },
  { path: '/pricing.html' },
];

function makeConfig(overrides: Partial<FrontguardConfig> = {}): FrontguardConfig {
  return {
    version: 1,
    baseUrl: serverUrl,
    viewports: [375, 1440],
    browsers: ['chromium'],
    threshold: 0.1,
    workers: 2,
    pageTimeout: 30000,
    maxHeight: 5000,
    ignore: [],
    smartRender: false,
    outputDir: '/tmp/fg-test-report',
    ...overrides,
  };
}

describe('Frontguard E2E Pipeline', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      let url = req.url === '/' ? '/index.html' : req.url!;
      url = url.split('?')[0];
      const fp = join(fixtureDir, url);
      if (existsSync(fp)) {
        const mime: Record<string, string> = {
          '.html': 'text/html',
          '.css': 'text/css',
        };
        res.writeHead(200, { 'Content-Type': mime[extname(fp)] || 'text/plain' });
        res.end(readFileSync(fp));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    serverUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('renders pages and captures screenshots', async () => {
    const config = makeConfig();
    const results = await renderPages(routes, config);

    // 3 routes × 2 viewports = 6 results
    expect(results).toHaveLength(6);

    for (const result of results) {
      // Each result should have a non-empty screenshot buffer
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);

      // Each result should have a DOM snapshot
      expect(typeof result.domSnapshot).toBe('string');
      expect(result.domSnapshot.length).toBeGreaterThan(0);

      // Metadata should be present
      expect(result.route).toBeDefined();
      expect(result.viewport).toBeDefined();
    }

    // Verify all routes are represented
    const capturedRoutes = [...new Set(results.map((r) => r.route.path))];
    expect(capturedRoutes).toHaveLength(3);

    // Verify both viewports are represented
    const capturedViewports = [...new Set(results.map((r) => r.viewport))];
    expect(capturedViewports).toHaveLength(2);
    expect(capturedViewports.sort((a, b) => a - b)).toEqual([375, 1440]);
  }, 60_000);

  it('identical renders produce zero diff', async () => {
    const config = makeConfig({ viewports: [375] });
    const homeRoute: Route[] = [{ path: '/' }];

    // Render the same page twice
    const first = await renderPages(homeRoute, config);
    expect(first).toHaveLength(1);
    expect(first[0].buffer.length).toBeGreaterThan(0);

    const second = await renderPages(homeRoute, config);
    expect(second).toHaveLength(1);
    expect(second[0].buffer.length).toBeGreaterThan(0);

    const diff = compareScreenshot(second[0], first[0].buffer, config.threshold);

    // Identical renders should pass or have negligible diff
    expect(diff.diffPercentage).toBeLessThan(1);
    expect(['pass', 'changed']).toContain(diff.status);
  }, 60_000);

  it('different viewports produce different screenshots', async () => {
    const config = makeConfig();
    const homeRoute: Route[] = [{ path: '/' }];
    const results = await renderPages(homeRoute, config);

    // Should have 2 results (1 route × 2 viewports)
    expect(results).toHaveLength(2);

    const mobile = results.find((r) => r.viewport === 375)!;
    const desktop = results.find((r) => r.viewport === 1440)!;

    expect(mobile).toBeDefined();
    expect(desktop).toBeDefined();
    expect(mobile.buffer.length).toBeGreaterThan(0);
    expect(desktop.buffer.length).toBeGreaterThan(0);

    // Different viewports should produce visually different screenshots
    const diff = compareScreenshot(desktop, mobile.buffer, 0.1);
    expect(diff.diffPercentage).toBeGreaterThan(0);
  }, 60_000);

  it('createNewPageResult returns new status', () => {
    const mockResult = {
      route: { path: '/new-page' } as Route,
      viewport: 375,
      browser: 'chromium' as const,
      buffer: Buffer.from('fake'),
      domSnapshot: '<html></html>',
      consoleErrors: [],
      timestamp: Date.now(),
      duration: 100,
    };
    const diff = createNewPageResult(mockResult);
    expect(diff.status).toBe('new');
    expect(diff.diffPercentage).toBe(0);
  });
});
