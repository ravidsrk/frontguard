/**
 * Store factory (Task 5.2).
 *
 * Returns the appropriate {@link Store} implementation based on the Worker
 * environment bindings:
 * - If a D1 `DB` binding is present → {@link D1Store}.
 * - Otherwise → a process-wide singleton {@link InMemoryStore} (dev & tests).
 *
 * @module db/factory
 */

import { InMemoryStore, type Store } from './store.js';
import { D1Store, type D1Database } from './d1-store.js';

/** Worker bindings the API expects (all optional for local dev/tests). */
export interface Bindings {
  /** Cloudflare D1 database binding. */
  DB?: D1Database;
  /** Cloudflare R2 bucket for screenshots. */
  SCREENSHOTS?: unknown;
  /** GitHub OAuth client id. */
  GITHUB_CLIENT_ID?: string;
  /** GitHub OAuth client secret. */
  GITHUB_CLIENT_SECRET?: string;
  /** Public base URL of this API (for OAuth redirect). */
  API_BASE_URL?: string;
  /** Public base URL for serving screenshots/reports. */
  PUBLIC_BASE_URL?: string;
  /** Secret used to sign dashboard session cookies. */
  DASHBOARD_SESSION_SECRET?: string;
  /** Base URL of the GitHub App integration (for the check-run callback). */
  GITHUB_APP_URL?: string;
  /** Shared bearer secret presented to the GitHub App completion callback. */
  FRONTGUARD_CALLBACK_SECRET?: string;
  /**
   * Daytona API key — when set, runs execute in an ephemeral Daytona sandbox
   * via {@link ../processor.processRun}; when unset, the processor emits a
   * baseline-marker result. Workers has no Node env globals, so this binding
   * is the only source of truth.
   */
  DAYTONA_API_KEY?: string;
}

/**
 * Singleton in-memory store. Shared across all requests in a single process so
 * that, e.g., a run created in one request is visible to a later status check.
 */
let memoryStore: InMemoryStore | null = null;

/** Returns the process-wide in-memory store, creating it on first use. */
export function getMemoryStore(): InMemoryStore {
  if (!memoryStore) memoryStore = new InMemoryStore();
  return memoryStore;
}

/** Resets the in-memory store (test helper). */
export function resetMemoryStore(): void {
  memoryStore = new InMemoryStore();
}

/**
 * Resolves the {@link Store} for the given Worker bindings.
 *
 * @param env - Worker bindings (may be empty in dev/tests).
 */
export function getStore(env: Bindings | undefined): Store {
  if (env?.DB) return new D1Store(env.DB);
  return getMemoryStore();
}

/** Returns true when running against a real D1 binding (production mode). */
export function isProduction(env: Bindings | undefined): boolean {
  return !!env?.DB;
}
