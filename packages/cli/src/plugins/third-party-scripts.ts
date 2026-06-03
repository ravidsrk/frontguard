/**
 * Third-party script monitoring plugin.
 *
 * Detects when third-party scripts (ad networks, analytics SDKs, chat widgets)
 * appear or disappear on a page between runs. An ad partner swapping creatives
 * or an analytics vendor shipping a new tag can silently break layout; this
 * plugin surfaces those changes so they are caught in the next run instead of
 * by a customer.
 *
 * How it works:
 * - In `afterRender`, the full DOM snapshot of each route × viewport is parsed
 *   for `<script src>` origins, classified first-party vs third-party against
 *   the configured `baseUrl`.
 * - The current third-party inventory is diffed against the inventory persisted
 *   from the previous run (a single JSON file under `historyDir`). Added/removed
 *   origins are reported; the first run establishes a baseline (no diff).
 * - Findings are surfaced on `result.thirdPartyScripts` for the reporters.
 *
 * @module plugins/third-party-scripts
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type { ScreenshotResult, RunResult, ThirdPartyScriptResult } from '../core/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ThirdPartyScriptConfig {
  /**
   * Directory where the script inventory is persisted between runs.
   * Default: `.frontguard/script-inventory`.
   */
  historyDir?: string;
}

/** Inventory of third-party origins keyed by `route@viewport`. */
type ScriptInventory = Record<string, string[]>;

const INVENTORY_FILE = 'inventory.json';

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Resolves a script `src` to its origin relative to `baseUrl`. Handles
 * absolute, relative, and protocol-relative URLs. Returns `null` when the src
 * cannot be parsed (e.g. inline data URIs).
 */
function safeOrigin(src: string, baseUrl: string): string | null {
  try {
    const url = new URL(src, baseUrl);
    // Only http(s) scripts have a meaningful origin; data:/blob:/javascript:
    // resolve to a "null" origin and are not third-party network resources.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Extracts script origins from a DOM snapshot, partitioned into first-party
 * (same origin as `baseUrl`) and third-party. Both lists are de-duplicated and
 * sorted for stable comparison.
 */
export function extractScriptOrigins(
  domSnapshot: string,
  baseUrl: string,
): { firstParty: string[]; thirdParty: string[] } {
  const baseOrigin = safeOrigin(baseUrl, baseUrl);
  const firstParty = new Set<string>();
  const thirdParty = new Set<string>();

  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(domSnapshot)) !== null) {
    const origin = safeOrigin(m[1], baseUrl);
    if (!origin) continue;
    if (baseOrigin && origin === baseOrigin) firstParty.add(origin);
    else thirdParty.add(origin);
  }

  return {
    firstParty: [...firstParty].sort(),
    thirdParty: [...thirdParty].sort(),
  };
}

/**
 * Diffs two third-party origin lists, returning origins that were added or
 * removed. Order-independent.
 */
export function diffScriptInventory(
  prev: string[],
  curr: string[],
): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev);
  const currSet = new Set(curr);
  return {
    added: curr.filter((o) => !prevSet.has(o)).sort(),
    removed: prev.filter((o) => !currSet.has(o)).sort(),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function inventoryKey(routePath: string, viewport: number): string {
  return `${routePath}@${viewport}`;
}

function loadInventory(historyDir: string): ScriptInventory {
  const path = join(historyDir, INVENTORY_FILE);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ScriptInventory;
  } catch {
    return {};
  }
}

function saveInventory(historyDir: string, inventory: ScriptInventory): void {
  mkdirSync(historyDir, { recursive: true });
  writeFileSync(join(historyDir, INVENTORY_FILE), JSON.stringify(inventory, null, 2));
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Creates the third-party script monitoring plugin.
 *
 * @param config - Plugin configuration.
 * @returns A {@link FrontguardPlugin}.
 */
export function createThirdPartyScriptPlugin(
  config: ThirdPartyScriptConfig = {},
): FrontguardPlugin {
  const historyDir = config.historyDir ?? '.frontguard/script-inventory';
  let collected: ThirdPartyScriptResult[] = [];

  return {
    name: 'frontguard-third-party-scripts',

    afterRender(screenshots: ScreenshotResult[], ctx: PluginContext): void {
      const baseUrl = ctx.config.baseUrl;
      const previous = loadInventory(historyDir);
      const next: ScriptInventory = { ...previous };
      const results: ThirdPartyScriptResult[] = [];

      // De-duplicate by route+viewport (script set is browser-independent).
      const seen = new Set<string>();
      for (const shot of screenshots) {
        const key = inventoryKey(shot.route.path, shot.viewport);
        if (seen.has(key)) continue;
        seen.add(key);

        const { thirdParty } = extractScriptOrigins(shot.domSnapshot, baseUrl);
        const prior = previous[key];
        // First run for this page establishes a baseline — no diff reported.
        const { added, removed } =
          prior === undefined ? { added: [], removed: [] } : diffScriptInventory(prior, thirdParty);

        results.push({
          route: shot.route.path,
          viewport: shot.viewport,
          added,
          removed,
          current: thirdParty,
        });
        next[key] = thirdParty;
      }

      saveInventory(historyDir, next);
      collected = results;
      ctx.metadata.set('third-party-scripts:results', results);

      const changes = results.filter((r) => r.added.length > 0 || r.removed.length > 0);
      if (changes.length > 0) {
        ctx.logger.info(
          `🧩 Third-party scripts: ${changes.length} page(s) changed since the last run`,
        );
      }
    },

    afterRun(result: RunResult): void {
      if (collected.length > 0) {
        result.thirdPartyScripts = collected;
      }
    },
  };
}
