#!/usr/bin/env node
/**
 * Doc link guard for Frontguard docs. Run with `node scripts/check-doc-links.mjs`
 * from apps/docs (or `node apps/docs/scripts/check-doc-links.mjs` from the repo
 * root — path resolution is cwd-independent).
 *
 * Two assertions across every `.mdx` under `content/docs/`:
 *
 *   1. Action refs — the only `ravidsrk/frontguard@<ref>` form allowed is the
 *      canonical `@v0`. Forbids regressing to `@v1` / `@main` / a phantom org.
 *      Exception: the "before" side of a ```diff migration block (lines that
 *      start with `-`) may keep the old `@main` ref so the migration note stays
 *      useful for users on older docs.
 *
 *   2. Dead marketplace links — a set of URL prefixes that 404 today must not
 *      appear OUTSIDE a `<Callout type="warn">` hedge. Inside such a callout the
 *      reader is told the listing is in review, so a reference there is fine.
 *
 * Exits 1 with a `file:line` report on any violation; exits 0 when clean.
 * Closes the regression surface for docs-5 (action refs) and docs-6 (dead
 * marketplace links). Wired into CI via the docs `check:doc-links` script.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const DOCS_DIR = fileURLToPath(new URL('../content/docs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

// Canonical action ref; anything else under this owner/repo is a violation.
const BAD_ACTION_REF = /ravidsrk\/frontguard@(?!v0\b)/;

// Marketplace / callback URLs that 404 today. Allowed only inside a
// `<Callout type="warn">` hedge block.
const DEAD_LINKS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
  'frontguard.dev/api/install',
  'frontguard.dev/settings/integrations',
  'frontguard.dev/integrations/slack',
  'vercel.com/integrations/frontguard',
];

/** Recursively collect every `.mdx` file under `dir`. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.mdx')) out.push(full);
  }
  return out;
}

const violations = [];
const files = walk(DOCS_DIR).sort();

for (const file of files) {
  const rel = relative(REPO_ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');

  // Track fenced-code state (for the diff exemption) and warn-callout state
  // (for the dead-link exemption) line by line.
  let fenceLang = null; // null = outside a fence; otherwise the opening lang
  let inWarn = false;

  lines.forEach((line, i) => {
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      fenceLang = fenceLang === null ? fence[1] || '' : null;
      return;
    }

    // 1. Non-canonical action ref.
    if (BAD_ACTION_REF.test(line)) {
      const isDiffBeforeLine = fenceLang === 'diff' && /^\s*-/.test(line);
      if (!isDiffBeforeLine) {
        violations.push(
          `${rel}:${i + 1}  non-canonical action ref (use @v0) → ${line.trim()}`,
        );
      }
    }

    // 2. Dead marketplace link outside a warn callout.
    if (/<Callout type="warn">/.test(line)) inWarn = true;
    if (!inWarn) {
      for (const dead of DEAD_LINKS) {
        if (line.includes(dead)) {
          violations.push(
            `${rel}:${i + 1}  dead marketplace link outside <Callout type="warn"> → ${dead}`,
          );
        }
      }
    }
    if (/<\/Callout>/.test(line)) inWarn = false;
  });
}

if (violations.length > 0) {
  console.error(`✘ check-doc-links: ${violations.length} violation(s) across ${files.length} .mdx file(s)\n`);
  for (const v of violations) console.error('  ' + v);
  console.error(
    '\nFix: pin action refs to `ravidsrk/frontguard@v0`; wrap dead marketplace ' +
      'links in a `<Callout type="warn">` hedge or remove them.',
  );
  process.exit(1);
}

console.log(`✓ check-doc-links: ${files.length} .mdx file(s) clean`);
