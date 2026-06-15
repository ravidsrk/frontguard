/**
 * `frontguard run` CLI wiring helpers.
 *
 * The `run` command itself is registered against commander in {@link main}
 * (see `cli/index.ts`). This module hosts the small pieces that don't fit
 * cleanly inside that registration — currently, the `--docker` flag.
 *
 * `--docker` is special because it short-circuits the entire local code path:
 * when present, we don't load configs or spawn Playwright on the host. We
 * just re-execute the CLI inside the pinned `frontguard/render` image, which
 * has the deterministic browser + font stack baked in (see
 * packages/cli/docker/Dockerfile).
 *
 * Keeping the dispatch here means `cli/index.ts` stays a single, scannable
 * commander definition, and the docker plumbing has a dedicated module that
 * tests can import without dragging in the whole CLI.
 *
 * @module cli/run
 */

import { runDocker, DockerNotInstalledError } from '../render/docker.js';
import { logger } from '../utils/logger.js';

/**
 * Flag we look for in argv. Exposed so tests can reference the same string.
 */
export const DOCKER_FLAG = '--docker';

/**
 * Detect whether the user asked for Docker mode by inspecting the raw argv
 * BEFORE commander gets a chance to parse it. We don't rely on commander's
 * own option for two reasons:
 *
 *   1. Commander only delivers the parsed opts inside the `run` action
 *      callback; by then we've already paid for config loading.
 *   2. `--docker` is valid on any subcommand a user might pick (today only
 *      `run`, but we want to keep the door open for `monitor --docker` etc.).
 *
 * The check is a flat scan so we don't have to mirror commander's
 * tokenization rules.
 */
export function argvHasDockerFlag(argv: readonly string[]): boolean {
  return argv.includes(DOCKER_FLAG);
}

/**
 * If `--docker` is present in `argv`, re-execute the CLI inside the
 * Frontguard render image and return its exit code. Otherwise return `null`
 * so the caller can proceed with the normal local code path.
 *
 * Commander accepts `process.argv` (a 0/1/2…N list where `argv[0]` is the
 * Node binary and `argv[1]` is the CLI script). We strip those two so the
 * argv we pass into the container is just the user-meaningful tail —
 * e.g. `['run', '--url', 'http://localhost:3000']`.
 */
export async function maybeRunInDocker(
  argv: readonly string[] = process.argv,
): Promise<number | null> {
  if (!argvHasDockerFlag(argv)) {
    return null;
  }

  // Drop the Node binary path + script path. We're defensive about argv
  // length because tests sometimes pass shorter argv lists.
  const cliArgs = argv.length >= 2 ? argv.slice(2) : [...argv];

  try {
    const code = await runDocker({ argv: cliArgs });
    return code;
  } catch (err) {
    if (err instanceof DockerNotInstalledError) {
      // Print ONLY the friendly message — no stack trace. This is the
      // "ONE clear error, not a stack trace" acceptance bar.
      logger.error(err.message);
      return 127;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`--docker: ${msg}`);
    return 2;
  }
}
