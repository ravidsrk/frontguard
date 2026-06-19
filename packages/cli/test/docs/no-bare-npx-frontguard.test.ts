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

function installationHtml(): string {
  const docsContent = readFileSync(
    join(repoRoot, 'apps/web/src/lib/docs-content.ts'),
    'utf8',
  );
  const match = docsContent.match(
    /\{\s*id:\s*"installation"[\s\S]*?html:\s*"((?:\\.|[^"\\])*)"/,
  );
  expect(match, 'installation article must exist in docs-content.ts').toBeTruthy();
  // Unescape the TS string literal back to HTML for assertions.
  return JSON.parse(`"${match![1]}"`);
}

describe('docs: no bare `npx frontguard` invocations', () => {
  it('matches zero occurrences of the bare unscoped `npx <bin>` form', () => {
    const hits = execSync(
      "git grep -nE 'npx[[:space:]]+frontguard[[:space:]]' -- 'apps/web/src/lib/docs-content.ts' 'README.md' 'packages/cli/README.md' || true",
      { encoding: 'utf8', cwd: repoRoot },
    ).trim();
    expect(
      hits,
      `Found bare \`npx <bin>\` snippets that 404 on npm (package is @frontguard/cli, bin is frontguard).\nRewrite to \`npx -p @frontguard/cli frontguard <cmd>\`:\n${hits}`,
    ).toBe('');
  });
});

describe('docs: installation page documents the scoped package', () => {
  const installation = installationHtml();

  it('does not document an install of the unscoped `frontguard` package (404 on npm)', () => {
    expect(installation).not.toContain('-D frontguard');
  });

  it('documents the scoped `@frontguard/cli` install', () => {
    expect(installation).toContain('@frontguard/cli');
  });
});

describe('docs-10: installation verify section expected output is the real SemVer', () => {
  const installation = installationHtml();

  const sectionStart = installation.indexOf('Verify Installation');
  const section = installation.slice(sectionStart);
  const verifySection = section.slice(0, section.search(/<h2[^>]*>(?!Verify)/i));
  const preBlocks = [...verifySection.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  const outputBlock = preBlocks.find((b) => /\d+\.\d+\.\d+/.test(b)) ?? '';

  it('locates the expected-output block', () => {
    expect(sectionStart, 'Verify Installation section must exist').toBeGreaterThan(-1);
    expect(outputBlock, 'expected-output pre block must be present').not.toBe('');
  });

  it('shows a SemVer version, not the literal word `frontguard`', () => {
    expect(outputBlock).toMatch(/\d+\.\d+\.\d+/);
    for (const line of outputBlock.split('\n').map((l) => l.trim()).filter(Boolean)) {
      expect(line, `expected-output line should be a version, not "${line}"`).not.toMatch(
        /^frontguard(\s|$)/,
      );
    }
  });
});