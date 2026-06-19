/**
 * D1 migration runner (Task 5.2, DM-1).
 *
 * Applies ordered, versioned migrations against a D1 database. Each pending
 * migration runs inside a transaction and is recorded in `schema_migrations`.
 * Re-running {@link migrate} is idempotent.
 *
 * v1 is the canonical `schema.sql` baseline (`CREATE TABLE IF NOT EXISTS`).
 * Later migrations are additive `ALTER TABLE` / `CREATE INDEX` files.
 *
 * For local dev, `npm run db:migrate` invokes `wrangler d1 execute`. This
 * module is the programmatic path used by tests and deploy hooks.
 *
 * @module db/migrate
 */

import type { D1Database } from './d1-store.js';
import { MIGRATIONS, type Migration } from './migrations/index.js';

export type { Migration } from './migrations/index.js';

const LEDGER_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

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

/** Options for {@link migrate}. */
export interface MigrateOptions {
  /** Override the default migration list (tests may append versions). */
  migrations?: readonly Migration[];
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

/** True when the v1 baseline tables already exist (pre-ledger databases). */
async function hasBaselineSchema(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .first<{ name: string }>();
  return row !== null;
}

async function recordMigration(db: D1Database, version: string): Promise<void> {
  await db
    .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
    .bind(version, new Date().toISOString())
    .run();
}

async function runStatements(db: D1Database, statements: string[]): Promise<void> {
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

/**
 * Applies a single migration inside a transaction and records it in the ledger.
 */
async function applyMigration(db: D1Database, migration: Migration): Promise<number> {
  const statements = splitStatements(migration.sql);
  await db.exec('BEGIN');
  try {
    await runStatements(db, statements);
    await recordMigration(db, migration.version);
    await db.exec('COMMIT');
    return statements.length;
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures; surface the original error.
    }
    throw err;
  }
}

/**
 * Stamps a migration as applied without executing SQL (legacy baseline adopt).
 */
async function stampMigration(db: D1Database, version: string): Promise<void> {
  await db.exec('BEGIN');
  try {
    await recordMigration(db, version);
    await db.exec('COMMIT');
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures; surface the original error.
    }
    throw err;
  }
}

/**
 * Runs pending migrations against the given D1 database.
 *
 * @returns The number of SQL statements executed across newly applied migrations.
 */
export async function migrate(db: D1Database, options?: MigrateOptions): Promise<number> {
  const migrations = options?.migrations ?? MIGRATIONS;
  await ensureLedger(db);
  const applied = await getAppliedVersions(db);

  let executed = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    if (migration.version === '001' && (await hasBaselineSchema(db))) {
      await stampMigration(db, migration.version);
      applied.add(migration.version);
      continue;
    }

    executed += await applyMigration(db, migration);
    applied.add(migration.version);
  }

  return executed;
}