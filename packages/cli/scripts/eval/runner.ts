/**
 * Runs the AI eval: classifies each case through the production code path
 * (`analyzeWithAI`), scores the answers, and optionally checks generated fixes
 * by re-rendering the broken page with the patch applied.
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { analyzeWithAI } from '../../src/diff/ai-vision.js';
import { generateFix } from '../../src/diff/ai-fix.js';
import { DEFAULT_AI_MODELS, type AIProviderName } from '../../src/diff/ai-provider.js';
import { AIUsageTracker } from '../../src/core/ai-usage.js';
import type { AIConfig, AIUsageSummary, DiffResult } from '../../src/core/types.js';
import { score } from './metrics.js';
import { createMockTransport } from './mock.js';
import { syntheticCases } from './synthetic.js';
import type { EvalCase, EvalCaseResult, EvalMetrics, FixEvalResult } from './types.js';

export interface EvalOptions {
  provider: AIProviderName;
  model?: string;
  baseUrl?: string;
  /** Use canned answers instead of calling the provider. */
  mock?: boolean;
  sets?: Array<EvalCase['set']>;
  /** Also generate fixes for clear regression UI cases and re-render them. */
  fixes?: boolean;
  /** Pre-built cases (tests). Defaults to the selected sets. */
  cases?: EvalCase[];
  fetchImpl?: typeof fetch;
  retries?: number;
  /** Changed-pixel ratio under which a patched page counts as restored. */
  fixTolerance?: number;
}

export interface EvalReport {
  timestamp: string;
  provider: AIProviderName;
  model: string;
  baseUrl?: string;
  mock: boolean;
  sets: Array<EvalCase['set']>;
  skippedSets: Array<{ set: EvalCase['set']; reason: string }>;
  metrics: EvalMetrics;
  cases: EvalCaseResult[];
  fixes?: { attempted: number; restored: number; results: FixEvalResult[] };
  usage: AIUsageSummary;
}

/** Diff overlay and changed-pixel ratio between two PNGs of the same size. */
export function pixelDiff(before: Buffer, after: Buffer): { overlay: Buffer; ratio: number } {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pad = (src: PNG): PNG => {
    if (src.width === width && src.height === height) return src;
    const out = new PNG({ width, height, fill: true });
    for (let y = 0; y < src.height; y++) {
      src.data.copy(out.data, y * width * 4, y * src.width * 4, (y + 1) * src.width * 4);
    }
    return out;
  };
  const overlay = new PNG({ width, height });
  const changed = pixelmatch(pad(a).data, pad(b).data, overlay.data, width, height, { threshold: 0.1 });
  return { overlay: PNG.sync.write(overlay), ratio: changed / (width * height) };
}

function toDiff(c: EvalCase, overlay: Buffer, ratio: number): DiffResult {
  return {
    route: { path: `/eval/${c.id}` },
    viewport: c.viewport,
    browser: 'chromium',
    status: 'changed',
    diffPercentage: ratio * 100,
    baselineImage: c.before,
    currentImage: c.after,
    diffImage: overlay,
  };
}

async function loadCases(sets: Array<EvalCase['set']>): Promise<{
  cases: EvalCase[];
  skipped: EvalReport['skippedSets'];
}> {
  const cases: EvalCase[] = [];
  const skipped: EvalReport['skippedSets'] = [];
  if (sets.includes('synthetic')) cases.push(...syntheticCases());
  if (sets.includes('ui')) {
    const { canRenderUI, uiCases } = await import('./ui.js');
    if (await canRenderUI()) cases.push(...(await uiCases()));
    else skipped.push({ set: 'ui', reason: 'Playwright Chromium is not installed (npx playwright install chromium)' });
  }
  return { cases, skipped };
}

export async function runEval(opts: EvalOptions): Promise<EvalReport> {
  const sets = opts.sets ?? ['synthetic', 'ui'];
  const loaded = opts.cases ? { cases: opts.cases, skipped: [] } : await loadCases(sets);
  const model = opts.model ?? DEFAULT_AI_MODELS[opts.provider];
  const ai: AIConfig = { provider: opts.provider, model, ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}) };
  const mock = opts.mock ? createMockTransport(loaded.cases) : undefined;
  const fetchImpl = opts.fetchImpl ?? mock?.fetchImpl;
  const env = opts.mock ? { ...process.env, [`FRONTGUARD_${opts.provider.toUpperCase()}_KEY`]: 'mock-key' } : process.env;
  const usage = new AIUsageTracker();
  const transport = { fetchImpl, env, retries: opts.retries, onCall: usage.record };

  const results: EvalCaseResult[] = [];
  const diffs = new Map<string, DiffResult>();
  for (const c of loaded.cases) {
    const { overlay, ratio } = pixelDiff(c.before, c.after);
    const base = {
      id: c.id,
      set: c.set,
      description: c.description,
      expected: c.expected,
      ambiguous: Boolean(c.ambiguous),
      gated: Boolean(c.gated),
      diffPercentage: Number((ratio * 100).toFixed(3)),
    };
    if (ratio === 0) {
      // Frontguard's pixel gate: identical renders never reach a model.
      results.push({ ...base, got: 'pass', correct: c.expected.includes('pass') });
      continue;
    }
    const diff = toDiff(c, overlay, ratio);
    diffs.set(c.id, diff);
    try {
      const analysis = await analyzeWithAI(diff, ai, undefined, transport);
      diff.aiAnalysis = analysis;
      results.push({
        ...base,
        got: analysis.classification,
        severity: analysis.severity,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
        correct: c.expected.includes(analysis.classification),
      });
    } catch (err) {
      results.push({ ...base, correct: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    provider: opts.provider,
    model,
    ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    mock: Boolean(opts.mock),
    sets,
    skippedSets: loaded.skipped,
    metrics: score(results),
    cases: results,
    usage: usage.summary(),
  };

  if (opts.fixes) {
    report.fixes = await evaluateFixes(loaded.cases, diffs, ai, transport, opts.fixTolerance ?? 0.002);
    report.usage = usage.summary();
  }
  return report;
}

/** Generates a fix for each clear regression UI case and re-renders the broken page with it applied. */
async function evaluateFixes(
  cases: EvalCase[],
  diffs: Map<string, DiffResult>,
  ai: AIConfig,
  transport: Parameters<typeof generateFix>[2],
  tolerance: number,
): Promise<NonNullable<EvalReport['fixes']>> {
  const targets = cases.filter((c) => c.html && !c.ambiguous && c.expected[0] === 'regression');
  const results: FixEvalResult[] = [];
  if (targets.length === 0) return { attempted: 0, restored: 0, results };
  const { chromium } = await import('playwright');
  const { renderHtml } = await import('./ui.js');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    for (const c of targets) {
      const diff = diffs.get(c.id);
      if (!diff || !c.html) continue;
      try {
        const fix = await generateFix(diff, ai, transport);
        if (!fix) {
          results.push({ id: c.id, generated: false, restored: false });
          continue;
        }
        const patched = await renderHtml(page, c.html.after, fix.patch);
        const residualRatio = pixelDiff(c.before, patched).ratio;
        results.push({ id: c.id, generated: true, patch: fix.patch, residualRatio, restored: residualRatio <= tolerance });
      } catch (err) {
        results.push({ id: c.id, generated: false, restored: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await browser.close();
  }
  return { attempted: results.length, restored: results.filter((r) => r.restored).length, results };
}
