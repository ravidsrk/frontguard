#!/usr/bin/env node
/**
 * Doc link guard for apps/web docs-content.ts. Run from repo root:
 *   node apps/web/scripts/check-doc-links.mjs
 *
 * Assertions:
 *   1. Every href="/docs/<slug>" in article HTML resolves to a real article id.
 *   2. Action refs — only `ravidsrk/frontguard@v0` is allowed (forbids @v1 / @main).
 *
 * Exits 1 with a report on violation; exits 0 when clean.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DOCS_CONTENT = fileURLToPath(
  new URL('../src/lib/docs-content.ts', import.meta.url),
);
const BAD_ACTION_REF = /ravidsrk\/frontguard@(?!v0\b)/;
const ID_RE = /\{\s*id:\s*"([^"]+)"/g;
const LINK_RE = /href="(\/docs\/[^"#?]+)"/g;

const source = readFileSync(DOCS_CONTENT, 'utf8');
const slugs = new Set();
const violations = [];

let m;
while ((m = ID_RE.exec(source)) !== null) {
  slugs.add(m[1]);
}

while ((m = LINK_RE.exec(source)) !== null) {
  const href = m[1].replace(/^\/docs\//, '');
  if (!slugs.has(href)) {
    violations.push(`broken internal link → /docs/${href} (no article with id "${href}")`);
  }
}

const lines = source.split('\n');
lines.forEach((line, i) => {
  if (BAD_ACTION_REF.test(line)) {
    violations.push(`docs-content.ts:${i + 1}  non-canonical action ref (use @v0) → ${line.trim()}`);
  }
});

if (violations.length > 0) {
  console.error(`✘ check-doc-links: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('\nFix: ensure every /docs/<slug> link matches an article id; pin action refs to `ravidsrk/frontguard@v0`.');
  process.exit(1);
}

console.log(`✓ check-doc-links: ${slugs.size} article(s), internal links and action refs clean`);