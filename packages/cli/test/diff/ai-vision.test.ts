/**
 * Unit tests for the AI vision analysis module (src/diff/ai-vision.ts).
 *
 * Mocks global fetch, the retry utility, pngjs, and env-based API keys
 * to test all code paths without real network calls.
 */

import { analyzeWithAI, AIAnalysisError, buildAccessibilityContext } from '../../src/diff/ai-vision.js';
import type { DiffResult, AIConfig, AIAnalysis, AccessibilityViolation } from '../../src/core/types.js';
import { createTestPng } from '../fixtures/helpers.js';

const a11yViolation = (id: string, impact: AccessibilityViolation['impact']): AccessibilityViolation => ({
  id,
  impact,
  description: `${id} description`,
  help: `${id} help`,
  helpUrl: `https://dequeuniversity.com/rules/axe/${id}`,
  nodes: [{ target: ['.el'] }],
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock retry to just call the function directly (no backoff/delay in tests)
vi.mock('../../src/utils/retry.js', () => ({
  retry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a small (10×10) valid PNG buffer for test images. */
function tinyPng(): Buffer {
  return createTestPng(10, 10, 128, 128, 128);
}

function makeDiff(overrides?: Partial<DiffResult>): DiffResult {
  return {
    route: { path: '/test' },
    viewport: 1440,
    browser: 'chromium',
    status: 'changed',
    diffPercentage: 5,
    baselineImage: tinyPng(),
    currentImage: tinyPng(),
    diffImage: tinyPng(),
    ...overrides,
  };
}

function openaiConfig(model = 'gpt-4o'): AIConfig {
  return { provider: 'openai', model };
}

function anthropicConfig(model = 'claude-sonnet-4-20250514'): AIConfig {
  return { provider: 'anthropic', model };
}

/** Build a valid AI JSON response string. */
function validAIJson(overrides?: Partial<Record<string, unknown>>): string {
  return JSON.stringify({
    classification: 'regression',
    explanation: 'Button color changed from blue to red',
    severity: 'critical',
    confidence: 0.95,
    suggestedFix: 'Revert CSS change',
    ...overrides,
  });
}

/** Create a mock Response matching the OpenAI format. */
function openAIResponse(content: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => '',
  };
}

/** Create a mock Response matching the Anthropic format. */
function anthropicResponse(text: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
    text: async () => '',
  };
}

/** Create an error Response. */
function errorResponse(status: number, body = ''): Partial<Response> {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzeWithAI', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.FRONTGUARD_OPENAI_KEY = 'test-openai-key';
    process.env.FRONTGUARD_ANTHROPIC_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    fetchSpy.mockReset();
    // Restore env
    process.env.FRONTGUARD_OPENAI_KEY = originalEnv.FRONTGUARD_OPENAI_KEY;
    process.env.FRONTGUARD_ANTHROPIC_KEY = originalEnv.FRONTGUARD_ANTHROPIC_KEY;
  });

  // -----------------------------------------------------------------------
  // Happy path — OpenAI
  // -----------------------------------------------------------------------

  it('returns valid AIAnalysis from OpenAI response', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse(validAIJson()) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());

    expect(result.classification).toBe('regression');
    expect(result.explanation).toBe('Button color changed from blue to red');
    expect(result.severity).toBe('critical');
    expect(result.confidence).toBe(0.95);
    expect(result.suggestedFix).toBe('Revert CSS change');
    expect(result.rawResponse).toBeDefined();
  });

  it('calls the OpenAI endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse(validAIJson()) as Response);

    await analyzeWithAI(makeDiff(), openaiConfig());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('fuses accessibility findings into the prompt when provided', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse(validAIJson()) as Response);

    await analyzeWithAI(makeDiff(), openaiConfig(), {
      accessibility: [a11yViolation('color-contrast', 'serious')],
    });

    const body = String(fetchSpy.mock.calls[0][1]?.body ?? '');
    expect(body).toContain('Known accessibility issues');
    expect(body).toContain('color-contrast (serious)');
  });

  it('does not add accessibility context when none is provided', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse(validAIJson()) as Response);

    await analyzeWithAI(makeDiff(), openaiConfig());

    const body = String(fetchSpy.mock.calls[0][1]?.body ?? '');
    expect(body).not.toContain('Known accessibility issues');
  });

  // -----------------------------------------------------------------------
  // Happy path — Anthropic
  // -----------------------------------------------------------------------

  it('returns valid AIAnalysis from Anthropic response', async () => {
    fetchSpy.mockResolvedValueOnce(anthropicResponse(validAIJson()) as Response);

    const result = await analyzeWithAI(makeDiff(), anthropicConfig());

    expect(result.classification).toBe('regression');
    expect(result.severity).toBe('critical');
    expect(result.confidence).toBe(0.95);
  });

  it('calls the Anthropic endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(anthropicResponse(validAIJson()) as Response);

    await analyzeWithAI(makeDiff(), anthropicConfig());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  // -----------------------------------------------------------------------
  // Missing API key
  // -----------------------------------------------------------------------

  it('throws AIAnalysisError when OpenAI API key is missing', async () => {
    delete process.env.FRONTGUARD_OPENAI_KEY;

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow(AIAnalysisError);
    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('FRONTGUARD_OPENAI_KEY');
  });

  it('throws AIAnalysisError when Anthropic API key is missing', async () => {
    delete process.env.FRONTGUARD_ANTHROPIC_KEY;

    await expect(analyzeWithAI(makeDiff(), anthropicConfig())).rejects.toThrow(AIAnalysisError);
    await expect(analyzeWithAI(makeDiff(), anthropicConfig())).rejects.toThrow('FRONTGUARD_ANTHROPIC_KEY');
  });

  // -----------------------------------------------------------------------
  // Missing images
  // -----------------------------------------------------------------------

  it('throws AIAnalysisError when baseline image is missing', async () => {
    const diff = makeDiff({ baselineImage: undefined });

    await expect(analyzeWithAI(diff, openaiConfig())).rejects.toThrow(AIAnalysisError);
    await expect(analyzeWithAI(diff, openaiConfig())).rejects.toThrow('baseline or current image is missing');
  });

  it('throws AIAnalysisError when current image is missing', async () => {
    const diff = makeDiff({ currentImage: undefined });

    await expect(analyzeWithAI(diff, openaiConfig())).rejects.toThrow('baseline or current image is missing');
  });

  // -----------------------------------------------------------------------
  // HTTP errors
  // -----------------------------------------------------------------------

  it('throws AIAnalysisError with status on HTTP 401 (auth failure)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401, '{"error":{"message":"invalid key"}}') as Response);

    try {
      await analyzeWithAI(makeDiff(), openaiConfig());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      const aiErr = err as AIAnalysisError;
      expect(aiErr.statusCode).toBe(401);
      expect(aiErr.provider).toBe('openai');
      expect(aiErr.message).toContain('Authentication failed');
    }
  });

  it('throws AIAnalysisError on HTTP 429 (rate limit)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(429) as Response);

    try {
      await analyzeWithAI(makeDiff(), openaiConfig());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      expect((err as AIAnalysisError).statusCode).toBe(429);
      expect((err as AIAnalysisError).message).toContain('Rate limited');
    }
  });

  it('throws AIAnalysisError on HTTP 404 (model not found)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404) as Response);

    try {
      await analyzeWithAI(makeDiff(), openaiConfig('gpt-999'));
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      expect((err as AIAnalysisError).statusCode).toBe(404);
      expect((err as AIAnalysisError).message).toContain('not found');
    }
  });

  it('throws AIAnalysisError on HTTP 500 (server error)', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500) as Response);

    try {
      await analyzeWithAI(makeDiff(), openaiConfig());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      expect((err as AIAnalysisError).statusCode).toBe(500);
    }
  });

  // -----------------------------------------------------------------------
  // Malformed JSON response
  // -----------------------------------------------------------------------

  it('throws AIAnalysisError on malformed JSON from OpenAI', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse('This is not valid JSON at all') as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('Failed to parse AI response as JSON');
  });

  it('throws AIAnalysisError on invalid classification in response', async () => {
    const badJson = validAIJson({ classification: 'banana' });
    fetchSpy.mockResolvedValueOnce(openAIResponse(badJson) as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('Invalid classification');
  });

  it('throws AIAnalysisError on invalid severity', async () => {
    const badJson = validAIJson({ severity: 'extreme' });
    fetchSpy.mockResolvedValueOnce(openAIResponse(badJson) as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('Invalid severity');
  });

  it('throws AIAnalysisError on missing explanation', async () => {
    const badJson = validAIJson({ explanation: '' });
    fetchSpy.mockResolvedValueOnce(openAIResponse(badJson) as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('Missing or empty explanation');
  });

  // -----------------------------------------------------------------------
  // Confidence clamping
  // -----------------------------------------------------------------------

  it('clamps confidence above 1 to 1', async () => {
    const json = validAIJson({ confidence: 5.0 });
    fetchSpy.mockResolvedValueOnce(openAIResponse(json) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.confidence).toBe(1);
  });

  it('clamps confidence below 0 to 0', async () => {
    const json = validAIJson({ confidence: -0.5 });
    fetchSpy.mockResolvedValueOnce(openAIResponse(json) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.confidence).toBe(0);
  });

  it('defaults to 0.5 when confidence is not a number', async () => {
    const json = validAIJson({ confidence: 'high' });
    fetchSpy.mockResolvedValueOnce(openAIResponse(json) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.confidence).toBe(0.5);
  });

  // -----------------------------------------------------------------------
  // Markdown-wrapped JSON parsing
  // -----------------------------------------------------------------------

  it('handles JSON wrapped in markdown code blocks', async () => {
    const wrappedContent = '```json\n' + validAIJson() + '\n```';
    fetchSpy.mockResolvedValueOnce(openAIResponse(wrappedContent) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.classification).toBe('regression');
  });

  it('handles JSON with leading text', async () => {
    const content = 'Here is my analysis:\n' + validAIJson();
    fetchSpy.mockResolvedValueOnce(openAIResponse(content) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.classification).toBe('regression');
  });

  // -----------------------------------------------------------------------
  // Timeout (AbortError)
  // -----------------------------------------------------------------------

  it('throws AIAnalysisError on timeout (AbortError) for OpenAI', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchSpy.mockRejectedValueOnce(abortError);

    try {
      await analyzeWithAI(makeDiff(), openaiConfig());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      expect((err as AIAnalysisError).message).toContain('timed out');
      expect((err as AIAnalysisError).statusCode).toBe(408);
    }
  });

  it('throws AIAnalysisError on timeout (AbortError) for Anthropic', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchSpy.mockRejectedValueOnce(abortError);

    try {
      await analyzeWithAI(makeDiff(), anthropicConfig());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIAnalysisError);
      expect((err as AIAnalysisError).message).toContain('timed out');
    }
  });

  // -----------------------------------------------------------------------
  // Network error
  // -----------------------------------------------------------------------

  it('wraps generic network errors in AIAnalysisError', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow(AIAnalysisError);
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('fetch failed');
  });

  // -----------------------------------------------------------------------
  // Empty response from API
  // -----------------------------------------------------------------------

  it('throws on empty content from OpenAI (no choices)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
      text: async () => '',
    } as unknown as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('empty response');
  });

  it('throws on empty content from Anthropic (no text block)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
      text: async () => '',
    } as unknown as Response);

    await expect(analyzeWithAI(makeDiff(), anthropicConfig())).rejects.toThrow('empty response');
  });

  // -----------------------------------------------------------------------
  // API-level error field in response body
  // -----------------------------------------------------------------------

  it('throws on OpenAI error field in response JSON', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: { message: 'model overloaded' } }),
      text: async () => '',
    } as unknown as Response);

    await expect(analyzeWithAI(makeDiff(), openaiConfig())).rejects.toThrow('model overloaded');
  });

  it('throws on Anthropic error field in response JSON', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: { type: 'overloaded_error', message: 'service busy' } }),
      text: async () => '',
    } as unknown as Response);

    await expect(analyzeWithAI(makeDiff(), anthropicConfig())).rejects.toThrow('service busy');
  });

  // -----------------------------------------------------------------------
  // Works without diff image (only baseline + current)
  // -----------------------------------------------------------------------

  it('succeeds when diffImage is undefined', async () => {
    fetchSpy.mockResolvedValueOnce(openAIResponse(validAIJson()) as Response);

    const diff = makeDiff({ diffImage: undefined });
    const result = await analyzeWithAI(diff, openaiConfig());

    expect(result.classification).toBe('regression');
  });

  // -----------------------------------------------------------------------
  // Content update & intentional classifications
  // -----------------------------------------------------------------------

  it('parses content_update classification correctly', async () => {
    const json = validAIJson({ classification: 'content_update', severity: 'info', confidence: 0.8 });
    fetchSpy.mockResolvedValueOnce(openAIResponse(json) as Response);

    const result = await analyzeWithAI(makeDiff(), openaiConfig());
    expect(result.classification).toBe('content_update');
    expect(result.severity).toBe('info');
  });

  it('parses intentional classification correctly', async () => {
    const json = validAIJson({ classification: 'intentional', severity: 'warning' });
    fetchSpy.mockResolvedValueOnce(anthropicResponse(json) as Response);

    const result = await analyzeWithAI(makeDiff(), anthropicConfig());
    expect(result.classification).toBe('intentional');
  });
});

describe('buildAccessibilityContext', () => {
  it('returns an empty string for no violations', () => {
    expect(buildAccessibilityContext([])).toBe('');
  });

  it('summarises rule ids with impact and a correlation instruction', () => {
    const ctx = buildAccessibilityContext([
      a11yViolation('color-contrast', 'serious'),
      a11yViolation('image-alt', 'critical'),
    ]);
    expect(ctx).toContain('color-contrast (serious)');
    expect(ctx).toContain('image-alt (critical)');
    expect(ctx).toContain('note the connection');
  });

  it('de-duplicates repeated rule ids', () => {
    const ctx = buildAccessibilityContext([
      a11yViolation('color-contrast', 'serious'),
      a11yViolation('color-contrast', 'serious'),
    ]);
    expect(ctx.match(/color-contrast/g)).toHaveLength(1);
  });
});
