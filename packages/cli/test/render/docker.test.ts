/**
 * Tests for src/render/docker.ts
 *
 * The adapter shells out to `docker run`; here we mock the runner and assert
 * the argv shape (mounts, env passthrough, image, stripped flags) and the
 * error path (docker not installed → DockerNotInstalledError).
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  buildDockerArgs,
  stripDockerFlag,
  runDocker,
  DockerNotInstalledError,
  DEFAULT_IMAGE,
  FORWARDED_ENV_VARS,
  type DockerRunner,
} from '../../src/render/docker.js';

describe('stripDockerFlag', () => {
  it('removes the --docker flag', () => {
    expect(stripDockerFlag(['run', '--docker', '--url', 'http://x'])).toEqual([
      'run',
      '--url',
      'http://x',
    ]);
  });

  it('leaves other flags untouched', () => {
    expect(stripDockerFlag(['run', '--debug', '--verbose'])).toEqual([
      'run',
      '--debug',
      '--verbose',
    ]);
  });

  it('does not strip flags that just start with --docker', () => {
    // Future-proofing: a hypothetical `--docker-image` flag must pass through.
    expect(stripDockerFlag(['run', '--docker-image', 'foo'])).toEqual([
      'run',
      '--docker-image',
      'foo',
    ]);
  });
});

describe('buildDockerArgs', () => {
  const baseOpts = {
    argv: ['run', '--url', 'http://host.docker.internal:3000'] as const,
    workspaceDir: '/repo',
    image: 'frontguard/render:test',
    env: {} as NodeJS.ProcessEnv,
    tty: false,
  };

  it('produces a docker run command with the workspace bind-mounted at /workspace', () => {
    const args = buildDockerArgs(baseOpts);
    expect(args[0]).toBe('run');
    expect(args).toContain('--rm');
    expect(args).toContain('-v');
    // The path is resolved so a relative input becomes absolute.
    expect(args).toContain(`${resolve('/repo')}:/workspace`);
    expect(args).toContain('-w');
    expect(args).toContain('/workspace');
  });

  it('adds host.docker.internal alias so Linux can reach the dev server', () => {
    const args = buildDockerArgs(baseOpts);
    const i = args.indexOf('--add-host');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('host.docker.internal:host-gateway');
  });

  it('forwards allow-listed env vars that are set', () => {
    const args = buildDockerArgs({
      ...baseOpts,
      env: {
        FRONTGUARD_OPENAI_KEY: 'sk-test',
        FRONTGUARD_ANTHROPIC_KEY: '',
        UNRELATED_VAR: 'leak-me',
      },
    });
    // Set var is forwarded.
    const setIdx = args.indexOf('FRONTGUARD_OPENAI_KEY');
    expect(setIdx).toBeGreaterThan(-1);
    expect(args[setIdx - 1]).toBe('-e');
    // Empty var is NOT forwarded (empty values are treated as unset).
    expect(args).not.toContain('FRONTGUARD_ANTHROPIC_KEY');
    // Non-allow-listed var is NOT forwarded under any flag.
    expect(args).not.toContain('UNRELATED_VAR');
  });

  it('passes -e KEY without the value, so secrets never enter argv', () => {
    const args = buildDockerArgs({
      ...baseOpts,
      env: { FRONTGUARD_OPENAI_KEY: 'sk-supersecret-value' },
    });
    // The literal value must not appear anywhere in the args list.
    expect(args.some((a) => a.includes('sk-supersecret-value'))).toBe(false);
  });

  it('appends -it when tty is true and omits it otherwise', () => {
    expect(buildDockerArgs({ ...baseOpts, tty: false })).not.toContain('-it');
    expect(buildDockerArgs({ ...baseOpts, tty: true })).toContain('-it');
  });

  it('places the image after all -e/-v flags and before the user args', () => {
    const args = buildDockerArgs({
      ...baseOpts,
      env: { FRONTGUARD_OPENAI_KEY: 'sk' },
    });
    const imageIdx = args.indexOf('frontguard/render:test');
    // Image must come after the env forwarding block.
    expect(args.indexOf('FRONTGUARD_OPENAI_KEY')).toBeLessThan(imageIdx);
    // ...and immediately before the user's CLI args.
    expect(args[imageIdx + 1]).toBe('run');
  });

  it('strips --docker from the forwarded CLI argv to avoid recursion', () => {
    const args = buildDockerArgs({
      ...baseOpts,
      argv: ['run', '--docker', '--url', 'http://x'],
    });
    const sliceAfterImage = args.slice(args.indexOf(baseOpts.image) + 1);
    expect(sliceAfterImage).not.toContain('--docker');
    expect(sliceAfterImage).toEqual(['run', '--url', 'http://x']);
  });

  it('exposes a stable FORWARDED_ENV_VARS list including the major AI providers', () => {
    expect(FORWARDED_ENV_VARS).toContain('FRONTGUARD_OPENAI_KEY');
    expect(FORWARDED_ENV_VARS).toContain('FRONTGUARD_ANTHROPIC_KEY');
    expect(FORWARDED_ENV_VARS).toContain('FRONTGUARD_GEMINI_KEY');
  });
});

describe('runDocker', () => {
  /**
   * Build a mock runner that captures every invocation. The test then asserts
   * the second invocation (the actual `docker run`) matches the expected shape.
   * The first invocation is the preflight `docker --version` (unless
   * skipPreflight is true).
   */
  function makeRunner(opts: { versionExit?: number; runExit?: number } = {}) {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: DockerRunner = async (command, args) => {
      calls.push({ command, args });
      if (args[0] === '--version') return opts.versionExit ?? 0;
      return opts.runExit ?? 0;
    };
    return { runner, calls };
  }

  it('runs `docker --version` as a preflight check', async () => {
    const { runner, calls } = makeRunner();
    await runDocker({
      argv: ['run'],
      workspaceDir: process.cwd(),
      image: 'frontguard/render:test',
      env: {},
      runner,
    });
    expect(calls[0]).toEqual({ command: 'docker', args: ['--version'] });
  });

  it('passes the built argv to docker', async () => {
    const { runner, calls } = makeRunner();
    await runDocker({
      argv: ['run', '--url', 'http://host.docker.internal:3000'],
      workspaceDir: process.cwd(),
      image: 'frontguard/render:test',
      env: {},
      runner,
    });
    // calls[0] is the preflight; calls[1] is the real run.
    const runCall = calls[1];
    expect(runCall.command).toBe('docker');
    expect(runCall.args[0]).toBe('run');
    expect(runCall.args).toContain('--rm');
    expect(runCall.args).toContain('frontguard/render:test');
    // User's url should make it to the container argv.
    expect(runCall.args).toContain('http://host.docker.internal:3000');
  });

  it('returns the exit code from the docker run', async () => {
    const { runner } = makeRunner({ runExit: 7 });
    const code = await runDocker({
      argv: ['run'],
      workspaceDir: process.cwd(),
      image: 'frontguard/render:test',
      env: {},
      runner,
    });
    expect(code).toBe(7);
  });

  it('uses FRONTGUARD_DOCKER_IMAGE env var if no image is passed', async () => {
    const { runner, calls } = makeRunner();
    await runDocker({
      argv: ['run'],
      workspaceDir: process.cwd(),
      env: { FRONTGUARD_DOCKER_IMAGE: 'my.registry/frontguard:v9.9.9' },
      runner,
    });
    expect(calls[1].args).toContain('my.registry/frontguard:v9.9.9');
  });

  it('falls back to DEFAULT_IMAGE when nothing is configured', async () => {
    const { runner, calls } = makeRunner();
    await runDocker({
      argv: ['run'],
      workspaceDir: process.cwd(),
      env: {},
      runner,
    });
    expect(calls[1].args).toContain(DEFAULT_IMAGE);
  });

  it('throws DockerNotInstalledError when preflight fails (non-zero exit)', async () => {
    const { runner } = makeRunner({ versionExit: 1 });
    await expect(
      runDocker({
        argv: ['run'],
        workspaceDir: process.cwd(),
        env: {},
        runner,
      }),
    ).rejects.toBeInstanceOf(DockerNotInstalledError);
  });

  it('throws DockerNotInstalledError when preflight throws (e.g. ENOENT)', async () => {
    const runner: DockerRunner = async () => {
      throw Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
    };
    await expect(
      runDocker({
        argv: ['run'],
        workspaceDir: process.cwd(),
        env: {},
        runner,
      }),
    ).rejects.toBeInstanceOf(DockerNotInstalledError);
  });

  it('skips preflight when skipPreflight is true', async () => {
    const { runner, calls } = makeRunner();
    await runDocker({
      argv: ['run'],
      workspaceDir: process.cwd(),
      env: {},
      runner,
      skipPreflight: true,
    });
    // Only the real docker run; no preflight call.
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('run');
  });

  it('rejects when the workspace directory does not exist', async () => {
    const { runner } = makeRunner();
    await expect(
      runDocker({
        argv: ['run'],
        workspaceDir: '/this/path/does/not/exist-for-sure-12345',
        env: {},
        runner,
      }),
    ).rejects.toThrow(/workspace directory does not exist/);
  });
});

describe('DockerNotInstalledError', () => {
  it('has a name attribute distinct from generic Error', () => {
    const err = new DockerNotInstalledError();
    expect(err.name).toBe('DockerNotInstalledError');
    expect(err).toBeInstanceOf(Error);
  });

  it('default message mentions install instructions, not a stack trace', () => {
    const err = new DockerNotInstalledError();
    expect(err.message).toMatch(/docker/i);
    expect(err.message).toMatch(/install/i);
  });
});
