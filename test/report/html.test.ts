import { describe, it, expect } from 'vitest';
import { HTMLReporter } from '../../src/report/html.js';
import { createTestPng } from '../fixtures/helpers.js';
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
});
