/**
 * Route discovery via filesystem analysis.
 *
 * Detects popular frameworks (Next.js, Remix, SvelteKit, Nuxt) by checking
 * for characteristic config files and directory structures, then extracts
 * static routes from their file-based routing conventions.
 *
 * Dynamic segments like `[id]` and `[...slug]` are skipped with a warning
 * since they require runtime parameters that can't be inferred from the
 * filesystem alone.
 *
 * @module discovery/filesystem
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, parse as parsePath } from 'node:path';
import type { Route } from '../core/types.js';
import { logger } from '../utils/logger.js';

/** Supported framework identifiers */
type Framework = 'nextjs-app' | 'nextjs-pages' | 'remix' | 'sveltekit' | 'nuxt';

/** File extensions that represent page/route files */
const PAGE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.mdx', '.md',
]);

/**
 * Files that are framework internals, not renderable pages.
 * Checked against the filename stem (without extension).
 */
const SKIP_FILES = new Set([
  '_app', '_document', '_error', '_middleware',
  'layout', 'loading', 'error', 'not-found', 'template', 'default',
  'global-error', 'route', 'middleware',
]);

/**
 * Directories to skip during recursive scanning.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', '__tests__', '__mocks__', 'api',
  'components', 'lib', 'utils', 'hooks', 'styles',
]);

/**
 * Checks if a filename or directory name contains a dynamic segment.
 *
 * Matches patterns used by common frameworks:
 * - Next.js / Nuxt: `[id]`, `[...slug]`, `[[...slug]]`
 * - Remix: `$param`, `($param)`
 * - SvelteKit: `[slug]`, `[...rest]`
 */
function isDynamicSegment(name: string): boolean {
  return (
    name.includes('[') ||    // Next.js, Nuxt, SvelteKit: [slug], [...slug]
    name.startsWith('$') ||  // Remix: $slug
    name.includes('($')      // Remix optional: ($param)
  );
}

/**
 * Checks if a glob pattern matches common config filenames for a framework.
 *
 * @param projectDir - Project root
 * @param baseName - Config file base name (e.g. 'next.config')
 * @returns true if any matching config file exists
 */
function hasConfigFile(proj: string, baseName: string): boolean {
  const extensions = ['.ts', '.js', '.mjs', '.cjs', '.mts'];
  return extensions.some((ext) => existsSync(join(proj, baseName + ext)));
}

/**
 * Detects which framework is being used based on config files and directory structure.
 *
 * Detection order (first match wins):
 * 1. Next.js App Router — `next.config.*` + `app/` with `layout.*` or `page.*`
 * 2. Next.js Pages Router — `next.config.*` + `pages/` directory
 * 3. Remix — `remix.config.*` or `app/routes/` directory
 * 4. SvelteKit — `svelte.config.*` + `src/routes/`
 * 5. Nuxt — `nuxt.config.*` + `pages/`
 *
 * @param projectDir - Root directory of the project
 * @returns Detected framework and its route directory, or null
 */
function detectFramework(
  proj: string
): { framework: Framework; routeDir: string } | null {
  const hasNextConfig = hasConfigFile(proj, 'next.config');

  // Next.js App Router — check both app/ and src/app/
  if (hasNextConfig) {
    for (const candidate of ['src/app', 'app']) {
      const appDir = join(proj, candidate);
      if (existsSync(appDir)) {
        // App Router requires a layout or page file at root
        const hasLayout = PAGE_EXTENSIONS.has('.tsx') &&
          [...PAGE_EXTENSIONS].some(
            (ext) =>
              existsSync(join(appDir, `layout${ext}`)) ||
              existsSync(join(appDir, `page${ext}`))
          );
        if (hasLayout) {
          logger.info(`Detected Next.js App Router (${candidate}/)`);
          return { framework: 'nextjs-app', routeDir: appDir };
        }
      }
    }

    // Next.js Pages Router — check both pages/ and src/pages/
    for (const candidate of ['src/pages', 'pages']) {
      const pagesDir = join(proj, candidate);
      if (existsSync(pagesDir)) {
        logger.info(`Detected Next.js Pages Router (${candidate}/)`);
        return { framework: 'nextjs-pages', routeDir: pagesDir };
      }
    }
  }

  // Remix — remix.config.* or app/routes/ directory
  const hasRemixConfig = hasConfigFile(proj, 'remix.config');
  const remixRoutesDir = join(proj, 'app', 'routes');
  if (hasRemixConfig || existsSync(remixRoutesDir)) {
    if (existsSync(remixRoutesDir)) {
      logger.info('Detected Remix (app/routes/)');
      return { framework: 'remix', routeDir: remixRoutesDir };
    }
  }

  // SvelteKit — svelte.config.* + src/routes/
  const hasSvelteConfig = hasConfigFile(proj, 'svelte.config');
  const svelteRoutesDir = join(proj, 'src', 'routes');
  if (hasSvelteConfig && existsSync(svelteRoutesDir)) {
    logger.info('Detected SvelteKit (src/routes/)');
    return { framework: 'sveltekit', routeDir: svelteRoutesDir };
  }

  // Nuxt — nuxt.config.* + pages/
  const hasNuxtConfig = hasConfigFile(proj, 'nuxt.config');
  const nuxtPagesDir = join(proj, 'pages');
  if (hasNuxtConfig && existsSync(nuxtPagesDir)) {
    logger.info('Detected Nuxt (pages/)');
    return { framework: 'nuxt', routeDir: nuxtPagesDir };
  }

  return null;
}

/**
 * Checks if a file should be treated as a route entry point for the given framework.
 *
 * - Next.js App Router: only `page.{tsx,jsx,ts,js}` files
 * - Next.js Pages Router: any page-extension file except internals
 * - Remix: any page-extension file except internals
 * - SvelteKit: only `+page.svelte` files
 * - Nuxt: any `.vue` file except internals
 */
function isRouteFile(fileName: string, framework: Framework): boolean {
  const { name: stem, ext } = parsePath(fileName);

  if (!PAGE_EXTENSIONS.has(ext.toLowerCase())) return false;

  switch (framework) {
    case 'nextjs-app':
      return stem === 'page';
    case 'nextjs-pages':
      return !SKIP_FILES.has(stem);
    case 'remix':
      return !SKIP_FILES.has(stem);
    case 'sveltekit':
      return stem === '+page';
    case 'nuxt':
      return ext.toLowerCase() === '.vue' && !SKIP_FILES.has(stem);
    default:
      return false;
  }
}

/**
 * Converts a relative file path to a URL route path based on framework conventions.
 *
 * @param relativePath - Path relative to the route directory
 * @param framework - Detected framework
 * @returns Normalized route path (e.g. `/checkout`, `/about`)
 */
export function filePathToRoute(relativePath: string, framework: Framework): string | null {
  // Normalize separators to forward slashes
  let rpath = relativePath.replace(/\\/g, '/');

  // Remove the file extension
  const { ext } = parsePath(rpath);
  rpath = rpath.slice(0, -ext.length);

  // Ignore Next.js parallel route slots (@slot) and intercepting routes ((.)x, (..)x, (...)x)
  if (/(^|\/)@[^/]+(\/|$)/.test(rpath) || /\(\.+[^)]*\)/.test(rpath)) {
    return null;
  }

  // Strip route groups like (marketing) or (auth)
  rpath = rpath.replace(/\([^/]+\)\/?/g, '');

  switch (framework) {
    case 'nextjs-app':
      // app/checkout/page.tsx → /checkout
      // app/page.tsx → /
      rpath = rpath.replace(/(?:\/|^)page$/, '');
      if (rpath === 'page') rpath = '';
      break;

    case 'nextjs-pages':
      // pages/checkout.tsx → /checkout
      // pages/index.tsx → /
      rpath = rpath.replace(/\/index$/, '');
      if (rpath === 'index') rpath = '';
      break;

    case 'remix': {
      // Remix uses `.` as path separator in flat routes
      // e.g., `about.tsx` → `/about`, `checkout.step-1.tsx` → `/checkout/step-1`
      // `_index.tsx` → `/`, `dashboard._index.tsx` → `/dashboard`, `_auth.login.tsx` → `/login`
      const rawSegments = rpath.split(/[./]/).filter(Boolean);
      const hasIndex = rawSegments.some((seg) => seg === 'index' || seg === '_index');
      const filtered = rawSegments.filter(
        (seg) => seg !== 'index' && seg !== '_index' && !seg.startsWith('_'),
      );
      if (filtered.length === 0 && !hasIndex) {
        return null;
      }
      rpath = filtered.join('/');
      break;
    }

    case 'sveltekit':
      // src/routes/checkout/+page.svelte → /checkout
      rpath = rpath.replace(/(?:\/|^)\+page$/, '');
      if (rpath === '+page') rpath = '';
      break;

    case 'nuxt':
      // pages/checkout.vue → /checkout
      // pages/index.vue → /
      rpath = rpath.replace(/\/index$/, '');
      if (rpath === 'index') rpath = '';
      break;
  }

  // Ensure leading slash
  rpath = '/' + rpath;

  // Normalize double slashes and trailing slash
  rpath = rpath.replace(/\/+/g, '/');
  if (rpath.length > 1 && rpath.endsWith('/')) {
    rpath = rpath.slice(0, -1);
  }

  return rpath;
}

export { filePathToRoute as fileToRoute };

/**
 * Recursively scans a directory for route files.
 *
 * @param dir - Current directory to scan
 * @param baseDir - Root route directory (for relative path calculation)
 * @param framework - Detected framework (determines which files are routes)
 * @param routes - Accumulator for discovered routes
 * @param dynamicWarnings - Set of dynamic segments already warned about
 */
function scanDirectory(
  dir: string,
  baseDir: string,
  framework: Framework,
  routes: Route[],
  dynamicWarnings: Set<string>
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden files/dirs
    if (entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Skip known non-route directories
      if (SKIP_DIRS.has(entry)) continue;

      // Skip dynamic segment directories with a warning
      if (isDynamicSegment(entry)) {
        if (!dynamicWarnings.has(entry)) {
          dynamicWarnings.add(entry);
          logger.warn(
            `Skipping dynamic segment "${entry}" — ` +
              'add routes with parameters explicitly in your frontguard config'
          );
        }
        continue;
      }

      scanDirectory(fullPath, baseDir, framework, routes, dynamicWarnings);
    } else if (stat.isFile()) {
      const { name: stem } = parsePath(entry);

      // Skip dynamic segment files
      if (isDynamicSegment(stem) || isDynamicSegment(entry)) {
        if (!dynamicWarnings.has(entry)) {
          dynamicWarnings.add(entry);
          logger.warn(
            `Skipping dynamic file "${entry}" — ` +
              'add parameterized routes explicitly in your frontguard config'
          );
        }
        continue;
      }

      // Check if this file is a route entry for the framework
      if (!isRouteFile(entry, framework)) continue;

      const relativePath = relative(baseDir, fullPath);
      const rpath = filePathToRoute(relativePath, framework);
      if (rpath === null) continue;

      // Deduplicate
      if (!routes.some((r) => r.path === rpath)) {
        routes.push({
          path: rpath,
          label: rpath === '/' ? 'Home' : rpath,
          discoveredVia: 'filesystem',
        });
      }
    }
  }
}

/**
 * Discovers routes by analyzing the project's filesystem structure.
 *
 * Detects the framework and extracts routes from its file-based routing convention.
 *
 * Supported frameworks:
 * - **Next.js App Router** — scans `app/` (or `src/app/`) for `page.{tsx,jsx,ts,js}`
 * - **Next.js Pages Router** — scans `pages/` (or `src/pages/`) for page files
 * - **Remix** — scans `app/routes/` with flat-route dot notation
 * - **SvelteKit** — scans `src/routes/` for `+page.svelte` files
 * - **Nuxt** — scans `pages/` for `.vue` files
 *
 * Dynamic segments (`[slug]`, `$param`, etc.) are skipped with a warning.
 * API routes, layout files, loading files, and error boundaries are excluded.
 *
 * @param projectDir - Root directory of the project
 * @returns Array of discovered routes with `discoveredVia: 'filesystem'`, or null if no framework detected
 */
export function discoverRoutesFromFilesystem(proj: string): Route[] | null {
  const detection = detectFramework(proj);

  if (!detection) {
    logger.debug(
      'No supported framework detected for filesystem route discovery. ' +
        'Checked for: Next.js, Remix, SvelteKit, Nuxt.'
    );
    return null;
  }

  const { framework, routeDir } = detection;

  if (!existsSync(routeDir)) {
    logger.warn(`Route directory not found: ${routeDir}`);
    return null;
  }

  const routes: Route[] = [];
  const dynamicWarnings = new Set<string>();

  scanDirectory(routeDir, routeDir, framework, routes, dynamicWarnings);

  // Ensure root route exists (most apps have one)
  if (!routes.some((r) => r.path === '/')) {
    routes.unshift({
      path: '/',
      label: 'Home',
      discoveredVia: 'filesystem',
    });
  }

  logger.info(
    `Filesystem discovery (${framework}): found ${routes.length} route(s)` +
      (dynamicWarnings.size > 0
        ? ` (skipped ${dynamicWarnings.size} dynamic segment(s))`
        : '')
  );

  return routes;
}
