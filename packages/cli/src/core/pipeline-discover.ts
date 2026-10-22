/** Route discovery shared by a pixel run, a baseline write, and judge mode. */

import type {
  FrontguardConfig,
  Route,
  RouteEntry,
} from './types.js';
import { discoverRoutes } from '../discovery/crawler.js';
import { discoverRoutesFromFilesystem } from '../discovery/filesystem.js';
import { discoverStorybookRoutesForConfig } from '../discovery/storybook.js';
import { discoverLadleRoutesForConfig } from '../discovery/ladle.js';
import { discoverHistoireRoutesForConfig } from '../discovery/histoire.js';
import {
  selectedCaptureRunner,
  warnIfCaptureRunnerChanged,
} from '../discovery/capture-runner.js';
import { logger } from '../utils/logger.js';

/**
 * Converts explicit route entries from config into Route objects.
 *
 * Each entry is either a plain path string or a {@link RouteConfig} object
 * carrying per-route `threshold`, `ignore`, and `viewport` overrides. The
 * overrides are copied onto the runtime Route so the compare stage can apply
 * them without re-reading the config.
 */
export function toRouteObjects(entries: RouteEntry[]): Route[] {
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return {
        path: entry,
        label: entry === '/' ? 'Home' : entry,
        discoveredVia: 'config' as const,
      };
    }
    return {
      path: entry.path,
      label: entry.label ?? (entry.path === '/' ? 'Home' : entry.path),
      discoveredVia: 'config' as const,
      threshold: entry.threshold,
      ignore: entry.ignore,
      viewport: entry.viewport,
      waitForSelector: entry.waitForSelector,
      colorScheme: entry.colorScheme,
      actions: entry.actions,
      freezeTime: entry.freezeTime,
      seedRandom: entry.seedRandom,
      blockUrls: entry.blockUrls,
    };
  });
}

/**
 * Resolves the effective pixel-diff threshold for a route, preferring the
 * per-route override when present and falling back to the global threshold.
 *
 * @param route           - The route being compared.
 * @param globalThreshold - The global config threshold (fraction 0–1).
 * @returns The threshold to use for this route.
 */
export function resolveThreshold(route: Route, globalThreshold: number): number {
  return typeof route.threshold === 'number' ? route.threshold : globalThreshold;
}

/**
 * Discovers routes using the shared strategy:
 *   1. Explicit routes from config
 *   2. One optional story runner (Storybook, else Ladle, else Histoire)
 *   3. Crawl if discover options are set
 *   4. Filesystem discovery, falling back to crawl from '/'
 *
 * Used by both `runPipeline` and `updateBaselines` to avoid duplication.
 */
export async function discoverAllRoutes(config: FrontguardConfig): Promise<Route[]> {
  // 1. Explicit routes from config
  if (config.routes && config.routes.length > 0) {
    logger.info(`Using ${config.routes.length} configured route(s)`);
    return toRouteObjects(config.routes);
  }

  // 2. One optional story runner. Explicit routes above still win. An unset
  //    runner leaves crawl and filesystem discovery unchanged. A server URL,
  //    when present, becomes `baseUrl` so story paths resolve against that
  //    server. A directory-only index does not invent a file URL.
  const runner = selectedCaptureRunner(config);
  if (runner) {
    warnIfCaptureRunnerChanged(runner, config);
    if (runner === 'storybook') {
      const sb = await discoverStorybookRoutesForConfig(config);
      if (sb && sb.routes.length > 0) {
        config.baseUrl = sb.storybookUrl;
        logger.info(`Storybook discovery returned ${sb.routes.length} route(s) (baseUrl → ${sb.storybookUrl})`);
        return sb.routes;
      }
      logger.warn('Storybook configured but no stories were discovered — falling through to other strategies');
    } else if (runner === 'ladle') {
      const found = await discoverLadleRoutesForConfig(config);
      if (found && found.routes.length > 0) {
        if (found.baseUrl) config.baseUrl = found.baseUrl;
        logger.info(
          `Ladle discovery returned ${found.routes.length} route(s)` +
            (found.baseUrl ? ` (baseUrl → ${found.baseUrl})` : ''),
        );
        return found.routes;
      }
      logger.warn('Ladle configured but no stories were discovered — falling through to other strategies');
    } else {
      const found = await discoverHistoireRoutesForConfig(config);
      if (found && found.routes.length > 0) {
        if (found.baseUrl) config.baseUrl = found.baseUrl;
        logger.info(
          `Histoire discovery returned ${found.routes.length} route(s)` +
            (found.baseUrl ? ` (baseUrl → ${found.baseUrl})` : ''),
        );
        return found.routes;
      }
      logger.warn('Histoire configured but no stories were discovered — falling through to other strategies');
    }
  }

  // 3. Crawl if discover options are set
  if (config.discover) {
    logger.info(`Crawling from ${config.discover.startUrl ?? '/'}…`);
    return discoverRoutes(config);
  }

  // 4. Try filesystem, fall back to crawl from '/'
  logger.info('No routes configured — attempting filesystem discovery…');
  const fsRoutes = discoverRoutesFromFilesystem(process.cwd());
  if (fsRoutes && fsRoutes.length > 0) {
    logger.info(`Discovered ${fsRoutes.length} route(s) from filesystem`);
    return fsRoutes;
  }

  // 5. Fall back: crawl from baseUrl root
  logger.info('Filesystem discovery found nothing — crawling from /');
  const crawlConfig: FrontguardConfig = {
    ...config,
    discover: {
      startUrl: '/',
      maxDepth: 3,
      maxRoutes: 50,
      exclude: [],
    },
  };
  return discoverRoutes(crawlConfig);
}
