/**
 * Test helper: adapts `better-sqlite3` to the minimal D1 interface used by
 * {@link D1Store}. Lets us exercise the real SQL against an in-process SQLite
 * database without a Cloudflare runtime.
 */
import Database from 'better-sqlite3';
import type { D1Database, D1PreparedStatement } from '../../src/db/d1-store.js';

export function createSqliteD1(): { db: D1Database; raw: Database.Database } {
  const raw = new Database(':memory:');

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
  };

  return { db, raw };
}
