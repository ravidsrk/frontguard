/**
 * Agent-facing docs must match the live MCP server (#378).
 *
 * The server is started with the SDK in-memory client and its tools are
 * listed with FRONTGUARD_MCP_WRITES off and on. Each doc below is then
 * checked against that list and the exported input schemas.
 *
 * Convention (the docs follow it; keep new MCP docs in this shape):
 *
 * 1. Tool tables. A Markdown table whose first header cell mentions "tool"
 *    and whose first column holds backticked snake_case names. Every row
 *    starts with exactly one backticked tool name, and the table lists every
 *    registered tool, write tools included, exactly once. In a Markdown
 *    doc, an "Input(s)" or "Arguments" column names inputs in backticks:
 *    each one is an input of that row's tool (backticked tool names, as in
 *    "from `list_regressions`", are skipped), and every input is named.
 * 2. Tool lists. A list item that starts with a backticked snake_case name
 *    names a tool (tool inputs such as `pr_id` are exempt). It may be a
 *    signature, `name(a, b?, c: true)`: every argument is an input, `?`
 *    marks exactly the optional ones, and every input is listed.
 * 3. Calls. A backticked snake_case name right after "call", "calls",
 *    "calling" or "called" names a tool.
 * 4. Argument examples. A backticked JSON object on one line, after a
 *    backticked tool name on that same line:
 *      Call `list_regressions` with `{"pr_id": "latest"}`.
 *    The nearest tool name before the object owns it. The object must parse
 *    as JSON and pass that tool's input schema with unknown keys rejected.
 *    Backticked `{...}` is reserved for these examples, and the call form
 *    `tool({...})` is not used.
 * 5. Tool counts. "N read tools" is six and "N write tools" is two; a bare
 *    "N tools" is one of six, two or eight.
 * 6. Retired names (`get_diff_details`, `accept_suggestion`,
 *    `run_visual_check`, `pr_or_run_id`) appear nowhere.
 *
 * Sources: Markdown docs are read as text with fenced code blocks dropped.
 * The `frontguard guide mcp` topic is read from guide.ts as text, with \`
 * unescaped. docs-content.ts articles that mention @frontguard/mcp are
 * rendered to the same Markdown-like text (<code> becomes backticks, tables
 * become pipe rows, <li> becomes "- "). The docs-content Arguments column is
 * plain words; apps/web/src/test/docs-contracts.test.ts checks it.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { articles } from '../../../apps/web/src/lib/docs-content.js';
import { createServer } from '../src/index.js';
import {
  acceptBaselineInputSchema,
  getSuggestedFixInputSchema,
  inspectDiffClusterDomInputSchema,
  listHorizontalOverflowInputSchema,
  listRegressionsInputSchema,
  promoteBaselineInputSchema,
  recentRunsInputSchema,
  verifyCssPatchInputSchema,
} from '../src/tools/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const INPUT_SHAPES: Record<string, z.ZodRawShape> = {
  list_regressions: listRegressionsInputSchema,
  list_horizontal_overflow: listHorizontalOverflowInputSchema,
  get_suggested_fix: getSuggestedFixInputSchema,
  accept_baseline: acceptBaselineInputSchema,
  recent_runs: recentRunsInputSchema,
  inspect_diff_cluster_dom: inspectDiffClusterDomInputSchema,
  verify_css_patch: verifyCssPatchInputSchema,
  promote_baseline: promoteBaselineInputSchema,
};

const ALL_INPUT_KEYS = new Set(Object.values(INPUT_SHAPES).flatMap((shape) => Object.keys(shape)));
const RETIRED_NAMES = ['get_diff_details', 'accept_suggestion', 'run_visual_check', 'pr_or_run_id'];
const TOOL_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

interface Doc {
  label: string;
  /** Text the rules read (fenced code removed, HTML rendered to Markdown-like text). */
  text: string;
  /** Unprocessed source, for the retired-name check. */
  raw: string;
  /** Markdown docs name inputs in backticks inside an inputs column. */
  backtickedInputs: boolean;
}

function stripFences(markdown: string): string {
  return markdown.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '');
}

function markdownDoc(relPath: string): Doc {
  const raw = readFileSync(join(repoRoot, relPath), 'utf8');
  return { label: relPath, text: stripFences(raw), raw, backtickedInputs: true };
}

/** The `frontguard guide mcp` topic, read as text from the CLI source. */
function guideMcpDoc(): Doc {
  const source = readFileSync(join(repoRoot, 'packages/cli/src/cli/guide.ts'), 'utf8');
  const match = source.match(/id: 'mcp',[\s\S]*?content: `((?:\\[\s\S]|[^`\\])*)`/);
  if (!match) throw new Error('guide.ts: MCP topic content not found');
  const raw = match[1].replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
  return { label: 'packages/cli/src/cli/guide.ts (mcp topic)', text: stripFences(raw), raw, backtickedInputs: true };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const codeToTicks = (html: string) =>
  html.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, (_m, inner: string) => `\`${inner.replace(/<[^>]+>/g, '')}\``);
const stripTags = (html: string) => html.replace(/<[^>]+>/g, '');
const cellText = (html: string) => stripTags(codeToTicks(html)).replace(/\s+/g, ' ').trim();

/** Render a docs-content article to the Markdown-like text the rules read. */
function htmlToMarkdown(html: string): string {
  let text = html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/g, '\n');
  text = text.replace(/<table\b[\s\S]*?<\/table>/g, (table) => {
    const head = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]));
    const body = [...table.replace(/<thead\b[\s\S]*?<\/thead>/, '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(
      (row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cellText(m[1])),
    );
    const rows = [head, head.map(() => '---'), ...body];
    return `\n${rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')}\n`;
  });
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/g, (_m, item: string) => `\n- ${cellText(item)}\n`);
  text = text.replace(/<\/?(?:p|div|h[1-6]|figure|figcaption|ul|ol|br)\b[^>]*>/g, '\n');
  return decodeEntities(stripTags(codeToTicks(text)))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function docsContentDocs(): Doc[] {
  return articles
    .filter((article) => article.html.includes('@frontguard/mcp'))
    .map((article) => ({
      label: `apps/web/src/lib/docs-content.ts#${article.id}`,
      text: htmlToMarkdown(article.html),
      raw: article.html,
      backtickedInputs: false,
    }));
}

function allDocs(): Doc[] {
  return [
    markdownDoc('skills/frontguard/references/mcp.md'),
    markdownDoc('skills/frontguard/SKILL.md'),
    markdownDoc('packages/mcp/README.md'),
    markdownDoc('apps/web/public/agents.md'),
    markdownDoc('apps/web/public/llms.txt'),
    markdownDoc('apps/web/public/llms-full.txt'),
    guideMcpDoc(),
    ...docsContentDocs(),
  ];
}

interface Span {
  content: string;
  index: number;
}

function spans(line: string): Span[] {
  return [...line.matchAll(/`([^`\n]+)`/g)].map((m) => ({ content: m[1], index: m.index ?? 0 }));
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function tables(text: string): string[][][] {
  const found: string[][][] = [];
  let current: string[][] = [];
  for (const line of [...text.split('\n'), '']) {
    if (line.trim().startsWith('|')) {
      current.push(tableCells(line));
    } else if (current.length > 0) {
      found.push(current);
      current = [];
    }
  }
  return found;
}

function isOptional(shape: z.ZodRawShape, key: string): boolean {
  return (shape[key] as z.ZodType).isOptional();
}

interface Registry {
  read: string[];
  all: string[];
}

async function listToolNames(writes: boolean): Promise<string[]> {
  const saved = process.env.FRONTGUARD_MCP_WRITES;
  if (writes) process.env.FRONTGUARD_MCP_WRITES = '1';
  else delete process.env.FRONTGUARD_MCP_WRITES;
  const server = createServer();
  const client = new Client({ name: 'docs-contract', version: '0.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
    if (saved === undefined) delete process.env.FRONTGUARD_MCP_WRITES;
    else process.env.FRONTGUARD_MCP_WRITES = saved;
  }
}

/** Every rule violation in one doc, as readable strings. */
function violations(doc: Doc, registry: Registry): string[] {
  const out: string[] = [];
  const registered = new Set(registry.all);
  const where = (line: string) => `${doc.label}: "${line.trim().slice(0, 140)}"`;

  // 1. Tool tables.
  for (const table of tables(doc.text)) {
    const [header, , ...body] = table;
    if (!header || !/tool/i.test(header[0] ?? '')) continue;
    const names = body.map((row) => row[0]?.match(/^`([^`]+)`$/)?.[1]);
    if (!names.some((name) => name && TOOL_NAME.test(name))) continue;
    body.forEach((row, i) => {
      const name = names[i];
      if (!name) out.push(`${doc.label}: tool table row must start with one backticked tool name: "${row.join(' | ')}"`);
      else if (!registered.has(name)) out.push(`${doc.label}: tool table lists unregistered tool \`${name}\``);
    });
    const listed = names.filter((name): name is string => Boolean(name)).sort();
    if (JSON.stringify(listed) !== JSON.stringify(registry.all)) {
      out.push(`${doc.label}: tool table lists [${listed.join(', ')}], server registers [${registry.all.join(', ')}]`);
    }
    const inputsCol = header.findIndex((cell) => /\b(?:inputs?|arguments)\b/i.test(cell));
    if (doc.backtickedInputs && inputsCol > 0) {
      body.forEach((row, i) => {
        const name = names[i];
        const shape = name ? INPUT_SHAPES[name] : undefined;
        if (!shape) return;
        const documented = new Set(
          spans(row[inputsCol] ?? '')
            .map((span) => span.content.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*.+)?$/)?.[1])
            .filter((key): key is string => Boolean(key) && !registered.has(key as string)),
        );
        for (const key of documented) {
          if (!(key in shape)) out.push(`${doc.label}: \`${name}\` inputs column names unknown input \`${key}\``);
        }
        for (const key of Object.keys(shape)) {
          if (!documented.has(key)) out.push(`${doc.label}: \`${name}\` inputs column is missing \`${key}\``);
        }
      });
    }
  }

  for (const line of doc.text.split('\n')) {
    const lineSpans = spans(line);

    // 2. Tool lists, including signatures.
    const item = line.match(/^\s*(?:[-*+]|\d+\.)\s+`([^`]+)`/);
    const signature = item?.[1].match(/^([a-z][a-z0-9_]*)(?:\((.*)\))?$/);
    if (signature && TOOL_NAME.test(signature[1])) {
      const [, name, args] = signature;
      if (!(ALL_INPUT_KEYS.has(name) && args === undefined)) {
        if (!registered.has(name)) out.push(`${where(line)} lists unregistered tool \`${name}\``);
        const shape = INPUT_SHAPES[name];
        if (shape && args !== undefined && !args.includes('{')) {
          const listed = new Map<string, boolean>();
          for (const arg of args.split(',').map((a) => a.trim()).filter(Boolean)) {
            const parsed = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)(\?)?(?:\s*:\s*.+)?$/);
            if (!parsed) {
              out.push(`${where(line)} has an unreadable argument "${arg}"`);
              continue;
            }
            listed.set(parsed[1], Boolean(parsed[2]));
          }
          for (const [key, optional] of listed) {
            if (!(key in shape)) out.push(`${where(line)} names unknown input \`${key}\` for \`${name}\``);
            else if (optional !== isOptional(shape, key)) {
              out.push(`${where(line)} marks \`${key}\` as ${optional ? 'optional' : 'required'}; the schema disagrees`);
            }
          }
          for (const key of Object.keys(shape)) {
            if (!listed.has(key)) out.push(`${where(line)} leaves out input \`${key}\` of \`${name}\``);
          }
        }
      }
    }

    // 3. Calls.
    for (const call of line.matchAll(/\b(?:call|calls|calling|called)\s+`([^`]+)`/gi)) {
      if (TOOL_NAME.test(call[1]) && !registered.has(call[1])) {
        out.push(`${where(line)} calls unregistered tool \`${call[1]}\``);
      }
    }

    // 4. Argument examples, and no call form.
    lineSpans.forEach((span, i) => {
      if (/^[a-z][a-z0-9_]*\(\s*\{/.test(span.content)) {
        out.push(`${where(line)} uses the call form; write \`tool\` with \`{...}\``);
      }
      if (!(span.content.startsWith('{') && span.content.endsWith('}'))) return;
      const owner = lineSpans.slice(0, i).reverse().find((s) => TOOL_NAME.test(s.content));
      if (!owner) {
        out.push(`${where(line)} has an argument object with no tool name before it`);
        return;
      }
      const shape = INPUT_SHAPES[owner.content];
      if (!registered.has(owner.content) || !shape) {
        out.push(`${where(line)} gives arguments for unregistered tool \`${owner.content}\``);
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(span.content);
      } catch {
        out.push(`${where(line)} has an argument example that is not JSON: ${span.content}`);
        return;
      }
      const result = z.object(shape).strict().safeParse(value);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
        out.push(`${where(line)} \`${owner.content}\` example ${span.content} fails the input schema: ${issues.join('; ')}`);
      }
    });
  }

  // 5. Tool counts.
  const counts = { read: registry.read.length, write: registry.all.length - registry.read.length, all: registry.all.length };
  const countClaim =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s-]+(?:(read(?:-only)?|write|mcp)[\s-]+)?tools?\b/gi;
  for (const claim of doc.text.matchAll(countClaim)) {
    const n = /^\d+$/.test(claim[1]) ? Number(claim[1]) : NUMBER_WORDS[claim[1].toLowerCase()];
    const kind = claim[2]?.toLowerCase();
    const ok = kind?.startsWith('read')
      ? n === counts.read
      : kind === 'write'
        ? n === counts.write
        : n === counts.read || n === counts.write || n === counts.all;
    if (!ok) {
      out.push(
        `${doc.label}: "${claim[0]}" — the server registers ${counts.read} read tools and ${counts.write} write tools`,
      );
    }
  }

  // 6. Retired names.
  for (const retired of RETIRED_NAMES) {
    if (doc.raw.includes(retired)) out.push(`${doc.label}: mentions retired name \`${retired}\``);
  }

  return out;
}

describe('agent-facing MCP docs match the live server (#378)', () => {
  let registry: Registry;

  beforeAll(async () => {
    registry = { read: await listToolNames(false), all: await listToolNames(true) };
  });

  it('starts the server with writes off and on, and every registered tool has an input shape here', () => {
    expect(registry.read).toHaveLength(6);
    expect(registry.all).toHaveLength(8);
    expect(registry.all.filter((name) => !registry.read.includes(name))).toEqual([
      'accept_baseline',
      'promote_baseline',
    ]);
    expect(Object.keys(INPUT_SHAPES).sort()).toEqual(registry.all);
  });

  it.each(allDocs().map((doc) => [doc.label, doc] as const))('%s follows the convention', (_label, doc) => {
    expect(violations(doc, registry)).toEqual([]);
  });

  it('has a tool table in each primary doc, and argument examples where agents start', () => {
    const docs = new Map(allDocs().map((doc) => [doc.label, doc]));
    for (const label of [
      'skills/frontguard/references/mcp.md',
      'packages/mcp/README.md',
      'apps/web/public/agents.md',
      'apps/web/src/lib/docs-content.ts#integrations/mcp',
    ]) {
      const doc = docs.get(label);
      expect(doc, label).toBeDefined();
      const toolTables = tables(doc!.text).filter((t) => /tool/i.test(t[0]?.[0] ?? ''));
      expect(toolTables.length, label).toBeGreaterThan(0);
    }
    for (const label of [
      'skills/frontguard/references/mcp.md',
      'skills/frontguard/SKILL.md',
      'packages/mcp/README.md',
      'apps/web/public/agents.md',
      'packages/cli/src/cli/guide.ts (mcp topic)',
    ]) {
      expect(docs.get(label)!.text, label).toMatch(/`list_regressions`[^\n]*`\{[^`\n]*"pr_id"[^`\n]*\}`/);
    }
  });

  it('catches the drift reported in #378', () => {
    const bad: Doc = {
      label: 'fixture',
      backtickedInputs: true,
      raw: '',
      text: [
        '`@frontguard/mcp` exposes 7 MCP tools; the five read-only tools need no key.',
        '| Tool Name | Purpose |',
        '| --- | --- |',
        '| `list_regressions` | List diffs |',
        '| `get_diff_details` | Fetch a diff |',
        '1. Run `list_regressions` with `{ "pr_or_run_id": "latest" }`.',
        '- `verify_css_patch(diff_id, css_patch, target_selector?)`',
        '- `list_horizontal_overflow(run_id?)`',
        '- calls `list_regressions({ pr_id: 42 })`',
        'Then call `run_visual_check`.',
      ].join('\n'),
    };
    const found = violations(bad, registry).join('\n');
    expect(found).toMatch(/"7 MCP tools"/);
    expect(found).toMatch(/"five read-only tools"/);
    expect(found).toMatch(/tool table lists unregistered tool `get_diff_details`/);
    expect(found).toMatch(/tool table lists \[get_diff_details, list_regressions\]/);
    expect(found).toMatch(/`list_regressions` example .* fails the input schema: pr_id: .*Unrecognized key: "pr_or_run_id"/);
    expect(found).toMatch(/marks `target_selector` as optional/);
    expect(found).toMatch(/leaves out input `flagged_only` of `list_horizontal_overflow`/);
    expect(found).toMatch(/uses the call form/);
    expect(found).toMatch(/calls unregistered tool `run_visual_check`/);
  });
});

describe('the skill loop works verbatim against a local report (#378)', () => {
  const savedEnv = { ...process.env };
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-mcp-skill-loop-'));
    const reportPath = join(dir, 'report.json');
    // Same shape as `frontguard run --output json` (packages/cli/src/report/json.ts).
    writeFileSync(
      reportPath,
      JSON.stringify({
        summary: { total: 2, passed: 1, failed: 1 },
        diffs: [
          { route: '/', viewport: 1440, browser: 'chromium', status: 'pass', diffPercentage: 0 },
          {
            route: '/pricing',
            label: 'pricing',
            viewport: 1440,
            browser: 'chromium',
            status: 'regression',
            diffPercentage: 0.042,
            hasBaselineImage: true,
            hasCurrentImage: true,
            hasDiffImage: true,
            comparisonMethod: 'pixelmatch',
            clusters: [
              { id: 1, bbox: { x: 120, y: 340, width: 300, height: 80 }, targetSelector: '.pricing-card' },
            ],
          },
        ],
        config: { baseUrl: 'http://localhost:3000', viewports: [1440], browsers: ['chromium'], threshold: 0.01 },
      }),
    );
    delete process.env.FRONTGUARD_API_KEY;
    delete process.env.FRONTGUARD_MCP_WRITES;
    process.env.FRONTGUARD_LOCAL_REPORT = reportPath;
  });

  afterAll(() => {
    process.env = { ...savedEnv };
    rmSync(dir, { recursive: true, force: true });
  });

  function loopStep(n: number): { tool: string; args: Record<string, unknown> } {
    const md = readFileSync(join(repoRoot, 'skills/frontguard/references/mcp.md'), 'utf8');
    const loop = md.split(/^## Recommended Agent Loop\s*$/m)[1]?.split(/^## /m)[0] ?? '';
    const line = loop.split('\n').find((l) => l.startsWith(`${n}. `));
    if (!line) throw new Error(`mcp.md: loop step ${n} not found`);
    const lineSpans = spans(line);
    const objectIndex = lineSpans.findIndex((s) => s.content.startsWith('{'));
    const owner = lineSpans.slice(0, objectIndex).reverse().find((s) => TOOL_NAME.test(s.content));
    if (objectIndex < 0 || !owner) throw new Error(`mcp.md: loop step ${n} has no tool call example`);
    return { tool: owner.content, args: JSON.parse(lineSpans[objectIndex].content) as Record<string, unknown> };
  }

  it('step 1 returns regression rows, and step 2 inspects the first one', async () => {
    const server = createServer();
    const client = new Client({ name: 'skill-loop', version: '0.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const step1 = loopStep(1);
      const listed = (await client.callTool({ name: step1.tool, arguments: step1.args })) as CallToolResult;
      expect(listed.isError).toBeFalsy();
      const page = listed.structuredContent as { regressions: Array<{ diffId: string }>; notFound?: unknown };
      expect(page.notFound).toBeUndefined();
      expect(page.regressions.length).toBeGreaterThan(0);

      const step2 = loopStep(2);
      const args = JSON.parse(
        JSON.stringify(step2.args).replaceAll('<diffId>', page.regressions[0].diffId),
      ) as Record<string, unknown>;
      const inspected = (await client.callTool({ name: step2.tool, arguments: args })) as CallToolResult;
      expect(inspected.isError).toBeFalsy();
      expect(inspected.structuredContent).toMatchObject({
        route: '/pricing',
        clusters: [{ targetSelector: '.pricing-card' }],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
