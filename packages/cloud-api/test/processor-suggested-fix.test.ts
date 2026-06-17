/**
 * Regression test for mcp-2: a sandbox-produced `suggestedFix` must survive
 * the processor mapping into `run.results`.
 *
 * The processor previously mapped sandbox results to a fixed object literal
 * (route/viewport/status/diffPercentage/classification/timestamp) that
 * structurally could not carry `suggestedFix`, so every MCP `get_suggested_fix`
 * returned null even when AI vision produced a fix in the CLI.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Run } from '../src/types.js';

const executeInSandbox = vi.fn();
vi.mock('../src/daytona-runner.js', () => ({ executeInSandbox }));

import { processRun } from '../src/processor.js';

const SUGGESTED_FIX = {
  fixType: 'css',
  category: 'overflow-fix',
  patch: '.pricing-card { overflow: hidden; }',
  confidence: 0.82,
  explanation: 'Pricing card content overflowed at 1280px; clip overflow.',
  target: '.pricing-card',
} as const;

function makeRun(): Run {
  return {
    id: 'run_1',
    url: 'https://shop.example.com',
    routes: [{ path: '/pricing' }],
    viewports: [1280],
    browsers: ['chromium'],
    threshold: 0.05,
    status: 'queued',
    ai: { provider: 'openai', model: 'gpt-4o' },
    createdAt: new Date().toISOString(),
    results: null,
    reportUrl: null,
  } as Run;
}

describe('processRun — suggestedFix plumbing (mcp-2)', () => {
  beforeEach(() => executeInSandbox.mockReset());

  it('copies a populated suggestedFix through to run.results', async () => {
    executeInSandbox.mockResolvedValue({
      results: [
        {
          route: '/pricing',
          viewport: 1280,
          browser: 'chromium',
          status: 'regression',
          diffPercentage: 4.1,
          classification: 'regression',
          timestamp: 't1',
          suggestedFix: { ...SUGGESTED_FIX },
        },
      ],
      reportHtml: '<html>report</html>',
    });

    const run = makeRun();
    await processRun(run, { DAYTONA_API_KEY: 'dt_key' });

    expect(run.status).toBe('completed');
    expect(run.results).toHaveLength(1);
    expect(run.results![0].suggestedFix).toEqual(SUGGESTED_FIX);
  });

  it('leaves suggestedFix undefined when the sandbox produced none', async () => {
    executeInSandbox.mockResolvedValue({
      results: [
        { route: '/pricing', viewport: 1280, browser: 'chromium', status: 'pass', diffPercentage: 0, timestamp: 't2' },
      ],
      reportHtml: '<html>report</html>',
    });

    const run = makeRun();
    await processRun(run, { DAYTONA_API_KEY: 'dt_key' });

    expect(run.results![0].suggestedFix).toBeUndefined();
  });
});
