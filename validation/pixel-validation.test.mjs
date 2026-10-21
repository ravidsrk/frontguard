/**
 * #285 checks that do not clone the external repos.
 * Run: node --test validation/pixel-validation.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PIXEL_VALIDATION_SEED,
  planMutations,
  renderPixelApp,
  renderSelection,
} from './fixtures/mutate.mjs';

const root = dirname(fileURLToPath(import.meta.url));

/** v0.2 limits, kept in the same paragraph as any 0.0% citation. */
export const V02_LIMIT_SENTENCE =
  'two of five repos, Chromium, one macOS host, AI off, no true-positive arm, SSIM not exercised, CLI 0.2.0 (`validation/results-v0.2.md`, 2026-06-20)';

function dump(files) {
  const out = {};
  for (const key of Object.keys(files).sort()) {
    const value = files[key];
    out[key] = Buffer.isBuffer(value) ? value.toString('base64') : value;
  }
  return out;
}

function paragraphs(text) {
  return text.split(/\n\s*\n/);
}

test('mutation operator is deterministic for a seed', () => {
  const first = renderPixelApp(PIXEL_VALIDATION_SEED);
  const second = renderPixelApp(PIXEL_VALIDATION_SEED);
  assert.deepEqual(first.plan, second.plan);
  assert.deepEqual(dump(first.files), dump(second.files));
  assert.deepEqual(planMutations(PIXEL_VALIDATION_SEED), planMutations(PIXEL_VALIDATION_SEED));

  const other = renderPixelApp(PIXEL_VALIDATION_SEED + 1);
  assert.notDeepEqual(dump(first.files), dump(other.files));
  assert.deepEqual(
    first.plan.operators.map((op) => op.id),
    other.plan.operators.map((op) => op.id),
  );
  assert.deepEqual(
    first.plan.operators.map((op) => op.bucket),
    other.plan.operators.map((op) => op.bucket),
  );

  const selectionA = renderSelection({ seed: PIXEL_VALIDATION_SEED, name: 'svg-and-about' });
  const selectionB = renderSelection({ seed: PIXEL_VALIDATION_SEED, name: 'svg-and-about' });
  assert.deepEqual(dump(selectionA.files), dump(selectionB.files));
  const clean = renderSelection(null);
  assert.notDeepEqual(selectionA.files['public/logo.svg'], clean.files['public/logo.svg']);
  assert.notDeepEqual(selectionA.files['pages/about.js'], clean.files['pages/about.js']);
  assert.equal(selectionA.files['pages/gallery.js'], clean.files['pages/gallery.js']);
  const aboutOnly = renderSelection({ seed: PIXEL_VALIDATION_SEED, name: 'about-only' });
  assert.equal(aboutOnly.files['public/logo.svg'], clean.files['public/logo.svg']);
  const font = renderSelection({ seed: PIXEL_VALIDATION_SEED, name: 'font-file' });
  assert.notDeepEqual(font.files['public/fonts/brand.woff'], clean.files['public/fonts/brand.woff']);
  assert.equal(font.files['site/about.html'], clean.files['site/about.html']);

  const changed = (left, right) => Object.keys(left).filter((key) => {
    const a = left[key];
    const b = right[key];
    if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) {
      return !Buffer.isBuffer(a) || !Buffer.isBuffer(b) || !a.equals(b);
    }
    return a !== b;
  }).sort();
  assert.deepEqual(changed(font.files, clean.files), ['public/fonts/brand.woff']);
  assert.deepEqual(changed(aboutOnly.files, clean.files), ['pages/about.js', 'site/about.html']);
  const cssBg = renderSelection({ seed: PIXEL_VALIDATION_SEED, name: 'css-background' });
  assert.deepEqual(changed(cssBg.files, clean.files), ['public/bg.png']);
  assert.deepEqual(
    changed(selectionA.files, clean.files),
    ['pages/about.js', 'public/logo.svg', 'site/about.html'],
  );
});

test('checked-in clean fixtures match the operator', () => {
  const pixel = renderPixelApp(null);
  for (const [rel, contents] of Object.entries(pixel.files)) {
    const disk = readFileSync(join(root, 'fixtures', 'app', rel));
    const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    assert.deepEqual(disk, expected, rel);
  }
  const selection = renderSelection(null);
  for (const [rel, contents] of Object.entries(selection.files)) {
    const disk = readFileSync(join(root, 'fixtures', 'selection', rel));
    const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    assert.deepEqual(disk, expected, rel);
  }
});

test('results-note template repeats the v0.2 limits beside 0.0%', () => {
  const names = readdirSync(root).filter(
    (name) => name === 'results-note-template.md' || name.startsWith('results-pixel'),
  );
  assert.ok(names.includes('results-note-template.md'));
  let citations = 0;
  for (const name of names) {
    const text = readFileSync(join(root, name), 'utf8');
    for (const paragraph of paragraphs(text)) {
      if (!paragraph.includes('0.0%')) continue;
      citations += 1;
      assert.ok(
        paragraph.includes(V02_LIMIT_SENTENCE),
        `${name} cites 0.0% without the v0.2 limits in the same paragraph:\n${paragraph}`,
      );
    }
  }
  assert.ok(citations > 0, 'expected the template to cite 0.0% so the limit check is not vacuous');
});
