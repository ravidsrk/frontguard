import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryScreenshotStore,
  R2ScreenshotStore,
  screenshotKey,
  type R2Bucket,
} from '../src/storage/screenshots.js';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import {
  resetMemoryScreenshotStore,
  getMemoryScreenshotStore,
} from '../src/storage/screenshots.js';

describe('screenshotKey', () => {
  it('builds a sanitised, user-namespaced, deterministic key', () => {
    expect(screenshotKey('user1', 'run1', 'baseline', '/products/shoes', 1440, 'chromium')).toBe(
      'user1/run1/products_shoes-1440-chromium-baseline.png',
    );
  });
  it('maps the root path to "root"', () => {
    expect(screenshotKey('u', 'r', 'diff', '/', 375, 'webkit')).toBe('u/r/root-375-webkit-diff.png');
  });
  it('namespaces blobs by owning user', () => {
    const a = screenshotKey('userA', 'run1', 'current', '/', 1440, 'chromium');
    const b = screenshotKey('userB', 'run1', 'current', '/', 1440, 'chromium');
    expect(a).not.toBe(b);
    expect(a.startsWith('userA/run1/')).toBe(true);
    expect(b.startsWith('userB/run1/')).toBe(true);
  });
});

describe('MemoryScreenshotStore', () => {
  let store: MemoryScreenshotStore;
  beforeEach(() => {
    store = new MemoryScreenshotStore();
  });

  it('puts and gets bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await store.put('runs/r/baseline/a.png', bytes);
    expect(await store.get('runs/r/baseline/a.png')).toEqual(bytes);
    expect(await store.get('missing')).toBeNull();
  });

  it('deletes a single key', async () => {
    await store.put('k', new Uint8Array([1]));
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });

  it('deletes all blobs under a user/run prefix', async () => {
    await store.put('u1/r1/a-1440-chromium-baseline.png', new Uint8Array([1]));
    await store.put('u1/r1/a-1440-chromium-current.png', new Uint8Array([2]));
    await store.put('u1/r2/a-1440-chromium-baseline.png', new Uint8Array([3]));
    await store.deleteRun('u1', 'r1');
    expect(store.size()).toBe(1);
    expect(await store.get('u1/r2/a-1440-chromium-baseline.png')).not.toBeNull();
  });

  it('does not delete another user run with the same runId', async () => {
    await store.put('u1/r1/a-1440-chromium-baseline.png', new Uint8Array([1]));
    await store.put('u2/r1/a-1440-chromium-baseline.png', new Uint8Array([2]));
    await store.deleteRun('u1', 'r1');
    expect(await store.get('u2/r1/a-1440-chromium-baseline.png')).not.toBeNull();
  });
});

describe('R2ScreenshotStore', () => {
  // Minimal in-memory fake R2 bucket.
  function fakeBucket(): R2Bucket & { store: Map<string, Uint8Array> } {
    const map = new Map<string, Uint8Array>();
    return {
      store: map,
      async put(key, value) {
        map.set(key, new Uint8Array(value as ArrayBuffer));
      },
      async get(key) {
        const v = map.get(key);
        if (!v) return null;
        return { arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer };
      },
      async delete(key) {
        if (Array.isArray(key)) key.forEach((k) => map.delete(k));
        else map.delete(key);
      },
      async list({ prefix } = {}) {
        return {
          objects: [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })),
        };
      },
    };
  }

  it('round-trips bytes through R2', async () => {
    const bucket = fakeBucket();
    const store = new R2ScreenshotStore(bucket);
    const bytes = new Uint8Array([10, 20, 30]);
    await store.put('k', bytes);
    expect(await store.get('k')).toEqual(bytes);
  });

  it('deletes all run objects via list+delete (user-scoped)', async () => {
    const bucket = fakeBucket();
    const store = new R2ScreenshotStore(bucket);
    await store.put('u1/r1/a-1440-chromium-baseline.png', new Uint8Array([1]));
    await store.put('u1/r1/b-1440-chromium-current.png', new Uint8Array([2]));
    await store.put('u1/r2/x-1440-chromium-baseline.png', new Uint8Array([3]));
    await store.deleteRun('u1', 'r1');
    expect(bucket.store.size).toBe(1);
  });
});

describe('GET /v1/screenshots routes (dev mode)', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  const auth = (t = 'owner') => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  async function seedRun(token: string): Promise<string> {
    const res = await app.request('/v1/run', {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    return (await res.json()).id;
  }

  it('lists screenshots for an owned run', async () => {
    const runId = await seedRun('owner');
    // Manually attach a screenshot record + blob (simulating the processor).
    const store = getMemoryStore();
    const blobs = getMemoryScreenshotStore();
    const key = screenshotKey('owner-user', runId, 'baseline', '/', 1440, 'chromium');
    await blobs.put(key, new Uint8Array([137, 80, 78, 71]));
    await store.addScreenshot({
      id: 'shot1', runId, route: '/', viewport: 1440, browser: 'chromium',
      type: 'baseline', r2Key: key, sizeBytes: 4, createdAt: 'now',
    });

    const res = await app.request(`/v1/screenshots/${runId}`, { headers: auth('owner') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.screenshots[0].url).toContain('/raw');
  });

  it('streams raw PNG bytes', async () => {
    const runId = await seedRun('owner');
    const store = getMemoryStore();
    const blobs = getMemoryScreenshotStore();
    const key = screenshotKey('owner-user', runId, 'baseline', '/', 1440, 'chromium');
    await blobs.put(key, new Uint8Array([137, 80, 78, 71]));
    await store.addScreenshot({
      id: 'shot1', runId, route: '/', viewport: 1440, browser: 'chromium',
      type: 'baseline', r2Key: key, createdAt: 'now',
    });

    const res = await app.request(`/v1/screenshots/${runId}/shot1/raw`, { headers: auth('owner') });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(137);
  });

  it('blocks access to another user run screenshots', async () => {
    const runId = await seedRun('owner');
    const res = await app.request(`/v1/screenshots/${runId}`, { headers: auth('intruder') });
    expect(res.status).toBe(404);
  });
});
