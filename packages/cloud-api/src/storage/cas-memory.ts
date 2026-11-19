/**
 * Shared in-memory CAS blob fallback store (used when no R2 bucket is bound).
 * Kept in its own leaf module so both `routes/cas.ts` and account erasure
 * (`db/store.ts`, `db/d1-store.ts`) can read/purge it without circular imports.
 */

/** Maximum number of blobs retained in the fallback in-memory CAS store. */
export const MAX_CAS_MEMORY_BLOBS = 500;

/** In-memory CAS blob fallback map. */
export const casMemoryStore = new Map<string, Uint8Array>();

/** Resets the in-memory CAS blob store (test helper). */
export function resetCasMemoryStore(): void {
  casMemoryStore.clear();
}

/** Deletes all in-memory CAS blobs under `prefix` (e.g. `cas/<userId>/`). */
export function deleteCasMemoryPrefix(prefix: string): void {
  for (const key of [...casMemoryStore.keys()]) {
    if (key.startsWith(prefix)) {
      casMemoryStore.delete(key);
    }
  }
}
