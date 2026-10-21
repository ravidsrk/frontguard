/**
 * Pins smartFilter's git base. Unset FRONTGUARD_DIFF_BASE keeps
 * origin/main...HEAD. A set base replaces that comparison and does not
 * also consult origin/main.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getChangedFiles, getChangedPaths } from '../../src/graph/resolver.js';

const cleanups: string[] = [];

afterEach(() => {
  for (const dir of cleanups.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function names(dir: string, env: NodeJS.ProcessEnv): string[] {
  return getChangedFiles(dir, env)
    .map((file) => file.slice(dir.length + 1))
    .sort();
}

function repo(): { dir: string; pin: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fg-diff-base-'));
  cleanups.push(dir);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(join(dir, 'root.txt'), 'root\n');
  git(dir, ['add', 'root.txt']);
  git(dir, ['commit', '-q', '-m', 'root']);

  git(dir, ['checkout', '-q', '-b', 'pin']);
  writeFileSync(join(dir, 'pin.txt'), 'pin\n');
  git(dir, ['add', 'pin.txt']);
  git(dir, ['commit', '-q', '-m', 'pin']);
  const pin = git(dir, ['rev-parse', 'HEAD']);

  git(dir, ['checkout', '-q', 'main']);
  writeFileSync(join(dir, 'main.txt'), 'main\n');
  git(dir, ['add', 'main.txt']);
  git(dir, ['commit', '-q', '-m', 'main']);
  const main = git(dir, ['rev-parse', 'HEAD']);

  git(dir, ['checkout', '-q', '-b', 'feature', pin]);
  writeFileSync(join(dir, 'feature.txt'), 'feature\n');
  git(dir, ['add', 'feature.txt']);
  git(dir, ['commit', '-q', '-m', 'feature']);

  git(dir, ['remote', 'add', 'origin', dir]);
  git(dir, ['update-ref', 'refs/remotes/origin/main', main]);
  return { dir, pin };
}

describe('getChangedFiles diff base', () => {
  it('uses origin/main...HEAD when FRONTGUARD_DIFF_BASE is unset', () => {
    const { dir } = repo();
    expect(names(dir, {})).toEqual(['feature.txt', 'pin.txt']);
  });

  it('uses FRONTGUARD_DIFF_BASE instead of origin/main when set', () => {
    const { dir, pin } = repo();
    expect(names(dir, { FRONTGUARD_DIFF_BASE: pin })).toEqual(['feature.txt']);
  });

  it('ignores a base that starts with a dash and keeps origin/main', () => {
    const { dir } = repo();
    expect(names(dir, { FRONTGUARD_DIFF_BASE: '-evil' })).toEqual(['feature.txt', 'pin.txt']);
  });

  it('does not fall back to origin/main when the pinned diff is empty', () => {
    const { dir } = repo();
    const head = git(dir, ['rev-parse', 'HEAD']);
    expect(names(dir, { FRONTGUARD_DIFF_BASE: head })).toEqual(['feature.txt']);
  });

  it('does not narrow to HEAD~1 when the pinned base cannot be compared', () => {
    const { dir } = repo();
    const changed = getChangedPaths(dir, {
      FRONTGUARD_DIFF_BASE: '0123456789abcdef0123456789abcdef01234567',
    });
    expect(changed.pinnedDiffError).toMatch(/FRONTGUARD_DIFF_BASE/);
    expect(changed.present).toEqual([]);
    expect(changed.removed).toEqual([]);
    expect(names(dir, {})).toEqual(['feature.txt', 'pin.txt']);
  });
});
