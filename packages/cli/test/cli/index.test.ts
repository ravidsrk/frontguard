import { describe, it, expect } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * CLI tests use `tsx` to run the CLI entry point directly.
 * This avoids needing a build step and tests the actual CLI behavior.
 */
const CLI_PATH = resolve(import.meta.dirname, '../../src/cli/index.ts');
const TSX_PATH = resolve(import.meta.dirname, '../../node_modules/tsx/dist/cli.mjs');

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

function runCliAsync(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [TSX_PATH, CLI_PATH, ...args],
      { cwd, env, encoding: 'utf8', timeout: 15_000 },
      (error, stdout, stderr) => {
        resolveRun({
          stdout,
          stderr,
          exitCode: typeof error?.code === 'number' ? error.code : 0,
        });
      },
    );
  });
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

  it('invalid option exits with error', () => {
    const { exitCode } = runCli(['--invalid-option']);
    expect(exitCode).not.toBe(0);
  });

  it('monitor --help lists monitoring options (Task 7.3)', () => {
    const { stdout, exitCode } = runCli(['monitor', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--url');
    expect(stdout).toContain('--webhook');
    expect(stdout).toContain('--interval');
    expect(stdout).toContain('--threshold');
    expect(stdout).toContain('--watch');
    expect(stdout).toContain('--history');
  });

  it('monitor with an invalid URL fails gracefully (exit 2, no crash)', () => {
    const { exitCode, stdout, stderr } = runCli(['monitor', '--url', 'not-a-valid-url']);
    // Bad input → graceful FRONTGUARD ERROR, exit 2 (not an unhandled crash).
    expect(exitCode).toBe(2);
    expect(stdout + stderr).toMatch(/FRONTGUARD ERROR|Invalid URL|base URL/i);
  });

  it('monitor --history prints history summary and exits 0 without running checks', () => {
    const { exitCode, stdout, stderr } = runCli([
      'monitor',
      '--history',
      '--history-dir',
      '.frontguard/does-not-exist-history',
    ]);
    expect(exitCode).toBe(0);
    // No history dir → friendly empty message, no pipeline run.
    expect(stdout + stderr).toMatch(/No monitoring history found|Recent monitoring history/i);
  });

  it('does not discard an invalid explicit config when --url is also present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-invalid-config-'));
    const configPath = join(dir, 'frontguard.config.mjs');
    writeFileSync(
      configPath,
      `export default {
  version: 1,
  baseUrl: 'http://127.0.0.1:1',
  threshold: 'invalid',
};\n`,
    );

    try {
      const result = await runCliAsync(
        ['run', '--config', configPath, '--url', 'http://127.0.0.1:1'],
        dir,
        { ...process.env, FRONTGUARD_TELEMETRY: '0' },
      );
      expect(result.exitCode).toBe(2);
      expect(result.stdout + result.stderr).toContain('Invalid Frontguard config');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors telemetry:false when a run fails after loading config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-telemetry-cli-'));
    const configPath = join(dir, 'frontguard.config.mjs');
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? '/');
      response.statusCode = 204;
      response.end();
    });

    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Telemetry server did not bind');
    const env = {
      ...process.env,
      CI: 'false',
      DO_NOT_TRACK: '0',
      FRONTGUARD_TELEMETRY: '1',
      FRONTGUARD_TELEMETRY_ENDPOINT: `http://127.0.0.1:${address.port}/events`,
    };
    const writeConfig = (telemetry: boolean): void => {
      writeFileSync(
        configPath,
        `export default {
  version: 1,
  baseUrl: 'http://127.0.0.1:1',
  routes: ['/'],
  viewports: [1440],
  browsers: ['chromium'],
  threshold: 0.1,
  telemetry: ${telemetry},
  plugins: [{ name: 'forced-failure', setup() { throw new Error('forced failure'); } }],
};\n`,
      );
    };

    try {
      // Positive control: the failure path can reach the local collector.
      writeConfig(true);
      expect((await runCliAsync(['run', '--config', configPath], dir, env)).exitCode).toBe(2);
      expect(requests).toHaveLength(1);

      requests.length = 0;
      writeConfig(false);
      expect((await runCliAsync(['run', '--config', configPath], dir, env)).exitCode).toBe(2);
      expect(requests).toHaveLength(0);

      // Invalid config must fail private because its telemetry opt-out cannot be
      // trusted until validation succeeds.
      writeFileSync(
        configPath,
        `export default {
  version: 1,
  baseUrl: 'http://127.0.0.1:1',
  threshold: 'invalid',
  telemetry: false,
};\n`,
      );
      expect((await runCliAsync(['run', '--config', configPath], dir, env)).exitCode).toBe(2);
      expect(requests).toHaveLength(0);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
