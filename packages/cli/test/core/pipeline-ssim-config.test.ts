import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffResult, FrontguardConfig, Reporter, ScreenshotResult } from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  init: vi.fn(),
  readBaseline: vi.fn(),
}));

vi.mock('../../src/render/playwright.js', () => ({ renderPages: mocks.renderPages }));
vi.mock('../../src/diff/pixel.js', () => ({
  compareScreenshot: mocks.compareScreenshot,
  createNewPageResult: vi.fn(),
}));
vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
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
});

describe('pipeline SSIM configuration', () => {
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
