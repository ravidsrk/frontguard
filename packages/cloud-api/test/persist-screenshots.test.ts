import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../src/db/store.js';
import { getMemoryScreenshotStore, resetMemoryScreenshotStore } from '../src/storage/screenshots.js';
import { parseScreenshotName, persistScreenshots, type PendingScreenshot } from '../src/storage/persist-screenshots.js';

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
});
