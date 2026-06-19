/**
 * Screenshot blob storage (Task 5.4).
 *
 * Abstracts where screenshot PNGs live:
 * - {@link R2ScreenshotStore} — Cloudflare R2 (production).
 * - {@link MemoryScreenshotStore} — in-process map (dev & tests).
 *
 * Image *metadata* (route, viewport, r2 key) is tracked in the {@link Store}
 * (D1); the raw bytes live here. Keys are namespaced per-user so a run's blobs
 * are isolated by owner: `<userId>/<runId>/<route>-<vp>-<browser>-<type>.png`.
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
  /** Deletes every object under a run's prefix (scoped to the owning user). */
  deleteRun(userId: string, runId: string): Promise<void>;
}

/** Builds the per-user run prefix under which all of a run's blobs live. */
export function runPrefix(userId: string, runId: string): string {
  return `${userId}/${runId}/`;
}

/**
 * Builds a deterministic, collision-safe object key for a screenshot.
 * The route path is sanitised into a filename-safe slug. Keys are namespaced
 * by owner so blobs are isolated per user:
 * `<userId>/<runId>/<route>-<viewport>-<browser>-<type>.png`.
 */
export function screenshotKey(
  userId: string,
  runId: string,
  type: 'baseline' | 'current' | 'diff',
  route: string,
  viewport: number,
  browser: string,
): string {
  const slug = route.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  return `${runPrefix(userId, runId)}${slug}-${viewport}-${browser}-${type}.png`;
}

const KNOWN_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);

/** Parsed metadata recovered from a persisted screenshot object key. */
export interface ParsedScreenshotKey {
  route: string;
  viewport: number;
  browser: string;
  type: 'baseline' | 'current' | 'diff';
}

/**
 * Reverse-parses an object key produced by {@link screenshotKey}. Returns
 * `null` when the key does not match the expected shape.
 */
export function parseScreenshotKey(key: string): ParsedScreenshotKey | null {
  const filename = key.split('/').pop();
  if (!filename) return null;
  const base = filename.replace(/\.png$/i, '');
  const m = base.match(/^(.*)-(\d+)-([a-z]+)-(baseline|current|diff)$/);
  if (!m) return null;
  const [, slug, viewportStr, browser, type] = m;
  if (!KNOWN_BROWSERS.has(browser)) return null;
  const viewport = Number(viewportStr);
  if (!Number.isFinite(viewport)) return null;
  const route = slug === 'root' || slug === '' ? '/' : `/${slug}`;
  return { route, viewport, browser, type: type as ParsedScreenshotKey['type'] };
}

/**
 * Converts a route path to the safe filesystem segment the CLI uses for
 * baseline storage. Mirrors `sanitizeRoutePath` in the CLI's git-orphan
 * storage (`packages/cli/src/storage/git-orphan.ts`) so a baseline restored
 * into the sandbox lands at exactly the path the reporter reads back.
 *
 * `/` → `_root`; path traversal is collapsed; only `[A-Za-z0-9_-/]` survive.
 */
export function sanitizeRoutePath(route: string): string {
  let sanitized = route.replace(/^\/+/, '').replace(/\.\./g, '_');
  if (!sanitized || sanitized === '.') sanitized = '_root';
  return sanitized.replace(/[^a-zA-Z0-9_\-/]/g, '_');
}

/**
 * Path (relative to the repo/work dir) of a baseline PNG in the CLI's git
 * orphan-branch layout: `baselines/<sanitized-route>/<viewport>/<browser>.png`.
 *
 * The cloud runner restores prior baselines under this path and seeds them into
 * the `frontguard-baselines` orphan branch so `frontguard run` compares against
 * them instead of treating every screenshot as a new baseline (cloud-1).
 */
export function orphanBaselinePath(route: string, viewport: number, browser: string): string {
  return `baselines/${sanitizeRoutePath(route)}/${viewport}/${browser}.png`;
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
  async deleteRun(userId: string, runId: string): Promise<void> {
    const prefix = runPrefix(userId, runId);
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
  async deleteRun(userId: string, runId: string): Promise<void> {
    const prefix = runPrefix(userId, runId);
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
