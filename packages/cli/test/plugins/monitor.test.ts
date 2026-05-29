import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createMonitorPlugin,
  urlToSlug,
  sendWebhookAlert,
  readRecentHistory,
  formatHistoryTable,
  createPollingController,
  runPollingLoop,
  type MonitorConfig,
  type AlertPayload,
  type HistoryEntry,
} from '../../src/plugins/monitor.js';
import type { PluginContext } from '../../src/core/plugins.js';
import type { FrontguardConfig, DiffResult, Route, RunResult, RunTiming } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    config: {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 4,
      pageTimeout: 30000,
      maxHeight: 5000,
      outputDir: './frontguard-report',
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    metadata: new Map(),
    ...overrides,
  };
}

function makeDiff(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    route: { path: 'https://example.com', label: 'https://example.com' },
    viewport: 1440,
    browser: 'chromium',
    status: 'pass',
    diffPercentage: 0,
    ...overrides,
  };
}

function makeRunResult(diffs: DiffResult[]): RunResult {
  const timing: RunTiming = { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 };
  return {
    summary: {
      total: diffs.length,
      passed: diffs.filter((d) => d.status === 'pass').length,
      regressions: diffs.filter((d) => d.status === 'regression').length,
      warnings: 0,
      newPages: 0,
      errors: 0,
    },
    diffs,
    timing,
    config: makeContext().config,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMonitorPlugin', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'frontguard-monitor-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a valid plugin with expected hooks', () => {
    const plugin = createMonitorPlugin({ urls: ['https://example.com'] });

    expect(plugin.name).toBe('frontguard-monitor');
    expect(plugin.setup).toBeTypeOf('function');
    expect(plugin.beforeDiscover).toBeTypeOf('function');
    expect(plugin.afterDiscover).toBeTypeOf('function');
    expect(plugin.afterCompare).toBeTypeOf('function');
    expect(plugin.afterRun).toBeTypeOf('function');
  });

  it('setup validates config — throws on empty URLs', () => {
    const plugin = createMonitorPlugin({ urls: [] });
    expect(() => plugin.setup!(makeContext())).toThrow('At least one URL');
  });

  it('setup validates config — throws on invalid URL', () => {
    const plugin = createMonitorPlugin({ urls: ['not-a-url'] });
    expect(() => plugin.setup!(makeContext())).toThrow('Invalid URL');
  });

  it('setup creates historyDir if specified', () => {
    const historyDir = join(tempDir, 'history');
    const plugin = createMonitorPlugin({ urls: ['https://example.com'], historyDir });
    plugin.setup!(makeContext());

    expect(existsSync(historyDir)).toBe(true);
  });

  it('beforeDiscover overrides routes with monitor URLs', () => {
    const plugin = createMonitorPlugin({
      urls: ['https://example.com', 'https://staging.example.com/pricing'],
    });
    plugin.setup!(makeContext());

    const config = makeContext().config;
    const result = plugin.beforeDiscover!(config);

    expect(result.routes).toEqual([
      'https://example.com',
      'https://staging.example.com/pricing',
    ]);
    expect(result.discover).toBeUndefined();
  });

  it('afterDiscover converts URLs to Route objects', () => {
    const urls = ['https://example.com', 'https://staging.example.com/pricing'];
    const plugin = createMonitorPlugin({ urls });
    plugin.setup!(makeContext());

    const routes = plugin.afterDiscover!([], makeContext().config);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual({
      path: 'https://example.com',
      label: 'https://example.com',
      discoveredVia: 'config',
    });
    expect(routes[1]).toEqual({
      path: 'https://staging.example.com/pricing',
      label: 'https://staging.example.com/pricing',
      discoveredVia: 'config',
    });
  });

  it('afterCompare triggers alert when diff exceeds threshold', () => {
    const plugin = createMonitorPlugin({
      urls: ['https://example.com'],
      alertThreshold: 0.05,
      historyDir: join(tempDir, 'history'),
    });
    plugin.setup!(makeContext());

    const diffs: DiffResult[] = [
      makeDiff({ diffPercentage: 10 }), // 10% > 5% threshold
    ];

    plugin.afterCompare!(diffs, makeContext());
    expect(diffs).toHaveLength(1);

    // History entry should be saved
    const historyDir = join(tempDir, 'history', urlToSlug('https://example.com'));
    expect(existsSync(historyDir)).toBe(true);
    const files = readdirSync(historyDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    const entry = JSON.parse(readFileSync(join(historyDir, files[0]), 'utf-8'));
    expect(entry.status).toBe('alert');
    expect(entry.diffPercentage).toBe(10);
  });

  it('afterCompare does NOT trigger alert when diff is within threshold', () => {
    const plugin = createMonitorPlugin({
      urls: ['https://example.com'],
      alertThreshold: 0.05,
      historyDir: join(tempDir, 'history'),
    });
    plugin.setup!(makeContext());

    const diffs: DiffResult[] = [
      makeDiff({ diffPercentage: 2 }), // 2% < 5% threshold
    ];

    plugin.afterCompare!(diffs, makeContext());

    // History entry should be saved but as 'pass'
    const historyDir = join(tempDir, 'history', urlToSlug('https://example.com'));
    const files = readdirSync(historyDir).filter((f) => f.endsWith('.json'));
    const entry = JSON.parse(readFileSync(join(historyDir, files[0]), 'utf-8'));
    expect(entry.status).toBe('pass');
  });

  it('afterRun saves run summary to historyDir', async () => {
    const historyDir = join(tempDir, 'history');
    const plugin = createMonitorPlugin({
      urls: ['https://example.com'],
      historyDir,
    });
    plugin.setup!(makeContext());

    // Run afterCompare first to populate alerts
    plugin.afterCompare!([makeDiff({ diffPercentage: 1 })], makeContext());

    // Then afterRun
    await plugin.afterRun!(makeRunResult([makeDiff()]), makeContext());

    const summaryPath = join(historyDir, 'last-run.json');
    expect(existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    expect(summary).toHaveProperty('timestamp');
    expect(summary).toHaveProperty('total');
    expect(summary).toHaveProperty('passed');
    expect(summary).toHaveProperty('alerted');
  });
});

describe('urlToSlug', () => {
  it('converts URLs to filesystem-safe slugs', () => {
    expect(urlToSlug('https://example.com')).toBe('example-com');
    expect(urlToSlug('https://staging.example.com/pricing')).toBe('staging-example-com-pricing');
    expect(urlToSlug('http://localhost:3000/')).toBe('localhost-3000');
  });
});

describe('AlertPayload structure', () => {
  it('has the correct shape', () => {
    const payload: AlertPayload = {
      tool: 'frontguard-monitor',
      timestamp: new Date().toISOString(),
      alerts: [
        {
          url: 'https://example.com',
          diffPercentage: 8.5,
          threshold: 5,
          status: 'regression',
        },
      ],
      summary: { total: 3, passed: 2, alerted: 1 },
    };

    expect(payload.tool).toBe('frontguard-monitor');
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].status).toBe('regression');
    expect(payload.summary.total).toBe(3);
    expect(payload.summary.passed).toBe(2);
    expect(payload.summary.alerted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// History inspection (`monitor --history`)
// ---------------------------------------------------------------------------

describe('readRecentHistory / formatHistoryTable', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'frontguard-monitor-history-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeEntry(slug: string, file: string, entry: HistoryEntry): void {
    const dir = join(tempDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), JSON.stringify(entry, null, 2));
  }

  it('returns empty array when history dir does not exist', () => {
    expect(readRecentHistory(join(tempDir, 'nope'))).toEqual([]);
  });

  it('reads entries across slug dirs, newest-first, capped at limit', () => {
    writeEntry('example-com', '1.json', {
      url: 'https://example.com',
      timestamp: '2024-01-01T00:00:00.000Z',
      diffPercentage: 1,
      status: 'pass',
    });
    writeEntry('example-com', '2.json', {
      url: 'https://example.com',
      timestamp: '2024-01-03T00:00:00.000Z',
      diffPercentage: 9,
      status: 'alert',
    });
    writeEntry('staging-example-com', '3.json', {
      url: 'https://staging.example.com',
      timestamp: '2024-01-02T00:00:00.000Z',
      diffPercentage: 4,
      status: 'pass',
    });

    const records = readRecentHistory(tempDir);
    expect(records).toHaveLength(3);
    // newest first
    expect(records[0].timestamp).toBe('2024-01-03T00:00:00.000Z');
    expect(records[0].slug).toBe('example-com');
    expect(records[1].timestamp).toBe('2024-01-02T00:00:00.000Z');
    expect(records[2].timestamp).toBe('2024-01-01T00:00:00.000Z');

    const limited = readRecentHistory(tempDir, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].timestamp).toBe('2024-01-03T00:00:00.000Z');
  });

  it('skips malformed JSON entries gracefully', () => {
    const dir = join(tempDir, 'example-com');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'bad.json'), '{not valid json');
    writeEntry('example-com', 'good.json', {
      url: 'https://example.com',
      timestamp: '2024-01-01T00:00:00.000Z',
      diffPercentage: 2,
      status: 'pass',
    });

    const records = readRecentHistory(tempDir);
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe('https://example.com');
  });

  it('formatHistoryTable shows a message when empty', () => {
    expect(formatHistoryTable([])).toBe('No monitoring history found.');
  });

  it('formatHistoryTable renders a readable table with header columns', () => {
    const table = formatHistoryTable([
      {
        url: 'https://example.com',
        timestamp: '2024-01-03T00:00:00.000Z',
        diffPercentage: 9.5,
        status: 'alert',
        slug: 'example-com',
      },
    ]);
    expect(table).toContain('TIMESTAMP');
    expect(table).toContain('STATUS');
    expect(table).toContain('DIFF %');
    expect(table).toContain('URL');
    expect(table).toContain('9.50%');
    expect(table).toContain('alert');
    expect(table).toContain('https://example.com');
  });
});

// ---------------------------------------------------------------------------
// Polling loop & graceful shutdown (`--interval` / `--watch`)
// ---------------------------------------------------------------------------

describe('runPollingLoop / createPollingController', () => {
  it('runs the requested number of iterations with maxIterations', async () => {
    const controller = createPollingController();
    let count = 0;
    const iterations = await runPollingLoop(controller, {
      intervalMs: 0,
      maxIterations: 3,
      sleep: async () => {},
      iterate: () => {
        count++;
      },
    });
    expect(iterations).toBe(3);
    expect(count).toBe(3);
  });

  it('stops cleanly when the controller is stopped (graceful shutdown)', async () => {
    const controller = createPollingController();
    let count = 0;
    const iterations = await runPollingLoop(controller, {
      intervalMs: 0,
      sleep: async () => {},
      iterate: () => {
        count++;
        if (count === 2) controller.stop(); // simulate SIGINT after 2 runs
      },
    });
    expect(controller.stopped).toBe(true);
    expect(iterations).toBe(2);
    expect(count).toBe(2);
  });

  it('does not start a new iteration when stopped before running', async () => {
    const controller = createPollingController();
    controller.stop();
    let count = 0;
    const iterations = await runPollingLoop(controller, {
      intervalMs: 0,
      sleep: async () => {},
      iterate: () => {
        count++;
      },
    });
    expect(iterations).toBe(0);
    expect(count).toBe(0);
  });

  it('forwards iteration errors to onError without breaking the loop', async () => {
    const controller = createPollingController();
    const errors: unknown[] = [];
    let count = 0;
    const iterations = await runPollingLoop(controller, {
      intervalMs: 0,
      maxIterations: 3,
      sleep: async () => {},
      onError: (err) => errors.push(err),
      iterate: () => {
        count++;
        throw new Error(`boom ${count}`);
      },
    });
    expect(iterations).toBe(3);
    expect(errors).toHaveLength(3);
    expect((errors[0] as Error).message).toBe('boom 1');
  });

  it('sleeps between iterations using the injected sleep', async () => {
    const controller = createPollingController();
    const sleeps: number[] = [];
    await runPollingLoop(controller, {
      intervalMs: 5000,
      maxIterations: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      iterate: () => {},
    });
    // Only one sleep between the two iterations (none after the last).
    expect(sleeps).toEqual([5000]);
  });
});
