# 295: S3-Compatible Baseline Storage Design Record and In-Memory Spike

## Context and Boundary with `imageUpload`

`FrontguardConfig.imageUpload` (`packages/cli/src/storage/image-upload.ts`) **already covers S3 and Cloudflare R2 uploads for PR comment thumbnails** (baseline, current, and diff preview PNGs linked from pull request comments).

This design record (`#295`) covers **baseline bytes only** as an optional alternative to the `frontguard-baselines` git orphan branch when a repository's baseline corpus grows large enough that storing binary PNG history in git becomes undesirable, while `prune-baselines` (`#307`) covers git orphan branch size management in the meantime.

No S3 bucket, cloud credential, or production CLI flag is provisioned or enabled by default.

## Content-Addressed Key Layout

Baseline objects and pointers combine:
1. **`#306` target & content hash tuple**: `(route, viewport, browser, baselineSha256, candidateSha256)`
2. **`#303` renderer fingerprint digest**: deterministic SHA-256 of `{ browser, deviceScaleFactor, pixelmatch, screenshot }`
3. **`#309` capture mode**: `'default'` or the named mode (`light`, `dark`, `hc`, etc.)

### Object Keys

- **Immutable content-addressed PNG blob**:
  `baselines/blobs/sha256/<sha256>.png`
- **Target pointer record (per branch/ref + route + viewport + mode + browser + fingerprint)**:
  `baselines/refs/<ref>/<sanitizedRoute>/<viewport>/<mode>/<browser>/<fingerprintHash>.json`
- **PR-scoped approval record (`#306`)**:
  `baselines/approvals/pr-<prNumber>/<sanitizedRoute>/<viewport>/<mode>/<browser>/<baselineSha256>-to-<candidateSha256>.json`

## Comparator and Promotion Rules

1. **`pixelmatch` remains the sole comparator**:
   - Reading a baseline fetches the PNG bytes addressed by `sha256` and hands the raw `Buffer` to `compareScreenshot` (`pixelmatch`). S3 storage never alters pixel comparison math or thresholds.
2. **Who can promote**:
   - Only an explicit human-confirmed promotion (`actorKind: 'human'`, `confirmBaselines: true`, `axeBlocked !== true`) or a merge of a human-reviewed PR approval record (`#306`) can advance a branch pointer record.
   - **Never store a model decision as a baseline record**: AI classifications (`intentional`, `content_update`) and judge-mode verdicts (`#291`) are rejected at the storage boundary and can never write or advance a baseline pointer.
3. **Zero live credentials / flags**:
   - Tested strictly against an in-memory object store in unit tests; no bucket, credential, or production config flag is added.
