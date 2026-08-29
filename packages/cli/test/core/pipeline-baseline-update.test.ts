import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FrontguardConfig,
  Reporter,
  RunResult,
  ScreenshotResult,
} from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  init: vi.fn(),
  writeBaseline: vi.fn(),
  readManifest: vi.fn(),
  writeManifest: vi.fn(),
}));

vi.mock('../../src/render/playwright.js', () => ({
  renderPages: mocks.renderPages,
}));

vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    init = mocks.init;
    writeBaseline = mocks.writeBaseline;
    readManifest = mocks.readManifest;
    writeManifest = mocks.writeManifest;
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { updateBaselines } from '../../src/core/pipeline.js';

function config(): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.001,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    ignore: [],
    smartRender: false,
    outputDir: '/tmp/frontguard-baseline-update-test',
  };
}

function screenshot(): ScreenshotResult {
  return {
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    buffer: Buffer.from('valid-png'),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 10,
  };
}

function reporter(): Reporter & { completed: ReturnType<typeof vi.fn> } {
  const completed = vi.fn<(result: RunResult) => void>();
  return {
    completed,
    onStageStart: vi.fn(),
    onStageProgress: vi.fn(),
    onStageComplete: vi.fn(),
    onComplete: completed,
    onError: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderPages.mockResolvedValue([screenshot()]);
  mocks.init.mockResolvedValue(undefined);
  mocks.writeBaseline.mockResolvedValue(undefined);
  mocks.readManifest.mockResolvedValue(null);
  mocks.writeManifest.mockResolvedValue(undefined);
});

describe('updateBaselines', () => {
  it('returns and reports a machine-readable result for updated baselines', async () => {
    const output = reporter();

    const result = await updateBaselines(config(), output);

    expect(result).toMatchObject({
      summary: {
        total: 1,
        newPages: 1,
        regressions: 0,
        errors: 0,
      },
      diffs: [
        {
          route: { path: '/' },
          viewport: 1440,
          browser: 'chromium',
          status: 'new',
        },
      ],
    });
    expect(output.completed).toHaveBeenCalledOnce();
    expect(output.completed).toHaveBeenCalledWith(result);
  });

  it('fails the update when a baseline cannot be persisted', async () => {
    mocks.writeBaseline.mockRejectedValue(new Error('disk full'));
    const output = reporter();

    await expect(updateBaselines(config(), output)).rejects.toThrow(
      'Failed to write 1 of 1 baseline',
    );
    expect(output.completed).not.toHaveBeenCalled();
  });
});
