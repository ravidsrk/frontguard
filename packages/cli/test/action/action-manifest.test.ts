/**
 * Regression guards for action/packaging hygiene findings:
 * SEC-1, DEP-1, OPS-4, COU-1 (docs/adversarial-review-fresh.md §1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const rootAction = join(repoRoot, 'action.yml');
const cliAction = join(repoRoot, 'packages/cli/action.yml');
const templateAction = join(repoRoot, 'packages/cli/action.template.yml');
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

function readAction(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Body of the root shim: everything after the GENERATED BODY marker. */
function rootActionBody(yml: string): string {
  const marker = '# GENERATED BODY';
  const idx = yml.indexOf(marker);
  expect(idx, 'root action.yml must contain GENERATED BODY marker').toBeGreaterThan(-1);
  const afterMarker = yml.slice(idx);
  const bodyStart = afterMarker.indexOf('\nname:');
  expect(bodyStart, 'root action.yml must contain name: after header').toBeGreaterThan(-1);
  return afterMarker.slice(bodyStart + 1);
}

/** Extract bash run script bodies from a composite action manifest. */
function runScriptBodies(yml: string): string[] {
  const bodies: string[] = [];
  const runBlock = /run:\s*\|\s*\n([\s\S]*?)(?=\n {4}- name:|\n {4}uses:|\n {2}[a-z]+:|$)/g;
  let match: RegExpExecArray | null;
  while ((match = runBlock.exec(yml)) !== null) {
    bodies.push(match[1]);
  }
  return bodies;
}

describe('COU-1: root shim stays synced with canonical action manifest', () => {
  it('root action body matches packages/cli/action.yml exactly', () => {
    const root = readAction(rootAction);
    const canonical = readAction(cliAction);
    expect(rootActionBody(root)).toBe(canonical);
  });

  it('sync-root-action.mjs is a no-op when manifests are already in sync', () => {
    execSync('node packages/cli/scripts/sync-root-action.mjs', { cwd: repoRoot, stdio: 'pipe' });
    const after = readAction(rootAction);
    expect(rootActionBody(after)).toBe(readAction(cliAction));
  });

  it('action.template.yml retains the @@FRONTGUARD_VERSION@@ placeholder', () => {
    expect(readAction(templateAction)).toContain("@@FRONTGUARD_VERSION@@");
  });
});

describe('SEC-1: no untrusted input interpolation inside shell run blocks', () => {
  for (const [label, path] of [
    ['root', rootAction],
    ['packages/cli', cliAction],
  ] as const) {
    it(`${label}: run scripts do not reference \${{ inputs.`, () => {
      const yml = readAction(path);
      for (const body of runScriptBodies(yml)) {
        expect(body, `found \${{ inputs. in run block of ${path}`).not.toMatch(
          /\$\{\{\s*inputs\./,
        );
      }
    });

    it(`${label}: run scripts do not reference \${{ steps.`, () => {
      const yml = readAction(path);
      for (const body of runScriptBodies(yml)) {
        expect(body, `found \${{ steps. in run block of ${path}`).not.toMatch(/\$\{\{\s*steps\./);
      }
    });
  }
});

describe('DEP-1: CLI version is pinned, not @latest', () => {
  it('rejects @frontguard/cli@latest anywhere in tracked action/docker/daytona surfaces', () => {
    const hits = execSync(
      "git grep -n '@frontguard/cli@latest' -- action.yml packages/cli/action.yml packages/cli/Dockerfile packages/cloud-api/src/daytona-runner.ts || true",
      { encoding: 'utf8', cwd: repoRoot },
    ).trim();
    expect(hits, `Found floating @latest installs:\n${hits}`).toBe('');
  });

  it('action manifests install the repo VERSION', () => {
    for (const path of [rootAction, cliAction]) {
      const yml = readAction(path);
      expect(yml).toContain(`FRONTGUARD_CLI_VERSION: '${version}'`);
      expect(yml).toContain(`"@frontguard/cli@\${FRONTGUARD_CLI_VERSION}"`);
    }
  });

  it('packages/cli/Dockerfile pins @frontguard/cli to repo VERSION', () => {
    const dockerfile = readFileSync(join(repoRoot, 'packages/cli/Dockerfile'), 'utf8');
    expect(dockerfile).toContain(`@frontguard/cli@${version}`);
  });

  it('daytona-runner derives CLI version from packages/cli/package.json', () => {
    const src = readFileSync(
      join(repoRoot, 'packages/cloud-api/src/daytona-runner.ts'),
      'utf8',
    );
    expect(src).toContain('../../cli/package.json');
    expect(src).not.toMatch(/FRONTGUARD_CLI_VERSION = '[0-9]/);
  });
});

describe('DEP-2: root Dockerfile Playwright matches package.json', () => {
  it('packages/cli/Dockerfile pins Playwright v1.61.0-jammy', () => {
    const dockerfile = readFileSync(join(repoRoot, 'packages/cli/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('mcr.microsoft.com/playwright:v1.61.0-jammy');
    expect(dockerfile).not.toContain('v1.48.0-jammy');
  });
});

describe('DEP-4: Playwright is exact-pinned for deterministic renders', () => {
  it('packages/cli/package.json uses an exact Playwright version', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
      dependencies: { playwright: string };
    };
    expect(pkg.dependencies.playwright).toBe('1.61.0');
    expect(pkg.dependencies.playwright).not.toMatch(/^\^/);
  });
});

describe('OPS-4: all GITHUB_OUTPUT writes use random-delimiter heredoc form', () => {
  for (const [label, path] of [
    ['root', rootAction],
    ['packages/cli', cliAction],
  ] as const) {
    it(`${label}: defines write_github_output with openssl rand delimiter`, () => {
      const yml = readAction(path);
      expect(yml).toContain('ghadelim_$(openssl rand -hex 8)');
      expect(yml).toContain('write_github_output');
      expect(yml).not.toContain('<<EOF');
    });

    it(`${label}: does not use single-line key=value GITHUB_OUTPUT writes`, () => {
      const yml = readAction(path);
      for (const body of runScriptBodies(yml)) {
        expect(body, `single-line output write in ${path}`).not.toMatch(
          /echo\s+["']?[a-z]+=/,
        );
        expect(body, `legacy GITHUB_OUTPUT redirect in ${path}`).not.toMatch(
          />>\s*\$GITHUB_OUTPUT/,
        );
      }
    });

    it(`${label}: keeps stderr out of the JSON capture file`, () => {
      const yml = readAction(path);
      expect(yml).not.toMatch(/frontguard-result\.json 2>&1/);
      expect(yml).toContain('2>/tmp/frontguard-stderr.log');
    });

    it(`${label}: surfaces run failures instead of silently passing`, () => {
      const yml = readAction(path);
      expect(yml).not.toContain('|| true');
      expect(yml).toContain('RUN_FAILED=1');
      expect(yml).toContain('write_github_output status "error"');
      expect(yml).not.toContain('REGRESSIONS="${REGRESSIONS:-0}"');
    });
  }
});