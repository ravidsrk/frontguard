/**
 * In-process, per-isolate rate limiter (REL-3).
 *
 * Cloudflare Workers run many ephemeral isolates; this map is NOT shared across
 * them — effective throughput is per-isolate, not global. A truly distributed
 * limiter needs Cloudflare Rate Limiting, Durable Objects, or KV (OPS infra).
 *
 * This implementation is bounded and evicting so quiet/expired keys do not leak
 * memory for the isolate lifetime. Keys should be stable hashes (e.g. API key
 * SHA-256), never raw secrets.
 *
 * @module rate-limit
 */

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface BoundedRateLimiterOptions {
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum distinct keys tracked before LRU eviction. */
  maxEntries: number;
}

/**
 * Bounded, evicting token-bucket-style limiter keyed by a stable identifier.
 */
export class BoundedRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  /** LRU order — oldest at index 0. */
  private readonly lru: string[] = [];

  constructor(private readonly opts: BoundedRateLimiterOptions) {}

  /** Returns the current number of tracked keys (for tests). */
  get size(): number {
    return this.entries.size;
  }

  /** Clears all state (test helper). */
  reset(): void {
    this.entries.clear();
    this.lru.length = 0;
  }

  /**
   * Records one request for `key` and returns whether it is within the limit.
   */
  check(key: string, now = Date.now()): RateLimitResult {
    this.evictExpired(now);

    let entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.opts.windowMs };
      this.ensureCapacity(key, now);
      this.entries.set(key, entry);
      this.touchLru(key);
    } else {
      this.touchLru(key);
    }

    entry.count++;

    return {
      allowed: entry.count <= this.opts.limit,
      limit: this.opts.limit,
      remaining: Math.max(0, this.opts.limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now > entry.resetAt) {
        this.remove(key);
      }
    }
  }

  private ensureCapacity(incomingKey: string, now: number): void {
    if (this.entries.has(incomingKey)) return;
    while (this.entries.size >= this.opts.maxEntries) {
      const evicted = this.evictLru(now);
      if (!evicted) break;
    }
  }

  private evictLru(now: number): boolean {
    while (this.lru.length > 0) {
      const key = this.lru.shift()!;
      if (!this.entries.has(key)) continue;
      const entry = this.entries.get(key)!;
      if (now <= entry.resetAt) {
        this.remove(key);
        return true;
      }
      this.remove(key);
      return true;
    }
    return false;
  }

  private touchLru(key: string): void {
    const idx = this.lru.indexOf(key);
    if (idx >= 0) this.lru.splice(idx, 1);
    this.lru.push(key);
  }

  private remove(key: string): void {
    this.entries.delete(key);
    const idx = this.lru.indexOf(key);
    if (idx >= 0) this.lru.splice(idx, 1);
  }
}

/** Default /v1 API rate limiter — 100 req/min per hashed API key, max 10k keys. */
export const apiRateLimiter = new BoundedRateLimiter({
  limit: 100,
  windowMs: 60_000,
  maxEntries: 10_000,
});