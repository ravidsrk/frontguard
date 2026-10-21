import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontguardConfig, Reporter, RunResult, ScreenshotResult } from '../../src/core/types.js';
import { comparisonExitCode } from '../../src/cli/exit-code.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  storageConstructor: vi.fn(),
  init: vi.fn(),
  writeBaseline: vi.fn(),
  readManifest: vi.fn(),
  writeManifest: vi.fn(),
  readBaseline: vi.fn(),
  violations: [] as Array<{
    id: string;
    impact: string;
    description: string;
    help: string;
    helpUrl: string;
    nodes: [];
  }>,
}));

vi.mock('../../src/render/playwright.js', () => ({ renderPages: mocks.renderPages }));
vi.mock('../../src/diff/pixel.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/diff/pixel.js')>(
    '../../src/diff/pixel.js',
  );
  return { ...actual, compareScreenshot: mocks.compareScreenshot };
});
vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    constructor(...args: unknown[]) {
      mocks.storageConstructor(...args);
    }
    init = mocks.init;
    writeBaseline = mocks.writeBaseline;
    readManifest = mocks.readManifest;
    writeManifest = mocks.writeManifest;
    readBaseline = mocks.readBaseline;
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));
vi.mock('@axe-core/playwright', () => ({
  default: class {
    async analyze() {
      return { violations: mocks.violations, passes: [], incomplete: [] };
    }
  },
}));
vi.mock('playwright', () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({ goto: async () => {} }),
        close: async () => {},
      }),
      close: async () => {},
    }),
  },
}));

import { runPipeline, updateBaselines } from '../../src/core/pipeline.js';
import { createAccessibilityPlugin } from '../../src/plugins/accessibility.js';

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

function seriousViolation() {
  return {
    id: 'color-contrast',
    impact: 'serious',
    description: 'Insufficient contrast',
    help: 'Increase contrast',
    helpUrl: 'https://example.test/contrast',
    nodes: [] as [],
  };
}

function config(plugin?: { impact?: 'minor' | 'moderate' | 'serious' | 'critical'; failOnViolation?: boolean }): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    routes: [{ path: '/' }],
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    ignore: [],
    smartRender: false,
    outputDir: '/tmp/frontguard-a11y-baseline-test',
    ...(plugin ? { plugins: [createAccessibilityPlugin(plugin)] } : {}),
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
  mocks.violations = [];
  mocks.renderPages.mockResolvedValue([screenshot()]);
  mocks.init.mockResolvedValue(undefined);
  mocks.writeBaseline.mockResolvedValue(undefined);
  mocks.readManifest.mockResolvedValue(null);
  mocks.writeManifest.mockResolvedValue(undefined);
  mocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
  mocks.compareScreenshot.mockReturnValue({
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    status: 'regression',
    diffPercentage: 4,
  });
});

describe('updateBaselines accessibility block', () => {
  it('refuses a pixel-clean write when a serious violation is at the cutoff', async () => {
    mocks.violations = [seriousViolation()];
    const output = reporter();

    await expect(
      updateBaselines(config({ impact: 'serious', failOnViolation: true }), output),
    ).rejects.toThrow(
      'Accessibility check failed: 1 violation(s) at or above the configured impact threshold. Baselines were not written.',
    );

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.writeBaseline).not.toHaveBeenCalled();
    expect(output.completed).toHaveBeenCalledOnce();
    const reported = output.completed.mock.calls[0][0] as RunResult;
    expect(reported.diffs[0]?.status).toBe('new');
    expect(reported.summary.regressions).toBe(0);
    expect(reported.accessibility?.[0]?.violations[0]?.id).toBe('color-contrast');
  });

  it('writes when the violation is below the impact cutoff', async () => {
    mocks.violations = [seriousViolation()];

    const result = await updateBaselines(
      config({ impact: 'critical', failOnViolation: true }),
      reporter(),
    );

    expect(mocks.writeBaseline).toHaveBeenCalledOnce();
    expect(result.diffs[0]?.status).toBe('new');
    expect(result.summary.regressions).toBe(0);
  });

  it('writes a warning-only audit and keeps the pixel status', async () => {
    mocks.violations = [seriousViolation()];
    const output = reporter();

    const result = await updateBaselines(config({ impact: 'serious', failOnViolation: false }), output);

    expect(mocks.writeBaseline).toHaveBeenCalledOnce();
    expect(result.diffs[0]?.status).toBe('new');
    expect(result.accessibility?.[0]?.violations[0]?.id).toBe('color-contrast');
    expect(output.completed).toHaveBeenCalledWith(result);
  });

  it('writes when the audit is clean', async () => {
    const result = await updateBaselines(config({ failOnViolation: true }), reporter());

    expect(mocks.writeBaseline).toHaveBeenCalledOnce();
    expect(result.diffs[0]?.status).toBe('new');
    expect(result.summary.regressions).toBe(0);
  });
});

describe('pixelmatch regression with an accessibility plugin', () => {
  it('keeps a pixel regression when the audit is clean', async () => {
    const result = await runPipeline(config({ impact: 'serious', failOnViolation: true }), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.summary.regressions).toBe(1);
    expect(comparisonExitCode(result.summary)).toBe(1);
  });

  it('lists a violation beside a pixel regression without changing that status', async () => {
    mocks.violations = [seriousViolation()];

    const result = await runPipeline(config({ impact: 'serious', failOnViolation: false }), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.summary.regressions).toBe(1);
    expect(result.accessibility?.[0]?.violations[0]?.id).toBe('color-contrast');
    expect(comparisonExitCode(result.summary)).toBe(1);
  });
});
