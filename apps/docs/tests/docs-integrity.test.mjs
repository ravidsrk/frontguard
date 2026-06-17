// Docs-integrity regression tests (closes docs-4, docs-7, docs-8, docs-9).
//
// These assert that the four post-ship doc hygiene findings stay fixed:
//   docs-4 — the Storybook CI recipe never reintroduces phantom `frontguard
//            run` flags (`--ai`, `--baseline-strategy`) that the CLI rejects.
//   docs-7 — the self-host /health sample is not the stale 0.1.0, and no
//            snippet instructs an anonymous pull of the unpublished GHCR image.
//   docs-8 — the orphaned top-level pages are reachable from the sidebar and
//            the three comparison pages live together under comparisons/.
//   docs-9 — no doc references the invented `frontguard approve` command or the
//            dead /docs/guides/scheduled-monitors / moved comparison links.
//
// Plain node:test so it runs with `node --test` and needs no extra dependency
// (apps/docs has no other test runner). Wired into apps/docs's `test` script,
// which the root `npm run test --workspaces` invokes in CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, '..', 'content', 'docs');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

const mdxFiles = walk(DOCS_ROOT);
const read = (...parts) => readFileSync(join(DOCS_ROOT, ...parts), 'utf8');

test('docs-4: storybook recipe has no phantom CLI flags', () => {
  const storybook = read('integrations', 'storybook.mdx');
  assert.ok(!/--baseline-strategy/.test(storybook), 'phantom flag --baseline-strategy is present');
  assert.ok(!/--ai\b/.test(storybook), 'phantom flag --ai is present');
});

test('docs-7: self-host /health sample is not the stale 0.1.0', () => {
  const selfHost = read('self-host.mdx');
  assert.ok(!/"version":"0\.1\.0"/.test(selfHost), 'stale 0.1.0 /health sample is present');
});

test('docs-7: self-host does not pull the unpublished GHCR image', () => {
  // A prose callout that names the path is fine; an `image:` or `docker pull`
  // directive pointing at the unpublished image is not.
  const selfHost = read('self-host.mdx');
  const offending = selfHost
    .split('\n')
    .filter((line) => /(image:\s*|docker pull\s+)ghcr\.io\/ravidsrk\/frontguard-cloud-api/.test(line));
  assert.equal(offending.length, 0, `found GHCR pull/image directives:\n${offending.join('\n')}`);
});

test('docs-8: top-level meta.json surfaces the orphaned pages', () => {
  const meta = JSON.parse(read('meta.json'));
  for (const page of ['sandbox', 'cross-os-rendering', 'distribution']) {
    assert.ok(meta.pages.includes(page), `meta.json is missing page "${page}"`);
  }
});

test('docs-8: comparisons/meta.json lists all three comparison pages', () => {
  const meta = JSON.parse(read('comparisons', 'meta.json'));
  for (const page of ['frontguard-vs-argos', 'frontguard-vs-percy', 'frontguard-vs-chromatic']) {
    assert.ok(meta.pages.includes(page), `comparisons/meta.json is missing "${page}"`);
  }
});

test('docs-9: no invented `frontguard approve` command anywhere in docs', () => {
  for (const file of mdxFiles) {
    assert.ok(!/frontguard approve\b/.test(readFileSync(file, 'utf8')), `found 'frontguard approve' in ${file}`);
  }
});

test('docs-9: no dead /docs/guides/scheduled-monitors link', () => {
  for (const file of mdxFiles) {
    assert.ok(
      !/\/docs\/guides\/scheduled-monitors/.test(readFileSync(file, 'utf8')),
      `dead scheduled-monitors link in ${file}`,
    );
  }
});

test('docs-9: no dead /docs/guides/frontguard-vs- links (pages moved to comparisons/)', () => {
  for (const file of mdxFiles) {
    assert.ok(
      !/\/docs\/guides\/frontguard-vs-/.test(readFileSync(file, 'utf8')),
      `dead guides comparison link in ${file}`,
    );
  }
});
