import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { PNG } from 'pngjs';
import {
  AI_REQUEST_DEFAULTS,
  AIAnalysisError,
  CLASSIFICATION_SCHEMA,
  DEFAULT_AI_MODELS,
  buildRequest,
  callModel,
  clampConfidence,
  downscaleForModel,
  elideImages,
  httpError,
  parseModelJson,
  parseResponse,
  redactUrl,
  resolveApiKey,
  resolveBaseUrl,
  summarizeErrorBody,
  supportsServerSideFallback,
  toModelImage,
  validateClassification,
  type ModelRequest,
} from '../../src/diff/ai-provider.js';
import { createTestPng } from '../fixtures/helpers.js';

const IMG = toModelImage(createTestPng(10, 10, 10, 20, 30), 'baseline');

function req(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    provider: 'openai',
    model: 'gpt-6-luna',
    apiKey: 'secret-key',
    system: 'system text',
    userText: 'user text',
    images: [IMG],
    schema: CLASSIFICATION_SCHEMA,
    ...overrides,
  };
}

const NO_ENV = {} as NodeJS.ProcessEnv;
const VALID = JSON.stringify({
  classification: 'intentional',
  explanation: 'Theme changed',
  severity: 'info',
  confidence: 0.8,
  suggestedFix: null,
});

describe('defaults', () => {
  it('pins active vendor models and shared limits', () => {
    expect(DEFAULT_AI_MODELS).toEqual({
      openai: 'gpt-6-luna',
      anthropic: 'claude-sonnet-5-5',
      gemini: 'gemini-3.5-flash-lite',
    });
    expect(AI_REQUEST_DEFAULTS.maxOutputTokens).toBeGreaterThanOrEqual(4096);
    expect(AI_REQUEST_DEFAULTS.retries).toBe(2);
  });
});

describe('buildRequest', () => {
  it('OpenAI first party: strict schema, max_completion_tokens, bearer auth', () => {
    const built = buildRequest(req(), NO_ENV);
    expect(built.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(built.firstParty).toBe(true);
    expect(built.structured).toBe(true);
    expect(built.headers.Authorization).toBe('Bearer secret-key');
    expect(built.body.max_completion_tokens).toBe(AI_REQUEST_DEFAULTS.maxOutputTokens);
    expect(built.body).toHaveProperty('response_format.json_schema.strict', true);
  });

  it('OpenAI custom endpoint: max_tokens, no schema, path appended once', () => {
    const a = buildRequest(req({ baseUrl: 'http://localhost:11434/v1/' }), NO_ENV);
    expect(a.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(a.structured).toBe(false);
    expect(a.body.max_tokens).toBe(AI_REQUEST_DEFAULTS.maxOutputTokens);
    expect(a.body.response_format).toBeUndefined();
    const b = buildRequest(req({ baseUrl: 'https://proxy.example/v1/chat/completions' }), NO_ENV);
    expect(b.url).toBe('https://proxy.example/v1/chat/completions');
  });

  it('reads the base URL from the provider env var', () => {
    const env = { FRONTGUARD_OPENAI_BASE_URL: 'https://openrouter.ai/api/v1' } as NodeJS.ProcessEnv;
    expect(resolveBaseUrl('openai', undefined, env)).toBe('https://openrouter.ai/api/v1');
    expect(buildRequest(req(), env).url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('Anthropic first party: output_config and the fallback only for Claude 5 models', () => {
    const sonnet = buildRequest(req({ provider: 'anthropic', model: 'claude-sonnet-5-5' }), NO_ENV);
    expect(sonnet.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sonnet.headers['x-api-key']).toBe('secret-key');
    expect(sonnet.headers['anthropic-version']).toBe('2023-06-01');
    expect(sonnet.body).toHaveProperty('output_config.format.type', 'json_schema');
    expect(sonnet.body.fallbacks).toBe('default');
    expect(sonnet.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');

    const haiku = buildRequest(req({ provider: 'anthropic', model: 'claude-haiku-5-5' }), NO_ENV);
    expect(haiku.body.fallbacks).toBeUndefined();
    expect(haiku.headers['anthropic-beta']).toBeUndefined();
    expect(haiku.body.output_config).toBeDefined();

    // Images first, then the text block.
    const content = (sonnet.body.messages as Array<{ content: Array<{ type: string }> }>)[0].content;
    expect(content.map((c) => c.type)).toEqual(['image', 'text']);
  });

  it('Anthropic custom endpoint: no output_config, no beta header', () => {
    const built = buildRequest(
      req({ provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: 'https://gateway.example/v1/messages' }),
      NO_ENV,
    );
    expect(built.url).toBe('https://gateway.example/v1/messages');
    expect(built.body.output_config).toBeUndefined();
    expect(built.body.fallbacks).toBeUndefined();
  });

  it('Gemini first party: header key, systemInstruction, responseJsonSchema', () => {
    const built = buildRequest(req({ provider: 'gemini', model: 'models/gemini-3.5-flash-lite' }), NO_ENV);
    expect(built.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(built.headers['x-goog-api-key']).toBe('secret-key');
    expect(built.body).toHaveProperty('systemInstruction.parts.0.text', 'system text');
    expect(built.body).toHaveProperty('generationConfig.responseJsonSchema');
    expect(built.body).not.toHaveProperty('generationConfig.temperature');
  });

  it('Gemini custom endpoints accept both base-URL conventions and keep the query key', () => {
    const models = buildRequest(req({ provider: 'gemini', baseUrl: 'https://proxy.example/v1beta/models' }), NO_ENV);
    expect(models.url).toBe('https://proxy.example/v1beta/models/gpt-6-luna:generateContent?key=secret-key');
    const root = buildRequest(req({ provider: 'gemini', model: 'g', baseUrl: 'https://proxy.example/v1beta' }), NO_ENV);
    expect(root.url).toBe('https://proxy.example/v1beta/models/g:generateContent?key=secret-key');
    const full = buildRequest(
      req({ provider: 'gemini', baseUrl: 'https://proxy.example/custom:generateContent?key=abc' }),
      NO_ENV,
    );
    expect(full.url).toBe('https://proxy.example/custom:generateContent?key=abc');
    expect(models.body).not.toHaveProperty('generationConfig.responseJsonSchema');
  });

  it('honours per-call output and model overrides', () => {
    const built = buildRequest(req({ maxOutputTokens: 1234 }), NO_ENV);
    expect(built.body.max_completion_tokens).toBe(1234);
  });
});

describe('supportsServerSideFallback', () => {
  it.each([
    ['claude-sonnet-5-5', true],
    ['claude-opus-5', true],
    ['claude-fable-5-2', true],
    ['claude-haiku-5-5', false],
    ['claude-sonnet-4-6', false],
    ['gpt-6-luna', false],
  ])('%s → %s', (model, expected) => {
    expect(supportsServerSideFallback(model)).toBe(expected);
  });
});

describe('parseResponse', () => {
  const ctx = { model: 'm', maxOutputTokens: 100 };

  it('OpenAI text and usage', () => {
    const parsed = parseResponse(
      'openai',
      { choices: [{ finish_reason: 'stop', message: { content: VALID } }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      ctx,
    );
    expect(parsed).toEqual({ text: VALID, stopReason: 'stop', usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it('OpenAI refusal, content filter, truncation and empty answers', () => {
    expect(() => parseResponse('openai', { choices: [{ message: { refusal: 'no' } }] }, ctx)).toThrow(/declined/);
    expect(() => parseResponse('openai', { choices: [{ finish_reason: 'content_filter', message: {} }] }, ctx)).toThrow(
      expect.objectContaining({ kind: 'refusal' }),
    );
    expect(() => parseResponse('openai', { choices: [{ finish_reason: 'length', message: { content: '{' } }] }, ctx)).toThrow(
      /Raise ai.maxOutputTokens/,
    );
    expect(() => parseResponse('openai', { choices: [] }, ctx)).toThrow(expect.objectContaining({ kind: 'empty' }));
    expect(() => parseResponse('openai', { error: { message: 'bad' } }, ctx)).toThrow('OpenAI API error: bad');
  });

  it('Anthropic skips thinking blocks and sums cache tokens into input', () => {
    const parsed = parseResponse(
      'anthropic',
      {
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: VALID }],
        usage: { input_tokens: 100, cache_read_input_tokens: 20, cache_creation_input_tokens: 5, output_tokens: 40 },
      },
      ctx,
    );
    expect(parsed.text).toBe(VALID);
    expect(parsed.usage).toEqual({ inputTokens: 125, outputTokens: 40 });
  });

  it('Anthropic refusal and max_tokens', () => {
    expect(() =>
      parseResponse('anthropic', { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }, ctx),
    ).toThrow(/declined.*refusal: cyber/);
    expect(() =>
      parseResponse('anthropic', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a"' }] }, ctx),
    ).toThrow(expect.objectContaining({ kind: 'truncated' }));
  });

  it('Gemini skips thought parts and reports thinking tokens as output', () => {
    const parsed = parseResponse(
      'gemini',
      {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'plan', thought: true }, { text: VALID }] } }],
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 50, thoughtsTokenCount: 25 },
      },
      ctx,
    );
    expect(parsed.text).toBe(VALID);
    expect(parsed.usage).toEqual({ inputTokens: 300, outputTokens: 75 });
  });

  it('Gemini blocks, safety stops and truncation', () => {
    expect(() => parseResponse('gemini', { promptFeedback: { blockReason: 'SAFETY' } }, ctx)).toThrow(/blocked: SAFETY/);
    expect(() => parseResponse('gemini', { candidates: [{ finishReason: 'SAFETY' }] }, ctx)).toThrow(
      expect.objectContaining({ kind: 'refusal' }),
    );
    expect(() => parseResponse('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }, ctx)).toThrow(
      expect.objectContaining({ kind: 'truncated' }),
    );
    expect(() => parseResponse('gemini', { candidates: [{ content: { parts: [] } }] }, ctx)).toThrow(
      expect.objectContaining({ kind: 'empty' }),
    );
  });
});

describe('httpError', () => {
  const ctx = { provider: 'openai' as const, model: 'gpt-x', firstParty: true };

  it('maps statuses to kinds and retryability', () => {
    expect(httpError(401, '', ctx)).toMatchObject({ kind: 'auth', retryable: false, statusCode: 401 });
    expect(httpError(403, '', ctx).message).toContain('FRONTGUARD_OPENAI_KEY');
    expect(httpError(408, '', ctx)).toMatchObject({ kind: 'timeout', retryable: true });
    expect(httpError(429, '', ctx)).toMatchObject({ kind: 'rate_limit', retryable: true });
    expect(httpError(503, '', ctx)).toMatchObject({ kind: 'server', retryable: true });
  });

  it('distinguishes a missing default model from a missing configured one', () => {
    expect(httpError(404, '', { ...ctx, model: DEFAULT_AI_MODELS.openai }).message).toMatch(
      /Frontguard's default openai model .* Set ai.model/,
    );
    expect(httpError(404, '', ctx).message).toContain('Model "gpt-x" not found on openai (404). Check ai.model');
    expect(httpError(404, '', { ...ctx, firstParty: false }).message).toContain('and the custom base URL');
  });

  it('summarizes HTML bodies and hints at unsupported request shapes on custom endpoints', () => {
    const html = `<html><body><h1>Bad</h1>${'<p>response_format is not supported</p>'.repeat(50)}</body></html>`;
    const err = httpError(400, html, { ...ctx, firstParty: false });
    expect(err.message).not.toContain('<p>');
    expect(err.message.length).toBeLessThan(500);
    expect(err.message).toContain('may not support the request shape');
    expect(httpError(400, '{"error":{"message":"bad field"}}', ctx).message).toBe('openai API error (400): bad field');
  });

  it('summarizeErrorBody caps long text', () => {
    expect(summarizeErrorBody('a'.repeat(1000), 10)).toBe(`${'a'.repeat(10)}…`);
  });
});

describe('callModel', () => {
  const ok = (content = VALID) =>
    new Response(
      JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }),
      { status: 200 },
    );

  it('returns text, usage and one ok record', async () => {
    const records: unknown[] = [];
    const res = await callModel(req({ label: 'analyze /' }), {
      fetchImpl: (async () => ok()) as unknown as typeof fetch,
      env: NO_ENV,
      onCall: (r) => records.push(r),
    });
    expect(res).toMatchObject({ text: VALID, structured: true, attempts: 1, usage: { inputTokens: 7, outputTokens: 3 } });
    expect(records).toEqual([
      expect.objectContaining({ label: 'analyze /', outcome: 'ok', attempts: 1, inputTokens: 7, outputTokens: 3 }),
    ]);
  });

  it('retries retryable failures with backoff and gives up after the budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }));
    const sleep = vi.fn(async () => {});
    const retries: number[] = [];
    const records: Array<{ outcome: string; attempts: number; errorKind?: string }> = [];
    await expect(
      callModel(req(), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        env: NO_ENV,
        retries: 2,
        backoffMs: 100,
        sleep,
        onRetry: (_e, n) => retries.push(n),
        onCall: (r) => records.push(r),
      }),
    ).rejects.toMatchObject({ kind: 'server' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([1, 2]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(records).toEqual([expect.objectContaining({ outcome: 'error', attempts: 3, errorKind: 'server' })]);
  });

  it('maps an abort to a retryable timeout with a hint', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      callModel(req({ timeoutMs: 5 }), { fetchImpl: fetchImpl as unknown as typeof fetch, env: NO_ENV, retries: 0 }),
    ).rejects.toThrow(/timed out after 0s\. Raise ai.timeoutMs/);
  });

  it('aborts a hung request at timeoutMs', async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    await expect(callModel(req({ timeoutMs: 20 }), { fetchImpl, env: NO_ENV, retries: 0 })).rejects.toMatchObject({
      kind: 'timeout',
      statusCode: 408,
    });
  });

  it('reports network failures and non-JSON bodies', async () => {
    await expect(
      callModel(req(), {
        fetchImpl: (async () => {
          throw new TypeError('fetch failed');
        }) as unknown as typeof fetch,
        env: NO_ENV,
        retries: 0,
      }),
    ).rejects.toMatchObject({ kind: 'network', message: 'openai request failed: fetch failed' });

    await expect(
      callModel(req(), {
        fetchImpl: (async () => new Response('<html>ok</html>', { status: 200 })) as unknown as typeof fetch,
        env: NO_ENV,
        retries: 2,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_output', retryable: false });
  });

  it('wraps unexpected errors thrown while handling a response', async () => {
    const res = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: VALID } }] }) };
    Object.defineProperty(res, 'ok', {
      get() {
        throw new Error('boom');
      },
    });
    await expect(
      callModel(req(), { fetchImpl: (async () => res) as unknown as typeof fetch, env: NO_ENV, retries: 0 }),
    ).rejects.toBeInstanceOf(AIAnalysisError);
  });

  it('writes a redacted, image-free dump when FRONTGUARD_DEBUG_AI=1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-ai-dump-'));
    try {
      const big = new PNG({ width: 64, height: 48 });
      big.data.fill(90);
      const image = toModelImage(PNG.sync.write(big), 'baseline');
      await callModel(
        req({ provider: 'gemini', model: 'g', baseUrl: 'https://proxy.example/v1beta', images: [image], label: 'analyze /a b' }),
        {
          fetchImpl: (async () =>
            new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: VALID }] } }] }), {
              status: 200,
            })) as unknown as typeof fetch,
          env: { FRONTGUARD_DEBUG_AI: '1' } as NodeJS.ProcessEnv,
          debugDir: dir,
        },
      );
      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      const text = readFileSync(join(dir, files[0]), 'utf8');
      expect(text).not.toContain('secret-key');
      expect(text).toContain('key=REDACTED');
      expect(text).not.toContain(image.data.slice(0, 40));
      expect(text).toMatch(/<image 64x48 base64Bytes=\d+ sha256=[0-9a-f]{16}>/);
      const dump = JSON.parse(text);
      expect(dump).toMatchObject({ label: 'analyze /a b', provider: 'gemini', attempt: 1, structured: false });
      expect(dump.headers).toEqual(['Content-Type', 'x-goog-api-key']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseModelJson', () => {
  it('structured mode accepts plain JSON only', () => {
    expect(parseModelJson(VALID, { structured: true })).toMatchObject({ classification: 'intentional' });
    expect(() => parseModelJson('```json\n{}\n```', { structured: true })).toThrow(/despite the response schema/);
  });

  it('tolerant mode strips fences and prose', () => {
    expect(parseModelJson('Sure:\n```json\n{"a":1}\n```\nThanks', { structured: false })).toEqual({ a: 1 });
    expect(parseModelJson('{"a":1} trailing note', { structured: false })).toEqual({ a: 1 });
    expect(() => parseModelJson('no json here', { structured: false, provider: 'x' })).toThrow(
      'x response did not contain a JSON object',
    );
    expect(() => parseModelJson('[1,2]', { structured: true })).toThrow(/not an object/);
  });
});

describe('validateClassification', () => {
  it('validates enums and explanation, clamps confidence, drops empty fixes', () => {
    expect(validateClassification(JSON.parse(VALID), 'p')).toEqual({
      classification: 'intentional',
      explanation: 'Theme changed',
      severity: 'info',
      confidence: 0.8,
    });
    expect(() => validateClassification({ classification: 'oops' }, 'p')).toThrow('Invalid classification');
    expect(() => validateClassification({ classification: 'regression', severity: 'high' }, 'p')).toThrow(
      'Invalid severity',
    );
    expect(() =>
      validateClassification({ classification: 'regression', severity: 'info', explanation: ' ' }, 'p'),
    ).toThrow('Missing or empty explanation');
    expect(clampConfidence(7)).toBe(1);
    expect(clampConfidence(-1)).toBe(0);
    expect(clampConfidence('x')).toBe(0.5);
    expect(clampConfidence(null)).toBe(0.5);
  });
});

describe('images', () => {
  it('crops tall screenshots and downscales wide ones', () => {
    const tall = new PNG({ width: 1600, height: 12000 });
    const out = downscaleForModel(PNG.sync.write(tall), { maxWidth: 800, maxHeight: 5000 });
    expect(out).toMatchObject({ width: 800, height: 2500, originalWidth: 1600, originalHeight: 12000, cropped: true });
    const decoded = PNG.sync.read(out.buffer);
    expect([decoded.width, decoded.height]).toEqual([800, 2500]);
  });

  it('crops without scaling when only the height is over', () => {
    const narrow = new PNG({ width: 400, height: 9000 });
    expect(downscaleForModel(PNG.sync.write(narrow), { maxWidth: 800, maxHeight: 5000 })).toMatchObject({
      width: 400,
      height: 5000,
      cropped: true,
    });
  });

  it('returns small images untouched', () => {
    const buffer = createTestPng(20, 10);
    const out = downscaleForModel(buffer);
    expect(out.buffer).toBe(buffer);
    expect(toModelImage(buffer, 'x')).toMatchObject({ width: 20, height: 10, label: 'x' });
  });

  it('elides inline images and redacts URL keys', () => {
    const elided = elideImages({ source: { data: IMG.data.repeat(20) }, image_url: { url: `data:image/png;base64,${IMG.data}` } }) as {
      source: { data: string };
      image_url: { url: string };
    };
    expect(elided.source.data).toMatch(/^<image /);
    expect(elided.image_url.url).toMatch(/^<image 10x10 /);
    expect(redactUrl('https://x/y?alt=1&key=abc&z=2')).toBe('https://x/y?alt=1&key=REDACTED&z=2');
  });
});

describe('resolveApiKey', () => {
  it('prefers FRONTGUARD_* and falls back to the vendor variable', () => {
    expect(resolveApiKey('gemini', { FRONTGUARD_GEMINI_KEY: ' a ', GEMINI_API_KEY: 'b' } as NodeJS.ProcessEnv)).toBe('a');
    expect(resolveApiKey('gemini', { GEMINI_API_KEY: 'b' } as NodeJS.ProcessEnv)).toBe('b');
    expect(() => resolveApiKey('anthropic', NO_ENV)).toThrow(
      expect.objectContaining({ kind: 'config', message: expect.stringContaining('FRONTGUARD_ANTHROPIC_KEY') }),
    );
  });
});
