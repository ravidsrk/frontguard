/**
 * Integration tests for runJudgePipeline (src/core/pipeline.ts).
 *
 * Mocks the render, judge, and figma modules so the orchestration logic —
 * discovery fallback, render failure handling, batched judging, reference
 * caching, and summary mapping — is exercised without a browser or network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  FrontguardConfig,
  Reporter,
  ScreenshotResult,
  JudgeResult,
  RunResult,
} from '../../src/core/types.js';

const { renderPages, judgeScreenshot, fetchDesignReference } = vi.hoisted(() => ({
  renderPages: vi.fn(),
  judgeScreenshot: vi.fn(),
  fetchDesignReference: vi.fn(),
}));

vi.mock('../../src/render/playwright.js', () => ({ renderPages }));
vi.mock('../../src/diff/model-judge.js', () => ({ judgeScreenshot }));
vi.mock('../../src/plugins/figma.js', () => ({ fetchDesignReference }));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runJudgePipeline } from '../../src/core/pipeline.js';

function makeConfig(overrides: Partial<FrontguardConfig> = {}): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    workers: 2,
    pageTimeout: 30000,
    maxHeight: 5000,
    ignore: [],
    smartRender: false,
    outputDir: '/tmp/fg-judge-test',
    routes: [{ path: '/' }, { path: '/pricing' }],
    ai: { provider: 'openai', model: 'gpt-4o' },
    ...overrides,
  };
}

function makeReporter(): Reporter & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    onStageStart: (s) => events.push(`start:${s}`),
    onStageProgress: () => {},
    onStageComplete: (s) => events.push(`complete:${s}`),
    onComplete: () => events.push('done'),
  };
}

function shot(path: string, viewport = 1440): ScreenshotResult {
  return {
    route: { path },
    viewport,
    browser: 'chromium',
    buffer: Buffer.from('x'),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 10,
  };
}

function verdict(path: string, pass: boolean, extra: Partial<JudgeResult> = {}): JudgeResult {
  return {
    route: { path },
    viewport: 1440,
    browser: 'chromium',
    pass,
    confidence: 0.9,
    issues: [],
    withDesignReference: false,
    ...extra,
  };
}

beforeEach(() => {
  renderPages.mockReset();
  judgeScreenshot.mockReset();
  fetchDesignReference.mockReset();
});

describe('runJudgePipeline', () => {
  it('throws when no AI config is present', async () => {
    await expect(runJudgePipeline(makeConfig({ ai: undefined }), makeReporter())).rejects.toThrow(/Judge mode requires AI/);
  });

  it('judges all screenshots and maps the summary', async () => {
    renderPages.mockResolvedValue([shot('/'), shot('/pricing')]);
    judgeScreenshot
      .mockResolvedValueOnce(verdict('/', true))
      .mockResolvedValueOnce(
        verdict('/pricing', false, {
          issues: [{ category: 'overflow', severity: 'critical', description: 'clipped' }],
        }),
      );

    const reporter = makeReporter();
    const result: RunResult = await runJudgePipeline(makeConfig(), reporter);

    expect(judgeScreenshot).toHaveBeenCalledTimes(2);
    expect(result.judgements).toHaveLength(2);
    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.regressions).toBe(1); // failing verdict → regression
    expect(reporter.events).toContain('done');
  });

  it('counts warning-only passes in the warnings tally', async () => {
    renderPages.mockResolvedValue([shot('/')]);
    judgeScreenshot.mockResolvedValue(
      verdict('/', true, { issues: [{ category: 'spacing', severity: 'warning', description: 'tight' }] }),
    );
    const result = await runJudgePipeline(makeConfig({ routes: [{ path: '/' }] }), makeReporter());
    expect(result.summary.warnings).toBe(1);
    expect(result.summary.passed).toBe(1);
  });

  it('counts error verdicts in the errors tally', async () => {
    renderPages.mockResolvedValue([shot('/')]);
    judgeScreenshot.mockResolvedValue(verdict('/', false, { error: 'API down', confidence: 0 }));
    const result = await runJudgePipeline(makeConfig({ routes: [{ path: '/' }] }), makeReporter());
    expect(result.summary.errors).toBe(1);
    expect(result.summary.regressions).toBe(0); // errors are not regressions
  });

  it('returns an empty result when render captures nothing', async () => {
    renderPages.mockResolvedValue([]);
    const result = await runJudgePipeline(makeConfig(), makeReporter());
    expect(result.judgements).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(judgeScreenshot).not.toHaveBeenCalled();
  });

  it('handles a render failure gracefully (empty result, no throw)', async () => {
    renderPages.mockRejectedValue(new Error('browser crash'));
    const result = await runJudgePipeline(makeConfig(), makeReporter());
    expect(result.summary.total).toBe(0);
  });

  it('fetches Figma references and passes them to the judge', async () => {
    renderPages.mockResolvedValue([shot('/', 1440)]);
    fetchDesignReference.mockResolvedValue(Buffer.from('design'));
    judgeScreenshot.mockResolvedValue(verdict('/', true, { withDesignReference: true }));

    await runJudgePipeline(
      makeConfig({
        routes: [{ path: '/' }],
        viewports: [1440],
        judge: { figmaFileKey: 'fk', figmaPages: { '/': '1:2' } },
      }),
      makeReporter(),
    );

    expect(fetchDesignReference).toHaveBeenCalledWith(
      expect.objectContaining({ fileKey: 'fk' }),
      '/',
    );
    // The fetched reference buffer is forwarded to judgeScreenshot.
    expect(judgeScreenshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ figmaReference: expect.any(Buffer) }),
    );
  });

  it('caches Figma references across batches for the same route', async () => {
    // 6 same-route screenshots span two batches (AI_BATCH_SIZE = 5); the cache
    // dedupes the reference fetch from the 2nd batch onward.
    renderPages.mockResolvedValue(Array.from({ length: 6 }, () => shot('/', 1440)));
    fetchDesignReference.mockResolvedValue(Buffer.from('design'));
    judgeScreenshot.mockResolvedValue(verdict('/', true, { withDesignReference: true }));

    await runJudgePipeline(
      makeConfig({
        routes: [{ path: '/' }],
        judge: { figmaFileKey: 'fk', figmaPages: { '/': '1:2' } },
      }),
      makeReporter(),
    );

    // First batch of 5 races (all miss → 5 fetches); 2nd batch hits the cache.
    expect(fetchDesignReference.mock.calls.length).toBeLessThan(6);
    expect(judgeScreenshot).toHaveBeenCalledTimes(6);
  });

  it('does not fetch Figma when no judge config is set', async () => {
    renderPages.mockResolvedValue([shot('/')]);
    judgeScreenshot.mockResolvedValue(verdict('/', true));
    await runJudgePipeline(makeConfig({ routes: [{ path: '/' }] }), makeReporter());
    expect(fetchDesignReference).not.toHaveBeenCalled();
  });
});
