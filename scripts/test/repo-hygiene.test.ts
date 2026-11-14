/**
 * Repository hygiene (#385).
 *
 * 1. No file outside a source tree is a byte-identical copy of a source file.
 *    Source trees are the src/ directories of each workspace under packages/,
 *    apps/ and integrations/. A copy has to be edited twice, and searches land
 *    on it as often as on the real file.
 * 2. docs/README.md links every Markdown doc under docs/ except docs/archive/,
 *    and every relative link in it resolves.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SOURCE_FILE = /^(?:packages|apps|integrations)\/[^/]+\/src\//;

/**
 * Deliberate copies, keyed by the copy, with the source file each one mirrors.
 * The web app serves openapi.json and cloud-api bundles the same contract.
 * scripts/sync-openapi.mjs copies the web file onto the cloud-api file, and CI
 * fails when the two differ.
 */
const ALLOWED_COPIES: Readonly<Record<string, string>> = {
  'apps/web/public/openapi.json': 'packages/cloud-api/src/openapi.json',
};

/** Tracked files plus untracked files that are not ignored, so a new copy fails before it is committed. */
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

function sizeOf(file: string): number {
  return statSync(path.join(repoRoot, file)).size;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(path.join(repoRoot, file))).digest('hex');
}

/** Relative link targets in a Markdown file, resolved to repo-relative paths. */
function relativeLinks(markdownFile: string): string[] {
  const text = readFileSync(path.join(repoRoot, markdownFile), 'utf8');
  const targets: string[] = [];
  for (const match of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('/')) continue;
    const withoutAnchor = target.split('#')[0];
    if (!withoutAnchor) continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(markdownFile), decodeURIComponent(withoutAnchor)),
    );
    targets.push(resolved.replace(/\/$/, ''));
  }
  return targets;
}

describe('repository hygiene (#385)', () => {
  const files = repoFiles();

  it('keeps no byte-identical copy of a source file outside the source trees', () => {
    const sources = files.filter((file) => SOURCE_FILE.test(file));
    const sourceSizes = new Set(sources.map(sizeOf));
    // Empty files carry no content to keep in step.
    const candidates = files.filter((file) => {
      if (SOURCE_FILE.test(file)) return false;
      const size = sizeOf(file);
      return size > 0 && sourceSizes.has(size);
    });
    const candidateSizes = new Set(candidates.map(sizeOf));

    const sourcesByHash = new Map<string, string[]>();
    for (const source of sources) {
      if (!candidateSizes.has(sizeOf(source))) continue;
      const hash = sha256(source);
      sourcesByHash.set(hash, [...(sourcesByHash.get(hash) ?? []), source]);
    }

    const copies: string[] = [];
    for (const candidate of candidates) {
      for (const source of sourcesByHash.get(sha256(candidate)) ?? []) {
        if (ALLOWED_COPIES[candidate] === source) continue;
        copies.push(`${candidate} is a copy of ${source}`);
      }
    }

    expect(copies).toEqual([]);
  });

  it('links every Markdown doc outside docs/archive/ from docs/README.md', () => {
    const linked = new Set(relativeLinks('docs/README.md'));
    const docs = files.filter(
      (file) =>
        file.startsWith('docs/') &&
        file.endsWith('.md') &&
        !file.startsWith('docs/archive/') &&
        file !== 'docs/README.md',
    );

    expect(docs.length).toBeGreaterThan(0);
    expect(docs.filter((doc) => !linked.has(doc))).toEqual([]);
  });

  it('has no dead relative links in docs/README.md', () => {
    const dead = relativeLinks('docs/README.md').filter(
      (target) => !existsSync(path.join(repoRoot, target)),
    );

    expect(dead).toEqual([]);
  });
});
