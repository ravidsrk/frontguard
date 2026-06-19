/**
 * v1 baseline migration — canonical {@link ../schema.sql}.
 *
 * @module db/migrations/001-baseline
 */

import { SCHEMA_SQL } from '../schema.js';
import type { Migration } from './types.js';

/** Applies the full create-only baseline (`CREATE TABLE IF NOT EXISTS`). */
export const migration001Baseline: Migration = {
  version: '001',
  name: 'baseline',
  sql: SCHEMA_SQL,
};