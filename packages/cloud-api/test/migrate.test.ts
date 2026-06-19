import { describe, it, expect } from 'vitest';
import { migrate, runMigrations, splitStatements, type Migration } from '../src/db/migrate.js';
import { MIGRATIONS } from '../src/db/migrations/index.js';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';

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

function assertBaselineConverged(raw: ReturnType<typeof createNodeSqliteD1>['raw']): void {
  const tables = listTables(raw);
  for (const table of BASELINE_TABLES) {
    expect(tables.has(table), `missing baseline table: ${table}`).toBe(true);
  }

  const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  expect(columns.some((col) => col.name === 'dm1_test_col')).toBe(true);

  const ledger = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
    version: string;
  }>;
  expect(ledger.map((row) => row.version)).toEqual(['001', '002']);
}

function applySqlDirect(raw: ReturnType<typeof createNodeSqliteD1>['raw'], sql: string): void {
  for (const stmt of splitStatements(sql)) {
    raw.exec(stmt);
  }
}

describe('migrate (DM-1)', () => {
  it('converges a fresh database via the production registry', async () => {
    const { db, raw } = createNodeSqliteD1();

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineConverged(raw);

    expect(await migrate(db)).toBe(0);
  });

  it('converges a legacy database that already has the full baseline schema', async () => {
    const { db, raw } = createNodeSqliteD1();
    applySqlDirect(raw, SCHEMA_SQL);

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineConverged(raw);

    expect(await migrate(db)).toBe(0);
  });

  it('converges a partially-migrated legacy database (users-only) to the full baseline', async () => {
    const { db, raw } = createNodeSqliteD1();
    raw.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');

    await migrate(db);
    assertBaselineConverged(raw);
  });

  it('rolls back a failed migration and does not record it in the ledger', async () => {
    const { db, raw } = createNodeSqliteD1();
    await migrate(db);

    const failingMigration: Migration = {
      version: '099',
      name: 'rollback_probe',
      sql: `
        ALTER TABLE users ADD COLUMN rollback_probe TEXT;
        NOT VALID SQL SYNTAX;
      `,
    };

    await expect(runMigrations(db, [failingMigration])).rejects.toThrow();

    const ledger = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
      version: string;
    }>;
    expect(ledger.map((row) => row.version)).toEqual(['001', '002']);
    expect(ledger.some((row) => row.version === '099')).toBe(false);

    const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === 'rollback_probe')).toBe(false);
  });

  it('exposes an ordered production registry with per-version entries', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(['001', '002']);
    expect(MIGRATIONS[0]?.name).toBe('baseline');
    expect(MIGRATIONS[1]?.name).toBe('dm1_test_col');
    expect(MIGRATIONS[0]?.sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(MIGRATIONS[1]?.sql).toContain('dm1_test_col');
  });
});