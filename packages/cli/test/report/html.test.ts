import { describe, it, expect, vi } from 'vitest';
import { HTMLReporter } from '../../src/report/html.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, createTestPng } from '../fixtures/helpers.js';
import type { RunResult, DiffResult, FrontguardConfig } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<FrontguardConfig>): FrontguardConfig {
  return {
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
    outputDir: '/tmp/frontguard-test-report',
    ...overrides,
  };
}

function makeDiff(overrides?: Partial<DiffResult>): DiffResult {
  return {
    route: { path: '/home', label: 'Home' },
    viewport: 1440,
    browser: 'chromium',
    status: 'pass',
    diffPercentage: 0,
    ...overrides,
  };
}

function makeRunResult(diffs: DiffResult[], overrides?: Partial<RunResult>): RunResult {
  const passed = diffs.filter((d) => d.status === 'pass').length;
  const regressions = diffs.filter((d) => d.status === 'regression').length;
  const warnings = diffs.filter((d) => d.status === 'changed').length;
  const newPages = diffs.filter((d) => d.status === 'new').length;
  const errors = diffs.filter((d) => d.status === 'error').length;

  return {
    summary: {
      total: diffs.length,
      passed,
      regressions,
      warnings,
      newPages,
      errors,
    },
    diffs,
    timing: { discovery: 100, render: 500, compare: 200, ai: 0, total: 800 },
    config: makeConfig(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HTMLReporter', () => {
  it('generateReport produces valid HTML structure', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('report contains route names from results', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/about' } }),
      makeDiff({ route: { path: '/pricing' } }),
    ]);
    const html = reporter.generateReport(result);

    expect(html).toContain('/about');
    expect(html).toContain('/pricing');
  });

  it('report contains status indicators', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({ status: 'pass' }),
      makeDiff({ route: { path: '/broken' }, status: 'regression', diffPercentage: 5.5 }),
    ]);
    const html = reporter.generateReport(result);

    // Check for status icon spans
    expect(html).toContain('icon-pass');
    expect(html).toContain('icon-regression');
    expect(html).toContain('✓');
    expect(html).toContain('✘');
  });

  it('empty results produce valid HTML without crash', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([]);
    const html = reporter.generateReport(result);

    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    // Should still have the header and structure
    expect(html).toContain('Frontguard');
  });

  it('error state renders error banner', () => {
    const reporter = new HTMLReporter();
    // Trigger the error capture
    reporter.onError(new Error('Network timeout'));
    reporter.onError(new Error('DNS resolution failed'));

    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    expect(html).toContain('error-banner');
    expect(html).toContain('Network timeout');
    expect(html).toContain('DNS resolution failed');
    expect(html).toContain('Pipeline Error');
  });

  it('no error banner when no errors occurred', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    // The CSS class definitions exist in styles, but the actual banner div should not render
    expect(html).not.toContain('<div class="error-banner">');
    expect(html).not.toContain('Pipeline Error');
  });

  it('report includes filter buttons with ARIA labels', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    expect(html).toContain('aria-label="Filter routes by status"');
    expect(html).toContain('aria-label="Show all routes"');
    expect(html).toContain('aria-label="Show regressions only"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Route list"');
  });

  it('report includes empty filter state element', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    expect(html).toContain('empty-filter-state');
    expect(html).toContain('No routes match this filter');
  });

  it('report renders image data URIs when buffers provided', () => {
    const png = createTestPng(10, 10, 255, 0, 0);
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({
        baselineImage: png,
        currentImage: png,
        diffImage: png,
      }),
    ]);
    const html = reporter.generateReport(result);

    expect(html).toContain('data:image/png;base64,');
  });

  it.each([
    ['routes that sanitize alike', '/products/a', '/products:a'],
    [
      'routes with the same long filename prefix',
      `/${'a'.repeat(70)}-first`,
      `/${'a'.repeat(70)}-second`,
    ],
  ])('writes distinct image files for %s', (_description, firstRoute, secondRoute) => {
    const firstImage = createTestPng(2, 2, 255, 0, 0);
    const secondImage = createTestPng(2, 2, 0, 0, 255);
    const { dir, cleanup } = createTempDir();

    try {
      const reporter = new HTMLReporter();
      const result = makeRunResult(
        [
          makeDiff({ route: { path: firstRoute }, currentImage: firstImage }),
          makeDiff({ route: { path: secondRoute }, currentImage: secondImage }),
        ],
        { config: makeConfig({ outputDir: dir }) },
      );

      reporter.writeReport(result, dir);

      const imageFiles = readdirSync(join(dir, 'images')).filter((name) => name.endsWith('.png'));
      const imageContents = imageFiles.map((name) => readFileSync(join(dir, 'images', name)).toString('base64'));
      expect(imageFiles).toHaveLength(2);
      expect(new Set(imageContents)).toEqual(
        new Set([firstImage.toString('base64'), secondImage.toString('base64')]),
      );
    } finally {
      cleanup();
    }
  });

  it('propagates report write failures', async () => {
    const reporter = new HTMLReporter();
    vi.spyOn(reporter, 'writeReport').mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(reporter.onComplete(makeRunResult([makeDiff()]))).rejects.toThrow('disk full');
  });

  it('report includes AI analysis when present', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 3.2,
        aiAnalysis: {
          classification: 'regression',
          explanation: 'Button color changed from blue to red',
          severity: 'critical',
          confidence: 0.95,
          suggestedFix: 'Revert CSS change in button.css',
        },
      }),
    ]);
    const html = reporter.generateReport(result);

    expect(html).toContain('AI Analysis');
    expect(html).toContain('Button color changed from blue to red');
    expect(html).toContain('Revert CSS change in button.css');
    expect(html).toContain('95%');
  });

  it('report escapes HTML in route paths', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({ route: { path: '/page?q=<script>alert(1)</script>' } }),
    ]);
    const html = reporter.generateReport(result);

    // Should be escaped
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('report includes timing footer', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff()]);
    const html = reporter.generateReport(result);

    expect(html).toContain('Completed in');
    expect(html).toContain('Discovery');
    expect(html).toContain('Render');
  });

  it('report renders judgements section when judgements are present', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([], {
      judgements: [
        {
          route: { path: '/pricing', label: 'Pricing' },
          viewport: 375,
          browser: 'chromium',
          pass: false,
          confidence: 0.9,
          issues: [
            {
              category: 'overflow',
              severity: 'critical',
              description: 'Card overflows horizontally',
            },
          ],
          withDesignReference: true,
        },
      ],
    });
    const html = reporter.generateReport(result);

    expect(html).toContain('id="judgements-section"');
    expect(html).toContain('Judge Verdicts');
    expect(html).toContain('/pricing');
    expect(html).toContain('Card overflows horizontally');
  });

  it('renders route search input and keyboard shortcut hints in sidebar', () => {
    const reporter = new HTMLReporter();
    const result = makeRunResult([makeDiff({ route: { path: '/checkout' } })]);
    const html = reporter.generateReport(result);

    expect(html).toContain('id="route-search"');
    expect(html).toContain('aria-label="Search routes"');
    expect(html).toContain('data-route="/checkout"');
    expect(html).toContain('sidebar-shortcuts');
    expect(html).toContain('<kbd>j</kbd>/<kbd>k</kbd>');
  });

  it('renders 4-mode interactive comparison switcher with swipe and onion sliders when baseline and current images exist', () => {
    const png = createTestPng(12, 12, 200, 100, 50);
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 4.2,
        baselineImage: png,
        currentImage: png,
        diffImage: png,
      }),
    ]);
    const html = reporter.generateReport(result);

    expect(html).toContain('view-mode-toolbar');
    expect(html).toContain('data-view-mode="side-by-side"');
    expect(html).toContain('data-view-mode="swipe"');
    expect(html).toContain('data-view-mode="onion"');
    expect(html).toContain('data-view-mode="diff"');
    expect(html).toContain('swipe-slider');
    expect(html).toContain('onion-slider');
  });

  it('renders diff clusters inspector panel, Chroma SSIM / CW-SSIM metrics, and unsettled frame stability banner', () => {
    const png = createTestPng(16, 16, 255, 0, 0);
    const reporter = new HTMLReporter();
    const result = makeRunResult([
      makeDiff({
        status: 'regression',
        diffPercentage: 3.75,
        ssim: 0.942,
        baselineImage: png,
        currentImage: png,
        diffImage: png,
        redactedCount: 2,
        stability: {
          settled: false,
          attempts: 4,
          unstableRatio: 0.0145,
          motionClusters: [
            {
              id: 1,
              bbox: { x: 10, y: 20, width: 120, height: 48 },
              rawDiffPixels: 84,
              area: 5760,
              density: 0.0145,
              centroid: { x: 70, y: 44 },
            },
          ],
        },
        clusters: [
          {
            id: 1,
            bbox: { x: 40, y: 80, width: 64, height: 32 },
            rawDiffPixels: 512,
            area: 2048,
            density: 0.25,
            centroid: { x: 72, y: 96 },
            chromaSSIM: 0.612,
            cwSSIM: 0.784,
          },
        ],
      }),
    ]);
    const html = reporter.generateReport(result);

    expect(html).toContain('1 cluster');
    expect(html).toContain('SSIM 94.2%');
    expect(html).toContain('🔒 2 redacted');
    expect(html).toContain('stability-banner');
    expect(html).toContain('1.45% unstable pixels');
    expect(html).toContain('(10, 20, 120×48)');
    expect(html).toContain('clusters-panel');
    expect(html).toContain('Chroma SSIM');
    expect(html).toContain('CW-SSIM');
    expect(html).toContain('61.2%');
    expect(html).toContain('78.4%');
    expect(html).toContain('(40, 80) 64×32px');
    expect(html).toContain('toggle-bboxes-btn');
    expect(html).toContain('data-clusters=');
  });
});
