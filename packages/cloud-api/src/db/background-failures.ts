/**
 * Durable dead-letter records for failed background work (OPS-3).
 *
 * When a `/v1/run` background processor or a scheduled monitor check fails
 * terminally, the failure is persisted here instead of warn-and-swallow so
 * operators can query, alert, or retry later.
 *
 * @module db/background-failures
 */

/** Kind of background work that failed. */
export type BackgroundFailureKind = 'run' | 'monitor';

/** A persisted terminal failure for background processing. */
export interface BackgroundFailure {
  id: string;
  kind: BackgroundFailureKind;
  /** Run id (`kind === 'run'`) or monitor id (`kind === 'monitor'`). */
  sourceId: string;
  userId?: string;
  error: string;
  /** Attempt number when the failure was recorded (1-based). */
  attempt: number;
  /** Optional JSON context (e.g. `monitorRunId`). */
  context?: Record<string, unknown>;
  createdAt: string;
}

/** Query options for {@link BackgroundFailureStore.listBackgroundFailures}. */
export interface ListBackgroundFailuresOptions {
  kind?: BackgroundFailureKind;
  sourceId?: string;
  limit?: number;
}

/** Storage operations for background failure dead letters (OPS-3). */
export interface BackgroundFailureStore {
  /** Persists a terminal background failure for later inspection/retry. */
  recordBackgroundFailure(failure: BackgroundFailure): Promise<void>;
  /** Lists recent failures, newest first. */
  listBackgroundFailures(opts?: ListBackgroundFailuresOptions): Promise<BackgroundFailure[]>;
}