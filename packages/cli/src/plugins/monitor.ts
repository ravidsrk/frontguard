/**
 * Production Monitoring Plugin
 *
 * Runs visual checks on live production URLs on a schedule or trigger.
 * Tracks drift over time, sends webhook alerts when regressions exceed
 * a configurable threshold.
 *
 * @module plugins/monitor
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
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
