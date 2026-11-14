#!/usr/bin/env npx tsx
/**
 * AI eval: how well the configured vision model classifies visual changes.
 *
 *   npm run eval:ai --workspace=packages/cli -- [options]
 *
 * Options:
 *   --provider openai|anthropic|gemini   default: $FRONTGUARD_EVAL_PROVIDER or openai
 *   --model <id>                         default: Frontguard's default model for the provider
 *   --base-url <url>                     custom OpenAI-compatible / proxy endpoint
 *   --sets synthetic,ui                  default: both (ui needs Playwright Chromium)
 *   --fixes                              also generate fixes for regression UI cases and re-render them
 *   --mock                               canned answers, no network or key (checks the plumbing)
 *   --out <file>                         default: eval-results/<provider>-<model>-<date>.json
 *   --min-accuracy <0..1>                exit 1 when clear-case accuracy is below this
 *
 * Live runs need the provider key (FRONTGUARD_OPENAI_KEY, FRONTGUARD_ANTHROPIC_KEY
 * or FRONTGUARD_GEMINI_KEY) and cost a few cents per run.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMetrics } from './eval/metrics.js';
import { runEval, type EvalOptions } from './eval/runner.js';
import type { AIProviderName } from '../src/diff/ai-provider.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  const provider = (arg('provider') ?? process.env.FRONTGUARD_EVAL_PROVIDER ?? 'openai') as AIProviderName;
  if (!['openai', 'anthropic', 'gemini'].includes(provider)) {
    console.error(`Unknown provider "${provider}". Use openai, anthropic or gemini.`);
    return 2;
  }
  const sets = (arg('sets') ?? 'synthetic,ui').split(',').map((s) => s.trim()) as EvalOptions['sets'];
  const options: EvalOptions = {
    provider,
    model: arg('model'),
    baseUrl: arg('base-url'),
    sets,
    mock: flag('mock'),
    fixes: flag('fixes'),
  };

  const report = await runEval(options);

  const here = dirname(fileURLToPath(import.meta.url));
  const date = report.timestamp.slice(0, 10);
  const out = resolve(
    arg('out') ?? join(here, '..', 'eval-results', `${report.provider}-${report.model.replace(/[^\w.-]+/g, '_')}-${date}${report.mock ? '-mock' : ''}.json`),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Frontguard AI eval — ${report.provider}/${report.model}${report.mock ? ' (mock)' : ''}`);
  for (const s of report.skippedSets) console.log(`Skipped set "${s.set}": ${s.reason}`);
  console.log(formatMetrics(report.metrics));
  for (const c of report.cases.filter((r) => !r.correct && !r.gated)) {
    console.log(`  ✗ ${c.id}: expected ${c.expected.join('|')}, got ${c.got ?? 'error'}${c.error ? ` (${c.error})` : ''}`);
  }
  if (report.fixes) {
    console.log(`Fixes restored the baseline: ${report.fixes.restored}/${report.fixes.attempted}`);
  }
  const t = report.usage.totals;
  console.log(`Usage: ${t.calls} calls, ${t.inputTokens} input / ${t.outputTokens} output tokens, ${t.latencyMs}ms`);
  console.log(`Report: ${out}`);

  const min = arg('min-accuracy');
  if (min !== undefined && (report.metrics.accuracy ?? 0) < Number(min)) {
    console.error(`Accuracy ${report.metrics.accuracy} is below --min-accuracy ${min}`);
    return 1;
  }
  return report.metrics.errors > 0 && report.metrics.correct === 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  },
);
