/**
 * D1 migration runner (Task 5.2, DM-1).
 *
 * Applies ordered, versioned migrations against a D1 database. Each pending
 * migration runs as one atomic {@link D1Database.batch} (D1's transactional
 * primitive) and is recorded in `schema_migrations`. Re-running
 * {@link migrate} is idempotent.
 *
 * v1 is the canonical `schema.sql` baseline (`CREATE TABLE IF NOT EXISTS`).
 * Later migrations are additive `ALTER TABLE` / `CREATE INDEX` files.
 *
 * For local dev, `npm run db:migrate` invokes `wrangler d1 execute`. This
 * module is the programmatic path used by tests and deploy hooks.
 *
 * @module db/migrate
 */

import type { D1Database, D1PreparedStatement } from './d1-store.js';
import { MIGRATIONS, type Migration } from './migrations/index.js';

export type { Migration } from './migrations/index.js';

const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

/** Options for {@link migrate} and {@link runMigrations}. */
export interface MigrateOptions {
  /** Override the migration registry (tests inject v2+ without touching prod). */
  migrations?: readonly Migration[];
}

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

async function ensureLedger(db: D1Database): Promise<void> {
  for (const stmt of splitStatements(LEDGER_SQL)) {
    await db.prepare(stmt).run();
  }
}

async function getAppliedVersions(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare('SELECT version FROM schema_migrations')
    .all<{ version: string }>();
  return new Set(results.map((row) => row.version));
}

/**
 * Applies a single migration atomically via D1 batch and records it in the ledger.
 */
async function applyMigration(db: D1Database, migration: Migration): Promise<number> {
  const statements = splitStatements(migration.sql);
  const appliedAt = new Date().toISOString();
  const batch: D1PreparedStatement[] = [
    ...statements.map((sql) => db.prepare(sql)),
    db
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .bind(migration.version, appliedAt),
  ];
  await db.batch(batch);
  return statements.length;
}

/**
 * Runs pending migrations from the given registry against a D1 database.
 *
 * @returns The number of SQL statements executed across newly applied migrations.
 */
export async function runMigrations(
  db: D1Database,
  options?: MigrateOptions,
): Promise<number> {
  const migrations = options?.migrations ?? MIGRATIONS;
  await ensureLedger(db);
  const applied = await getAppliedVersions(db);

  let executed = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    executed += await applyMigration(db, migration);
    applied.add(migration.version);
  }

  return executed;
}

/**
 * Runs pending migrations against a D1 database.
 *
 * @returns The number of SQL statements executed across newly applied migrations.
 */
export async function migrate(db: D1Database, options?: MigrateOptions): Promise<number> {
  return runMigrations(db, options);
}