/**
 * REL-5 — compare temp dirs must be unique and cleaned up on pipeline throw.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FrontguardConfig, Reporter, ScreenshotResult, FrontguardPlugin } from '../../src/core/types.js';

const tempDirs = vi.hoisted(() => ({
  created: [] as string[],
}));

const { renderPages } = vi.hoisted(() => ({
  renderPages: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  init: vi.fn(),
  readBaseline: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdtempSync(prefix: string, options?: Parameters<typeof actual.mkdtempSync>[1]) {
      const dir = actual.mkdtempSync(prefix, options);
      if (String(prefix).includes('frontguard-compare-')) {
        tempDirs.created.push(dir);
      }
      return dir;
    },
  };
});

vi.mock('../../src/render/playwright.js', () => ({ renderPages }));
vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    init = storage.init;
    readBaseline = storage.readBaseline;
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runPipeline, updateBaselines } from '../../src/core/pipeline.js';

function makeConfig(plugins?: FrontguardPlugin[]): FrontguardConfig {
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
    outputDir: '/tmp/fg-temp-dir-test',
    plugins,
  };
}

function makeReporter(): Reporter {
  return {
    onStageStart: () => {},
    onStageProgress: () => {},
    onStageComplete: () => {},
    onComplete: () => {},
  };
}

function shot(): ScreenshotResult {
  return {
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium',
    buffer: Buffer.from('png'),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 10,
  };
}

beforeEach(() => {
  vi.stubEnv('CI', 'false');
  tempDirs.created.length = 0;
  renderPages.mockReset();
  renderPages.mockResolvedValue([shot()]);
  storage.init.mockReset();
  storage.init.mockResolvedValue(undefined);
  storage.readBaseline.mockReset();
  storage.readBaseline.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('REL-5: compare temp directory', () => {
  it('awaits asynchronous reporting when rendering captures nothing', async () => {
    renderPages.mockResolvedValue([]);
    let completed = false;
    const teardown = vi.fn();
    const reporter = makeReporter();
    reporter.onComplete = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed = true;
    };

    await runPipeline(makeConfig([{ name: 'cleanup-on-empty', teardown }]), reporter);

    expect(completed).toBe(true);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('tears down only setup-attempted plugins once when setup partially fails', async () => {
    const firstTeardown = vi.fn();
    const failingTeardown = vi.fn();
    const unreachedSetup = vi.fn();
    const unreachedTeardown = vi.fn();
    const plugins: FrontguardPlugin[] = [
      { name: 'first', setup: vi.fn(), teardown: firstTeardown },
      {
        name: 'failing',
        setup() {
          throw new Error('setup failed');
        },
        teardown: failingTeardown,
      },
      { name: 'unreached', setup: unreachedSetup, teardown: unreachedTeardown },
    ];

    await expect(runPipeline(makeConfig(plugins), makeReporter())).rejects.toThrow('setup failed');

    expect(firstTeardown).toHaveBeenCalledTimes(1);
    expect(failingTeardown).toHaveBeenCalledTimes(1);
    expect(unreachedSetup).not.toHaveBeenCalled();
    expect(unreachedTeardown).not.toHaveBeenCalled();
  });

  it('reports a failed capture as an error instead of a new page', async () => {
    renderPages.mockResolvedValue([
      {
        ...shot(),
        buffer: Buffer.alloc(0),
        consoleErrors: ['Render error: chromium failed to launch'],
      },
    ]);

    const result = await runPipeline(makeConfig(), makeReporter());

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]).toMatchObject({
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
      status: 'error',
      error: 'Render error: chromium failed to launch',
    });
    expect(result.summary.errors).toBe(1);
    expect(result.summary.newPages).toBe(0);
  });

  it('gives two concurrent pipelines distinct temp dirs', async () => {
    await Promise.all([
      runPipeline(makeConfig(), makeReporter()),
      runPipeline(makeConfig(), makeReporter()),
    ]);

    expect(tempDirs.created).toHaveLength(2);
    expect(tempDirs.created[0]).not.toBe(tempDirs.created[1]);
  });

  it('removes the temp dir when the pipeline throws after compare', async () => {
    const throwPlugin: FrontguardPlugin = {
      name: 'rel5-throw',
      async afterCompare() {
        throw new Error('forced compare-phase failure');
      },
    };

    await expect(runPipeline(makeConfig([throwPlugin]), makeReporter())).rejects.toThrow(
      'forced compare-phase failure',
    );

    expect(tempDirs.created).toHaveLength(1);
    expect(existsSync(tempDirs.created[0]!)).toBe(false);
  });

  it('propagates report failures and still removes the temp dir', async () => {
    const reporter = makeReporter();
    reporter.onComplete = () => {
      throw new Error('report write failed');
    };

    await expect(runPipeline(makeConfig(), reporter)).rejects.toThrow('report write failed');

    expect(tempDirs.created).toHaveLength(1);
    expect(existsSync(tempDirs.created[0]!)).toBe(false);
  });

  it('uses mkdtemp under os.tmpdir with a frontguard- prefix', async () => {
    await runPipeline(makeConfig(), makeReporter());
    expect(tempDirs.created).toHaveLength(1);
    expect(tempDirs.created[0]!.startsWith(join(tmpdir(), 'frontguard-compare-'))).toBe(true);
  });
});

describe('baseline capture safety', () => {
  it('refuses to update baselines when any capture failed', async () => {
    renderPages.mockResolvedValue([
      {
        ...shot(),
        buffer: Buffer.alloc(0),
        consoleErrors: ['Render error: chromium failed to launch'],
      },
    ]);

    await expect(updateBaselines(makeConfig(), makeReporter())).rejects.toThrow(
      'Cannot update baselines: 1 capture failed',
    );
  });
});
