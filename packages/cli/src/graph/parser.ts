/**
 * Static import/dependency graph parser.
 *
 * Extracts import relationships from source files (JS/TS/CSS) using
 * regex-based parsing. Used for smart rendering — determines which
 * components/styles changed and which routes to re-test.
 *
 * @module graph/parser
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum files to visit during graph traversal (prevents runaway builds).
 * A walk that stops here is incomplete: callers must render every route.
 */
export const DEPENDENCY_GRAPH_FILE_CAP = 10_000;

/** Extensions to try when resolving extensionless import specifiers. */
const TRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.module.css', '.vue', '.svelte'];

/** Extensions to try for index-file resolution. */
const INDEX_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/**
 * ES module static imports:
 *   import X from 'specifier';
 *   import { X } from 'specifier';
 *   import 'specifier';
 *   import type { X } from 'specifier'; (also matched — harmless)
 */
const ESM_IMPORT_RE = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/**
 * ES module barrel re-exports:
 *   export * from './Button';
 *   export * as ns from './utils';
 *   export { A, B } from './components';
 *   export type { Props } from './types';
 */
const ESM_REEXPORT_RE =
  /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]/gm;

/**
 * CommonJS require:
 *   const x = require('specifier');
 *   require('specifier');
 */
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Dynamic import():
 *   import('specifier')
 *   const x = await import('specifier');
 */
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * CSS @import:
 *   @import 'file.css';
 *   @import url('file.css');
 *   @import url("file.css");
 */
const CSS_IMPORT_RE = /@import\s+(?:url\s*\(\s*)?['"]([^'"]+)['"]\s*\)?/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PathAliasRule {
  prefix: string;
  suffix: string;
  targets: string[];
}

interface AliasConfig {
  baseDir: string;
  rules: PathAliasRule[];
}

const aliasCache = new Map<string, AliasConfig | null>();

function stripJsonComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
    .replace(/,\s*([}\]])/g, '$1');
}

function loadAliasConfig(projectDir?: string): AliasConfig | null {
  if (!projectDir) return null;
  const root = resolve(projectDir);
  if (aliasCache.has(root)) return aliasCache.get(root)!;
  for (const file of ['tsconfig.json', 'jsconfig.json']) {
    const full = join(root, file);
    if (!existsSync(full)) continue;
    try {
      const parsed = JSON.parse(stripJsonComments(readFileSync(full, 'utf-8'))) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const co = parsed.compilerOptions;
      if (!co?.paths || typeof co.paths !== 'object') continue;
      const baseDir = co.baseUrl ? resolve(root, co.baseUrl) : root;
      const rules: PathAliasRule[] = [];
      for (const [pattern, targets] of Object.entries(co.paths)) {
        if (!Array.isArray(targets)) continue;
        const star = pattern.indexOf('*');
        if (star === -1) {
          rules.push({ prefix: pattern, suffix: '', targets });
        } else {
          rules.push({
            prefix: pattern.slice(0, star),
            suffix: pattern.slice(star + 1),
            targets,
          });
        }
      }
      const cfg = { baseDir, rules };
      aliasCache.set(root, cfg);
      return cfg;
    } catch {
      // Ignore malformed tsconfig/jsconfig
    }
  }
  aliasCache.set(root, null);
  return null;
}

function matchesAliasRule(specifier: string, aliases: AliasConfig | null): boolean {
  if (!aliases) return false;
  return aliases.rules.some(
    (r) =>
      specifier.startsWith(r.prefix) &&
      specifier.endsWith(r.suffix) &&
      specifier.length >= r.prefix.length + r.suffix.length,
  );
}

/** Returns true if a specifier points to node_modules (bare specifier). */
function isBareSpecifier(specifier: string, aliases: AliasConfig | null = null): boolean {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('~') ||
    specifier.startsWith('@/')
  ) {
    return false;
  }
  return !matchesAliasRule(specifier, aliases);
}

/** Safely check if a path is a directory. */
function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveCandidateFile(target: string): string | null {
  if (extname(target) && existsSync(target) && !isDirectory(target)) {
    return target;
  }
  if (!extname(target)) {
    for (const ext of TRY_EXTENSIONS) {
      const withExt = target + ext;
      if (existsSync(withExt) && !isDirectory(withExt)) {
        return withExt;
      }
    }
  }
  if (existsSync(target) && isDirectory(target)) {
    for (const ext of INDEX_EXTENSIONS) {
      const indexPath = join(target, `index${ext}`);
      if (existsSync(indexPath)) return indexPath;
    }
  }
  if (!extname(target)) {
    for (const ext of INDEX_EXTENSIONS) {
      const indexPath = join(target, `index${ext}`);
      if (existsSync(indexPath)) return indexPath;
    }
  }
  return null;
}

function resolveImportPath(
  specifier: string,
  fromDir: string,
  projectDir?: string,
  aliases: AliasConfig | null = null,
): string | null {
  if (aliases) {
    for (const r of aliases.rules) {
      if (
        specifier.startsWith(r.prefix) &&
        specifier.endsWith(r.suffix) &&
        specifier.length >= r.prefix.length + r.suffix.length
      ) {
        const wildcard = specifier.slice(r.prefix.length, specifier.length - r.suffix.length);
        for (const t of r.targets) {
          const mapped = t.includes('*') ? t.replace('*', wildcard) : t;
          const found = resolveCandidateFile(resolve(aliases.baseDir, mapped));
          if (found) return found;
        }
      }
    }
  }

  if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
    const rest = specifier.slice(2);
    const root = projectDir ? resolve(projectDir) : fromDir;
    for (const candidate of [resolve(root, 'src', rest), resolve(root, rest)]) {
      const found = resolveCandidateFile(candidate);
      if (found) return found;
    }
    return null;
  }

  return resolveCandidateFile(resolve(fromDir, specifier));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

function readSource(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Import and require specifiers in source order, including ones that do not resolve. */
function rawSpecifiersFromSource(source: string, filePath: string): string[] {
  const rawSpecifiers: string[] = [];
  const ext = extname(filePath).toLowerCase();
  const isCssFile = ext === '.css' || ext === '.module.css';
  const hasJsImport = /(?:^|[^@])import\s+/m.test(source);
  const hasJsExport = /^\s*export\s+(?:type\s+)?(?:\*|\{)/m.test(source);
  const hasRequire = source.includes('require(');
  const hasCssImport = source.includes('@import');
  const looksLikeCss = isCssFile || (hasCssImport && !hasJsImport && !hasJsExport && !hasRequire);

  if (looksLikeCss) {
    CSS_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_IMPORT_RE.exec(source)) !== null) {
      rawSpecifiers.push(match[1]);
    }
    return rawSpecifiers;
  }

  ESM_IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ESM_IMPORT_RE.exec(source)) !== null) {
    rawSpecifiers.push(match[1]);
  }
  ESM_REEXPORT_RE.lastIndex = 0;
  while ((match = ESM_REEXPORT_RE.exec(source)) !== null) {
    rawSpecifiers.push(match[1]);
  }
  REQUIRE_RE.lastIndex = 0;
  while ((match = REQUIRE_RE.exec(source)) !== null) {
    rawSpecifiers.push(match[1]);
  }
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((match = DYNAMIC_IMPORT_RE.exec(source)) !== null) {
    rawSpecifiers.push(match[1]);
  }
  return rawSpecifiers;
}

/**
 * Parses a source file and returns all resolved absolute import paths.
 */
export function parseImports(filePath: string, projectDir?: string): string[] {
  const source = readSource(filePath);
  if (source === null) return [];

  const fromDir = dirname(filePath);
  const aliases = loadAliasConfig(projectDir);
  const resolved: string[] = [];
  for (const specifier of rawSpecifiersFromSource(source, filePath)) {
    if (isBareSpecifier(specifier, aliases)) continue;
    const absPath = resolveImportPath(specifier, fromDir, projectDir, aliases);
    if (absPath) resolved.push(absPath);
  }
  return [...new Set(resolved)];
}

/**
 * Relative, absolute, or aliased specifiers in `filePath` that did not resolve
 * to a file. Bare package specifiers are ignored.
 */
export function unresolvedRelativeImports(filePath: string, projectDir?: string): string[] {
  const source = readSource(filePath);
  if (source === null) return [];

  const fromDir = dirname(filePath);
  const aliases = loadAliasConfig(projectDir);
  const missing: string[] = [];
  for (const specifier of rawSpecifiersFromSource(source, filePath)) {
    if (isBareSpecifier(specifier, aliases)) continue;
    if (!resolveImportPath(specifier, fromDir, projectDir, aliases)) missing.push(specifier);
  }
  return [...new Set(missing)];
}

/** Forward import map plus a flag when the walk stopped at {@link DEPENDENCY_GRAPH_FILE_CAP}. */
export class DependencyGraph extends Map<string, Set<string>> {
  truncated = false;
}

export function buildDependencyGraph(
  entryFiles: string[],
  projectDir: string,
): DependencyGraph {
  const graph = new DependencyGraph();
  const visited = new Set<string>();
  const queue: string[] = [];

  // Seed the BFS queue with all entry files
  for (const entry of entryFiles) {
    const absEntry = resolve(entry);
    if (existsSync(absEntry) && !isDirectory(absEntry) && !visited.has(absEntry)) {
      queue.push(absEntry);
      visited.add(absEntry);
    }
  }

  // BFS traversal
  while (queue.length > 0) {
    if (graph.size >= DEPENDENCY_GRAPH_FILE_CAP) {
      graph.truncated = true;
      break;
    }

    const current = queue.shift()!;
    const imports = parseImports(current, projectDir);
    graph.set(current, new Set(imports));

    // Add unvisited imports to the queue
    for (const imp of imports) {
      if (!visited.has(imp)) {
        visited.add(imp);
        queue.push(imp);
      }
    }
  }

  return graph;
}
