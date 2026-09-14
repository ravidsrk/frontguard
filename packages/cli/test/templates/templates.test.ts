import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { getFrameworkInfo, FRAMEWORK_TEMPLATES } from '../../src/templates/index.js';
import { generateGitHubActionsWorkflow } from '../../src/templates/github-actions.js';
import { generateDefaultConfig } from '../../src/core/config.js';

const cliVersion = readFileSync(new URL('../../../../VERSION', import.meta.url), 'utf8').trim();

describe('getFrameworkInfo', () => {
  it('returns Next.js metadata with port 3000', () => {
    const info = getFrameworkInfo('Next.js');
    expect(info.name).toBe('Next.js');
    expect(info.defaultPort).toBe(3000);
    expect(info.fileSystemRouting).toBe(true);
  });

  it('returns SvelteKit metadata with port 5173', () => {
    expect(getFrameworkInfo('SvelteKit').defaultPort).toBe(5173);
  });

  it('returns Astro metadata with port 4321', () => {
    expect(getFrameworkInfo('Astro').defaultPort).toBe(4321);
  });

  it('falls back to generic for unknown framework', () => {
    expect(getFrameworkInfo('Unknown').name).toBe('generic');
  });

  it('falls back to generic for null', () => {
    expect(getFrameworkInfo(null).name).toBe('generic');
  });

  it('every template has required fields', () => {
    for (const info of Object.values(FRAMEWORK_TEMPLATES)) {
      expect(info.name).toBeTruthy();
      expect(Array.isArray(info.dependencyNames)).toBe(true);
      expect(info.defaultPort).toBeGreaterThan(0);
      expect(info.devCommand).toBeTruthy();
      expect(info.ciScripts.length).toBeGreaterThan(0);
      expect(Array.isArray(info.typicalRoutes)).toBe(true);
    }
  });
});

describe('generateDefaultConfig with framework metadata', () => {
  it('Next.js config uses port 3000 baseUrl', () => {
    const config = generateDefaultConfig({ framework: 'Next.js', format: 'ts' });
    expect(config).toContain('http://localhost:3000');
    expect(config).toContain('Detected: Next.js');
    // file-system routed → routes commented out
    expect(config).toContain('// routes:');
  });

  it('SvelteKit config uses port 5173 baseUrl', () => {
    const config = generateDefaultConfig({ framework: 'SvelteKit', format: 'ts' });
    expect(config).toContain('http://localhost:5173');
  });

  it('Vite config uses explicit routes (not file-system routed)', () => {
    const config = generateDefaultConfig({ framework: 'Vite', format: 'ts' });
    expect(config).toMatch(/\n\s*routes: \['\/'\],/);
  });

  it('generic config has no framework comment', () => {
    const config = generateDefaultConfig({ format: 'ts' });
    expect(config).not.toContain('Detected:');
    expect(config).toContain('threshold: 0.1, // Changed-pixel ratio: 0.1 = 10%');
  });

  it('JSON format uses typical routes', () => {
    const config = generateDefaultConfig({ framework: 'Next.js', format: 'json' });
    const parsed = JSON.parse(config);
    expect(parsed.baseUrl).toBe('http://localhost:3000');
    expect(parsed.routes).toEqual(['/', '/about']);
  });

  it('explicit baseUrl overrides framework default', () => {
    const config = generateDefaultConfig({
      framework: 'Next.js',
      baseUrl: 'http://localhost:8080',
      format: 'ts',
    });
    expect(config).toContain('http://localhost:8080');
  });
});

describe('generateGitHubActionsWorkflow', () => {
  it('generates a valid workflow with defaults', () => {
    const yaml = generateGitHubActionsWorkflow();
    expect(yaml).toContain('name: Frontguard');
    expect(yaml).toContain('pull_request');
    expect(yaml).toContain(
      `npm exec --yes --package="@frontguard/cli@${cliVersion}" -- frontguard run`,
    );
    expect(yaml).toContain('actions/checkout@v4');
    expect(yaml).toContain('fetch-depth: 0');
    expect(yaml).toContain(
      'git fetch --no-tags origin +refs/heads/frontguard-baselines:refs/remotes/origin/frontguard-baselines',
    );
    expect(yaml).toContain('elif [ "$status" -eq 2 ]');
    expect(yaml).toContain("node-version: '22'");
    expect(yaml).not.toContain("node-version: '20'");
    expect(yaml).toContain('contents: read');
    expect(yaml).not.toContain('contents: write');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('group: frontguard-${{ github.event.pull_request.number || github.ref }}');
    expect(yaml).toContain('cancel-in-progress: true');
    expect(yaml).toContain('actions/upload-artifact@v7');
    expect(yaml).not.toContain('actions/upload-artifact@v3');
    expect(yaml).not.toContain('v3.2.2-node20');
    expect(yaml).toContain("github.server_url == 'https://github.com'");
    expect(yaml).not.toContain('continue-on-error: true');
    expect(yaml).toContain('id: frontguard');
    expect(yaml).toContain('path: ${{ steps.frontguard.outputs.report-path }}');
    expect(yaml).toContain('if-no-files-found: error');
    expect(yaml).toContain("printf 'report-path<<%s\\n' \"$DELIM\"");
  });

  it('respects custom port', () => {
    const yaml = generateGitHubActionsWorkflow({ port: 5173 });
    expect(yaml).toContain('http://localhost:5173');
  });

  it('respects custom dev command', () => {
    const yaml = generateGitHubActionsWorkflow({ devCommand: 'pnpm dev' });
    expect(yaml).toContain('pnpm dev');
  });

  it('caches Playwright browsers', () => {
    const yaml = generateGitHubActionsWorkflow();
    expect(yaml).toContain('actions/setup-node@v7');
    expect(yaml).toContain('actions/cache@v6');
    expect(yaml).toContain(`playwright-frontguard-${cliVersion}-`);
    expect(yaml).toContain(
      `npm exec --yes --package="@frontguard/cli@${cliVersion}" -- playwright install`,
    );
    expect(yaml).toContain('playwright install --with-deps chromium firefox webkit');
    expect(yaml).not.toContain('npx playwright install');
  });

  it('the documented fetch retrieves a sibling orphan ref after a depth-1 clone', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontguard-t15-'));
    try {
      const clone = createShallowClone(root, { withBaselines: true });
      expect(() => git(clone, 'rev-parse', '--verify', 'refs/remotes/origin/frontguard-baselines')).toThrow();

      const result = runDocumentedFetchStep(clone);
      expect(result.status, result.stderr).toBe(0);
      expect(git(clone, 'show', 'origin/frontguard-baselines:manifest.json')).toContain('"ok":true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the documented fetch step warns and exits 0 when the baseline branch is unpublished', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontguard-t15-missing-'));
    try {
      const clone = createShallowClone(root, { withBaselines: false });
      const result = runDocumentedFetchStep(clone);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('origin/frontguard-baselines is not published');
      expect(() => git(clone, 'rev-parse', '--verify', 'refs/remotes/origin/frontguard-baselines')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the documented fetch step fails closed when ls-remote cannot talk to origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'frontguard-t15-auth-'));
    try {
      const clone = createShallowClone(root, { withBaselines: false });
      git(clone, 'remote', 'set-url', 'origin', join(root, 'not-a-git-remote'));
      const result = runDocumentedFetchStep(clone);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Could not check origin/frontguard-baselines');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function documentedFetchStepScript(): string {
  const yaml = generateGitHubActionsWorkflow();
  const marker = '      - name: Fetch Frontguard baselines\n        run: |\n';
  const start = yaml.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  const next = yaml.indexOf('\n      - name:', bodyStart);
  expect(next).toBeGreaterThan(bodyStart);
  return yaml.slice(bodyStart, next).replace(/^          /gm, '');
}

function runDocumentedFetchStep(cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', ['-s'], {
    cwd,
    encoding: 'utf8',
    input: documentedFetchStepScript(),
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function createShallowClone(root: string, options: { withBaselines: boolean }): string {
  const remote = join(root, 'remote.git');
  mkdirSync(remote);
  git(root, 'init', '--quiet', '--bare', remote);
  const source = join(root, 'source');
  mkdirSync(source);
  git(source, 'init', '--quiet', '--initial-branch=main');
  git(source, 'config', 'user.email', 't15@example.com');
  git(source, 'config', 'user.name', 'T15');
  git(source, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(source, 'README.md'), '# fixture\n');
  git(source, 'add', 'README.md');
  git(source, 'commit', '--quiet', '-m', 'initial');
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', '--quiet', 'origin', 'main');

  if (options.withBaselines) {
    git(source, 'checkout', '--quiet', '--orphan', 'frontguard-baselines');
    git(source, 'rm', '--quiet', '-rf', '.');
    writeFileSync(join(source, 'manifest.json'), '{"ok":true}\n');
    git(source, 'add', '-A');
    git(source, 'commit', '--quiet', '-m', 'baseline');
    git(source, 'push', '--quiet', 'origin', 'frontguard-baselines');
  }

  const clone = join(root, 'shallow');
  git(
    root,
    'clone',
    '--quiet',
    '--depth=1',
    '--single-branch',
    '--branch',
    'main',
    `file://${remote}`,
    clone,
  );
  return clone;
}
