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

/** Maximum files to visit during graph traversal (prevents runaway builds). */
const MAX_GRAPH_FILES = 10_000;

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

/** Returns true if a specifier points to node_modules (bare specifier). */
function isBareSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith('.') &&
    !specifier.startsWith('/') &&
    !specifier.startsWith('~')
  );
}

/** Safely check if a path is a directory. */
function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolves a relative import specifier to an absolute file path.
 *
 * Tries the following resolution strategies in order:
 * 1. Exact path (if it has an extension and exists)
 * 2. Append each extension from TRY_EXTENSIONS
 * 3. Treat as directory and look for index files
 *
 * @returns Resolved absolute path or null if not found
 */
function resolveImportPath(specifier: string, fromDir: string): string | null {
  const target = resolve(fromDir, specifier);

  // 1. Exact file match (has extension and exists as file)
  if (extname(target) && existsSync(target) && !isDirectory(target)) {
    return target;
  }

  // 2. Try appending extensions
  if (!extname(target)) {
    for (const ext of TRY_EXTENSIONS) {
      const withExt = target + ext;
      if (existsSync(withExt) && !isDirectory(withExt)) {
        return withExt;
      }
    }
  }

  // 3. Try as directory with index files
  if (existsSync(target) && isDirectory(target)) {
    for (const ext of INDEX_EXTENSIONS) {
      const indexPath = join(target, `index${ext}`);
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  // 4. If had extension but didn't exist, still try index files
  if (!extname(target)) {
    for (const ext of INDEX_EXTENSIONS) {
      const indexPath = join(target, `index${ext}`);
      if (existsSync(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Parses a source file and returns all resolved absolute import paths.
 *
 * Reads the file from disk, extracts all import/require statements using
 * regex, resolves relative paths to absolute paths, and returns the result.
 *
 * - Skips bare specifiers (node_modules packages)
 * - Resolves extensionless imports by trying common extensions
 * - Handles index file resolution for directory imports
 * - Returns empty array on any read error (graceful degradation)
 *
 * @param filePath - Absolute path to the source file
 * @returns Array of absolute paths this file imports
 */
export function parseImports(filePath: string): string[] {
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    // File not found or unreadable — graceful degradation
    return [];
  }

  const fromDir = dirname(filePath);
  const rawSpecifiers: string[] = [];

  // Determine if this is a CSS file (by extension or content heuristic)
  const ext = extname(filePath).toLowerCase();
  const isCssFile = ext === '.css' || ext === '.module.css';

  // For CSS files, only look for @import
  // For JS/TS files, look for all import types
  const hasJsImport = /(?:^|[^@])import\s+/m.test(source);
  const hasRequire = source.includes('require(');
  const hasCssImport = source.includes('@import');
  const looksLikeCss = isCssFile || (hasCssImport && !hasJsImport && !hasRequire);

  if (looksLikeCss) {
    CSS_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CSS_IMPORT_RE.exec(source)) !== null) {
      rawSpecifiers.push(match[1]);
    }
  } else {
    // ESM imports
    ESM_IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ESM_IMPORT_RE.exec(source)) !== null) {
      rawSpecifiers.push(match[1]);
    }

    // require() calls
    REQUIRE_RE.lastIndex = 0;
    while ((match = REQUIRE_RE.exec(source)) !== null) {
      rawSpecifiers.push(match[1]);
    }

    // Dynamic import()
    DYNAMIC_IMPORT_RE.lastIndex = 0;
    while ((match = DYNAMIC_IMPORT_RE.exec(source)) !== null) {
      rawSpecifiers.push(match[1]);
    }
  }

  // Resolve specifiers to absolute paths, skipping bare specifiers
  const resolved: string[] = [];
  for (const specifier of rawSpecifiers) {
    if (isBareSpecifier(specifier)) continue;

    const absPath = resolveImportPath(specifier, fromDir);
    if (absPath) {
      resolved.push(absPath);
    }
  }

  return [...new Set(resolved)];
}

/**
 * Builds a full dependency graph via BFS from multiple entry files.
 *
 * For each entry file, recursively follows all relative imports, building
 * a map of every file to the set of files it imports.
 *
 * - Tracks visited files to handle circular dependencies
 * - Caps at 10,000 files to prevent runaway traversals
 * - Returns forward edge map: file → set of files it imports
 *
 * @param entryFiles - Absolute paths to start BFS from
 * @param _projectDir - Project root (reserved for future use)
 * @returns Map of file path → set of absolute paths it imports
 */
export function buildDependencyGraph(
  entryFiles: string[],
  _projectDir: string,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
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
    // Cap check
    if (graph.size >= MAX_GRAPH_FILES) break;

    const current = queue.shift()!;
    const imports = parseImports(current);
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
