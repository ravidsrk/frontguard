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
const ID_RE = /(?:\{\s*id:\s*["']([^"']+)["']|makeArticle\(\s*["']([^"']+)["'])/g;
const LINK_RE = /href="(\/docs\/[^"#?]+)"/g;
const FORBIDDEN_PATTERNS = [
  { re: /--baseline-strategy\b/, label: 'nonexistent --baseline-strategy flag' },
  { re: /--ai\b/, label: 'nonexistent --ai flag' },
  { re: /frontguard approve/, label: 'invented frontguard approve command' },
  { re: /scheduled-monitors/, label: 'dead /docs/guides/scheduled-monitors link' },
  { re: /guides\/frontguard-vs-(percy|chromatic)/, label: 'stale guides/ comparison path' },
  { re: /Docker will pull/, label: 'unpublished registry pull promise' },
  { re: /docs\.frontguard\.dev/, label: 'stale docs.frontguard.dev host' },
  { re: /threshold \(0[–-]100\)/i, label: 'stale 0-100 threshold units' },
  { re: /pixel diff threshold percentage/i, label: 'stale threshold percentage units' },
  { re: /\bai-provider\b/i, label: 'unsupported ai-provider Action input' },
  {
    re: /only warnings\s*\/\s*new pages|pipeline errors \(but no regressions\)/i,
    label: 'stale exit-code semantics',
  },
  {
    re: /posts? a PR comment with [^.\n]*thumbnails/i,
    label: 'unqualified generally-available PR thumbnail claim',
  },
  { re: /\bbest accuracy\b|90%\+/i, label: 'unmeasured AI accuracy claim' },
  {
    re: /re-rendered the page with the fix applied to confirm it works/i,
    label: 'unqualified verified-fix guarantee',
  },
  {
    re: /\b(?:6|six) lifecycle hooks\b/i,
    label: 'stale lifecycle hook count',
  },
  {
    re: /beforeDiscover\s*(?:→|&rarr;|·)\s*afterDiscover\s*(?:→|&rarr;|·)\s*afterRender/i,
    label: 'lifecycle sequence missing beforeRender',
  },
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
  const chunks = lines
    ? text.split('\n').map((line, index) => ({ text: line, label: `${label}:${index + 1}` }))
    : [{ text, label }];

  for (const chunk of chunks) {
    if (BAD_ACTION_REF.test(chunk.text)) {
      violations.push(`${chunk.label}  non-canonical action ref (use @v0)`);
    }
    for (const dead of DEAD_MARKETPLACE_URLS) {
      if (chunk.text.includes(dead)) {
        violations.push(`${chunk.label}  dead marketplace URL (listing not live) → ${dead}`);
      }
    }
    for (const { re, label: patternLabel } of FORBIDDEN_PATTERNS) {
      if (re.test(chunk.text)) {
        violations.push(`${chunk.label}  forbidden pattern (${patternLabel})`);
      }
    }
  }
}

const docsContent = readFileSync(SCAN_TARGETS[0].path, 'utf8');
const slugs = new Set();

let m;
while ((m = ID_RE.exec(docsContent)) !== null) {
  slugs.add(m[1] ?? m[2]);
}

if (slugs.size !== 37) {
  violations.push(`docs article inventory has ${slugs.size} entries; expected 37`);
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

const deployment = docsContent.match(
  /label:\s*["']DEPLOYMENT & SANDBOXING["'][\s\S]*?ids:\s*\[([^\]]+)\]/,
);
if (deployment) {
  for (const id of ['self-host', 'sandbox', 'cross-os-rendering', 'distribution']) {
    if (!new RegExp(`["']${id}["']`).test(deployment[1])) {
      violations.push(`DEPLOYMENT & SANDBOXING nav missing ${id}`);
    }
  }
} else {
  violations.push('DEPLOYMENT & SANDBOXING nav group not found');
}

if (violations.length > 0) {
  console.error(`✘ check-doc-links: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('\nFix the reported action reference, dead URL, or stale documentation semantic.');
  process.exit(1);
}

console.log(`✓ check-doc-links: ${slugs.size} article(s), ${SCAN_TARGETS.length} surfaces clean`);
