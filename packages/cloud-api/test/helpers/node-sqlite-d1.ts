/**
 * Test helper: adapts Node's built-in `node:sqlite` to the minimal D1
 * interface used by {@link D1Store} and {@link migrate}. Avoids the
 * `better-sqlite3` native addon (which fails to build on Node 26).
 *
 * {@link D1Database.batch} is emulated with BEGIN/COMMIT/ROLLBACK so migration
 * rollback tests exercise the same all-or-nothing semantics as Cloudflare D1.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement } from '../../src/db/d1-store.js';

// `node:sqlite` is a built-in only on Node >= 22.5. CI also runs Node 20, where
// it is absent. Load it lazily (the `import type` above is erased at runtime) and
// expose a flag so suites can skip on Node 20 — the real runtime is workerd, so
// this shim only needs to back the unit tests on Node 22+.
const nodeRequire = createRequire(import.meta.url);
let DatabaseSyncCtor: typeof DatabaseSync | undefined;
export const nodeSqliteAvailable: boolean = (() => {
  try {
    DatabaseSyncCtor = (nodeRequire('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
    return true;
  } catch {
    return false;
  }
})();

export function createNodeSqliteD1(): { db: D1Database; raw: DatabaseSync } {
  if (!DatabaseSyncCtor) {
    throw new Error('node:sqlite is unavailable on this runtime (requires Node >= 22.5)');
  }
  const raw = new DatabaseSyncCtor(':memory:');

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