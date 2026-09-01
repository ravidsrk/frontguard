import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/cli/init.js';
import { logger } from '../../src/utils/logger.js';

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

  it('directs users to accept and push baselines explicitly', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    try {
      const { exitCode } = runInit({ cwd: dir, format: 'json', yes: true });
      expect(exitCode).toBe(0);

      const output = infoSpy.mock.calls.flat().join('\n');
      expect(output).toContain('frontguard update-baselines');
      expect(output).toContain('git push origin frontguard-baselines');
      expect(output).not.toContain('On first run, Frontguard captures baselines');
    } finally {
      infoSpy.mockRestore();
    }
  });
});

describe('init --ci activation', () => {
  let dir: string;

  const frameworkCases = [
    { dependency: 'next', framework: 'Next.js', script: 'dev', port: 3000 },
    { dependency: '@remix-run/node', framework: 'Remix', script: 'dev', port: 3000 },
    { dependency: 'nuxt', framework: 'Nuxt', script: 'dev', port: 3000 },
    { dependency: '@sveltejs/kit', framework: 'SvelteKit', script: 'dev', port: 5173 },
    { dependency: 'gatsby', framework: 'Gatsby', script: 'develop', port: 8000 },
    { dependency: 'astro', framework: 'Astro', script: 'dev', port: 4321 },
    { dependency: '@angular/core', framework: 'Angular', script: 'start', port: 4200 },
    {
      dependency: 'react-scripts',
      framework: 'Create React App',
      script: 'start',
      port: 3000,
    },
    { dependency: 'vite', framework: 'Vite', script: 'dev', port: 5173 },
  ];

  const packageManagerCases = [
    {
      packageManager: 'npm',
      lockfile: 'package-lock.json',
      installCommand: 'npm ci',
      runCommand: 'npm run dev',
      setupCommand: "cache: 'npm'",
    },
    {
      packageManager: 'pnpm',
      lockfile: 'pnpm-lock.yaml',
      installCommand: 'pnpm install --frozen-lockfile',
      runCommand: 'pnpm run dev',
      setupCommand: 'corepack enable pnpm',
    },
    {
      packageManager: 'yarn',
      lockfile: 'yarn.lock',
      installCommand: 'yarn install --frozen-lockfile',
      runCommand: 'yarn run dev',
      setupCommand: 'corepack enable yarn',
    },
    {
      packageManager: 'bun',
      lockfile: 'bun.lock',
      installCommand: 'bun install --frozen-lockfile',
      runCommand: 'bun run dev',
      setupCommand: 'oven-sh/setup-bun@v2',
    },
  ];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-init-ci-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(frameworkCases)(
    'generates a runnable $framework workflow on port $port',
    ({ dependency, framework, script, port }) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          dependencies: { [dependency]: '^1.0.0' },
          scripts: { [script]: `${dependency} serve` },
        }),
      );
      writeFileSync(join(dir, 'package-lock.json'), '{}');

      const result = runInit({ cwd: dir, format: 'json', ci: true, yes: true });

      expect(result.exitCode).toBe(0);
      expect(result.framework).toBe(framework);
      const workflow = readFileSync(
        join(dir, '.github', 'workflows', 'frontguard.yml'),
        'utf-8',
      );
      expect(workflow).toContain(`npm run ${script}`);
      expect(workflow).toContain(`http://localhost:${port}`);
    },
  );

  it.each(packageManagerCases)(
    'uses $packageManager commands when $lockfile exists',
    ({ lockfile, installCommand, runCommand, setupCommand }) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ devDependencies: { vite: '^1.0.0' }, scripts: { dev: 'vite' } }),
      );
      writeFileSync(join(dir, lockfile), '');

      const result = runInit({ cwd: dir, ci: true, yes: true });

      expect(result.exitCode).toBe(0);
      const workflow = readFileSync(
        join(dir, '.github', 'workflows', 'frontguard.yml'),
        'utf-8',
      );
      expect(workflow).toContain(installCommand);
      expect(workflow).toContain(runCommand);
      expect(workflow).toContain(setupCommand);
      expect(workflow).toContain(`hashFiles('**/${lockfile}')`);
    },
  );

  it('fails without writing files when the required framework script is absent', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { next: '^1.0.0' }, scripts: { start: 'next start' } }),
    );
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      const result = runInit({ cwd: dir, ci: true, yes: true });

      expect(result.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"dev" script'));
      expect(existsSync(join(dir, 'frontguard.config.ts'))).toBe(false);
      expect(existsSync(join(dir, '.github', 'workflows', 'frontguard.yml'))).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('fails clearly when no supported lockfile exists', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { vite: '^1.0.0' }, scripts: { dev: 'vite' } }),
    );
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    try {
      const result = runInit({ cwd: dir, ci: true, yes: true });

      expect(result.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no supported lockfile'));
      expect(existsSync(join(dir, '.github', 'workflows', 'frontguard.yml'))).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
