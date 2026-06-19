/**
 * OPS-1 — Wrangler `.dev.vars` must stay out of git.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('OPS-1: .dev.vars gitignore', () => {
  it('root .gitignore lists .dev.vars patterns', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.dev.vars');
    expect(gitignore).toContain('.dev.vars.*');
  });

  it('git check-ignore reports packages/cloud-api/.dev.vars', () => {
    const out = execSync('git check-ignore -v packages/cloud-api/.dev.vars', {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    expect(out).toContain('.dev.vars');
  });
});