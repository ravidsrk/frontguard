/**
 * SEC-7 — cloud report HTML must escape all interpolated result fields.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml } from '../src/report-html.js';
import type { Run } from '../src/types.js';

function makeRun(results: Run['results'], threshold = 0.01): Run {
  return {
    id: 'run-sec7',
    status: 'completed',
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold,
    ai: null,
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    results,
    reportUrl: null,
  };
}

describe('generateReportHtml (SEC-7)', () => {
  it('escapes crafted status and classification containing script/HTML', () => {
    const payload = '<script>alert(1)</script>';
    const html = generateReportHtml(
      makeRun([
        {
          route: '/',
          viewport: 1440,
          status: payload,
          classification: payload,
          diffPercentage: 0,
          timestamp: payload,
        },
      ]),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.match(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g)?.length).toBe(3);
  });

  it('treats exact percentage equality as within threshold', () => {
    const html = generateReportHtml(
      makeRun([
        {
          route: '/',
          viewport: 1440,
          status: 'changed',
          diffPercentage: 29,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ], 0.29),
    );

    expect(html).toContain('<td class="diff-pass">29.00%</td>');
    expect(html).toContain('<div class="num diff-pass">0</div>');
  });
});
