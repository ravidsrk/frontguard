import type { AIAnalysisResult } from './types.js';

export interface AIOptions {
  provider: 'openai' | 'anthropic' | 'gemini';
  model?: string;
  baseUrl?: string;
}

const SYSTEM_PROMPT = `You are a visual regression testing expert. You analyze two screenshots (baseline and current) and classify the visual difference.

Respond in JSON with exactly these fields:
{
  "classification": "regression" | "intentional" | "content_update" | "layout_shift" | "style_change",
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "explanation": "Brief description of what changed and why it matters"
}`;

/**
 * Analyze visual diff using AI vision API.
 * Returns undefined silently if no API key is configured.
 */
export async function analyzeWithAI(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: AIOptions
): Promise<AIAnalysisResult | undefined> {
  try {
    if (options.provider === 'anthropic') {
      return await analyzeWithAnthropic(
        baselineBuffer,
        currentBuffer,
        options.model,
        options.baseUrl
      );
    }
    if (options.provider === 'gemini') {
      return await analyzeWithGemini(
        baselineBuffer,
        currentBuffer,
        options.model,
        options.baseUrl
      );
    }
    return await analyzeWithOpenAI(
      baselineBuffer,
      currentBuffer,
      options.model,
      options.baseUrl
    );
  } catch {
    // AI is optional — fail silently
    return undefined;
  }
}

async function analyzeWithOpenAI(
  baseline: Buffer,
  current: Buffer,
  model?: string,
  baseUrl?: string
): Promise<AIAnalysisResult | undefined> {
  const apiKey = process.env.FRONTGUARD_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const endpoint = baseUrl
    ? baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, '')}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these two screenshots. The first is the baseline, the second is the current version. Identify and classify any visual differences.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${baseline.toString('base64')}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${current.toString('base64')}` },
            },
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) return undefined;

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return undefined;

  return JSON.parse(content) as AIAnalysisResult;
}

async function analyzeWithAnthropic(
  baseline: Buffer,
  current: Buffer,
  model?: string,
  baseUrl?: string
): Promise<AIAnalysisResult | undefined> {
  const apiKey = process.env.FRONTGUARD_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;

  const endpoint = baseUrl
    ? baseUrl.endsWith('/messages')
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, '')}/messages`
    : 'https://api.anthropic.com/v1/messages';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these two screenshots. The first is the baseline, the second is the current version. Identify and classify any visual differences.' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: baseline.toString('base64'),
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: current.toString('base64'),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) return undefined;

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) return undefined;

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return undefined;

  return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
}

async function analyzeWithGemini(
  baseline: Buffer,
  current: Buffer,
  model?: string,
  baseUrl?: string
): Promise<AIAnalysisResult | undefined> {
  const apiKey = process.env.FRONTGUARD_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  const resolvedModel = model || 'gemini-2.5-flash';
  const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const endpoint = base.includes(':generateContent')
    ? base
    : `${base}/models/${resolvedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Compare these two screenshots. The first is the baseline, the second is the current version. Identify and classify any visual differences.',
            },
            {
              inline_data: {
                mime_type: 'image/png',
                data: baseline.toString('base64'),
              },
            },
            {
              inline_data: {
                mime_type: 'image/png',
                data: current.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) return undefined;

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text;
  if (!text) return undefined;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return undefined;

  return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
}
