import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isEntrypoint } from '../src/index.js';

const pkgRoot = resolve(__dirname, '..');
const distEntry = join(pkgRoot, 'dist', 'index.js');

describe('isEntrypoint', () => {
  it('returns true when argv[1] resolves to the module file (direct node run)', () => {
    const moduleUrl = pathToFileURL(distEntry).href;
    expect(isEntrypoint(distEntry, moduleUrl)).toBe(true);
  });

  it('returns true when invoked via a bin symlink whose name is NOT index.js', () => {
    // npm/npx creates a bin symlink named `create-frontguard-plugin` pointing
    // at dist/index.js. The old guard (`endsWith('index.js')`) failed here.
    const tmp = mkdtempSync(join(tmpdir(), 'fg-bin-'));
    try {
      const link = join(tmp, 'create-frontguard-plugin');
      symlinkSync(distEntry, link);
      const moduleUrl = pathToFileURL(distEntry).href;
      expect(link.endsWith('index.js')).toBe(false);
      expect(isEntrypoint(link, moduleUrl)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns false when argv[1] is a different module', () => {
    const moduleUrl = pathToFileURL(distEntry).href;
    expect(isEntrypoint(join(pkgRoot, 'package.json'), moduleUrl)).toBe(false);
  });

  it('returns false for an undefined argv[1]', () => {
    expect(isEntrypoint(undefined, pathToFileURL(distEntry).href)).toBe(false);
  });
});

describe('bin symlink integration (Part A: CRITICAL bin bug)', () => {
  beforeAll(() => {
    // Ensure the built CLI exists. The bin field points at dist/index.js.
    if (!existsSync(distEntry)) {
      execFileSync('npm', ['run', 'build'], { cwd: pkgRoot, stdio: 'inherit' });
    }
  });

  it('creates files when invoked through the create-frontguard-plugin bin symlink', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fg-scaffold-'));
    try {
      // Recreate exactly how npm installs the bin: a symlink named after the
      // bin key, NOT index.js.
      const link = join(tmp, 'create-frontguard-plugin');
      symlinkSync(realpathSync(distEntry), link);

      const out = join(tmp, 'out');
      const stdout = execFileSync('node', [link, 'testplugin', '--directory', out], {
        encoding: 'utf8',
      });

      expect(stdout).toContain('Created frontguard-plugin-testplugin');
      expect(existsSync(join(out, 'package.json'))).toBe(true);
      expect(existsSync(join(out, 'src', 'index.ts'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
