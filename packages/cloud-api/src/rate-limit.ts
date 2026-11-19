/**
 * In-process, per-isolate rate limiter (REL-3).
 *
 * Cloudflare Workers run many ephemeral isolates; this map is NOT shared across
 * them — effective throughput is per-isolate, not global. A truly distributed
 * limiter needs Cloudflare Rate Limiting, Durable Objects, or KV (OPS infra).
 *
 * Uses ES Map insertion order for O(1) LRU touch and eviction instead of an
 * O(N) auxiliary array, so quiet/expired keys do not leak memory or cause O(N²)
 * rollover spikes.
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
 * All operations are amortized O(1) using Map's insertion-order iteration.
 */
export class BoundedRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly opts: BoundedRateLimiterOptions) {}

  /** Returns the current number of tracked keys (for tests). */
  get size(): number {
    return this.entries.size;
  }

  /** Clears all state (test helper). */
  reset(): void {
    this.entries.clear();
  }

  /**
   * Records one request for `key` and returns whether it is within the limit.
   */
  check(key: string, now = Date.now()): RateLimitResult {
    this.evictExpiredHead(now);

    let entry = this.entries.get(key);
    if (!entry || now > entry.resetAt) {
      if (entry) {
        this.entries.delete(key);
      }
      entry = { count: 0, resetAt: now + this.opts.windowMs };
      this.ensureCapacity();
      this.entries.set(key, entry);
    } else {
      // Refresh LRU position in O(1) by reinserting at the tail of the Map.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }

    entry.count++;

    return {
      allowed: entry.count <= this.opts.limit,
      limit: this.opts.limit,
      remaining: Math.max(0, this.opts.limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Evicts expired entries from the oldest (LRU) front of the Map.
   * Amortized O(1): every deleted entry was inserted once and never revisited.
   */
  private evictExpiredHead(now: number): void {
    for (const [k, entry] of this.entries) {
      if (now > entry.resetAt) {
        this.entries.delete(k);
      } else {
        break;
      }
    }
  }

  private ensureCapacity(): void {
    while (this.entries.size >= this.opts.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

/** Default /v1 API rate limiter — 100 req/min per user/client, max 10k keys. */
export const apiRateLimiter = new BoundedRateLimiter({
  limit: 100,
  windowMs: 60_000,
  maxEntries: 10_000,
});

/** Stricter rate limiter for test-alert endpoint to prevent Resend relay abuse. */
export const testAlertRateLimiter = new BoundedRateLimiter({
  limit: 5,
  windowMs: 60_000,
  maxEntries: 10_000,
});

/** Extracts a best-effort client IP from Cloudflare / proxy headers. */
export function clientIpFromHeaders(getHeader: (name: string) => string | undefined): string {
  const cfIp = getHeader('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const xff = getHeader('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  return 'unknown';
}

/**
 * Checks a rate limit key, sets standard `X-RateLimit-*` response headers, and
 * returns a 429 JSON response when exceeded (or `null` when allowed).
 */
export function enforceRateLimit(
  c: {
    header: (name: string, value: string) => void;
    json: (body: unknown, status?: 429) => Response;
  },
  key: string,
  limiter: BoundedRateLimiter = apiRateLimiter,
): Response | null {
  const rl = limiter.check(key);
  c.header('X-RateLimit-Limit', String(rl.limit));
  c.header('X-RateLimit-Remaining', String(rl.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    return c.json(
      {
        error: `Rate limit exceeded. Max ${rl.limit} requests per minute.`,
        retryAfter: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
      429,
    );
  }
  return null;
}
