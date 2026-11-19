import { describe as describeBase, it, expect } from 'vitest';
import { migrate, runMigrations, splitStatements, type Migration } from '../src/db/migrate.js';
import { MIGRATIONS } from '../src/db/migrations/index.js';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { createNodeSqliteD1, nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';
// node:sqlite is absent on Node 20 (CI matrix); skip this shim-backed suite there.
const describe = nodeSqliteAvailable ? describeBase : describeBase.skip;

/** Test-scoped migration — injected at runtime, not shipped in prod registry. */
const TEST_V2_MIGRATION: Migration = {
  version: '099',
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
  'team_usage',
  'account_write_locks',
  'pending_run_updates',
  'stripe_webhook_events',
] as const;

const ALL_VERSIONS = ['001', '002', '003', '004', '005', '006', '007', '008', '009'] as const;

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
  it('creates the full baseline on a fresh database and records all migrations', async () => {
    const { db, raw } = createNodeSqliteD1();

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineTables(raw);
    assertLedger(raw, ALL_VERSIONS);

    expect(await migrate(db)).toBe(0);
  });

  it('recognizes a legacy database with the full v1 schema and applies pending migrations', async () => {
    const { db, raw } = createNodeSqliteD1();
    applySqlDirect(raw, SCHEMA_SQL);

    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineTables(raw);
    assertLedger(raw, ALL_VERSIONS);

    expect(await migrate(db)).toBe(0);
  });

  it('applies an injectable v2 migration through the same runner path', async () => {
    const { db, raw } = createNodeSqliteD1();

    await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] });
    assertBaselineTables(raw);
    assertLedger(raw, [...ALL_VERSIONS, '099']);

    const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === 'dm1_test_col')).toBe(true);

    expect(await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] })).toBe(0);
  });

  it('applies pending v2 on a legacy full-v1 database via injectable registry', async () => {
    const { db, raw } = createNodeSqliteD1();
    applySqlDirect(raw, SCHEMA_SQL);

    await migrate(db, { migrations: [...MIGRATIONS, TEST_V2_MIGRATION] });
    assertBaselineTables(raw);
    assertLedger(raw, [...ALL_VERSIONS, '099']);

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

  it('exposes a production registry with baseline and DM-2/DM-3 migration', () => {
    expect(MIGRATIONS).toHaveLength(9);
    expect(MIGRATIONS[0]?.version).toBe('001');
    expect(MIGRATIONS[0]?.name).toBe('baseline');
    expect(MIGRATIONS[0]?.sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(MIGRATIONS[1]?.version).toBe('002');
    expect(MIGRATIONS[1]?.name).toBe('cascade_team_usage');
    expect(MIGRATIONS[1]?.sql).toContain('team_usage');
    expect(MIGRATIONS[1]?.sql).toContain('PRAGMA defer_foreign_keys = ON');
    expect(MIGRATIONS[1]?.sql).not.toContain('PRAGMA foreign_keys = OFF');
    expect(MIGRATIONS[2]?.version).toBe('003');
    expect(MIGRATIONS[2]?.name).toBe('optimistic_concurrency_invitation_expiry');
    expect(MIGRATIONS[2]?.sql).toContain('version');
    expect(MIGRATIONS[2]?.sql).toContain('expires_at');
    expect(MIGRATIONS[3]?.version).toBe('004');
    expect(MIGRATIONS[3]?.name).toBe('monitor_lease');
    expect(MIGRATIONS[3]?.sql).toContain('leased_until');
    expect(MIGRATIONS[4]?.version).toBe('005');
    expect(MIGRATIONS[4]?.name).toBe('background_failures');
    expect(MIGRATIONS[4]?.sql).toContain('background_failures');
    expect(MIGRATIONS[5]?.version).toBe('006');
    expect(MIGRATIONS[5]?.name).toBe('monitor_project_id');
    expect(MIGRATIONS[5]?.sql).toContain('project_id');
    expect(MIGRATIONS[6]?.version).toBe('007');
    expect(MIGRATIONS[6]?.name).toBe('account_write_locks');
    expect(MIGRATIONS[6]?.sql).toContain('account_write_locks');
    expect(MIGRATIONS[7]?.version).toBe('008');
    expect(MIGRATIONS[7]?.name).toBe('pending_run_updates');
    expect(MIGRATIONS[7]?.sql).toContain('pending_run_updates');
    expect(MIGRATIONS[8]?.version).toBe('009');
    expect(MIGRATIONS[8]?.name).toBe('metering_billing_monitor_run_id');
    expect(MIGRATIONS[8]?.sql).toContain('stripe_webhook_events');
  });

  it('applies v2 on a fresh database and records both versions', async () => {
    const { db, raw } = createNodeSqliteD1();
    const executed = await migrate(db);
    expect(executed).toBeGreaterThan(0);
    assertBaselineTables(raw);
    assertLedger(raw, ALL_VERSIONS);
    const tables = listTables(raw);
    expect(tables.has('team_usage')).toBe(true);
    expect(tables.has('background_failures')).toBe(true);
    expect(tables.has('stripe_webhook_events')).toBe(true);
    expect(await migrate(db)).toBe(0);
  });

  it('runs migration 002 safely on a non-empty database with foreign_keys = ON', async () => {
    const { db, raw } = createNodeSqliteD1();
    // Apply only 001 baseline first, populate parent & child rows referencing runs/projects,
    // then run all remaining migrations with PRAGMA foreign_keys = ON.
    await runMigrations(db, { migrations: [MIGRATIONS[0]!] });
    raw.exec(`
      INSERT INTO users (id, plan, created_at) VALUES ('u1', 'free', '2026-01-01T00:00:00Z');
      INSERT INTO teams (id, name, plan, created_at) VALUES ('t1', 'Acme', 'free', '2026-01-01T00:00:00Z');
      INSERT INTO team_projects (id, team_id, name, created_at) VALUES ('p1', 't1', 'Web', '2026-01-01T00:00:00Z');
      INSERT INTO runs (id, user_id, project_id, status, config, created_at)
        VALUES ('r1', 'u1', 'p1', 'completed', '{"url":"https://example.com"}', '2026-01-01T00:00:00Z');
      INSERT INTO screenshots (id, run_id, route, viewport, browser, type, r2_key, created_at)
        VALUES ('s1', 'r1', '/', 1440, 'chromium', 'current', 'u1/r1/s1.png', '2026-01-01T00:00:00Z');
      INSERT INTO baseline_approvals (id, run_id, project_id, reviewer_user_id, status, created_at)
        VALUES ('a1', 'r1', 'p1', 'u1', 'approved', '2026-01-01T00:00:00Z');
    `);

    const applied = await migrate(db);
    expect(applied).toBeGreaterThan(0);
    assertLedger(raw, ALL_VERSIONS);
    // Verify existing data survived the table rebuild intact.
    const runs = raw.prepare('SELECT id FROM runs').all() as Array<{ id: string }>;
    const shots = raw.prepare('SELECT id FROM screenshots').all() as Array<{ id: string }>;
    const approvals = raw.prepare('SELECT id FROM baseline_approvals').all() as Array<{ id: string }>;
    expect(runs).toEqual([{ id: 'r1' }]);
    expect(shots).toEqual([{ id: 's1' }]);
    expect(approvals).toEqual([{ id: 'a1' }]);
  });
});