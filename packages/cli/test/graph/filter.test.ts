/**
 * Unit tests for the smart route filter (src/graph/filter.ts).
 *
 * We mock the `parser` and `resolver` modules that `smartFilter` delegates to,
 * so tests run without git, filesystem scanning, or real dependency parsing.
 */

import type { Route, FrontguardConfig } from '../../src/core/types.js';
import { smartFilter, type SmartFilterResult } from '../../src/graph/filter.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/graph/parser.js', () => ({
  buildDependencyGraph: vi.fn<(entryFiles: string[], projectDir: string) => Map<string, Set<string>>>(),
}));

vi.mock('../../src/graph/resolver.js', () => ({
  getChangedPaths: vi.fn<
    (dir: string) => { present: string[]; removed: string[]; pinnedDiffError?: string }
  >(),
  mapRoutesToFiles: vi.fn<(routes: Route[], dir: string) => Map<string, string[]>>(),
  filterAffectedRoutes: vi.fn<(
    routes: Route[],
    changed: string[],
    graph: Map<string, Set<string>>,
    routeFileMap: Map<string, string[]>,
  ) => Route[]>(),
  incompleteAnalysisReason: vi.fn(() => null),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import mocked modules so we can control their return values per test
import { buildDependencyGraph } from '../../src/graph/parser.js';
import { getChangedPaths, mapRoutesToFiles, filterAffectedRoutes, incompleteAnalysisReason } from '../../src/graph/resolver.js';

const mockedGetChangedPaths = vi.mocked(getChangedPaths);
const mockedIncompleteAnalysis = vi.mocked(incompleteAnalysisReason);
const mockedMapRoutesToFiles = vi.mocked(mapRoutesToFiles);
const mockedBuildDependencyGraph = vi.mocked(buildDependencyGraph);
const mockedFilterAffectedRoutes = vi.mocked(filterAffectedRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<FrontguardConfig>): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    workers: 4,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: '/tmp/fg-test',
    ...overrides,
  };
}

function route(path: string): Route {
  return { path };
}

function presentFiles(files: string[]): void {
  mockedGetChangedPaths.mockReturnValue({ present: files, removed: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('smartFilter', () => {
  const originalEvent = process.env.GITHUB_EVENT_NAME;
  const originalBase = process.env.FRONTGUARD_DIFF_BASE;

  beforeEach(() => {
    delete process.env.GITHUB_EVENT_NAME;
    delete process.env.FRONTGUARD_DIFF_BASE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEvent === undefined) delete process.env.GITHUB_EVENT_NAME;
    else process.env.GITHUB_EVENT_NAME = originalEvent;
    if (originalBase === undefined) delete process.env.FRONTGUARD_DIFF_BASE;
    else process.env.FRONTGUARD_DIFF_BASE = originalBase;
  });

  // -----------------------------------------------------------------------
  // Feature gate
  // -----------------------------------------------------------------------

  it('renders all routes on merge_group when no diff base is pinned', async () => {
    process.env.GITHUB_EVENT_NAME = 'merge_group';
    const routes = [route('/'), route('/pricing')];
    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toEqual(routes);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toMatch(/merge_group/);
    expect(mockedGetChangedPaths).not.toHaveBeenCalled();
  });

  it('keeps filtering on merge_group when FRONTGUARD_DIFF_BASE is set', async () => {
    process.env.GITHUB_EVENT_NAME = 'merge_group';
    process.env.FRONTGUARD_DIFF_BASE = 'abc123def';
    const routes = [route('/')];
    presentFiles([]);

    const result = await smartFilter(routes, makeConfig());

    expect(mockedGetChangedPaths).toHaveBeenCalled();
    expect(result.reason).toContain('no changes');
  });

  it('renders every route when --all-routes is set and leaves smartRender on', async () => {
    const routes = [route('/'), route('/about')];
    const result = await smartFilter(routes, makeConfig({ includeAllRoutes: true }));

    expect(result.filtered).toEqual(routes);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toContain('all routes requested');
    expect(mockedGetChangedPaths).not.toHaveBeenCalled();
  });

  it('renders all routes when the pinned diff base cannot be compared', async () => {
    mockedGetChangedPaths.mockReturnValue({
      present: ['/repo/app/page.tsx'],
      removed: [],
      pinnedDiffError: 'FRONTGUARD_DIFF_BASE abc could not be compared; rendering all routes',
    });
    const routes = [route('/'), route('/pricing')];
    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toEqual(routes);
    expect(result.reason).toContain('FRONTGUARD_DIFF_BASE');
    expect(mockedMapRoutesToFiles).not.toHaveBeenCalled();
  });

  it('returns all routes when smartRender is disabled', async () => {
    const routes = [route('/'), route('/about')];
    const result = await smartFilter(routes, makeConfig({ smartRender: false }));

    expect(result.filtered).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toContain('disabled');
  });

  // -----------------------------------------------------------------------
  // Empty inputs
  // -----------------------------------------------------------------------

  it('returns empty when routes array is empty', async () => {
    const result = await smartFilter([], makeConfig());

    expect(result.filtered).toHaveLength(0);
    expect(result.reason).toContain('no routes');
  });

  // -----------------------------------------------------------------------
  // No changed files → returns all routes
  // -----------------------------------------------------------------------

  it('returns all routes when no changed files detected', async () => {
    const routes = [route('/'), route('/pricing')];
    presentFiles([]);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.reason).toContain('no changes');
  });

  // -----------------------------------------------------------------------
  // Fallback when getChangedFiles throws
  // -----------------------------------------------------------------------

  it('falls back to all routes when getChangedFiles throws', async () => {
    const routes = [route('/'), route('/about')];
    mockedGetChangedPaths.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.reason).toContain('could not detect changed files');
  });

  // -----------------------------------------------------------------------
  // Fallback when mapRoutesToFiles throws
  // -----------------------------------------------------------------------

  it('falls back to all routes when mapRoutesToFiles throws', async () => {
    const routes = [route('/')];
    presentFiles(['/project/src/app/page.tsx']);
    mockedMapRoutesToFiles.mockImplementation(() => {
      throw new Error('permission denied');
    });

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(1);
    expect(result.reason).toContain('route-to-file mapping failed');
  });

  // -----------------------------------------------------------------------
  // Fallback when no entry files found
  // -----------------------------------------------------------------------

  it('falls back to all routes when no route entry files are found', async () => {
    const routes = [route('/'), route('/about')];
    presentFiles(['/project/src/utils.ts']);

    // All routes map to empty arrays (no files on disk)
    const fileMap = new Map<string, string[]>();
    fileMap.set('/', []);
    fileMap.set('/about', []);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.reason).toContain('no route entry files');
  });

  // -----------------------------------------------------------------------
  // Fallback when buildDependencyGraph throws
  // -----------------------------------------------------------------------

  it('falls back to all routes when buildDependencyGraph throws', async () => {
    const routes = [route('/')];
    presentFiles(['/project/src/app/page.tsx']);

    const fileMap = new Map<string, string[]>();
    fileMap.set('/', ['/project/src/app/page.tsx']);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    mockedBuildDependencyGraph.mockImplementation(() => {
      throw new Error('parse error');
    });

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(1);
    expect(result.reason).toContain('dependency graph build failed');
  });

  // -----------------------------------------------------------------------
  // Fallback when filterAffectedRoutes throws
  // -----------------------------------------------------------------------

  it('falls back to all routes when filterAffectedRoutes throws', async () => {
    const routes = [route('/'), route('/about')];
    presentFiles(['/project/src/utils.ts']);

    const fileMap = new Map<string, string[]>();
    fileMap.set('/', ['/project/src/app/page.tsx']);
    fileMap.set('/about', ['/project/src/app/about/page.tsx']);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    mockedBuildDependencyGraph.mockReturnValue(new Map());

    mockedFilterAffectedRoutes.mockImplementation(() => {
      throw new Error('unexpected');
    });

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.reason).toContain('route filtering failed');
  });

  // -----------------------------------------------------------------------
  // Direct dependency — only affected route is included
  // -----------------------------------------------------------------------

  it('includes only the route whose file is affected', async () => {
    const routes = [route('/'), route('/about'), route('/pricing')];
    const changedFiles = ['/project/src/app/about/page.tsx'];
    presentFiles(changedFiles);

    const fileMap = new Map<string, string[]>();
    fileMap.set('/', ['/project/src/app/page.tsx']);
    fileMap.set('/about', ['/project/src/app/about/page.tsx']);
    fileMap.set('/pricing', ['/project/src/app/pricing/page.tsx']);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    const graph = new Map<string, Set<string>>();
    mockedBuildDependencyGraph.mockReturnValue(graph);

    // Only /about is affected
    mockedFilterAffectedRoutes.mockReturnValue([route('/about')]);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].path).toBe('/about');
    expect(result.skipped).toHaveLength(2);
    expect(result.reason).toContain('1/3 routes affected');
  });

  // -----------------------------------------------------------------------
  // All routes affected
  // -----------------------------------------------------------------------

  it('reports all routes affected when every route matches', async () => {
    const routes = [route('/'), route('/about')];
    presentFiles(['/project/src/layout.tsx']);

    const fileMap = new Map<string, string[]>();
    fileMap.set('/', ['/project/src/app/page.tsx']);
    fileMap.set('/about', ['/project/src/app/about/page.tsx']);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    mockedBuildDependencyGraph.mockReturnValue(new Map());

    // All routes affected
    mockedFilterAffectedRoutes.mockReturnValue([route('/'), route('/about')]);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toContain('all 2 routes affected');
  });

  // -----------------------------------------------------------------------
  // Safety fallback — 0 affected routes renders all
  // -----------------------------------------------------------------------

  it('falls back to all routes when filter returns empty (safety fallback)', async () => {
    const routes = [route('/'), route('/about')];
    presentFiles(['/project/src/random.ts']);

    const fileMap = new Map<string, string[]>();
    fileMap.set('/', ['/project/src/app/page.tsx']);
    fileMap.set('/about', ['/project/src/app/about/page.tsx']);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);

    mockedBuildDependencyGraph.mockReturnValue(new Map());

    // 0 affected — triggers safety fallback
    mockedFilterAffectedRoutes.mockReturnValue([]);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered).toHaveLength(2);
    expect(result.reason).toContain('safety fallback');
  });

  it('renders every route when analysis is incomplete, even if a route was selected', async () => {
    const routes = [route('/'), route('/about')];
    mockedFilterAffectedRoutes.mockClear();
    presentFiles(['/project/public/brand.svg', '/project/app/about/page.tsx']);
    const fileMap = new Map<string, string[]>([
      ['/', ['/project/app/page.tsx']],
      ['/about', ['/project/app/about/page.tsx']],
    ]);
    mockedMapRoutesToFiles.mockReturnValue(fileMap);
    mockedBuildDependencyGraph.mockReturnValue(new Map());
    mockedIncompleteAnalysis.mockReturnValue('untraced static asset public/brand.svg — rendering all routes');
    mockedFilterAffectedRoutes.mockReturnValue([route('/about')]);

    const result = await smartFilter(routes, makeConfig());

    expect(result.filtered.map((item) => item.path)).toEqual(['/', '/about']);
    expect(result.skipped).toHaveLength(0);
    expect(result.reason).toContain('untraced static asset');
    expect(mockedFilterAffectedRoutes).not.toHaveBeenCalled();
  });
});
