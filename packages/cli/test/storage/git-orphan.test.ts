import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const storage = new GitOrphanStorage('/tmp/fake-repo', { branch: 'my-baselines' });
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
    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
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

  it('creates the orphan branch without disturbing a dirty working tree', async () => {
    const uncommitted = join(repoDir, 'frontguard.config.ts');
    writeFileSync(uncommitted, 'export default { baseUrl: "http://localhost:3000" };\n');

    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await expect(storage.init()).resolves.toBeUndefined();

    expect(existsSync(uncommitted)).toBe(true);
    expect(readFileSync(uncommitted, 'utf8')).toContain('baseUrl');
  });

  it('does not create baseline state during comparison initialization', async () => {
    // Pin the precondition: this asserts LOCAL comparison behaviour. In CI,
    // compare mode deliberately fails closed when no origin remote exists
    // (src/storage/git-orphan.ts:242-247), which is a different contract
    // covered by its own tests. Without this stub the test inherits the
    // ambient CI variable and passes or fails depending on the shell.
    vi.stubEnv('CI', 'false');

    const storage = new GitOrphanStorage(repoDir);

    await storage.init();

    expect(execFileSync('git', ['branch', '--list', 'frontguard-baselines'], {
      cwd: repoDir,
      encoding: 'utf8',
    }).trim()).toBe('');
    await expect(storage.hasBaselines()).resolves.toBe(false);
    await expect(storage.readBaseline('/missing', 1440, 'chromium')).resolves.toBeNull();
    await expect(
      storage.writeBaseline('/missing', 1440, 'chromium', Buffer.from('png')),
    ).rejects.toThrow('explicit update mode');
  });

  it('returns null only when the requested baseline path is absent', async () => {
    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await storage.init();

    await expect(storage.readBaseline('/missing', 1440, 'chromium')).resolves.toBeNull();
  });

  it('propagates git failures instead of treating them as missing baselines', async () => {
    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await storage.init();
    git('update-ref', '-d', 'refs/heads/frontguard-baselines');

    await expect(storage.readBaseline('/missing', 1440, 'chromium')).rejects.toThrow(
      'Could not read baseline',
    );
  });
});

describe('GitOrphanStorage remote branch adoption', () => {
  let rootDir: string;

  function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'fg-orphan-remote-'));
    vi.stubEnv('CI', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(rootDir, { recursive: true, force: true });
  });

  function createRemoteFixture(expected: Buffer): {
    sourceDir: string;
    remoteDir: string;
  } {
    const sourceDir = join(rootDir, 'source');
    const remoteDir = join(rootDir, 'remote.git');
    mkdirSync(sourceDir);

    git(sourceDir, 'init', '--quiet', '--initial-branch=main');
    git(sourceDir, 'config', 'user.email', 'test@example.com');
    git(sourceDir, 'config', 'user.name', 'Test');
    git(sourceDir, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(sourceDir, 'README.md'), '# fixture\n');
    git(sourceDir, 'add', 'README.md');
    git(sourceDir, 'commit', '--quiet', '-m', 'initial');

    git(rootDir, 'init', '--quiet', '--bare', remoteDir);
    git(sourceDir, 'remote', 'add', 'origin', remoteDir);
    git(sourceDir, 'push', '--quiet', 'origin', 'main');

    git(sourceDir, 'checkout', '--quiet', '--orphan', 'frontguard-baselines');
    git(sourceDir, 'rm', '--quiet', '-rf', '.');
    const baselineDir = join(sourceDir, 'baselines', 'home', '1440');
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(join(baselineDir, 'chromium.png'), expected);
    writeFileSync(
      join(sourceDir, 'manifest.json'),
      JSON.stringify({ schemaVersion: 1, createdBy: 'test', updatedAt: '2026-08-29', routes: {} }),
    );
    git(sourceDir, 'add', '-A');
    git(sourceDir, 'commit', '--quiet', '-m', 'baseline');
    git(sourceDir, 'push', '--quiet', 'origin', 'frontguard-baselines');

    return { sourceDir, remoteDir };
  }

  it('fetches a remote-only baseline branch in a full clone', async () => {
    const expected = Buffer.from('accepted-png');
    const { remoteDir } = createRemoteFixture(expected);
    const cloneDir = join(rootDir, 'clone');

    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);
    git(cloneDir, 'update-ref', '-d', 'refs/remotes/origin/frontguard-baselines');
    expect(git(cloneDir, 'branch', '--list', 'frontguard-baselines')).toBe('');

    const storage = new GitOrphanStorage(cloneDir);
    await storage.init();

    expect(await storage.readBaseline('/home', 1440, 'chromium')).toEqual(expected);
    expect(git(cloneDir, 'branch', '--list', 'frontguard-baselines')).toBe('');
  });

  it('adopts a remote-only baseline branch in a single-branch shallow clone', async () => {
    const expected = Buffer.from('shallow-accepted-png');
    const { remoteDir } = createRemoteFixture(expected);
    const cloneDir = join(rootDir, 'shallow-clone');

    git(
      rootDir,
      'clone',
      '--quiet',
      '--depth=1',
      '--single-branch',
      '--branch',
      'main',
      `file://${remoteDir}`,
      cloneDir,
    );

    const storage = new GitOrphanStorage(cloneDir);
    await storage.init();

    expect(await storage.readBaseline('/home', 1440, 'chromium')).toEqual(expected);
  });

  it('fast-forwards a stale local baseline branch in CI', async () => {
    const initial = Buffer.from('initial-png');
    const latest = Buffer.from('latest-png');
    const { sourceDir, remoteDir } = createRemoteFixture(initial);
    const cloneDir = join(rootDir, 'stale-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    await new GitOrphanStorage(cloneDir).init();

    writeFileSync(join(sourceDir, 'baselines', 'home', '1440', 'chromium.png'), latest);
    git(sourceDir, 'add', '-A');
    git(sourceDir, 'commit', '--quiet', '-m', 'update baseline');
    git(sourceDir, 'push', '--quiet', 'origin', 'frontguard-baselines');

    vi.stubEnv('CI', 'true');
    const refreshed = new GitOrphanStorage(cloneDir);
    await refreshed.init();
    expect(await refreshed.readBaseline('/home', 1440, 'chromium')).toEqual(latest);
  });

  it('reads a newly published remote baseline locally without moving the local branch', async () => {
    const initial = Buffer.from('initial-png');
    const latest = Buffer.from('latest-png');
    const { sourceDir, remoteDir } = createRemoteFixture(initial);
    const cloneDir = join(rootDir, 'local-refresh-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    const updater = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await updater.init();
    const localCommit = git(cloneDir, 'rev-parse', 'frontguard-baselines');

    writeFileSync(join(sourceDir, 'baselines', 'home', '1440', 'chromium.png'), latest);
    git(sourceDir, 'add', '-A');
    git(sourceDir, 'commit', '--quiet', '-m', 'publish newer baseline');
    git(sourceDir, 'push', '--quiet', 'origin', 'frontguard-baselines');

    const comparison = new GitOrphanStorage(cloneDir);
    await comparison.init();

    expect(await comparison.readBaseline('/home', 1440, 'chromium')).toEqual(latest);
    expect(git(cloneDir, 'rev-parse', 'frontguard-baselines')).toBe(localCommit);
  });

  it('preserves unpublished local baseline commits in update mode', async () => {
    const initial = Buffer.from('initial-png');
    const local = Buffer.from('local-unpublished-png');
    const { remoteDir } = createRemoteFixture(initial);
    const cloneDir = join(rootDir, 'ahead-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    const storage = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await storage.init();
    await storage.writeBaseline('/home', 1440, 'chromium', local);

    vi.stubEnv('CI', 'true');
    const refreshed = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await refreshed.init();
    expect(await refreshed.readBaseline('/home', 1440, 'chromium')).toEqual(local);
  });

  it('rejects unpublished local baseline commits during CI comparison', async () => {
    const initial = Buffer.from('initial-png');
    const { remoteDir } = createRemoteFixture(initial);
    const cloneDir = join(rootDir, 'ahead-comparison-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    const updater = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await updater.init();
    await updater.writeBaseline('/home', 1440, 'chromium', Buffer.from('unpublished-png'));

    vi.stubEnv('CI', 'true');
    const comparison = new GitOrphanStorage(cloneDir);
    await expect(comparison.init()).rejects.toThrow('refuses unpublished baseline commits');
    await expect(comparison.readBaseline('/home', 1440, 'chromium')).rejects.toThrow(
      'not initialized',
    );
  });

  it('does not fall back to a stale local branch deleted from origin in CI', async () => {
    const expected = Buffer.from('published-png');
    const { sourceDir, remoteDir } = createRemoteFixture(expected);
    const cloneDir = join(rootDir, 'deleted-remote-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    vi.stubEnv('CI', 'true');
    const comparison = new GitOrphanStorage(cloneDir);
    await comparison.init();
    expect(await comparison.readBaseline('/home', 1440, 'chromium')).toEqual(expected);

    git(sourceDir, 'push', '--quiet', 'origin', '--delete', 'frontguard-baselines');

    await expect(comparison.init()).rejects.toThrow(
      'Published baseline branch origin/frontguard-baselines does not exist',
    );
    await expect(comparison.readBaseline('/home', 1440, 'chromium')).rejects.toThrow(
      'not initialized',
    );
  });

  it('pins CI comparison reads to the fetched remote commit', async () => {
    const published = Buffer.from('published-png');
    const { remoteDir } = createRemoteFixture(published);
    const cloneDir = join(rootDir, 'pinned-comparison-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    vi.stubEnv('CI', 'true');
    const comparison = new GitOrphanStorage(cloneDir);
    await comparison.init();

    const updater = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await updater.init();
    await updater.writeBaseline('/home', 1440, 'chromium', Buffer.from('unpublished-png'));

    expect(await comparison.readBaseline('/home', 1440, 'chromium')).toEqual(published);
  });

  it('treats CI=false as local development and keeps an existing baseline offline', async () => {
    const expected = Buffer.from('offline-png');
    const { remoteDir } = createRemoteFixture(expected);
    const cloneDir = join(rootDir, 'offline-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);
    await new GitOrphanStorage(cloneDir, { mode: 'update' }).init();
    git(cloneDir, 'remote', 'set-url', 'origin', join(rootDir, 'missing.git'));
    vi.stubEnv('CI', 'false');

    const offline = new GitOrphanStorage(cloneDir);
    await expect(offline.init()).resolves.toBeUndefined();
    expect(await offline.readBaseline('/home', 1440, 'chromium')).toEqual(expected);
  });

  it('fails closed when CI cannot refresh the remote baseline branch', async () => {
    const { remoteDir } = createRemoteFixture(Buffer.from('initial-png'));
    const cloneDir = join(rootDir, 'network-failure-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);
    await new GitOrphanStorage(cloneDir).init();
    git(cloneDir, 'remote', 'set-url', 'origin', join(rootDir, 'missing.git'));
    vi.stubEnv('CI', 'true');

    await expect(new GitOrphanStorage(cloneDir).init()).rejects.toThrow(
      'Could not check origin/frontguard-baselines',
    );
  });

  it('rejects divergent local and remote baseline histories in CI', async () => {
    const initial = Buffer.from('initial-png');
    const { sourceDir, remoteDir } = createRemoteFixture(initial);
    const cloneDir = join(rootDir, 'diverged-clone');
    git(rootDir, 'clone', '--quiet', '--branch', 'main', remoteDir, cloneDir);

    const localStorage = new GitOrphanStorage(cloneDir, { mode: 'update' });
    await localStorage.init();
    await localStorage.writeBaseline('/home', 1440, 'chromium', Buffer.from('local-png'));

    writeFileSync(
      join(sourceDir, 'baselines', 'home', '1440', 'chromium.png'),
      Buffer.from('remote-png'),
    );
    git(sourceDir, 'add', '-A');
    git(sourceDir, 'commit', '--quiet', '-m', 'remote baseline update');
    git(sourceDir, 'push', '--quiet', 'origin', 'frontguard-baselines');
    vi.stubEnv('CI', 'true');

    await expect(new GitOrphanStorage(cloneDir).init()).rejects.toThrow(
      'has diverged from origin/frontguard-baselines',
    );
  });
});

describe('GitOrphanStorage in a repository without commits', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'fg-orphan-unborn-'));
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], {
      cwd: repoDir,
      stdio: 'pipe',
    });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('creates baselines while preserving uncommitted project files', async () => {
    const configPath = join(repoDir, 'frontguard.config.ts');
    writeFileSync(configPath, 'export default { baseUrl: "http://localhost:3000" };\n');

    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await storage.init();

    expect(existsSync(configPath)).toBe(true);
    const version = readFileSync(new URL('../../../../VERSION', import.meta.url), 'utf8').trim();
    expect(await storage.readManifest()).toMatchObject({
      schemaVersion: 1,
      createdBy: `frontguard@${version}`,
      routes: {},
    });
  });
});
