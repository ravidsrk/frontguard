import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitOrphanStorage } from '../../src/storage/git-orphan.js';
import {
  applyBaselinePrune,
  declaredTargetKeys,
  formatPrunePlan,
  manifestWithoutStaleShots,
  isMergeBaseAncestor,
  planBaselinePrune,
  readBaselineCommits,
  staleFilesToDelete,
  type BaselineHistoryCommit,
  type PruneShot,
} from '../../src/storage/prune-baselines.js';
import { runPruneBaselines } from '../../src/cli/prune-baselines.js';
import type { BaselineManifest, BrowserEngine } from '../../src/core/types.js';

function shot(route: string, viewport: number, sha256: string): PruneShot {
  return { route, viewport, browser: 'chromium', sha256 };
}

function commit(fields: {
  id: string;
  source?: string;
  hashes: string[];
  shots?: PruneShot[];
  records?: BaselineHistoryCommit['approvalRecords'];
  parentCount?: number;
}): BaselineHistoryCommit {
  return {
    id: fields.id,
    parentCount: fields.parentCount ?? 1,
    sourceCommitSha: fields.source,
    shots: fields.shots ?? [],
    imageHashes: fields.hashes,
    approvalRecords: fields.records ?? [],
  };
}

describe('declaredTargetKeys', () => {
  it('unions an explicit viewport with the global list when one entry has no override', () => {
    const declared = declaredTargetKeys({
      routes: [{ path: '/', viewport: [390] }, '/'],
      viewports: [1440],
      browsers: ['chromium'],
    });
    expect(declared.complete).toBe(true);
    expect(declared.keys).toEqual(
      new Set(['/\u0000390\u0000chromium', '/\u00001440\u0000chromium']),
    );
  });

  it('treats an empty viewport override as the global list', () => {
    const declared = declaredTargetKeys({
      routes: [{ path: '/pricing', viewport: [] }],
      viewports: [1440],
      browsers: ['chromium'],
    });
    expect([...declared.keys]).toEqual(['/pricing\u00001440\u0000chromium']);
  });

  it('is incomplete when no routes are declared', () => {
    expect(declaredTargetKeys({ routes: [], viewports: [1440], browsers: ['chromium'] }).complete).toBe(
      false,
    );
  });
});

describe('planBaselinePrune', () => {
  const keep = shot('/keep', 1440, 'keep-hash');
  const gone = shot('/gone', 1440, 'gone-hash');
  const declared = new Set(['/keep\u00001440\u0000chromium']);

  function plan(extra: Partial<Parameters<typeof planBaselinePrune>[0]> = {}) {
    return planBaselinePrune({
      commitsNewestFirst: [
        commit({ id: 'tip', source: 'main', hashes: ['keep-hash', 'gone-hash'], shots: [keep, gone] }),
        commit({ id: 'side', source: 'feature', hashes: ['side-only'], shots: [] }),
        commit({ id: 'ancestor', source: 'main', hashes: ['keep-hash', 'gone-v1'], shots: [] }),
      ],
      declared,
      declaredComplete: true,
      discoveryIncomplete: false,
      isMergeBaseAncestor: (source) => (source === 'main' ? true : false),
      filtered: false,
      sharded: false,
      ...extra,
    });
  }

  it('drops a commit that is not a merge-base ancestor and lists the stale tip shot', () => {
    const result = plan();
    expect(result.dropCommitIds).toEqual(['side']);
    expect(result.staleShots).toEqual([gone]);
    expect(result.keepCommitIdsOldestFirst).toEqual(['ancestor', 'tip']);
    expect(result.unreachableImageHashes).toEqual(['side-only']);
    expect(result.blockedReason).toBeUndefined();
    expect(formatPrunePlan(result, false)).toContain('Dry run');
    expect(formatPrunePlan(result, false)).toContain('side');
  });

  it('keeps unknown ancestry', () => {
    const result = plan({
      commitsNewestFirst: [
        commit({ id: 'tip', source: 'main', hashes: ['keep-hash'], shots: [keep] }),
        commit({ id: 'old', hashes: ['old-hash'], shots: [] }),
      ],
      isMergeBaseAncestor: () => true,
    });
    expect(result.dropCommitIds).toEqual([]);
    expect(formatPrunePlan(result, false)).toContain('Nothing to prune.');
  });

  it('refuses a route filter or a shard without listing deletions', () => {
    const filtered = plan({ filtered: true });
    expect(filtered.blockedReason).toMatch(/--routes/);
    expect(filtered.dropCommitIds).toEqual([]);
    expect(filtered.staleShots).toEqual([]);

    const sharded = plan({ sharded: true });
    expect(sharded.blockedReason).toMatch(/shard/);
    expect(sharded.dropCommitIds).toEqual([]);
  });

  it('skips stale shots when discovery is on, and still drops non-ancestor history', () => {
    const result = plan({ discoveryIncomplete: true });
    expect(result.staleShots).toEqual([]);
    expect(result.staleSkippedReason).toMatch(/discovery/);
    expect(result.dropCommitIds).toEqual(['side']);
  });

  it('keeps a non-ancestor commit that holds an approved candidate hash', () => {
    const result = plan({
      commitsNewestFirst: [
        commit({ id: 'tip', source: 'main', hashes: ['keep-hash'], shots: [keep] }),
        commit({
          id: 'side',
          source: 'feature',
          hashes: ['candidate'],
          records: [{ baselineSha256: 'keep-hash', candidateSha256: 'candidate' }],
        }),
      ],
    });
    expect(result.dropCommitIds).toEqual([]);
    expect(result.keptForApproval).toEqual(['side']);
    expect(result.blockedReason).toBeUndefined();
  });

  it('fails the dry run when an approved hash is not in any commit', () => {
    const result = plan({
      commitsNewestFirst: [
        commit({
          id: 'tip',
          source: 'main',
          hashes: ['keep-hash'],
          shots: [keep],
          records: [{ baselineSha256: 'keep-hash', candidateSha256: 'missing' }],
        }),
      ],
    });
    expect(result.blockedReason).toMatch(/unreachable/);
    expect(result.unreachableApprovalHashes).toEqual(['missing']);
    expect(result.dropCommitIds).toEqual([]);
    expect(result.staleShots).toEqual([]);
  });

  it('refuses a non-linear history', () => {
    const result = plan({
      commitsNewestFirst: [
        commit({ id: 'tip', source: 'main', hashes: ['keep-hash'], shots: [keep], parentCount: 2 }),
      ],
    });
    expect(result.blockedReason).toMatch(/not linear/);
  });

  it('keeps one copy of a repeated approval record', () => {
    const record = { baselineSha256: 'keep-hash', candidateSha256: 'candidate' };
    const result = plan({
      commitsNewestFirst: [
        commit({
          id: 'tip',
          source: 'main',
          hashes: ['keep-hash', 'candidate'],
          shots: [keep],
        }),
        commit({
          id: 'newer',
          source: 'feature',
          hashes: ['keep-hash', 'candidate'],
          records: [record],
        }),
        commit({
          id: 'older',
          source: 'feature',
          hashes: ['keep-hash', 'candidate'],
          records: [record],
        }),
      ],
    });
    expect(result.keptForApproval).toEqual(['newer']);
    expect(result.dropCommitIds).toEqual(['older']);
    expect(result.blockedReason).toBeUndefined();
  });

  it('keeps a second commit when it holds a different approval record', () => {
    const result = plan({
      commitsNewestFirst: [
        commit({ id: 'tip', source: 'main', hashes: ['keep-hash', 'a', 'b'], shots: [keep] }),
        commit({
          id: 'one',
          source: 'feature',
          hashes: ['keep-hash', 'a'],
          records: [{ baselineSha256: 'keep-hash', candidateSha256: 'a' }],
        }),
        commit({
          id: 'two',
          source: 'feature',
          hashes: ['keep-hash', 'b'],
          records: [{ baselineSha256: 'keep-hash', candidateSha256: 'b' }],
        }),
      ],
    });
    expect(result.keptForApproval).toEqual(['one', 'two']);
    expect(result.dropCommitIds).toEqual([]);
  });
});

describe('manifestWithoutStaleShots', () => {
  it('removes only the stale snapshot and preserves unknown manifest fields', () => {
    const manifest = {
      schemaVersion: 2,
      createdBy: 'test',
      updatedAt: '2026-10-21T00:00:00.000Z',
      note: 'keep-me',
      routes: {
        '/keep': {
          viewports: [1440],
          browsers: ['chromium' as BrowserEngine],
          lastUpdated: '2026-10-21T00:00:00.000Z',
          sha256: 'keep-hash',
          snapshots: {
            '1440/chromium': { sha256: 'keep-hash', updatedAt: '2026-10-21T00:00:00.000Z' },
          },
        },
        '/gone': {
          viewports: [1440],
          browsers: ['chromium' as BrowserEngine],
          lastUpdated: '2026-10-21T00:00:00.000Z',
          sha256: 'gone-hash',
          snapshots: {
            '1440/chromium': { sha256: 'gone-hash', updatedAt: '2026-10-21T00:00:00.000Z' },
          },
        },
      },
    } as BaselineManifest & { note: string };

    const next = manifestWithoutStaleShots(manifest, [shot('/gone', 1440, 'gone-hash')]);
    expect(next.note).toBe('keep-me');
    expect(next.routes['/gone']).toBeUndefined();
    expect(next.routes['/keep']?.snapshots?.['1440/chromium']?.sha256).toBe('keep-hash');
  });

  it('keeps a schema-1 route that has no snapshots and is not stale', () => {
    const manifest = {
      schemaVersion: 1,
      createdBy: 'test',
      updatedAt: '2026-10-21T00:00:00.000Z',
      routes: {
        '/keep': {
          viewports: [1440],
          browsers: ['chromium' as BrowserEngine],
          lastUpdated: '2026-10-21T00:00:00.000Z',
          sha256: 'keep-hash',
        },
        '/gone': {
          viewports: [375, 1440],
          browsers: ['chromium' as BrowserEngine],
          lastUpdated: '2026-10-21T00:00:00.000Z',
          sha256: 'gone-hash',
        },
      },
    } as BaselineManifest;

    const next = manifestWithoutStaleShots(manifest, [shot('/gone', 375, 'gone-hash')]);
    expect(next.routes['/keep']?.viewports).toEqual([1440]);
    expect(next.routes['/keep']?.snapshots).toBeUndefined();
    expect(next.routes['/gone']?.viewports).toEqual([1440]);
  });
});

describe('staleFilesToDelete', () => {
  it('does not delete a PNG shared by a route that stays', () => {
    const stale = [shot('/foo?a', 1440, 'old')];
    const retained = [shot('/foo_a', 1440, 'new')];
    expect(staleFilesToDelete(stale, retained)).toEqual([]);
  });
});

describe('prune-baselines git history', () => {
  let repoDir: string;
  const keepBytes = Buffer.from('keep-png');
  const goneV1 = Buffer.from('gone-v1');
  const goneV2 = Buffer.from('gone-v2-side');

  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
  }

  function digest(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  function manifest(
    source: string,
    entries: { route: string; buffer: Buffer }[],
  ): BaselineManifest {
    const routes: BaselineManifest['routes'] = {};
    for (const entry of entries) {
      const sha256 = digest(entry.buffer);
      routes[entry.route] = {
        viewports: [1440],
        browsers: ['chromium'],
        lastUpdated: '2026-10-21T00:00:00.000Z',
        sha256,
        snapshots: {
          '1440/chromium': { sha256, updatedAt: '2026-10-21T00:00:00.000Z' },
        },
      };
    }
    return {
      schemaVersion: 2,
      createdBy: 'test',
      updatedAt: '2026-10-21T00:00:00.000Z',
      sourceCommitSha: source,
      routes,
    };
  }

  async function writeBaselines(
    source: string,
    entries: { route: string; buffer: Buffer }[],
  ): Promise<void> {
    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await storage.init();
    await storage.writeBaselines(
      entries.map((entry) => ({
        route: entry.route,
        viewport: 1440,
        browser: 'chromium' as const,
        buffer: entry.buffer,
      })),
      manifest(source, entries),
    );
  }

  beforeEach(() => {
    vi.stubEnv('CI', 'false');
    repoDir = mkdtempSync(join(tmpdir(), 'fg-prune-'));
    git('init', '--quiet', '--initial-branch=main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(
      join(repoDir, 'frontguard.config.json'),
      `${JSON.stringify({
        baseUrl: 'http://127.0.0.1:3000',
        routes: ['/keep'],
        viewports: [1440],
        browsers: ['chromium'],
      })}\n`,
    );
    git('add', '-A');
    git('commit', '--quiet', '-m', 'initial');
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('leaves the branch untouched on a dry run, then keeps the accepted bytes after apply', async () => {
    const mainSha = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'side', '--quiet');
    writeFileSync(join(repoDir, 'side.txt'), 'side\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'side');
    const sideSha = git('rev-parse', 'HEAD');
    git('checkout', 'main', '--quiet');

    await writeBaselines(mainSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV1 },
    ]);
    await writeBaselines(sideSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV2 },
    ]);
    const sideBaseline = git('rev-parse', 'frontguard-baselines');
    const sideTree = git('rev-parse', 'frontguard-baselines^{tree}');
    await writeBaselines(mainSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV1 },
    ]);
    const before = git('rev-parse', 'frontguard-baselines');

    const dry: string[] = [];
    const dryCode = await runPruneBaselines({
      cwd: repoDir,
      apply: false,
      configPath: 'frontguard.config.json',
      stdout: (text) => dry.push(text),
    });
    expect(dryCode).toBe(0);
    expect(dry.join('\n')).toContain(sideBaseline);
    expect(git('rev-parse', 'frontguard-baselines')).toBe(before);
    expect(git('status', '--porcelain')).toBe('');

    const applyCode = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      configPath: 'frontguard.config.json',
      stdout: () => undefined,
    });
    expect(applyCode).toBe(0);

    const trees = git('log', '--format=%T', 'frontguard-baselines').split('\n');
    expect(trees).not.toContain(sideTree);

    const ancestorGone = execFileSync(
      'git',
      ['show', 'frontguard-baselines~2:baselines/gone/1440/chromium.png'],
      { cwd: repoDir },
    );
    expect(Buffer.from(ancestorGone).equals(goneV1)).toBe(true);

    const storage = new GitOrphanStorage(repoDir);
    await storage.init();
    const kept = await storage.readBaseline('/keep', 1440, 'chromium');
    const removed = await storage.readBaseline('/gone', 1440, 'chromium');
    expect(kept?.equals(keepBytes)).toBe(true);
    expect(removed).toBeNull();
    expect(git('status', '--porcelain')).toBe('');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
  }, 30_000);

  it('removes text siblings with a stale PNG', async () => {
    const mainSha = git('rev-parse', 'HEAD');
    await writeBaselines(mainSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV1 },
    ]);
    const writing = new GitOrphanStorage(repoDir, { mode: 'update' });
    await writing.init();
    await writing.textFile('/gone', 1440, 'chromium', '.aria.txt', 'gone text');
    await writing.textFile('/keep', 1440, 'chromium', '.json', '  {"ok":true}');

    const code = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      configPath: 'frontguard.config.json',
      stdout: () => undefined,
    });
    expect(code).toBe(0);

    const read = new GitOrphanStorage(repoDir);
    await read.init();
    expect(await read.textFile('/gone', 1440, 'chromium', '.aria.txt')).toBeNull();
    expect(await read.readBaseline('/gone', 1440, 'chromium')).toBeNull();
    expect(await read.textFile('/keep', 1440, 'chromium', '.json')).toBe('  {"ok":true}');
    expect(await read.readBaseline('/keep', 1440, 'chromium')).toEqual(keepBytes);
  });

  it('treats a missing local branch as nothing to prune', async () => {
    const lines: string[] = [];
    const code = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      configPath: 'frontguard.config.json',
      stdout: (text) => lines.push(text),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Nothing to prune.');
    expect(git('branch', '--list', 'frontguard-baselines')).toBe('');
  });

  it('refuses a remote-only baseline branch', async () => {
    git('update-ref', 'refs/remotes/origin/frontguard-baselines', git('rev-parse', 'HEAD'));
    const lines: string[] = [];
    const code = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      configPath: 'frontguard.config.json',
      stdout: (text) => lines.push(text),
    });
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/origin\/frontguard-baselines/);
    expect(git('branch', '--list', 'frontguard-baselines')).toBe('');
  });

  it('refuses --routes and FRONTGUARD_SHARD before reading a config', async () => {
    const lines: string[] = [];
    const code = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      routesFlag: '/',
      env: { FRONTGUARD_SHARD: '1/2' },
      stdout: (text) => lines.push(text),
    });
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/--routes/);
    expect(lines.join('\n')).toMatch(/shard/);
    expect(git('branch', '--list', 'frontguard-baselines')).toBe('');
  });

  it('refuses to apply after the branch moves', async () => {
    const mainSha = git('rev-parse', 'HEAD');
    await writeBaselines(mainSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV1 },
    ]);
    const commits = readBaselineCommits(repoDir);
    const plan = planBaselinePrune({
      commitsNewestFirst: commits,
      declared: new Set(['/keep\u00001440\u0000chromium']),
      declaredComplete: true,
      discoveryIncomplete: false,
      isMergeBaseAncestor: (source) => source === mainSha,
      filtered: false,
      sharded: false,
    });
    const moved = Buffer.from('keep-moved');
    await writeBaselines(mainSha, [
      { route: '/keep', buffer: moved },
      { route: '/gone', buffer: goneV1 },
    ]);
    const tip = git('rev-parse', 'frontguard-baselines');
    expect(() => applyBaselinePrune(repoDir, plan)).toThrow(/moved/);
    expect(git('rev-parse', 'frontguard-baselines')).toBe(tip);
    const storage = new GitOrphanStorage(repoDir);
    await storage.init();
    expect((await storage.readBaseline('/keep', 1440, 'chromium'))?.equals(moved)).toBe(true);
  });

  it('refuses while another worktree has the baseline branch checked out', async () => {
    const mainSha = git('rev-parse', 'HEAD');
    await writeBaselines(mainSha, [
      { route: '/keep', buffer: keepBytes },
      { route: '/gone', buffer: goneV1 },
    ]);
    const tip = git('rev-parse', 'frontguard-baselines');
    const plan = planBaselinePrune({
      commitsNewestFirst: readBaselineCommits(repoDir),
      declared: new Set(['/keep\u00001440\u0000chromium']),
      declaredComplete: true,
      discoveryIncomplete: false,
      isMergeBaseAncestor: (source) => source === mainSha,
      filtered: false,
      sharded: false,
    });
    const wt = mkdtempSync(join(tmpdir(), 'fg-prune-wt-'));
    git('worktree', 'add', '--quiet', wt, 'frontguard-baselines');
    try {
      expect(() => applyBaselinePrune(repoDir, plan)).toThrow(/worktree/);
      expect(git('rev-parse', 'frontguard-baselines')).toBe(tip);
    } finally {
      git('worktree', 'remove', '--force', wt);
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it('keeps a PNG whose sanitized path is shared with a stale route', async () => {
    writeFileSync(
      join(repoDir, 'frontguard.config.json'),
      `${JSON.stringify({
        baseUrl: 'http://127.0.0.1:3000',
        routes: ['/foo_a'],
        viewports: [1440],
        browsers: ['chromium'],
      })}\n`,
    );
    const kept = Buffer.from('foo-a-bytes');
    await writeBaselines(git('rev-parse', 'HEAD'), [
      { route: '/foo?a', buffer: Buffer.from('foo-query-bytes') },
      { route: '/foo_a', buffer: kept },
    ]);
    const code = await runPruneBaselines({
      cwd: repoDir,
      apply: true,
      configPath: 'frontguard.config.json',
      stdout: () => undefined,
    });
    expect(code).toBe(0);
    const storage = new GitOrphanStorage(repoDir);
    await storage.init();
    expect((await storage.readBaseline('/foo_a', 1440, 'chromium'))?.equals(kept)).toBe(true);
    const manifest = git('show', 'frontguard-baselines:manifest.json');
    expect(manifest).not.toContain('/foo?a');
    expect(manifest).toContain('/foo_a');
  });

  it('does not treat a manifest digest as proof the PNG bytes exist', async () => {
    const mainSha = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'side', '--quiet');
    writeFileSync(join(repoDir, 'side.txt'), 'side\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'side');
    const sideSha = git('rev-parse', 'HEAD');
    git('checkout', 'main', '--quiet');
    const bytesA = Buffer.from('approved-bytes');
    const bytesB = Buffer.from('current-bytes');
    await writeBaselines(sideSha, [{ route: '/keep', buffer: bytesA }]);
    const sideBaseline = git('rev-parse', 'frontguard-baselines');
    await writeBaselines(mainSha, [{ route: '/keep', buffer: bytesB }]);
    const wt = mkdtempSync(join(tmpdir(), 'fg-lie-'));
    git('worktree', 'add', '--detach', '--quiet', wt, 'frontguard-baselines');
    try {
      const manifestPath = join(wt, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BaselineManifest;
      const claimed = digest(bytesA);
      const route = manifest.routes['/keep'];
      if (!route?.snapshots) throw new Error('missing snapshot');
      route.sha256 = claimed;
      route.snapshots['1440/chromium'] = {
        ...route.snapshots['1440/chromium'],
        sha256: claimed,
        updatedAt: '2026-10-21T00:00:00.000Z',
      };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(
        join(wt, 'approvals.json'),
        `${JSON.stringify([{ baselineSha256: claimed, candidateSha256: claimed }])}\n`,
      );
      execFileSync('git', ['add', '-A'], { cwd: wt, stdio: 'pipe' });
      execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'claim old hash'], {
        cwd: wt,
        stdio: 'pipe',
      });
      const lied = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wt, encoding: 'utf8' }).trim();
      git('update-ref', 'refs/heads/frontguard-baselines', lied);
    } finally {
      git('worktree', 'remove', '--force', wt);
      rmSync(wt, { recursive: true, force: true });
    }

    const commits = readBaselineCommits(repoDir);
    expect(commits[0]?.imageHashes).toContain(digest(bytesB));
    expect(commits[0]?.imageHashes).not.toContain(digest(bytesA));
    const plan = planBaselinePrune({
      commitsNewestFirst: commits,
      declared: new Set(['/keep\u00001440\u0000chromium']),
      declaredComplete: true,
      discoveryIncomplete: false,
      isMergeBaseAncestor: (source) => source === mainSha,
      filtered: false,
      sharded: false,
    });
    expect(plan.dropCommitIds).not.toContain(sideBaseline);
    expect(plan.keptForApproval).toContain(sideBaseline);
  });

  it('treats a shallow negative ancestry check as unknown', () => {
    writeFileSync(join(repoDir, 'source.txt'), 'source\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'source');
    const source = git('rev-parse', 'HEAD');
    writeFileSync(join(repoDir, 'middle.txt'), 'middle\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'middle');
    writeFileSync(join(repoDir, 'tip.txt'), 'tip\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'tip');
    const mergeBase = git('rev-parse', 'HEAD');
    const unrelated = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-m', 'unrelated');

    expect(isMergeBaseAncestor(repoDir, source, mergeBase)).toBe(true);
    expect(isMergeBaseAncestor(repoDir, unrelated, mergeBase)).toBe(false);

    git('update-ref', 'refs/heads/old', source);
    const shallowDir = mkdtempSync(join(tmpdir(), 'fg-prune-shallow-'));
    try {
      execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${repoDir}`, shallowDir], {
        stdio: 'pipe',
      });
      execFileSync('git', ['fetch', '--quiet', '--depth', '1', 'origin', 'old'], {
        cwd: shallowDir,
        stdio: 'pipe',
      });
      const shallowHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: shallowDir,
        encoding: 'utf8',
      }).trim();
      expect(shallowHead).toBe(mergeBase);
      expect(isMergeBaseAncestor(shallowDir, source, shallowHead)).toBe('unknown');
      expect(isMergeBaseAncestor(shallowDir, shallowHead, shallowHead)).toBe(true);
    } finally {
      rmSync(shallowDir, { recursive: true, force: true });
    }
  });
});
