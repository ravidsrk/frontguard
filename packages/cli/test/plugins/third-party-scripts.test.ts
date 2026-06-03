import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createThirdPartyScriptPlugin,
  extractScriptOrigins,
  diffScriptInventory,
} from '../../src/plugins/third-party-scripts.js';
import type { PluginContext } from '../../src/core/plugins.js';
import type { ScreenshotResult, RunResult, RunTiming } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    config: {
      version: 1,
      baseUrl: 'https://shop.example.com',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 4,
      pageTimeout: 30000,
      maxHeight: 5000,
      outputDir: './frontguard-report',
    },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    metadata: new Map(),
    ...overrides,
  };
}

function makeScreenshot(routePath: string, viewport: number, html: string): ScreenshotResult {
  return {
    route: { path: routePath, label: routePath },
    viewport,
    browser: 'chromium',
    buffer: Buffer.from('fake-png'),
    domSnapshot: html,
    consoleErrors: [],
    timestamp: 0,
    duration: 100,
  };
}

function makeRunResult(): RunResult {
  const timing: RunTiming = { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 };
  return {
    summary: { total: 1, passed: 1, regressions: 0, warnings: 0, newPages: 0, errors: 0 },
    diffs: [],
    timing,
    config: makeContext().config,
  };
}

// ---------------------------------------------------------------------------
// extractScriptOrigins
// ---------------------------------------------------------------------------

describe('extractScriptOrigins', () => {
  it('classifies first-party vs third-party by origin', () => {
    const html = `
      <script src="/static/app.js"></script>
      <script src="https://shop.example.com/vendor.js"></script>
      <script src="https://www.googletagmanager.com/gtag/js"></script>
      <script src="//cdn.ads.io/widget.js"></script>
    `;
    const { firstParty, thirdParty } = extractScriptOrigins(html, 'https://shop.example.com');
    expect(firstParty).toEqual(['https://shop.example.com']);
    expect(thirdParty).toEqual(['https://cdn.ads.io', 'https://www.googletagmanager.com']);
  });

  it('ignores inline scripts and unparseable srcs, de-duplicates origins', () => {
    const html = `
      <script>console.log('inline')</script>
      <script src="https://analytics.io/a.js"></script>
      <script src="https://analytics.io/b.js"></script>
      <script src="data:text/javascript,void(0)"></script>
    `;
    const { thirdParty } = extractScriptOrigins(html, 'https://shop.example.com');
    expect(thirdParty).toEqual(['https://analytics.io']);
  });
});

// ---------------------------------------------------------------------------
// diffScriptInventory
// ---------------------------------------------------------------------------

describe('diffScriptInventory', () => {
  it('reports added and removed origins, order-independent', () => {
    const prev = ['https://a.com', 'https://b.com'];
    const curr = ['https://b.com', 'https://c.com'];
    expect(diffScriptInventory(prev, curr)).toEqual({
      added: ['https://c.com'],
      removed: ['https://a.com'],
    });
  });

  it('returns empty diffs when inventories match', () => {
    expect(diffScriptInventory(['https://a.com'], ['https://a.com'])).toEqual({
      added: [],
      removed: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin: baseline then change detection across runs
// ---------------------------------------------------------------------------

describe('createThirdPartyScriptPlugin', () => {
  let historyDir: string;
  afterEach(() => {
    if (historyDir) rmSync(historyDir, { recursive: true, force: true });
  });

  it('establishes a baseline on first run (no diff), then detects added scripts', () => {
    historyDir = mkdtempSync(join(tmpdir(), 'fg-tps-'));
    const baseUrl = 'https://shop.example.com';

    // --- Run 1: baseline ---
    const p1 = createThirdPartyScriptPlugin({ historyDir });
    const ctx1 = makeContext({ config: { ...makeContext().config, baseUrl } });
    p1.afterRender!(
      [makeScreenshot('/', 1440, '<script src="https://analytics.io/a.js"></script>')],
      ctx1,
    );
    const r1 = makeRunResult();
    p1.afterRun!(r1, ctx1);
    expect(r1.thirdPartyScripts?.[0].added).toEqual([]);
    expect(r1.thirdPartyScripts?.[0].removed).toEqual([]);
    expect(r1.thirdPartyScripts?.[0].current).toEqual(['https://analytics.io']);

    // --- Run 2: an ad network appears ---
    const p2 = createThirdPartyScriptPlugin({ historyDir });
    const ctx2 = makeContext({ config: { ...makeContext().config, baseUrl } });
    p2.afterRender!(
      [
        makeScreenshot(
          '/',
          1440,
          '<script src="https://analytics.io/a.js"></script><script src="https://ads.network/x.js"></script>',
        ),
      ],
      ctx2,
    );
    const r2 = makeRunResult();
    p2.afterRun!(r2, ctx2);
    expect(r2.thirdPartyScripts?.[0].added).toEqual(['https://ads.network']);
    expect(r2.thirdPartyScripts?.[0].removed).toEqual([]);
  });
});
