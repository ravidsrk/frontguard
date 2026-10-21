import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitOrphanStorage } from '../../src/storage/git-orphan.js';
import {
  declaredTargetKeys,
  formatPrunePlan,
  manifestWithoutStaleShots,
  planBaselinePrune,
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
});
