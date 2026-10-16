import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../src/db/store.js';
import { getMemoryScreenshotStore, resetMemoryScreenshotStore } from '../src/storage/screenshots.js';
import {
  parseScreenshotName,
  persistScreenshots,
  promoteRunCurrentScreenshotsToBaseline,
  selectApprovedBaselineScreenshots,
  type PendingScreenshot,
} from '../src/storage/persist-screenshots.js';

describe('parseScreenshotName', () => {
  it('parses a standard reporter image basename', () => {
    expect(parseScreenshotName('home_1440_chromium_0_baseline')).toEqual({
      route: '/home',
      viewport: 1440,
      browser: 'chromium',
      type: 'baseline',
    });
  });

  it('maps the root sentinel to /', () => {
    expect(parseScreenshotName('_root_390_webkit_2_current')?.route).toBe('/');
    expect(parseScreenshotName('0_index_1440_chromium_0_current')?.route).toBe('/');
  });

  it('recovers nested routes when knownRoutes are supplied (with or without CLI index prefix)', () => {
    const knownRoutes = ['/', '/blog/post-1', '/docs/api/v2'];
    expect(
      parseScreenshotName('0_blog_post-1_1440_chromium_0_current', knownRoutes),
    ).toEqual({
      route: '/blog/post-1',
      viewport: 1440,
      browser: 'chromium',
      type: 'current',
    });
    expect(
      parseScreenshotName('docs_api_v2_375_webkit_1_diff', knownRoutes),
    ).toEqual({
      route: '/docs/api/v2',
      viewport: 375,
      browser: 'webkit',
      type: 'diff',
    });
  });

  it('rejects unknown browsers and malformed names', () => {
    expect(parseScreenshotName('home_1440_safari_0_baseline')).toBeNull();
    expect(parseScreenshotName('not-an-image-name')).toBeNull();
    expect(parseScreenshotName('home_1440_chromium_0_unknown')).toBeNull();
  });
});

describe('persistScreenshots', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
    resetMemoryScreenshotStore();
  });

  it('writes bytes to the blob store and metadata to the run store, namespaced per user', async () => {
    const blobs = getMemoryScreenshotStore();
    const shots: PendingScreenshot[] = [
      { name: 'home_1440_chromium_0_baseline', type: 'baseline', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'home_1440_chromium_0_current', type: 'current', bytes: new Uint8Array([4, 5]) },
    ];

    const count = await persistScreenshots(store, blobs, 'user-1', 'run-9', shots);
    expect(count).toBe(2);

    const records = await store.listScreenshots('run-9');
    expect(records.length).toBe(2);
    // Keys are namespaced under the user and run.
    for (const r of records) {
      expect(r.r2Key.startsWith('user-1/run-9/')).toBe(true);
      const bytes = await blobs.get(r.r2Key);
      expect(bytes).not.toBeNull();
    }
    expect(records.find((r) => r.type === 'baseline')?.sizeBytes).toBe(3);
  });

  it('skips screenshots whose names do not parse and still persists the rest', async () => {
    const blobs = getMemoryScreenshotStore();
    const shots: PendingScreenshot[] = [
      { name: 'garbage', type: 'baseline', bytes: new Uint8Array([1]) },
      { name: 'pricing_768_firefox_0_diff', type: 'diff', bytes: new Uint8Array([9]) },
    ];
    const count = await persistScreenshots(store, blobs, 'u', 'r', shots);
    expect(count).toBe(1);
    expect((await store.listScreenshots('r')).length).toBe(1);
  });

  it('prefers current over baseline in selectApprovedBaselineScreenshots and promotes current on approval', async () => {
    const blobs = getMemoryScreenshotStore();
    await persistScreenshots(
      store,
      blobs,
      'u1',
      'r1',
      [
        { name: '0_blog_post-1_1440_chromium_0_baseline', type: 'baseline', bytes: new Uint8Array([1]) },
        { name: '0_blog_post-1_1440_chromium_0_current', type: 'current', bytes: new Uint8Array([2, 3]) },
        { name: '1_pricing_1440_chromium_0_current', type: 'current', bytes: new Uint8Array([4]) },
      ],
      ['/blog/post-1', '/pricing'],
    );
    const allShots = await store.listScreenshots('r1');
    const selected = selectApprovedBaselineScreenshots(allShots);
    expect(selected).toHaveLength(2);
    expect(selected.find((s) => s.route === '/blog/post-1')?.type).toBe('current');
    expect(selected.find((s) => s.route === '/pricing')?.type).toBe('current');

    await promoteRunCurrentScreenshotsToBaseline(store, 'r1');
    const afterPromote = await store.listScreenshots('r1');
    expect(
      afterPromote.find((s) => s.route === '/pricing' && s.type === 'baseline'),
    ).toBeDefined();
  });
});
