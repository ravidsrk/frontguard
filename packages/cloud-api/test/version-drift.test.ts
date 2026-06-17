/**
 * Forward guard against version drift (cloud-9).
 *
 * Every SemVer literal that appears in a non-comment line under `src/` must
 * equal the package.json version. This is what stops a future edit from
 * re-introducing the `Frontguard v0.1.0` footer (or any other hardcoded
 * version) on a product that has moved on to a later release. The canonical
 * version is exposed by `src/version.ts` (sourced from package.json), so the
 * correct fix for a failure here is to import `PACKAGE_VERSION`, not to retype
 * the number.
 *
 * Escape hatch: append `// allow-version-drift` to a line that legitimately
 * needs a different SemVer literal (e.g. a documented compatibility floor).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const srcDir = join(pkgDir, 'src');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8')) as {
  version: string;
};

/** Recursively collect every `.ts` source file (excluding test files). */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SEMVER = /\bv?\d+\.\d+\.\d+\b/g;

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

describe('version drift (cloud-9)', () => {
  it('exposes the canonical version from package.json', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has no hardcoded SemVer literal in src/ that disagrees with package.json', () => {
    const offenders: string[] = [];

    for (const file of collectSources(srcDir)) {
      const rel = file.slice(pkgDir.length + 1);
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, idx) => {
        if (isCommentLine(line)) return;
        // package.json is the source of truth; importing it is never drift.
        if (line.includes('package.json') || line.includes('allow-version-drift')) return;

        const matches = line.match(SEMVER);
        if (!matches) return;
        for (const m of matches) {
          const literal = m.replace(/^v/, '');
          if (literal !== version) {
            offenders.push(`${rel}:${idx + 1}  "${m}" != package.json ${version}`);
          }
        }
      });
    }

    expect(
      offenders,
      `Hardcoded version literal(s) drifted from package.json (${version}):\n` +
        offenders.join('\n') +
        '\nImport PACKAGE_VERSION from ./version.js instead of retyping the number.',
    ).toEqual([]);
  });
});
