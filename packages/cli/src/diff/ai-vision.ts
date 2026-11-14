/**
 * AI-powered visual regression analysis.
 *
 * Sends baseline, current, and diff images to the configured vision model to
 * classify a change as a regression, an intentional change, or a content
 * update. The classification is advisory; pixel comparison decides pass/fail.
 *
 * Transport, defaults, schemas and error mapping live in `./ai-provider.ts`.
 *
 * @module diff/ai-vision
 */

import type { DiffResult, DiffCluster, AIAnalysis, AIConfig, AIProvider, AccessibilityViolation } from '../core/types.js';
import {
  AIAnalysisError,
  CLASSIFICATION_SCHEMA,
  CLASSIFICATION_SYSTEM_PROMPT,
  DEFAULT_AI_MODELS,
  callModel,
  downscaleForModel,
  parseModelJson,
  resolveApiKey,
  toModelImage,
  validateClassification,
  wrapUntrusted,
  type CallModelOptions,
  type ModelImage,
} from './ai-provider.js';
import { logger } from '../utils/logger.js';

export { AIAnalysisError, wrapUntrusted, UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from './ai-provider.js';

/** Optional extra context fused into the AI analysis prompt. */
export interface AnalyzeContext {
  /** Accessibility violations found on this route × viewport (axe-core). */
  accessibility?: AccessibilityViolation[];
}

/** Transport hooks for a model call (usage recording, retries, test doubles). */
export type AnalyzeOptions = Pick<
  CallModelOptions,
  'fetchImpl' | 'retries' | 'backoffMs' | 'sleep' | 'onCall' | 'onRetry' | 'env'
>;

/**
 * Builds a one-line accessibility context string for the AI prompt from a set
 * of violations, so the model can correlate a visual change with a known a11y
 * issue (e.g. a contrast regression that is also a visual change). Returns an
 * empty string when there are no violations. Pure — exposed for testing.
 */
export function buildAccessibilityContext(violations: AccessibilityViolation[]): string {
  if (!violations || violations.length === 0) return '';
  // De-duplicate by rule id, keep a stable order, and cap to avoid bloating the
  // prompt on pages with many violations.
  const seen = new Set<string>();
  const summary: string[] = [];
  for (const v of violations) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    summary.push(`${v.id} (${v.impact})`);
    if (summary.length >= 10) break;
  }
  return (
    `Known accessibility issues on this page (axe-core): ${summary.join(', ')}. ` +
    `If the visual change relates to any of these, note the connection in your explanation.`
  );
}

/**
 * Builds a concise DOM cluster attribution summary for the AI vision prompt
 * when diff clusters have been mapped to DOM selectors.
 */
export function buildDomClusterContext(clusters?: DiffCluster[]): string {
  if (!clusters || clusters.length === 0) return '';
  const attributed = clusters.filter((c) => c.targetSelector);
  if (attributed.length === 0) return '';
  const lines = attributed.slice(0, 5).map((c, idx) => {
    const top = c.affectedElements?.[0];
    const textHint = top?.textPreview ? ` (text: "${top.textPreview.slice(0, 40)}")` : '';
    return `Cluster #${idx + 1} (${c.bbox.x},${c.bbox.y} ${c.bbox.width}x${c.bbox.height}, ${c.rawDiffPixels}px): ${c.targetSelector}${textHint}`;
  });
  return `Spatial DOM-Cluster Attribution:\n${lines.join('\n')}`;
}

/** Describes the attached images in the order they are sent. */
export function describeImages(count: number): string {
  return count >= 3
    ? 'Image 1: baseline, Image 2: current, Image 3: pixel diff overlay.'
    : 'Image 1: baseline, Image 2: current. No pixel diff overlay was provided.';
}

/**
 * Downscale a PNG buffer to a maximum width for AI analysis.
 * Returns the original buffer unchanged if already within maxWidth.
 */
export function downscaleForAI(buffer: Buffer, maxWidth = 800): Buffer {
  return downscaleForModel(buffer, { maxWidth, maxHeight: Number.POSITIVE_INFINITY }).buffer;
}

/** Images for a diff in prompt order: baseline, current, then the overlay when present. */
export function diffImages(diff: DiffResult): ModelImage[] {
  if (!diff.baselineImage || !diff.currentImage) return [];
  return [
    toModelImage(diff.baselineImage, 'baseline'),
    toModelImage(diff.currentImage, 'current'),
    ...(diff.diffImage ? [toModelImage(diff.diffImage, 'diff')] : []),
  ];
}

/**
 * Analyze a visual diff using an AI vision model.
 *
 * @param diff    - The diff result containing baseline, current, and diff images
 * @param config  - AI provider configuration
 * @param context - Optional accessibility findings for the same route × viewport
 * @param options - Transport hooks (usage recording, retries, test doubles)
 * @returns AI analysis with classification, explanation, severity, and confidence
 * @throws {AIAnalysisError} If the API key is missing, the request fails, or the response is invalid
 */
export async function analyzeWithAI(
  diff: DiffResult,
  config: AIConfig,
  context?: AnalyzeContext,
  options: AnalyzeOptions = {},
): Promise<AIAnalysis> {
  const apiKey = getApiKey(config.provider, options.env);
  const model = config.model ?? DEFAULT_AI_MODELS[config.provider];

  if (!diff.baselineImage || !diff.currentImage) {
    throw new AIAnalysisError(
      'Cannot analyze diff: baseline or current image is missing. This may be a new page.',
      undefined,
      config.provider,
      { kind: 'config', model },
    );
  }

  const images = diffImages(diff);
  const contextLines: string[] = [
    wrapUntrusted(
      'Route path (untrusted)',
      `${diff.route.path} (viewport: ${diff.viewport}px, browser: ${diff.browser})`,
    ),
    `Pixel diff: ${diff.diffPercentage.toFixed(2)}% of pixels changed`,
  ];
  if (diff.status) contextLines.push(`Status: ${diff.status}`);
  const domClusterContext = buildDomClusterContext(diff.clusters);
  if (domClusterContext) {
    contextLines.push(wrapUntrusted('DOM Cluster Attribution (untrusted)', domClusterContext));
  }
  // Fuse accessibility findings so the model can correlate a visual change with
  // a known a11y issue on the same page. Those findings are crawled-page data.
  if (context?.accessibility && context.accessibility.length > 0) {
    const a11yContext = buildAccessibilityContext(context.accessibility);
    if (a11yContext) contextLines.push(wrapUntrusted('Accessibility findings (untrusted)', a11yContext));
  }
  const userText = `Analyze these screenshots. ${describeImages(images.length)}\n\nContext:\n${contextLines.join('\n')}`;

  logger.debug(`Analyzing ${diff.route.path} @ ${diff.viewport}px with ${config.provider}/${model}`);

  const response = await callModel(
    {
      provider: config.provider,
      model,
      apiKey,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      userText,
      images,
      schema: CLASSIFICATION_SCHEMA,
      baseUrl: config.baseUrl,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      label: `analyze ${diff.route.path} @${diff.viewport}`,
    },
    {
      onRetry: (err, attempt) => {
        logger.warn(`AI analysis retry ${attempt} for ${diff.route.path}: ${err.message}`);
      },
      ...options,
    },
  );

  const parsed = parseModelJson(response.text, { structured: response.structured, provider: config.provider });
  return { ...validateClassification(parsed, config.provider), rawResponse: response.text };
}

export const analyzePair = analyzeWithAI;

/** Resolves the provider API key from `FRONTGUARD_*_KEY` (or the vendor's own variable). */
export function getApiKey(provider: AIProvider, env: NodeJS.ProcessEnv = process.env): string {
  return resolveApiKey(provider, env);
}
