/**
 * REL-5 — compare temp dirs must be unique and cleaned up on pipeline throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runPipeline } from '../../src/core/pipeline.js';

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
  tempDirs.created.length = 0;
  renderPages.mockReset();
  renderPages.mockResolvedValue([shot()]);
});

describe('REL-5: compare temp directory', () => {
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

  it('uses mkdtemp under os.tmpdir with a frontguard- prefix', async () => {
    await runPipeline(makeConfig(), makeReporter());
    expect(tempDirs.created).toHaveLength(1);
    expect(tempDirs.created[0]!.startsWith(join(tmpdir(), 'frontguard-compare-'))).toBe(true);
  });
});