/**
 * Dev-mode user ids.
 *
 * A bearer token normally maps to `demo:<hash>`. Erasure keeps the write lock
 * for that id so an in-flight job cannot write into a recreated account.
 * The next sign-in with the same token gets a new id and leaves the old lock
 * in place.
 *
 * @module auth/demo-user
 */

import type { Store } from '../db/store.js';
import { hashKey } from './keys.js';

const MAX_ERASURE_GENERATIONS = 8;

/** User id for a dev bearer token. Does not create the user row. */
export async function allocateDemoUserId(store: Store, token: string): Promise<string> {
  const base = `demo:${await hashKey(token)}`;
  let userId = base;
  for (let generation = 0; generation < MAX_ERASURE_GENERATIONS; generation++) {
    if (await store.getUser(userId)) return userId;
    if (!(await store.accountWritesClosed(userId))) return userId;
    const closedAt = await store.accountWriteLockClosedAt(userId);
    const next = `${userId}:${closedAt ?? String(generation)}`;
    if (next === userId) return `${base}:${crypto.randomUUID()}`;
    userId = next;
  }
  return `${base}:${crypto.randomUUID()}`;
}
