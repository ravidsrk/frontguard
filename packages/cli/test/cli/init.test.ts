import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Regression coverage for install-2: `frontguard init` must seed `node_modules/`
 * (and the secret-bearing paths) into the .gitignore it appends. Without it, a
 * natural `git init && npm install && frontguard init && git commit -am init`
 * commits node_modules, and the first `frontguard run` explodes with ENOBUFS
 * while the orphan-baseline worktree checks those files out.
 *
 * Like index.test.ts, this drives the real CLI via `tsx` (no build step needed).
 */
const CLI_PATH = resolve(import.meta.dirname, '../../src/cli/index.ts');

function runInit(cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', CLI_PATH, 'init', '--format', 'json', '-y'], {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Keep the test fully offline — no telemetry fetch.
        FRONTGUARD_TELEMETRY: '0',
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

describe('init .gitignore entries (install-2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-init-gitignore-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes node_modules/ to the .gitignore it appends', () => {
    const { exitCode } = runInit(dir);
    expect(exitCode).toBe(0);

    const gitignorePath = join(dir, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules/');
  });

  it('also seeds secret-bearing paths (auth.json, .env, .env.*)', () => {
    const { exitCode } = runInit(dir);
    expect(exitCode).toBe(0);

    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('auth.json');
    expect(content).toContain('.env');
    expect(content).toContain('.env.*');
  });

  it('preserves an existing .gitignore while adding node_modules/', () => {
    const gitignorePath = join(dir, '.gitignore');
    // Pre-existing content that already ignores dist/ but NOT node_modules.
    rmSync(gitignorePath, { force: true });
    execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(gitignorePath)}, 'dist/\\n')`]);

    const { exitCode } = runInit(dir);
    expect(exitCode).toBe(0);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('dist/'); // existing entry preserved
    expect(content).toContain('node_modules/'); // new entry added
  });
});
