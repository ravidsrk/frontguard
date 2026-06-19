/**
 * API key generation and hashing (Task 5.3).
 *
 * Keys are minted as `fg_<random>` and stored only as SHA-256 hashes — the
 * plaintext is shown to the user exactly once. Validation hashes the presented
 * key and looks up the hash in the store.
 *
 * @module auth/keys
 */

/** Prefix for all Frontguard API keys. */
export const KEY_PREFIX = 'fg_';

/** Maximum active API keys a single user may hold. */
export const MAX_KEYS_PER_USER = 10;

/**
 * Generates a new API key using the Web Crypto API (available in Workers and
 * modern Node). Returns the plaintext key — hash it with {@link hashKey} for
 * storage.
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${KEY_PREFIX}${random}`;
}

/**
 * Computes the SHA-256 hex hash of an API key. Async because Web Crypto's
 * `subtle.digest` is promise-based.
 */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns true if a string looks like a Frontguard API key. */
export function isApiKeyFormat(key: string): boolean {
  return /^fg_[0-9a-f]{48}$/.test(key);
}
