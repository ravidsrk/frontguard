import { describe, it, expect } from 'vitest';
import { migrate, runMigrations, splitStatements, type Migration } from '../src/db/migrate.js';
import { MIGRATIONS } from '../src/db/migrations/index.js';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';

/** Test-scoped v2 migration — injected at runtime, not shipped in prod registry. */
const TEST_V2_MIGRATION: Migration = {
  version: '002',
  name: 'acceptance_test_col',
  sql: 'ALTER TABLE users ADD COLUMN dm1_test_col TEXT;',
};

/** Baseline tables from schema.sql (excludes the migration ledger). */
const BASELINE_TABLES = [
  'users',
  'api_keys',
  'runs',
  'screenshots',
  'usage',
  'teams',
  'team_members',
  'team_invitations',
  'team_projects',
  'baseline_approvals',
  'team_activity',
  'monitors',
  'monitor_runs',
  'monitor_alert_state',
  'masks',
  'screenshot_decisions',
  'run_attachments',
  'usage_alert_state',
] as const;

function listTables(raw: ReturnType<typeof createNodeSqliteD1>['raw']): Set<string> {
  const rows = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function assertBaselineTables(raw: ReturnType<typeof createNodeSqliteD1>['raw']): void {
  const tables = listTables(raw);
  for (const table of BASELINE_TABLES) {
    expect(tables.has(table), `missing baseline table: ${table}`).toBe(true);
  }
}

function assertLedger(
  raw: ReturnType<typeof createNodeSqliteD1>['raw'],
  versions: readonly string[],
): void {
  const ledger = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
    version: string;
  }>;
  expect(ledger.map((row) => row.version)).toEqual([...versions]);
}

function applySqlDirect(raw: ReturnType<typeof createNodeSqliteD1>['raw'], sql: string): void {
  for (const stmt of splitStatements(sql)) {
    raw.exec(stmt);
  }
}

describe('migrate (DM-1)', () => {
  it('creates the full baseline on a fresh database and records v1', async () => {
    const { db, raw } = createNodeSqliteD1();

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineTables(raw);
    assertLedger(raw, ['001']);

    expect(await migrate(db)).toBe(0);
  });

  it('recognizes a legacy database with the full v1 schema and records v1', async () => {
    const { db, raw } = createNodeSqliteD1();
    applySqlDirect(raw, SCHEMA_SQL);

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineTables(raw);
    assertLedger(raw, ['001']);

    expect(await migrate(db)).toBe(0);
  });

  it('applies an injectable v2 migration through the same runner path', async () => {
    const { db, raw } = createNodeSqliteD1();

    await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] });
    assertBaselineTables(raw);
    assertLedger(raw, ['001', '002']);

    const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === 'dm1_test_col')).toBe(true);

    expect(await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] })).toBe(0);
  });

  it('applies pending v2 on a legacy full-v1 database via injectable registry', async () => {
    const { db, raw } = createNodeSqliteD1();
    applySqlDirect(raw, SCHEMA_SQL);

    await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] });
    assertBaselineTables(raw);
    assertLedger(raw, ['001', '002']);

    const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === 'dm1_test_col')).toBe(true);
  });

  it('rolls back a failed batch without changing schema or ledger', async () => {
    const { db, raw } = createNodeSqliteD1();
    await migrate(db);

    const ledgerBefore = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
      version: string;
    }>;
    const columnsBefore = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;

    const failingMigration: Migration = {
      version: '099',
      name: 'rollback_probe',
      sql: `
        ALTER TABLE users ADD COLUMN rollback_probe TEXT;
        NOT VALID SQL SYNTAX;
      `,
    };

    await expect(runMigrations(db, { migrations: [failingMigration] })).rejects.toThrow();

    const ledgerAfter = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
      version: string;
    }>;
    expect(ledgerAfter).toEqual(ledgerBefore);
    expect(ledgerAfter.some((row) => row.version === '099')).toBe(false);

    const columnsAfter = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columnsAfter).toEqual(columnsBefore);
    expect(columnsAfter.some((col) => col.name === 'rollback_probe')).toBe(false);
  });

  it('exposes a production registry with only the v1 baseline', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]?.version).toBe('001');
    expect(MIGRATIONS[0]?.name).toBe('baseline');
    expect(MIGRATIONS[0]?.sql).toContain('CREATE TABLE IF NOT EXISTS users');
  });
});