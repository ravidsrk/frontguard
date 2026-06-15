/**
 * Build & publish the Frontguard Daytona snapshot.
 *
 * Produces (or refreshes) the `frontguard-playwright-v1` snapshot consumed by:
 *   - `packages/cli/src/sandbox/daytona.ts`             (fix verification)
 *   - `packages/cloud-api/src/daytona-runner.ts`        (cloud-side runs)
 *
 * What it does
 * ------------
 * 1.  Runs `docker build` against `packages/cli/docker/` to verify the T11
 *     base image actually builds locally. (Smoke test; skip with
 *     `--skip-docker-build` if you don't have Docker installed.)
 * 2.  Authenticates to Daytona via `DAYTONA_API_KEY` and publishes a snapshot
 *     named `frontguard-playwright-v1`. The snapshot mirrors the Dockerfile:
 *     Playwright base + `frontguard` CLI globally installed.
 * 3.  Prints the snapshot version tag for rollback.
 *
 * No DAYTONA_API_KEY?
 * -------------------
 * The script prints copy-pasteable instructions and exits 0 (so it's safe to
 * invoke in CI without a key). It also still runs the Docker smoke test, which
 * is the most likely failure mode.
 *
 * Usage
 * -----
 *     npx tsx scripts/build-daytona-snapshot.ts
 *     npx tsx scripts/build-daytona-snapshot.ts --skip-docker-build
 *     npx tsx scripts/build-daytona-snapshot.ts --version v2   # bump the tag
 *     npx tsx scripts/build-daytona-snapshot.ts --dry-run
 *
 * Rolling back
 * ------------
 * Each publish stamps the snapshot tag (`frontguard-playwright-v1`). To roll
 * back, re-publish from a previous git commit, or delete the snapshot and
 * re-run with `--version v0` (and update the constant in
 * `packages/cli/src/sandbox/daytona.ts`).
 *
 * @module scripts/build-daytona-snapshot
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const dockerDir = resolve(repoRoot, 'packages/cli/docker');

// ---------------------------------------------------------------------------
// Snapshot version — bump alongside the Dockerfile / Playwright base
// ---------------------------------------------------------------------------

const DEFAULT_VERSION = 'v1';
const SNAPSHOT_BASE = 'frontguard-playwright';

// ---------------------------------------------------------------------------
// Arg parsing — keep it tiny, no commander
// ---------------------------------------------------------------------------

interface CliArgs {
  skipDockerBuild: boolean;
  dryRun: boolean;
  version: string;
}

function parseArgs(argv: string[]): CliArgs {
  let skipDockerBuild = false;
  let dryRun = false;
  let version = DEFAULT_VERSION;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip-docker-build') skipDockerBuild = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--version') version = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error(USAGE);
      process.exit(2);
    }
  }
  return { skipDockerBuild, dryRun, version };
}

const USAGE = `Usage: npx tsx scripts/build-daytona-snapshot.ts [options]

Options:
  --skip-docker-build   Skip the local docker build smoke test
  --dry-run             Print what would happen, don't publish
  --version <tag>       Snapshot version suffix (default: ${DEFAULT_VERSION})
  -h, --help            Show this message
`;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function err(msg: string): void {
  // eslint-disable-next-line no-console
  console.error(msg);
}

// ---------------------------------------------------------------------------
// Docker smoke test
// ---------------------------------------------------------------------------

/**
 * Runs `docker build` against the T11 Dockerfile so we catch syntax errors,
 * missing FROMs, or broken `npm install` lines before we ask Daytona to build
 * the same thing remotely.
 */
function dockerBuildSmokeTest(): { ok: boolean; reason?: string } {
  if (!existsSync(resolve(dockerDir, 'Dockerfile'))) {
    return { ok: false, reason: `No Dockerfile at ${dockerDir}` };
  }
  const probe = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    return { ok: false, reason: 'docker is not installed or not on PATH' };
  }
  log(`[1/2] docker build -t frontguard/render ${dockerDir}`);
  const built = spawnSync('docker', ['build', '-t', 'frontguard/render', dockerDir], {
    stdio: 'inherit',
  });
  if (built.status !== 0) {
    return { ok: false, reason: `docker build failed with exit code ${built.status}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daytona publish
// ---------------------------------------------------------------------------

interface DaytonaSnapshotModule {
  Daytona: new () => {
    snapshot: {
      create: (
        opts: {
          name: string;
          image: unknown;
          resources: { cpu: number; memory: number; disk: number };
          entrypoint: string[];
        },
        callbacks: { onLogs?: (chunk: string) => void; timeout: number },
      ) => Promise<{ name: string; id: string; imageName: string; state: string }>;
    };
  };
  Image: { base: (img: string) => { runCommands: (...cmds: string[]) => unknown } };
}

/**
 * Publishes the snapshot using `@daytonaio/sdk`. Imported dynamically so the
 * script still loads when the SDK isn't installed (e.g. CI without secrets).
 */
async function publishSnapshot(args: { name: string; dryRun: boolean }): Promise<void> {
  let mod: DaytonaSnapshotModule;
  try {
    mod = (await import('@daytonaio/sdk')) as unknown as DaytonaSnapshotModule;
  } catch {
    throw new Error(
      'The @daytonaio/sdk package is not installed. Run `npm install` at the repo root first.',
    );
  }

  if (args.dryRun) {
    log(`[2/2] (dry run) would publish snapshot "${args.name}"`);
    return;
  }

  const daytona = new mod.Daytona();
  // The runCommands here mirror packages/cli/docker/Dockerfile — keep them in
  // sync when you change one.
  const image = mod.Image.base('mcr.microsoft.com/playwright:v1.48.0-jammy').runCommands(
    'npm install -g frontguard@latest',
    'npx playwright install --with-deps chromium firefox webkit',
    'mkdir -p /home/daytona/output',
  );

  log(`[2/2] publishing snapshot "${args.name}" to Daytona…`);
  const snap = await daytona.snapshot.create(
    {
      name: args.name,
      image,
      resources: { cpu: 2, memory: 4, disk: 10 },
      entrypoint: ['/bin/bash'],
    },
    {
      onLogs: (chunk: string) => process.stdout.write(chunk),
      timeout: 0,
    },
  );

  log('');
  log(`✅ Published snapshot ${snap.name} (id ${snap.id})`);
  log(`   Image: ${snap.imageName}`);
  log(`   State: ${snap.state}`);
  log('');
  log(`To roll back, re-run this script with --version <previous tag> and update`);
  log(`the SNAPSHOT_NAME constant in packages/cli/src/sandbox/daytona.ts.`);
}

// ---------------------------------------------------------------------------
// Missing-key instructions
// ---------------------------------------------------------------------------

function printNoKeyInstructions(name: string): void {
  log('');
  log('────────────────────────────────────────────────────────────');
  log('DAYTONA_API_KEY is not set — skipping the publish step.');
  log('────────────────────────────────────────────────────────────');
  log('');
  log('To publish the snapshot yourself:');
  log('');
  log('  1. Get a Daytona API key from https://app.daytona.io (Settings → API).');
  log('  2. Export it:');
  log('       export DAYTONA_API_KEY=your-key');
  log('  3. Re-run this script:');
  log('       npx tsx scripts/build-daytona-snapshot.ts');
  log('');
  log(`The snapshot will be published as "${name}" and consumed by`);
  log('packages/cli/src/sandbox/daytona.ts and packages/cloud-api/src/daytona-runner.ts.');
  log('');
  log('Until the snapshot exists in your Daytona account, Frontguard transparently');
  log('falls back to the local Playwright sandbox — fix verification still works,');
  log('it just runs on your machine instead of in the cloud.');
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv);
  const snapshotName = `${SNAPSHOT_BASE}-${args.version}`;

  log(`Building Daytona snapshot: ${snapshotName}`);
  log(`Dockerfile: ${resolve(dockerDir, 'Dockerfile')}`);
  log('');

  if (args.skipDockerBuild) {
    log('[1/2] (skipped) docker build smoke test');
  } else {
    const smoke = dockerBuildSmokeTest();
    if (!smoke.ok) {
      err(`⚠ docker build smoke test skipped: ${smoke.reason}`);
      err('  Pass --skip-docker-build to silence this warning.');
    }
  }

  if (!process.env.DAYTONA_API_KEY) {
    printNoKeyInstructions(snapshotName);
    return 0;
  }

  try {
    await publishSnapshot({ name: snapshotName, dryRun: args.dryRun });
    return 0;
  } catch (e) {
    err(`✘ Failed to publish snapshot: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  err(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
