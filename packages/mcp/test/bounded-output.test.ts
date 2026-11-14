/**
 * Growth control for MCP tool output (#379). Tool results land in the host
 * agent's context window, so list tools page, run-level fields appear once,
 * the text block is compact JSON, and cloud errors are short.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createServer } from '../src/index.js';
import { CloudApiError, createLocalReportClient, summarizeErrorBody } from '../src/client/cloud.js';
import { listHorizontalOverflow, listRegressions } from '../src/tools/index.js';

const STATUSES = ['changed', 'regression', 'error', 'pass'] as const;

/** 600 regression rows plus 200 passing rows, in deliberately unsorted order. */
function bigReport(): Record<string, unknown> {
  const diffs = [];
  for (let i = 0; i < 800; i++) {
    const status = STATUSES[i % STATUSES.length];
    diffs.push({
      route: `/catalog/category-${Math.floor(i / 3)}/item-${i}`,
      viewport: [375, 768, 1440][i % 3],
      browser: 'chromium',
      status,
      diffPercentage: ((i * 7919) % 1000) / 10_000,
      ...(status === 'pass' ? {} : { classification: 'regression' }),
      clusters: [
        { id: 1, bbox: { x: 0, y: 0, width: 40, height: 20 }, targetSelector: `.card-${i}` },
        { id: 2, bbox: { x: 50, y: 0, width: 40, height: 20 }, targetSelector: `.price-${i}` },
      ],
      suggestedFix: {
        fixType: 'css',
        category: 'layout-fix',
        patch: `.card-${i} { min-width: 0; }`,
        confidence: 0.7,
        explanation: 'Grid child overflowed its track.',
        target: `.card-${i}`,
      },
    });
  }
  const horizontalOverflow = [];
  for (let i = 0; i < 150; i++) {
    const flagged = i % 5 === 0;
    horizontalOverflow.push({
      route: `/catalog/category-${i}`,
      viewport: 375,
      browser: 'chromium',
      innerWidth: 375,
      scrollWidth: 375 + i,
      flagged,
      elements: flagged ? [{ selector: `.rail-${i}`, overflowPx: (i * 37) % 400 }] : [],
    });
  }
  return { id: 'run_local', github: { owner: 'acme', repo: 'shop', prNumber: 7, commitSha: 'f00ba12' }, diffs, horizontalOverflow };
}

function textOf(res: CallToolResult): string {
  const part = res.content?.[0];
  if (!part || part.type !== 'text') throw new Error('expected text content');
  return part.text;
}

async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer();
  const client = new Client({ name: 'bounded-output-test', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('paged list tools against a 600-row local report (#379)', () => {
  const savedEnv = { ...process.env };
  let dir: string;
  let reportPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-mcp-379-'));
    reportPath = join(dir, 'report.json');
    writeFileSync(reportPath, JSON.stringify(bigReport()));
    delete process.env.FRONTGUARD_API_KEY;
    delete process.env.FRONTGUARD_MCP_WRITES;
    process.env.FRONTGUARD_LOCAL_REPORT = reportPath;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the default list_regressions text block under 10,000 chars and pages every row exactly once', async () => {
    const { client, close } = await connect();
    try {
      const first = (await client.callTool({
        name: 'list_regressions',
        arguments: { pr_id: 'latest' },
      })) as CallToolResult;
      expect(first.isError).toBeFalsy();
      const firstText = textOf(first);
      expect(firstText.length).toBeLessThan(10_000);
      // Compact JSON, identical to structuredContent.
      expect(firstText).not.toContain('\n');
      expect(firstText).toBe(JSON.stringify(first.structuredContent));

      const firstPage = JSON.parse(firstText);
      expect(firstPage).toMatchObject({
        runId: 'run_local',
        prNumber: 7,
        repo: 'acme/shop',
        commitSha: 'f00ba12',
        total: 600,
        count: 25,
      });
      expect(typeof firstPage.nextCursor).toBe('string');
      expect(firstPage.regressions[0]).not.toHaveProperty('runId');
      expect(firstPage.regressions[0].clusterCount).toBe(2);

      const seen: Array<{ diffId: string; status: string; diffPercentage: number }> = [...firstPage.regressions];
      let cursor: string | null = firstPage.nextCursor;
      let pages = 1;
      while (cursor) {
        const res = (await client.callTool({
          name: 'list_regressions',
          arguments: { pr_id: 'latest', cursor, limit: 200 },
        })) as CallToolResult;
        expect(res.isError).toBeFalsy();
        const page = JSON.parse(textOf(res));
        expect(page.total).toBe(600);
        expect(page.count).toBe(page.regressions.length);
        seen.push(...page.regressions);
        cursor = page.nextCursor;
        pages += 1;
      }

      expect(pages).toBe(4); // 25 + 200 + 200 + 175
      expect(seen).toHaveLength(600);
      expect(new Set(seen.map((row) => row.diffId)).size).toBe(600);

      // Worst first: regression/error, then changed; diffPercentage descending within a rank.
      const rank = (status: string) => (status === 'changed' ? 1 : 0);
      for (let i = 1; i < seen.length; i++) {
        const prev = seen[i - 1];
        const cur = seen[i];
        expect(rank(prev.status)).toBeLessThanOrEqual(rank(cur.status));
        if (rank(prev.status) === rank(cur.status)) {
          expect(prev.diffPercentage).toBeGreaterThanOrEqual(cur.diffPercentage);
        }
      }
    } finally {
      await close();
    }
  });

  it('gives a local-report 404 a local hint instead of pointing at FRONTGUARD_API_URL', async () => {
    const { client, close } = await connect();
    try {
      const res = (await client.callTool({
        name: 'inspect_diff_cluster_dom',
        arguments: { diff_id: 'run_other:/pricing:1440' },
      })) as CallToolResult;
      expect(res.isError).toBe(true);
      const text = textOf(res);
      expect(text).toMatch(/^Frontguard local report error: GET \/v1\/runs\/run_other returned 404\./);
      expect(text).toContain('list_regressions with pr_id "latest"');
      expect(text).toContain("The report's run id is run_local.");
      expect(text).not.toContain('FRONTGUARD_API_URL');
      expect(text).not.toContain('cloud-api');
    } finally {
      await close();
    }
  });

  it('rejects a limit above 200', async () => {
    const { client, close } = await connect();
    try {
      const res = (await client.callTool({
        name: 'list_regressions',
        arguments: { pr_id: 'latest', limit: 201 },
      })) as CallToolResult;
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/Input validation error.*limit/);
    } finally {
      await close();
    }
  });

  it('returns flagged overflow rows only by default, largest overflowPx first, and pages them', async () => {
    const localClient = createLocalReportClient(reportPath);
    const first = await listHorizontalOverflow(localClient, { limit: 20 });
    expect(first).toMatchObject({ flaggedOnly: true, total: 30, count: 20, flagged: 30 });
    expect(first.rows.every((row) => row.flagged)).toBe(true);
    const sizes = first.rows.map((row) => row.elements[0].overflowPx);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

    const second = await listHorizontalOverflow(localClient, { limit: 20, cursor: first.nextCursor! });
    expect(second.count).toBe(10);
    expect(second.nextCursor).toBe(null);
    const routes = [...first.rows, ...second.rows].map((row) => row.route);
    expect(new Set(routes).size).toBe(30);

    const all = await listHorizontalOverflow(localClient, { flaggedOnly: false, limit: 200 });
    expect(all).toMatchObject({ total: 150, count: 150, flagged: 30, nextCursor: null });
  });

  it('refuses a cursor from another filter, another run, or a changed report', async () => {
    const localClient = createLocalReportClient(reportPath);
    const flagged = await listHorizontalOverflow(localClient, { limit: 5 });
    await expect(
      listHorizontalOverflow(localClient, { flaggedOnly: false, cursor: flagged.nextCursor! }),
    ).rejects.toThrow(/different filters/);

    const regressions = await listRegressions(localClient, { pr_id: 'latest', limit: 5 });
    await expect(
      listRegressions(localClient, { pr_id: 'latest', cursor: 'not-a-cursor' }),
    ).rejects.toThrow(/Invalid cursor/);

    const foreign = Buffer.from(JSON.stringify({ r: 'run_other', o: 5, t: 600 })).toString('base64url');
    await expect(listRegressions(localClient, { pr_id: 'latest', cursor: foreign })).rejects.toThrow(
      /belongs to run run_other/,
    );

    const report = bigReport();
    (report.diffs as unknown[]).shift(); // a `changed` row, so the regression total drops to 599
    writeFileSync(reportPath, JSON.stringify(report));
    await expect(
      listRegressions(localClient, { pr_id: 'latest', cursor: regressions.nextCursor! }),
    ).rejects.toThrow(/changed since this cursor was issued/);
  });
});

describe('cloud-api errors stay short (#379)', () => {
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const html502 = `<!DOCTYPE html><html><head><title>502 Bad Gateway</title><style>${'body{font-family:sans-serif;margin:0 auto;}'.repeat(80)}</style><script>${'window.__cf=1;'.repeat(120)}</script></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>cloudflare</center>${'<div class="filler">upstream connect error or disconnect/reset before headers</div>\n'.repeat(76)}</body></html>`;

  beforeEach(() => {
    delete process.env.FRONTGUARD_LOCAL_REPORT;
    delete process.env.FRONTGUARD_MCP_WRITES;
    process.env.FRONTGUARD_API_KEY = 'fg_test';
    process.env.FRONTGUARD_API_URL = 'https://api.example.test';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...savedEnv };
  });

  it('turns a 502 with an ~11 KB HTML body into a tool error under 500 chars', async () => {
    expect(html502.length).toBeGreaterThan(11_000);
    expect(html502.length).toBeLessThan(12_500);
    globalThis.fetch = (async () =>
      new Response(html502, { status: 502, headers: { 'Content-Type': 'text/html' } })) as typeof fetch;

    const { client, close } = await connect();
    try {
      const res = (await client.callTool({
        name: 'list_regressions',
        arguments: { pr_id: 42 },
      })) as CallToolResult;
      expect(res.isError).toBe(true);
      const text = textOf(res);
      expect(text.length).toBeLessThan(500);
      expect(text).toContain('GET /v1/runs');
      expect(text).toContain('502');
      expect(text).toMatch(/unavailable.*retry later.*FRONTGUARD_API_URL/i);
      expect(text).toContain('502 Bad Gateway');
      expect(text).not.toMatch(/<[a-z!/]/i);
      expect(text).not.toContain('window.__cf');
    } finally {
      await close();
    }
  });

  it.each([
    [401, /FRONTGUARD_API_KEY/],
    [403, /FRONTGUARD_API_KEY/],
    [404, /run id.*FRONTGUARD_API_URL/],
    [429, /retry later/i],
    [503, /retry later/i],
  ])('adds a hint for HTTP %i', async (status, hint) => {
    globalThis.fetch = (async () =>
      Response.json({ error: 'nope' }, { status })) as typeof fetch;
    const { client, close } = await connect();
    try {
      const res = (await client.callTool({
        name: 'inspect_diff_cluster_dom',
        arguments: { diff_id: 'run_abc:/pricing:1280' },
      })) as CallToolResult;
      expect(res.isError).toBe(true);
      const text = textOf(res);
      expect(text).toContain(`GET /v1/runs/run_abc returned ${status}.`);
      expect(text).toMatch(hint);
      expect(text).toContain('Body: {"error":"nope"}');
    } finally {
      await close();
    }
  });

  it('keeps plain-text bodies intact apart from whitespace and the cap', () => {
    expect(summarizeErrorBody('{"error":"limit must be < 5"}')).toBe('{"error":"limit must be < 5"}');
    expect(summarizeErrorBody('  a \n\t b  ')).toBe('a b');
    const long = summarizeErrorBody('x'.repeat(5000));
    expect(long.length).toBe(300);
    expect(long.endsWith('…')).toBe(true);
    const err = new CloudApiError(502, 'GET', '/v1/runs', html502);
    expect(err.message.length).toBeLessThan(400);
    expect(err.body).toBe(html502);
  });
});
