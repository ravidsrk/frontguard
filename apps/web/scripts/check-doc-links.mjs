#!/usr/bin/env node
/**
 * Doc link guard for live Frontguard docs surfaces. Run from repo root:
 *   node apps/web/scripts/check-doc-links.mjs
 *
 * Assertions:
 *   1. Every href="/docs/<slug>" in docs-content.ts resolves to a real article id.
 *   2. Action refs — only `ravidsrk/frontguard@v0` is allowed (forbids @v1 / @main).
 *   3. No dead marketplace listing URLs (404 until OPS publishes listings).
 *   4. No forbidden doc patterns (fake CLI flags, invented commands, stale paths).
 *
 * Scans: apps/web/src/lib/docs-content.ts, apps/web/public/llms*.txt,
 * integration READMEs (github/netlify/vercel), and design-extract doc snapshots.
 *
 * Exits 1 with a report on violation; exits 0 when clean.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

const BAD_ACTION_REF = /ravidsrk\/frontguard@(?!v0\b)/;
const DEAD_MARKETPLACE_URLS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
  'frontguard/frontguard-action',
];
const ID_RE = /\{\s*id:\s*"([^"]+)"/g;
const LINK_RE = /href="(\/docs\/[^"#?]+)"/g;
const FORBIDDEN_PATTERNS = [
  { re: /--baseline-strategy\b/, label: 'nonexistent --baseline-strategy flag' },
  { re: /--ai\b/, label: 'nonexistent --ai flag' },
  { re: /frontguard approve/, label: 'invented frontguard approve command' },
  { re: /scheduled-monitors/, label: 'dead /docs/guides/scheduled-monitors link' },
  { re: /guides\/frontguard-vs-(percy|chromatic)/, label: 'stale guides/ comparison path' },
  { re: /Docker will pull/, label: 'unpublished registry pull promise' },
  { re: /docs\.frontguard\.dev/, label: 'stale docs.frontguard.dev host' },
];

const SCAN_TARGETS = [
  { path: join(HERE, '../src/lib/docs-content.ts'), label: 'docs-content.ts', lines: true },
  { path: join(HERE, '../public/llms.txt'), label: 'llms.txt', lines: false },
  { path: join(HERE, '../public/llms-full.txt'), label: 'llms-full.txt', lines: false },
  { path: join(REPO_ROOT, 'integrations/github-app/README.md'), label: 'integrations/github-app/README.md', lines: true },
  { path: join(REPO_ROOT, 'integrations/netlify/README.md'), label: 'integrations/netlify/README.md', lines: true },
  { path: join(REPO_ROOT, 'integrations/vercel/README.md'), label: 'integrations/vercel/README.md', lines: true },
  { path: join(REPO_ROOT, 'docs/design-extract/source/Docs.dc.html'), label: 'docs/design-extract/source/Docs.dc.html', lines: true },
  { path: join(REPO_ROOT, 'docs/design-extract/tanstack/src/lib/docs-content.ts'), label: 'docs/design-extract/tanstack/src/lib/docs-content.ts', lines: true },
];

const violations = [];

function scanText(text, label, lines = false) {
  if (lines) {
    const rows = text.split('\n');
    rows.forEach((line, i) => {
      if (BAD_ACTION_REF.test(line)) {
        violations.push(`${label}:${i + 1}  non-canonical action ref (use @v0)`);
      }
      for (const dead of DEAD_MARKETPLACE_URLS) {
        if (line.includes(dead)) {
          violations.push(`${label}:${i + 1}  dead marketplace URL (listing not live) → ${dead}`);
        }
      }
    });
    return;
  }

  if (BAD_ACTION_REF.test(text)) {
    violations.push(`${label}  non-canonical action ref (use @v0)`);
  }
  for (const dead of DEAD_MARKETPLACE_URLS) {
    if (text.includes(dead)) {
      violations.push(`${label}  dead marketplace URL (listing not live) → ${dead}`);
    }
  }
}

const docsContent = readFileSync(SCAN_TARGETS[0].path, 'utf8');
const slugs = new Set();

let m;
while ((m = ID_RE.exec(docsContent)) !== null) {
  slugs.add(m[1]);
}

while ((m = LINK_RE.exec(docsContent)) !== null) {
  const href = m[1].replace(/^\/docs\//, '');
  if (!slugs.has(href)) {
    violations.push(`broken internal link → /docs/${href} (no article with id "${href}")`);
  }
}

for (const target of SCAN_TARGETS) {
  scanText(readFileSync(target.path, 'utf8'), target.label, target.lines);
}

for (const { re, label } of FORBIDDEN_PATTERNS) {
  if (re.test(docsContent)) {
    violations.push(`forbidden pattern (${label})`);
  }
}

const deployment = docsContent.match(/label: "DEPLOYMENT & SANDBOXING"[^}]+ids: \[([^\]]+)\]/);
if (deployment) {
  for (const id of ['"self-host"', '"sandbox"', '"cross-os-rendering"', '"distribution"']) {
    if (!deployment[1].includes(id)) {
      violations.push(`DEPLOYMENT & SANDBOXING nav missing ${id}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`✘ check-doc-links: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('\nFix: pin action refs to `ravidsrk/frontguard@v0`; hedge or remove dead marketplace URLs.');
  process.exit(1);
}

console.log(`✓ check-doc-links: ${slugs.size} article(s), ${SCAN_TARGETS.length} surfaces clean`);