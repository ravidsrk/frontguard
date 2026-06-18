import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/cli/init.js';

/**
 * Regression coverage for install-2: `frontguard init` must seed `node_modules/`
 * (and the secret-bearing paths) into the .gitignore it appends. Without it, a
 * natural `git init && npm install && frontguard init && git commit -am init`
 * commits node_modules, and the first `frontguard run` explodes with ENOBUFS
 * while the orphan-baseline worktree checks those files out.
 *
 * Drives the init flow in-process via {@link runInit} (the same entry point the
 * CLI calls) — keeps the .gitignore assertions fast and deterministic, with no
 * `npx tsx` subprocess cold-start to flake on slow runners.
 */
describe('init .gitignore entries (install-2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-init-gitignore-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes node_modules/ to the .gitignore it appends', () => {
    const { exitCode } = runInit({ cwd: dir, format: 'json', yes: true });
    expect(exitCode).toBe(0);

    const gitignorePath = join(dir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules/');
  });

  it('also seeds secret-bearing paths (auth.json, .env, .env.*)', () => {
    const { exitCode } = runInit({ cwd: dir, format: 'json', yes: true });
    expect(exitCode).toBe(0);

    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('auth.json');
    expect(content).toContain('.env');
    expect(content).toContain('.env.*');
  });

  it('preserves an existing .gitignore while adding node_modules/', () => {
    const gitignorePath = join(dir, '.gitignore');
    // Pre-existing content that already ignores dist/ but NOT node_modules.
    writeFileSync(gitignorePath, 'dist/\n');

    const { exitCode } = runInit({ cwd: dir, format: 'json', yes: true });
    expect(exitCode).toBe(0);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('dist/'); // existing entry preserved
    expect(content).toContain('node_modules/'); // new entry added
  });
});
