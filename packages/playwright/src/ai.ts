/**
 * Optional AI classification for `visualTest`.
 *
 * Uses the same transport, prompt, schema and taxonomy as the CLI: the shared
 * provider module in `packages/cli/src/diff/ai-provider.ts` is bundled into
 * this package at build time, so there is one implementation and no runtime
 * dependency on `@frontguard/cli`.
 *
 * Failures are returned as a typed `aiError` and logged once per process, so
 * "no AI configured" and "AI is broken" look different.
 */

import {
  AIAnalysisError,
  CLASSIFICATION_SCHEMA,
  CLASSIFICATION_SYSTEM_PROMPT,
  DEFAULT_AI_MODELS,
  callModel,
  parseModelJson,
  resolveApiKey,
  toModelImage,
  validateClassification,
  type AIProviderName,
  type CallModelOptions,
} from '../../cli/src/diff/ai-provider.js';
import type { AIAnalysisResult, AIErrorInfo } from './types.js';

export interface AIOptions {
  provider: AIProviderName;
  model?: string;
  baseUrl?: string;
  /** Output-token cap per call, including reasoning/thinking tokens. */
  maxOutputTokens?: number;
  /** Wall-clock limit per HTTP attempt in milliseconds. */
  timeoutMs?: number;
}

/** Either a classification or the reason there is none. */
export interface AIOutcome {
  ai?: AIAnalysisResult;
  aiError?: AIErrorInfo;
}

export type AIDeps = Pick<CallModelOptions, 'fetchImpl' | 'retries' | 'backoffMs' | 'sleep' | 'env'>;

const warned = new Set<string>();

/** Logs an AI failure once per provider and error kind for this process. */
export function warnOnce(error: AIErrorInfo): void {
  const key = `${error.provider}:${error.kind}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[frontguard] AI analysis unavailable (${error.provider}/${error.model}, ${error.kind}): ${error.message}`);
}

/** Test hook: forget which warnings were already printed. */
export function resetAIWarnings(): void {
  warned.clear();
}

/**
 * Classifies a baseline/current pair (and the pixel diff overlay when given).
 * Never throws: failures come back as `aiError`.
 */
export async function analyzeWithAI(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: AIOptions,
  diffBuffer?: Buffer | null,
  deps: AIDeps = {},
): Promise<AIOutcome> {
  const provider = options.provider;
  const model = options.model ?? DEFAULT_AI_MODELS[provider];
  try {
    const apiKey = resolveApiKey(provider, deps.env);
    const images = [
      toModelImage(baselineBuffer, 'baseline'),
      toModelImage(currentBuffer, 'current'),
      ...(diffBuffer ? [toModelImage(diffBuffer, 'diff')] : []),
    ];
    const imageNote =
      images.length >= 3
        ? 'Image 1: baseline, Image 2: current, Image 3: pixel diff overlay.'
        : 'Image 1: baseline, Image 2: current. No pixel diff overlay was provided.';
    const response = await callModel(
      {
        provider,
        model,
        apiKey,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        userText: `Analyze these screenshots from a Playwright visual test. ${imageNote}`,
        images,
        schema: CLASSIFICATION_SCHEMA,
        baseUrl: options.baseUrl,
        maxOutputTokens: options.maxOutputTokens,
        timeoutMs: options.timeoutMs,
        label: 'playwright visualTest',
      },
      deps,
    );
    const parsed = parseModelJson(response.text, { structured: response.structured, provider });
    return { ai: validateClassification(parsed, provider) };
  } catch (err) {
    const e =
      err instanceof AIAnalysisError ? err : new AIAnalysisError(err instanceof Error ? err.message : String(err));
    return {
      aiError: {
        provider,
        model,
        kind: e.kind,
        ...(e.statusCode !== undefined ? { status: e.statusCode } : {}),
        message: e.message,
      },
    };
  }
}
