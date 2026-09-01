/**
 * Regression guards for action/packaging hygiene findings:
 * SEC-1, DEP-1, OPS-4, COU-1 (docs/adversarial-review-fresh.md §1).
 */
import { describe, it, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const rootAction = join(repoRoot, 'action.yml');
const cliAction = join(repoRoot, 'packages/cli/action.yml');
const templateAction = join(repoRoot, 'packages/cli/action.template.yml');
const rootActionRunner = join(repoRoot, 'action-run.sh');
const cliActionRunner = join(repoRoot, 'packages/cli/action-run.sh');
const smokeWorkflow = join(repoRoot, '.github/workflows/action-smoke.yml');
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

function readAction(path: string): string {
  return readFileSync(path, 'utf8');
}

function stepRunScript(yml: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = yml.match(
    new RegExp(`    - name: ${escapedName}\\n[\\s\\S]*?      run: \\|\\n([\\s\\S]*?)(?=\\n    - name:)`),
  );
  expect(match, `missing run script for ${name}`).not.toBeNull();
  return match![1].replace(/^ {8}/gm, '');
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
    expect(readAction(rootActionRunner)).toBe(readAction(cliActionRunner));
  });

  it('action.template.yml retains the @@FRONTGUARD_VERSION@@ placeholder', () => {
    expect(readAction(templateAction)).toContain("@@FRONTGUARD_VERSION@@");
  });

  it('selects a supported artifact action for GitHub.com and GHES', () => {
    const yml = readAction(templateAction);
    expect(yml).toContain('actions/upload-artifact@v7');
    expect(yml).toContain('actions/upload-artifact@v3.2.2-node20');
    expect(yml).toContain("github.server_url == 'https://github.com'");
    expect(yml).toContain("github.server_url != 'https://github.com'");
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
  it('packages/cli/Dockerfile pins Playwright v1.62.1-jammy', () => {
    const dockerfile = readFileSync(join(repoRoot, 'packages/cli/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('mcr.microsoft.com/playwright:v1.62.1-jammy');
    expect(dockerfile).not.toContain('v1.48.0-jammy');
  });
});

describe('DEP-4: Playwright is exact-pinned for deterministic renders', () => {
  it('packages/cli/package.json uses an exact Playwright version', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
      dependencies: { playwright: string };
    };
    expect(pkg.dependencies.playwright).toBe('1.62.1');
    expect(pkg.dependencies.playwright).not.toMatch(/^\^/);
  });
});

describe('Action launch contract', () => {
  it('installs browsers through the Playwright dependency of the pinned CLI', () => {
    for (const path of [rootAction, cliAction]) {
      const yml = readAction(path);
      expect(yml).toContain(
        'npm exec --yes --package="@frontguard/cli@${FRONTGUARD_CLI_VERSION}" -- playwright install',
      );
      expect(yml).not.toContain('npx playwright install');
    }
  });

  it('maps composite outputs to the Frontguard step outputs', () => {
    for (const path of [rootAction, cliAction]) {
      const yml = readAction(path);
      expect(yml).toMatch(/result:\n\s+description:.*\n\s+value: \$\{\{ steps\.frontguard\.outputs\.result \}\}/);
      expect(yml).toMatch(/regressions:\n\s+description:.*\n\s+value: \$\{\{ steps\.frontguard\.outputs\.regressions \}\}/);
      expect(yml).toMatch(/status:\n\s+description:.*\n\s+value: \$\{\{ steps\.frontguard\.outputs\.status \}\}/);
    }
  });

  it('configures a scoped Git author and pushes only explicit baseline updates', () => {
    const template = readAction(templateAction);
    const identityStep = template.match(
      /    - name: Configure baseline commit identity[\s\S]*?(?=\n    - name:)/,
    )?.[0];
    expect(identityStep).toContain("if: inputs.update-baselines == 'true'");
    expect(identityStep).toContain('git config user.name "github-actions[bot]"');
    expect(identityStep).toContain(
      'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
    );
    expect(readAction(cliActionRunner)).toContain('git push origin frontguard-baselines');
  });

  it('maps tool errors to error and regressions or new pages to fail', () => {
    const runner = readAction(cliActionRunner);
    expect(runner).toContain("NEW_PAGES=$(jq -r '.summary.newPages'");
    expect(runner).toContain('if [ "$RUN_EXIT" -eq 2 ] || [ "$ERRORS" -gt 0 ]');
    expect(runner).toContain(
      'if [ "$REGRESSIONS" -gt 0 ] || { [ "$IN_UPDATE_BASELINES" != "true" ] && [ "$NEW_PAGES" -gt 0 ]; }',
    );
    expect(runner.indexOf('if [ "$RUN_EXIT" -eq 2 ]')).toBeLessThan(
      runner.indexOf('if [ "$REGRESSIONS" -gt 0 ]'),
    );
  });

  it.each([
    ['VERCEL_URL', 'preview.vercel.app', 'https://preview.vercel.app'],
    ['VERCEL_PREVIEW_URL', 'https://preview.vercel.app', 'https://preview.vercel.app'],
    ['DEPLOY_PRIME_URL', 'https://deploy.netlify.app', 'https://deploy.netlify.app'],
    ['DEPLOY_URL', 'https://deploy.netlify.app', 'https://deploy.netlify.app'],
    ['CF_PAGES_URL', 'https://preview.pages.dev', 'https://preview.pages.dev'],
    ['RAILWAY_STATIC_URL', 'preview.up.railway.app', 'https://preview.up.railway.app'],
    ['RENDER_EXTERNAL_URL', 'https://preview.onrender.com', 'https://preview.onrender.com'],
  ])('detects %s without requiring unrelated provider variables', (key, value, expected) => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-action-url-'));
    const output = join(dir, 'output');
    try {
      execFileSync('bash', ['-c', stepRunScript(readAction(templateAction), 'Detect Preview URL')], {
        env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, IN_URL: '', [key]: value },
        stdio: 'pipe',
      });
      expect(readFileSync(output, 'utf8')).toContain(`\n${expected}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles config-only execution when no preview provider variables exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-action-url-'));
    const output = join(dir, 'output');
    try {
      expect(() =>
        execFileSync('bash', ['-c', stepRunScript(readAction(templateAction), 'Detect Preview URL')], {
          env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, IN_URL: '' },
          stdio: 'pipe',
        }),
      ).not.toThrow();
      expect(readFileSync(output, 'utf8')).toMatch(/url<<[^\n]+\n\n/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('publishes baseline updates before exposing a pass status', () => {
    const template = readAction(templateAction);
    const runScript = readAction(cliActionRunner);
    expect(runScript).toContain('git push origin frontguard-baselines');
    expect(runScript.indexOf('git push origin frontguard-baselines')).toBeLessThan(
      runScript.lastIndexOf('write_github_output status "pass"'),
    );
    expect(template).not.toContain('- name: Push updated baselines');
  });

  it('does not advertise AI inputs that the CLI ignores', () => {
    const template = readAction(templateAction);
    expect(template).not.toMatch(/^  ai-provider:/m);
    expect(template).not.toMatch(/^  ai-model:/m);
  });

  it('does not override config threshold unless the input is explicit', () => {
    const template = readAction(templateAction);
    const thresholdInput = template.match(/^  threshold:\n([\s\S]*?)(?=^  [a-z-]+:|^outputs:)/m)?.[1] ?? '';
    expect(thresholdInput).toContain('ratio between 0 and 1');
    expect(thresholdInput).not.toMatch(/^    default:/m);
    expect(readAction(cliActionRunner)).toContain(
      'if [ -n "$IN_THRESHOLD" ]; then CMD+=(--threshold "$IN_THRESHOLD"); fi',
    );
  });

  it('does not override config browsers or viewports when inputs are omitted', () => {
    const template = readAction(templateAction);
    const runner = readAction(cliActionRunner);
    for (const input of ['viewports', 'browsers']) {
      const block = template.match(
        new RegExp(`^  ${input}:\\n([\\s\\S]*?)(?=^  [a-z-]+:|^outputs:)`, 'm'),
      )?.[1] ?? '';
      expect(block).not.toMatch(/^    default:/m);
    }
    expect(runner).toContain('if [ -n "$IN_VIEWPORTS" ]; then CMD+=(--viewports "$IN_VIEWPORTS"); fi');
    expect(runner).toContain('if [ -n "$IN_BROWSERS" ]; then CMD+=(--browsers "$IN_BROWSERS"); fi');
    expect(stepRunScript(template, 'Install Playwright browsers')).toContain(
      'BROWSERS="${IN_BROWSERS:-chromium,firefox,webkit}"',
    );
  });

  it('uploads the effective configured report directory and fails if it is absent', () => {
    const template = readAction(templateAction);
    const runner = readAction(cliActionRunner);
    expect(runner).toContain("REPORT_PATH=$(jq -r '.config.outputDir'");
    expect(runner).toContain('write_github_output report-path "$REPORT_PATH"');
    expect(template).toContain('path: ${{ steps.frontguard.outputs.report-path }}');
    expect(template).toContain('if-no-files-found: error');
    expect(template).not.toContain('if-no-files-found: ignore');
  });

  it('executes a config-only run without injecting browser or viewport overrides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-action-run-'));
    const binDir = join(dir, 'bin');
    const argsPath = join(dir, 'args');
    const outputPath = join(dir, 'output');
    mkdirSync(binDir);
    writeFileSync(
      join(binDir, 'frontguard'),
      `#!/usr/bin/env bash
printf '%s\n' "$@" > "$CAPTURE_ARGS"
mkdir -p custom-report
printf '<html></html>' > custom-report/report.html
printf '{"summary":{"total":1,"regressions":0,"newPages":0,"errors":0},"config":{"outputDir":"./custom-report"}}\n'
`,
    );
    chmodSync(join(binDir, 'frontguard'), 0o755);

    try {
      execFileSync('bash', [cliActionRunner], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          CAPTURE_ARGS: argsPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_WORKSPACE: dir,
          IN_URL: '',
          IN_ROUTES: '',
          IN_VIEWPORTS: '',
          IN_BROWSERS: '',
          IN_THRESHOLD: '',
          IN_CONFIG: 'frontguard.config.ts',
          IN_UPDATE_BASELINES: 'false',
        },
        stdio: 'pipe',
      });
      const args = readFileSync(argsPath, 'utf8');
      expect(args).toContain('--config\nfrontguard.config.ts');
      expect(args).not.toContain('--viewports');
      expect(args).not.toContain('--browsers');
      expect(readFileSync(outputPath, 'utf8')).toMatch(
        /report-path<<[^\n]+\n\.\/custom-report\n/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not present local path resolution as the required external smoke', () => {
    const workflow = readAction(smokeWorkflow);
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
    expect(workflow).not.toMatch(/^\s*uses:\s+\.\/(?:packages\/cli)?\s*$/m);
    expect(workflow).toContain('external consumer');
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
      const source = `${readAction(path)}\n${readAction(cliActionRunner)}`;
      expect(source).not.toMatch(/frontguard-result\.json 2>&1/);
      expect(source).toContain('2>/tmp/frontguard-stderr.log');
    });

    it(`${label}: surfaces run failures instead of silently passing`, () => {
      const source = `${readAction(path)}\n${readAction(cliActionRunner)}`;
      expect(source).not.toContain('|| true');
      expect(source).toContain('RUN_FAILED=1');
      expect(source).toContain('write_github_output status "error"');
      expect(source).not.toContain('REGRESSIONS="${REGRESSIONS:-0}"');
    });
  }
});
