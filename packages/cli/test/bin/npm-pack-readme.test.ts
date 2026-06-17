import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for install-7 (v0.2.0 adversarial post-ship review).
//
// The README bundled in the npm tarball is packages/cli/README.md — that is what
// renders on the npmjs.com landing page (NOT the repo-root README). It shipped
// the stale v0.1.x copy on a 0.2.0 release. These assertions keep the bundled
// README in sync with package.json and free of known-stale v0.1.x phrasing.

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8'));
const readme = readFileSync(resolve(here, '../../README.md'), 'utf8');

describe('packages/cli/README.md is in sync with package.json', () => {
  it('contains current package.json version', () => {
    expect(readme, 'bundled README must mention current version').toContain(pkg.version);
  });

  it('does not contain stale v0.1.x phase-2 framing', () => {
    expect(readme).not.toMatch(/\(Phase 2\)/);
    // Old stats string from the v0.1.x README — known stale.
    expect(readme).not.toMatch(/395 tests.*27 source files.*142KB bundle.*3 built-in plugins/);
  });

  it('does not reference the non-existent unscoped `frontguard` npm package for install', () => {
    // The publishable package is @frontguard/cli; `npm install -D frontguard` 404s.
    expect(readme).not.toContain('-D frontguard');
    expect(readme).not.toMatch(/from 'frontguard\/plugins'/);
  });

  it('wires the prepublishOnly README drift guard', () => {
    expect(pkg.scripts.prepublishOnly).toContain('check-readme-version.mjs');
    // The existing build step must be preserved.
    expect(pkg.scripts.prepublishOnly).toContain('npm run build');
  });
});
