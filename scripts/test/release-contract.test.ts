import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const releaseScript = path.join(repoRoot, 'scripts/release.sh');
const releaseWorkflow = readFileSync(
  path.join(repoRoot, '.github/workflows/release.yml'),
  'utf8',
);
const fixtureRoots: string[] = [];
const version = '0.2.3';
const sourceSha = '1234567890abcdef1234567890abcdef12345678';
const packages = [
  ['packages/cli', '@frontguard/cli'],
  ['packages/playwright', '@frontguard/playwright'],
  ['packages/mcp', '@frontguard/mcp'],
  ['packages/create-frontguard-plugin', 'create-frontguard-plugin'],
  ['integrations/netlify', '@frontguard/netlify-plugin'],
] as const;

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop() as string, { recursive: true, force: true });
  }
});

function write(filePath: string, contents: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixture(prepared = false) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'frontguard-release-contract-'));
  fixtureRoots.push(fixtureRoot);
  const root = path.join(fixtureRoot, 'repo');
  const fakeBin = path.join(fixtureRoot, 'bin');
  const npmLog = path.join(fixtureRoot, 'npm.log');
  const evidence = path.join(fixtureRoot, 'evidence');
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  copyFileSync(releaseScript, path.join(root, 'scripts/release.sh'));
  chmodSync(path.join(root, 'scripts/release.sh'), 0o755);
  write(path.join(root, 'VERSION'), `${version}\n`);

  const lockPackages: Record<string, { name: string; version: string }> = {};
  for (const [packagePath, name] of packages) {
    const publishConfig = name.startsWith('@')
      ? { access: 'public', provenance: true }
      : undefined;
    write(
      path.join(root, packagePath, 'package.json'),
      `${JSON.stringify({ name, version, ...(publishConfig ? { publishConfig } : {}) }, null, 2)}\n`,
    );
    lockPackages[packagePath] = { name, version };
  }
  write(
    path.join(root, 'package-lock.json'),
    `${JSON.stringify({
      name: 'fixture',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'fixture' }, ...lockPackages },
    }, null, 2)}\n`,
  );

  const publishedPackages = packages
    .map(([, name]) => `- \`${name}@${version}\``)
    .join('\n');
  const releaseEntry = prepared
    ? `\n## [${version}] - 2026-08-30\n\n### Published packages\n\n${publishedPackages}\n`
    : '';
  write(
    path.join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## [Unreleased]\n\n- Source work for ${version}.\n${releaseEntry}\n## [0.2.2] - 2026-06-21\n\n- Previous release.\n`,
  );

  write(
    path.join(fakeBin, 'npm'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$NPM_LOG"
if [ "\${1:-}" = "pack" ]; then
  printf '[{"filename":"fixture.tgz","files":[]}]\n'
fi
`,
  );
  chmodSync(path.join(fakeBin, 'npm'), 0o755);

  return { evidence, fakeBin, fixtureRoot, npmLog, root };
}

function snapshotFiles(root: string) {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
      } else {
        files[path.relative(root, absolute)] = readFileSync(absolute).toString('base64');
      }
    }
  };
  walk(root);
  return files;
}

function runRelease(
  fixture: ReturnType<typeof createFixture>,
  args: string[],
  env: Record<string, string> = {},
) {
  return spawnSync('bash', [path.join(fixture.root, 'scripts/release.sh'), ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_ACTIONS: '',
      GITHUB_EVENT_NAME: '',
      GITHUB_REF: '',
      GITHUB_REF_NAME: '',
      GITHUB_REF_TYPE: '',
      GITHUB_SHA: sourceSha,
      NPM_LOG: fixture.npmLog,
      PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
      RELEASE_APPROVED_SHA: '',
      RELEASE_EVIDENCE_DIR: fixture.evidence,
      RELEASE_IMMUTABLE: '',
      RELEASE_SOURCE_SHA: sourceSha,
      ...env,
    },
  });
}

function workflowJob(name: string) {
  const marker = `  ${name}:`;
  const start = releaseWorkflow.indexOf(marker);
  expect(start, `${name} job missing`).toBeGreaterThan(-1);
  const remainder = releaseWorkflow.slice(start + marker.length);
  const nextJob = remainder.search(/\n  [a-z0-9-]+:\n/);
  return releaseWorkflow.slice(
    start,
    nextJob === -1 ? undefined : start + marker.length + nextJob,
  );
}

describe('release script contract', () => {
  it('runs local build and pack during dry-run without publication or worktree evidence', () => {
    const fixture = createFixture();
    const before = snapshotFiles(fixture.root);
    const result = runRelease(fixture, ['--dry-run']);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status, output).toBe(0);
    const npmCalls = readFileSync(fixture.npmLog, 'utf8').trim().split('\n');
    expect(npmCalls).toContain('run build --workspaces --if-present');
    expect(npmCalls.filter((call) => call === 'pack --dry-run --json')).toHaveLength(5);
    expect(npmCalls.join('\n')).not.toMatch(/(?:^|\s)(?:publish|view|access)(?:\s|$)/);
    expect(output).toContain('Source 0.2.3 remains under [Unreleased]');
    expect(output).toContain('external publication was suppressed');
    expect(snapshotFiles(fixture.root)).toEqual(before);
    expect(existsSync(path.join(fixture.root, '.release-notes'))).toBe(false);
    expect(existsSync(path.join(fixture.evidence, 'release-evidence.json'))).toBe(true);
    expect(existsSync(path.join(fixture.evidence, 'SHA256SUMS'))).toBe(true);

    const metadata = JSON.parse(
      readFileSync(path.join(fixture.evidence, 'release-evidence.json'), 'utf8'),
    ) as { releaseStatus: string; sourceSha: string };
    expect(metadata).toMatchObject({ releaseStatus: 'unreleased', sourceSha });
  });

  it.each([
    {
      name: 'manual dispatch',
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_REF_NAME: 'main',
        GITHUB_REF_TYPE: 'branch',
        RELEASE_APPROVED_SHA: sourceSha,
        RELEASE_IMMUTABLE: 'true',
      },
      message: 'requires a tag push',
    },
    {
      name: 'mismatched tag',
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/tags/v0.2.4',
        GITHUB_REF_NAME: 'v0.2.4',
        GITHUB_REF_TYPE: 'tag',
        RELEASE_APPROVED_SHA: sourceSha,
        RELEASE_IMMUTABLE: 'true',
      },
      message: "must exactly match 'v0.2.3'",
    },
    {
      name: 'unapproved commit',
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/tags/v0.2.3',
        GITHUB_REF_NAME: 'v0.2.3',
        GITHUB_REF_TYPE: 'tag',
        RELEASE_APPROVED_SHA: 'ffffffffffffffffffffffffffffffffffffffff',
        RELEASE_IMMUTABLE: 'true',
      },
      message: 'not the CI-approved commit',
    },
  ])('rejects $name before npm publication', ({ env, message }) => {
    const fixture = createFixture(true);
    const result = runRelease(fixture, [], env);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain(message);
    expect(existsSync(fixture.npmLog) ? readFileSync(fixture.npmLog, 'utf8') : '').not.toContain(
      'publish',
    );
  });
});

describe('release workflow contract', () => {
  it('makes workflow_dispatch validation-only and gates every publication job on tag pushes', () => {
    expect(releaseWorkflow).toMatch(/workflow_dispatch:\s*\n/);
    expect(releaseWorkflow).not.toContain('github.event.inputs');
    expect(releaseWorkflow).toContain('Manual dispatch is validation-only');

    for (const job of ['github-release', 'publish-npm', 'docker']) {
      const block = workflowJob(job);
      expect(block).toContain("github.event_name == 'push'");
      expect(block).toContain("github.ref_type == 'tag'");
    }
  });

  it('requires the exact VERSION tag, same-SHA main CI approval, and immutable release', () => {
    expect(releaseWorkflow).toContain('expected_tag="v$VERSION"');
    expect(releaseWorkflow).toContain('[ "$REF_NAME" = "$expected_tag" ]');
    expect(releaseWorkflow).toContain('remote_tag_sha');
    expect(releaseWorkflow).toContain('git merge-base --is-ancestor');
    expect(releaseWorkflow).toContain("workflow_id: 'ci.yml'");
    expect(releaseWorkflow).toContain("run.conclusion === 'success'");
    expect(releaseWorkflow).toContain('RELEASE_CI_URL: ${{ steps.ci-approval.outputs.run_url }}');
    expect(releaseWorkflow).toContain("needs.github-release.outputs.immutable == 'true'");
    expect(releaseWorkflow).toContain("'.immutable // false'");
    expect(releaseWorkflow).toContain('refs/release-locked/$TAG^{commit}');
  });

  it('limits contents:write to the GitHub Release evidence job', () => {
    expect(releaseWorkflow.match(/contents:\s*write/g)).toHaveLength(1);
    const releaseJob = releaseWorkflow.slice(
      releaseWorkflow.indexOf('  github-release:'),
      releaseWorkflow.indexOf('  publish-npm:'),
    );
    expect(releaseJob).toContain('contents: write');
    expect(releaseJob).toContain('Release validation evidence');
    expect(releaseJob).toContain('releaseStatus == "prepared"');
  });

  it('keeps current 0.2.3 source explicitly unreleased until preparation', () => {
    const currentVersion = readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
    const changelog = readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
    expect(currentVersion).toBe('0.2.3');
    expect(changelog).toContain('## [Unreleased]');
    expect(changelog).not.toMatch(/^## \[0\.2\.3\] - \d{4}-\d{2}-\d{2}$/m);
  });
});
