/**
 * Plugin registry & dynamic loading (Task 8.5).
 *
 * Frontguard plugins are published to npm following the naming convention
 * `frontguard-plugin-<name>` (or scoped `@scope/frontguard-plugin-<name>`).
 * This module handles:
 *
 * - Resolving short names ↔ full package names.
 * - Installing/uninstalling plugin packages via the host package manager.
 * - Discovering installed plugins from `node_modules`.
 * - Dynamically importing a plugin module and extracting its factory/instance.
 *
 * Loading is intentionally decoupled from {@link PluginManager}: callers import
 * a plugin here, then register the returned {@link FrontguardPlugin} as usual.
 *
 * @module core/plugin-registry
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrontguardPlugin } from './plugins.js';

const execFileAsync = promisify(execFile);

/** The required prefix for Frontguard plugin packages. */
export const PLUGIN_PREFIX = 'frontguard-plugin-';

/** Supported package managers for install/uninstall. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/** Metadata about an installed plugin package. */
export interface InstalledPlugin {
  /** Full npm package name (e.g. `frontguard-plugin-slack`). */
  packageName: string;
  /** Short name (package name minus the prefix). */
  shortName: string;
  /** Installed version, if resolvable. */
  version?: string;
  /** Package description, if present. */
  description?: string;
}

/**
 * Normalises a user-supplied plugin identifier to a full npm package name.
 *
 * Accepts:
 * - short names: `slack` → `frontguard-plugin-slack`
 * - full names: `frontguard-plugin-slack` → unchanged
 * - scoped names: `@acme/frontguard-plugin-x` → unchanged
 * - scoped shorthand: `@acme/slack` → `@acme/frontguard-plugin-slack`
 */
export function resolvePackageName(identifier: string): string {
  const id = identifier.trim();
  if (id.startsWith('@')) {
    const slash = id.indexOf('/');
    if (slash === -1) return id; // malformed; return as-is
    const scope = id.slice(0, slash);
    const rest = id.slice(slash + 1);
    return rest.startsWith(PLUGIN_PREFIX) ? id : `${scope}/${PLUGIN_PREFIX}${rest}`;
  }
  return id.startsWith(PLUGIN_PREFIX) ? id : `${PLUGIN_PREFIX}${id}`;
}

/** Extracts the short name from a full package name. */
export function shortNameOf(packageName: string): string {
  const unscoped = packageName.startsWith('@')
    ? packageName.slice(packageName.indexOf('/') + 1)
    : packageName;
  return unscoped.startsWith(PLUGIN_PREFIX) ? unscoped.slice(PLUGIN_PREFIX.length) : unscoped;
}

/** Validates that a package name follows the plugin naming convention. */
export function isValidPluginName(packageName: string): boolean {
  const unscoped = packageName.startsWith('@')
    ? packageName.slice(packageName.indexOf('/') + 1)
    : packageName;
  return unscoped.startsWith(PLUGIN_PREFIX) && unscoped.length > PLUGIN_PREFIX.length;
}

/** Builds the install command args for a package manager. */
export function installArgs(pm: PackageManager, packageName: string): string[] {
  switch (pm) {
    case 'pnpm':
      return ['add', '-D', packageName];
    case 'yarn':
      return ['add', '-D', packageName];
    case 'npm':
    default:
      return ['install', '-D', packageName];
  }
}

/** Builds the uninstall command args for a package manager. */
export function uninstallArgs(pm: PackageManager, packageName: string): string[] {
  switch (pm) {
    case 'pnpm':
      return ['remove', packageName];
    case 'yarn':
      return ['remove', packageName];
    case 'npm':
    default:
      return ['uninstall', packageName];
  }
}

/**
 * Detects the package manager in use by looking for lockfiles. Defaults to npm.
 */
export function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Installs a plugin package via the detected package manager.
 *
 * @throws if the package name is invalid or the install command fails.
 */
export async function installPlugin(
  identifier: string,
  opts: { cwd?: string; pm?: PackageManager; exec?: typeof execFileAsync } = {},
): Promise<{ packageName: string }> {
  const packageName = resolvePackageName(identifier);
  if (!isValidPluginName(packageName)) {
    throw new Error(
      `"${packageName}" is not a valid Frontguard plugin. Plugins must be named "${PLUGIN_PREFIX}*".`,
    );
  }
  const cwd = opts.cwd ?? process.cwd();
  const pm = opts.pm ?? detectPackageManager(cwd);
  const exec = opts.exec ?? execFileAsync;
  await exec(pm, installArgs(pm, packageName), { cwd });
  return { packageName };
}

/** Uninstalls a plugin package via the detected package manager. */
export async function uninstallPlugin(
  identifier: string,
  opts: { cwd?: string; pm?: PackageManager; exec?: typeof execFileAsync } = {},
): Promise<{ packageName: string }> {
  const packageName = resolvePackageName(identifier);
  const cwd = opts.cwd ?? process.cwd();
  const pm = opts.pm ?? detectPackageManager(cwd);
  const exec = opts.exec ?? execFileAsync;
  await exec(pm, uninstallArgs(pm, packageName), { cwd });
  return { packageName };
}

/**
 * Lists installed Frontguard plugins by scanning `node_modules` for packages
 * matching the naming convention (including scoped packages).
 */
export function listInstalledPlugins(cwd: string = process.cwd()): InstalledPlugin[] {
  const nodeModules = join(cwd, 'node_modules');
  if (!existsSync(nodeModules)) return [];

  const found: InstalledPlugin[] = [];
  const entries = safeReaddir(nodeModules);

  for (const entry of entries) {
    if (entry.startsWith('@')) {
      // Scoped: scan one level deeper.
      const scopeDir = join(nodeModules, entry);
      for (const pkg of safeReaddir(scopeDir)) {
        if (pkg.startsWith(PLUGIN_PREFIX)) {
          found.push(readInstalled(`${entry}/${pkg}`, join(scopeDir, pkg)));
        }
      }
    } else if (entry.startsWith(PLUGIN_PREFIX)) {
      found.push(readInstalled(entry, join(nodeModules, entry)));
    }
  }
  return found.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

/** Reads version/description from a plugin's package.json. */
function readInstalled(packageName: string, dir: string): InstalledPlugin {
  let version: string | undefined;
  let description: string | undefined;
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      version?: string;
      description?: string;
    };
    version = pkg.version;
    description = pkg.description;
  } catch {
    /* ignore unreadable package.json */
  }
  return { packageName, shortName: shortNameOf(packageName), version, description };
}

/** readdir that returns [] instead of throwing. */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Extracts a {@link FrontguardPlugin} from a dynamically imported module.
 *
 * Supports several export shapes:
 * - default export that is a plugin object (`{ name, ...hooks }`)
 * - default export that is a factory function returning a plugin
 * - named `plugin` export (object or factory)
 * - the module itself being a plugin object
 *
 * @param mod    - The imported module namespace.
 * @param config - Optional config passed to factory functions.
 */
export function extractPlugin(mod: unknown, config?: unknown): FrontguardPlugin {
  const candidates: unknown[] = [];
  const m = mod as Record<string, unknown>;
  if (m) {
    candidates.push(m.default, m.plugin, m.createPlugin, m);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'function') {
      const result = (candidate as (cfg?: unknown) => unknown)(config);
      if (isPlugin(result)) return result;
    } else if (isPlugin(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'Imported module does not export a valid Frontguard plugin (expected an object with a "name" and hook methods, or a factory returning one).',
  );
}

/** Type guard: a value is a FrontguardPlugin if it has a string `name`. */
export function isPlugin(value: unknown): value is FrontguardPlugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

/**
 * Dynamically imports and instantiates an installed plugin.
 *
 * @param identifier - Short or full package name.
 * @param config     - Optional config passed to factory-style plugins.
 * @param importer   - Injectable dynamic import (tests).
 */
export async function loadPlugin(
  identifier: string,
  config?: unknown,
  importer: (spec: string) => Promise<unknown> = (spec) => import(spec),
): Promise<FrontguardPlugin> {
  const packageName = resolvePackageName(identifier);
  let mod: unknown;
  try {
    mod = await importer(packageName);
  } catch (err) {
    throw new Error(
      `Could not load plugin "${packageName}": ${err instanceof Error ? err.message : String(err)}. ` +
        `Is it installed? Try: frontguard plugin install ${shortNameOf(packageName)}`,
    );
  }
  return extractPlugin(mod, config);
}
