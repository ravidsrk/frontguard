import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HTMLReporter } from '../../src/report/html.js';
import { runReview, writeReviewManifest, type ReviewShot } from '../../src/cli/review-command.js';
import type { FrontguardConfig, RendererFingerprint, RunResult } from '../../src/core/types.js';
import { GitOrphanStorage } from '../../src/storage/git-orphan.js';

const CLI_PATH = resolve(import.meta.dirname, '../../src/cli/index.ts');
const TSX_PATH = createRequire(import.meta.url).resolve('tsx/cli');

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Compare-mode reads fail closed when CI is set and the fixture has no origin. */
async function compareStorage(cwd: string): Promise<GitOrphanStorage> {
  const previous = process.env.CI;
  process.env.CI = 'false';
  try {
    const storage = new GitOrphanStorage(cwd, { mode: 'compare', offline: true });
    await storage.init();
    return storage;
  } finally {
    if (previous === undefined) delete process.env.CI;
    else process.env.CI = previous;
  }
}

function baseConfig(outputDir: string, plugins?: FrontguardConfig['plugins']): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://127.0.0.1:9',
    viewports: [800],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir,
    plugins,
  };
}

function shot(route: string, current: string, fingerprint?: RendererFingerprint): ReviewShot {
  return {
    route,
    viewport: 800,
    browser: 'chromium',
    status: 'regression',
    current,
    fingerprint,
  };
}

describe('frontguard review', () => {
  let repoDir: string;
  let reportDir: string;
  let logs: string[];

  function git(...args: string[]): void {
    execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' });
  }

  function place(name: string, bytes: Buffer): string {
    mkdirSync(join(reportDir, 'images'), { recursive: true });
    const rel = `images/${name}.png`;
    writeFileSync(join(reportDir, rel), bytes);
    return rel;
  }

  function writeManifest(shots: readonly ReviewShot[]): void {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'review.json'), `${JSON.stringify({ shots })}\n`);
  }

  async function stored(route: string, cwd = repoDir): Promise<Buffer | null> {
    const storage = await compareStorage(cwd);
    return storage.readBaseline(route, 800, 'chromium');
  }

  async function manifestSha(route: string): Promise<string | undefined> {
    const storage = await compareStorage(repoDir);
    const manifest = await storage.readManifest();
    return manifest?.routes?.[route]?.snapshots?.['800/chromium']?.sha256;
  }

  async function storedScheme(route: string): Promise<string | undefined> {
    const storage = await compareStorage(repoDir);
    const manifest = await storage.readManifest();
    return manifest?.routes?.[route]?.snapshots?.['800/chromium']?.colorScheme;
  }

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logs.push(String(line));
    });
    repoDir = mkdtempSync(join(tmpdir(), 'fg-review-'));
    reportDir = join(repoDir, 'report');
    git('init', '--quiet');
    git('config', 'user.email', 'review@example.com');
    git('config', 'user.name', 'Reviewer');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repoDir, 'README.md'), '# fixture\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'initial');
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('writes one accepted shot and leaves the other two untouched', async () => {
    const first = Buffer.from('png-a');
    const second = Buffer.from('png-b');
    const third = Buffer.from('png-c');
    writeManifest([
      shot('/a', place('a', first)),
      shot('/b', place('b', second)),
      shot('/c', place('c', third)),
    ]);
    const answers = ['accept', 'quit', 'accept'] as const;
    let asked = 0;

    const out = await runReview({
      cwd: repoDir,
      reportDir,
      confirmBaselines: true,
      config: baseConfig(reportDir),
      ask: async () => answers[asked++] ?? 'quit',
    });

    expect(out.exitCode).toBe(0);
    expect(out.written).toEqual(['/a']);
    expect(asked).toBe(2);
    expect(await stored('/a')).toEqual(first);
    expect(await stored('/b')).toBeNull();
    expect(await stored('/c')).toBeNull();
    expect(await manifestSha('/a')).toBe(sha256(first));
    expect(await manifestSha('/b')).toBeUndefined();
    expect(logs).toEqual([
      `audit route=/a viewport=800 browser=chromium old=absent new=${sha256(first)} user=Reviewer time=${out.audits[0]?.split(' time=')[1]}`,
    ]);
    expect(out.audits[0]).toMatch(/ time=\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses bulk acceptance without a filter or --all', async () => {
    writeManifest([shot('/a', place('a', Buffer.from('png-a')))]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      confirmBaselines: true,
      interactive: false,
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(2);
    expect(out.message).toContain('Bulk acceptance needs a filter or --all');
    expect(out.written).toEqual([]);
    expect(await stored('/a')).toBeNull();
  });

  it('a filter writes only the named shot', async () => {
    const chosen = Buffer.from('png-b');
    writeManifest([
      shot('/a', place('a', Buffer.from('png-a'))),
      shot('/b', place('b', chosen)),
    ]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      confirmBaselines: true,
      filter: '/b',
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(0);
    expect(out.written).toEqual(['/b']);
    expect(await stored('/b')).toEqual(chosen);
    expect(await stored('/a')).toBeNull();
  });

  it('copies a CI png byte for byte and refuses a fingerprint mismatch', async () => {
    const png = Buffer.from('ci-png-bytes');
    await writeCiReport(reportDir, '/pricing', png);
    const copied = await runReview({
      cwd: repoDir,
      reportDir,
      from: true,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });
    expect(copied.exitCode).toBe(0);
    expect(await stored('/pricing')).toEqual(png);
    expect(await manifestSha('/pricing')).toBe(sha256(png));

    const otherRepo = mkdtempSync(join(tmpdir(), 'fg-review-mismatch-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: otherRepo, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 'review@example.com'], { cwd: otherRepo, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Reviewer'], { cwd: otherRepo, stdio: 'pipe' });
      execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: otherRepo, stdio: 'pipe' });
      writeFileSync(join(otherRepo, 'README.md'), '# fixture\n');
      execFileSync('git', ['add', '-A'], { cwd: otherRepo, stdio: 'pipe' });
      execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: otherRepo, stdio: 'pipe' });
      const mismatched = join(otherRepo, 'report');
      await writeCiReport(mismatched, '/pricing', png);
      const sidecarPath = join(mismatched, 'review.json');
      const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
        shots: Array<{ fingerprint: RendererFingerprint }>;
      };
      sidecar.shots[0]!.fingerprint.os = process.platform === 'linux' ? 'darwin' : 'linux';
      writeFileSync(sidecarPath, `${JSON.stringify(sidecar)}\n`);

      const refused = await runReview({
        cwd: otherRepo,
        reportDir: mismatched,
        from: true,
        all: true,
        confirmBaselines: true,
        config: baseConfig(mismatched),
      });
      expect(refused.exitCode).toBe(2);
      expect(refused.message).toContain('os');
      expect(refused.message).toContain('Nothing was written.');
      expect(await stored('/pricing', otherRepo)).toBeNull();
    } finally {
      rmSync(otherRepo, { recursive: true, force: true });
    }
  });

  it('records the previous manifest sha on a later acceptance', async () => {
    const previous = Buffer.from('old-png');
    const next = Buffer.from('new-png');
    const previousSha = sha256(previous);
    const storage = new GitOrphanStorage(repoDir, { mode: 'update', offline: true });
    await storage.init();
    const now = '2026-01-01T00:00:00.000Z';
    await storage.writeBaselines(
      [{ route: '/pricing', viewport: 800, browser: 'chromium', buffer: previous }],
      {
        schemaVersion: 2,
        createdBy: 'test',
        updatedAt: now,
        routes: {
          '/pricing': {
            viewports: [800],
            browsers: ['chromium'],
            lastUpdated: now,
            sha256: previousSha,
            snapshots: { '800/chromium': { sha256: previousSha, updatedAt: now } },
          },
        },
      },
    );
    writeManifest([shot('/pricing', place('pricing', next))]);

    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });

    expect(out.exitCode).toBe(0);
    expect(out.audits[0]).toContain(`old=${previousSha}`);
    expect(out.audits[0]).toContain(`new=${sha256(next)}`);
    expect(out.audits[0]).toContain('user=Reviewer');
    expect(await stored('/pricing')).toEqual(next);
    expect(await manifestSha('/pricing')).toBe(sha256(next));
  });

  it('writes nothing when the accessibility plugin throws', async () => {
    const png = Buffer.from('axe-png');
    writeManifest([shot('/pricing', place('pricing', png))]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir, [
        {
          name: 'accessibility',
          afterRender() {
            throw new Error(
              'Accessibility check failed: 1 violation(s) at or above the configured impact threshold.',
            );
          },
        },
      ]),
    });
    expect(out.exitCode).toBe(2);
    expect(out.message).toBe(
      'Accessibility check failed: 1 violation(s) at or above the configured impact threshold. Baselines were not written.',
    );
    expect(out.written).toEqual([]);
    expect(await stored('/pricing')).toBeNull();
    expect(await manifestSha('/pricing')).toBeUndefined();
  });

  it('writes with a bogus origin and does not fetch', async () => {
    git('remote', 'add', 'origin', join(repoDir, 'no-such-remote'));
    const png = Buffer.from('offline-png');
    writeManifest([shot('/pricing', place('pricing', png))]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(0);
    expect(await stored('/pricing')).toEqual(png);
  });

  it('does not let a missing shot cancel an accepted one', async () => {
    const keep = Buffer.from('keep-png');
    const gone = Buffer.from('gone-png');
    const goneSha = sha256(gone);
    const writer = new GitOrphanStorage(repoDir, { mode: 'update', offline: true });
    await writer.init();
    const now = '2026-01-01T00:00:00.000Z';
    await writer.writeBaselines(
      [{ route: '/gone', viewport: 800, browser: 'chromium', buffer: gone }],
      {
        schemaVersion: 2,
        createdBy: 'test',
        updatedAt: now,
        routes: {
          '/gone': {
            viewports: [800],
            browsers: ['chromium'],
            lastUpdated: now,
            sha256: goneSha,
            snapshots: { '800/chromium': { sha256: goneSha, updatedAt: now } },
          },
        },
      },
    );
    writeManifest([shot('/keep', place('keep', keep))]);
    const asked: string[] = [];
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      confirmBaselines: true,
      config: baseConfig(reportDir),
      ask: async (item) => {
        asked.push(`${item.route}:${item.status}`);
        return 'accept';
      },
    });
    expect(out.exitCode).toBe(0);
    expect(out.written).toEqual(['/keep']);
    expect(asked).toEqual(['/keep:regression', '/gone:missing']);
    expect(await stored('/keep')).toEqual(keep);
    expect(await stored('/gone')).toEqual(gone);
  });

  it('refuses a filter that only matches a shot with no current image', async () => {
    const gone = Buffer.from('gone-png');
    const goneSha = sha256(gone);
    const writer = new GitOrphanStorage(repoDir, { mode: 'update', offline: true });
    await writer.init();
    const now = '2026-01-01T00:00:00.000Z';
    await writer.writeBaselines(
      [{ route: '/gone', viewport: 800, browser: 'chromium', buffer: gone }],
      {
        schemaVersion: 2,
        createdBy: 'test',
        updatedAt: now,
        routes: {
          '/gone': {
            viewports: [800],
            browsers: ['chromium'],
            lastUpdated: now,
            sha256: goneSha,
            snapshots: { '800/chromium': { sha256: goneSha, updatedAt: now } },
          },
        },
      },
    );
    writeManifest([]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      confirmBaselines: true,
      filter: '/gone',
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(2);
    expect(out.message).toContain('no shots with a current image');
    expect(await stored('/gone')).toEqual(gone);
  });

  it('stamps the captured color scheme instead of the global setting', async () => {
    const png = Buffer.from('dark-png');
    const config = { ...baseConfig(reportDir), colorScheme: 'light' as const };
    mkdirSync(reportDir, { recursive: true });
    writeReviewManifest(
      {
        summary: { total: 1, passed: 0, regressions: 1, warnings: 0, newPages: 0, errors: 0 },
        diffs: [
          {
            route: { path: '/pricing', colorScheme: 'dark' },
            viewport: 800,
            browser: 'chromium',
            status: 'regression',
            diffPercentage: 4,
            currentImage: png,
          },
        ],
        timing: { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 },
        config,
      },
      reportDir,
    );
    const sidecar = JSON.parse(readFileSync(join(reportDir, 'review.json'), 'utf8')) as {
      shots: Array<{ current?: string; colorScheme?: string }>;
    };
    expect(sidecar.shots[0]?.colorScheme).toBe('dark');
    mkdirSync(join(reportDir, 'images'), { recursive: true });
    writeFileSync(join(reportDir, sidecar.shots[0]?.current ?? ''), png);

    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config,
    });
    expect(out.exitCode).toBe(0);
    expect(await stored('/pricing')).toEqual(png);
    expect(await storedScheme('/pricing')).toBe('dark');
  });

  it('refuses a current image whose real path leaves the report directory', async () => {
    const secret = Buffer.from('secret-bytes');
    writeFileSync(join(repoDir, 'secret.png'), secret);
    mkdirSync(join(reportDir, 'images'), { recursive: true });
    symlinkSync(join(repoDir, 'secret.png'), join(reportDir, 'images', 'link.png'));
    writeManifest([shot('/pricing', 'images/link.png')]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(2);
    expect(out.message).toContain('Nothing was written.');
    expect(await stored('/pricing')).toBeNull();
  });

  it('accepts a symlink that stays inside the report directory', async () => {
    const png = Buffer.from('inside-png');
    const rel = place('real', png);
    symlinkSync(join(reportDir, rel), join(reportDir, 'images', 'link.png'));
    writeManifest([shot('/pricing', 'images/link.png')]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(0);
    expect(await stored('/pricing')).toEqual(png);
  });

  it('refuses a current path that escapes the report directory', async () => {
    writeFileSync(join(repoDir, 'secret.png'), Buffer.from('secret'));
    writeManifest([shot('/pricing', '../secret.png')]);
    const out = await runReview({
      cwd: repoDir,
      reportDir,
      all: true,
      confirmBaselines: true,
      config: baseConfig(reportDir),
    });
    expect(out.exitCode).toBe(2);
    expect(out.message).toContain('Nothing was written.');
    expect(await stored('/pricing')).toBeNull();
  });

  it('exposes review on the CLI', () => {
    writeFileSync(
      join(repoDir, 'frontguard.config.json'),
      `${JSON.stringify({ version: 1, baseUrl: 'http://127.0.0.1:9', outputDir: './report' })}\n`,
    );
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'review.json'), '{"shots":[]}\n');

    const help = runCli(['review', '--help'], repoDir);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('--from');
    expect(help.stdout).toContain('--all');
    expect(help.stdout).toContain('--filter');
    expect(help.stdout).toContain('--confirm-baselines');

    const blocked = runCli(['review', '--all'], repoDir);
    expect(blocked.exitCode).toBe(2);
    expect(blocked.stderr).toContain('--confirm-baselines');

    const judge = runCli(['review', '--confirm-baselines', '--mode', 'judge'], repoDir);
    expect(judge.exitCode).toBe(2);
    expect(judge.stderr).toContain('judge');

    const empty = runCli(
      ['review', '--confirm-baselines', '--all', '--from', 'report', '-c', 'frontguard.config.json'],
      repoDir,
    );
    expect(empty.exitCode).toBe(0);
    expect(empty.stderr).toContain('Nothing to review.');
  }, 45_000);
});

async function writeCiReport(dir: string, route: string, png: Buffer): Promise<void> {
  const config: FrontguardConfig = {
    version: 1,
    baseUrl: 'http://127.0.0.1:9',
    viewports: [800],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    workers: 1,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: dir,
  };
  const result: RunResult = {
    summary: { total: 1, passed: 0, regressions: 1, warnings: 0, newPages: 0, errors: 0 },
    diffs: [
      {
        route: { path: route },
        viewport: 800,
        browser: 'chromium',
        status: 'regression',
        diffPercentage: 4,
        currentImage: png,
      },
    ],
    timing: { discovery: 0, render: 0, compare: 0, ai: 0, total: 0 },
    config,
  };
  await new HTMLReporter().writeReport(result, dir);
}

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(process.execPath, [TSX_PATH, CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, CI: 'false', NODE_ENV: 'test' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}
