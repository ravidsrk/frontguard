/**
 * E2E: `frontguard init` writes a `.ts` config that `doctor` can load.
 *
 * Uses the built CLI (`dist/cli/index.js`) with plain `node` — no tsx
 * wrapper — to mirror the published binary behaviour.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cliDir = resolve(new URL('.', import.meta.url).pathname, '..', '..');
const cliBin = join(cliDir, 'dist/cli/index.js');

function runNode(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cliBin, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
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

describe('TypeScript config loader e2e', () => {
  beforeAll(() => {
    // `npm run build` (full CLI tsc) routinely exceeds vitest's default 10s
    // hook timeout on CI runners; allow up to 2 minutes for the build.
    execFileSync('npm', ['run', 'build'], { cwd: cliDir, stdio: 'inherit' });
  }, 120_000);

  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('init then doctor exits 0 with a loadable .ts config', () => {
    dir = mkdtempSync(join(tmpdir(), 'fg-ts-config-e2e-'));

    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@frontguard.dev'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Frontguard Test'], { cwd: dir, stdio: 'ignore' });

    const init = runNode(['init', '--yes'], dir);
    expect(init.exitCode).toBe(0);
    expect(existsSync(join(dir, 'frontguard.config.ts'))).toBe(true);

    const doctor = runNode(['doctor'], dir);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toMatch(/Configuration.*loaded config/i);
  });
});