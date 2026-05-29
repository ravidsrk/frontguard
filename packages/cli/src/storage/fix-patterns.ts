/**
 * Local fix-pattern database (Task 4.4) — the data moat.
 *
 * Stores accepted/rejected fixes in a local SQLite database at
 * `.frontguard/fix-patterns.db`. Before calling the AI for a new fix, callers
 * can check whether a similar pattern was previously accepted and reuse it,
 * saving an API call. Rejected fixes are kept as a negative signal.
 *
 * `better-sqlite3` is an **optional** native dependency. If it isn't installed
 * (or fails to load), this module degrades gracefully: every operation becomes
 * a no-op and `isAvailable()` returns false. The rest of Frontguard keeps
 * working without the pattern DB.
 *
 * @module storage/fix-patterns
 */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FixPattern, FixCategory, SuggestedFix, DiffResult } from '../core/types.js';
import { logger } from '../utils/logger.js';

/** Minimal structural type for the parts of better-sqlite3 we use. */
interface SqliteStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type SqliteConstructor = new (path: string) => SqliteDatabase;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fix_patterns (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  css_patch TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  accepted INTEGER NOT NULL,
  accept_count INTEGER NOT NULL DEFAULT 1,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  route TEXT,
  viewport INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_ctx ON fix_patterns(context_hash, accepted);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_cat ON fix_patterns(category);
`;

/**
 * Computes a stable hash of the visual context for a diff. Two regressions
 * with the same category/route/viewport/diff-magnitude hash to the same value,
 * so an accepted fix can be matched to similar future regressions.
 */
export function contextHashFor(diff: DiffResult, category: FixCategory): string {
  const magnitude = Math.round(diff.diffPercentage); // coarse bucket
  const key = `${category}|${diff.route.path}|${diff.viewport}|${magnitude}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/** Derives a deterministic pattern id from its content. */
export function patternId(contextHash: string, cssPatch: string): string {
  return createHash('sha256').update(`${contextHash}|${cssPatch}`).digest('hex').slice(0, 24);
}

/**
 * The fix-pattern database. Wraps an optional SQLite backend.
 */
export class FixPatternDB {
  private db: SqliteDatabase | null = null;
  private available = false;

  /**
   * @param path - Database file path. Defaults to `.frontguard/fix-patterns.db`.
   */
  constructor(private readonly path: string = '.frontguard/fix-patterns.db') {}

  /**
   * Opens the database, creating the schema if needed. Returns `true` if the
   * SQLite backend is available, `false` if it degraded to a no-op.
   */
  async open(): Promise<boolean> {
    if (this.db) return this.available;
    let Ctor: SqliteConstructor;
    try {
      const mod = await import('better-sqlite3');
      Ctor = (mod.default ?? mod) as unknown as SqliteConstructor;
    } catch {
      logger.debug('better-sqlite3 not available — fix-pattern DB disabled.');
      this.available = false;
      return false;
    }
    try {
      if (this.path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true });
      this.db = new Ctor(this.path);
      this.db.exec(SCHEMA);
      this.migrate();
      this.available = true;
      return true;
    } catch (err) {
      logger.warn(`Failed to open fix-pattern DB: ${err instanceof Error ? err.message : String(err)}`);
      this.available = false;
      return false;
    }
  }

  /**
   * Adds columns introduced after the original schema to pre-existing DBs.
   * `ADD COLUMN` throws if the column already exists, so each is guarded.
   */
  private migrate(): void {
    if (!this.db) return;
    const addColumn = (ddl: string): void => {
      try {
        this.db!.exec(ddl);
      } catch {
        /* column already exists — nothing to do */
      }
    };
    addColumn(`ALTER TABLE fix_patterns ADD COLUMN accept_count INTEGER NOT NULL DEFAULT 1`);
    addColumn(`ALTER TABLE fix_patterns ADD COLUMN last_used_at TEXT`);
  }

  /** Whether the SQLite backend is usable. */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Records a fix decision. Upserts by id: re-recording the same accepted fix
   * for the same context increments `accept_count` (so a repeatedly-accepted
   * pattern can cross the reuse threshold). Recording it as rejected resets the
   * acceptance state. `last_used_at` tracks the most recent recording.
   */
  record(
    fix: SuggestedFix,
    contextHash: string,
    accepted: boolean,
    meta?: { route?: string; viewport?: number },
  ): FixPattern | null {
    if (!this.db) return null;
    const id = patternId(contextHash, fix.patch);
    const now = new Date().toISOString();
    // On conflict, increment the accept_count only when this recording is an
    // acceptance; a rejection forces accepted=0 and leaves the count alone.
    this.db
      .prepare(
        `INSERT INTO fix_patterns (id, category, css_patch, context_hash, accepted, accept_count, confidence, created_at, last_used_at, route, viewport)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           accepted = excluded.accepted,
           accept_count = accept_count + CASE WHEN excluded.accepted = 1 THEN 1 ELSE 0 END,
           confidence = excluded.confidence,
           last_used_at = excluded.last_used_at`,
      )
      .run(
        id,
        fix.category,
        fix.patch,
        contextHash,
        accepted ? 1 : 0,
        accepted ? 1 : 0,
        fix.confidence,
        now,
        now,
        meta?.route ?? null,
        meta?.viewport ?? null,
      );
    return {
      id,
      category: fix.category,
      cssPatch: fix.patch,
      contextHash,
      accepted,
      confidence: fix.confidence,
      createdAt: now,
      route: meta?.route,
      viewport: meta?.viewport,
    };
  }

  /**
   * Finds a previously-accepted fix for the given context, but only if it has
   * been accepted at least `minAccepted` times (default 3) and never rejected.
   * Returns the most-recent matching CSS patch, or `null`.
   */
  findAcceptedPattern(contextHash: string, minAccepted = 3): { cssPatch: string; category: FixCategory } | null {
    if (!this.db) return null;
    const rejected = this.db
      .prepare(`SELECT COUNT(*) AS n FROM fix_patterns WHERE context_hash = ? AND accepted = 0`)
      .get(contextHash) as { n: number };
    if (rejected.n > 0) return null;

    // accept_count accumulates each time the same fix is recorded as accepted
    // for this context, so a single row can cross the reuse threshold.
    const row = this.db
      .prepare(
        `SELECT css_patch AS cssPatch, category, accept_count AS n
         FROM fix_patterns
         WHERE context_hash = ? AND accepted = 1 AND accept_count >= ?
         ORDER BY accept_count DESC, last_used_at DESC
         LIMIT 1`,
      )
      .get(contextHash, minAccepted) as { cssPatch: string; category: FixCategory; n: number } | undefined;
    return row ? { cssPatch: row.cssPatch, category: row.category } : null;
  }

  /** Returns a pattern by id, or null. */
  getById(id: string): FixPattern | null {
    if (!this.db) return null;
    const row = this.db.prepare(`SELECT * FROM fix_patterns WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToPattern(row) : null;
  }

  /** Marks an existing pattern accepted/rejected by id. Returns true if found. */
  setAccepted(id: string, accepted: boolean): boolean {
    if (!this.db) return false;
    const res = this.db
      .prepare(`UPDATE fix_patterns SET accepted = ? WHERE id = ?`)
      .run(accepted ? 1 : 0, id);
    return res.changes > 0;
  }

  /** Returns all patterns (for export). */
  exportAll(): FixPattern[] {
    if (!this.db) return [];
    const rows = this.db.prepare(`SELECT * FROM fix_patterns ORDER BY created_at`).all() as Record<string, unknown>[];
    return rows.map(rowToPattern);
  }

  /** Bulk-imports patterns (for sharing). Returns the number imported. */
  importAll(patterns: FixPattern[]): number {
    if (!this.db) return 0;
    let count = 0;
    const stmt = this.db.prepare(
      `INSERT INTO fix_patterns (id, category, css_patch, context_hash, accepted, confidence, created_at, route, viewport)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    for (const p of patterns) {
      const res = stmt.run(
        p.id,
        p.category,
        p.cssPatch,
        p.contextHash,
        p.accepted ? 1 : 0,
        p.confidence,
        p.createdAt,
        p.route ?? null,
        p.viewport ?? null,
      );
      count += res.changes;
    }
    return count;
  }

  /** Aggregate stats for reporting. */
  stats(): { total: number; accepted: number; rejected: number } {
    if (!this.db) return { total: 0, accepted: 0, rejected: 0 };
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) AS rejected
         FROM fix_patterns`,
      )
      .get() as { total: number; accepted: number | null; rejected: number | null };
    return { total: row.total, accepted: row.accepted ?? 0, rejected: row.rejected ?? 0 };
  }

  /** Closes the database. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.available = false;
    }
  }
}

function rowToPattern(row: Record<string, unknown>): FixPattern {
  return {
    id: String(row.id),
    category: row.category as FixCategory,
    cssPatch: String(row.css_patch),
    contextHash: String(row.context_hash),
    accepted: row.accepted === 1 || row.accepted === true,
    confidence: Number(row.confidence),
    createdAt: String(row.created_at),
    route: row.route != null ? String(row.route) : undefined,
    viewport: row.viewport != null ? Number(row.viewport) : undefined,
  };
}
