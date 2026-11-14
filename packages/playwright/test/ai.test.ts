import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { PNG } from 'pngjs';
import { analyzeWithAI, resetAIWarnings, warnOnce } from '../src/ai.js';
import { CLASSIFICATIONS, SEVERITIES, DEFAULT_AI_MODELS } from '../../cli/src/diff/ai-provider.js';

function png(width: number, height: number): Buffer {
  const p = new PNG({ width, height });
  p.data.fill(180);
  return PNG.sync.write(p);
}

const img = png(20, 20);
const NO_RETRY = { retries: 0 };

const AI_ENV = [
  'FRONTGUARD_OPENAI_KEY',
  'OPENAI_API_KEY',
  'FRONTGUARD_ANTHROPIC_KEY',
  'ANTHROPIC_API_KEY',
  'FRONTGUARD_GEMINI_KEY',
  'GEMINI_API_KEY',
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of AI_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetAIWarnings();
});

afterEach(() => {
  for (const k of AI_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const validResult = {
  classification: 'regression',
  severity: 'warning',
  explanation: 'Header color changed',
  confidence: 0.7,
  suggestedFix: null,
};

function openAIFetch(content: unknown = validResult) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }),
  );
}

describe('analyzeWithAI', () => {
  it('returns a config error, not silence, when no API key is set', async () => {
    const res = await analyzeWithAI(img, img, { provider: 'openai' });
    expect(res.ai).toBeUndefined();
    expect(res.aiError).toMatchObject({
      provider: 'openai',
      model: DEFAULT_AI_MODELS.openai,
      kind: 'config',
      message: expect.stringContaining('FRONTGUARD_OPENAI_KEY'),
    });
  });

  it('classifies with the shared prompt, schema and default model', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const fetchImpl = openAIFetch();
    const res = await analyzeWithAI(img, img, { provider: 'openai' }, png(20, 20), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ai).toEqual({
      classification: 'regression',
      severity: 'warning',
      explanation: 'Header color changed',
      confidence: 0.7,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(DEFAULT_AI_MODELS.openai);
    expect(body.response_format.json_schema.name).toBe('frontguard_classification');
    expect(body.messages[0].content).toContain('visual regression reviewer');
    // baseline, current and the pixel diff overlay
    expect(body.messages[1].content.filter((c: { type: string }) => c.type === 'image_url')).toHaveLength(3);
  });

  it.each([
    [404, 'not_found', /Frontguard's default anthropic model/],
    [401, 'auth', /Authentication failed/],
  ])('reports HTTP %s as %s with an actionable message', async (status, kind, message) => {
    process.env.FRONTGUARD_ANTHROPIC_KEY = 'k';
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"x"}}', { status }));
    const res = await analyzeWithAI(img, img, { provider: 'anthropic' }, null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ...NO_RETRY,
    });
    expect(res.aiError).toMatchObject({ provider: 'anthropic', kind, status });
    expect(res.aiError?.message).toMatch(message);
  });

  it('reports timeouts', async () => {
    process.env.FRONTGUARD_GEMINI_KEY = 'k';
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const res = await analyzeWithAI(img, img, { provider: 'gemini', timeoutMs: 10 }, null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ...NO_RETRY,
    });
    expect(res.aiError).toMatchObject({ kind: 'timeout', status: 408 });
  });

  it('rejects answers outside the shared taxonomy', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const res = await analyzeWithAI(img, img, { provider: 'openai' }, null, {
      fetchImpl: openAIFetch({ ...validResult, classification: 'layout_shift' }) as unknown as typeof fetch,
    });
    expect(res.aiError).toMatchObject({ kind: 'invalid_output' });
  });

  it('sends tall full-page screenshots within provider image limits', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const fetchImpl = openAIFetch();
    await analyzeWithAI(png(1440, 12000), png(1440, 12000), { provider: 'openai' }, null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    for (const part of body.messages[1].content.filter((c: { type: string }) => c.type === 'image_url')) {
      const decoded = PNG.sync.read(Buffer.from(part.image_url.url.split(',')[1], 'base64'));
      expect(decoded.width).toBeLessThanOrEqual(800);
      expect(decoded.height).toBeLessThanOrEqual(8000);
    }
  });

  it('uses the same taxonomy as the CLI', () => {
    expect([...CLASSIFICATIONS]).toEqual(['regression', 'intentional', 'content_update']);
    expect([...SEVERITIES]).toEqual(['critical', 'warning', 'info']);
  });
});

describe('warnOnce', () => {
  it('warns once per provider and error kind', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = { provider: 'openai' as const, model: 'm', kind: 'auth' as const, message: 'bad key' };
    warnOnce(error);
    warnOnce(error);
    warnOnce({ ...error, kind: 'timeout' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toContain('[frontguard] AI analysis unavailable (openai/m, auth): bad key');
  });
});
