import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffResult, FrontguardConfig, Reporter, ScreenshotResult } from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  analyzeWithAI: vi.fn(),
  storageConstructor: vi.fn(),
  init: vi.fn(),
  readBaseline: vi.fn(),
}));

vi.mock('../../src/render/playwright.js', () => ({ renderPages: mocks.renderPages }));
vi.mock('../../src/diff/pixel.js', () => ({
  compareScreenshot: mocks.compareScreenshot,
  createNewPageResult: vi.fn(),
}));
vi.mock('../../src/diff/ai-vision.js', () => ({ analyzeWithAI: mocks.analyzeWithAI }));
vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    constructor(...args: unknown[]) {
      mocks.storageConstructor(...args);
    }
    init = mocks.init;
    readBaseline = mocks.readBaseline;
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runPipeline } from '../../src/core/pipeline.js';

function screenshot(): ScreenshotResult {
  return {
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    buffer: Buffer.from('current'),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 10,
  };
}

function config(): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.03,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    ignore: [],
    smartRender: false,
    outputDir: '/tmp/frontguard-ssim-config-test',
    ssimFallback: false,
    ssimThreshold: 0.91,
  };
}

function reporter(): Reporter {
  return {
    onStageStart: vi.fn(),
    onStageProgress: vi.fn(),
    onStageComplete: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderPages.mockResolvedValue([screenshot()]);
  mocks.init.mockResolvedValue(undefined);
  mocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
  mocks.compareScreenshot.mockReturnValue({
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    status: 'regression',
    diffPercentage: 4,
  } satisfies DiffResult);
  mocks.analyzeWithAI.mockResolvedValue({
    classification: 'regression',
    explanation: 'Visual regression',
    severity: 'critical',
    confidence: 0.9,
  });
});

describe('pipeline SSIM configuration', () => {
  it('initializes comparison storage in compare mode', async () => {
    await runPipeline(config(), reporter());

    expect(mocks.storageConstructor).toHaveBeenCalledWith(process.cwd(), undefined, 'compare');
  });

  it('propagates baseline initialization failures before reading screenshots', async () => {
    mocks.init.mockRejectedValue(new Error('origin/frontguard-baselines is unavailable'));

    await expect(runPipeline(config(), reporter())).rejects.toThrow(
      'origin/frontguard-baselines is unavailable',
    );
    expect(mocks.readBaseline).not.toHaveBeenCalled();
  });

  it('forwards the public SSIM controls to the comparison engine', async () => {
    await runPipeline(config(), reporter());

    expect(mocks.compareScreenshot).toHaveBeenCalledOnce();
    expect(mocks.compareScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ route: { path: '/' } }),
      Buffer.from('baseline'),
      0.03,
      { enabled: false, ssimThreshold: 0.91 },
    );
  });

  it('turns rejected AI analysis into a reported tool error', async () => {
    mocks.analyzeWithAI.mockRejectedValue(new Error('provider unavailable'));
    const aiConfig = config();
    aiConfig.ai = { provider: 'openai', model: 'gpt-4o' };
    const output = reporter();

    const result = await runPipeline(aiConfig, output);

    expect(result.diffs[0]).toMatchObject({
      status: 'error',
      error: 'AI analysis failed: provider unavailable',
    });
    expect(result.summary.errors).toBe(1);
    expect(output.onStageComplete).toHaveBeenCalledWith(
      'analyze',
      expect.stringContaining('1 failed'),
    );
  });

  it('does not reclassify an exact 29% boundary because of ratio rounding', async () => {
    mocks.compareScreenshot.mockReturnValue({
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
      status: 'changed',
      diffPercentage: 29,
    } satisfies DiffResult);
    const boundaryConfig = config();
    boundaryConfig.threshold = 0.29;

    const result = await runPipeline(boundaryConfig, reporter());

    expect(result.diffs[0].status).toBe('changed');
    expect(result.summary.regressions).toBe(0);
    expect(result.summary.warnings).toBe(1);
  });
});
