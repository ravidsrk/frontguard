/** Experimental judge mode. Verdicts are advisory and do not set regressions. */

import type {
  FrontguardConfig,
  Route,
  ScreenshotResult,
  RunResult,
  RunTiming,
  Reporter,
  JudgeResult,
} from './types.js';
import { withCliTrace, type CliTrace } from '../utils/otel.js';
import { renderPages } from '../render/playwright.js';
import { overflowReports } from '../render/horizontal-overflow.js';
import { judgeScreenshot } from '../diff/model-judge.js';
import { fetchDesignReference } from '../plugins/figma.js';
import { logger } from '../utils/logger.js';
import {
  AI_BATCH_SIZE,
  processBatched,
  timed,
} from './pipeline-batch.js';
import {
  UnreachableBaseUrlError,
  isUnreachableHostError,
} from './pipeline-errors.js';
import { discoverAllRoutes } from './pipeline-discover.js';
import { buildJudgeResult } from './pipeline-result.js';

/**
 * Runs the **model-as-judge** (zero-baseline) pipeline (Task 8.4).
 *
 * Flow: `discover → render → judge → report`. No baselines are read or written.
 * Each rendered screenshot is evaluated against design intent (Figma frame when
 * configured, otherwise UI heuristics). Returns a {@link RunResult} whose
 * `judgements` array carries the verdicts; `diffs` is left empty.
 *
 * @experimental Gated behind `--mode judge --experimental`.
 */
export async function runJudgePipeline(
  config: FrontguardConfig,
  reporter: Reporter,
): Promise<RunResult> {
  return withCliTrace((trace) => judgeCapturedPages(config, reporter, trace));
}

async function judgeCapturedPages(
  config: FrontguardConfig,
  rp: Reporter,
  trace: CliTrace,
): Promise<RunResult> {
  const totalStart = performance.now();
  const timing: RunTiming = { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 };

  if (!config.ai) {
    throw new Error('Judge mode requires AI configuration (config.ai with a provider + model).');
  }

  // Stage 1: DISCOVER ------------------------------------------------------
  rp.onStageStart('discover', 'Determining routes to judge…');
  let routes: Route[] = [];
  try {
    const [discovered, duration] = await timed(() => discoverAllRoutes(config));
    routes = discovered;
    timing.discovery = duration;
    rp.onStageComplete('discover', `Found ${routes.length} route(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isUnreachableHostError(msg)) {
      rp.onStageComplete(
        'discover',
        `Failed — ${config.baseUrl} is unreachable`,
      );
      throw new UnreachableBaseUrlError(config.baseUrl, err);
    }
    logger.error(`Discovery failed: ${msg}`);
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
    rp.onStageComplete('discover', 'Failed — falling back to /');
  }
  if (routes.length === 0) {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
  }

  const totalCombinations = routes.length * config.viewports.length * config.browsers.length;

  // Stage 2: RENDER --------------------------------------------------------
  let shots: ScreenshotResult[] = [];
  const captureSpan = trace.start('frontguard.capture');
  rp.onStageStart('render', `Capturing ${totalCombinations} screenshot(s)…`);
  try {
    const [captured, duration] = await timed(() => renderPages(routes, config));
    shots = captured;
    timing.render = duration;
    rp.onStageComplete('render', `Captured ${shots.length} screenshot(s) in ${duration}ms`);
    captureSpan.end(shots.length === 0 ? 'error' : 'ok', {
      'frontguard.shots': shots.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Render stage failed: ${msg}`);
    rp.onStageComplete('render', `Failed: ${msg}`);
    captureSpan.end('error', { 'frontguard.shots': shots.length });
  }

  if (shots.length === 0) {
    const empty = buildJudgeResult([], timing, totalStart, config);
    await rp.onComplete(empty);
    return empty;
  }

  // Stage 3: JUDGE ---------------------------------------------------------
  rp.onStageStart('analyze', `Judging ${shots.length} screenshot(s) with ${config.ai.provider}/${config.ai.model}…`);
  const judgements: JudgeResult[] = [];
  const judgeConfig = config.judge;

  // Cache Figma references per route (share in-flight promise across concurrent viewports).
  const referenceCache = new Map<string, Promise<Buffer | null>>();
  async function referenceFor(rpath: string): Promise<Buffer | undefined> {
    if (!judgeConfig?.figmaFileKey || !judgeConfig.figmaPages) return undefined;
    let pending = referenceCache.get(rpath);
    if (!pending) {
      pending = fetchDesignReference(
        {
          fileKey: judgeConfig.figmaFileKey,
          pages: judgeConfig.figmaPages,
          scale: judgeConfig.figmaScale,
        },
        rpath,
      );
      referenceCache.set(rpath, pending);
    }
    const resolved = await pending;
    return resolved ?? undefined;
  }

  const [judgeOutcomes, judgeDuration] = await timed(async () => {
    return processBatched(shots, AI_BATCH_SIZE, async (shot, index) => {
      const figmaReference = await referenceFor(shot.route.path);
      const verdict = await judgeScreenshot(shot, { ai: config.ai!, figmaReference });
      judgements.push(verdict);
      rp.onStageProgress(
        'analyze',
        index + 1,
        shots.length,
        `${shot.route.path} @ ${shot.viewport}px → ${verdict.pass ? 'pass' : 'fail'}`,
      );
    });
  });
  let judgeFailures = 0;
  for (let i = 0; i < judgeOutcomes.length; i++) {
    const outcome = judgeOutcomes[i];
    if (outcome.status === 'fulfilled') continue;

    judgeFailures++;
    const shot = shots[i];
    if (!shot) continue;
    const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    judgements.push({
      route: shot.route,
      viewport: shot.viewport,
      browser: shot.browser,
      pass: false,
      confidence: 0,
      issues: [],
      withDesignReference: false,
      error: `Judge failed: ${msg}`,
    });
    rp.onStageProgress(
      'analyze',
      i + 1,
      shots.length,
      `${shot.route.path} @ ${shot.viewport}px → error`,
    );
  }
  timing.ai = judgeDuration;
  if (judgeFailures > 0) {
    logger.error(`Judge failed for ${judgeFailures} screenshot(s)`);
  }
  rp.onStageComplete(
    'analyze',
    `Judged ${judgements.length} screenshot(s) in ${judgeDuration}ms${judgeFailures > 0 ? `; ${judgeFailures} failed` : ''}`,
  );

  timing.total = Math.round(performance.now() - totalStart);
  const result = buildJudgeResult(judgements, timing, totalStart, config);
  const hx = await overflowReports(shots);
  if (hx.length > 0) result.horizontalOverflow = hx;
  await rp.onComplete(result);
  return result;
}
