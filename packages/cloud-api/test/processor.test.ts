/**
 * Unit tests for processRun (src/processor.ts).
 *
 * Covers the simulated branch, the Daytona branch (via a mocked
 * daytona-runner), the report-fallback path, and the error path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Run } from '../src/types.js';

// Mock the Daytona runner so we never load the real SDK.
const executeInSandbox = vi.fn();
vi.mock('../src/daytona-runner.js', () => ({ executeInSandbox }));

import { processRun } from '../src/processor.js';

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run_1',
    url: 'https://example.com',
    routes: [{ path: '/' }, { path: '/pricing' }],
    viewports: [375, 1440],
    browsers: ['chromium'],
    threshold: 0.1,
    status: 'queued',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Run;
}

describe('processRun — simulated branch (no Daytona)', () => {
  const orig = process.env.DAYTONA_API_KEY;
  beforeEach(() => {
    delete process.env.DAYTONA_API_KEY;
    executeInSandbox.mockReset();
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.DAYTONA_API_KEY;
    else process.env.DAYTONA_API_KEY = orig;
  });

  it('produces a new_baseline result per route×viewport and completes', async () => {
    const run = makeRun();
    await processRun(run);
    expect(run.status).toBe('completed');
    expect(run.results).toHaveLength(4); // 2 routes × 2 viewports
    expect(run.results!.every((r) => r.status === 'new_baseline')).toBe(true);
    expect(run.reportHtml).toBeTruthy();
    expect(run.reportUrl).toBe('/v1/reports/run_1');
    expect(run.completedAt).toBeTruthy();
    expect(executeInSandbox).not.toHaveBeenCalled();
  });

  it('handles string routes', async () => {
    const run = makeRun({ routes: ['/'] as unknown as Run['routes'], viewports: [1440] });
    await processRun(run);
    expect(run.results![0].route).toBe('/');
  });
});

describe('processRun — Daytona branch', () => {
  const orig = process.env.DAYTONA_API_KEY;
  beforeEach(() => {
    process.env.DAYTONA_API_KEY = 'dt_key';
    executeInSandbox.mockReset();
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.DAYTONA_API_KEY;
    else process.env.DAYTONA_API_KEY = orig;
  });

  it('maps sandbox results and uses the sandbox report', async () => {
    executeInSandbox.mockResolvedValue({
      results: [
        { route: '/', viewport: 1440, status: 'changed', diffPercentage: 3.2, classification: 'regression', timestamp: 't1' },
      ],
      reportHtml: '<html>real report</html>',
    });
    const run = makeRun();
    await processRun(run);
    expect(executeInSandbox).toHaveBeenCalledOnce();
    expect(run.status).toBe('completed');
    expect(run.results).toHaveLength(1);
    expect(run.results![0].classification).toBe('regression');
    expect(run.reportHtml).toBe('<html>real report</html>');
  });

  it('falls back to generated report when sandbox returns placeholder', async () => {
    executeInSandbox.mockResolvedValue({
      results: [{ route: '/', viewport: 1440, status: 'unchanged', diffPercentage: 0 }],
      reportHtml: '<p>No report generated</p>',
    });
    const run = makeRun();
    await processRun(run);
    expect(run.reportHtml).not.toBe('<p>No report generated</p>');
    expect(run.reportHtml).toBeTruthy();
    // result without timestamp gets one assigned
    expect(run.results![0].timestamp).toBeTruthy();
  });

  it('marks the run failed when the sandbox throws', async () => {
    executeInSandbox.mockRejectedValue(new Error('sandbox boom'));
    const run = makeRun();
    await processRun(run);
    expect(run.status).toBe('failed');
    expect(run.error).toBe('sandbox boom');
  });
});
