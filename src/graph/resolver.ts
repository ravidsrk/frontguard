/**
 * Route-to-file resolver and change-impact analysis for Frontguard.
 *
 * Maps routes to their source file entry points across multiple frameworks
 * (Next.js, Remix, SvelteKit, Nuxt), detects changed files via Git, and
 * determines which routes are affected by a set of file changes using
 * transitive dependency analysis.
 *
 * @module graph/resolver
 */

import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { logger } from '../utils/logger.js';
import type { Route } from '../core/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Files whose changes affect ALL routes (global impact).
 * Matched against the basename or relative path of a changed file.
 */
const GLOBAL_IMPACT_PATTERNS = [
  // Config files
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.ts',
  'vite.config.js',
  'svelte.config.js',
  'nuxt.config.ts',
  'nuxt.config.js',
  'remix.config.js',
  'remix.config.ts',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.cjs',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.mjs',
  'tsconfig.json',
  'jsconfig.json',
  // Global styles
  'globals.css',
  'global.css',
  'app.css',
  'index.css',
  'styles/globals.css',
  'styles/global.css',
  'src/styles/globals.css',
  'src/app/globals.css',
  'src/index.css',
  // Theme files
  'theme.ts',
  'theme.js',
  'theme.css',
  'variables.css',
  'tokens.css',
];

/** File extensions for route entry points across frameworks. */
const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'];

// ---------------------------------------------------------------------------
// Framework Detection
// ---------------------------------------------------------------------------

type FrameworkType = 'nextjs-app' | 'nextjs-pages' | 'remix' | 'sveltekit' | 'nuxt' | 'generic';

/**
 * Detects the frontend framework in use by checking for characteristic
 * directory structures.
 */
function detectFramework(projectDir: string): FrameworkType[] {
  const frameworks: FrameworkType[] = [];

  // Next.js App Router
  if (
    existsSync(join(projectDir, 'app')) ||
    existsSync(join(projectDir, 'src', 'app'))
  ) {
    frameworks.push('nextjs-app');
  }

  // Next.js Pages Router
  if (
    existsSync(join(projectDir, 'pages')) ||
    existsSync(join(projectDir, 'src', 'pages'))
  ) {
    frameworks.push('nextjs-pages');
  }

  // Remix
  if (existsSync(join(projectDir, 'app', 'routes'))) {
    frameworks.push('remix');
  }

  // SvelteKit
  if (existsSync(join(projectDir, 'src', 'routes'))) {
    frameworks.push('sveltekit');
  }

  // Nuxt
  if (
    existsSync(join(projectDir, 'pages')) &&
    (existsSync(join(projectDir, 'nuxt.config.ts')) ||
      existsSync(join(projectDir, 'nuxt.config.js')))
  ) {
    frameworks.push('nuxt');
  }

  if (frameworks.length === 0) {
    frameworks.push('generic');
  }

  return frameworks;
}

// ---------------------------------------------------------------------------
// Route → File Mapping
// ---------------------------------------------------------------------------

/**
 * Converts a route path to potential file system paths for different frameworks.
 */
function getRouteCandidates(routePath: string, projectDir: string): string[] {
  const candidates: string[] = [];
  const normalizedPath = routePath === '/' ? '' : routePath.replace(/^\//, '');
  const frameworks = detectFramework(projectDir);

  for (const framework of frameworks) {
    switch (framework) {
      case 'nextjs-app': {
        const appDirs = [
          join(projectDir, 'app'),
          join(projectDir, 'src', 'app'),
        ];

        for (const appDir of appDirs) {
          if (!existsSync(appDir)) continue;
          const routeDir = normalizedPath ? join(appDir, normalizedPath) : appDir;

          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(routeDir, `page${ext}`));
          }
          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(routeDir, `layout${ext}`));
          }
          // Root layout affects all routes
          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(appDir, `layout${ext}`));
          }
        }
        break;
      }

      case 'nextjs-pages': {
        const pagesDirs = [
          join(projectDir, 'pages'),
          join(projectDir, 'src', 'pages'),
        ];

        for (const pagesDir of pagesDirs) {
          if (!existsSync(pagesDir)) continue;

          if (normalizedPath === '') {
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(pagesDir, `index${ext}`));
            }
          } else {
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(pagesDir, `${normalizedPath}${ext}`));
            }
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(pagesDir, normalizedPath, `index${ext}`));
            }
          }
          // _app and _document affect all routes
          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(pagesDir, `_app${ext}`));
            candidates.push(join(pagesDir, `_document${ext}`));
          }
        }
        break;
      }

      case 'remix': {
        const routesDir = join(projectDir, 'app', 'routes');
        if (!existsSync(routesDir)) break;

        if (normalizedPath === '') {
          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(routesDir, `_index${ext}`));
          }
        } else {
          // Remix flat routes: /checkout/summary → checkout.summary
          const flatRoute = normalizedPath.replace(/\//g, '.');
          for (const ext of PAGE_EXTENSIONS) {
            candidates.push(join(routesDir, `${flatRoute}${ext}`));
            candidates.push(join(routesDir, `${flatRoute}._index${ext}`));
            candidates.push(join(routesDir, `${normalizedPath}${ext}`));
          }
        }
        // Root layout
        for (const ext of PAGE_EXTENSIONS) {
          candidates.push(join(projectDir, 'app', `root${ext}`));
        }
        break;
      }

      case 'sveltekit': {
        const routesDir = join(projectDir, 'src', 'routes');
        if (!existsSync(routesDir)) break;
        const routeDir = normalizedPath ? join(routesDir, normalizedPath) : routesDir;

        candidates.push(join(routeDir, '+page.svelte'));
        candidates.push(join(routeDir, '+page.ts'));
        candidates.push(join(routeDir, '+page.js'));
        candidates.push(join(routeDir, '+page.server.ts'));
        candidates.push(join(routeDir, '+page.server.js'));
        candidates.push(join(routeDir, '+layout.svelte'));
        // Root layout
        candidates.push(join(routesDir, '+layout.svelte'));
        break;
      }

      case 'nuxt': {
        const pagesDir = join(projectDir, 'pages');
        if (!existsSync(pagesDir)) break;

        if (normalizedPath === '') {
          candidates.push(join(pagesDir, 'index.vue'));
        } else {
          candidates.push(join(pagesDir, `${normalizedPath}.vue`));
          candidates.push(join(pagesDir, normalizedPath, 'index.vue'));
        }

        // Layouts
        const layoutsDir = join(projectDir, 'layouts');
        if (existsSync(layoutsDir)) {
          candidates.push(join(layoutsDir, 'default.vue'));
        }
        candidates.push(join(projectDir, 'app.vue'));
        break;
      }

      case 'generic':
      default: {
        const dirs = [
          join(projectDir, 'src', 'pages'),
          join(projectDir, 'src', 'views'),
          join(projectDir, 'src', 'routes'),
          join(projectDir, 'pages'),
          join(projectDir, 'views'),
        ];

        for (const dir of dirs) {
          if (!existsSync(dir)) continue;
          if (normalizedPath === '') {
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(dir, `index${ext}`));
            }
          } else {
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(dir, `${normalizedPath}${ext}`));
            }
            for (const ext of PAGE_EXTENSIONS) {
              candidates.push(join(dir, normalizedPath, `index${ext}`));
            }
          }
        }
        break;
      }
    }
  }

  return candidates;
}

/**
 * Maps each route to its entry file(s) on disk.
 *
 * For each route, tries framework-specific file path conventions and
 * returns only the paths that actually exist. Routes with no matching
 * files will have an empty array (meaning they'll always be included
 * in the affected set as a safety fallback).
 *
 * @param routes     - Routes to map
 * @param projectDir - Project root directory
 * @returns Map from route path to array of existing entry file paths
 */
export function mapRoutesToFiles(
  routes: Route[],
  projectDir: string,
): Map<string, string[]> {
  const routeFileMap = new Map<string, string[]>();
  const frameworks = detectFramework(projectDir);

  logger.debug(`Detected framework(s): ${frameworks.join(', ')}`);

  for (const route of routes) {
    const candidates = getRouteCandidates(route.path, projectDir);
    const existing = candidates.filter((c) => existsSync(c));
    const unique = [...new Set(existing)];

    routeFileMap.set(route.path, unique);

    if (unique.length > 0) {
      logger.debug(`Route ${route.path} → ${unique.length} file(s)`);
    } else {
      logger.debug(`Route ${route.path} → no files found (will always be included)`);
    }
  }

  return routeFileMap;
}

// ---------------------------------------------------------------------------
// Git Change Detection
// ---------------------------------------------------------------------------

/**
 * Executes a git command and returns stdout lines, or empty array on failure.
 */
function gitDiff(projectDir: string, args: string): string[] {
  try {
    const output = execSync(`git ${args}`, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Detects files changed in the current commit or PR.
 *
 * Tries multiple strategies in order of preference:
 * 1. `git diff --name-only origin/main...HEAD` — PR diff against main
 * 2. `git diff --name-only HEAD~1` — last commit
 * 3. `git diff --name-only HEAD` — uncommitted changes
 * 4. `git diff --name-only --cached` — staged changes
 *
 * Resolves relative paths to absolute, filters to existing files only.
 *
 * @param projectDir - Project root directory (must be inside a git repo)
 * @returns Array of absolute file paths that changed
 */
export function getChangedFiles(projectDir: string): string[] {
  const resolvedDir = resolve(projectDir);
  const allFiles = new Set<string>();

  // Strategy 1: PR diff against main (most common CI context)
  const prFilesMain = gitDiff(resolvedDir, 'diff --name-only origin/main...HEAD');
  for (const f of prFilesMain) allFiles.add(f);

  // Strategy 2: Last commit diff
  if (allFiles.size === 0) {
    const commitFiles = gitDiff(resolvedDir, 'diff --name-only HEAD~1');
    for (const f of commitFiles) allFiles.add(f);
  }

  // Strategy 3: Uncommitted changes
  if (allFiles.size === 0) {
    const uncommitted = gitDiff(resolvedDir, 'diff --name-only HEAD');
    for (const f of uncommitted) allFiles.add(f);
  }

  // Strategy 4: Staged changes
  if (allFiles.size === 0) {
    const stagedFiles = gitDiff(resolvedDir, 'diff --name-only --cached');
    for (const f of stagedFiles) allFiles.add(f);
  }

  // Resolve to absolute paths, keep only existing files
  const resolved: string[] = [];
  for (const relPath of allFiles) {
    const absPath = resolve(resolvedDir, relPath);
    if (existsSync(absPath)) {
      resolved.push(absPath);
    }
  }

  logger.debug(`Git detected ${resolved.length} changed file(s)`);
  return resolved;
}

// ---------------------------------------------------------------------------
// Impact Analysis
// ---------------------------------------------------------------------------

/**
 * Checks if a file path matches a global-impact pattern.
 * Returns the matched pattern name, or null if no match.
 */
function isGlobalImpactFile(filePath: string, projectDir: string): string | null {
  const relative = filePath.startsWith(projectDir)
    ? filePath.slice(projectDir.length + 1)
    : basename(filePath);

  const fileBasename = basename(filePath);

  // Check exact matches against known global-impact patterns
  for (const pattern of GLOBAL_IMPACT_PATTERNS) {
    if (relative === pattern || fileBasename === pattern) {
      return pattern;
    }
  }

  // Wildcard match: any tailwind.config.* or *.config.* file
  if (
    fileBasename.startsWith('tailwind.config') ||
    fileBasename.startsWith('postcss.config') ||
    fileBasename.match(/^[a-z]+\.config\.[a-z]+$/)
  ) {
    return fileBasename;
  }

  return null;
}

/**
 * Builds a reverse dependency map from a forward edge map.
 * Forward: A → {B, C} means "A imports B and C"
 * Reverse: B → {A} means "B is imported by A"
 */
function buildReverseGraph(
  graph: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const [file, deps] of graph) {
    for (const dep of deps) {
      if (!reverse.has(dep)) {
        reverse.set(dep, new Set());
      }
      reverse.get(dep)!.add(file);
    }
  }

  return reverse;
}

/**
 * Finds all files that transitively depend on a given file.
 * Uses BFS through the reverse dependency graph.
 */
function getTransitiveDependents(
  file: string,
  reverseGraph: Map<string, Set<string>>,
): Set<string> {
  const affected = new Set<string>();
  const queue = [file];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (affected.has(current)) continue;
    affected.add(current);

    const dependents = reverseGraph.get(current);
    if (dependents) {
      for (const dep of dependents) {
        if (!affected.has(dep)) queue.push(dep);
      }
    }
  }

  return affected;
}

/**
 * Filters routes to only those affected by changed files, using the
 * dependency graph for transitive impact analysis.
 *
 * Special cases that cause ALL routes to be affected:
 * - Global CSS changes (globals.css, tailwind config, theme files)
 * - Package manifest/lock file changes
 * - Build config changes (next.config, vite.config, etc.)
 * - Any *.config.* file change
 *
 * Routes with no file mapping are always included (safe default).
 *
 * @param routes       - All discovered routes
 * @param changedFiles - Files that changed (absolute paths)
 * @param graph        - Forward edge map: file → set of files it imports
 * @param routeFileMap - Route path → entry file paths mapping
 * @returns Filtered array of affected routes
 */
export function filterAffectedRoutes(
  routes: Route[],
  changedFiles: string[],
  graph: Map<string, Set<string>>,
  routeFileMap: Map<string, string[]>,
): Route[] {
  const projectDir = process.cwd();

  // Check for global impact files first — if any match, ALL routes are affected
  for (const file of changedFiles) {
    const globalPattern = isGlobalImpactFile(file, projectDir);
    if (globalPattern) {
      logger.info(
        `Global impact file changed: ${globalPattern} — all routes affected`,
      );
      return [...routes];
    }
  }

  // Build reverse dependency graph
  const reverseGraph = buildReverseGraph(graph);

  // Find ALL transitively affected files
  const allAffected = new Set<string>();
  for (const changedFile of changedFiles) {
    allAffected.add(changedFile);
    const dependents = getTransitiveDependents(changedFile, reverseGraph);
    for (const dep of dependents) allAffected.add(dep);
  }

  // Determine which routes are affected
  const affected: Route[] = [];

  for (const route of routes) {
    const entryFiles = routeFileMap.get(route.path);

    // No file mapping → include route (safe default — never miss a regression)
    if (!entryFiles || entryFiles.length === 0) {
      affected.push(route);
      continue;
    }

    // Check if any of the route's entry files are in the affected set
    if (entryFiles.some((file) => allAffected.has(file))) {
      affected.push(route);
    }
  }

  return affected;
}
