/**
 * Logical SQLite backup used by the local restore drill.
 *
 * Production D1 export and Time Travel are not invoked here. The drill writes
 * this script plus blob bytes, then replays them into an empty database and
 * compares the restored rows and bytes to the source snapshot.
 *
 * @module db/sqlite-backup
 */

/** One table's rows, in insert order (parents before children). */
export interface BackupTable {
  name: string;
  rows: ReadonlyArray<Record<string, unknown>>;
}

/** An object-store blob captured alongside the SQL script. */
export interface BackupBlob {
  key: string;
  bytes: Uint8Array;
}

/** A backup that can be restored without the live database. */
export interface LocalBackup {
  sql: string;
  blobs: BackupBlob[];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** SQL literal for a backup INSERT. Rejects values SQLite would not round-trip as text or numbers. */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('backup refused a non-finite number');
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`backup refused a ${typeof value} value`);
}

/**
 * Builds a restore script from a schema and row snapshots, and copies blob
 * bytes so a later mutation of the source buffers cannot change the backup.
 */
export function createLocalBackup(
  schemaSql: string,
  tables: readonly BackupTable[],
  blobs: readonly BackupBlob[],
): LocalBackup {
  const inserts: string[] = [];
  for (const table of tables) {
    if (!IDENT.test(table.name)) throw new Error(`unsafe table name: ${table.name}`);
    for (const row of table.rows) {
      const cols = Object.keys(row);
      if (cols.some((col) => !IDENT.test(col))) {
        throw new Error(`unsafe column on ${table.name}`);
      }
      const values = cols.map((col) => sqlLiteral(row[col]));
      inserts.push(`INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${values.join(', ')});`);
    }
  }
  return {
    sql: `${schemaSql.trim()}\n${inserts.join('\n')}\n`,
    blobs: blobs.map((blob) => ({ key: blob.key, bytes: new Uint8Array(blob.bytes) })),
  };
}
