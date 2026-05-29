/**
 * Unit tests for the model-as-judge module (src/diff/model-judge.ts).
 *
 * Mocks retry + logger; injects a fake fetch and API-key resolver so no real
 * network calls or env vars are required.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  judgeScreenshot,
  parseJudgeResponse,
  buildJudgeContext,
  summariseJudgements,
  JudgeError,
} from '../../src/diff/model-judge.js';
import type { ScreenshotResult, AIConfig, JudgeResult } from '../../src/core/types.js';
import { createTestPng } from '../fixtures/helpers.js';

vi.mock('../../src/utils/retry.js', () => ({
  retry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function tinyPng(): Buffer {
  return createTestPng(10, 10, 200, 200, 200);
}

function makeScreenshot(overrides?: Partial<ScreenshotResult>): ScreenshotResult {
  return {
    route: { path: '/pricing' },
    viewport: 1440,
    browser: 'chromium',
    buffer: tinyPng(),
    domSnapshot: '<html></html>',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 100,
    ...overrides,
  };
}

const openai: AIConfig = { provider: 'openai', model: 'gpt-4o' };
const anthropic: AIConfig = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };

/** Builds a fake fetch that returns the given content for the active provider. */
function fakeFetch(content: string, provider: 'openai' | 'anthropic' = 'openai', status = 200): typeof fetch {
  return (async (url: string) => {
    const body =
      provider === 'openai' || url.includes('openai')
        ? { choices: [{ message: { content } }] }
        : { content: [{ text: content }] };
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const PASS_JSON = JSON.stringify({
  pass: true,
  confidence: 0.9,
  issues: [],
});

const FAIL_JSON = JSON.stringify({
  pass: false,
  confidence: 0.8,
  issues: [
    { category: 'overflow', severity: 'critical', description: 'Text clipped in hero', location: '.hero h1', suggestion: 'Reduce font size' },
    { category: 'spacing', severity: 'info', description: 'Tight padding' },
  ],
});

describe('parseJudgeResponse', () => {
  it('parses raw JSON', () => {
    const r = parseJudgeResponse(FAIL_JSON);
    expect(r.pass).toBe(false);
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0].category).toBe('overflow');
    expect(r.confidence).toBe(0.8);
  });

  it('strips markdown code fences', () => {
    const r = parseJudgeResponse('```json\n' + PASS_JSON + '\n```');
    expect(r.pass).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('recovers a bare {...} block from surrounding prose', () => {
    const r = parseJudgeResponse('Here is my verdict: ' + PASS_JSON + ' Done.');
    expect(r.pass).toBe(true);
  });

  it('coerces invalid category/severity to safe defaults', () => {
    const r = parseJudgeResponse(
      JSON.stringify({ issues: [{ category: 'bogus', severity: 'apocalyptic', description: 'x' }] }),
    );
    expect(r.issues[0].category).toBe('other');
    expect(r.issues[0].severity).toBe('info');
  });

  it('derives pass=false when blocking issues exist and pass is omitted', () => {
    const r = parseJudgeResponse(
      JSON.stringify({ issues: [{ category: 'overflow', severity: 'critical', description: 'x' }] }),
    );
    expect(r.pass).toBe(false);
  });

  it('derives pass=true when only info issues and pass omitted', () => {
    const r = parseJudgeResponse(
      JSON.stringify({ issues: [{ category: 'spacing', severity: 'info', description: 'x' }] }),
    );
    expect(r.pass).toBe(true);
  });

  it('defaults confidence to 0.5 when missing/invalid', () => {
    expect(parseJudgeResponse(JSON.stringify({ issues: [] })).confidence).toBe(0.5);
    expect(parseJudgeResponse(JSON.stringify({ confidence: 5, issues: [] })).confidence).toBe(0.5);
  });

  it('throws JudgeError on unparseable text', () => {
    expect(() => parseJudgeResponse('not json at all')).toThrow(JudgeError);
  });
});

describe('buildJudgeContext', () => {
  it('includes route, viewport, browser', () => {
    const ctx = buildJudgeContext(makeScreenshot());
    expect(ctx).toContain('/pricing');
    expect(ctx).toContain('1440px');
    expect(ctx).toContain('chromium');
  });
  it('notes console errors when present', () => {
    const ctx = buildJudgeContext(makeScreenshot({ consoleErrors: ['boom', 'bang'] }));
    expect(ctx).toContain('2');
  });
});

describe('judgeScreenshot — heuristic mode', () => {
  it('returns a passing verdict', async () => {
    const r = await judgeScreenshot(makeScreenshot(), {
      ai: openai,
      fetchImpl: fakeFetch(PASS_JSON, 'openai'),
      apiKeyResolver: () => 'key',
    });
    expect(r.pass).toBe(true);
    expect(r.withDesignReference).toBe(false);
    expect(r.route.path).toBe('/pricing');
    expect(r.error).toBeUndefined();
  });

  it('returns a failing verdict with issues', async () => {
    const r = await judgeScreenshot(makeScreenshot(), {
      ai: anthropic,
      fetchImpl: fakeFetch(FAIL_JSON, 'anthropic'),
      apiKeyResolver: () => 'key',
    });
    expect(r.pass).toBe(false);
    expect(r.issues).toHaveLength(2);
  });

  it('captures errors instead of throwing (missing API key)', async () => {
    const r = await judgeScreenshot(makeScreenshot(), {
      ai: openai,
      fetchImpl: fakeFetch(PASS_JSON),
      apiKeyResolver: () => {
        throw new Error('No API key');
      },
    });
    expect(r.pass).toBe(false);
    expect(r.confidence).toBe(0);
    expect(r.error).toMatch(/No API key/);
  });

  it('captures non-ok HTTP responses as errors', async () => {
    const r = await judgeScreenshot(makeScreenshot(), {
      ai: openai,
      fetchImpl: fakeFetch('{}', 'openai', 500),
      apiKeyResolver: () => 'key',
    });
    expect(r.pass).toBe(false);
    expect(r.error).toMatch(/failed/i);
  });
});

describe('judgeScreenshot — Figma compliance mode', () => {
  it('sets withDesignReference and sends two images', async () => {
    let imageCount = 0;
    const spyFetch = (async (_url: string, init: RequestInit) => {
      const parsed = JSON.parse(init.body as string);
      const content = parsed.messages[parsed.messages.length - 1].content;
      imageCount = content.filter((c: { type: string }) => c.type === 'image_url').length;
      return new Response(JSON.stringify({ choices: [{ message: { content: PASS_JSON } }] }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await judgeScreenshot(makeScreenshot(), {
      ai: openai,
      figmaReference: tinyPng(),
      fetchImpl: spyFetch,
      apiKeyResolver: () => 'key',
    });
    expect(r.withDesignReference).toBe(true);
    expect(imageCount).toBe(2);
    expect(r.pass).toBe(true);
  });
});

describe('summariseJudgements', () => {
  it('aggregates pass/fail and severities', () => {
    const verdicts: JudgeResult[] = [
      { route: { path: '/' }, viewport: 1440, browser: 'chromium', pass: true, confidence: 1, issues: [], withDesignReference: false },
      {
        route: { path: '/x' }, viewport: 1440, browser: 'chromium', pass: false, confidence: 0.8, withDesignReference: false,
        issues: [
          { category: 'overflow', severity: 'critical', description: 'a' },
          { category: 'spacing', severity: 'warning', description: 'b' },
        ],
      },
    ];
    const s = summariseJudgements(verdicts);
    expect(s).toEqual({ total: 2, passed: 1, failed: 1, critical: 1, warnings: 1 });
  });
});
