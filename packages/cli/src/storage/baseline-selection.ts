/**
 * Spike for PR-scoped baseline selection (#306).
 *
 * This module does not read git and does not write the orphan branch.
 * Callers pass ancestry and image hashes. Pixel comparison stays outside:
 * an approval only chooses which image bytes are the expected side.
 */

export interface BaselineSetRef {
  id: string;
  sourceCommitSha: string;
  /** Published from the default branch, not from an unmerged pull request. */
  onDefaultBranch: boolean;
  /** Keyed by `route/viewport/browser/mode`. Values are PNG SHA-256 hex. */
  images: Record<string, string>;
}

export interface ApprovalRecord {
  route: string;
  viewport: number;
  browser: string;
  /** Empty string is the default mode and keeps today's unkeyed path. */
  mode: string;
  baselineSha256: string;
  candidateSha256: string;
}

export type BaselineSelection =
  | { kind: 'ancestor'; set: BaselineSetRef; warning?: string }
  | { kind: 'default-branch-fallback'; set: BaselineSetRef; warning: string }
  | { kind: 'no-baseline'; warning: string };

export function imageKey(
  route: string,
  viewport: number,
  browser: string,
  mode = '',
): string {
  return `${route}/${viewport}/${browser}/${mode}`;
}

/**
 * Newest set whose source commit is an ancestor of the merge base.
 * Sets must be newest-first. A shallow clone that cannot prove ancestry
 * does not invent an ancestor; it warns and falls through.
 */
export function selectBaselineSet(
  setsNewestFirst: readonly BaselineSetRef[],
  options: {
    isAncestorOfMergeBase: (sourceCommitSha: string) => boolean | 'unknown';
    shallow: boolean;
  },
): BaselineSelection {
  const shallowNote = options.shallow
    ? 'Shallow clone: ancestry that is not in the fetched history is unknown. Fetch the merge base before trusting a fallback.'
    : undefined;

  for (const set of setsNewestFirst) {
    const ancestry = options.isAncestorOfMergeBase(set.sourceCommitSha);
    if (ancestry === true) {
      return shallowNote ? { kind: 'ancestor', set, warning: shallowNote } : { kind: 'ancestor', set };
    }
  }

  const fallback = setsNewestFirst.find((set) => set.onDefaultBranch);
  if (fallback) {
    const warning = [
      `No baseline set is an ancestor of the merge base. Falling back to default-branch set ${fallback.id}.`,
      shallowNote,
    ]
      .filter(Boolean)
      .join(' ');
    return { kind: 'default-branch-fallback', set: fallback, warning };
  }

  return {
    kind: 'no-baseline',
    warning: ['No published baseline set applies to this merge base.', shallowNote]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * The image pixelmatch should compare against.
 * A matching approval selects that approval's candidate bytes.
 * It does not select another pull request's candidate.
 */
export function expectedImageSha256(input: {
  baseline: BaselineSetRef | null;
  key: string;
  approvals: readonly ApprovalRecord[];
  candidateSha256: string;
  route: string;
  viewport: number;
  browser: string;
  mode?: string;
}): { sha256: string | null; source: 'approval' | 'baseline' | 'none' } {
  const mode = input.mode ?? '';
  const baselineSha = input.baseline?.images[input.key];
  const approval = input.approvals.find(
    (record) =>
      record.route === input.route &&
      record.viewport === input.viewport &&
      record.browser === input.browser &&
      record.mode === mode &&
      record.candidateSha256 === input.candidateSha256 &&
      (baselineSha === undefined || record.baselineSha256 === baselineSha),
  );
  if (approval) return { sha256: approval.candidateSha256, source: 'approval' };
  if (baselineSha) return { sha256: baselineSha, source: 'baseline' };
  return { sha256: null, source: 'none' };
}

/** A squash or rebase keeps the approval when the PNG bytes are unchanged. */
export function approvalCarriesByContentHash(
  approval: ApprovalRecord,
  landedSha256: string,
): boolean {
  return approval.candidateSha256 === landedSha256;
}
