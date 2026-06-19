/**
 * Test helper: adapts Node's built-in `node:sqlite` to the minimal D1
 * interface used by {@link D1Store} and {@link migrate}. Avoids the
 * `better-sqlite3` native addon (which fails to build on Node 26).
 *
 * {@link D1Database.batch} is emulated with BEGIN/COMMIT/ROLLBACK so migration
 * rollback tests exercise the same all-or-nothing semantics as Cloudflare D1.
 */
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from '../../src/db/d1-store.js';

export function createNodeSqliteD1(): { db: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');

  const prepare = (query: string): D1PreparedStatement => {
    let bound: unknown[] = [];
    const stmt: D1PreparedStatement = {
      bind(...values: unknown[]) {
        bound = values;
        return stmt;
      },
      async first<T>() {
        const row = raw.prepare(query).get(...bound);
        return (row as T) ?? null;
      },
      async all<T>() {
        const results = raw.prepare(query).all(...bound) as T[];
        return { results };
      },
      async run() {
        const info = raw.prepare(query).run(...bound);
        return { success: true, meta: { changes: info.changes } };
      },
    };
    return stmt;
  };

  const db: D1Database = {
    prepare,
    async exec(query: string) {
      raw.exec(query);
      return {};
    },
    async batch(statements: D1PreparedStatement[]) {
      raw.exec('BEGIN');
      try {
        const results: unknown[] = [];
        for (const stmt of statements) {
          results.push(await stmt.run());
        }
        raw.exec('COMMIT');
        return results;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          // Ignore rollback failures; surface the original error.
        }
        throw err;
      }
    },
  };

  return { db, raw };
}