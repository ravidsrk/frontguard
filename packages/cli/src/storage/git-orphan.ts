/**
 * Git orphan branch baseline storage.
 *
 * Stores baseline screenshots in a dedicated orphan branch that carries
 * no project history, keeping baselines out of the main working tree.
 * All git operations use child_process — no JS git libraries.
 *
 * @module storage/git-orphan
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { BaselineStorage, BaselineManifest, BrowserEngine } from '../core/types.js';
import { emptyBaselineManifest, isNamedMode, parseBaselineManifest } from '../core/fingerprint.js';
export { isNamedMode };
import { logger } from '../utils/logger.js';

const VALID_BROWSERS = new Set<string>(['chromium', 'firefox', 'webkit']);
const NULL_OID = '0000000000000000000000000000000000000000';

/**
 * Buffer ceiling for every git child process (install-2).
 *
 * Node's `execFileSync` defaults to a 1 MiB stdout/stderr buffer. When the
 * orphan-baseline worktree checks out a tree that tracks a large directory
 * (most commonly a committed `node_modules/`), `git rm -rf .` and the worktree
 * checkout emit one line per file — tens of thousands of lines, well past 1 MiB —
 * and the spawn dies with a cryptic `spawnSync git ENOBUFS`. Reading a large
 * baseline PNG via `git show` can also exceed 1 MiB. 64 MiB removes both cliffs.
 */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Builds a user-facing message for a failed git spawn (install-2).
 *
 * ENOBUFS almost always means a huge tracked directory (typically `node_modules/`)
 * was checked out into the baseline worktree, so name that cause explicitly and
 * point at the fix instead of surfacing the raw `spawnSync git ENOBUFS` string.
 */
export function gitSpawnErrorMessage(
  command: string,
  err: unknown,
  cwd: string
): string {
  const e = err as NodeJS.ErrnoException;
  const raw = err instanceof Error ? e.message : String(err);
  const isEnobufs = e?.code === 'ENOBUFS' || /ENOBUFS/.test(raw);
  if (isEnobufs) {
    let hasNodeModules = false;
    try {
      hasNodeModules = existsSync(join(cwd, 'node_modules'));
    } catch {
      // Best-effort detection only.
    }
    const cause = hasNodeModules
      ? 'a tracked node_modules/ directory was checked out into the baseline worktree'
      : 'a very large tracked directory was checked out into the baseline worktree';
    return (
      `git ${command} produced more output than git could buffer — ${cause}. ` +
      'Add "node_modules/" to your .gitignore, untrack it with ' +
      '"git rm -r --cached node_modules", then commit and retry.'
    );
  }
  return `git ${command} failed: ${raw}`;
}

export type GitOrphanStorageMode = 'compare' | 'update';

export interface GitOrphanStorageOptions {
  branch?: string;
  mode?: GitOrphanStorageMode;
  /** Do not fetch origin. `frontguard review` must not make network calls. */
  offline?: boolean;
}

/**
 * Converts a route path to a safe filesystem path for baseline storage.
 *
 * - Strips leading slashes and normalises path traversal attempts
 * - Preserves directory structure for safe characters only
 * - Converts `/` root to `_root`
 *
 * @example
 * sanitizeRoutePath('/checkout/step-1') // => 'checkout/step-1'
 * sanitizeRoutePath('/')                // => '_root'
 * sanitizeRoutePath('../../etc/passwd') // => '____etc_passwd'
 */
function sanitizeRoutePath(route: string): string {
  // Strip leading slashes, collapse path traversal
  let sanitized = route.replace(/^\/+/, '').replace(/\.\./g, '_');
  if (!sanitized || sanitized === '.') sanitized = '_root';
  // Allow only safe characters: alphanumeric, underscore, hyphen, forward slash
  return sanitized.replace(/[^a-zA-Z0-9_\-\/]/g, '_');
}

/**
 * Builds the storage path for a baseline image within the orphan branch.
 *
 * Default mode uses `baselines/<sanitized-route>/<viewport>/<browser>.png`.
 * Named modes use `baselines/<sanitized-route>/<viewport>/<mode>/<browser>.png`.
 */
export function baselineStoragePath(
  route: string,
  viewport: number,
  browser: BrowserEngine,
  mode?: string,
): string {
  if (!VALID_BROWSERS.has(browser)) {
    throw new Error(`Invalid browser engine "${String(browser)}"`);
  }
  if (!Number.isInteger(viewport) || viewport <= 0) {
    throw new Error(`Invalid viewport "${String(viewport)}"`);
  }
  const trimmed = typeof mode === 'string' ? mode.trim() : '';
  if (trimmed.length > 0 && trimmed !== 'default') {
    const safeMode = trimmed.replace(/\.\./g, '_').replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    return `baselines/${sanitizeRoutePath(route)}/${viewport}/${safeMode}/${browser}.png`;
  }
  return `baselines/${sanitizeRoutePath(route)}/${viewport}/${browser}.png`;
}

function baselinePath(
  route: string,
  viewport: number,
  browser: BrowserEngine,
  mode?: string,
): string {
  return baselineStoragePath(route, viewport, browser, mode);
}

function gitErrorOutput(err: unknown): string {
  const error = err as { message?: string; stderr?: string | Buffer };
  const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr;
  return [error.message, stderr].filter(Boolean).join('\n');
}

/**
 * Git orphan branch baseline storage implementation.
 *
 * Stores baseline images and a manifest in a dedicated orphan branch.
 * Uses `git show` for reads (no checkout needed) and a temporary worktree
 * for writes (safe against concurrent working-tree changes).
 *
 * Error handling:
 * - Not a git repo → clear error "frontguard requires a git repository"
 * - Permission denied → error with fix instructions
 * - Concurrent updates → detect, warn, retry once
 * - Branch missing → create only in explicit update mode
 */
export class GitOrphanStorage implements BaselineStorage {
  private readonly repoDir: string;
  private readonly branch: string;
  private readonly mode: GitOrphanStorageMode;
  private readonly offline: boolean;
  private readRef: string | null;
  private initialized = false;

  constructor(
    repoDir: string,
    options: GitOrphanStorageOptions = {},
  ) {
    this.repoDir = repoDir;
    this.branch = options.branch ?? 'frontguard-baselines';
    this.mode = options.mode ?? 'compare';
    this.offline = options.offline === true;
    this.readRef = null;
  }

  // ---------------------------------------------------------------------------
  // Safe git command helpers (shell-injection-proof)
  // ---------------------------------------------------------------------------

  /**
   * Executes a git command synchronously using execFileSync (no shell).
   * Arguments are passed as an array, preventing shell injection.
   * Runs in this.repoDir by default.
   */
  private git(...args: string[]): string {
    return this.gitIn(this.repoDir, ...args);
  }

  /**
   * Executes a git command in a specific directory.
   */
  private gitIn(cwd: string, ...args: string[]): string {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: GIT_MAX_BUFFER,
      }).trim();
    } catch (err: unknown) {
      throw new Error(gitSpawnErrorMessage(args[0] ?? 'command', err, cwd));
    }
  }

  /**
   * Executes a git command and returns the raw Buffer stdout.
   * Used for reading binary blobs (PNG files) from the tree.
   */
  private gitBuffer(...args: string[]): Buffer {
    return execFileSync('git', args, {
      cwd: this.repoDir,
      timeout: 30_000,
      maxBuffer: GIT_MAX_BUFFER,
    });
  }

  /**
   * Checks whether a git command succeeds (exit code 0).
   */
  private gitCheck(...args: string[]): boolean {
    try {
      execFileSync('git', args, {
        cwd: this.repoDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
        maxBuffer: GIT_MAX_BUFFER,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks whether a git command succeeds in a specific directory.
   */
  private gitCheckIn(cwd: string, ...args: string[]): boolean {
    try {
      execFileSync('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
        maxBuffer: GIT_MAX_BUFFER,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Initialise the orphan branch storage.
   *
   * 1. Verify we're inside a git repository.
   * 2. Fetch the baseline branch from origin when it exists remotely.
   * 3. Pin comparisons to an immutable commit without changing local state.
   * 4. Create a missing branch only for explicit baseline updates.
   */
  async init(): Promise<void> {
    // Re-initialization must not leave stale state readable after a failed refresh.
    this.initialized = false;
    this.readRef = null;

    // Verify git repo
    if (!this.gitCheck('rev-parse', '--is-inside-work-tree')) {
      throw new Error(
        'frontguard requires a git repository. ' +
          'Run "git init" or clone your project first.'
      );
    }

    // Refresh/adopt the remote branch before reading. A stale or missing local
    // ref silently turns accepted screenshots into CHANGED or NEW results.
    const hasLocalBranch = this.branchExists();
    const ciValue = process.env.CI?.trim().toLowerCase();
    const isCI = ciValue !== undefined && !['', '0', 'false', 'no', 'off'].includes(ciValue);
    const strictCIComparison = isCI && this.mode === 'compare' && !this.offline;
    const hasOrigin = this.gitCheck('remote', 'get-url', 'origin');
    if (strictCIComparison && !hasOrigin) {
      throw new Error(
        `CI comparison requires origin/${this.branch}; no "origin" remote is configured.`,
      );
    }

    if (hasOrigin && !this.offline) {
      try {
        if (this.remoteBranchExists()) {
          const remoteCommit = this.fetchRemoteBranch();
          if (this.mode === 'update') {
            this.syncLocalBranch(remoteCommit);
            this.readRef = this.branch;
          } else {
            this.readRef = this.comparisonReadRef(remoteCommit, strictCIComparison);
          }
        } else if (strictCIComparison) {
          throw new Error(
            `Published baseline branch origin/${this.branch} does not exist. ` +
              'CI comparison refuses to use local baseline state.',
          );
        }
      } catch (err) {
        // Local development can continue offline with an existing baseline.
        // CI must fail closed rather than compare against stale screenshots.
        if (strictCIComparison || !hasLocalBranch || isCI) throw err;
        logger.warn(
          `Could not refresh origin/${this.branch}; using the existing local baseline branch`
        );
        this.readRef = this.mode === 'update'
          ? this.branch
          : this.git('rev-parse', this.branch);
      }
    }

    if (this.readRef === null && this.branchExists()) {
      this.readRef = this.mode === 'update'
        ? this.branch
        : this.git('rev-parse', this.branch);
    }

    // Comparison mode is read-only. A missing branch means every capture is
    // new, but must not create or commit baseline state.
    if (this.mode === 'update' && !this.branchExists()) {
      logger.info(`Creating orphan branch "${this.branch}" for baseline storage`);
      await this.createOrphanBranch();
      this.readRef = this.branch;
    }

    this.initialized = true;
    logger.debug(`Git orphan storage initialized on branch "${this.branch}"`);
  }

  /**
   * Read a baseline image from the orphan branch without checkout.
   * Uses `git show <branch>:<path>` for zero-impact reads.
   *
   * @returns Buffer containing the PNG data, or null if not found
   */
  async readBaseline(
    route: string,
    viewport: number,
    browser: BrowserEngine,
    mode?: string,
  ): Promise<Buffer | null> {
    this.ensureInitialized();
    const path = baselinePath(route, viewport, browser, mode);
    if (this.readRef === null) return null;

    try {
      return this.gitBuffer('show', `${this.readRef}:${path}`);
    } catch (err) {
      const output = gitErrorOutput(err);
      if (/fatal:\s+path ['"].+['"] does not exist in/i.test(output)) return null;
      if (/exists on disk, but not in/i.test(output)) return null;
      throw new Error(
        `Could not read baseline "${path}" from "${this.readRef}": ` +
          gitSpawnErrorMessage('show', err, this.repoDir),
      );
    }
  }

  /**
   * Read or write a text file beside the PNG. Omit `body` to read.
   * A missing read returns null. `body` may be an empty string.
   */
  async textFile(
    route: string,
    viewport: number,
    browser: BrowserEngine,
    suffix: string,
    body?: string,
    mode?: string,
  ): Promise<string | null> {
    this.ensureInitialized();
    if (!/^\.(aria\.txt|json|md)$/.test(suffix)) throw new Error('Unknown text snapshot');
    const path = baselinePath(route, viewport, browser, mode).replace(/\.png$/, suffix);
    if (body === undefined) {
      if (this.readRef === null) return null;
      try {
        return this.gitBuffer('show', `${this.readRef}:${path}`).toString('utf8');
      } catch (err) {
        const output = gitErrorOutput(err);
        if (/does not exist in|exists on disk, but not in/i.test(output)) return null;
        throw err;
      }
    }
    this.ensureWritable();
    await this.writeToOrphanBranch((dir) => {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }, `text ${sanitizeRoutePath(route)}`);
    return null;
  }

  /**
   * Write a baseline image to the orphan branch.
   *
   * Uses a temporary git worktree to safely modify the orphan branch
   * without touching the user's working directory. Includes retry
   * logic for concurrent update detection.
   */
  async writeBaseline(
    route: string,
    viewport: number,
    browser: BrowserEngine,
    buffer: Buffer,
    mode?: string,
  ): Promise<void> {
    this.ensureInitialized();
    this.ensureWritable();
    const path = baselinePath(route, viewport, browser, mode);

    await this.writeToOrphanBranch(
      (wt) => {
        const fullPath = join(wt, path);
        if (existsSync(fullPath)) {
          try {
            if (readFileSync(fullPath).equals(buffer)) {
              return;
            }
          } catch {
            // Proceed with write on read failure
          }
        }
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, buffer);
      },
      `Update baseline: ${sanitizeRoutePath(route)} @ ${viewport}px [${browser}]`,
    );
  }

  /**
   * Write multiple baseline images, optional sibling text snapshots, and an
   * optional manifest in a single worktree transaction and single commit.
   */
  async writeBaselines(
    entries: Array<{
      route: string;
      viewport: number;
      browser?: BrowserEngine;
      mode?: string;
      buffer: Buffer;
    }>,
    manifest?: BaselineManifest,
    textFiles?: Array<{
      route: string;
      viewport: number;
      browser?: BrowserEngine;
      mode?: string;
      suffix: string;
      body: string;
    }>,
  ): Promise<void> {
    this.ensureInitialized();
    this.ensureWritable();
    const texts = textFiles ?? [];
    for (const item of texts) {
      if (!/^\.(aria\.txt|json|md)$/.test(item.suffix)) {
        throw new Error('Unknown text snapshot');
      }
    }
    if (entries.length === 0 && texts.length === 0 && !manifest) return;

    await this.writeToOrphanBranch(
      (wt) => {
        for (const entry of entries) {
          const browser = entry.browser ?? 'chromium';
          const path = baselinePath(entry.route, entry.viewport, browser, entry.mode);
          const fullPath = join(wt, path);
          if (existsSync(fullPath)) {
            try {
              if (readFileSync(fullPath).equals(entry.buffer)) {
                continue;
              }
            } catch {
              // Proceed with write on read failure
            }
          }
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, entry.buffer);
        }
        for (const item of texts) {
          const browser = item.browser ?? 'chromium';
          const path = baselinePath(item.route, item.viewport, browser, item.mode).replace(/\.png$/, item.suffix);
          const fullPath = join(wt, path);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, item.body);
        }
        if (manifest) {
          const manifestPath = join(wt, 'manifest.json');
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }
      },
      `Update ${entries.length} baseline(s)`,
    );
  }

  /**
   * Read the baseline manifest from the orphan branch.
   * Uses `git show` — no checkout required.
   *
   * @returns Parsed BaselineManifest or null if not found/invalid
   */
  async readManifest(): Promise<BaselineManifest | null> {
    this.ensureInitialized();
    if (this.readRef === null) return null;

    try {
      const raw = this.git('show', `${this.readRef}:manifest.json`);
      return parseBaselineManifest(raw);
    } catch {
      return null;
    }
  }

  /**
   * Write the baseline manifest to the orphan branch.
   */
  async writeManifest(manifest: BaselineManifest): Promise<void> {
    this.ensureInitialized();
    this.ensureWritable();

    await this.writeToOrphanBranch(
      (wt) => {
        const manifestPath = join(wt, 'manifest.json');
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      },
      'Update baseline manifest'
    );
  }

  /**
   * Check whether any baselines exist (orphan branch exists and has files).
   */
  async hasBaselines(): Promise<boolean> {
    this.ensureInitialized();
    if (this.readRef === null) return false;

    try {
      // Check if the branch has any baselines/ entries
      const tree = this.git('ls-tree', '--name-only', this.readRef);
      return tree.includes('baselines');
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks if the orphan branch exists locally.
   */
  private branchExists(): boolean {
    return this.gitCheck('rev-parse', '--verify', this.branch);
  }

  /** Checks for the branch without confusing network/auth failures with absence. */
  private remoteBranchExists(): boolean {
    try {
      execFileSync(
        'git',
        ['ls-remote', '--exit-code', '--heads', 'origin', this.branch],
        {
          cwd: this.repoDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30_000,
          maxBuffer: GIT_MAX_BUFFER,
        },
      );
      return true;
    } catch (err) {
      if ((err as { status?: number }).status === 2) return false;
      throw new Error(
        `Could not check origin/${this.branch}: ${gitSpawnErrorMessage('ls-remote', err, this.repoDir)}`
      );
    }
  }

  /** Fetches the remote tip into its tracking ref without moving a local branch. */
  private fetchRemoteBranch(): string {
    const remoteRef = `refs/remotes/origin/${this.branch}`;
    this.git(
      'fetch',
      '--no-tags',
      'origin',
      `+refs/heads/${this.branch}:${remoteRef}`,
    );

    return this.git('rev-parse', remoteRef);
  }

  /** Chooses an immutable comparison ref while preserving unpublished local work. */
  private comparisonReadRef(remoteCommit: string, strictCIComparison: boolean): string {
    const remoteRef = `refs/remotes/origin/${this.branch}`;
    if (!this.branchExists()) return remoteCommit;

    const localCommit = this.git('rev-parse', this.branch);
    if (localCommit === remoteCommit) return remoteCommit;

    if (this.gitCheck('merge-base', '--is-ancestor', this.branch, remoteRef)) {
      return remoteCommit;
    }

    if (this.gitCheck('merge-base', '--is-ancestor', remoteRef, this.branch)) {
      if (strictCIComparison) {
        throw new Error(
          `Local baseline branch "${this.branch}" is ahead of origin/${this.branch}. ` +
            'CI comparison refuses unpublished baseline commits.',
        );
      }
      logger.debug(`Using unpublished local baseline branch "${this.branch}"`);
      return localCommit;
    }

    throw new Error(
      `Local baseline branch "${this.branch}" has diverged from origin/${this.branch}. ` +
        'Publish or reconcile the baseline branch before running Frontguard.',
    );
  }

  /** Adopts or fast-forwards the local branch for an explicit update. */
  private syncLocalBranch(remoteCommit: string): void {
    const remoteRef = `refs/remotes/origin/${this.branch}`;

    if (!this.branchExists()) {
      // `git branch --track` rejects explicitly fetched refs in single-branch
      // shallow clones, so create the branch directly and configure tracking.
      this.git('branch', this.branch, remoteRef);
      this.git('config', `branch.${this.branch}.remote`, 'origin');
      this.git('config', `branch.${this.branch}.merge`, `refs/heads/${this.branch}`);
      logger.debug(`Adopted baseline branch from origin/${this.branch}`);
      return;
    }

    const localCommit = this.git('rev-parse', this.branch);
    if (localCommit === remoteCommit) return;

    if (this.gitCheck('merge-base', '--is-ancestor', this.branch, remoteRef)) {
      this.git('branch', '--force', this.branch, remoteRef);
      logger.debug(`Fast-forwarded baseline branch from origin/${this.branch}`);
      return;
    }

    if (this.gitCheck('merge-base', '--is-ancestor', remoteRef, this.branch)) {
      logger.debug(`Local baseline branch is ahead of origin/${this.branch}`);
      return;
    }

    throw new Error(
      `Local baseline branch "${this.branch}" has diverged from origin/${this.branch}. ` +
        `Publish or reconcile the baseline branch before running Frontguard.`
    );
  }

  /**
   * Creates the initial orphan branch with an empty manifest.
   *
   * Strategy: use a temporary worktree to avoid disturbing the current
   * working directory. Falls back to checkout-based approach if worktree
   * is not available (very old git).
   */
  private async createOrphanBranch(): Promise<void> {
    // A newly initialized repository has no HEAD for `git worktree add` to
    // detach from. Seed the orphan commit in an isolated temporary repository.
    if (!this.gitCheck('rev-parse', '--verify', 'HEAD')) {
      await this.createOrphanFromTemporaryRepository();
      return;
    }

    // Try worktree approach first (safer — never touches main working tree)
    if (this.supportsWorktree()) {
      await this.createOrphanViaWorktree();
    } else {
      // The legacy checkout fallback touches the main working tree and cannot
      // safely preserve uncommitted changes. Modern Git takes the path above.
      const status = this.git('status', '--porcelain');
      if (status.length > 0) {
        throw new Error(
          'Working tree has uncommitted changes. Commit or stash before updating baselines.'
        );
      }
      // Get the current branch/ref to restore after checkout-based fallback
      let originalRef: string;
      try {
        originalRef = this.git('symbolic-ref', '--short', 'HEAD');
      } catch {
        // Detached HEAD
        originalRef = this.git('rev-parse', 'HEAD');
      }
      await this.createOrphanViaCheckout(originalRef);
    }
  }

  /** Creates the initial branch without requiring a commit in the user's repo. */
  private async createOrphanFromTemporaryRepository(): Promise<void> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'frontguard-seed-'));

    try {
      this.gitIn(tmpDir, 'init', '--quiet', `--initial-branch=${this.branch}`);
      this.gitIn(tmpDir, 'config', 'user.name', 'Frontguard');
      this.gitIn(tmpDir, 'config', 'user.email', 'frontguard@users.noreply.github.com');
      this.gitIn(tmpDir, 'config', 'commit.gpgsign', 'false');

      const manifest: BaselineManifest = emptyBaselineManifest();
      writeFileSync(
        join(tmpDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
      );
      this.gitIn(tmpDir, 'add', 'manifest.json');
      this.gitIn(tmpDir, 'commit', '--quiet', '-m', 'Initialize frontguard baselines');

      this.git(
        'fetch',
        tmpDir,
        `refs/heads/${this.branch}:refs/heads/${this.branch}`,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private cleanupWorktree(scratch: string, wt: string): void {
    try {
      this.git('worktree', 'remove', wt, '--force');
    } catch {
      if (existsSync(wt)) {
        try {
          rmSync(wt, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup
        }
      }
      try {
        this.git('worktree', 'prune');
      } catch {
        // Non-fatal
      }
    }
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Create orphan branch using a detached worktree + atomic ref creation so
   * `this.branch` is never checked out or locked out across crashes.
   */
  private async createOrphanViaWorktree(): Promise<void> {
    const scratch = mkdtempSync(join(tmpdir(), 'frontguard-init-'));
    chmodSync(scratch, 0o700);
    const wt = join(scratch, 'wt');

    try {
      this.git('worktree', 'add', '--detach', '--no-checkout', wt);
      this.gitIn(wt, 'read-tree', '--empty');

      const manifest: BaselineManifest = emptyBaselineManifest();
      writeFileSync(
        join(wt, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
      );

      this.gitIn(wt, 'add', 'manifest.json');
      const tree = this.gitIn(wt, 'write-tree');
      const commit = this.gitIn(
        wt,
        '-c',
        'user.name=Frontguard',
        '-c',
        'user.email=frontguard@local',
        '-c',
        'commit.gpgsign=false',
        'commit-tree',
        tree,
        '-m',
        'Initialize frontguard baselines',
      );
      try {
        this.git('update-ref', `refs/heads/${this.branch}`, commit, NULL_OID);
      } catch (err) {
        if (!this.branchExists()) throw err;
      }
    } finally {
      this.cleanupWorktree(scratch, wt);
    }
  }

  /**
   * Create orphan branch via checkout (fallback for old git versions).
   *
   * ⚠️  This touches the main working tree. Used only when git worktree
   * is unavailable. The working tree is restored to originalRef after.
   */
  private async createOrphanViaCheckout(originalRef: string): Promise<void> {
    try {
      this.git('checkout', '--orphan', this.branch);
      this.git('rm', '-rf', '.');

      const manifest: BaselineManifest = emptyBaselineManifest();
      writeFileSync(
        join(this.repoDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      );

      this.git('add', 'manifest.json');
      this.git(
        '-c',
        'user.name=Frontguard',
        '-c',
        'user.email=frontguard@local',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'Initialize frontguard baselines',
      );
      this.git('checkout', originalRef);
    } catch (err) {
      // Attempt recovery
      try {
        this.git('checkout', originalRef);
      } catch {
        logger.warn('Could not switch back to original branch automatically');
      }
      throw err;
    }
  }

  /**
   * Performs a write operation on the orphan branch using a temporary worktree.
   *
   * This is the safest approach: the user's working tree is never touched.
   * Includes retry logic for concurrent update detection.
   *
   * @param writeFn - Callback that receives the worktree directory to write files into
   * @param commitMessage - Commit message for the change
   */
  private async writeToOrphanBranch(
    writeFn: (wt: string) => void,
    commitMessage: string
  ): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const scratch = mkdtempSync(join(tmpdir(), 'frontguard-wt-'));
      chmodSync(scratch, 0o700);
      const wt = join(scratch, 'wt');
      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        this.cleanupWorktree(scratch, wt);
      };
      const onSignal = (sig: NodeJS.Signals): void => {
        cleanup();
        process.kill(process.pid, sig);
      };
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);

      try {
        const expectedTip = this.git('rev-parse', `refs/heads/${this.branch}`);

        // Detached worktree inside private 0700 dir: no /tmp TOCTOU and never locks the branch ref
        this.git('worktree', 'add', '--detach', wt, expectedTip);

        // Apply the write operation
        writeFn(wt);

        // Stage and commit from the worktree. Callers decide when to push the branch.
        this.gitIn(wt, 'add', '-A');

        // Check if there are changes to commit
        if (this.gitCheckIn(wt, 'diff', '--cached', '--quiet')) {
          logger.debug('No changes to commit to baseline branch');
          return;
        }

        this.gitIn(
          wt,
          '-c',
          'user.name=Frontguard',
          '-c',
          'user.email=frontguard@local',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          commitMessage,
        );
        const nextTip = this.gitIn(wt, 'rev-parse', 'HEAD');

        // Atomic compare-and-swap update so concurrent writes retry instead of colliding
        this.git('update-ref', `refs/heads/${this.branch}`, nextTip, expectedTip);
        logger.debug(`Committed to ${this.branch}: ${commitMessage}`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Detect concurrent update / CAS conflicts
        if (
          msg.includes('lock') ||
          msg.includes('index.lock') ||
          msg.includes('cannot lock') ||
          msg.includes('but expected')
        ) {
          if (attempt < maxAttempts) {
            logger.warn(
              `Concurrent update detected on "${this.branch}", retrying (attempt ${attempt}/${maxAttempts})...`
            );
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
            continue;
          }
        }

        // Permission denied
        if (msg.includes('Permission denied') || msg.includes('EACCES')) {
          throw new Error(
            `Permission denied writing to git orphan branch "${this.branch}". ` +
              `Ensure the repository directory is writable: chmod -R u+w "${this.repoDir}"`
          );
        }

        throw new Error(`Failed to write baseline: ${msg}`);
      } finally {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        cleanup();
      }
    }
  }

  /**
   * Checks if `git worktree` is supported.
   */
  private supportsWorktree(): boolean {
    return this.gitCheck('worktree', 'list');
  }

  /**
   * Guards against using storage before init() is called.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'GitOrphanStorage not initialized. Call init() before reading or writing baselines.'
      );
    }
  }

  private ensureWritable(): void {
    if (this.mode !== 'update') {
      throw new Error('Baseline writes require explicit update mode.');
    }
  }
}

export { sanitizeRoutePath };
