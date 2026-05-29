/**
 * Model-as-Judge (zero-baseline) evaluation (Task 8.4).
 *
 * Instead of comparing against approved baseline screenshots, this mode asks an
 * AI vision model to evaluate a screenshot against *design intent*:
 *
 * - **Without Figma:** general UI heuristics (alignment, contrast, overflow,
 *   spacing, typography, responsive behaviour).
 * - **With Figma:** the screenshot is compared against the corresponding Figma
 *   frame for design compliance.
 *
 * No baseline images or snapshot directories are required — it works on the
 * very first run. This is an **experimental / beta** feature gated behind
 * `--mode judge`.
 *
 * @module diff/model-judge
 */

import type {
  AIConfig,
  JudgeResult,
  JudgeIssue,
  JudgeIssueCategory,
  Severity,
  ScreenshotResult,
} from '../core/types.js';
import { downscaleForAI, getApiKey } from './ai-vision.js';
import { retry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

const REQUEST_TIMEOUT_MS = 60_000;

const HEURISTIC_PROMPT = `You are a meticulous UI/UX design reviewer. You will receive a single SCREENSHOT of a rendered web page and context metadata.

Your job: evaluate the screenshot for VISUAL QUALITY DEFECTS using common UI heuristics. There is NO baseline — judge against good design principles.

CHECK FOR:
- alignment: misaligned elements, inconsistent margins/edges, off-grid content
- contrast: low text/background contrast, unreadable text
- overflow: clipped text, content spilling out of containers, horizontal scrollbars
- spacing: cramped or excessive whitespace, inconsistent gaps
- typography: inconsistent font sizes/weights, orphaned text, broken line-height
- responsive: layout that looks broken for the given viewport width
- color: clashing colors, accidental color usage

SEVERITY:
- critical: page looks broken, content unreadable/unusable, major layout failure
- warning: noticeable defect a designer would flag, but page is usable
- info: minor polish issue

Respond with JSON only, no markdown wrapping:
{ "pass": <boolean>, "confidence": <0.0-1.0>, "issues": [ { "category": "alignment"|"contrast"|"overflow"|"spacing"|"typography"|"responsive"|"color"|"design-deviation"|"accessibility"|"other", "severity": "critical"|"warning"|"info", "description": "<what's wrong>", "location": "<optional region/selector>", "suggestion": "<optional fix>" } ] }

A screenshot with NO critical or warning issues should "pass": true.`;

const FIGMA_PROMPT = `You are a meticulous design-compliance reviewer. You will receive TWO images:
1. The FIGMA DESIGN (the intended design)
2. The RENDERED SCREENSHOT (the actual implementation)

Your job: determine whether the implementation faithfully matches the design. Flag DEVIATIONS.

CHECK FOR:
- design-deviation: spacing, sizing, positioning, or color that differs from the design
- typography: font family/size/weight mismatches vs the design
- color: color values that don't match the design
- alignment: elements positioned differently than designed
- overflow: content clipped or overflowing vs the design
- responsive: layout that doesn't reflect the design at this viewport

SEVERITY:
- critical: implementation looks substantially different from the design
- warning: noticeable deviation a designer would reject
- info: minor pixel-level difference

Respond with JSON only, no markdown wrapping:
{ "pass": <boolean>, "confidence": <0.0-1.0>, "issues": [ { "category": "design-deviation"|"typography"|"color"|"alignment"|"overflow"|"responsive"|"spacing"|"contrast"|"accessibility"|"other", "severity": "critical"|"warning"|"info", "description": "<the deviation>", "location": "<optional region>", "suggestion": "<optional fix>" } ] }

An implementation that matches the design (no critical/warning deviations) should "pass": true.`;

const VALID_CATEGORIES: ReadonlySet<JudgeIssueCategory> = new Set([
  'alignment',
  'contrast',
  'overflow',
  'spacing',
  'typography',
  'responsive',
  'color',
  'design-deviation',
  'accessibility',
  'other',
]);

const VALID_SEVERITIES: ReadonlySet<Severity> = new Set(['critical', 'warning', 'info']);

/** Error raised when judge evaluation fails. */
export class JudgeError extends Error {
  constructor(
    message: string,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'JudgeError';
  }
}

/**
 * Builds the context metadata string sent alongside the screenshot.
 */
export function buildJudgeContext(screenshot: ScreenshotResult): string {
  const lines = [
    `Route: ${screenshot.route.path} (viewport: ${screenshot.viewport}px, browser: ${screenshot.browser})`,
  ];
  if (screenshot.consoleErrors.length > 0) {
    lines.push(`Console errors during load: ${screenshot.consoleErrors.length}`);
  }
  return lines.join('\n');
}

/**
 * Parses the raw LLM JSON response into a validated set of issues + verdict.
 *
 * Tolerates markdown-fenced JSON and coerces invalid categories/severities to
 * safe defaults. Throws {@link JudgeError} only when no JSON can be recovered.
 */
export function parseJudgeResponse(rawText: string): {
  pass: boolean;
  confidence: number;
  issues: JudgeIssue[];
} {
  let jsonStr = rawText.trim();

  // Strip markdown code fences.
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Fall back to the first {...} block.
  if (!jsonStr.startsWith('{')) {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new JudgeError(`Could not parse judge response as JSON: ${rawText.slice(0, 120)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: JudgeIssue[] = rawIssues.map((raw) => {
    const i = raw as Record<string, unknown>;
    const category = VALID_CATEGORIES.has(i.category as JudgeIssueCategory)
      ? (i.category as JudgeIssueCategory)
      : 'other';
    const severity = VALID_SEVERITIES.has(i.severity as Severity) ? (i.severity as Severity) : 'info';
    return {
      category,
      severity,
      description: typeof i.description === 'string' ? i.description : 'Unspecified issue',
      location: typeof i.location === 'string' ? i.location : undefined,
      suggestion: typeof i.suggestion === 'string' ? i.suggestion : undefined,
    };
  });

  // Derive pass: explicit boolean wins; otherwise pass iff no critical/warning issues.
  const hasBlocking = issues.some((i) => i.severity === 'critical' || i.severity === 'warning');
  const pass = typeof obj.pass === 'boolean' ? obj.pass : !hasBlocking;

  const confidence =
    typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5;

  return { pass, confidence, issues };
}

/** Calls OpenAI's vision API with 1–2 images and a judge prompt. */
async function callOpenAIJudge(
  apiKey: string,
  model: string,
  images: string[],
  contextText: string,
  systemPrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const imageMessages = images.map((b64) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' },
  }));
  const body = {
    model,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [{ type: 'text', text: contextText }, ...imageMessages] },
    ],
  };
  const res = await withTimeout((signal) =>
    fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new JudgeError(`OpenAI judge request failed: ${res.status} ${errorBody.slice(0, 120)}`, 'openai');
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new JudgeError('OpenAI judge returned an empty response', 'openai');
  return content;
}

/** Calls Anthropic's messages API with 1–2 images and a judge prompt. */
async function callAnthropicJudge(
  apiKey: string,
  model: string,
  images: string[],
  contextText: string,
  systemPrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const imageBlocks = images.map((b64) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png', data: b64 },
  }));
  const body = {
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: contextText }] }],
  };
  const res = await withTimeout((signal) =>
    fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    }),
  );
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new JudgeError(`Anthropic judge request failed: ${res.status} ${errorBody.slice(0, 120)}`, 'anthropic');
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text;
  if (!content) throw new JudgeError('Anthropic judge returned an empty response', 'anthropic');
  return content;
}

/** Wraps a fetch call with an abort timeout. */
async function withTimeout(fn: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Options for {@link judgeScreenshot}. */
export interface JudgeOptions {
  /** AI provider + model. */
  ai: AIConfig;
  /** Optional Figma design reference PNG for compliance judging. */
  figmaReference?: Buffer;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Injectable API key resolver (tests). */
  apiKeyResolver?: (provider: 'openai' | 'anthropic') => string;
}

/**
 * Evaluates a single screenshot against design intent and returns a structured
 * {@link JudgeResult}. Never throws — failures are captured in `result.error`
 * with `pass: false`.
 */
export async function judgeScreenshot(
  screenshot: ScreenshotResult,
  options: JudgeOptions,
): Promise<JudgeResult> {
  const { ai, figmaReference, fetchImpl = fetch } = options;
  const withDesignReference = Boolean(figmaReference);
  const base: Pick<JudgeResult, 'route' | 'viewport' | 'browser' | 'withDesignReference'> = {
    route: screenshot.route,
    viewport: screenshot.viewport,
    browser: screenshot.browser,
    withDesignReference,
  };

  try {
    const apiKey = (options.apiKeyResolver ?? getApiKey)(ai.provider);

    // Build images: [figma?, screenshot] for compliance, [screenshot] for heuristic.
    const screenshotB64 = downscaleForAI(screenshot.buffer).toString('base64');
    const images = withDesignReference
      ? [downscaleForAI(figmaReference as Buffer).toString('base64'), screenshotB64]
      : [screenshotB64];

    const systemPrompt = withDesignReference ? FIGMA_PROMPT : HEURISTIC_PROMPT;
    const contextText = withDesignReference
      ? `Image 1 is the Figma design, Image 2 is the rendered screenshot.\n\n${buildJudgeContext(screenshot)}`
      : `Evaluate this rendered screenshot.\n\n${buildJudgeContext(screenshot)}`;

    logger.debug(`Judging ${screenshot.route.path} @ ${screenshot.viewport}px (figma=${withDesignReference})`);

    const raw = await retry(
      () =>
        ai.provider === 'openai'
          ? callOpenAIJudge(apiKey, ai.model, images, contextText, systemPrompt, fetchImpl)
          : callAnthropicJudge(apiKey, ai.model, images, contextText, systemPrompt, fetchImpl),
      { retries: 2, backoff: 1000 },
    );

    const { pass, confidence, issues } = parseJudgeResponse(raw);
    return { ...base, pass, confidence, issues, rawResponse: raw };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Judge failed for ${screenshot.route.path}: ${message}`);
    return { ...base, pass: false, confidence: 0, issues: [], error: message };
  }
}

/**
 * Summarises a set of judge results into pass/fail counts and the worst
 * severity present. Used to derive the run exit code.
 */
export function summariseJudgements(results: JudgeResult[]): {
  total: number;
  passed: number;
  failed: number;
  critical: number;
  warnings: number;
} {
  let passed = 0;
  let failed = 0;
  let critical = 0;
  let warnings = 0;
  for (const r of results) {
    if (r.pass) passed += 1;
    else failed += 1;
    for (const issue of r.issues) {
      if (issue.severity === 'critical') critical += 1;
      else if (issue.severity === 'warning') warnings += 1;
    }
  }
  return { total: results.length, passed, failed, critical, warnings };
}
