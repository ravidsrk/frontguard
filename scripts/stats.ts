/**
 * scripts/stats.ts — Derive canonical product stats at build time.
 *
 * Source of truth for: "N tests", "N source files", "vX.Y.Z", "N built-in plugins",
 * and "NKB bundle" — the numbers that appear in the README and the web app.
 *
 * Run with:  npx tsx scripts/stats.ts
 * Output:    scripts/stats.json (canonical)
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const CLI_DIR = join(ROOT, 'packages/cli');
const TEST_DIR = join(CLI_DIR, 'test');
const SRC_DIR = join(CLI_DIR, 'src');
const PLUGINS_INDEX = join(SRC_DIR, 'plugins/index.ts');
const VERSION_FILE = join(ROOT, 'VERSION');

const TEST_EXCLUDES = ['fixtures', 'fixture-app', 'node_modules'];

function walk(dir: string, predicate: (path: string) => boolean, excludeDirs: string[] = []): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      out.push(...walk(full, predicate, excludeDirs));
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function countTestFiles(): number {
  return walk(TEST_DIR, (p) => p.endsWith('.test.ts'), TEST_EXCLUDES).length;
}

function countSourceFiles(): number {
  return walk(SRC_DIR, (p) => p.endsWith('.ts'), ['node_modules']).length;
}

function readVersion(): string {
  return readFileSync(VERSION_FILE, 'utf8').trim();
}

function countPlugins(): number {
  const txt = readFileSync(PLUGINS_INDEX, 'utf8');
  // Built-in plugins are exported via `create<Name>Plugin` factory functions.
  const matches = txt.match(/export\s*\{[^}]*create[A-Z][A-Za-z]+Plugin/g) ?? [];
  // Each export block may export multiple factories — explode and re-match.
  const factories = new Set<string>();
  for (const block of matches) {
    for (const m of block.matchAll(/create([A-Z][A-Za-z]+)Plugin/g)) {
      factories.add(m[1]);
    }
  }
  return factories.size;
}

interface PackResult {
  size: number; // tarball size in bytes
  unpackedSize: number;
}

function ensureBuilt(): void {
  // npm pack reflects the contents of `files` (which lists dist/). When dist is
  // missing the tarball reports an artificially tiny size — guard against that
  // by running the workspace build first.
  if (!existsSync(join(CLI_DIR, 'dist'))) {
    execSync('npm run build:cli', { cwd: ROOT, stdio: 'inherit' });
  }
}

function bundleSize(): { tarballBytes: number; tarballKB: number; unpackedBytes: number; unpackedKB: number } {
  ensureBuilt();
  const tmp = mkdtempSync(join(tmpdir(), 'frontguard-stats-'));
  try {
    const raw = execSync(`npm pack "${CLI_DIR}" --pack-destination "${tmp}" --json`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const parsed = JSON.parse(raw) as PackResult[];
    const first = parsed[0];
    if (!first) throw new Error('npm pack returned empty JSON');
    return {
      tarballBytes: first.size,
      tarballKB: Math.round(first.size / 1024),
      unpackedBytes: first.unpackedSize,
      unpackedKB: Math.round(first.unpackedSize / 1024),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function fileSizeBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function generated(): string {
  // Avoid Date.now()/new Date() — deterministic stamp from VERSION.
  // The generated timestamp is intentionally absent; the JSON is regenerated on every build.
  return 'derived-from-source';
}

function main(): void {
  const tests = countTestFiles();
  const sourceFiles = countSourceFiles();
  const version = readVersion();
  const plugins = countPlugins();
  const bundle = bundleSize();

  const payload = {
    version,
    tests,
    sourceFiles,
    plugins,
    bundleSize: {
      tarballBytes: bundle.tarballBytes,
      tarballKB: bundle.tarballKB,
      unpackedBytes: bundle.unpackedBytes,
      unpackedKB: bundle.unpackedKB,
    },
    // Convenience shortcuts used throughout the docs prose.
    display: {
      tests: `${tests} tests`,
      sourceFiles: `${sourceFiles} source files`,
      plugins: `${plugins} built-in plugins`,
      version: `v${version}`,
      bundle: `${bundle.tarballKB}KB`,
    },
    source: generated(),
  };

  const canonicalPath = join(SCRIPT_DIR, 'stats.json');

  writeFileSync(canonicalPath, JSON.stringify(payload, null, 2) + '\n');

  // eslint-disable-next-line no-console
  console.log(
    [
      `Frontguard stats (v${version})`,
      `  tests:        ${tests}`,
      `  source files: ${sourceFiles}`,
      `  plugins:      ${plugins}`,
      `  bundle:       ${bundle.tarballKB}KB (tarball) / ${bundle.unpackedKB}KB (unpacked)`,
      `  → ${canonicalPath}`,
    ].join('\n'),
  );
}

main();
