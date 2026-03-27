import { describe, it, expect, afterEach } from 'vitest';
import { mapRoutesToFiles, filterAffectedRoutes } from '../../src/graph/resolver.js';
import { createTempDir, writeFiles } from '../fixtures/helpers.js';
import type { Route } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let cleanups: Array<() => void> = [];

function makeTempProject(files: Record<string, string>): string {
  const { dir, cleanup } = createTempDir();
  cleanups.push(cleanup);
  writeFiles(dir, files);
  return dir;
}

function route(path: string): Route {
  return { path, label: path === '/' ? 'Home' : path };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

// ---------------------------------------------------------------------------
// mapRoutesToFiles
// ---------------------------------------------------------------------------

describe('mapRoutesToFiles', () => {
  it('maps routes for Next.js App Router', () => {
    const dir = makeTempProject({
      'app/page.tsx': 'export default function Home() {}',
      'app/checkout/page.tsx': 'export default function Checkout() {}',
      'app/layout.tsx': 'export default function Layout({ children }) {}',
    });

    const routes = [route('/'), route('/checkout')];
    const result = mapRoutesToFiles(routes, dir);

    // Root route should find app/page.tsx and app/layout.tsx
    const rootFiles = result.get('/')!;
    expect(rootFiles.length).toBeGreaterThan(0);
    expect(rootFiles.some((f) => f.endsWith('page.tsx'))).toBe(true);

    // /checkout should find app/checkout/page.tsx
    const checkoutFiles = result.get('/checkout')!;
    expect(checkoutFiles.length).toBeGreaterThan(0);
    expect(checkoutFiles.some((f) => f.includes('checkout') && f.endsWith('page.tsx'))).toBe(true);
  });

  it('maps routes for Next.js Pages Router', () => {
    const dir = makeTempProject({
      'pages/index.tsx': 'export default function Home() {}',
      'pages/about.tsx': 'export default function About() {}',
      'pages/_app.tsx': 'export default function App() {}',
    });

    const routes = [route('/'), route('/about')];
    const result = mapRoutesToFiles(routes, dir);

    const rootFiles = result.get('/')!;
    expect(rootFiles.length).toBeGreaterThan(0);
    expect(rootFiles.some((f) => f.endsWith('index.tsx'))).toBe(true);

    const aboutFiles = result.get('/about')!;
    expect(aboutFiles.length).toBeGreaterThan(0);
    expect(aboutFiles.some((f) => f.endsWith('about.tsx'))).toBe(true);
  });

  it('maps routes for src/app (App Router in src)', () => {
    const dir = makeTempProject({
      'src/app/page.tsx': 'export default function Home() {}',
      'src/app/dashboard/page.tsx': 'export default function Dashboard() {}',
      'src/app/layout.tsx': 'export default function Layout() {}',
    });

    const routes = [route('/'), route('/dashboard')];
    const result = mapRoutesToFiles(routes, dir);

    const rootFiles = result.get('/')!;
    expect(rootFiles.length).toBeGreaterThan(0);

    const dashFiles = result.get('/dashboard')!;
    expect(dashFiles.length).toBeGreaterThan(0);
    expect(dashFiles.some((f) => f.includes('dashboard') && f.endsWith('page.tsx'))).toBe(true);
  });

  it('returns empty arrays for routes with no matching files', () => {
    const dir = makeTempProject({
      'app/page.tsx': 'export default function Home() {}',
    });

    const routes = [route('/nonexistent')];
    const result = mapRoutesToFiles(routes, dir);

    expect(result.get('/nonexistent')).toEqual([]);
  });

  it('returns empty arrays for unknown framework (no known dirs)', () => {
    const dir = makeTempProject({
      'index.html': '<html></html>',
      'style.css': 'body {}',
    });

    const routes = [route('/'), route('/about')];
    const result = mapRoutesToFiles(routes, dir);

    // Generic framework detection falls through to "generic" but no known dirs exist
    expect(result.get('/')!.length).toBe(0);
    expect(result.get('/about')!.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterAffectedRoutes
// ---------------------------------------------------------------------------

describe('filterAffectedRoutes', () => {
  const routes: Route[] = [
    route('/'),
    route('/about'),
    route('/pricing'),
    route('/contact'),
  ];

  it('returns ALL routes when a global-impact file is changed (package.json)', () => {
    const changedFiles = ['/project/package.json'];
    const graph = new Map<string, Set<string>>();
    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
      ['/pricing', ['/project/app/pricing/page.tsx']],
      ['/contact', ['/project/app/contact/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result).toHaveLength(routes.length);
    expect(result.map((r) => r.path)).toEqual(['/', '/about', '/pricing', '/contact']);
  });

  it('returns ALL routes when tailwind.config.ts changes', () => {
    const changedFiles = ['/project/tailwind.config.ts'];
    const graph = new Map<string, Set<string>>();
    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result).toHaveLength(routes.length);
  });

  it('returns only affected routes when a specific file changes', () => {
    const changedFiles = ['/project/app/about/page.tsx'];
    const graph = new Map<string, Set<string>>();
    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
      ['/pricing', ['/project/app/pricing/page.tsx']],
      ['/contact', ['/project/app/contact/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result.map((r) => r.path)).toEqual(['/about']);
  });

  it('includes routes with no file mapping as a safety fallback', () => {
    const changedFiles = ['/project/app/page.tsx'];
    const graph = new Map<string, Set<string>>();
    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', []], // No file mapping → always included
      ['/pricing', ['/project/app/pricing/page.tsx']],
      ['/contact', ['/project/app/contact/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result.map((r) => r.path)).toContain('/');
    expect(result.map((r) => r.path)).toContain('/about'); // included because no mapping
    expect(result.map((r) => r.path)).not.toContain('/pricing');
  });

  it('follows transitive dependencies through the graph', () => {
    // Scenario: /pricing/page.tsx imports utils/format.ts
    // utils/format.ts changed → /pricing should be affected
    const changedFiles = ['/project/utils/format.ts'];

    const graph = new Map<string, Set<string>>([
      ['/project/app/pricing/page.tsx', new Set(['/project/utils/format.ts'])],
    ]);

    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
      ['/pricing', ['/project/app/pricing/page.tsx']],
      ['/contact', ['/project/app/contact/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result.map((r) => r.path)).toContain('/pricing');
    expect(result.map((r) => r.path)).not.toContain('/contact');
  });

  it('returns empty array when no routes are affected', () => {
    const changedFiles = ['/project/some/unrelated/file.ts'];
    const graph = new Map<string, Set<string>>();
    const routeFileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
      ['/pricing', ['/project/app/pricing/page.tsx']],
      ['/contact', ['/project/app/contact/page.tsx']],
    ]);

    const result = filterAffectedRoutes(routes, changedFiles, graph, routeFileMap);
    expect(result).toHaveLength(0);
  });
});
