import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Regression guard for ci-3 (v0.2.0 adversarial post-ship review).
//
// scripts/build-daytona-snapshot.ts published the Daytona snapshot with
// `npm install -g frontguard@latest`. The unscoped `frontguard` package does not
// exist on npm (`npm view frontguard` → 404), so the snapshot would fail on first
// boot. It must install the scoped, version-pinned `@frontguard/cli`.

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const src = readFileSync(join(repoRoot, 'scripts/build-daytona-snapshot.ts'), 'utf8');
const cliPkg = JSON.parse(
  readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8'),
) as { version: string };

describe('scripts/build-daytona-snapshot.ts install line (ci-3)', () => {
  it('does NOT install the unscoped frontguard package (404 on npm)', () => {
    // Match an actual install *command* (quoted/template string), not the
    // explanatory comments that mention `frontguard@latest`.
    expect(src).not.toMatch(/['"`]npm install -g frontguard@/);
  });

  it('installs the scoped @frontguard/cli package', () => {
    expect(src).toMatch(/@frontguard\/cli@/);
  });

  it('does not pin the snapshot install to @latest (reproducible snapshots)', () => {
    expect(src).not.toMatch(/@frontguard\/cli@latest/);
  });

  it('sources the version dynamically from packages/cli/package.json (no hard-coded literal)', () => {
    expect(src).toMatch(/readFileSync\([^)]*package\.json/);
    expect(src).toMatch(/@frontguard\/cli@\$\{/);
    // The CLI package version itself must be a real SemVer for the spec to resolve.
    expect(cliPkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
