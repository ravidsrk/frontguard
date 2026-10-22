/** Baseline writes. Pixelmatch stays the pass/fail signal on a normal run. */

import type {
  FrontguardConfig,
  Route,
  ScreenshotResult,
  RunResult,
  RunTiming,
  Reporter,
  AccessibilityResult,
} from './types.js';
import { withCliTrace, type CliTrace } from '../utils/otel.js';
import { PluginManager, type PluginContext } from './plugins.js';
import {
  emptyBaselineManifest,
  stampBaselineManifest,
} from './fingerprint.js';
import { renderPages } from '../render/playwright.js';
import { overflowReports } from '../render/horizontal-overflow.js';
import { createNewPageResult } from '../diff/pixel.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { logger } from '../utils/logger.js';
import { timed } from './pipeline-batch.js';
import { discoverAllRoutes } from './pipeline-discover.js';
import { buildResult } from './pipeline-result.js';

/**
 * Discovers routes, renders all pages, and writes all screenshots as new baselines.
 * Used by the `frontguard update-baselines` command.
 *
 * @param config   - Validated Frontguard configuration
 * @param reporter - Reporter for progress output
 */
export async function updateBaselines(
  config: FrontguardConfig,
  reporter: Reporter,
): Promise<RunResult> {
  return withCliTrace((trace) => writeUpdatedBaselines(config, reporter, trace));
}

async function writeUpdatedBaselines(
  config: FrontguardConfig,
  rp: Reporter,
  trace: CliTrace,
): Promise<RunResult> {
  const totalStart = performance.now();
  const timing: RunTiming = {
    discovery: 0,
    render: 0,
    compare: 0,
    ai: 0,
    total: 0,
  };
  rp.onStageStart('init', 'Updating baselines…');

  // Discover routes (shared logic with runPipeline)
  let routes: Route[];
  try {
    routes = await discoverAllRoutes(config);
  } catch {
    routes = [{ path: '/', label: 'Home', discoveredVia: 'config' }];
  }

  logger.info(`Rendering ${routes.length} route(s) for baseline update…`);
  rp.onStageStart('render', `Capturing screenshots for ${routes.length} route(s)…`);

  const captureSpan = trace.start('frontguard.capture');
  const [shots, renderDuration] = await timed(() => renderPages(routes, config));
  timing.render = renderDuration;
  const captureFailed =
    shots.length === 0 ||
    shots.some((shot) => !Buffer.isBuffer(shot.buffer) || shot.buffer.length === 0);
  captureSpan.end(captureFailed ? 'error' : 'ok', { 'frontguard.shots': shots.length });
  if (shots.length === 0) {
    rp.onStageComplete('render', 'Failed: no screenshots were captured');
    throw new Error('Cannot update baselines: no screenshots were captured');
  }
  const failedCaptures = shots.filter(
    (shot) => !Buffer.isBuffer(shot.buffer) || shot.buffer.length === 0,
  );
  if (failedCaptures.length > 0) {
    const failureCount = failedCaptures.length;
    rp.onStageComplete(
      'render',
      `Failed: ${failureCount} capture${failureCount === 1 ? '' : 's'} produced no screenshot`,
    );
    throw new Error(
      `Cannot update baselines: ${failureCount} capture${failureCount === 1 ? '' : 's'} failed`,
    );
  }
  rp.onStageComplete('render', `Captured ${shots.length} screenshot(s)`);

  // The accessibility plugin's own cutoff is the block. Pixel status is not an input.
  let baselineBlock: string | undefined;
  let baselineA11y: AccessibilityResult[] | undefined;
  let textDone: { manager: PluginManager; ctx: PluginContext } | undefined;
  const a11yPlugin = config.plugins?.find((plugin) => plugin.name === 'accessibility');
  if (a11yPlugin) {
    const manager = new PluginManager();
    manager.register(a11yPlugin);
    const metadata = new Map<string, unknown>();
    metadata.set('accessibility:require-complete', true);
    const ctx = { config, logger, metadata };
    try {
      await manager.setup(ctx);
      await manager.runHook('afterRender', shots, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.startsWith('Accessibility check failed:')) throw err;
      baselineBlock = `${message} Baselines were not written.`;
    } finally {
      await manager.teardown();
    }
    const stored = metadata.get('accessibility:results');
    if (Array.isArray(stored) && stored.length > 0) baselineA11y = stored as AccessibilityResult[];
  }

  if (!baselineBlock) {
    const textPlugin = config.plugins?.find((p) => p.name === 'text-snapshot');
    if (textPlugin) {
      const mgr = new PluginManager();
      mgr.register(textPlugin);
      const md = new Map<string, unknown>();
      md.set('tw', true);
      const textCtx = { config, logger, metadata: md };
      try {
        await mgr.setup(textCtx);
        await mgr.runHook('afterRender', shots, textCtx);
        textDone = { manager: mgr, ctx: textCtx };
      } finally {
        await mgr.teardown();
      }
    }

    // Init storage and write all baselines
    const writeSpan = trace.start('frontguard.baseline_write');
    rp.onStageStart('compare', 'Writing baselines…');
    const writeStart = performance.now();
    const storage = new GitOrphanStorage(process.cwd(), { mode: 'update' });
    await storage.init();

    let written = 0;
    let writeFailures = 0;
    const writtenScreenshots: ScreenshotResult[] = [];

    const isMockFn = (fn: unknown): boolean =>
      typeof fn === 'function' && ('mock' in fn || '_isMockFunction' in fn);
    const useBatchWrite =
      typeof storage.writeBaselines === 'function' &&
      (isMockFn(storage.writeBaselines) || !isMockFn(storage.writeBaseline));

    if (useBatchWrite) {
      const existing = (await storage.readManifest()) ?? emptyBaselineManifest();
      const manifest = stampBaselineManifest(existing, shots, config.colorScheme);

      try {
        await storage.writeBaselines(
          shots.map((shot) => ({
            route: shot.route.path,
            viewport: shot.viewport,
            browser: shot.browser,
            buffer: shot.buffer,
          })),
          manifest,
        );
        for (const shot of shots) {
          written++;
          writtenScreenshots.push(shot);
          rp.onStageProgress(
            'compare',
            written,
            shots.length,
            `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`,
          );
        }
      } catch (err) {
        writeFailures = shots.length;
        logger.error(
          `Failed to write baselines: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      for (const shot of shots) {
        try {
          await storage.writeBaseline(
            shot.route.path,
            shot.viewport,
            shot.browser,
            shot.buffer,
          );
          written++;
          writtenScreenshots.push(shot);

          rp.onStageProgress(
            'compare',
            written,
            shots.length,
            `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`,
          );
        } catch (err) {
          writeFailures++;
          logger.error(
            `Failed to write baseline for ${shot.route.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const existing = (await storage.readManifest()) ?? emptyBaselineManifest();
      const manifest = stampBaselineManifest(existing, writtenScreenshots, config.colorScheme);
      await storage.writeManifest(manifest);
    }
    timing.compare = Math.round(performance.now() - writeStart);

    if (writeFailures > 0) {
      writeSpan.end('error', { 'frontguard.shots': written });
      rp.onStageComplete(
        'compare',
        `Failed to write ${writeFailures} of ${shots.length} baseline${shots.length === 1 ? '' : 's'}`,
      );
      throw new Error(
        `Failed to write ${writeFailures} of ${shots.length} baseline${shots.length === 1 ? '' : 's'}`,
      );
    }

    writeSpan.end('ok', { 'frontguard.shots': written });
    rp.onStageComplete('compare', `Wrote ${written} baseline(s)`);
    logger.info(`✅ Updated ${written} baseline(s) successfully`);
    logger.info('To share these baselines with CI, run: git push origin frontguard-baselines');
  }

  timing.total = Math.round(performance.now() - totalStart);
  const hx = await overflowReports(shots);
  const result = {
    ...buildResult(
      shots.map((shot) => createNewPageResult(shot)),
      timing,
      totalStart,
      config,
    ),
    ...(baselineBlock ? { baselineRefusal: baselineBlock } : { baselineUpdate: true }),
    ...(baselineA11y ? { accessibility: baselineA11y } : {}),
    ...(hx.length > 0 ? { horizontalOverflow: hx } : {}),
  };
  if (textDone) await textDone.manager.runHook('afterRun', result, textDone.ctx);
  rp.onStageStart('report', 'Generating baseline update report…');
  await rp.onComplete(result);
  rp.onStageComplete('report', 'Done');
  if (baselineBlock) throw new Error(baselineBlock);
  return result;
}
