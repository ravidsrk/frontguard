#!/usr/bin/env node
/**
 * Doc link & rendered-surface guard for live Frontguard docs/web surfaces.
 * Run from repo root:
 *   node apps/web/scripts/check-doc-links.mjs
 *
 * Assertions:
 *   1. Every href="/docs/<slug>" and TanStack `_splat: '<slug>'` in apps/web/src
 *      resolves to a real article id in docs-content.ts.
 *   2. Every https://frontguard.dev/docs/<slug> link in public/llms*.txt,
 *      public/agents.md, apps/demo/README.md, and skills/frontguard/** resolves
 *      to a real article id.
 *   3. No visible `TODO:` markers or `.fg-todo-note` placeholders in rendered
 *      web routes, components, or stylesheets.
 *   4. Action refs — only `ravidsrk/frontguard@v0` is allowed (forbids @v1 / @main).
 *   5. No dead marketplace listing URLs (404 until OPS publishes listings).
 *   6. No forbidden doc patterns (fake CLI flags, invented commands, stale paths).
 *
 * Exits 1 with a report on violation; exits 0 when clean.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(HERE, '../../..');

const BAD_ACTION_REF = /ravidsrk\/frontguard@(?!v0\b)/;
const DEAD_MARKETPLACE_URLS = [
  'github.com/marketplace/frontguard',
  'github.com/apps/frontguard',
  'frontguard/frontguard-action',
];
const ID_RE = /(?:\{\s*id:\s*["']([^"']+)["']|makeArticle\(\s*["']([^"']+)["'])/g;
const LINK_RE = /href="(\/docs\/[^"#?]+)"/g;
const SPLAT_RE = /_splat\s*:\s*["']([^"']+)["']/g;
const DOCS_URL_CALL_RE = /docsUrl\(\s*["']([^"']+)["']\s*\)/g;
const EXTERNAL_DOC_URL_RE = /https:\/\/frontguard\.dev\/docs\/([a-z0-9/_-]+)/g;
const TODO_MARKER_RE = /\bTODO:|fg-todo-note/;

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
];

function walkFiles(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

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

// Validate all _splat targets, /docs/ hrefs, docsUrl() calls, and TODO markers in rendered web source.
const webSrcFiles = walkFiles(
  join(WEB_ROOT, 'src'),
  (file) => /\.(tsx?|css)$/.test(file) && !file.includes('/src/test/') && !file.endsWith('routeTree.gen.ts'),
);

for (const file of webSrcFiles) {
  const rel = relative(REPO_ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    const loc = `${rel}:${idx + 1}`;
    for (const match of line.matchAll(SPLAT_RE)) {
      const slug = match[1];
      if (!slugs.has(slug)) {
        violations.push(`${loc}  broken _splat docs target → "${slug}" (no article with id "${slug}")`);
      }
    }
    for (const match of line.matchAll(DOCS_URL_CALL_RE)) {
      const slug = match[1];
      if (!slugs.has(slug)) {
        violations.push(`${loc}  broken docsUrl() target → "${slug}" (no article with id "${slug}")`);
      }
    }
    if (file !== SCAN_TARGETS[0].path) {
      for (const match of line.matchAll(LINK_RE)) {
        const slug = match[1].replace(/^\/docs\//, '');
        if (!slugs.has(slug)) {
          violations.push(`${loc}  broken internal link → /docs/${slug} (no article with id "${slug}")`);
        }
      }
    }
    if (
      (rel.startsWith('apps/web/src/routes/') ||
        rel.startsWith('apps/web/src/components/') ||
        rel === 'apps/web/src/styles.css') &&
      TODO_MARKER_RE.test(line)
    ) {
      violations.push(`${loc}  rendered TODO marker or .fg-todo-note placeholder is forbidden`);
    }
  });
}

// Validate external https://frontguard.dev/docs/<slug> references across public docs, demo, and skills.
const externalDocTargets = [
  join(WEB_ROOT, 'public/llms.txt'),
  join(WEB_ROOT, 'public/llms-full.txt'),
  join(WEB_ROOT, 'public/agents.md'),
  join(REPO_ROOT, 'apps/demo/README.md'),
  ...walkFiles(join(REPO_ROOT, 'skills/frontguard'), (file) => file.endsWith('.md')),
];

for (const file of externalDocTargets) {
  if (!existsSync(file)) continue;
  const rel = relative(REPO_ROOT, file);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(EXTERNAL_DOC_URL_RE)) {
    const slug = match[1].replace(/\/$/, '');
    if (!slugs.has(slug)) {
      violations.push(`${rel}  broken docs URL → https://frontguard.dev/docs/${slug}`);
    }
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

console.log(
  `✓ check-doc-links: ${slugs.size} article(s), ${SCAN_TARGETS.length} doc surfaces, ${webSrcFiles.length} web source files clean`,
);
