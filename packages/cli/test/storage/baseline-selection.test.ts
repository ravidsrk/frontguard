import { describe, expect, it } from 'vitest';
import {
  approvalCarriesByContentHash,
  expectedImageSha256,
  imageKey,
  selectBaselineSet,
  type ApprovalRecord,
  type BaselineSetRef,
} from '../../src/storage/baseline-selection.js';

const key = imageKey('/', 1440, 'chromium');

const mainSet: BaselineSetRef = {
  id: 'main-1',
  sourceCommitSha: 'main1',
  onDefaultBranch: true,
  images: { [key]: 'base-png' },
};

const olderSet: BaselineSetRef = {
  id: 'main-0',
  sourceCommitSha: 'main0',
  onDefaultBranch: true,
  images: { [key]: 'older-png' },
};

describe('selectBaselineSet', () => {
  it('picks the newest set that is an ancestor of the merge base', () => {
    const selected = selectBaselineSet([mainSet, olderSet], {
      shallow: false,
      isAncestorOfMergeBase: (sha) => sha === 'main0' || sha === 'main1',
    });
    expect(selected.kind).toBe('ancestor');
    if (selected.kind === 'ancestor') expect(selected.set.id).toBe('main-1');
  });

  it('warns and falls back to the default branch when nothing is an ancestor', () => {
    const selected = selectBaselineSet([mainSet], {
      shallow: false,
      isAncestorOfMergeBase: () => false,
    });
    expect(selected.kind).toBe('default-branch-fallback');
    if (selected.kind === 'default-branch-fallback') {
      expect(selected.set.id).toBe('main-1');
      expect(selected.warning).toMatch(/Falling back/);
    }
  });

  it('returns no-baseline instead of inventing a set on a shallow miss', () => {
    const selected = selectBaselineSet([], {
      shallow: true,
      isAncestorOfMergeBase: () => 'unknown',
    });
    expect(selected.kind).toBe('no-baseline');
    if (selected.kind === 'no-baseline') expect(selected.warning).toMatch(/Shallow clone/);
  });

  it('does not call unknown ancestry an ancestor', () => {
    const selected = selectBaselineSet([mainSet], {
      shallow: true,
      isAncestorOfMergeBase: () => 'unknown',
    });
    expect(selected.kind).not.toBe('ancestor');
    expect(selected.warning).toMatch(/Shallow clone/);
  });

  it('skips an unpublished stacked parent even when that parent is an ancestor', () => {
    const unpublished: BaselineSetRef = {
      id: 'pr-parent',
      sourceCommitSha: 'parent',
      onDefaultBranch: false,
      images: { [key]: 'parent-png' },
    };
    const selected = selectBaselineSet([unpublished, mainSet], {
      shallow: false,
      isAncestorOfMergeBase: () => true,
    });
    expect(selected.kind).toBe('ancestor');
    if (selected.kind === 'ancestor') expect(selected.set.id).toBe('main-1');
  });
});

describe('expected image for two open pull requests', () => {
  const approvalA: ApprovalRecord = {
    route: '/',
    viewport: 1440,
    browser: 'chromium',
    mode: '',
    baselineSha256: 'base-png',
    candidateSha256: 'pr-a-png',
  };

  it('does not treat the other pull request as the baseline', () => {
    const forA = expectedImageSha256({
      baseline: mainSet,
      key,
      approvals: [approvalA],
      candidateSha256: 'pr-a-png',
      route: '/',
      viewport: 1440,
      browser: 'chromium',
    });
    const forB = expectedImageSha256({
      baseline: mainSet,
      key,
      approvals: [approvalA],
      candidateSha256: 'pr-b-png',
      route: '/',
      viewport: 1440,
      browser: 'chromium',
    });

    expect(forA).toEqual({ sha256: 'pr-a-png', source: 'approval' });
    expect(forB).toEqual({ sha256: 'base-png', source: 'baseline' });
    expect(forB.sha256).not.toBe(approvalA.candidateSha256);
  });

  it('does not treat a missing baseline hash as a wildcard', () => {
    const selected = expectedImageSha256({
      baseline: null,
      key,
      approvals: [approvalA],
      candidateSha256: 'pr-a-png',
      route: '/',
      viewport: 1440,
      browser: 'chromium',
    });
    expect(selected).toEqual({ sha256: null, source: 'none' });
  });
});

describe('approvalCarriesByContentHash', () => {
  it('keeps a squash-merged approval when the landed PNG hash matches', () => {
    const approval: ApprovalRecord = {
      route: '/',
      viewport: 1440,
      browser: 'chromium',
      mode: '',
      baselineSha256: 'base-png',
      candidateSha256: 'pr-a-png',
    };
    expect(approvalCarriesByContentHash(approval, 'pr-a-png')).toBe(true);
    expect(approvalCarriesByContentHash(approval, 'different-png')).toBe(false);
  });
});
