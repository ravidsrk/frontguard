/**
 * D1 migration runner (Task 5.2).
 *
 * Applies the canonical schema (`schema.sql`) to a D1 database. Idempotent —
 * every statement uses `IF NOT EXISTS`, so re-running is safe.
 *
 * For local dev, `npm run db:migrate` invokes `wrangler d1 execute`. This
 * module is the programmatic path used by the deploy hook and tests.
 *
 * @module db/migrate
 */

import type { D1Database } from './d1-store.js';
import { SCHEMA_SQL } from './schema.js';

/**
 * Splits a SQL script into individual statements. Strips line *and* inline
 * comments (anything after `--` on a line), then splits on semicolons. Inline
 * comments must be removed before splitting because a comment may itself
 * contain a semicolon (e.g. "-- alerts suppressed; until then"), which would
 * otherwise produce a broken fragment.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Runs all schema statements against the given D1 database.
 *
 * @returns The number of statements executed.
 */
export async function migrate(db: D1Database): Promise<number> {
  const statements = splitStatements(SCHEMA_SQL);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
  return statements.length;
}
