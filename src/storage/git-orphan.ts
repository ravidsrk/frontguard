/**
 * Git orphan branch baseline storage.
 *
 * Stores baseline screenshots in a dedicated orphan branch that carries
 * no project history, keeping baselines out of the main working tree.
 * All git operations use child_process — no JS git libraries.
 *
 * @module storage/git-orphan
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import type { BaselineStorage, BaselineManifest, BrowserEngine } from '../core/types.js';
import { logger } from '../utils/logger.js';

/**
 * Converts a route path to a safe filesystem path for baseline storage.
 *
 * - Strips leading slash
 * - Preserves directory structure
 * - Converts `/` root to `_root`
 *
 * @example
 * sanitizeRoutePath('/checkout/step-1') // => 'checkout/step-1'
 * sanitizeRoutePath('/')                // => '_root'
 */
function sanitizeRoutePath(route: string): string {
  if (route === '/') return '_root';
  // Strip leading slash, keep internal structure
  let sanitized = route.startsWith('/') ? route.slice(1) : route;
  // Remove trailing slash
  if (sanitized.endsWith('/')) {
    sanitized = sanitized.slice(0, -1);
  }
  // Replace any characters unsafe for paths
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  return sanitized;
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
 * Executes a git command synchronously in the given directory.
 * Returns stdout as a trimmed string.
 *
 * @throws Error with descriptive message on failure
 */
function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? (err as NodeJS.ErrnoException).message : String(err);
    throw new Error(`git ${args.split(' ')[0]} failed: ${message}`);
  }
}

/**
 * Executes a git command and returns the raw Buffer stdout.
 * Used for reading binary blobs (PNG files) from the tree.
 */
function gitBuffer(args: string, cwd: string): Buffer {
  return execSync(`git ${args}`, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

/**
 * Checks whether a git command succeeds (exit code 0).
 */
function gitCheck(args: string, cwd: string): boolean {
  try {
    execSync(`git ${args}`, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
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
    if (!gitCheck('rev-parse --is-inside-work-tree', this.repoDir)) {
      throw new Error(
        'frontguard requires a git repository. ' +
          'Run "git init" or clone your project first.'
      );
    }

    // Handle shallow clones
    const isShallow = git('rev-parse --is-shallow-repository', this.repoDir);
    if (isShallow === 'true') {
      logger.debug('Shallow clone detected — fetching orphan branch');
      try {
        git(`fetch origin ${this.branch} --depth=1`, this.repoDir);
        // Create local tracking branch if fetch succeeded
        if (!this.branchExists()) {
          git(`branch ${this.branch} FETCH_HEAD`, this.repoDir);
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
      return gitBuffer(`show ${this.branch}:${path}`, this.repoDir);
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
      const raw = git(`show ${this.branch}:manifest.json`, this.repoDir);
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
      const tree = git(`ls-tree --name-only ${this.branch}`, this.repoDir);
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
    return gitCheck(`rev-parse --verify ${this.branch}`, this.repoDir);
  }

  /**
   * Creates the initial orphan branch with an empty manifest.
   *
   * Strategy: use a temporary worktree to avoid disturbing the current
   * working directory. Falls back to checkout-based approach if worktree
   * is not available (very old git).
   */
  private async createOrphanBranch(): Promise<void> {
    const tmpDir = join(tmpdir(), `frontguard-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    try {
      // Get the current branch/ref to restore later
      let originalRef: string;
      try {
        originalRef = git('symbolic-ref --short HEAD', this.repoDir);
      } catch {
        // Detached HEAD
        originalRef = git('rev-parse HEAD', this.repoDir);
      }

      // Try worktree approach first (safer)
      if (this.supportsWorktree()) {
        await this.createOrphanViaWorktree(tmpDir);
      } else {
        await this.createOrphanViaCheckout(originalRef);
      }
    } finally {
      // Clean up temp dir
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Create orphan branch using git worktree (preferred, non-destructive).
   */
  private async createOrphanViaWorktree(tmpDir: string): Promise<void> {
    try {
      // Create orphan branch
      git(`checkout --orphan ${this.branch}`, this.repoDir);
      git('rm -rf .', this.repoDir);

      // Write initial manifest
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

      git('add manifest.json', this.repoDir);
      git('commit -m "Initialize frontguard baselines"', this.repoDir);

      // Switch back to original branch
      let originalRef: string;
      try {
        // The orphan creation detaches us, so get original from reflog
        const reflog = git('reflog show --format=%gs -1 HEAD@{1}', this.repoDir);
        // Try to find original branch from stash or just use main/master
        originalRef = this.findDefaultBranch();
      } catch {
        originalRef = this.findDefaultBranch();
      }

      git(`checkout ${originalRef}`, this.repoDir);
    } catch (err) {
      // If checkout fails, try to recover
      const defaultBranch = this.findDefaultBranch();
      try {
        git(`checkout ${defaultBranch}`, this.repoDir);
      } catch {
        // Last resort
        logger.warn('Could not switch back to original branch automatically');
      }
      throw err;
    }
  }

  /**
   * Create orphan branch via checkout (fallback for old git versions).
   */
  private async createOrphanViaCheckout(originalRef: string): Promise<void> {
    try {
      git(`checkout --orphan ${this.branch}`, this.repoDir);
      git('rm -rf .', this.repoDir);

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

      git('add manifest.json', this.repoDir);
      git('commit -m "Initialize frontguard baselines"', this.repoDir);
      git(`checkout ${originalRef}`, this.repoDir);
    } catch (err) {
      // Attempt recovery
      try {
        git(`checkout ${originalRef}`, this.repoDir);
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
      const worktreeDir = join(
        tmpdir(),
        `frontguard-wt-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );

      try {
        // Add a temporary worktree for the orphan branch
        git(`worktree add "${worktreeDir}" ${this.branch}`, this.repoDir);

        // Apply the write operation
        writeFn(worktreeDir);

        // Stage, commit, and push from the worktree
        git('add -A', worktreeDir);

        // Check if there are changes to commit
        if (gitCheck('diff --cached --quiet', worktreeDir)) {
          logger.debug('No changes to commit to baseline branch');
          return;
        }

        git(`commit -m "${commitMessage}"`, worktreeDir);
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
          git(`worktree remove "${worktreeDir}" --force`, this.repoDir);
        } catch {
          // Manual cleanup if worktree remove fails
          if (existsSync(worktreeDir)) {
            rmSync(worktreeDir, { recursive: true, force: true });
          }
          // Prune stale worktree references
          try {
            git('worktree prune', this.repoDir);
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
    return gitCheck('worktree list', this.repoDir);
  }

  /**
   * Finds the default branch (main, master, or whatever HEAD points to).
   */
  private findDefaultBranch(): string {
    // Try symbolic ref first
    try {
      return git('symbolic-ref --short HEAD', this.repoDir);
    } catch {
      // Detached HEAD or orphan — check for common defaults
    }

    for (const branch of ['main', 'master', 'develop']) {
      if (gitCheck(`rev-parse --verify ${branch}`, this.repoDir)) {
        return branch;
      }
    }

    // Last resort: try to get from remote
    try {
      const remote = git('remote show origin', this.repoDir);
      const match = remote.match(/HEAD branch:\s*(\S+)/);
      if (match) return match[1];
    } catch {
      // No remote configured
    }

    throw new Error(
      'Could not determine default branch. ' +
        'Ensure you have at least one commit on main or master.'
    );
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
