import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { currentFingerprint } from '../../src/core/fingerprint.js';
import {
  InMemoryS3BaselineStore,
  PR_THUMBNAIL_UPLOAD_CONFIG_FIELD,
  S3_BASELINE_STORAGE_SCOPE,
  fingerprintDigest,
  s3BaselineBlobKey,
  s3BaselinePointerKey,
  s3PrApprovalKey,
} from '../../src/storage/s3-baseline-layout.js';

const here = dirname(fileURLToPath(import.meta.url));
const decisionDoc = readFileSync(
  resolve(here, '../../../../docs/decisions/295-s3-baseline-storage.md'),
  'utf8',
);

describe('S3-compatible baseline storage design record & spike (#295)', () => {
  it('criterion 1: states imageUpload covers S3 for PR thumbnails and this scope is baseline bytes only', () => {
    expect(S3_BASELINE_STORAGE_SCOPE).toBe('baseline-bytes-only');
    expect(PR_THUMBNAIL_UPLOAD_CONFIG_FIELD).toBe('imageUpload');
    expect(decisionDoc).toContain('imageUpload');
    expect(decisionDoc).toContain('PR comment thumbnails');
    expect(decisionDoc).toContain('baseline bytes only');
  });

  it('criterion 2: keys use the #306 hash tuple, #303 fingerprint, and #309 mode', () => {
    const fpLight = currentFingerprint('chromium', 'routes', {
      name: 'light',
      settings: { colorScheme: 'light' },
    });
    const fpDark = currentFingerprint('chromium', 'routes', {
      name: 'dark',
      settings: { colorScheme: 'dark' },
    });

    const keyLight = s3BaselinePointerKey({
      ref: 'main',
      route: '/pricing',
      viewport: 1440,
      browser: 'chromium',
      mode: 'light',
      fingerprint: fpLight,
    });
    const keyDark = s3BaselinePointerKey({
      ref: 'main',
      route: '/pricing',
      viewport: 1440,
      browser: 'chromium',
      mode: 'dark',
      fingerprint: fpDark,
    });

    expect(keyLight).toContain('baselines/refs/main/pricing/1440/light/chromium/');
    expect(keyDark).toContain('baselines/refs/main/pricing/1440/dark/chromium/');
    expect(keyLight).not.toBe(keyDark);
    expect(fingerprintDigest(fpLight)).not.toBe(fingerprintDigest(fpDark));

    const baseSha = createHash('sha256').update('old-png').digest('hex');
    const candSha = createHash('sha256').update('new-png').digest('hex');
    const approvalKey = s3PrApprovalKey({
      prNumber: 306,
      route: '/pricing',
      viewport: 1440,
      browser: 'chromium',
      mode: 'dark',
      baselineSha256: baseSha,
      candidateSha256: candSha,
    });
    expect(approvalKey).toBe(
      `baselines/approvals/pr-306/pricing/1440/dark/chromium/${baseSha}-to-${candSha}.json`,
    );
    expect(s3BaselineBlobKey(candSha)).toBe(`baselines/blobs/sha256/${candSha}.png`);
  });

  it('criterion 3 & 4: enforces human-only promotion, never stores a model decision as a baseline record, and provisions no live bucket or flag', () => {
    const store = new InMemoryS3BaselineStore();
    const fp = currentFingerprint('chromium', 'routes', {
      name: 'dark',
      settings: { colorScheme: 'dark' },
    });
    const target = {
      ref: 'main',
      route: '/checkout',
      viewport: 1440,
      browser: 'chromium' as const,
      mode: 'dark',
      fingerprint: fp,
    };
    const pngBytes = Buffer.from('deterministic-png-bytes');

    // Model or agent decisions are rejected
    expect(() =>
      store.promoteBaseline({
        target,
        pngBytes,
        actorKind: 'model',
        reviewerId: 'gpt-4.1-mini',
        confirmBaselines: true,
        modelDecision: 'intentional',
        sourceCommitSha: 'abc1234',
      }),
    ).toThrow(/Refusing to store a model or agent decision/);

    expect(() =>
      store.promoteBaseline({
        target,
        pngBytes,
        actorKind: 'human',
        reviewerId: 'ravidsrk',
        confirmBaselines: true,
        judgeMode: true,
        sourceCommitSha: 'abc1234',
      }),
    ).toThrow(/Refusing to store a model or agent decision/);

    expect(() =>
      store.promoteBaseline({
        target,
        pngBytes,
        actorKind: 'human',
        reviewerId: 'ravidsrk',
        confirmBaselines: false,
        sourceCommitSha: 'abc1234',
      }),
    ).toThrow(/requires explicit --confirm-baselines/);

    expect(() =>
      store.promoteBaseline({
        target,
        pngBytes,
        actorKind: 'human',
        reviewerId: '   ',
        confirmBaselines: true,
        sourceCommitSha: 'abc1234',
      }),
    ).toThrow(/non-empty human reviewerId/);

    expect(() => s3BaselineBlobKey('not-a-sha')).toThrow(/Invalid baseline SHA-256 digest/);
    expect(store.readBaselineBytes(target)).toBeNull();

    const defaultFp = currentFingerprint('chromium', 'routes');
    const rootKey = s3BaselinePointerKey({
      ref: 'main',
      route: '/',
      viewport: 1440,
      browser: 'chromium',
      fingerprint: defaultFp,
    });
    expect(rootKey).toContain('baselines/refs/main/_root/1440/default/chromium/');

    // Human promotion succeeds and round-trips exact bytes for pixelmatch comparison
    const promoted = store.promoteBaseline({
      target,
      pngBytes,
      actorKind: 'human',
      reviewerId: 'ravidsrk',
      confirmBaselines: true,
      sourceCommitSha: 'abc1234',
    });
    expect(promoted.record.promotedBy.actorKind).toBe('human');
    expect(store.readBaselineBytes(target)?.equals(pngBytes)).toBe(true);
  });
});
