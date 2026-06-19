import { describe, it, expect } from 'vitest';
import {
  routeToSlug,
  matchRouteFromSlug,
  buildMonitorScreenshotRefs,
  parseMonitorScreenshots,
  baselineRestoreFromRefs,
} from '../src/monitor-screenshots.js';
import { screenshotKey } from '../src/storage/screenshots.js';

describe('monitor-screenshots (REL-2 route round-trip)', () => {
  it('matches nested routes by slug without reverse-sanitizing', () => {
    expect(routeToSlug('/foo/bar')).toBe('foo_bar');
    expect(matchRouteFromSlug('foo_bar', ['/foo/bar', '/other'])).toBe('/foo/bar');
    expect(matchRouteFromSlug('foo_bar', ['/foo', '/bar'])).toBeUndefined();
  });

  it('round-trips deep nested and query-bearing routes', () => {
    const routes = ['/a/b/c', '/search?q=1'];
    expect(matchRouteFromSlug(routeToSlug('/a/b/c'), routes)).toBe('/a/b/c');
    expect(matchRouteFromSlug(routeToSlug('/search?q=1'), routes)).toBe('/search?q=1');
  });

  it('parseMonitorScreenshots recovers route from legacy string keys via monitor routes', () => {
    const routes = ['/foo/bar'];
    const key = screenshotKey('u1', 'run-1', 'baseline', '/foo/bar', 1440, 'chromium');
    const refs = parseMonitorScreenshots([key], routes);
    expect(refs).toHaveLength(1);
    expect(refs[0].route).toBe('/foo/bar');
    expect(refs[0].type).toBe('baseline');
  });

  it('baselineRestoreFromRefs uses stored original routes', () => {
    const bucket = { get: async () => null };
    const restore = baselineRestoreFromRefs(
      [
        {
          r2Key: 'u1/r1/foo_bar-1440-chromium-baseline.png',
          route: '/foo/bar',
          viewport: 1440,
          browser: 'chromium',
          type: 'baseline',
        },
      ],
      bucket,
    );
    expect(restore?.baselines[0].route).toBe('/foo/bar');
  });

  it('buildMonitorScreenshotRefs maps store records to original monitor routes', () => {
    const key = screenshotKey('u1', 'run-2', 'baseline', '/a/b/c', 1280, 'chromium');
    const refs = buildMonitorScreenshotRefs(['/a/b/c'], [
      {
        id: 's1',
        runId: 'run-2',
        route: '/a_b_c',
        viewport: 1280,
        browser: 'chromium',
        type: 'baseline',
        r2Key: key,
        sizeBytes: 10,
        createdAt: 'now',
      },
    ]);
    expect(refs[0].route).toBe('/a/b/c');
  });
});