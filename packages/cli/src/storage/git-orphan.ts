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
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { BaselineStorage, BaselineManifest, BrowserEngine } from '../core/types.js';
import { logger } from '../utils/logger.js';

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
 * Format: `baselines/<sanitized-route>/<viewport>/<browser>.png`
 */
function baselinePath(route: string, viewport: number, browser: BrowserEngine): string {
  return `baselines/${sanitizeRoutePath(route)}/${viewport}/${browser}.png`;
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
 * - Branch missing → auto-create on first `init()`
 */
export class GitOrphanStorage implements BaselineStorage {
  private readonly repoDir: string;
  private readonly branch: string;
  private initialized = false;

  constructor(repoDir: string, branch = 'frontguard-baselines') {
    this.repoDir = repoDir;
    this.branch = branch;
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
   * 2. Handle shallow clones — fetch the branch with depth=1.
   * 3. If the orphan branch doesn't exist yet, create it with an
   *    empty manifest commit and switch back to the original branch.
   */
  async init(): Promise<void> {
    // Verify git repo
    if (!this.gitCheck('rev-parse', '--is-inside-work-tree')) {
      throw new Error(
        'frontguard requires a git repository. ' +
          'Run "git init" or clone your project first.'
      );
    }

    // Handle shallow clones
    const isShallow = this.git('rev-parse', '--is-shallow-repository');
    if (isShallow === 'true') {
      logger.debug('Shallow clone detected — fetching orphan branch');
      try {
        this.git('fetch', 'origin', this.branch, '--depth=1');
        // Create local tracking branch if fetch succeeded
        if (!this.branchExists()) {
          this.git('branch', this.branch, 'FETCH_HEAD');
        }
      } catch {
        logger.debug('Branch not on remote yet (shallow), will create locally');
      }
    }

    // Create the orphan branch if it doesn't exist
    if (!this.branchExists()) {
      logger.info(`Creating orphan branch "${this.branch}" for baseline storage`);
      await this.createOrphanBranch();
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
    browser: BrowserEngine
  ): Promise<Buffer | null> {
    this.ensureInitialized();
    const path = baselinePath(route, viewport, browser);

    try {
      return this.gitBuffer('show', `${this.branch}:${path}`);
    } catch {
      return null;
    }
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
    buffer: Buffer
  ): Promise<void> {
    this.ensureInitialized();
    const path = baselinePath(route, viewport, browser);

    await this.writeToOrphanBranch(
      (worktreeDir) => {
        const fullPath = join(worktreeDir, path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, buffer);
      },
      `Update baseline: ${sanitizeRoutePath(route)} @ ${viewport}px [${browser}]`
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

    try {
      const raw = this.git('show', `${this.branch}:manifest.json`);
      return JSON.parse(raw) as BaselineManifest;
    } catch {
      return null;
    }
  }

  /**
   * Write the baseline manifest to the orphan branch.
   */
  async writeManifest(manifest: BaselineManifest): Promise<void> {
    this.ensureInitialized();

    await this.writeToOrphanBranch(
      (worktreeDir) => {
        const manifestPath = join(worktreeDir, 'manifest.json');
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      },
      'Update baseline manifest'
    );
  }

  /**
   * Check whether any baselines exist (orphan branch exists and has files).
   */
  async hasBaselines(): Promise<boolean> {
    if (!this.branchExists()) return false;

    try {
      // Check if the branch has any baselines/ entries
      const tree = this.git('ls-tree', '--name-only', this.branch);
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

  /**
   * Creates the initial orphan branch with an empty manifest.
   *
   * Strategy: use a temporary worktree to avoid disturbing the current
   * working directory. Falls back to checkout-based approach if worktree
   * is not available (very old git).
   */
  private async createOrphanBranch(): Promise<void> {
    // Guard: refuse to create orphan branch if working tree is dirty
    const status = this.git('status', '--porcelain');
    if (status.length > 0) {
      throw new Error(
        'Working tree has uncommitted changes. Commit or stash before updating baselines.'
      );
    }

    // Try worktree approach first (safer — never touches main working tree)
    if (this.supportsWorktree()) {
      await this.createOrphanViaWorktree();
    } else {
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

  /**
   * Create orphan branch using git worktree (preferred, non-destructive).
   *
   * All destructive operations (checkout --orphan, rm -rf) happen inside
   * a temporary worktree directory — the main working tree is never touched.
   */
  private async createOrphanViaWorktree(): Promise<void> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'frontguard-init-'));

    try {
      // Add a detached worktree in the temp directory
      this.git('worktree', 'add', '--detach', tmpDir);

      // Inside the worktree, create the orphan branch
      this.gitIn(tmpDir, 'checkout', '--orphan', this.branch);
      this.gitIn(tmpDir, 'rm', '-rf', '.');

      // Write initial manifest into the temp worktree
      const manifest: BaselineManifest = {
        schemaVersion: 1,
        createdBy: 'frontguard@0.1.0',
        updatedAt: new Date().toISOString(),
        routes: {},
      };
      writeFileSync(
        join(tmpDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      );

      this.gitIn(tmpDir, 'add', 'manifest.json');
      this.gitIn(tmpDir, 'commit', '-m', 'Initialize frontguard baselines');
    } finally {
      // Always clean up the worktree
      try {
        this.git('worktree', 'remove', tmpDir, '--force');
      } catch {
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true, force: true });
        }
        try {
          this.git('worktree', 'prune');
        } catch {
          // Non-fatal
        }
      }
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

      const manifest: BaselineManifest = {
        schemaVersion: 1,
        createdBy: 'frontguard@0.1.0',
        updatedAt: new Date().toISOString(),
        routes: {},
      };
      writeFileSync(
        join(this.repoDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      );

      this.git('add', 'manifest.json');
      this.git('commit', '-m', 'Initialize frontguard baselines');
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
    writeFn: (worktreeDir: string) => void,
    commitMessage: string
  ): Promise<void> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const worktreeDir = mkdtempSync(join(tmpdir(), 'frontguard-wt-'));

      try {
        // Remove the empty temp dir so git worktree can create it
        rmSync(worktreeDir, { recursive: true, force: true });

        // Add a temporary worktree for the orphan branch
        this.git('worktree', 'add', worktreeDir, this.branch);

        // Apply the write operation
        writeFn(worktreeDir);

        // Stage, commit, and push from the worktree
        this.gitIn(worktreeDir, 'add', '-A');

        // Check if there are changes to commit
        if (this.gitCheckIn(worktreeDir, 'diff', '--cached', '--quiet')) {
          logger.debug('No changes to commit to baseline branch');
          return;
        }

        this.gitIn(worktreeDir, 'commit', '-m', commitMessage);
        logger.debug(`Committed to ${this.branch}: ${commitMessage}`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Detect concurrent update conflicts
        if (msg.includes('lock') || msg.includes('index.lock') || msg.includes('cannot lock')) {
          if (attempt < maxAttempts) {
            logger.warn(
              `Concurrent update detected on "${this.branch}", retrying (attempt ${attempt}/${maxAttempts})...`
            );
            // Brief wait before retry
            await new Promise((resolve) => setTimeout(resolve, 500));
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
        // Always clean up the worktree
        try {
          this.git('worktree', 'remove', worktreeDir, '--force');
        } catch {
          // Manual cleanup if worktree remove fails
          if (existsSync(worktreeDir)) {
            rmSync(worktreeDir, { recursive: true, force: true });
          }
          // Prune stale worktree references
          try {
            this.git('worktree', 'prune');
          } catch {
            // Non-fatal
          }
        }
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
}

export { sanitizeRoutePath };
