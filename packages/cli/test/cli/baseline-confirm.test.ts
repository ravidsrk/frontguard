import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { baselineWriteBlockReason } from '../../src/cli/baseline-confirm.js';

const CLI_PATH = resolve(import.meta.dirname, '../../src/cli/index.ts');
const TSX_PATH = createRequire(import.meta.url).resolve('tsx/cli');

function runCli(
  args: string[],
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(process.execPath, [TSX_PATH, CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'frontguard-confirm-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function hasBaselineBranch(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'refs/heads/frontguard-baselines'], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

describe('baseline write confirmation', () => {
  it('allows a confirmed write that is not judge mode', () => {
    expect(
      baselineWriteBlockReason({
        writing: true,
        confirmBaselines: true,
        judgeMode: false,
      }),
    ).toBeNull();
  });

  it('does not treat an advisory caption or confirm_reviewed as the flag', () => {
    const reason = baselineWriteBlockReason({
      writing: true,
      confirmBaselines: false,
      judgeMode: false,
    });
    expect(reason).toMatch(/--confirm-baselines/);
    expect(reason).toMatch(/advisory caption cannot set the flag/);
    expect(reason).toMatch(/confirm_reviewed: true on itself is not a human review/);
  });

  it('refuses judge mode even when --confirm-baselines is present', () => {
    expect(
      baselineWriteBlockReason({
        writing: true,
        confirmBaselines: true,
        judgeMode: true,
      }),
    ).toMatch(/judge cannot confirm/);
  });

  it('update-baselines without --confirm-baselines exits 2 and writes nothing', () => {
    const dir = gitRepo();
    try {
      const result = runCli(['update-baselines', '--url', 'http://127.0.0.1:9'], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stderr + result.stdout).toMatch(/without --confirm-baselines/);
      expect(hasBaselineBranch(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('run --update-baselines without the flag exits 2 and writes nothing', () => {
    const dir = gitRepo();
    try {
      const result = runCli(
        ['run', '--update-baselines', '--url', 'http://127.0.0.1:9'],
        dir,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr + result.stdout).toMatch(/without --confirm-baselines/);
      expect(hasBaselineBranch(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('judge mode exits 2 even with --confirm-baselines and writes nothing', () => {
    const dir = gitRepo();
    try {
      const result = runCli(
        [
          'run',
          '--update-baselines',
          '--confirm-baselines',
          '--mode',
          'judge',
          '--experimental',
          '--url',
          'http://127.0.0.1:9',
        ],
        dir,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr + result.stdout).toMatch(/judge cannot confirm/);
      expect(hasBaselineBranch(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
