/**
 * docs/ARCHITECTURE.md stays tied to the tree (#384).
 *
 * 1. Every top-level directory under packages/, integrations/ and apps/ is
 *    mentioned by path, such as `packages/cli`.
 * 2. Every backticked PascalCase name in the doc is exported by an
 *    `export interface|type|class|function|const|enum` declaration in a
 *    workspace src/ tree.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOC = 'docs/ARCHITECTURE.md';
const WORKSPACE_ROOTS = ['packages', 'integrations', 'apps'];
const WORKSPACE_SOURCE = /^(?:packages|integrations|apps)\/[^/]+\/src\/.+\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/;
/** A type-style name: leading capital, at least one lowercase letter, letters and digits only. */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;
const EXPORT_DECLARATION =
  /^[ \t]*export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:interface|type|class|function\*?|const|enum)\s+([A-Za-z_$][\w$]*)/gm;

/** Tracked files plus untracked files that are not ignored. */
function repoFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(listed.split('\0').filter(Boolean))].filter((file) => {
    const absolute = path.join(repoRoot, file);
    return existsSync(absolute) && statSync(absolute).isFile();
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('docs/ARCHITECTURE.md (#384)', () => {
  const files = repoFiles();
  const doc = readFileSync(path.join(repoRoot, DOC), 'utf8');

  it('mentions every top-level directory under packages/, integrations/ and apps/', () => {
    const directories = new Set<string>();
    for (const file of files) {
      const parts = file.split('/');
      if (parts.length > 2 && WORKSPACE_ROOTS.includes(parts[0])) {
        directories.add(`${parts[0]}/${parts[1]}`);
      }
    }

    const missing = [...directories]
      .filter((directory) => !new RegExp(`(?<![\\w/-])${escapeRegExp(directory)}(?![\\w-])`).test(doc))
      .sort();

    expect(directories.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('names only types and symbols that a workspace src/ tree exports', () => {
    const prose = doc.replace(/```[\s\S]*?```/g, '');
    const named = new Set<string>();
    for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
      const name = match[1].trim();
      if (PASCAL_CASE.test(name)) named.add(name);
    }

    const exported = new Set<string>();
    for (const file of files.filter((candidate) => WORKSPACE_SOURCE.test(candidate))) {
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      for (const match of source.matchAll(EXPORT_DECLARATION)) exported.add(match[1]);
    }

    const unexported = [...named].filter((name) => !exported.has(name)).sort();

    expect(named.size).toBeGreaterThan(10);
    expect(unexported).toEqual([]);
  });
});
