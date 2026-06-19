/**
 * Ordered schema migrations (DM-1).
 *
 * v1 is the canonical baseline from {@link ../schema.sql}. To add a migration:
 * 1. Create `migrations/NNN_description.sql` with additive DDL.
 * 2. Export its SQL as a string constant (Workers cannot import `.sql` files).
 * 3. Append `{ version: 'NNN', sql: ... }` below in numeric order.
 *
 * @module db/migrations
 */

import { SCHEMA_SQL } from '../schema.js';

/** A single versioned migration script. */
export interface Migration {
  /** Numeric version id, e.g. `001`, `002`. */
  readonly version: string;
  /** SQL statements executed atomically when this version is pending. */
  readonly sql: string;
}

/**
 * All migrations in apply order. Only pending versions are run; applied
 * versions are recorded in `schema_migrations`.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: '001', sql: SCHEMA_SQL },
];