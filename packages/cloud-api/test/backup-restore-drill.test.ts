/**
 * Local restore drill for the cloud-api backup gate.
 *
 * Production was not drilled. This environment has no Cloudflare account
 * credentials for a customer database, and `wrangler.toml` still has
 * `database_id = "REPLACE_WITH_D1_DATABASE_ID"`. Neither
 * `wrangler d1 time-travel restore` nor `wrangler d1 export` was run.
 * The drill below restores a SQL script and baseline bytes into a new
 * SQLite file and compares them to the source snapshot taken before the
 * source was mutated.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { createLocalBackup } from '../src/db/sqlite-backup.js';
import { nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';

interface SqlStatement {
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): unknown;
}

interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

function openDatabase(path: string): SqlDb {
  const require = createRequire(import.meta.url);
  if (nodeSqliteAvailable) {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  }
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const db = new Database(path);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

function dumpTable(db: SqlDb, table: string): Array<Record<string, unknown>> {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all() as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = normalize(value);
    return out;
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('local backup restore drill', () => {
  it('restores the sql script and baseline bytes and they match the source snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-backup-'));
    const sourcePath = join(dir, 'source.sqlite');
    const restoredPath = join(dir, 'restored.sqlite');
    const scriptPath = join(dir, 'backup.sql');
    const blobPath = join(dir, 'baseline.png');
    try {
      const source = openDatabase(sourcePath);
      source.exec(SCHEMA_SQL);
      source
        .prepare(`INSERT INTO users (id, email, plan, created_at) VALUES (?, ?, ?, ?)`)
        .run('fixture-a', 'a@example.com', 'free', '2026-01-01T00:00:00Z');
      source
        .prepare(`INSERT INTO users (id, email, plan, created_at) VALUES (?, ?, ?, ?)`)
        .run('fixture-b', 'b@example.com', 'free', '2026-01-01T00:00:00Z');
      source
        .prepare(
          `INSERT INTO runs (id, user_id, status, config, report_html, baselines_approved, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('run-a', 'fixture-a', 'completed', '{}', "Alice's report", 1, '2026-01-02T00:00:00Z');
      source
        .prepare(
          `INSERT INTO runs (id, user_id, status, config, report_html, baselines_approved, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('run-b', 'fixture-b', 'completed', '{}', "Bob's report", 0, '2026-01-02T00:00:00Z');
      const baselineKey = 'fixture-a/run-a/root-1440-chromium-baseline.png';
      source
        .prepare(
          `INSERT INTO screenshots (id, run_id, route, viewport, browser, type, r2_key, size_bytes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('shot-a', 'run-a', '/', 1440, 'chromium', 'baseline', baselineKey, 9, '2026-01-02T00:00:00Z');

      const before = {
        users: dumpTable(source, 'users'),
        runs: dumpTable(source, 'runs'),
        screenshots: dumpTable(source, 'screenshots'),
      };
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
      const sourceHash = sha256(png);
      const backup = createLocalBackup(
        SCHEMA_SQL,
        [
          { name: 'users', rows: before.users },
          { name: 'runs', rows: before.runs },
          { name: 'screenshots', rows: before.screenshots },
        ],
        [{ key: baselineKey, bytes: png }],
      );
      writeFileSync(scriptPath, backup.sql);
      writeFileSync(blobPath, backup.blobs[0]!.bytes);
      png[0] = 0;

      source.prepare(`DELETE FROM screenshots`).run();
      source.prepare(`UPDATE runs SET report_html = ? WHERE id = ?`).run('mutated', 'run-a');
      expect(dumpTable(source, 'screenshots')).toEqual([]);
      expect(dumpTable(source, 'runs').find((row) => row.id === 'run-a')?.report_html).toBe('mutated');
      source.close();

      const restored = openDatabase(restoredPath);
      restored.exec(readFileSync(scriptPath, 'utf8'));
      expect({
        users: dumpTable(restored, 'users'),
        runs: dumpTable(restored, 'runs'),
        screenshots: dumpTable(restored, 'screenshots'),
      }).toEqual(before);
      const restoredKey = dumpTable(restored, 'screenshots')[0]?.r2_key;
      expect(restoredKey).toBe(baselineKey);
      restored.close();

      const restoredBytes = new Uint8Array(readFileSync(blobPath));
      expect(sha256(restoredBytes)).toBe(sourceHash);
      expect(Buffer.compare(restoredBytes, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]))).toBe(0);
      expect(png[0]).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
