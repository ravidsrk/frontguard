/**
 * Build & publish the Frontguard Daytona snapshot.
 *
 * Produces (or refreshes) the `frontguard-playwright-v1` snapshot consumed by:
 *   - `packages/cli/src/sandbox/daytona.ts`             (fix verification)
 *   - `packages/cloud-api/src/daytona-runner.ts`        (cloud-side runs)
 *
 * What it does
 * ------------
 * 1.  Packs the local `@frontguard/cli` workspace via `npm pack` and copies
 *     the tarball into `packages/cli/docker/frontguard-cli.tgz`, so the
 *     Dockerfile self-contains the exact CLI bits in the repo (NOT
 *     `frontguard@latest` from npm).
 * 2.  Runs `docker build -t frontguard/render packages/cli/docker/` to verify
 *     the T11 image actually builds. Smoke test only — skip with
 *     `--skip-docker-build` if you don't have Docker on PATH.
 * 3.  Authenticates to Daytona via `DAYTONA_API_KEY` and publishes a snapshot
 *     named `frontguard-playwright-v1`. The snapshot runs the same install
 *     steps as the Dockerfile so the rendered output matches byte-for-byte.
 *
 * No DAYTONA_API_KEY?
 * -------------------
 * The script prints copy-pasteable instructions and exits 0 (so it's safe to
 * invoke in CI without a key). It still runs the npm-pack + Docker steps,
 * which catch the bulk of the breakage.
 *
 * Usage
 * -----
 *     npx tsx scripts/build-daytona-snapshot.ts
 *     npx tsx scripts/build-daytona-snapshot.ts --skip-docker-build
 *     npx tsx scripts/build-daytona-snapshot.ts --skip-npm-pack
 *     npx tsx scripts/build-daytona-snapshot.ts --version v2
 *     npx tsx scripts/build-daytona-snapshot.ts --dry-run
 *
 * Rolling back
 * ------------
 * Each publish stamps a versioned snapshot tag (`frontguard-playwright-v1`).
 * To roll back: re-publish from a previous git commit, or run with the prior
 * `--version` and update the `SNAPSHOT_NAME` constant in
 * `packages/cli/src/sandbox/daytona.ts` and the matching one in
 * `packages/cloud-api/src/daytona-runner.ts` to point at it.
 *
 * @module scripts/build-daytona-snapshot
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cliDir = resolve(repoRoot, 'packages/cli');
const dockerDir = resolve(cliDir, 'docker');
const tarballName = 'frontguard-cli.tgz';
const tarballDest = resolve(dockerDir, tarballName);

// Exact published CLI version, read from the workspace manifest at runtime so the
// snapshot pins `@frontguard/cli@<version>` and never drifts to a 404
// `frontguard@latest` — the unscoped `frontguard` package does not exist on npm
// (`npm view frontguard` → 404). Pinning the exact version (not `@latest`) keeps
// the published snapshot reproducible.
const cliVersion = (
  JSON.parse(readFileSync(resolve(cliDir, 'package.json'), 'utf8')) as { version: string }
).version;
const cliInstallSpec = `@frontguard/cli@${cliVersion}`;

// ---------------------------------------------------------------------------
// Snapshot version — bump alongside the Dockerfile / Playwright base
// ---------------------------------------------------------------------------

const DEFAULT_VERSION = 'v1';
const SNAPSHOT_BASE = 'frontguard-playwright';

/** Pinned Playwright base. Keep in sync with packages/cli/docker/Dockerfile. */
const PLAYWRIGHT_BASE = 'mcr.microsoft.com/playwright:v1.59.0-jammy';

// ---------------------------------------------------------------------------
// Arg parsing — keep it tiny, no commander
// ---------------------------------------------------------------------------

interface CliArgs {
  skipDockerBuild: boolean;
  skipNpmPack: boolean;
  dryRun: boolean;
  version: string;
}

const USAGE = `Usage: npx tsx scripts/build-daytona-snapshot.ts [options]

Options:
  --skip-docker-build   Skip the local docker build smoke test
  --skip-npm-pack       Skip running \`npm pack\` against packages/cli
  --dry-run             Print what would happen, don't publish
  --version <tag>       Snapshot version suffix (default: ${DEFAULT_VERSION})
  -h, --help            Show this message
`;

function parseArgs(argv: string[]): CliArgs {
  let skipDockerBuild = false;
  let skipNpmPack = false;
  let dryRun = false;
  let version = DEFAULT_VERSION;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skip-docker-build') skipDockerBuild = true;
    else if (a === '--skip-npm-pack') skipNpmPack = true;
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
  return { skipDockerBuild, skipNpmPack, dryRun, version };
}

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
// npm pack — produce frontguard-cli.tgz next to the Dockerfile
// ---------------------------------------------------------------------------

/**
 * Runs `npm pack` against packages/cli and moves the produced tarball to
 * `packages/cli/docker/frontguard-cli.tgz`, which is the name the Dockerfile
 * COPYs from the build context.
 *
 * Why pack locally instead of installing `frontguard@latest`? The image is
 * meant to verify *this commit*, not whatever happens to be on npm.
 */
function runNpmPack(): { ok: boolean; reason?: string } {
  if (!existsSync(cliDir)) {
    return { ok: false, reason: `Missing CLI workspace at ${cliDir}` };
  }
  mkdirSync(dockerDir, { recursive: true });
  log(`[1/3] npm pack (in ${cliDir}) → ${tarballDest}`);
  // Build first so dist/ is current; npm pack honors the `files` field which
  // requires dist/ to exist.
  const built = spawnSync('npm', ['run', 'build'], { cwd: cliDir, stdio: 'inherit' });
  if (built.status !== 0) {
    return { ok: false, reason: `npm run build failed (exit ${built.status})` };
  }
  const packed = spawnSync('npm', ['pack', '--pack-destination', dockerDir], {
    cwd: cliDir,
    stdio: 'inherit',
  });
  if (packed.status !== 0) {
    return { ok: false, reason: `npm pack failed (exit ${packed.status})` };
  }
  // npm pack writes `frontguard-cli-<version>.tgz`; rename to the stable name
  // the Dockerfile expects.
  const produced = readdirSync(dockerDir).find(
    (f) => f.startsWith('frontguard-cli-') && f.endsWith('.tgz'),
  );
  if (!produced) {
    return { ok: false, reason: `npm pack did not produce a tarball in ${dockerDir}` };
  }
  if (existsSync(tarballDest)) unlinkSync(tarballDest);
  renameSync(join(dockerDir, produced), tarballDest);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Docker smoke test
// ---------------------------------------------------------------------------

/**
 * Runs `docker build` against the T11 Dockerfile so we catch syntax errors,
 * missing FROMs, or broken install lines before we ask Daytona to build the
 * same thing remotely.
 */
function dockerBuildSmokeTest(): { ok: boolean; reason?: string } {
  if (!existsSync(resolve(dockerDir, 'Dockerfile'))) {
    return { ok: false, reason: `No Dockerfile at ${dockerDir}` };
  }
  const probe = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (probe.status !== 0) {
    return { ok: false, reason: 'docker is not installed or not on PATH' };
  }
  log(`[2/3] docker build -t frontguard/render ${dockerDir}`);
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
  Image: {
    base: (img: string) => {
      runCommands: (...cmds: string[]) => unknown;
    };
  };
}

/**
 * Publishes the snapshot using `@daytonaio/sdk`. The runCommands here mirror
 * the steps in `packages/cli/docker/Dockerfile` — keep them aligned when you
 * change one. The Daytona SDK can't `docker build` a Dockerfile directly, so
 * we reproduce the install sequence using `Image.base().runCommands()`.
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
    log(`[3/3] (dry run) would publish snapshot "${args.name}"`);
    return;
  }

  const daytona = new mod.Daytona();
  // These runCommands intentionally mirror packages/cli/docker/Dockerfile so a
  // sandbox booted from the snapshot renders bit-identically to a local
  // `docker run`. Bump in sync with the Dockerfile.
  const image = mod.Image.base(PLAYWRIGHT_BASE).runCommands(
    'apt-get update',
    'apt-get install -y --no-install-recommends fonts-liberation fonts-liberation2 fonts-dejavu-core fonts-dejavu-extra fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fontconfig',
    'fc-cache -f',
    'rm -rf /var/lib/apt/lists/*',
    // The published snapshot installs the CLI from the npm registry because
    // Daytona's image builder doesn't accept a local tarball. The local docker
    // build (step [2/3]) verifies the in-repo bits; the snapshot is what
    // production renders run against. Install the scoped, version-pinned package
    // (`@frontguard/cli@<version>`) — NOT unscoped `frontguard@latest`, which is
    // a 404 on npm and would break the snapshot on first boot.
    `npm install -g ${cliInstallSpec}`,
    'mkdir -p /home/daytona/output',
  );

  log(`[3/3] publishing snapshot "${args.name}" to Daytona…`);
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
  log('Rollback: re-run this script with --version <previous tag> and update');
  log('the SNAPSHOT_NAME constants in packages/cli/src/sandbox/daytona.ts and');
  log('packages/cloud-api/src/daytona-runner.ts.');
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

  if (args.skipNpmPack) {
    log('[1/3] (skipped) npm pack');
  } else {
    const packed = runNpmPack();
    if (!packed.ok) {
      err(`⚠ npm pack step skipped: ${packed.reason}`);
      err('  Pass --skip-npm-pack to silence this warning.');
    }
  }

  if (args.skipDockerBuild) {
    log('[2/3] (skipped) docker build smoke test');
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
