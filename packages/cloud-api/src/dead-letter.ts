/**
 * Dead-letter helper for failed background work (OPS-3).
 *
 * @module dead-letter
 */

import type { Store } from './db/store.js';
import type { BackgroundFailureKind } from './db/background-failures.js';

export interface RecordDeadLetterInput {
  kind: BackgroundFailureKind;
  sourceId: string;
  userId?: string;
  error: string;
  attempt?: number;
  context?: Record<string, unknown>;
}

/** Persists a terminal background failure to the dead-letter table. */
export async function recordDeadLetter(store: Store, input: RecordDeadLetterInput): Promise<void> {
  await store.recordBackgroundFailure({
    id: crypto.randomUUID(),
    kind: input.kind,
    sourceId: input.sourceId,
    userId: input.userId,
    error: input.error,
    attempt: input.attempt ?? 1,
    context: input.context,
    createdAt: new Date().toISOString(),
  });
}