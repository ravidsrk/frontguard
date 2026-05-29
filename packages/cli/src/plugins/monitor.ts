/**
 * Production Monitoring Plugin
 *
 * Runs visual checks on live production URLs on a schedule or trigger.
 * Tracks drift over time, sends webhook alerts when regressions exceed
 * a configurable threshold.
 *
 * @module plugins/monitor
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
import type { DiffResult, RunResult, FrontguardConfig, Route } from '../core/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MonitorConfig {
  /** URLs to monitor (can differ from dev routes). */
  urls: string[];
  /** Check interval in minutes (for scheduled mode). */
  interval?: number;
  /** Alert channels. */
  alerts?: {
    /** Webhook URL for alerts (Slack, Discord, etc.). */
    webhook?: string;
    /** Email addresses. */
    email?: string[];
  };
  /** Threshold that triggers an alert (0–1, default 0.05 = 5%). */
  alertThreshold?: number;
  /** Store history for trend analysis. */
  historyDir?: string;
  /** Max history entries to keep per URL. */
  maxHistory?: number;
}

// ---------------------------------------------------------------------------
// Alert Types
// ---------------------------------------------------------------------------

export interface AlertEntry {
  url: string;
  diffPercentage: number;
  threshold: number;
  status: 'regression' | 'warning';
}

export interface AlertPayload {
  tool: 'frontguard-monitor';
  timestamp: string;
  alerts: AlertEntry[];
  summary: { total: number; passed: number; alerted: number };
}

export interface HistoryEntry {
  url: string;
  timestamp: string;
  diffPercentage: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a URL to a filesystem-safe slug.
 */
export function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Send an alert payload to a webhook URL.
 */
export async function sendWebhookAlert(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    // Log but don't throw — alert failures shouldn't break the run
    console.warn(`[frontguard-monitor] Webhook alert failed: ${response.status}`);
  }
}

/**
 * Save a history entry to disk and prune old entries.
 */
function saveHistoryEntry(
  historyDir: string,
  url: string,
  entry: HistoryEntry,
  maxHistory: number,
): void {
  const slug = urlToSlug(url);
  const dir = join(historyDir, slug);
  mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}.json`;
  writeFileSync(join(dir, filename), JSON.stringify(entry, null, 2));

  // Prune old entries
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length > maxHistory) {
    const toRemove = files.slice(0, files.length - maxHistory);
    for (const f of toRemove) {
      try {
        unlinkSync(join(dir, f));
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

/**
 * Load recent history entries for a URL.
 */
function loadHistory(historyDir: string, url: string, count: number): HistoryEntry[] {
  const slug = urlToSlug(url);
  const dir = join(historyDir, slug);

  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .slice(-count);

  return files.map((f) => {
    try {
      return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as HistoryEntry;
    } catch {
      return null;
    }
  }).filter((e): e is HistoryEntry => e !== null);
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a production monitoring plugin.
 *
 * Converts monitor URLs into routes, tracks drift over time, and sends
 * webhook alerts when visual regressions exceed the configured threshold.
 *
 * @param config - Monitor configuration
 * @returns A FrontguardPlugin instance
 */
export function createMonitorPlugin(config: MonitorConfig): FrontguardPlugin {
  const threshold = config.alertThreshold ?? 0.05;
  const maxHistory = config.maxHistory ?? 100;
  const alerts: AlertEntry[] = [];

  return {
    name: 'frontguard-monitor',

    // ----- setup -----
    setup(ctx: PluginContext): void {
      if (!config.urls || config.urls.length === 0) {
        throw new Error('[frontguard-monitor] At least one URL is required');
      }

      for (const url of config.urls) {
        try {
          new URL(url);
        } catch {
          throw new Error(`[frontguard-monitor] Invalid URL: ${url}`);
        }
      }

      if (config.historyDir) {
        mkdirSync(config.historyDir, { recursive: true });
      }

      // Store monitor URLs in shared metadata so other stages can use them
      ctx.metadata.set('monitor:urls', config.urls);
      ctx.metadata.set('monitor:threshold', threshold);
    },

    // ----- beforeDiscover — override routes with monitor URLs -----
    beforeDiscover(cfg: FrontguardConfig): FrontguardConfig {
      return {
        ...cfg,
        routes: [...config.urls],
        discover: undefined,
      };
    },

    // ----- afterDiscover — convert URLs into Route objects -----
    afterDiscover(_routes: Route[], _cfg: FrontguardConfig): Route[] {
      return config.urls.map((url) => ({
        path: url,
        label: url,
        discoveredVia: 'config' as const,
      }));
    },

    // ----- afterCompare -----
    afterCompare(diffs: DiffResult[], ctx: PluginContext): void {
      alerts.length = 0; // Reset for this run

      for (const diff of diffs) {
        const url = diff.route.path;
        const isAlert = diff.diffPercentage > threshold * 100;

        if (isAlert) {
          alerts.push({
            url,
            diffPercentage: diff.diffPercentage,
            threshold: threshold * 100,
            status: diff.diffPercentage > threshold * 200 ? 'regression' : 'warning',
          });
        }

        // Save history entry
        if (config.historyDir) {
          const entry: HistoryEntry = {
            url,
            timestamp: new Date().toISOString(),
            diffPercentage: diff.diffPercentage,
            status: isAlert ? 'alert' : 'pass',
          };
          saveHistoryEntry(config.historyDir, url, entry, maxHistory);

          // Build trend data
          const history = loadHistory(config.historyDir, url, 10);
          if (history.length >= 2) {
            const recent = history.slice(-5);
            const avgDrift =
              recent.reduce((sum, h) => sum + h.diffPercentage, 0) / recent.length;
            ctx.metadata.set(`monitor:trend:${urlToSlug(url)}`, avgDrift);
          }
        }
      }

      // Store alerts in metadata for afterRun
      ctx.metadata.set('monitor:alerts', [...alerts]);
    },

    // ----- afterRun -----
    async afterRun(result: RunResult, ctx: PluginContext): Promise<void> {
      const total = result.diffs.length;
      const alerted = alerts.length;
      const passed = total - alerted;

      // Send webhook if configured and there are alerts
      if (alerted > 0 && config.alerts?.webhook) {
        const payload: AlertPayload = {
          tool: 'frontguard-monitor',
          timestamp: new Date().toISOString(),
          alerts: [...alerts],
          summary: { total, passed, alerted },
        };
        await sendWebhookAlert(config.alerts.webhook, payload);
      }

      // Save run summary to historyDir
      if (config.historyDir) {
        const summaryPath = join(config.historyDir, 'last-run.json');
        const summary = {
          timestamp: new Date().toISOString(),
          total,
          passed,
          alerted,
          alerts: [...alerts],
        };
        writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
      }

      // Store summary in metadata for reporters
      ctx.metadata.set('monitor:summary', { total, passed, alerted });
    },
  };
}

// ---------------------------------------------------------------------------
// History inspection (CLI `monitor --history`)
// ---------------------------------------------------------------------------

/** A single recent history record paired with the URL slug it belongs to. */
export interface RecentHistoryRecord extends HistoryEntry {
  /** The URL slug (directory name) this entry was stored under. */
  slug: string;
}

/**
 * Read recent monitoring history across all per-URL slug directories in
 * `historyDir`. Entries are sorted newest-first and capped at `limit`.
 *
 * Returns an empty array when the directory does not exist or is empty.
 */
export function readRecentHistory(historyDir: string, limit = 20): RecentHistoryRecord[] {
  if (!existsSync(historyDir)) return [];

  const records: RecentHistoryRecord[] = [];

  for (const slug of readdirSync(historyDir)) {
    const dir = join(historyDir, slug);
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;

    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as HistoryEntry;
        if (entry && typeof entry.timestamp === 'string') {
          records.push({ ...entry, slug });
        }
      } catch {
        // Skip malformed entries
      }
    }
  }

  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return records.slice(0, limit);
}

/**
 * Format recent history records as a readable, fixed-width summary table.
 * Pure function — returns the rendered string so it is trivially testable.
 */
export function formatHistoryTable(records: RecentHistoryRecord[]): string {
  if (records.length === 0) {
    return 'No monitoring history found.';
  }

  const header = ['TIMESTAMP', 'STATUS', 'DIFF %', 'URL'];
  const rows = records.map((r) => [
    r.timestamp,
    r.status,
    `${r.diffPercentage.toFixed(2)}%`,
    r.url,
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length)),
  );

  const pad = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();

  const lines = [pad(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(pad)];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Polling loop (CLI `--interval` / `--watch` daemon mode)
// ---------------------------------------------------------------------------

/** Controls a running {@link runPollingLoop}, enabling graceful shutdown. */
export interface PollingController {
  /** Request the loop to stop after the current iteration completes. */
  stop(): void;
  /** Whether a stop has been requested. */
  readonly stopped: boolean;
}

/** Options for {@link runPollingLoop}. */
export interface PollingLoopOptions {
  /** The work to run each iteration. */
  iterate: () => Promise<void> | void;
  /** Delay between iterations in milliseconds. */
  intervalMs: number;
  /**
   * Optional cap on the number of iterations (mainly for testing). When
   * omitted the loop runs until {@link PollingController.stop} is called.
   */
  maxIterations?: number;
  /** Sleep implementation (injectable for tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Called when an iteration throws (errors never break the loop). */
  onError?: (err: unknown) => void;
}

/** Create a {@link PollingController}. */
export function createPollingController(): PollingController {
  let stopRequested = false;
  return {
    stop() {
      stopRequested = true;
    },
    get stopped() {
      return stopRequested;
    },
  };
}

/**
 * Run a polling loop that invokes `iterate` repeatedly, sleeping `intervalMs`
 * between runs. Stops when the controller's `stop()` is called or when
 * `maxIterations` is reached. Iteration errors are caught and forwarded to
 * `onError` so a single failing run never breaks the loop.
 *
 * @returns The number of iterations executed.
 */
export async function runPollingLoop(
  controller: PollingController,
  options: PollingLoopOptions,
): Promise<number> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let iterations = 0;

  while (!controller.stopped) {
    if (options.maxIterations !== undefined && iterations >= options.maxIterations) break;

    try {
      await options.iterate();
    } catch (err) {
      if (options.onError) options.onError(err);
      else throw err;
    }
    iterations++;

    if (controller.stopped) break;
    if (options.maxIterations !== undefined && iterations >= options.maxIterations) break;

    await sleep(options.intervalMs);
  }

  return iterations;
}
