import { describe, it, expect } from 'vitest';
import { migrate, type Migration } from '../src/db/migrate.js';
import { MIGRATIONS } from '../src/db/migrations/index.js';
import { createNodeSqliteD1 } from './helpers/node-sqlite-d1.js';

/** v2 fixture: additive column used only to exercise the migration runner. */
const MIGRATION_V2_SQL = 'ALTER TABLE users ADD COLUMN dm1_test_col TEXT;';

const TEST_MIGRATIONS: readonly Migration[] = [
  ...MIGRATIONS,
  { version: '002', sql: MIGRATION_V2_SQL },
];

describe('migrate (DM-1)', () => {
  it('applies v1 then v2, records ledger entries, and is idempotent', async () => {
    const { db, raw } = createNodeSqliteD1();

    const firstRun = await migrate(db, { migrations: TEST_MIGRATIONS });
    expect(firstRun).toBeGreaterThan(0);

    const columns = raw.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    expect(columns.some((col) => col.name === 'dm1_test_col')).toBe(true);

    const ledger = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
      version: string;
    }>;
    expect(ledger.map((row) => row.version)).toEqual(['001', '002']);

    const secondRun = await migrate(db, { migrations: TEST_MIGRATIONS });
    expect(secondRun).toBe(0);

    const ledgerAfter = raw.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{
      version: string;
    }>;
    expect(ledgerAfter.map((row) => row.version)).toEqual(['001', '002']);
  });

  it('stamps v1 without re-running when baseline tables already exist', async () => {
    const { db, raw } = createNodeSqliteD1();

    raw.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');

    await migrate(db, { migrations: MIGRATIONS });

    const ledger = raw.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.version).toBe('001');

    const secondRun = await migrate(db, { migrations: MIGRATIONS });
    expect(secondRun).toBe(0);
  });
});