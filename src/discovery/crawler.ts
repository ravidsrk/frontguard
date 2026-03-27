/**
 * Route discovery via Playwright crawling.
 *
 * Performs a breadth-first crawl starting from a configured URL,
 * extracting same-origin links and building a list of renderable routes.
 * Includes cycle detection, API route filtering, URL canonicalization,
 * authentication support, and comprehensive error handling.
 *
 * @module discovery/crawler
 */

import type { FrontguardConfig, Route } from '../core/types.js';
import { logger } from '../utils/logger.js';

// Cached Playwright module to avoid repeated dynamic imports
let _playwrightModule: typeof import('playwright') | undefined;

/** Patterns that indicate an API / non-page endpoint */
const API_PATTERNS = [
  /\/api\//i,
  /\/graphql/i,
  /\/webhook/i,
  /\/_next\//i,
  /\/__/,
  /\/\.well-known\//i,
  /\/sitemap/i,
  /\/robots\.txt$/i,
  /\/favicon\.ico$/i,
  /\/manifest\.json$/i,
];

/** File extensions that are definitely not renderable pages */
const NON_PAGE_EXTENSIONS = [
  '.pdf', '.zip', '.tar', '.gz', '.bz2',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico',
  '.mp4', '.mp3', '.webm', '.ogg', '.wav',
  '.woff', '.woff2', '.ttf', '.eot',
  '.css', '.js', '.mjs', '.cjs', '.map',
  '.json', '.xml', '.rss', '.atom',
  '.txt', '.csv', '.xls', '.xlsx', '.doc', '.docx',
];

/**
 * Canonicalizes a URL for consistent comparison and cycle detection.
 *
 * - Strips query parameters
 * - Strips hash (unless hash routing is detected)
 * - Normalizes trailing slashes (preserves root `/`)
 * - Lowercases the origin
 *
 * @param url - Raw URL string
 * @param keepHash - Whether to preserve the hash (for hash-based routing)
 * @returns Canonicalized URL string
 */
function canonicalize(url: string, keepHash = false): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    if (!keepHash) {
      parsed.hash = '';
    }
    // Normalize trailing slash (keep root /)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Checks if a URL matches an API / non-page pattern.
 */
function isApiRoute(url: string): boolean {
  return API_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Checks if a URL points to a non-page file by extension.
 */
function isNonPageFile(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return NON_PAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Checks if a URL matches any of the user-provided exclude patterns.
 *
 * Patterns are tried as RegExp first, then as simple substring matches
 * with basic glob support (`*` → `.*`).
 */
function isExcluded(url: string, excludePatterns: string[]): boolean {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  })();

  return excludePatterns.some((pattern) => {
    // Try as regex first
    try {
      const regex = new RegExp(pattern);
      return regex.test(pathname) || regex.test(url);
    } catch {
      // Treat as glob — convert `*` to `.*`
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      try {
        const globRegex = new RegExp(`^${escaped}$`);
        return globRegex.test(pathname);
      } catch {
        return pathname.includes(pattern);
      }
    }
  });
}

/**
 * Discovers routes by crawling from a start URL using Playwright.
 *
 * Performs a breadth-first crawl of the application, following same-origin
 * `<a href>` links up to a configurable depth and route count.
 *
 * Features:
 * - BFS crawl with configurable depth (default 3) and route cap (default 200)
 * - Cycle detection via canonical URL set
 * - API route detection and auto-filtering (`/api/*`, `/_next/*`, `/graphql*`)
 * - URL canonicalization (strips query params, normalizes slashes)
 * - User-provided exclude patterns (glob + regex)
 * - Non-HTML content-type detection and skip
 * - Playwright auth via storageState
 * - 10s per-page discovery timeout
 * - Clear error messages for unreachable base URLs and zero-route results
 *
 * @param config - Frontguard configuration with discover options
 * @returns Array of discovered routes with `discoveredVia: 'crawl'`
 * @throws Error if the base URL is unreachable or zero routes are found
 */
export async function discoverRoutes(config: FrontguardConfig): Promise<Route[]> {
  if (!config.discover) {
    logger.warn('No discover options configured, returning empty routes');
    return [];
  }

  const {
    startUrl = '/',
    maxDepth = 3,
    maxRoutes = 200,
    exclude = [],
  } = config.discover;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(config.baseUrl).origin;
  } catch {
    throw new Error(
      `Invalid baseUrl "${config.baseUrl}". ` +
        'Provide a valid URL like "http://localhost:3000" or "https://example.com".'
    );
  }

  // Resolve startUrl relative to baseUrl
  const resolvedStartUrl = startUrl.startsWith('http')
    ? startUrl
    : new URL(startUrl, config.baseUrl).href;

  // Lazy import to avoid loading Playwright when unused; cached after first load
  if (!_playwrightModule) {
    _playwrightModule = await import('playwright');
  }
  const { chromium } = _playwrightModule;

  logger.debug('Launching headless Chromium for route discovery');

  const browser = await chromium.launch({ headless: true });

  // Build context options
  const contextOptions: Record<string, unknown> = {
    userAgent: 'Frontguard/0.1.0 (Visual Regression Crawler)',
  };

  // Apply auth storage state if configured
  if (config.auth?.storageState) {
    logger.debug(`Applying auth storageState: ${config.auth.storageState}`);
    contextOptions.storageState = config.auth.storageState;
  }

  const context = await browser.newContext(contextOptions);

  const visited = new Set<string>();
  const routes: Route[] = [];

  // BFS queue: [canonicalUrl, depth]
  const startCanonical = canonicalize(resolvedStartUrl);
  const queue: Array<[string, number]> = [[startCanonical, 0]];
  visited.add(startCanonical);

  // Discovery timeout per page (10s — faster than full render)
  const discoveryTimeout = 10_000;

  try {
    // Verify the base URL is reachable before starting the crawl
    const testPage = await context.newPage();
    try {
      const testResponse = await testPage.goto(resolvedStartUrl, {
        waitUntil: 'domcontentloaded',
        timeout: discoveryTimeout,
      });
      if (!testResponse) {
        throw new Error('No response received');
      }
      if (testResponse.status() >= 500) {
        throw new Error(`Server returned ${testResponse.status()}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await testPage.close();
      await context.close();
      await browser.close();
      throw new Error(
        `Cannot reach base URL "${resolvedStartUrl}": ${msg}. ` +
          'Suggestions:\n' +
          '  1. Verify the dev server is running (e.g. npm run dev)\n' +
          '  2. Check the baseUrl in your frontguard config\n' +
          '  3. Ensure the port is correct and not blocked by a firewall\n' +
          '  4. If using HTTPS, verify your certificates are valid'
      );
    }
    await testPage.close();

    // Main BFS loop
    while (queue.length > 0 && routes.length < maxRoutes) {
      const [currentUrl, depth] = queue.shift()!;

      if (depth > maxDepth) continue;

      logger.debug(`Crawling: ${currentUrl} (depth: ${depth}, routes: ${routes.length})`);

      let page;
      try {
        page = await context.newPage();

        const response = await page.goto(currentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: discoveryTimeout,
        });

        // Skip non-HTML responses
        const contentType = response?.headers()['content-type'] ?? '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
          logger.debug(`Skipping non-HTML: ${currentUrl} (${contentType})`);
          await page.close();
          continue;
        }

        // Extract the path relative to base
        const currentParsed = new URL(currentUrl);
        const routePath = currentParsed.pathname || '/';

        // Add to discovered routes (deduplicate by path)
        if (!routes.some((r) => r.path === routePath)) {
          const title = await page.title().catch(() => '');
          routes.push({
            path: routePath,
            label: title || routePath,
            discoveredVia: 'crawl',
          });
          logger.debug(`Discovered route: ${routePath} (${title || 'no title'})`);
        }

        // Don't follow links at max depth
        if (depth >= maxDepth) {
          await page.close();
          continue;
        }

        // Extract all <a href> links from the page
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter(
              (href) =>
                href &&
                !href.startsWith('javascript:') &&
                !href.startsWith('mailto:') &&
                !href.startsWith('tel:') &&
                !href.startsWith('data:') &&
                !href.startsWith('blob:')
            );
        });

        for (const link of links) {
          // Infinite loop protection
          if (routes.length >= maxRoutes) break;

          const canonical = canonicalize(link);

          // Skip already visited
          if (visited.has(canonical)) continue;

          // Only follow same-origin links
          try {
            const linkOrigin = new URL(canonical).origin;
            if (linkOrigin !== baseOrigin) continue;
          } catch {
            continue;
          }

          // Skip API / non-page routes
          if (isApiRoute(canonical)) {
            logger.debug(`Skipping API route: ${canonical}`);
            continue;
          }

          // Skip non-page files
          if (isNonPageFile(canonical)) continue;

          // Check user-defined exclude patterns
          if (isExcluded(canonical, exclude)) {
            logger.debug(`Excluded by pattern: ${canonical}`);
            continue;
          }

          visited.add(canonical);
          queue.push([canonical, depth + 1]);
        }
      } catch (err) {
        logger.warn(
          `Failed to crawl ${currentUrl}: ${err instanceof Error ? err.message : err}`
        );
      } finally {
        if (page && !page.isClosed()) {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Validate results
  if (routes.length === 0) {
    throw new Error(
      `Zero routes discovered starting from "${resolvedStartUrl}". ` +
        'This usually means:\n' +
        '  1. The start page has no <a href> links to follow\n' +
        '  2. All links are to external domains\n' +
        '  3. The page relies entirely on JavaScript navigation (try increasing pageTimeout)\n' +
        '  4. All discovered URLs matched exclude patterns\n' +
        'Try adding routes manually in your frontguard config.'
    );
  }

  if (routes.length >= maxRoutes) {
    logger.warn(
      `Route discovery hit the ${maxRoutes} route cap. ` +
        'Increase discover.maxRoutes or narrow exclude patterns to discover more.'
    );
  }

  logger.info(
    `Crawler discovered ${routes.length} route(s) (visited ${visited.size} URLs, depth: ${maxDepth})`
  );

  return routes;
}
