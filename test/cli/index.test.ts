import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * CLI tests use `tsx` to run the CLI entry point directly.
 * This avoids needing a build step and tests the actual CLI behavior.
 */
const CLI_PATH = resolve(import.meta.dirname, '../../src/cli/index.ts');

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', CLI_PATH, ...args], {
      encoding: 'utf-8',
      timeout: 15_000,
      env: {
        ...process.env,
        // Prevent actual pipeline runs
        NODE_ENV: 'test',
      },
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

describe('CLI', () => {
  it('--version outputs the version number', () => {
    const { stdout, exitCode } = runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--help outputs help text with command descriptions', () => {
    const { stdout, exitCode } = runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('frontguard');
    expect(stdout).toContain('AI-powered');
    expect(stdout).toContain('run');
    expect(stdout).toContain('init');
  });

  it('run --help outputs run command options', () => {
    const { stdout, exitCode } = runCli(['run', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--url');
    expect(stdout).toContain('--routes');
    expect(stdout).toContain('--viewports');
    expect(stdout).toContain('--threshold');
  });

  it('invalid command exits with error', () => {
    // Running without a URL or config should fail with a helpful error
    const { exitCode, stderr } = runCli(['run', '--url', '']);
    // Should exit non-zero (the actual code depends on which error fires first)
    expect(exitCode).not.toBe(0);
  });
});
