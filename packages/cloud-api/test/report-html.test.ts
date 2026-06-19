/**
 * SEC-7 — cloud report HTML must escape all interpolated result fields.
 */
import { describe, it, expect } from 'vitest';
import { generateReportHtml } from '../src/report-html.js';
import type { Run } from '../src/types.js';

function makeRun(results: Run['results']): Run {
  return {
    id: 'run-sec7',
    status: 'completed',
    url: 'https://example.com',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.01,
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
});