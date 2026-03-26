/**
 * AI-powered visual regression analysis.
 *
 * Sends baseline, current, and diff images to OpenAI or Anthropic vision models
 * to classify changes as regressions, intentional changes, or content updates.
 *
 * @module diff/ai-vision
 */

import type { DiffResult, AIAnalysis, AIConfig, ChangeClassification, Severity } from '../core/types.js';
import { retry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are analyzing a visual regression test. Compare these two screenshots of a web page. The first is the baseline (expected), the second is the current version. A pixel diff overlay is also provided highlighting the differences.

Classify this change as one of:
- 'regression': An unintended visual bug (broken layout, missing elements, overlapping text, wrong colors, etc.)
- 'intentional': A deliberate design change (new component, redesign, updated branding)
- 'content_update': Content changed but layout is intact (different text, updated numbers, new blog posts)

Respond with JSON only, no markdown wrapping:
{ "classification": "regression"|"intentional"|"content_update", "explanation": "<concise description of what changed>", "severity": "critical"|"warning"|"info", "confidence": <0-100>, "suggestedFix": "<optional: how to fix if regression>" }`;

const REQUEST_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AIAnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'AIAnalysisError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a visual diff using an AI vision model.
 *
 * @param diff   - The diff result containing baseline, current, and diff images
 * @param config - AI provider configuration
 * @returns AI analysis with classification, explanation, severity, and confidence
 * @throws {AIAnalysisError} If the API key is missing, the request fails, or the response is malformed
 */
export async function analyzeWithAI(
  diff: DiffResult,
  config: AIConfig,
): Promise<AIAnalysis> {
  const apiKey = getApiKey(config.provider);

  if (!diff.baselineImage || !diff.currentImage) {
    throw new AIAnalysisError(
      'Cannot analyze diff: baseline or current image is missing. This may be a new page.',
      undefined,
      config.provider,
    );
  }

  const baselineB64 = diff.baselineImage.toString('base64');
  const currentB64 = diff.currentImage.toString('base64');
  const diffB64 = diff.diffImage?.toString('base64');

  logger.debug(`Analyzing ${diff.route.path} @ ${diff.viewport}px with ${config.provider}/${config.model}`);

  const rawResponse = await retry(
    () => config.provider === 'openai'
      ? callOpenAI(apiKey, config.model, baselineB64, currentB64, diffB64)
      : callAnthropic(apiKey, config.model, baselineB64, currentB64, diffB64),
    {
      retries: 3,
      backoff: 2000,
      isRetryable: (err) => {
        if (err instanceof AIAnalysisError) {
          // Retry on rate limit (429) and server errors (5xx)
          return err.statusCode === 429 || (err.statusCode !== undefined && err.statusCode >= 500);
        }
        return true; // Retry network errors
      },
      onRetry: (err, attempt) => {
        logger.warn(`AI analysis retry ${attempt}/3 for ${diff.route.path}: ${err.message}`);
      },
    },
  );

  return parseAIResponse(rawResponse, config.provider);
}

// ---------------------------------------------------------------------------
// API Key Resolution
// ---------------------------------------------------------------------------

function getApiKey(provider: 'openai' | 'anthropic'): string {
  const envVar = provider === 'openai' ? 'FRONTGUARD_OPENAI_KEY' : 'FRONTGUARD_ANTHROPIC_KEY';
  const key = process.env[envVar];

  if (!key || key.trim() === '') {
    throw new AIAnalysisError(
      `No API key found. Set the ${envVar} environment variable to enable AI analysis with ${provider}.`,
      undefined,
      provider,
    );
  }

  return key.trim();
}

// ---------------------------------------------------------------------------
// OpenAI Vision API
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  baselineB64: string,
  currentB64: string,
  diffB64?: string,
): Promise<string> {
  const imageMessages: Array<{type: 'image_url'; image_url: {url: string; detail: string}}> = [
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${baselineB64}`, detail: 'high' },
    },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${currentB64}`, detail: 'high' },
    },
  ];

  if (diffB64) {
    imageMessages.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${diffB64}`, detail: 'high' },
    });
  }

  const body = {
    model,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze these screenshots. Image 1: baseline, Image 2: current, Image 3: pixel diff overlay.' },
          ...imageMessages,
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      handleHTTPError(response.status, errorBody, 'openai', model);
    }

    const data = await response.json() as {
      choices?: Array<{message?: {content?: string}}>;
      error?: {message?: string};
    };

    if (data.error) {
      throw new AIAnalysisError(
        `OpenAI API error: ${data.error.message ?? 'Unknown error'}`,
        undefined,
        'openai',
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIAnalysisError(
        'OpenAI returned an empty response — no content in choices[0].message.content',
        undefined,
        'openai',
      );
    }

    return content;
  } catch (err) {
    if (err instanceof AIAnalysisError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new AIAnalysisError(
        `OpenAI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        408,
        'openai',
      );
    }
    throw new AIAnalysisError(
      `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      'openai',
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

async function callAnthropic(
  apiKey: string,
  model: string,
  baselineB64: string,
  currentB64: string,
  diffB64?: string,
): Promise<string> {
  const imageBlocks: Array<{type: 'image'; source: {type: 'base64'; media_type: string; data: string}}> = [
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: baselineB64 },
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: currentB64 },
    },
  ];

  if (diffB64) {
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: diffB64 },
    });
  }

  const body = {
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: 'Analyze these screenshots. Image 1: baseline, Image 2: current, Image 3: pixel diff overlay.' },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      handleHTTPError(response.status, errorBody, 'anthropic', model);
    }

    const data = await response.json() as {
      content?: Array<{type: string; text?: string}>;
      error?: {type?: string; message?: string};
    };

    if (data.error) {
      throw new AIAnalysisError(
        `Anthropic API error: ${data.error.message ?? 'Unknown error'}`,
        undefined,
        'anthropic',
      );
    }

    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      throw new AIAnalysisError(
        'Anthropic returned an empty response — no text block in content',
        undefined,
        'anthropic',
      );
    }

    return textBlock.text;
  } catch (err) {
    if (err instanceof AIAnalysisError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new AIAnalysisError(
        `Anthropic request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        408,
        'anthropic',
      );
    }
    throw new AIAnalysisError(
      `Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      'anthropic',
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse AI response text into a structured AIAnalysis object.
 * Handles:
 * - Raw JSON
 * - JSON wrapped in markdown code blocks (```json ... ```)
 * - Malformed responses with partial JSON
 */
function parseAIResponse(rawText: string, provider: string): AIAnalysis {
  let jsonStr = rawText.trim();

  // Strip markdown code block wrapping
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to extract JSON object if text contains extra content
  if (!jsonStr.startsWith('{')) {
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new AIAnalysisError(
      `Failed to parse AI response as JSON. Raw response: ${rawText.substring(0, 500)}`,
      undefined,
      provider,
    );
  }

  // Validate required fields
  const validClassifications: ChangeClassification[] = ['regression', 'intentional', 'content_update'];
  const validSeverities: Severity[] = ['critical', 'warning', 'info'];

  const classification = parsed.classification as string;
  if (!validClassifications.includes(classification as ChangeClassification)) {
    throw new AIAnalysisError(
      `Invalid classification "${classification}" from ${provider}. Expected one of: ${validClassifications.join(', ')}`,
      undefined,
      provider,
    );
  }

  const severity = parsed.severity as string;
  if (!validSeverities.includes(severity as Severity)) {
    throw new AIAnalysisError(
      `Invalid severity "${severity}" from ${provider}. Expected one of: ${validSeverities.join(', ')}`,
      undefined,
      provider,
    );
  }

  const explanation = parsed.explanation;
  if (typeof explanation !== 'string' || explanation.trim() === '') {
    throw new AIAnalysisError(
      `Missing or empty explanation from ${provider}`,
      undefined,
      provider,
    );
  }

  let confidence = Number(parsed.confidence);
  if (isNaN(confidence)) {
    confidence = 50; // Default to mid-confidence on parse failure
  }
  // Normalize: the types.ts says confidence is 0–1 but prompt says 0–100
  if (confidence > 1) {
    confidence = confidence / 100;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    classification: classification as ChangeClassification,
    explanation: explanation.trim(),
    severity: severity as Severity,
    confidence,
    suggestedFix: typeof parsed.suggestedFix === 'string' ? parsed.suggestedFix.trim() : undefined,
    rawResponse: rawText,
  };
}

// ---------------------------------------------------------------------------
// HTTP Error Handling
// ---------------------------------------------------------------------------

function handleHTTPError(
  status: number,
  body: string,
  provider: string,
  model: string,
): never {
  let message: string;

  switch (status) {
    case 401:
    case 403:
      message = `Authentication failed for ${provider}. Check your ${
        provider === 'openai' ? 'FRONTGUARD_OPENAI_KEY' : 'FRONTGUARD_ANTHROPIC_KEY'
      } environment variable — the API key may be invalid or expired.`;
      break;
    case 404:
      message = `Model "${model}" not found on ${provider}. Check the model name in your Frontguard config.`;
      break;
    case 429:
      message = `Rate limited by ${provider}. The request will be retried with exponential backoff.`;
      break;
    default:
      if (status >= 500) {
        message = `${provider} server error (${status}). The request will be retried.`;
      } else {
        // Try to extract error message from body
        let detail = '';
        try {
          const parsed = JSON.parse(body);
          detail = parsed.error?.message ?? parsed.message ?? body.substring(0, 200);
        } catch {
          detail = body.substring(0, 200);
        }
        message = `${provider} API error (${status}): ${detail}`;
      }
  }

  throw new AIAnalysisError(message, status, provider);
}
