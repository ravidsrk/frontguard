import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitOrphanStorage } from '../../src/storage/git-orphan.js';

describe('GitOrphanStorage text snapshots', () => {
  let repoDir: string;

  function git(...args: string[]): void {
    execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' });
  }

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'fg-text-snapshot-'));
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

  it('round-trips a sibling and rejects an unknown suffix', async () => {
    const storage = new GitOrphanStorage(repoDir, { mode: 'update' });
    await storage.init();

    await storage.textFile('/pricing', 1440, 'chromium', '.aria.txt', '- button "Buy"');
    await expect(storage.textFile('/pricing', 1440, 'chromium', '.aria.txt')).resolves.toBe(
      '- button "Buy"',
    );
    await expect(storage.textFile('/pricing', 1440, 'chromium', '.json')).resolves.toBeNull();
    await expect(storage.textFile('/pricing', 1440, 'chromium', '.html', 'no')).rejects.toThrow(
      'Unknown text snapshot',
    );
  });

  it('does not write text during comparison', async () => {
    vi.stubEnv('CI', 'false');
    const storage = new GitOrphanStorage(repoDir);
    await storage.init();

    await expect(
      storage.textFile('/pricing', 1440, 'chromium', '.md', '# hi'),
    ).rejects.toThrow('explicit update mode');
  });
});
