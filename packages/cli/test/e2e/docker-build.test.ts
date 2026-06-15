/**
 * E2E: build the Frontguard render Dockerfile and run `frontguard --version`.
 *
 * Skipped automatically when docker is unavailable (CI without dind, machines
 * without Docker Desktop). Locally, this verifies:
 *
 *   1. docker build -t frontguard/render:test packages/cli/docker/ succeeds
 *   2. docker run --rm frontguard/render:test frontguard --version returns
 *      the canonical version string from package.json
 *
 * The build pulls in the local @frontguard/cli pack (frontguard-cli.tgz)
 * which this test produces via `npm pack` before invoking docker build.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cliDir = resolve(new URL('.', import.meta.url).pathname, '..', '..');
const dockerCtxDir = join(cliDir, 'docker');
const pkg = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf-8')) as { version: string };

/** Returns true if `docker --version` exits 0 on the host. */
function dockerAvailable(): boolean {
  const r = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

const HAVE_DOCKER = dockerAvailable();
const TAG = 'frontguard/render:test';

// Use describe.skipIf so the suite is visibly skipped (not silent) on
// CI runners without docker.
describe.skipIf(!HAVE_DOCKER)('docker image e2e', () => {
  let buildDir: string;

  beforeAll(() => {
    // 1. Build a temp directory that mirrors packages/cli/docker but also
    //    contains the freshly-packed CLI tarball. We don't pollute the
    //    repo's docker/ directory with the tgz.
    buildDir = mkdtempSync(join(tmpdir(), 'fg-docker-build-'));
    cpSync(dockerCtxDir, buildDir, { recursive: true });

    // 2. `npm pack` writes the tarball to whatever cwd it's called from.
    //    We point it at the buildDir then rename to the stable name the
    //    Dockerfile expects.
    execFileSync('npm', ['pack', cliDir, '--silent'], {
      cwd: buildDir,
      stdio: 'inherit',
    });
    const tgz = readdirSync(buildDir).find((f) => f.endsWith('.tgz'));
    if (!tgz) throw new Error('npm pack did not produce a .tgz in ' + buildDir);
    renameSync(join(buildDir, tgz), join(buildDir, 'frontguard-cli.tgz'));

    // 3. docker build. The base image pull is the slow part; the rest is
    //    fonts + npm install. Set DOCKER_BUILDKIT=1 for faster builds when
    //    available; harmless on older docker daemons.
    execFileSync(
      'docker',
      ['build', '--tag', TAG, '--file', join(buildDir, 'Dockerfile'), buildDir],
      {
        stdio: 'inherit',
        env: { ...process.env, DOCKER_BUILDKIT: '1' },
        // Pulling the Playwright base + apt install is genuinely slow on a
        // cold cache. Give it 15 minutes — vitest defaults are too tight.
        timeout: 15 * 60 * 1000,
      },
    );
  }, 15 * 60 * 1000);

  it('runs frontguard --version inside the image', () => {
    const result = spawnSync('docker', ['run', '--rm', TAG, '--version'], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(result.status).toBe(0);
    // The output should contain the canonical version string from package.json.
    const stdout = String(result.stdout ?? '').trim();
    expect(stdout).toContain(pkg.version);
  });

  it('produces a clear error (not a stack trace) for a known-bad URL', () => {
    // Run with a URL that no dev server is listening on. We expect the CLI
    // to surface a single clear error message rather than a Node stack
    // trace. The exit code should be non-zero.
    const result = spawnSync(
      'docker',
      ['run', '--rm', TAG, 'run', '--url', 'http://127.0.0.1:9999'],
      { encoding: 'utf-8', timeout: 60_000 },
    );
    expect(result.status).not.toBe(0);
    const out = String(result.stdout ?? '') + String(result.stderr ?? '');
    // No "at Module.foo (/path/to/...)" frames.
    expect(out).not.toMatch(/^\s*at .+\(.+\.js:\d+:\d+\)/m);
  });

  // Clean up the tarball staging dir. The image is left tagged so a
  // developer can poke at it; we don't `docker rmi` between runs.
  afterAll(() => {
    if (buildDir && existsSync(buildDir)) {
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});

