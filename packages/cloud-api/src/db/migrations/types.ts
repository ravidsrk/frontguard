/**
 * Migration registry types (DM-1).
 *
 * @module db/migrations/types
 */

/** A single versioned migration script in the ordered registry. */
export interface Migration {
  /** Numeric version id, e.g. `001`, `002`. */
  readonly version: string;
  /** Short slug for logs and ops (e.g. `baseline`, `dm1_test_col`). */
  readonly name: string;
  /** SQL statements executed atomically when this version is pending. */
  readonly sql: string;
}