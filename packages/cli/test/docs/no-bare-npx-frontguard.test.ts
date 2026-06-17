import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Regression guard for docs-1 / docs-10 (v0.2.0 adversarial post-ship review).
//
// The CLI is published as `@frontguard/cli`, but the bin it installs is named
// `frontguard`. That means a bare `npx frontguard <cmd>` is a 404 on npm (npx
// looks for a package literally named `frontguard`, which does not exist). Every
// getting-started snippet must therefore use `npx -p @frontguard/cli frontguard`
// or assume the bin is already on PATH after `npm i -D @frontguard/cli`.

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

describe('docs: no bare `npx frontguard` invocations', () => {
  it('matches zero occurrences of the bare unscoped `npx <bin>` form', () => {
    const hits = execSync(
      "git grep -nE 'npx[[:space:]]+frontguard[[:space:]]' -- 'apps/docs/**/*.mdx' 'README.md' 'packages/cli/README.md' || true",
      { encoding: 'utf8', cwd: repoRoot },
    ).trim();
    expect(
      hits,
      `Found bare \`npx <bin>\` snippets that 404 on npm (package is @frontguard/cli, bin is frontguard).\nRewrite to \`npx -p @frontguard/cli frontguard <cmd>\`:\n${hits}`,
    ).toBe('');
  });
});

describe('docs: installation page documents the scoped package', () => {
  const installationMdx = readFileSync(
    join(repoRoot, 'apps/docs/content/docs/installation.mdx'),
    'utf8',
  );

  it('does not document an install of the unscoped `frontguard` package (404 on npm)', () => {
    // Every dev-install must read `-D @frontguard/cli`; the bare `-D frontguard`
    // form only appears if a snippet has regressed.
    expect(installationMdx).not.toContain('-D frontguard');
  });

  it('documents the scoped `@frontguard/cli` install', () => {
    expect(installationMdx).toContain('@frontguard/cli');
  });
});
