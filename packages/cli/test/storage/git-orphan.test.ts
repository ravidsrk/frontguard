import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sanitizeRoutePath,
  GitOrphanStorage,
  gitSpawnErrorMessage,
} from '../../src/storage/git-orphan.js';

describe('sanitizeRoutePath', () => {
  it('strips leading slash from normal routes', () => {
    expect(sanitizeRoutePath('/checkout/step-1')).toBe('checkout/step-1');
  });

  it('converts root path / to _root', () => {
    expect(sanitizeRoutePath('/')).toBe('_root');
  });

  it('sanitizes path traversal attempts', () => {
    const result = sanitizeRoutePath('../../etc/passwd');
    expect(result).not.toContain('..');
    // No path traversal should survive
    expect(result).not.toMatch(/\.\./);
    // Should produce something like: ____etc_passwd
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });

  it('converts empty string to _root', () => {
    expect(sanitizeRoutePath('')).toBe('_root');
  });

  it('strips special characters', () => {
    const result = sanitizeRoutePath('/hello?foo=bar&baz=1');
    // ? = & should be replaced with _
    expect(result).not.toContain('?');
    expect(result).not.toContain('=');
    expect(result).not.toContain('&');
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });

  it('converts single dot to _root', () => {
    expect(sanitizeRoutePath('.')).toBe('_root');
  });

  it('handles route with hyphens and underscores', () => {
    expect(sanitizeRoutePath('/my-route/sub_page')).toBe('my-route/sub_page');
  });

  it('strips multiple leading slashes', () => {
    expect(sanitizeRoutePath('///foo')).toBe('foo');
  });

  it('handles deeply nested paths', () => {
    expect(sanitizeRoutePath('/a/b/c/d/e')).toBe('a/b/c/d/e');
  });

  it('handles URL-encoded characters', () => {
    const result = sanitizeRoutePath('/hello%20world');
    // % should be replaced with _
    expect(result).not.toContain('%');
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });
});

describe('GitOrphanStorage', () => {
  it('can be instantiated without throwing', () => {
    // Use a temporary path — we're not calling init() so no git ops happen
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    expect(storage).toBeDefined();
    expect(storage).toBeInstanceOf(GitOrphanStorage);
  });

  it('can be instantiated with a custom branch name', () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo', 'my-baselines');
    expect(storage).toBeDefined();
  });

  it('throws if readBaseline is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.readBaseline('/test', 1440, 'chromium')).rejects.toThrow('not initialized');
  });

  it('throws if writeBaseline is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.writeBaseline('/test', 1440, 'chromium', Buffer.from('png'))).rejects.toThrow('not initialized');
  });

  it('throws if readManifest is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.readManifest()).rejects.toThrow('not initialized');
  });

  it('throws if writeManifest is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    const manifest = {
      schemaVersion: 1,
      createdBy: 'test',
      updatedAt: new Date().toISOString(),
      routes: {},
    };
    await expect(storage.writeManifest(manifest)).rejects.toThrow('not initialized');
  });
});

/**
 * Regression coverage for install-2: a git spawn whose output overflows the
 * buffer must NOT surface the cryptic `spawnSync git ENOBUFS`, and the per-spawn
 * buffer must be large enough that reading/writing real baselines never hits the
 * 1 MiB Node default in the first place.
 */
describe('gitSpawnErrorMessage (install-2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-git-err-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps an ENOBUFS failure to a friendly node_modules error (not the raw ENOBUFS)', () => {
    // Simulate the worktree path resolving to a dir that contains node_modules.
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    const err = Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS' });

    const msg = gitSpawnErrorMessage('rm', err, dir);

    expect(msg).toContain('node_modules');
    expect(msg).toContain('.gitignore');
    // The cryptic raw form must be gone.
    expect(msg).not.toBe('git rm failed: spawnSync git ENOBUFS');
  });

  it('detects ENOBUFS by message text even when code is absent', () => {
    const err = new Error('some wrapper: spawnSync git ENOBUFS');
    const msg = gitSpawnErrorMessage('checkout', err, dir); // no node_modules in dir
    expect(msg).toMatch(/large tracked directory|node_modules/);
    expect(msg).not.toContain('failed: some wrapper');
  });

  it('passes non-ENOBUFS errors through with the original message', () => {
    const err = new Error('fatal: not a git repository');
    const msg = gitSpawnErrorMessage('status', err, dir);
    expect(msg).toBe('git status failed: fatal: not a git repository');
  });
});

describe('GitOrphanStorage maxBuffer (install-2)', () => {
  let repoDir: string;

  function git(...args: string[]): void {
    execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' });
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'fg-orphan-repo-'));
    git('init', '--quiet');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repoDir, 'README.md'), '# fixture\n');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'initial');
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('round-trips a baseline larger than the 1 MiB default buffer without ENOBUFS', async () => {
    const storage = new GitOrphanStorage(repoDir);
    await storage.init();

    // 2 MiB payload — reading this back via `git show` would throw ENOBUFS
    // under Node's 1 MiB execFileSync default; the raised maxBuffer fixes it.
    const big = Buffer.alloc(2 * 1024 * 1024, 7);
    await storage.writeBaseline('/big', 1440, 'chromium', big);

    const read = await storage.readBaseline('/big', 1440, 'chromium');
    expect(read).not.toBeNull();
    expect(read!.length).toBeGreaterThan(1024 * 1024);
    expect(read!.equals(big)).toBe(true);
  }, 30_000);
});
