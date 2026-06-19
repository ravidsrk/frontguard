/**
 * Ordered schema migrations registry (DM-1).
 *
 * Production code iterates {@link MIGRATIONS} in version order. To add a
 * migration (DM-2, DM-3, SEC-4, …):
 * 1. Create `migrations/NNN_description.sql` with additive DDL.
 * 2. Add `migrations/NNN_description.ts` exporting a {@link Migration} constant
 *    (Workers cannot import `.sql` files at runtime).
 * 3. Import and append it below in numeric order.
 *
 * @module db/migrations
 */

import { migration001Baseline } from './001-baseline.js';
import { migration002CascadeTeamUsage } from './002-cascade-team-usage.js';
import { migration003OptimisticConcurrencyInvitationExpiry } from './003-optimistic-concurrency-invitation-expiry.js';
import type { Migration } from './types.js';

export type { Migration } from './types.js';

/**
 * Production migrations in apply order. Only pending versions are run; applied
 * versions are recorded in `schema_migrations`.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration001Baseline,
  migration002CascadeTeamUsage,
  migration003OptimisticConcurrencyInvitationExpiry,
];