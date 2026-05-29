import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { analyzeWithAI } from '../src/ai.js';

const img = Buffer.from('fake-png');

const AI_ENV = [
  'FRONTGUARD_OPENAI_KEY',
  'OPENAI_API_KEY',
  'FRONTGUARD_ANTHROPIC_KEY',
  'ANTHROPIC_API_KEY',
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

  it('parses a valid JSON response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validResult) } }] }), { status: 200 }),
    ) as typeof fetch;
    const res = await analyzeWithAI(img, img, { provider: 'openai', model: 'gpt-4o' });
    expect(res).toEqual(validResult);
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

  it('extracts JSON embedded in the text response', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: `Here: ${JSON.stringify(validResult)}` }] }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const res = await analyzeWithAI(img, img, { provider: 'anthropic' });
    expect(res).toEqual(validResult);
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
