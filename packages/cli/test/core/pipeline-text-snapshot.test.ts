import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontguardConfig, Reporter, RunResult, ScreenshotResult } from '../../src/core/types.js';
import { comparisonExitCode } from '../../src/cli/exit-code.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  init: vi.fn(),
  writeBaseline: vi.fn(),
  readManifest: vi.fn(),
  writeManifest: vi.fn(),
  readBaseline: vi.fn(),
  textFile: vi.fn(),
  aria: '- button "Save"',
  gotoError: null as string | null,
  launchError: null as string | null,
  launched: [] as string[],
  urls: [] as string[],
  scripts: [] as string[],
  contextOptions: null as unknown,
  routeHandler: null as null | ((route: {
    request: () => { url: () => string };
    abort: (code: string) => Promise<void>;
    continue: () => Promise<void>;
  }) => Promise<void>),
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
    constructor(..._args: unknown[]) {}
    init = mocks.init;
    writeBaseline = mocks.writeBaseline;
    readManifest = mocks.readManifest;
    writeManifest = mocks.writeManifest;
    readBaseline = mocks.readBaseline;
    textFile = mocks.textFile;
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));
vi.mock('playwright', () => {
  const engine = (name: string) => ({
    launch: async () => {
      mocks.launched.push(name);
      if (mocks.launchError) throw new Error(mocks.launchError);
      return {
        newContext: async (options: unknown) => {
          mocks.contextOptions = options;
          return {
            route: async (
              _pattern: string,
              handler: NonNullable<typeof mocks.routeHandler>,
            ) => {
              mocks.routeHandler = handler;
            },
            newPage: async () => ({
              goto: async (url: string) => {
                mocks.urls.push(url);
                if (mocks.gotoError) throw new Error(mocks.gotoError);
              },
              waitForSelector: async () => {},
              addInitScript: async (source: string) => {
                mocks.scripts.push(source);
              },
              evaluate: async (source: unknown) => {
                mocks.scripts.push(typeof source === 'string' ? source : 'fn');
                return { ready: true, reason: 'phase-complete', elapsedMs: 1 };
              },
              locator: () => ({
                ariaSnapshot: async () => mocks.aria,
                textContent: async () => mocks.aria,
                first: () => ({
                  ariaSnapshot: async () => mocks.aria,
                  textContent: async () => mocks.aria,
                }),
              }),
              click: async () => {},
              hover: async () => {},
              fill: async () => {},
              press: async () => {},
              keyboard: { press: async () => {} },
              waitForTimeout: async () => {},
            }),
            close: async () => {},
          };
        },
        close: async () => {},
      };
    },
  });
  return { chromium: engine('chromium'), firefox: engine('firefox'), webkit: engine('webkit') };
});

import { runPipeline, updateBaselines } from '../../src/core/pipeline.js';
import { createTextSnapshotPlugin } from '../../src/plugins/text-snapshot.js';

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

function config(): FrontguardConfig {
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
    outputDir: '/tmp/frontguard-text-snapshot-test',
    plugins: [createTextSnapshotPlugin({ aria: true })],
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

function pixel(status: 'pass' | 'regression') {
  return {
    route: { path: '/' },
    viewport: 1440,
    browser: 'chromium' as const,
    status,
    diffPercentage: status === 'regression' ? 4 : 0,
    comparisonMethod: 'pixelmatch' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aria = '- button "Save"';
  mocks.gotoError = null;
  mocks.launchError = null;
  mocks.launched = [];
  mocks.urls = [];
  mocks.scripts = [];
  mocks.routeHandler = null;
  mocks.contextOptions = null;
  mocks.renderPages.mockResolvedValue([screenshot()]);
  mocks.init.mockResolvedValue(undefined);
  mocks.writeBaseline.mockResolvedValue(undefined);
  mocks.readManifest.mockResolvedValue(null);
  mocks.writeManifest.mockResolvedValue(undefined);
  mocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
  mocks.textFile.mockImplementation(async (_route: string, _viewport: number, _browser: string, _suffix: string, body?: string) => {
    if (body === undefined) return '- button "Save"';
    return null;
  });
  mocks.compareScreenshot.mockReturnValue(pixel('regression'));
});

describe('text snapshots beside a pixel comparison', () => {
  it('reports a text mismatch without passing a pixel regression', async () => {
    mocks.textFile.mockResolvedValue('- button "Cancel"');

    const result = await runPipeline(config(), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(result.summary.regressions).toBe(1);
    expect(comparisonExitCode(result.summary)).toBe(1);
    expect(result.textSnapshots).toEqual([
      {
        route: '/',
        viewport: 1440,
        browser: 'chromium',
        kind: 'aria',
        status: 'mismatch',
        excerpt: 'was - button "Cancel" now - button "Save"',
      },
    ]);
    expect(mocks.textFile).not.toHaveBeenCalledWith('/', 1440, 'chromium', '.aria.txt', expect.any(String));
  });

  it('does not clear a pixel regression when the text matches', async () => {
    const result = await runPipeline(config(), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(result.textSnapshots?.[0]?.status).toBe('match');
    expect(comparisonExitCode(result.summary)).toBe(1);
  });

  it('keeps a pixel pass when the text mismatches', async () => {
    mocks.compareScreenshot.mockReturnValue(pixel('pass'));
    mocks.textFile.mockResolvedValue('other');

    const result = await runPipeline(config(), reporter());

    expect(result.diffs[0]?.status).toBe('pass');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(result.summary.regressions).toBe(0);
    expect(result.summary.passed).toBe(1);
    expect(comparisonExitCode(result.summary)).toBe(0);
    expect(result.textSnapshots?.[0]?.status).toBe('mismatch');
  });

  it('records a capture error without changing the pixel result', async () => {
    mocks.gotoError = 'navigation failed';

    const result = await runPipeline(config(), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(result.textSnapshots?.[0]?.status).toBe('error');
    expect(comparisonExitCode(result.summary)).toBe(1);
  });

  it('keeps the pixel result when the text browser fails to launch', async () => {
    mocks.launchError = 'browser missing';

    const result = await runPipeline(config(), reporter());

    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
    expect(result.textSnapshots?.[0]?.status).toBe('error');
    expect(comparisonExitCode(result.summary)).toBe(1);
  });

  it('reads text from the shot browser and keeps one stored newline', async () => {
    mocks.renderPages.mockResolvedValue([{ ...screenshot(), browser: 'firefox' }]);
    mocks.textFile.mockResolvedValue('a\n');
    mocks.aria = 'a\n';

    const result = await runPipeline(config(), reporter());

    expect(mocks.launched).toEqual(['firefox']);
    expect(result.textSnapshots?.[0]?.status).toBe('mismatch');
    expect(result.diffs[0]?.status).toBe('regression');
    expect(result.diffs[0]?.comparisonMethod).toBe('pixelmatch');
  });

  it('opens a hosted story preview and waits for Storybook before reading text', async () => {
    const ladle = screenshot();
    ladle.route = { path: '/?story=a', discoveredVia: 'ladle' };
    mocks.renderPages.mockResolvedValue([ladle]);
    const cfg = config();
    cfg.baseUrl = 'https://example.com/components/';

    await runPipeline(cfg, reporter());
    expect(mocks.urls).toEqual(['https://example.com/components/?story=a']);

    const story = screenshot();
    story.route = { path: '/iframe.html?id=button--primary', discoveredVia: 'storybook' };
    mocks.renderPages.mockResolvedValue([story]);
    mocks.urls = [];
    mocks.scripts = [];
    await runPipeline(config(), reporter());

    expect(mocks.urls).toEqual(['http://localhost:3000/iframe.html?id=button--primary']);
    expect(mocks.scripts.some((source) => source.includes('__STORYBOOK_PREVIEW__'))).toBe(true);
  });

  it('applies freeze, seed, and blocked URLs before reading text', async () => {
    const cfg = config();
    cfg.freezeTime = true;
    cfg.seedRandom = 9;
    cfg.blockUrls = ['ads.example'];

    await runPipeline(cfg, reporter());

    expect(mocks.scripts.some((source) => source.includes('1704067200000'))).toBe(true);
    expect(mocks.scripts.some((source) => source.includes('__fg_seed=(9>>>0)||42'))).toBe(true);
    expect(mocks.routeHandler).toEqual(expect.any(Function));
    const abort = vi.fn(async () => {});
    const cont = vi.fn(async () => {});
    await mocks.routeHandler?.({
      request: () => ({ url: () => 'https://ads.example/a' }),
      abort,
      continue: cont,
    });
    await mocks.routeHandler?.({
      request: () => ({ url: () => 'https://app.example/a' }),
      abort,
      continue: cont,
    });
    expect(abort).toHaveBeenCalledWith('blockedbyclient');
    expect(cont).toHaveBeenCalledOnce();
  });
});

describe('text snapshots on baseline update', () => {
  it('writes the sibling text before the PNG', async () => {
    mocks.aria = 'line\r\n';
    const output = reporter();

    const result = await updateBaselines(config(), output);

    expect(mocks.textFile).toHaveBeenCalledWith('/', 1440, 'chromium', '.aria.txt', 'line');
    expect(mocks.writeBaseline).toHaveBeenCalledOnce();
    const wroteText = mocks.textFile.mock.invocationCallOrder.at(-1) ?? 0;
    expect(wroteText).toBeLessThan(mocks.writeBaseline.mock.invocationCallOrder[0]);
    expect(result.baselineUpdate).toBe(true);
    expect(result.diffs[0]?.status).toBe('new');
    expect(result.textSnapshots?.[0]?.status).toBe('new');
    expect(output.completed).toHaveBeenCalledWith(result);
  });

  it('throws before writing a PNG when capture fails', async () => {
    mocks.gotoError = 'navigation failed';
    const output = reporter();

    await expect(updateBaselines(config(), output)).rejects.toThrow('navigation failed');

    expect(mocks.textFile).not.toHaveBeenCalledWith('/', 1440, 'chromium', '.aria.txt', expect.any(String));
    expect(mocks.writeBaseline).not.toHaveBeenCalled();
    expect(output.completed).not.toHaveBeenCalled();
  });

  it('throws before writing a PNG when the text browser fails to launch', async () => {
    mocks.launchError = 'browser missing';
    const output = reporter();

    await expect(updateBaselines(config(), output)).rejects.toThrow('browser missing');

    expect(mocks.writeBaseline).not.toHaveBeenCalled();
    expect(mocks.textFile).not.toHaveBeenCalledWith('/', 1440, 'chromium', '.aria.txt', expect.any(String));
    expect(output.completed).not.toHaveBeenCalled();
  });
});
