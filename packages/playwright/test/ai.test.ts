import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { analyzeWithAI } from '../src/ai.js';

const img = Buffer.from('fake-png');

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
  severity: 'high',
  explanation: 'Header color changed',
};

describe('analyzeWithAI — OpenAI', () => {
  it('returns undefined when no API key is set', async () => {
    const res = await analyzeWithAI(img, img, { provider: 'openai' });
    expect(res).toBeUndefined();
  });

  it('parses a valid JSON response and defaults to gpt-4.1-mini', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validResult) } }] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await analyzeWithAI(img, img, { provider: 'openai' });
    expect(res).toEqual(validResult);
    expect(spy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"gpt-4.1-mini"'),
      }),
    );
  });

  it('supports custom baseUrl and model for OpenAI', async () => {
    process.env.FRONTGUARD_OPENAI_KEY = 'sk-custom';
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validResult) } }] }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await analyzeWithAI(img, img, {
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: 'https://proxy.example.com/v1/',
    });
    expect(res).toEqual(validResult);
    expect(spy).toHaveBeenCalledWith(
      'https://proxy.example.com/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-4o"'),
      }),
    );
  });

  it('returns undefined on a non-ok response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 500 })) as typeof fetch;
    expect(await analyzeWithAI(img, img, { provider: 'openai' })).toBeUndefined();
  });

  it('returns undefined when content is missing', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as typeof fetch;
    expect(await analyzeWithAI(img, img, { provider: 'openai' })).toBeUndefined();
  });

  it('fails silently (undefined) when fetch throws', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await analyzeWithAI(img, img, { provider: 'openai' })).toBeUndefined();
  });
});

describe('analyzeWithAI — Anthropic', () => {
  it('returns undefined when no API key is set', async () => {
    expect(await analyzeWithAI(img, img, { provider: 'anthropic' })).toBeUndefined();
  });

  it('extracts JSON embedded in the text response and supports custom baseUrl', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: `Here: ${JSON.stringify(validResult)}` }] }),
        { status: 200 },
      ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;
    const res = await analyzeWithAI(img, img, {
      provider: 'anthropic',
      baseUrl: 'https://anthropic-proxy.example.com/v1',
    });
    expect(res).toEqual(validResult);
    expect(spy).toHaveBeenCalledWith(
      'https://anthropic-proxy.example.com/v1/messages',
      expect.any(Object),
    );
  });

  it('returns undefined when no JSON is present in the text', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'no json here' }] }), { status: 200 }),
    ) as typeof fetch;
    expect(await analyzeWithAI(img, img, { provider: 'anthropic' })).toBeUndefined();
  });

  it('returns undefined on a non-ok response', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    globalThis.fetch = vi.fn(async () => new Response('err', { status: 429 })) as typeof fetch;
    expect(await analyzeWithAI(img, img, { provider: 'anthropic' })).toBeUndefined();
  });
});

describe('analyzeWithAI — Gemini', () => {
  it('returns undefined when no Gemini API key is set', async () => {
    expect(await analyzeWithAI(img, img, { provider: 'gemini' })).toBeUndefined();
  });

  it('calls Gemini 2.5 Flash by default and parses JSON response', async () => {
    process.env.FRONTGUARD_GEMINI_KEY = 'gm-key-123';
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(validResult) }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const res = await analyzeWithAI(img, img, { provider: 'gemini' });
    expect(res).toEqual(validResult);
    expect(spy).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gm-key-123',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('supports GEMINI_API_KEY fallback and custom baseUrl + model', async () => {
    process.env.GEMINI_API_KEY = 'gm-fallback';
    const spy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: `\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\`` }],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const res = await analyzeWithAI(img, img, {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      baseUrl: 'https://gemini-gateway.example.com/v1beta/',
    });
    expect(res).toEqual(validResult);
    expect(spy).toHaveBeenCalledWith(
      'https://gemini-gateway.example.com/v1beta/models/gemini-2.5-pro:generateContent?key=gm-fallback',
      expect.any(Object),
    );
  });
});
