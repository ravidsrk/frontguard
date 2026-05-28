/**
 * AI-powered fix generation — CSS-first.
 *
 * When a diff is classified as a regression, this module asks the AI to
 * generate a *minimal* fix (a CSS patch, not a full file rewrite). It focuses
 * on the categories where AI is most reliable: overflow/truncation,
 * spacing/margins, fonts, responsive breakpoints, and z-index.
 *
 * Reuses the vision-API plumbing from `ai-vision.ts` (key resolution, the
 * OpenAI/Anthropic callers, image downscaling) with a fix-specific system
 * prompt so we don't double-call the vision API.
 *
 * @module diff/ai-fix
 */

import type {
  DiffResult,
  AIConfig,
  SuggestedFix,
  FixCategory,
  FixType,
} from '../core/types.js';
import {
  getApiKey,
  callOpenAI,
  callAnthropic,
  downscaleForAI,
} from './ai-vision.js';
import { retry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

/** System prompt instructing the model to produce a minimal structured fix. */
export const FIX_SYSTEM_PROMPT = `You are a senior frontend engineer fixing a VISUAL REGRESSION.

You receive:
1. A BASELINE screenshot (the correct/expected version)
2. A CURRENT screenshot (the broken version)
3. A PIXEL DIFF overlay (red = changed pixels)
4. Context: route, viewport, and the git diff (code changes) that likely caused the regression

Your job: produce the SMALLEST possible CSS patch that restores the baseline appearance.

RULES:
- Prefer CSS over HTML over config changes.
- Output a MINIMAL patch — a few CSS rules, NOT a full file.
- Target the specific broken behaviour (overflow, spacing, font, responsive breakpoint, z-index).
- Pick the most specific fix category that applies.
- Set confidence honestly: 0.9+ only when the cause is obvious from the diff; 0.5-0.7 when plausible but uncertain; below 0.5 if guessing.
- If you cannot determine a reliable fix, return confidence 0 and an empty patch.

FIX CATEGORIES: overflow-fix, spacing-fix, font-fix, responsive-fix, z-index-fix, other

Respond with JSON ONLY, no markdown fences:
{ "fixType": "css"|"html"|"config", "category": "<category>", "patch": "<minimal CSS/code patch>", "confidence": <0.0-1.0>, "explanation": "<what the fix does and why>", "target": "<optional CSS selector or file hint>" }`;

const VALID_CATEGORIES: FixCategory[] = [
  'overflow-fix',
  'spacing-fix',
  'font-fix',
  'responsive-fix',
  'z-index-fix',
  'other',
];

const VALID_FIX_TYPES: FixType[] = ['css', 'html', 'config'];

/** Error thrown when fix generation fails irrecoverably. */
export class AIFixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIFixError';
  }
}

/**
 * Parses and validates the model's JSON fix response.
 *
 * Tolerates markdown code fences and leading/trailing prose. Returns `null`
 * for an explicit no-fix response (confidence 0 / empty patch).
 *
 * @param raw - Raw model output.
 * @returns A validated {@link SuggestedFix}, or `null` if no usable fix.
 */
export function parseFixResponse(raw: string): SuggestedFix | null {
  // Strip markdown fences if present.
  let text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) text = fence[1].trim();

  // Extract the first JSON object.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new AIFixError('Fix response did not contain a JSON object');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch (err) {
    throw new AIFixError(
      `Failed to parse fix JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const patch = typeof parsed.patch === 'string' ? parsed.patch.trim() : '';

  // Explicit no-fix signal.
  if (confidence <= 0 || patch === '') return null;

  const category: FixCategory = VALID_CATEGORIES.includes(parsed.category as FixCategory)
    ? (parsed.category as FixCategory)
    : 'other';
  const fixType: FixType = VALID_FIX_TYPES.includes(parsed.fixType as FixType)
    ? (parsed.fixType as FixType)
    : 'css';

  return {
    fixType,
    category,
    patch,
    confidence: Math.max(0, Math.min(1, confidence)),
    explanation:
      typeof parsed.explanation === 'string' ? parsed.explanation : 'No explanation provided.',
    target: typeof parsed.target === 'string' ? parsed.target : undefined,
  };
}

/** Options for {@link generateFix}. */
export interface GenerateFixOptions {
  /** The git diff (code changes) that likely caused the regression. */
  gitDiff?: string;
}

/**
 * Generates a structured fix for a regression diff.
 *
 * @param diff    - The regression diff (must have baseline + current images).
 * @param config  - AI provider config.
 * @param options - Optional git-diff context.
 * @returns A {@link SuggestedFix}, or `null` if the model declined to fix.
 */
export async function generateFix(
  diff: DiffResult,
  config: AIConfig,
  options: GenerateFixOptions = {},
): Promise<SuggestedFix | null> {
  if (!diff.baselineImage || !diff.currentImage) {
    throw new AIFixError('Cannot generate fix: baseline or current image is missing.');
  }

  const apiKey = getApiKey(config.provider);
  const baselineB64 = downscaleForAI(diff.baselineImage).toString('base64');
  const currentB64 = downscaleForAI(diff.currentImage).toString('base64');
  const diffB64 = diff.diffImage ? downscaleForAI(diff.diffImage).toString('base64') : undefined;

  const contextLines: string[] = [
    `Route: ${diff.route.path} (viewport: ${diff.viewport}px, browser: ${diff.browser})`,
    `Pixel diff: ${diff.diffPercentage.toFixed(2)}%`,
  ];
  if (diff.aiAnalysis?.explanation) {
    contextLines.push(`Regression description: ${diff.aiAnalysis.explanation}`);
  }
  if (options.gitDiff) {
    // Cap git diff size to keep the prompt bounded.
    const capped = options.gitDiff.slice(0, 4000);
    contextLines.push(`\nGit diff that caused this change:\n${capped}`);
  }
  const contextText = contextLines.join('\n');

  logger.debug(`Generating fix for ${diff.route.path} @ ${diff.viewport}px with ${config.provider}`);

  const raw = await retry(
    () =>
      config.provider === 'openai'
        ? callOpenAI(apiKey, config.model, baselineB64, currentB64, diffB64, contextText, FIX_SYSTEM_PROMPT)
        : callAnthropic(apiKey, config.model, baselineB64, currentB64, diffB64, contextText, FIX_SYSTEM_PROMPT),
    {
      retries: 2,
      backoff: 2000,
      onRetry: (err, attempt) =>
        logger.warn(`Fix generation retry ${attempt}/2 for ${diff.route.path}: ${err.message}`),
    },
  );

  return parseFixResponse(raw);
}
