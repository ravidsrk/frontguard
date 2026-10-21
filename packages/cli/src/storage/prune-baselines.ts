/**
 * Prune undeclared shots and unreachable PNG history on `frontguard-baselines`.
 *
 * The default is a dry run. A route filter or a shard refuses the command,
 * because that run cannot see every baseline. Merge-base ancestor commits stay
 * reachable. Approved candidate and baseline SHA-256 values stay reachable.
 * Pixelmatch is not involved.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseBaselineManifest } from '../core/fingerprint.js';
import type { BaselineManifest, RouteEntry } from '../core/types.js';
import { baselineStoragePath } from './git-orphan.js';

const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const BRANCH = 'frontguard-baselines';

export interface PruneShot {
  route: string;
  viewport: number;
  browser: string;
  sha256: string;
}

export interface ApprovalByteRecord {
  baselineSha256: string;
  candidateSha256: string;
}

export interface BaselineHistoryCommit {
  id: string;
  parentCount: number;
  sourceCommitSha?: string;
  shots: readonly PruneShot[];
  imageHashes: readonly string[];
  approvalRecords: readonly ApprovalByteRecord[];
}

export interface PrunePlan {
  blockedReason?: string;
  staleSkippedReason?: string;
  /** Tip the plan was read from. Apply refuses if the branch no longer points here. */
  tipId?: string;
  staleShots: PruneShot[];
  dropCommitIds: string[];
  keepCommitIdsOldestFirst: string[];
  keptForApproval: string[];
  unreachableImageHashes: string[];
  unreachableApprovalHashes: string[];
}

export function targetKey(shot: Pick<PruneShot, 'route' | 'viewport' | 'browser'>): string {
  return `${shot.route}\0${shot.viewport}\0${shot.browser}`;
}

/**
 * Declared shots are the config's routes crossed with effective viewports and
 * browsers. A path selected twice unions explicit widths. An entry with no
 * override also keeps the global widths. An empty global list with no
 * explicit widths is incomplete, so nothing is declared.
 */
export function declaredTargetKeys(config: {
  routes?: readonly RouteEntry[];
  viewports: readonly number[];
  browsers: readonly string[];
}): { keys: Set<string>; complete: boolean } {
  const entries = config.routes ?? [];
  if (entries.length === 0 || config.browsers.length === 0) {
    return { keys: new Set(), complete: false };
  }

  const groups = new Map<string, RouteEntry[]>();
  for (const entry of entries) {
    const path = typeof entry === 'string' ? entry : entry.path;
    const list = groups.get(path) ?? [];
    list.push(entry);
    groups.set(path, list);
  }

  const keys = new Set<string>();
  for (const [path, group] of groups) {
    let usesGlobal = false;
    const explicit = new Set<number>();
    for (const entry of group) {
      if (typeof entry === 'string' || !entry.viewport || entry.viewport.length === 0) {
        usesGlobal = true;
      } else {
        for (const width of entry.viewport) explicit.add(width);
      }
    }
    if (usesGlobal) {
      if (config.viewports.length === 0) return { keys: new Set(), complete: false };
      for (const width of config.viewports) explicit.add(width);
    }
    if (explicit.size === 0) return { keys: new Set(), complete: false };
    for (const width of explicit) {
      for (const browser of config.browsers) {
        keys.add(targetKey({ route: path, viewport: width, browser }));
      }
    }
  }
  return { keys, complete: true };
}

/** `null` means the file is not a list of approval records. */
export function parseApprovalRecords(raw: string): ApprovalByteRecord[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const records: ApprovalByteRecord[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.baselineSha256 !== 'string' || typeof record.candidateSha256 !== 'string') {
      return null;
    }
    if (record.baselineSha256.length === 0 || record.candidateSha256.length === 0) return null;
    records.push({
      baselineSha256: record.baselineSha256,
      candidateSha256: record.candidateSha256,
    });
  }
  return records;
}

export function shotsFromManifest(manifest: BaselineManifest | null): PruneShot[] {
  if (!manifest?.routes) return [];
  const shots: PruneShot[] = [];
  for (const [route, info] of Object.entries(manifest.routes)) {
    const snapshots = info?.snapshots;
    if (snapshots && Object.keys(snapshots).length > 0) {
      for (const [key, snapshot] of Object.entries(snapshots)) {
        const slash = key.indexOf('/');
        if (slash <= 0) continue;
        const viewport = Number(key.slice(0, slash));
        const browser = key.slice(slash + 1);
        if (!Number.isInteger(viewport) || browser.length === 0 || !snapshot?.sha256) continue;
        shots.push({ route, viewport, browser, sha256: snapshot.sha256 });
      }
      continue;
    }
    const browsers = info?.browsers?.length ? info.browsers : ['chromium'];
    for (const viewport of info?.viewports ?? []) {
      for (const browser of browsers) {
        shots.push({ route, viewport, browser, sha256: info?.sha256 ?? '' });
      }
    }
  }
  return shots;
}

export function manifestWithoutStaleShots<T extends BaselineManifest>(
  manifest: T,
  stale: readonly PruneShot[],
): T {
  const staleKeys = new Set(stale.map((shot) => targetKey(shot)));
  const routes: BaselineManifest['routes'] = { ...(manifest.routes ?? {}) };
  for (const [route, info] of Object.entries(routes)) {
    if (!info) continue;
    const originalSnapshots = info.snapshots ?? {};
    if (Object.keys(originalSnapshots).length === 0) {
      const browsers = info.browsers?.length ? info.browsers : ['chromium'];
      const viewports = info.viewports ?? [];
      const kept = viewports.filter((viewport) =>
        browsers.some((browser) => !staleKeys.has(targetKey({ route, viewport, browser }))),
      );
      if (kept.length === viewports.length) continue;
      if (kept.length === 0) {
        delete routes[route];
        continue;
      }
      routes[route] = { ...info, viewports: kept };
      continue;
    }
    const snapshots = { ...originalSnapshots };
    for (const key of Object.keys(snapshots)) {
      const slash = key.indexOf('/');
      if (slash <= 0) continue;
      const viewport = Number(key.slice(0, slash));
      const browser = key.slice(slash + 1);
      if (staleKeys.has(targetKey({ route, viewport, browser }))) delete snapshots[key];
    }
    const remaining = Object.entries(snapshots);
    if (remaining.length === 0) {
      delete routes[route];
      continue;
    }
    const viewports = [...new Set(remaining.map(([key]) => Number(key.slice(0, key.indexOf('/')))))];
    const browsers = [...new Set(remaining.map(([key]) => key.slice(key.indexOf('/') + 1)))];
    const shaStillPresent = remaining.some(([, snapshot]) => snapshot.sha256 === info.sha256);
    routes[route] = {
      ...info,
      viewports,
      browsers: browsers as typeof info.browsers,
      snapshots,
      sha256: shaStillPresent ? info.sha256 : remaining[0]?.[1].sha256,
    };
  }
  return {
    ...manifest,
    routes,
    updatedAt: new Date().toISOString(),
  };
}

function hashesOf(commit: BaselineHistoryCommit): Set<string> {
  return new Set(commit.imageHashes.filter((hash) => hash.length > 0));
}

function recordKey(record: ApprovalByteRecord): string {
  return `${record.baselineSha256}:${record.candidateSha256}`;
}

/**
 * Decide what a prune would drop. Does not read or write git.
 * Commits are newest first. The tip is always kept. A commit whose
 * `sourceCommitSha` is an ancestor of the merge base is kept. Unknown
 * ancestry is kept. A non-linear history is refused.
 */
export function planBaselinePrune(input: {
  commitsNewestFirst: readonly BaselineHistoryCommit[];
  declared: ReadonlySet<string>;
  declaredComplete: boolean;
  discoveryIncomplete: boolean;
  isMergeBaseAncestor: (sourceCommitSha: string) => boolean | 'unknown';
  filtered: boolean;
  sharded: boolean;
}): PrunePlan {
  const empty: PrunePlan = {
    staleShots: [],
    dropCommitIds: [],
    keepCommitIdsOldestFirst: [],
    keptForApproval: [],
    unreachableImageHashes: [],
    unreachableApprovalHashes: [],
  };

  if (input.filtered || input.sharded) {
    const why = [
      input.filtered ? 'a --routes filter does not see every baseline' : '',
      input.sharded ? 'a shard does not see every baseline' : '',
    ].filter(Boolean);
    return {
      ...empty,
      blockedReason: `Refusing to prune: ${why.join(', and ')}. Run prune-baselines on the full config.`,
    };
  }

  if (input.commitsNewestFirst.length === 0) return empty;

  if (input.commitsNewestFirst.some((commit) => commit.parentCount > 1)) {
    return {
      ...empty,
      blockedReason: 'Refusing to prune: baseline history is not linear.',
    };
  }

  const byId = new Map(input.commitsNewestFirst.map((commit) => [commit.id, commit]));
  const tip = input.commitsNewestFirst[0];
  if (!tip) return empty;
  const keep = new Set<string>([tip.id]);
  for (const commit of input.commitsNewestFirst) {
    const ancestry = commit.sourceCommitSha
      ? input.isMergeBaseAncestor(commit.sourceCommitSha)
      : 'unknown';
    if (ancestry !== false) keep.add(commit.id);
  }

  const reachable = (): Set<string> => {
    const hashes = new Set<string>();
    for (const id of keep) {
      const commit = byId.get(id);
      if (!commit) continue;
      for (const hash of hashesOf(commit)) hashes.add(hash);
    }
    return hashes;
  };

  const keptForApproval: string[] = [];
  const needed = new Set<string>();
  for (const commit of input.commitsNewestFirst) {
    for (const record of commit.approvalRecords) {
      needed.add(record.baselineSha256);
      needed.add(record.candidateSha256);
    }
  }

  let reachableNow = reachable();
  const rescue = (holds: (commit: BaselineHistoryCommit) => boolean): void => {
    for (const commit of input.commitsNewestFirst) {
      if (keep.has(commit.id) || !holds(commit)) continue;
      keep.add(commit.id);
      keptForApproval.push(commit.id);
      for (const hash of hashesOf(commit)) reachableNow.add(hash);
    }
  };

  rescue((commit) => commit.imageHashes.some((hash) => needed.has(hash) && !reachableNow.has(hash)));
  reachableNow = reachable();

  const keptRecordKeys = new Set<string>();
  for (const id of keep) {
    const commit = byId.get(id);
    if (!commit) continue;
    for (const record of commit.approvalRecords) keptRecordKeys.add(recordKey(record));
  }
  // One kept copy of a record is enough. Update the set as this walk keeps
  // commits, or every duplicate of the same approval stays reachable.
  for (const commit of input.commitsNewestFirst) {
    if (keep.has(commit.id)) continue;
    const missingRecord = commit.approvalRecords.some(
      (record) => !keptRecordKeys.has(recordKey(record)),
    );
    if (!missingRecord) continue;
    keep.add(commit.id);
    keptForApproval.push(commit.id);
    for (const hash of hashesOf(commit)) reachableNow.add(hash);
    for (const record of commit.approvalRecords) keptRecordKeys.add(recordKey(record));
  }
  reachableNow = reachable();

  const unreachableApprovalHashes = [...needed].filter((hash) => !reachableNow.has(hash)).sort();
  const dropCommitIds = input.commitsNewestFirst
    .filter((commit) => !keep.has(commit.id))
    .map((commit) => commit.id);
  const unreachableImageHashes = [
    ...new Set(
      dropCommitIds.flatMap((id) => {
        const commit = byId.get(id);
        if (!commit) return [];
        return [...hashesOf(commit)].filter((hash) => !reachableNow.has(hash));
      }),
    ),
  ].sort();

  let staleSkippedReason: string | undefined;
  let staleShots: PruneShot[] = [];
  if (input.discoveryIncomplete) {
    staleSkippedReason =
      'Stale-shot removal skipped: route discovery is configured, so this command cannot see every declared target.';
  } else if (!input.declaredComplete) {
    staleSkippedReason =
      'Stale-shot removal skipped: the config has no complete route and viewport list, so missing entries are not treated as deleted.';
  } else {
    staleShots = tip.shots.filter((shot) => !input.declared.has(targetKey(shot)));
  }

  const keepCommitIdsOldestFirst = [...input.commitsNewestFirst]
    .reverse()
    .filter((commit) => keep.has(commit.id))
    .map((commit) => commit.id);

  const blockedReason = unreachableApprovalHashes.length
    ? `Dry run failed: pruning would make approved image bytes unreachable (${unreachableApprovalHashes.join(', ')}).`
    : undefined;

  return {
    blockedReason,
    staleSkippedReason: blockedReason ? undefined : staleSkippedReason,
    tipId: blockedReason ? undefined : tip.id,
    staleShots: blockedReason ? [] : staleShots,
    dropCommitIds: blockedReason ? [] : dropCommitIds,
    keepCommitIdsOldestFirst: blockedReason ? [] : keepCommitIdsOldestFirst,
    keptForApproval,
    unreachableImageHashes: blockedReason ? [] : unreachableImageHashes,
    unreachableApprovalHashes,
  };
}

export function formatPrunePlan(plan: PrunePlan, apply: boolean): string {
  const lines: string[] = [];
  if (plan.blockedReason) {
    lines.push(plan.blockedReason);
  } else if (apply) {
    lines.push('Applying baseline prune on frontguard-baselines.');
  } else {
    lines.push('Dry run. Pass --apply to rewrite frontguard-baselines.');
  }
  if (plan.staleSkippedReason) lines.push(plan.staleSkippedReason);

  if (plan.staleShots.length === 0) lines.push('Stale shots: none');
  else {
    lines.push('Stale shots removed from the tip:');
    for (const shot of plan.staleShots) {
      lines.push(`  ${shot.route} ${shot.viewport} ${shot.browser} ${shot.sha256}`);
    }
  }

  if (plan.dropCommitIds.length === 0) {
    lines.push('History commits that would become unreachable: none');
  } else {
    lines.push('History commits that would become unreachable:');
    for (const id of plan.dropCommitIds) lines.push(`  ${id}`);
  }

  if (plan.keptForApproval.length > 0) {
    lines.push('Commits kept so approved image bytes stay reachable:');
    for (const id of plan.keptForApproval) lines.push(`  ${id}`);
  }
  if (plan.unreachableImageHashes.length > 0) {
    lines.push('Image hashes that would become unreachable:');
    for (const hash of plan.unreachableImageHashes) lines.push(`  ${hash}`);
  }
  if (plan.unreachableApprovalHashes.length > 0) {
    lines.push('Approved image hashes that would become unreachable:');
    for (const hash of plan.unreachableApprovalHashes) lines.push(`  ${hash}`);
  }
  if (
    !plan.blockedReason &&
    plan.staleShots.length === 0 &&
    plan.dropCommitIds.length === 0
  ) {
    lines.push('Nothing to prune.');
  }
  return lines.join('\n');
}

function gitText(repoDir: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitBuffer(repoDir: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, {
    cwd: repoDir,
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function pathMissing(err: unknown): boolean {
  const error = err as { message?: string; stderr?: string | Buffer; status?: number };
  const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : (error.stderr ?? '');
  const text = `${error.message ?? ''}\n${stderr}`;
  return /does not exist in|exists on disk, but not in|invalid object name|unknown revision or path not in the working tree/i.test(
    text,
  );
}

function refExists(repoDir: string, ref: string): boolean {
  try {
    gitText(repoDir, ['show-ref', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

/** Local branch, remote-tracking ref only, or neither. Prune never creates the branch. */
export function baselineBranchState(
  repoDir: string,
  branch = BRANCH,
): 'local' | 'remote-only' | 'absent' {
  if (refExists(repoDir, `refs/heads/${branch}`)) return 'local';
  if (refExists(repoDir, `refs/remotes/origin/${branch}`)) return 'remote-only';
  return 'absent';
}

/**
 * Stale shots whose PNG path is not also the path of a shot that stays.
 * Sanitized routes can collide (`/foo?a` and `/foo_a`), and deleting the shared
 * file would remove the kept baseline.
 */
export function staleFilesToDelete(
  stale: readonly PruneShot[],
  retained: readonly PruneShot[],
): PruneShot[] {
  const retainedPaths = new Set(retained.map((shot) => storagePath(shot)));
  return stale.filter((shot) => !retainedPaths.has(storagePath(shot)));
}

function storagePath(shot: PruneShot): string {
  return baselineStoragePath(shot.route, shot.viewport, shot.browser as 'chromium');
}

function showOptional(repoDir: string, spec: string): string | null {
  try {
    return execFileSync('git', ['show', spec], {
      cwd: repoDir,
      encoding: 'utf8',
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (pathMissing(err)) return null;
    throw err;
  }
}

export function readBaselineCommits(repoDir: string, branch = BRANCH): BaselineHistoryCommit[] {
  if (!refExists(repoDir, `refs/heads/${branch}`)) return [];
  let listed: string;
  try {
    listed = gitText(repoDir, ['rev-list', '--parents', branch]);
  } catch (err) {
    if (pathMissing(err)) return [];
    throw err;
  }
  if (listed.length === 0) return [];

  const newestFirst = listed.split('\n').filter(Boolean);
  const commits: BaselineHistoryCommit[] = [];
  const blobDigest = new Map<string, string>();
  for (const line of newestFirst) {
    const [id, ...parents] = line.split(/\s+/);
    if (!id) continue;
    const manifestRaw = showOptional(repoDir, `${id}:manifest.json`);
    const manifest = manifestRaw === null ? null : parseBaselineManifest(manifestRaw);
    const shots = shotsFromManifest(manifest);
    const hashes = new Set<string>();
    const tree = gitText(repoDir, ['ls-tree', '-r', id]);
    for (const entry of tree.split('\n')) {
      if (entry.length === 0) continue;
      const tab = entry.indexOf('\t');
      if (tab < 0) continue;
      const file = entry.slice(tab + 1);
      if (!file.startsWith('baselines/') || !file.endsWith('.png')) continue;
      const oid = entry.slice(0, tab).split(/\s+/)[2];
      if (!oid) continue;
      let digest = blobDigest.get(oid);
      if (!digest) {
        digest = createHash('sha256').update(gitBuffer(repoDir, ['cat-file', 'blob', oid])).digest('hex');
        blobDigest.set(oid, digest);
      }
      hashes.add(digest);
    }
    const approvalRaw = showOptional(repoDir, `${id}:approvals.json`);
    if (approvalRaw !== null) {
      const records = parseApprovalRecords(approvalRaw);
      if (records === null) {
        throw new Error(
          `approvals.json on ${id} is not a list of baselineSha256 and candidateSha256 records. Refusing to prune.`,
        );
      }
      commits.push({
        id,
        parentCount: parents.length,
        sourceCommitSha: manifest?.sourceCommitSha,
        shots,
        imageHashes: [...hashes],
        approvalRecords: records,
      });
      continue;
    }
    commits.push({
      id,
      parentCount: parents.length,
      sourceCommitSha: manifest?.sourceCommitSha,
      shots,
      imageHashes: [...hashes],
      approvalRecords: [],
    });
  }
  return commits;
}

export function mergeBaseCommit(repoDir: string): string {
  const candidates = ['origin/HEAD', 'origin/main', 'main', 'origin/master', 'master'];
  for (const name of candidates) {
    try {
      if (name === 'origin/HEAD') {
        const ref = gitText(repoDir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
        return gitText(repoDir, ['merge-base', 'HEAD', ref]);
      }
      gitText(repoDir, ['rev-parse', '--verify', '--quiet', name]);
      return gitText(repoDir, ['merge-base', 'HEAD', name]);
    } catch {
      // Try the next default-branch name.
    }
  }
  return gitText(repoDir, ['rev-parse', 'HEAD']);
}

function repositoryIsShallow(repoDir: string): boolean {
  try {
    return gitText(repoDir, ['rev-parse', '--is-shallow-repository']) === 'true';
  } catch {
    return true;
  }
}

export function isMergeBaseAncestor(
  repoDir: string,
  sourceCommitSha: string,
  mergeBase: string,
): boolean | 'unknown' {
  if (!/^[0-9a-f]{4,64}$/i.test(sourceCommitSha)) return 'unknown';
  try {
    gitText(repoDir, ['cat-file', '-e', `${sourceCommitSha}^{commit}`]);
  } catch {
    return 'unknown';
  }
  try {
    gitText(repoDir, ['merge-base', '--is-ancestor', sourceCommitSha, mergeBase]);
    return true;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 1) return 'unknown';
    // A shallow clone can contain the source object while omitting the
    // commits between it and the merge base. Exit 1 is not proof it is safe
    // to drop. Unknown ancestry stays reachable.
    return repositoryIsShallow(repoDir) ? 'unknown' : false;
  }
}

function commitTree(repoDir: string, tree: string, parent: string | undefined, message: string): string {
  const args = [
    '-c',
    'user.name=Frontguard',
    '-c',
    'user.email=frontguard@local',
    '-c',
    'commit.gpgsign=false',
    'commit-tree',
    tree,
  ];
  if (parent) args.push('-p', parent);
  args.push('-F', '-');
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    input: message.endsWith('\n') ? message : `${message}\n`,
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Fails if `branch` is no longer `expected`. A newer baseline write is left in place. */
function compareAndSwap(repoDir: string, branch: string, next: string, expected: string): void {
  try {
    gitText(repoDir, ['update-ref', `refs/heads/${branch}`, next, expected]);
  } catch {
    throw new Error(`Refusing to prune: ${branch} moved while the plan was being applied.`);
  }
}

function rewriteKeptCommits(
  repoDir: string,
  branch: string,
  keepCommitIdsOldestFirst: readonly string[],
  expectedTip: string,
): string {
  let parent: string | undefined;
  for (const id of keepCommitIdsOldestFirst) {
    const tree = gitText(repoDir, ['rev-parse', `${id}^{tree}`]);
    const message = execFileSync('git', ['log', '-1', '--format=%B', id], {
      cwd: repoDir,
      encoding: 'utf8',
      maxBuffer: GIT_MAX_BUFFER,
    });
    parent = commitTree(repoDir, tree, parent, message);
  }
  if (!parent) return expectedTip;
  compareAndSwap(repoDir, branch, parent, expectedTip);
  return parent;
}

function removeStaleShots(
  repoDir: string,
  branch: string,
  stale: readonly PruneShot[],
  expectedTip: string,
): void {
  if (stale.length === 0) return;
  const scratch = mkdtempSync(join(tmpdir(), 'frontguard-prune-'));
  const worktree = join(scratch, 'wt');
  gitText(repoDir, ['worktree', 'add', '--detach', worktree, expectedTip]);
  try {
    const manifestRaw = showOptional(worktree, 'HEAD:manifest.json');
    const manifest = manifestRaw === null ? null : parseBaselineManifest(manifestRaw);
    if (!manifest) {
      throw new Error('The baseline tip has no manifest.json. Refusing to delete shots.');
    }
    const tipShots = shotsFromManifest(manifest);
    const staleKeys = new Set(stale.map((shot) => targetKey(shot)));
    const retained = tipShots.filter((shot) => !staleKeys.has(targetKey(shot)));
    for (const shot of staleFilesToDelete(stale, retained)) {
      gitText(worktree, ['rm', '-f', '--ignore-unmatch', '--', storagePath(shot)]);
    }
    const next = manifestWithoutStaleShots(manifest, stale);
    writeFileSync(join(worktree, 'manifest.json'), `${JSON.stringify(next, null, 2)}\n`);
    gitText(worktree, ['add', '-A']);
    let clean = true;
    try {
      gitText(worktree, ['diff', '--cached', '--quiet']);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 1) throw err;
      clean = false;
    }
    if (clean) return;
    gitText(worktree, [
      '-c',
      'user.name=Frontguard',
      '-c',
      'user.email=frontguard@local',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'Remove baseline shots the config no longer declares',
    ]);
    const tip = gitText(worktree, ['rev-parse', 'HEAD']);
    compareAndSwap(repoDir, branch, tip, expectedTip);
  } finally {
    try {
      gitText(repoDir, ['worktree', 'remove', worktree, '--force']);
    } catch {
      rmSync(worktree, { recursive: true, force: true });
      try {
        gitText(repoDir, ['worktree', 'prune']);
      } catch {
        // A leftover worktree entry is reported by the next git command.
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

function branchIsCheckedOut(repoDir: string, branch: string): boolean {
  const porcelain = gitText(repoDir, ['worktree', 'list', '--porcelain']);
  return porcelain.split('\n').some((line) => line === `branch refs/heads/${branch}`);
}

/**
 * Rewrite the orphan branch from a plan. Refuses a blocked plan and refuses
 * to run while the branch is checked out. Does not run git gc.
 */
export function applyBaselinePrune(
  repoDir: string,
  plan: PrunePlan,
  branch = BRANCH,
): void {
  if (plan.blockedReason || plan.unreachableApprovalHashes.length > 0) {
    throw new Error(plan.blockedReason ?? 'Refusing to prune approved image bytes.');
  }
  if (plan.dropCommitIds.length === 0 && plan.staleShots.length === 0) return;
  if (!plan.tipId) {
    throw new Error('Refusing to prune without the planned baseline tip.');
  }
  if (branchIsCheckedOut(repoDir, branch)) {
    throw new Error(`Refusing to rewrite ${branch} while it is checked out in a worktree.`);
  }

  const current = gitText(repoDir, ['rev-parse', `refs/heads/${branch}`]);
  if (current !== plan.tipId) {
    throw new Error(`Refusing to prune: ${branch} moved after the plan was read.`);
  }

  let expected = plan.tipId;
  if (plan.dropCommitIds.length > 0) {
    expected = rewriteKeptCommits(repoDir, branch, plan.keepCommitIdsOldestFirst, expected);
  }
  removeStaleShots(repoDir, branch, plan.staleShots, expected);
}
