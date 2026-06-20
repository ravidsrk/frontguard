/**
 * Regression tests for mcp-3/mcp-10: bin entry via symlinks and dist JSON-RPC stdio.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { isInvokedDirectly } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(HERE, '../src/index.ts');
const DIST_BIN = join(HERE, '../dist/index.js');
const PKG_VERSION = (
  JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')) as { version: string }
).version;
const INIT_JSONL = join(HERE, 'fixtures/init.jsonl');

function parseJsonl(text: string): unknown[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

async function runDistBin(
  binPath: string,
  cwd: string,
  stdin: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));

    const frames = stdin
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    void (async () => {
      try {
        for (const frame of frames) {
          child.stdin.write(`${frame}\n`);
          await new Promise((r) => setTimeout(r, 50));
        }
        await new Promise((r) => setTimeout(r, 200));
        child.stdin.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

describe('isInvokedDirectly (mcp-3)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  });

  it('matches when argv[1] is a symlink to this module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-mcp-'));
    dirs.push(dir);
    const link = join(dir, 'frontguard-mcp');
    symlinkSync(INDEX_PATH, link);
    expect(isInvokedDirectly(['node', link])).toBe(true);
  });

  it('returns false for unrelated entry paths', () => {
    expect(isInvokedDirectly(['node', '/tmp/unrelated-script.js'])).toBe(false);
  });
});

describe('dist bin JSON-RPC stdio (mcp-3, mcp-10)', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  });

  it.skipIf(!existsSync(DIST_BIN))(
    'initialize + tools/list respond on stdout; startup line on stderr',
    async () => {
      const stdin = readFileSync(INIT_JSONL, 'utf8');
      const { stdout, stderr, code } = await runDistBin(DIST_BIN, tmpdir(), stdin);

      expect(code).toBe(0);
      expect(stderr).toMatch(
        new RegExp(`frontguard-mcp v${PKG_VERSION.replace(/\./g, '\\.')} starting on stdio`),
      );
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).not.toMatch(/frontguard-mcp v/);

      const frames = parseJsonl(stdout);
      const init = frames.find(
        (f) =>
          typeof f === 'object' &&
          f !== null &&
          (f as { id?: number }).id === 1 &&
          'result' in (f as object),
      ) as { result: { serverInfo: { name: string } } } | undefined;
      expect(init?.result.serverInfo.name).toBe('@frontguard/mcp');

      const toolsList = frames.find(
        (f) =>
          typeof f === 'object' &&
          f !== null &&
          (f as { id?: number }).id === 2 &&
          'result' in (f as object),
      ) as { result: { tools: Array<{ name: string }> } } | undefined;
      const names = toolsList?.result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'accept_baseline',
        'get_suggested_fix',
        'list_regressions',
        'recent_runs',
      ]);
    },
    15_000,
  );

  it.skipIf(!existsSync(DIST_BIN))(
    'works when launched through a symlink from /tmp (npx-style path resolution)',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'frontguard-mcp-bin-'));
      dirs.push(dir);
      const link = join(dir, 'frontguard-mcp');
      symlinkSync(DIST_BIN, link);

      const stdin = readFileSync(INIT_JSONL, 'utf8');
      const { stdout, stderr, code } = await runDistBin(link, dir, stdin);

      expect(code).toBe(0);
      expect(stderr).toMatch(
        new RegExp(`frontguard-mcp v${PKG_VERSION.replace(/\./g, '\\.')} starting on stdio`),
      );
      expect(stdout).toContain('"tools"');
      expect(stdout).toContain('list_regressions');
    },
    15_000,
  );
});