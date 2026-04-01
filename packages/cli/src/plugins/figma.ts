/**
 * Figma design compliance plugin for Frontguard.
 *
 * Compares rendered screenshots against Figma design exports to measure
 * how closely the implementation matches the original design. Reports
 * "design compliance" as a percentage deviation per route.
 *
 * @module plugins/figma
 */

import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type { DiffResult, ScreenshotResult, RunResult } from '../core/types.js';
import { logger } from '../utils/logger.js';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the Figma design compliance plugin.
 */
export interface FigmaConfig {
  /** Figma personal access token (from env: FIGMA_ACCESS_TOKEN). */
  accessToken?: string;
  /** Figma file key (from URL: figma.com/file/{KEY}/...). */
  fileKey: string;
  /** Map of route paths to Figma node IDs or page names. */
  pages: Record<string, string>; // { '/checkout': 'node-id-123', '/pricing': 'Page 2' }
  /** Scale factor for exports (1 = 1x, 2 = 2x). Default: 2. */
  scale?: number;
  /** Tolerance for design-to-code comparison (0–1, default 0.05). */
  tolerance?: number;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Metadata key used to store Figma images in the plugin context. */
const FIGMA_IMAGES_KEY = 'figma:images';

/** Map of "routePath:viewport" → Figma export PNG buffer. */
type FigmaImageMap = Map<string, Buffer>;

/** Design compliance result appended to the diffs array. */
interface DesignComplianceEntry {
  routePath: string;
  viewport: number;
  diffPercentage: number;
  status: 'pass' | 'changed';
}

// ---------------------------------------------------------------------------
// Figma API Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a rendered PNG of a Figma node via the Figma Images API.
 *
 * @param fileKey     - Figma file key
 * @param nodeId      - Node ID to export (e.g. `'1:2'`)
 * @param accessToken - Figma personal access token
 * @param scale       - Export scale factor (default 2)
 * @returns Raw PNG buffer of the exported node
 */
export async function fetchFigmaImage(
  fileKey: string,
  nodeId: string,
  accessToken: string,
  scale = 2,
): Promise<Buffer> {
  // Step 1: Request export URL from Figma API
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${scale}`;
  const response = await fetch(url, {
    headers: { 'X-Figma-Token': accessToken },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    err: string | null;
    images: Record<string, string | null>;
  };

  if (data.err) {
    throw new Error(`Figma API returned error: ${data.err}`);
  }

  const imageUrl = Object.values(data.images)[0];
  if (!imageUrl) {
    throw new Error(`No image returned for node ${nodeId} in file ${fileKey}`);
  }

  // Step 2: Download the rendered PNG
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    throw new Error(`Failed to download Figma image: ${imgResponse.status} ${imgResponse.statusText}`);
  }

  return Buffer.from(await imgResponse.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Image Resizing
// ---------------------------------------------------------------------------

/**
 * Resize a PNG buffer to match a target width × height.
 *
 * Uses nearest-neighbor interpolation (fast, sufficient for pixel comparison).
 * Returns the original buffer unchanged if dimensions already match.
 */
function resizeToMatch(buffer: Buffer, targetWidth: number, targetHeight: number): Buffer {
  const src = PNG.sync.read(buffer);

  if (src.width === targetWidth && src.height === targetHeight) {
    return buffer;
  }

  const dst = new PNG({ width: targetWidth, height: targetHeight });
  const scaleX = src.width / targetWidth;
  const scaleY = src.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor(x * scaleX), src.width - 1);
      const srcY = Math.min(Math.floor(y * scaleY), src.height - 1);
      const srcIdx = (src.width * srcY + srcX) << 2;
      const dstIdx = (targetWidth * y + x) << 2;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  return PNG.sync.write(dst);
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a Figma design compliance plugin.
 *
 * @example
 * ```ts
 * import { createFigmaPlugin } from 'frontguard/plugins';
 *
 * export default {
 *   plugins: [
 *     createFigmaPlugin({
 *       fileKey: 'abc123def456',
 *       pages: {
 *         '/': '1:2',
 *         '/pricing': '1:5',
 *         '/checkout': '3:8',
 *       },
 *     }),
 *   ],
 * };
 * ```
 */
export function createFigmaPlugin(config: FigmaConfig): FrontguardPlugin {
  // ---- Validate required config up front ------------------------------------
  if (!config.fileKey || typeof config.fileKey !== 'string') {
    throw new Error('FigmaPlugin: "fileKey" is required and must be a non-empty string.');
  }

  if (!config.pages || typeof config.pages !== 'object' || Object.keys(config.pages).length === 0) {
    throw new Error('FigmaPlugin: "pages" is required and must map at least one route to a Figma node ID.');
  }

  const scale = config.scale ?? 2;
  const tolerance = config.tolerance ?? 0.05;
  const complianceResults: DesignComplianceEntry[] = [];

  // Temp files to clean up
  const tempFiles: string[] = [];

  // Captured plugin context — set during setup, used in all hooks
  let pluginCtx: PluginContext | null = null;

  return {
    name: 'figma',

    // ------------------------------------------------------------------
    // setup — validate access token
    // ------------------------------------------------------------------
    async setup(ctx: PluginContext): Promise<void> {
      pluginCtx = ctx;
      const token = config.accessToken || process.env['FIGMA_ACCESS_TOKEN'];

      if (!token) {
        logger.warn(
          'FigmaPlugin: No access token found. Set "accessToken" in plugin config or ' +
            'the FIGMA_ACCESS_TOKEN environment variable. Figma design compliance will be skipped.',
        );
        return;
      }

      // Store the resolved token in metadata so later hooks can use it
      ctx.metadata.set('figma:accessToken', token);
      ctx.metadata.set(FIGMA_IMAGES_KEY, new Map() as FigmaImageMap);

      logger.info(`FigmaPlugin: Configured for file "${config.fileKey}" with ${Object.keys(config.pages).length} page mapping(s).`);
    },

    // ------------------------------------------------------------------
    // afterRender — fetch Figma exports for matching screenshots
    // ------------------------------------------------------------------
    async afterRender(
      screenshots: ScreenshotResult[],
      _ctx: PluginContext,
    ): Promise<void> {
      if (!pluginCtx) return;
      const token = pluginCtx.metadata.get('figma:accessToken') as string | undefined;
      if (!token) return; // No token — setup already warned

      const figmaImages = pluginCtx.metadata.get(FIGMA_IMAGES_KEY) as FigmaImageMap;

      // Collect unique (route, viewport) combos that match a Figma page
      const toFetch = new Map<string, { nodeId: string; viewport: number; routePath: string }>();

      for (const shot of screenshots) {
        const nodeId = config.pages[shot.route.path];
        if (!nodeId) continue;

        const key = `${shot.route.path}:${shot.viewport}`;
        if (!toFetch.has(key)) {
          toFetch.set(key, { nodeId, viewport: shot.viewport, routePath: shot.route.path });
        }
      }

      if (toFetch.size === 0) {
        logger.debug('FigmaPlugin: No screenshots match configured Figma page mappings.');
        return;
      }

      logger.info(`FigmaPlugin: Fetching ${toFetch.size} Figma export(s)...`);

      for (const [key, { nodeId, routePath }] of toFetch) {
        try {
          const imageBuffer = await fetchFigmaImage(config.fileKey, nodeId, token, scale);
          figmaImages.set(key, imageBuffer);
          logger.debug(`FigmaPlugin: Fetched Figma export for ${routePath} (node ${nodeId})`);
        } catch (err) {
          logger.error(
            `FigmaPlugin: Failed to fetch Figma export for ${routePath} (node ${nodeId}): ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },

    // ------------------------------------------------------------------
    // afterCompare — run pixelmatch between screenshots and Figma exports
    // ------------------------------------------------------------------
    async afterCompare(
      diffs: DiffResult[],
      _ctx: PluginContext,
    ): Promise<void> {
      if (!pluginCtx) return;
      const figmaImages = pluginCtx.metadata.get(FIGMA_IMAGES_KEY) as FigmaImageMap | undefined;
      if (!figmaImages || figmaImages.size === 0) return;

      // Clear previous results
      complianceResults.length = 0;

      const newDiffs: DiffResult[] = [];

      for (const diff of diffs) {
        const key = `${diff.route.path}:${diff.viewport}`;
        const figmaBuffer = figmaImages.get(key);
        if (!figmaBuffer || !diff.currentImage) continue;

        try {
          // Decode the current screenshot to get dimensions
          const currentPng = PNG.sync.read(diff.currentImage);
          const { width, height } = currentPng;
          const totalPixels = width * height;

          // Resize Figma export to match screenshot dimensions
          const resizedFigma = resizeToMatch(figmaBuffer, width, height);
          const figmaPng = PNG.sync.read(resizedFigma);

          // Run pixelmatch
          const diffOutput = new PNG({ width, height });
          const numDiffPixels = pixelmatch(
            currentPng.data,
            figmaPng.data,
            diffOutput.data,
            width,
            height,
            { threshold: 0.1, includeAA: false },
          );

          const diffPercentage = totalPixels > 0 ? (numDiffPixels / totalPixels) * 100 : 0;
          const status = diffPercentage / 100 <= tolerance ? 'pass' : 'changed';

          complianceResults.push({
            routePath: diff.route.path,
            viewport: diff.viewport,
            diffPercentage,
            status,
          });

          logger.info(
            `Design compliance: ${diff.route.path} @ ${diff.viewport}px — ` +
              `${diffPercentage.toFixed(1)}% deviation from Figma` +
              (status === 'pass' ? ' ✓' : ' ✗'),
          );

          // Append a design-compliance diff entry
          const complianceDiff: DiffResult = {
            route: { ...diff.route, label: `[design-compliance] ${diff.route.label || diff.route.path}` },
            viewport: diff.viewport,
            browser: diff.browser,
            status: status === 'pass' ? 'pass' : 'changed',
            diffPercentage,
            diffImage: PNG.sync.write(diffOutput),
            baselineImage: resizedFigma,
            currentImage: diff.currentImage,
          };

          newDiffs.push(complianceDiff);
        } catch (err) {
          logger.error(
            `FigmaPlugin: Design compliance comparison failed for ${diff.route.path} @ ${diff.viewport}px: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Append all design compliance diffs to the diffs array
      diffs.push(...newDiffs);
    },

    // ------------------------------------------------------------------
    // afterRun — log summary of design compliance scores
    // ------------------------------------------------------------------
    async afterRun(_result: RunResult, _ctx: PluginContext): Promise<void> {
      if (complianceResults.length === 0) {
        logger.debug('FigmaPlugin: No design compliance results to summarise.');
        return;
      }

      logger.newline();
      logger.info('─── Figma Design Compliance Summary ───');

      const passed = complianceResults.filter((r) => r.status === 'pass').length;
      const failed = complianceResults.filter((r) => r.status === 'changed').length;

      for (const entry of complianceResults) {
        const icon = entry.status === 'pass' ? '✓' : '✗';
        logger.info(
          `  ${icon} ${entry.routePath} @ ${entry.viewport}px — ${entry.diffPercentage.toFixed(1)}% deviation`,
        );
      }

      const avgDeviation =
        complianceResults.reduce((sum, r) => sum + r.diffPercentage, 0) / complianceResults.length;

      logger.info(
        `  Average deviation: ${avgDeviation.toFixed(1)}% | Passed: ${passed} | Failed: ${failed} | Tolerance: ${(tolerance * 100).toFixed(0)}%`,
      );
      logger.newline();
    },

    // ------------------------------------------------------------------
    // teardown — cleanup
    // ------------------------------------------------------------------
    async teardown(): Promise<void> {
      // Clear stored Figma images from memory
      if (!pluginCtx) return;
      const figmaImages = pluginCtx.metadata.get(FIGMA_IMAGES_KEY) as FigmaImageMap | undefined;
      if (figmaImages) {
        figmaImages.clear();
      }
      pluginCtx.metadata.delete(FIGMA_IMAGES_KEY);
      pluginCtx.metadata.delete('figma:accessToken');

      // Clean up any temp files (future-proof)
      for (const file of tempFiles) {
        try {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(file);
        } catch {
          // Ignore — file may already be gone
        }
      }
      tempFiles.length = 0;

      logger.debug('FigmaPlugin: Teardown complete.');
    },
  };
}
