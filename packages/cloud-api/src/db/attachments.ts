/**
 * Run attachments (Task 15.6).
 *
 * Trace bundles, DOM snapshots, console logs, video recordings, and other
 * artifacts produced during a run. Image bytes live in R2; this table is
 * the metadata index. Authorization piggybacks on the owning run.
 *
 * @module db/attachments
 */

/** Supported attachment kinds. */
export type AttachmentKind = 'trace' | 'dom-snapshot' | 'console-log' | 'video' | 'other';

/** A single attachment record. Bytes live in R2 under `r2Key`. */
export interface RunAttachment {
  id: string;
  runId: string;
  kind: AttachmentKind;
  name: string;
  r2Key: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt: string;
}

/** Storage operations for attachments (implemented by both stores). */
export interface AttachmentStore {
  addAttachment(att: RunAttachment): Promise<void>;
  listAttachments(runId: string): Promise<RunAttachment[]>;
  getAttachment(id: string): Promise<RunAttachment | null>;
  deleteAttachment(id: string): Promise<boolean>;
}

/** Returns a stable, descriptive label for an attachment kind. */
export function attachmentLabel(kind: AttachmentKind): string {
  switch (kind) {
    case 'trace':
      return 'Trace';
    case 'dom-snapshot':
      return 'DOM snapshot';
    case 'console-log':
      return 'Console log';
    case 'video':
      return 'Video';
    default:
      return 'Attachment';
  }
}
