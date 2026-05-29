/**
 * Unit tests for the plugin registry & loader (src/core/plugin-registry.ts).
 *
 * Uses a temp dir for node_modules discovery and injects fake exec/import so no
 * real package-manager or network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePackageName,
  shortNameOf,
  isValidPluginName,
  installArgs,
  uninstallArgs,
  detectPackageManager,
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  extractPlugin,
  isPlugin,
  loadPlugin,
  PLUGIN_PREFIX,
} from '../../src/core/plugin-registry.js';

describe('resolvePackageName', () => {
  it('expands short names', () => {
    expect(resolvePackageName('slack')).toBe('frontguard-plugin-slack');
  });
  it('leaves full names unchanged', () => {
    expect(resolvePackageName('frontguard-plugin-slack')).toBe('frontguard-plugin-slack');
  });
  it('leaves scoped full names unchanged', () => {
    expect(resolvePackageName('@acme/frontguard-plugin-x')).toBe('@acme/frontguard-plugin-x');
  });
  it('expands scoped shorthand', () => {
    expect(resolvePackageName('@acme/x')).toBe('@acme/frontguard-plugin-x');
  });
  it('trims whitespace', () => {
    expect(resolvePackageName('  slack ')).toBe('frontguard-plugin-slack');
  });
});

describe('shortNameOf', () => {
  it('strips the prefix', () => {
    expect(shortNameOf('frontguard-plugin-slack')).toBe('slack');
  });
  it('handles scoped packages', () => {
    expect(shortNameOf('@acme/frontguard-plugin-x')).toBe('x');
  });
});

describe('isValidPluginName', () => {
  it('accepts well-formed names', () => {
    expect(isValidPluginName('frontguard-plugin-slack')).toBe(true);
    expect(isValidPluginName('@acme/frontguard-plugin-x')).toBe(true);
  });
  it('rejects names without the prefix or empty suffix', () => {
    expect(isValidPluginName('slack')).toBe(false);
    expect(isValidPluginName('frontguard-plugin-')).toBe(false);
  });
});

describe('installArgs / uninstallArgs', () => {
  it('builds npm args', () => {
    expect(installArgs('npm', 'p')).toEqual(['install', '-D', 'p']);
    expect(uninstallArgs('npm', 'p')).toEqual(['uninstall', 'p']);
  });
  it('builds pnpm args', () => {
    expect(installArgs('pnpm', 'p')).toEqual(['add', '-D', 'p']);
    expect(uninstallArgs('pnpm', 'p')).toEqual(['remove', 'p']);
  });
  it('builds yarn args', () => {
    expect(installArgs('yarn', 'p')).toEqual(['add', '-D', 'p']);
    expect(uninstallArgs('yarn', 'p')).toEqual(['remove', 'p']);
  });
});

describe('filesystem-backed', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-registry-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('detectPackageManager', () => {
    it('detects pnpm', () => {
      writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
      expect(detectPackageManager(dir)).toBe('pnpm');
    });
    it('detects yarn', () => {
      writeFileSync(join(dir, 'yarn.lock'), '');
      expect(detectPackageManager(dir)).toBe('yarn');
    });
    it('defaults to npm', () => {
      expect(detectPackageManager(dir)).toBe('npm');
    });
  });

  describe('listInstalledPlugins', () => {
    function addPkg(rel: string, pkg: Record<string, unknown>) {
      const pkgDir = join(dir, 'node_modules', rel);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkg));
    }

    it('returns [] when node_modules is absent', () => {
      expect(listInstalledPlugins(dir)).toEqual([]);
    });

    it('discovers unscoped and scoped plugins, ignores non-plugins', () => {
      addPkg('frontguard-plugin-slack', { version: '1.2.3', description: 'Slack alerts' });
      addPkg('@acme/frontguard-plugin-x', { version: '0.1.0' });
      addPkg('lodash', { version: '4.0.0' });
      addPkg('frontguard', { version: '2.0.0' }); // core, not a plugin

      const found = listInstalledPlugins(dir);
      const names = found.map((p) => p.packageName);
      expect(names).toContain('frontguard-plugin-slack');
      expect(names).toContain('@acme/frontguard-plugin-x');
      expect(names).not.toContain('lodash');
      expect(names).not.toContain('frontguard');

      const slack = found.find((p) => p.shortName === 'slack');
      expect(slack?.version).toBe('1.2.3');
      expect(slack?.description).toBe('Slack alerts');
    });
  });

  describe('installPlugin / uninstallPlugin', () => {
    it('calls the package manager with resolved name', async () => {
      const exec = vi.fn(async () => ({ stdout: '', stderr: '' }));
      const { packageName } = await installPlugin('slack', { cwd: dir, pm: 'npm', exec: exec as never });
      expect(packageName).toBe('frontguard-plugin-slack');
      expect(exec).toHaveBeenCalledWith('npm', ['install', '-D', 'frontguard-plugin-slack'], { cwd: dir });
    });

    it('rejects invalid plugin names before running', async () => {
      const exec = vi.fn(async () => ({ stdout: '', stderr: '' }));
      await expect(
        installPlugin('@badscope', { cwd: dir, pm: 'npm', exec: exec as never }),
      ).rejects.toThrow(/valid Frontguard plugin/);
      expect(exec).not.toHaveBeenCalled();
    });

    it('uninstall calls remove/uninstall', async () => {
      const exec = vi.fn(async () => ({ stdout: '', stderr: '' }));
      await uninstallPlugin('frontguard-plugin-slack', { cwd: dir, pm: 'pnpm', exec: exec as never });
      expect(exec).toHaveBeenCalledWith('pnpm', ['remove', 'frontguard-plugin-slack'], { cwd: dir });
    });
  });
});

describe('isPlugin / extractPlugin', () => {
  const validPlugin = { name: 'demo', setup() {} };

  it('isPlugin recognises objects with a string name', () => {
    expect(isPlugin(validPlugin)).toBe(true);
    expect(isPlugin({})).toBe(false);
    expect(isPlugin(null)).toBe(false);
  });

  it('extracts a default-export plugin object', () => {
    expect(extractPlugin({ default: validPlugin }).name).toBe('demo');
  });

  it('extracts a default-export factory function', () => {
    expect(extractPlugin({ default: () => validPlugin }).name).toBe('demo');
  });

  it('extracts a named "plugin" export', () => {
    expect(extractPlugin({ plugin: validPlugin }).name).toBe('demo');
  });

  it('extracts when the module itself is a plugin', () => {
    expect(extractPlugin(validPlugin).name).toBe('demo');
  });

  it('passes config to factories', () => {
    const factory = (cfg: unknown) => ({ name: 'cfg', config: cfg });
    const p = extractPlugin({ default: factory }, { foo: 1 }) as { config: unknown };
    expect(p.config).toEqual({ foo: 1 });
  });

  it('throws when no valid plugin is exported', () => {
    expect(() => extractPlugin({ default: { notAName: true } })).toThrow(/valid Frontguard plugin/);
  });
});

describe('loadPlugin', () => {
  it('imports via the resolved package name and extracts the plugin', async () => {
    const importer = vi.fn(async (spec: string) => {
      expect(spec).toBe('frontguard-plugin-slack');
      return { default: () => ({ name: 'slack' }) };
    });
    const plugin = await loadPlugin('slack', undefined, importer);
    expect(plugin.name).toBe('slack');
  });

  it('throws a helpful error when import fails', async () => {
    const importer = vi.fn(async () => {
      throw new Error('Cannot find module');
    });
    await expect(loadPlugin('missing', undefined, importer)).rejects.toThrow(/install missing/);
  });
});

describe('PLUGIN_PREFIX', () => {
  it('is the documented convention', () => {
    expect(PLUGIN_PREFIX).toBe('frontguard-plugin-');
  });
});
