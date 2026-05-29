/**
 * Screenshot blob storage (Task 5.4).
 *
 * Abstracts where screenshot PNGs live:
 * - {@link R2ScreenshotStore} — Cloudflare R2 (production).
 * - {@link MemoryScreenshotStore} — in-process map (dev & tests).
 *
 * Image *metadata* (route, viewport, r2 key) is tracked in the {@link Store}
 * (D1); the raw bytes live here. Keys follow `runs/<runId>/<type>/<route>-<vp>-<browser>.png`.
 *
 * @module storage/screenshots
 */

/** Minimal R2 bucket typings (avoids @cloudflare/workers-types dependency). */
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
}

/** A stored screenshot reference. */
export interface ScreenshotBlob {
  key: string;
  bytes: Uint8Array;
}

/** Storage backend for screenshot bytes. */
export interface ScreenshotStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a run's prefix. */
  deleteRun(runId: string): Promise<void>;
}

/**
 * Builds a deterministic, collision-safe object key for a screenshot.
 * The route path is sanitised into a filename-safe slug.
 */
export function screenshotKey(
  runId: string,
  type: 'baseline' | 'current' | 'diff',
  route: string,
  viewport: number,
  browser: string,
): string {
  const slug = route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return `runs/${runId}/${type}/${slug}-${viewport}-${browser}.png`;
}

// ---------------------------------------------------------------------------
// R2 implementation
// ---------------------------------------------------------------------------

/** Cloudflare R2-backed screenshot store. */
export class R2ScreenshotStore implements ScreenshotStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    // R2 accepts ArrayBuffer; pass the underlying buffer slice.
    await this.bucket.put(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
  async get(key: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }
  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
  async deleteRun(runId: string): Promise<void> {
    const prefix = `runs/${runId}/`;
    const { objects } = await this.bucket.list({ prefix });
    if (objects.length > 0) {
      await this.bucket.delete(objects.map((o) => o.key));
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory implementation (dev & tests)
// ---------------------------------------------------------------------------

/** In-process screenshot store. Data is lost on restart. */
export class MemoryScreenshotStore implements ScreenshotStore {
  private blobs = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.blobs.set(key, bytes);
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
  async deleteRun(runId: string): Promise<void> {
    const prefix = `runs/${runId}/`;
    for (const key of [...this.blobs.keys()]) {
      if (key.startsWith(prefix)) this.blobs.delete(key);
    }
  }

  /** Test helper. */
  size(): number {
    return this.blobs.size;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let memoryScreenshots: MemoryScreenshotStore | null = null;

/** Singleton in-memory screenshot store. */
export function getMemoryScreenshotStore(): MemoryScreenshotStore {
  if (!memoryScreenshots) memoryScreenshots = new MemoryScreenshotStore();
  return memoryScreenshots;
}

/** Resets the in-memory screenshot store (tests). */
export function resetMemoryScreenshotStore(): void {
  memoryScreenshots = new MemoryScreenshotStore();
}

/** Resolves the screenshot store for the given R2 binding (or memory). */
export function getScreenshotStore(bucket: R2Bucket | undefined): ScreenshotStore {
  if (bucket) return new R2ScreenshotStore(bucket);
  return getMemoryScreenshotStore();
}
