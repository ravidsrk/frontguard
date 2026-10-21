import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffResult, FrontguardConfig, Reporter, ScreenshotResult } from '../../src/core/types.js';

const mocks = vi.hoisted(() => ({
  renderPages: vi.fn(),
  compareScreenshot: vi.fn(),
  analyzeWithAI: vi.fn(),
  judgeScreenshot: vi.fn(),
  init: vi.fn(),
  readBaseline: vi.fn(),
  readManifest: vi.fn(),
  writeBaselines: vi.fn(),
}));

vi.mock('../../src/render/playwright.js', () => ({ renderPages: mocks.renderPages }));
vi.mock('../../src/diff/pixel.js', () => ({
  compareScreenshot: mocks.compareScreenshot,
  createNewPageResult: (shot: ScreenshotResult) => ({
    route: shot.route,
    viewport: shot.viewport,
    browser: shot.browser,
    status: 'new' as const,
    diffPercentage: 0,
  }),
}));
vi.mock('../../src/diff/ai-vision.js', () => ({ analyzeWithAI: mocks.analyzeWithAI }));
vi.mock('../../src/diff/model-judge.js', () => ({ judgeScreenshot: mocks.judgeScreenshot }));
vi.mock('../../src/plugins/figma.js', () => ({ fetchDesignReference: vi.fn() }));
vi.mock('../../src/storage/git-orphan.js', () => ({
  GitOrphanStorage: class {
    init = mocks.init;
    readBaseline = mocks.readBaseline;
    readManifest = mocks.readManifest;
    writeBaselines = mocks.writeBaselines;
    writeBaseline = vi.fn();
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  setLogLevel: vi.fn(),
}));

import { runJudgePipeline, runPipeline, updateBaselines } from '../../src/core/pipeline.js';

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
    outputDir: '/tmp/frontguard-otel-test',
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

function bodyOf(fetchImpl: ReturnType<typeof vi.spyOn>): string {
  const call = fetchImpl.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  return String((call[1] as RequestInit).body);
}

describe('pipeline OTLP traces', () => {
  const saved = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    mocks.renderPages.mockResolvedValue([screenshot()]);
    mocks.init.mockResolvedValue(undefined);
    mocks.readBaseline.mockResolvedValue(Buffer.from('baseline'));
    mocks.readManifest.mockResolvedValue(null);
    mocks.writeBaselines.mockResolvedValue(undefined);
    mocks.compareScreenshot.mockReturnValue({
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
      status: 'pass',
      diffPercentage: 0,
    } satisfies DiffResult);
    mocks.judgeScreenshot.mockResolvedValue({
      route: { path: '/' },
      viewport: 1440,
      browser: 'chromium',
      pass: true,
      confidence: 1,
      issues: [],
      withDesignReference: false,
    });
  });

  afterEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRestore();
    if (saved === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = saved;
  });

  it('does not export when the endpoint is unset', async () => {
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await runPipeline(config(), reporter());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exports capture and compare counts without screenshot bytes', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example';
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await runPipeline(config(), reporter());
    const body = bodyOf(fetchImpl);
    expect(body).toContain('frontguard.capture');
    expect(body).toContain('frontguard.compare');
    expect(body).toContain('frontguard-cli');
    expect(body).toContain('"intValue":"1"');
    expect(body).not.toContain('current');
    expect(body).not.toContain('<html');
    expect(body).not.toContain('localhost');
  });

  it('exports a baseline-write span instead of a comparison', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example/v1/traces';
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await updateBaselines(config(), reporter());
    const body = bodyOf(fetchImpl);
    expect(body).toContain('frontguard.capture');
    expect(body).toContain('frontguard.baseline_write');
    expect(body).not.toContain('frontguard.compare');
    expect(body).not.toContain('current');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://otel.example/v1/traces');
  });

  it('exports the judge capture and still flushes when storage init fails', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example';
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const judged = config();
    judged.ai = { provider: 'openai', model: 'gpt-4o' };
    await runJudgePipeline(judged, reporter());
    expect(bodyOf(fetchImpl)).toContain('frontguard.capture');
    expect(bodyOf(fetchImpl)).not.toContain('frontguard.compare');

    vi.clearAllMocks();
    mocks.init.mockRejectedValue(new Error('origin/frontguard-baselines is unavailable'));
    await expect(runPipeline(config(), reporter())).rejects.toThrow(
      'origin/frontguard-baselines is unavailable',
    );
    const body = bodyOf(fetchImpl);
    expect(body).toContain('frontguard.compare');
    expect(body).toContain('"code":2');
    expect(body).not.toContain('frontguard-baselines');
  });
});
