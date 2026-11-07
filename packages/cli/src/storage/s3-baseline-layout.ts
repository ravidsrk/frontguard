/**
 * S3-compatible baseline storage key layout and in-memory spike (#295).
 *
 * Note: `imageUpload` (`packages/cli/src/storage/image-upload.ts`) already
 * covers S3/R2 for PR comment thumbnails. This module models content-addressed
 * baseline bytes only, combining:
 * - #306 hash tuple (`route`, `viewport`, `browser`, `baselineSha256`, `candidateSha256`)
 * - #303 renderer fingerprint (`RendererFingerprint`)
 * - #309 named capture mode (`mode`)
 *
 * `pixelmatch` remains the only comparator, and model decisions are never
 * stored as baseline records. No live bucket, credential, or production CLI
 * flag is created.
 */

import { createHash } from 'node:crypto';
import type { BrowserEngine, RendererFingerprint } from '../core/types.js';
import { isNamedMode } from '../core/fingerprint.js';

export const S3_BASELINE_STORAGE_SCOPE = 'baseline-bytes-only' as const;
export const PR_THUMBNAIL_UPLOAD_CONFIG_FIELD = 'imageUpload' as const;

export interface S3BaselineTarget {
  ref: string;
  route: string;
  viewport: number;
  browser: BrowserEngine;
  mode?: string;
  fingerprint: RendererFingerprint;
}

export interface S3BaselinePointerRecord {
  schemaVersion: 2;
  ref: string;
  route: string;
  viewport: number;
  browser: BrowserEngine;
  mode: string;
  sha256: string;
  fingerprintHash: string;
  fingerprint: RendererFingerprint;
  promotedBy: {
    actorKind: 'human';
    reviewerId: string;
    confirmedAt: string;
    sourceCommitSha: string;
  };
}

export interface S3PrApprovalKeyInput {
  prNumber: number;
  route: string;
  viewport: number;
  browser: BrowserEngine;
  mode?: string;
  baselineSha256: string;
  candidateSha256: string;
}

export interface S3PromotionAttempt {
  target: S3BaselineTarget;
  pngBytes: Buffer;
  actorKind: 'human' | 'agent' | 'model';
  reviewerId: string;
  confirmBaselines: boolean;
  judgeMode?: boolean;
  modelDecision?: string;
  sourceCommitSha: string;
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/^\/+/, '').replace(/\.\./g, '_').replace(/[^a-zA-Z0-9_\-\/]/g, '_');
  return cleaned || '_root';
}

export function normalizeModeSegment(mode?: string): string {
  return isNamedMode(mode) ? sanitizeSegment(mode.trim()) : 'default';
}

/**
 * Computes a deterministic 16-hex-char digest of the #303 renderer fingerprint
 * plus #309 mode settings.
 */
export function fingerprintDigest(fingerprint: RendererFingerprint): string {
  const canonical = JSON.stringify({
    browser: fingerprint.browser,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    pixelmatch: fingerprint.pixelmatch,
    screenshot: fingerprint.screenshot,
    mode: fingerprint.mode ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Content-addressed key for immutable baseline PNG bytes.
 */
export function s3BaselineBlobKey(sha256: string): string {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error(`Invalid baseline SHA-256 digest: ${sha256}`);
  }
  return `baselines/blobs/sha256/${sha256.toLowerCase()}.png`;
}

/**
 * Pointer key combining #306 target, #303 fingerprint digest, and #309 mode.
 */
export function s3BaselinePointerKey(target: S3BaselineTarget): string {
  const ref = sanitizeSegment(target.ref);
  const route = sanitizeSegment(target.route);
  const mode = normalizeModeSegment(target.mode ?? target.fingerprint.mode?.name);
  const fpHash = fingerprintDigest(target.fingerprint);
  return `baselines/refs/${ref}/${route}/${target.viewport}/${mode}/${target.browser}/${fpHash}.json`;
}

/**
 * PR-scoped approval key combining #306 hash tuple and #309 mode.
 */
export function s3PrApprovalKey(input: S3PrApprovalKeyInput): string {
  const route = sanitizeSegment(input.route);
  const mode = normalizeModeSegment(input.mode);
  return (
    `baselines/approvals/pr-${input.prNumber}/${route}/${input.viewport}/${mode}/${input.browser}/` +
    `${input.baselineSha256.toLowerCase()}-to-${input.candidateSha256.toLowerCase()}.json`
  );
}

/**
 * In-memory S3-compatible baseline store used to verify promotion and content-addressed
 * retrieval rules without provisioning buckets or credentials.
 */
export class InMemoryS3BaselineStore {
  private readonly objects = new Map<string, Buffer>();

  promoteBaseline(attempt: S3PromotionAttempt): {
    blobKey: string;
    pointerKey: string;
    record: S3BaselinePointerRecord;
  } {
    if (attempt.judgeMode || attempt.modelDecision !== undefined || attempt.actorKind !== 'human') {
      throw new Error(
        'Refusing to store a model or agent decision as a baseline record; human confirmation is required.',
      );
    }
    if (!attempt.confirmBaselines) {
      throw new Error('Baseline promotion requires explicit --confirm-baselines confirmation.');
    }
    if (!attempt.reviewerId.trim()) {
      throw new Error('Baseline promotion requires a non-empty human reviewerId.');
    }

    const sha256 = createHash('sha256').update(attempt.pngBytes).digest('hex');
    const blobKey = s3BaselineBlobKey(sha256);
    const pointerKey = s3BaselinePointerKey(attempt.target);
    const mode = normalizeModeSegment(
      attempt.target.mode ?? attempt.target.fingerprint.mode?.name,
    );

    const record: S3BaselinePointerRecord = {
      schemaVersion: 2,
      ref: attempt.target.ref,
      route: attempt.target.route,
      viewport: attempt.target.viewport,
      browser: attempt.target.browser,
      mode,
      sha256,
      fingerprintHash: fingerprintDigest(attempt.target.fingerprint),
      fingerprint: attempt.target.fingerprint,
      promotedBy: {
        actorKind: 'human',
        reviewerId: attempt.reviewerId,
        confirmedAt: new Date().toISOString(),
        sourceCommitSha: attempt.sourceCommitSha,
      },
    };

    this.objects.set(blobKey, Buffer.from(attempt.pngBytes));
    this.objects.set(pointerKey, Buffer.from(JSON.stringify(record, null, 2), 'utf8'));

    return { blobKey, pointerKey, record };
  }

  readBaselineBytes(target: S3BaselineTarget): Buffer | null {
    const pointerKey = s3BaselinePointerKey(target);
    const rawPointer = this.objects.get(pointerKey);
    if (!rawPointer) return null;
    const pointer = JSON.parse(rawPointer.toString('utf8')) as S3BaselinePointerRecord;
    const blob = this.objects.get(s3BaselineBlobKey(pointer.sha256));
    return blob ? Buffer.from(blob) : null;
  }
}
