/**
 * Docker render adapter (T11, IN-7).
 *
 * Frontguard's local renderer uses Playwright bound to whatever browsers the
 * developer happens to have on disk. Glyph rendering, sub-pixel anti-aliasing,
 * and emoji tables differ between macOS, Linux, and Windows even when the
 * Playwright browser version is identical — so a baseline taken on macOS will
 * always diff against the same page captured in CI on Linux.
 *
 * The Docker adapter solves this by re-executing the CLI inside the pinned
 * `frontguard/render` image (see packages/cli/docker/Dockerfile). The image
 * carries the exact Playwright minor, the exact Chromium/Firefox/WebKit
 * builds, and a deterministic font stack — so the rendered bytes are
 * cross-OS reproducible.
 *
 * Implementation strategy
 * -----------------------
 * 1. Verify docker is installed; if not, throw a single clear error (NOT a
 *    Node stack trace) so users discover the dependency immediately.
 * 2. Build the argv for `docker run`:
 *    - bind-mount the user's project cwd at `/workspace`
 *    - forward the AI/telemetry env vars
 *    - pass through every original CLI argv except `--docker` itself
 * 3. Spawn docker with inherited stdio so the renderer's output streams
 *    straight to the user's terminal; return the docker exit code.
 *
 * The adapter is pure-ish: the `runDocker` entry point accepts an optional
 * `runner` so tests can assert the spawned argv shape without invoking docker.
 *
 * @module render/docker
 */

import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Default tag for the rendering image. Overridable via the
 * `FRONTGUARD_DOCKER_IMAGE` env var so cloud / CI runners can point at a
 * pre-pulled internal mirror without rebuilding the CLI.
 */
export const DEFAULT_IMAGE = 'frontguard/render:latest';

/**
 * Env vars Frontguard wants forwarded into the container. We allow-list these
 * explicitly rather than forwarding the entire host environment — the host
 * shell may contain unrelated secrets that should not enter the image.
 */
export const FORWARDED_ENV_VARS: readonly string[] = [
  'FRONTGUARD_OPENAI_KEY',
  'FRONTGUARD_ANTHROPIC_KEY',
  'FRONTGUARD_GEMINI_KEY',
  'FRONTGUARD_TELEMETRY',
  'FRONTGUARD_DEBUG',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'CI',
] as const;

/**
 * Strict subset of the CLI arg list we strip before re-invoking the CLI
 * inside the container. The `--docker` flag is the trigger; the container
 * must NOT see it again or it would recurse forever.
 */
const DOCKER_FLAGS = new Set(['--docker']);

/**
 * Options accepted by {@link runDocker}.
 */
export interface RunDockerOptions {
  /** The argv that was passed to the host CLI, e.g. `['run', '--url', 'http://localhost:3000']`. */
  argv: readonly string[];
  /** Absolute path on the host to mount as `/workspace` in the container. Defaults to `process.cwd()`. */
  workspaceDir?: string;
  /** Docker image to run. Defaults to `FRONTGUARD_DOCKER_IMAGE` env var or {@link DEFAULT_IMAGE}. */
  image?: string;
  /** Override env source — used by tests. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Override the spawn runner — used by tests to capture the argv. */
  runner?: DockerRunner;
  /** Whether to allocate a TTY (`docker run -it`). Defaults to false; CI never wants a TTY. */
  tty?: boolean;
  /**
   * If true, skip the `docker --version` preflight. Used by tests so we can
   * assert the argv shape of the real `docker run` invocation without paying
   * the cost of a child process.
   */
  skipPreflight?: boolean;
}

/**
 * The signature of the function that actually executes the docker command.
 * Tests substitute a stub here to capture the argv list.
 */
export type DockerRunner = (
  command: 'docker',
  args: string[],
  options: SpawnOptions,
) => Promise<number>;

/**
 * Error thrown when docker is not installed or not reachable on `PATH`. We
 * raise a dedicated class so the CLI's top-level error handler can surface a
 * one-line, user-friendly message instead of a stack trace.
 */
export class DockerNotInstalledError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'Docker is required for --docker mode but `docker` was not found on PATH.\n' +
          '  Install Docker Desktop: https://www.docker.com/products/docker-desktop/\n' +
          '  Or remove --docker to fall back to the local Playwright renderer.',
    );
    this.name = 'DockerNotInstalledError';
  }
}

/**
 * Error thrown when the render image is neither in the local Docker cache nor
 * pullable from any registry. Until `frontguard/render` is published to Docker
 * Hub (tracked as an OPS action — see docs/ops-actions.md), the only way to use
 * `--docker` is to build the image locally; this error tells the user exactly
 * how, instead of letting them hit a cryptic `pull access denied` from the
 * docker daemon. Sibling of {@link DockerNotInstalledError} so the CLI's
 * top-level handler can print a one-line, actionable message — not a stack
 * trace.
 */
export class DockerImageUnavailableError extends Error {
  /** The image tag that could not be resolved locally or in any registry. */
  readonly image: string;

  constructor(image: string, message?: string) {
    super(
      message ??
        `--docker: image "${image}" is not available locally and cannot be pulled from any registry.\n\n` +
          'This image is not yet published to Docker Hub for this release. To use --docker today,\n' +
          'build the image locally:\n\n' +
          `    docker build --platform linux/amd64 -t ${image} packages/cli/docker\n\n` +
          'Or point the CLI at a pre-built image you control via the FRONTGUARD_DOCKER_IMAGE env var.\n\n' +
          'See packages/cli/docker/Dockerfile and https://frontguard.dev/docs/cross-os-rendering\n' +
          'for the full build recipe and the planned registry tags.',
    );
    this.name = 'DockerImageUnavailableError';
    this.image = image;
  }
}

/**
 * Strips the `--docker` flag (and only `--docker`) from an argv list so the
 * container does not recursively re-spawn itself.
 *
 * We deliberately use a Set lookup rather than a regex / prefix match: any
 * future flag named `--docker-*` should pass through unchanged.
 */
export function stripDockerFlag(argv: readonly string[]): string[] {
  return argv.filter((arg) => !DOCKER_FLAGS.has(arg));
}

/**
 * Builds the full `docker run` argv list. Pure function: no I/O, no spawn.
 * Exposed for tests so they can assert the shape without running docker.
 *
 * Shape:
 *   docker run --rm
 *     --platform <platform>                            (linux/amd64 by default)
 *     -v <workspaceDir>:/workspace
 *     -w /workspace
 *     [--add-host=host.docker.internal:host-gateway]   (Linux only — best-effort)
 *     [-e KEY] (one per forwarded env var that's actually set)
 *     [-it]                                            (only when tty=true)
 *     <image>
 *     <stripped CLI argv...>
 */
export function buildDockerArgs(opts: {
  argv: readonly string[];
  workspaceDir: string;
  image: string;
  env: NodeJS.ProcessEnv;
  tty: boolean;
}): string[] {
  const { argv, workspaceDir, image, env, tty } = opts;

  const args: string[] = ['run', '--rm'];

  // Pin the container architecture. The render image's whole purpose is
  // byte-equivalent baselines across a mixed fleet (arm64 dev laptops +
  // amd64 CI runners). Chromium's rasterizer emits different sub-pixel
  // anti-aliasing per architecture, so we force a single platform — by
  // default linux/amd64 — so the same machine code rasterizes everywhere.
  // This MUST come before the image positional or docker silently ignores
  // it. `FRONTGUARD_DOCKER_PLATFORM` is an escape hatch for users who
  // genuinely want a different (e.g. arm64-native) build; the default stays
  // linux/amd64 to preserve byte-equivalence.
  const platform = env.FRONTGUARD_DOCKER_PLATFORM || 'linux/amd64';
  args.push('--platform', platform);

  if (tty) {
    args.push('-it');
  }

  // Bind-mount the user's project. We resolve to an absolute path so a
  // relative cwd (e.g. `.`) doesn't get interpreted as a docker volume name.
  args.push('-v', `${resolve(workspaceDir)}:/workspace`);
  args.push('-w', '/workspace');

  // Linux hosts need an explicit host-gateway alias to talk to the dev
  // server on the host. Docker Desktop on macOS/Windows already provides
  // host.docker.internal natively; the extra alias is harmless there.
  args.push('--add-host', 'host.docker.internal:host-gateway');

  // Forward allow-listed env vars. We pass `-e KEY` (without `=value`),
  // which tells docker to read the value from the current environment at
  // the moment `docker run` is invoked. This avoids leaking the value into
  // the argv list (where it would show up in `ps -ef`).
  for (const key of FORWARDED_ENV_VARS) {
    if (env[key] !== undefined && env[key] !== '') {
      args.push('-e', key);
    }
  }

  args.push(image);

  // The container's ENTRYPOINT is `frontguard`, so we only pass the CLI
  // subcommand + flags, never the `frontguard` binary name itself.
  args.push(...stripDockerFlag(argv));

  return args;
}

/**
 * Runs a docker subcommand purely for its exit status (stdout/stderr ignored)
 * and resolves to `true` on exit 0, `false` on any non-zero exit or spawn
 * failure. Used by the preflight checks below.
 */
async function dockerCommandSucceeds(
  runner: DockerRunner,
  args: string[],
): Promise<boolean> {
  try {
    const code = await runner('docker', args, { stdio: 'ignore' });
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Verifies that the `docker` binary is on PATH and responsive.
 *
 * Implementation: spawn `docker --version` and resolve to true on exit 0.
 * We deliberately do NOT use `which docker` because Windows + non-POSIX
 * shells don't ship `which`.
 */
async function dockerIsAvailable(runner: DockerRunner): Promise<boolean> {
  return dockerCommandSucceeds(runner, ['--version']);
}

/**
 * Determines whether the render image can actually be run, and where it would
 * come from, without triggering a blocking pull:
 *
 *   - `local`    — `docker image inspect <image>` exits 0 (image already in the
 *                  local daemon cache).
 *   - `registry` — image not cached locally, but `docker manifest inspect
 *                  <image>` exits 0 (the tag exists in a registry and is
 *                  pullable).
 *   - `missing`  — both checks fail. The caller surfaces a
 *                  {@link DockerImageUnavailableError} with build instructions
 *                  instead of letting `docker run` hit a cryptic
 *                  `pull access denied`.
 *
 * Routed through the {@link DockerRunner} abstraction so tests can mock both
 * calls without spawning real docker.
 */
export async function imageIsAvailableLocallyOrInRegistry(
  runner: DockerRunner,
  image: string,
): Promise<{ available: boolean; source: 'local' | 'registry' | 'missing' }> {
  if (await dockerCommandSucceeds(runner, ['image', 'inspect', image])) {
    return { available: true, source: 'local' };
  }
  if (await dockerCommandSucceeds(runner, ['manifest', 'inspect', image])) {
    return { available: true, source: 'registry' };
  }
  return { available: false, source: 'missing' };
}

/**
 * Default spawn-based docker runner. Inherits stdio so the user sees output
 * streamed in real time.
 */
const defaultRunner: DockerRunner = (command, args, options) =>
  new Promise<number>((resolveExit, rejectExit) => {
    const child = spawn(command, args, options);
    child.on('error', (err) => {
      // ENOENT here means docker is not installed. Map it to our dedicated
      // error class so the CLI surfaces a friendly message.
      const errno = (err as NodeJS.ErrnoException).code;
      if (errno === 'ENOENT') {
        rejectExit(new DockerNotInstalledError());
        return;
      }
      rejectExit(err);
    });
    child.on('exit', (code) => {
      // Treat null (process killed by signal) as a generic failure.
      resolveExit(code ?? 1);
    });
  });

/**
 * Entry point: re-execute the Frontguard CLI inside the pinned render image.
 *
 * Returns the exit code from the container — the calling CLI should mirror
 * that exit code so CI gates and `set -e` shells see the right signal.
 */
export async function runDocker(opts: RunDockerOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const runner = opts.runner ?? defaultRunner;
  const workspaceDir = resolve(opts.workspaceDir ?? process.cwd());
  const image = opts.image ?? env.FRONTGUARD_DOCKER_IMAGE ?? DEFAULT_IMAGE;
  const tty = opts.tty ?? false;

  // Sanity: make sure the path we're about to mount actually exists. If we
  // pass a non-existent path, docker happily creates an empty directory and
  // mounts that, then the renderer silently sees no config file.
  if (!existsSync(workspaceDir)) {
    throw new Error(
      `--docker: workspace directory does not exist: ${workspaceDir}`,
    );
  }

  if (!opts.skipPreflight) {
    const available = await dockerIsAvailable(runner);
    if (!available) {
      throw new DockerNotInstalledError();
    }

    // The image is not published to a registry for this release, so a naive
    // `docker run` would emit `pull access denied`. Preflight the image and,
    // if it's neither cached locally nor pullable, throw an actionable error
    // pointing at the local-build recipe (see DockerImageUnavailableError).
    const { available: imageAvailable } =
      await imageIsAvailableLocallyOrInRegistry(runner, image);
    if (!imageAvailable) {
      throw new DockerImageUnavailableError(image);
    }
  }

  const args = buildDockerArgs({ argv: opts.argv, workspaceDir, image, env, tty });

  return runner('docker', args, { stdio: 'inherit' });
}
