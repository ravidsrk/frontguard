import { describe, expect, it } from 'vitest';
import {
  evaluateMultiUserReviews,
  evaluatePromotionGate,
} from '../src/review-policy.js';

describe('Hosted review UI policy spike (#294)', () => {
  it('counts only each reviewer latest review and blocks when any reviewer rejects', () => {
    const tallyBlocked = evaluateMultiUserReviews([
      { reviewerId: 'alice', decision: 'approve', timestampMs: 1000 },
      { reviewerId: 'bob', decision: 'reject', timestampMs: 2000 },
    ]);
    expect(tallyBlocked.approved).toBe(false);
    expect(tallyBlocked.blockedByRejection).toBe(true);
    expect(tallyBlocked.approvals).toEqual(['alice']);
    expect(tallyBlocked.rejections).toEqual(['bob']);

    // Bob later approves after fix -> unblocked
    const tallyUnblocked = evaluateMultiUserReviews([
      { reviewerId: 'alice', decision: 'approve', timestampMs: 1000 },
      { reviewerId: 'bob', decision: 'reject', timestampMs: 2000 },
      { reviewerId: 'bob', decision: 'approve', timestampMs: 3000 },
    ]);
    expect(tallyUnblocked.approved).toBe(true);
    expect(tallyUnblocked.blockedByRejection).toBe(false);
    expect(tallyUnblocked.approvals).toEqual(['alice', 'bob']);
    expect(tallyUnblocked.rejections).toEqual([]);

    // Alice later changes her mind to reject -> blocked again
    const tallyReRejected = evaluateMultiUserReviews([
      { reviewerId: 'alice', decision: 'approve', timestampMs: 1000 },
      { reviewerId: 'bob', decision: 'approve', timestampMs: 3000 },
      { reviewerId: 'alice', decision: 'reject', timestampMs: 4000 },
    ]);
    expect(tallyReRejected.approved).toBe(false);
    expect(tallyReRejected.blockedByRejection).toBe(true);
    expect(tallyReRejected.rejections).toEqual(['alice']);
  });

  it('requires explicit human confirm, refuses judge mode and agent actors, and respects axe-core block (#288)', () => {
    const approvedReviews = [{ reviewerId: 'alice', decision: 'approve' as const, timestampMs: 1000 }];

    // Judge mode cannot confirm
    expect(
      evaluatePromotionGate({
        reviews: approvedReviews,
        actorKind: 'human',
        confirmHumanReview: true,
        judgeMode: true,
        pixelmatchStatus: 'regression',
      }),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('Judge mode is advisory'),
    });

    // Agent or model actor cannot confirm
    expect(
      evaluatePromotionGate({
        reviews: approvedReviews,
        actorKind: 'agent',
        confirmHumanReview: true,
        pixelmatchStatus: 'regression',
      }),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('explicit human confirmation'),
    });

    // axe-core block (#288) prevents promotion even with human approval
    expect(
      evaluatePromotionGate({
        reviews: approvedReviews,
        actorKind: 'human',
        confirmHumanReview: true,
        axeBlocked: true,
        axeViolationSummary: '2 critical violations',
        pixelmatchStatus: 'regression',
      }),
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('Accessibility check failed'),
    });

    // Valid human confirmation with no rejections and no axe block succeeds
    expect(
      evaluatePromotionGate({
        reviews: approvedReviews,
        actorKind: 'human',
        confirmHumanReview: true,
        axeBlocked: false,
        pixelmatchStatus: 'regression',
        advisoryModelNote: {
          classification: 'intentional',
          explanation: 'Model thinks this is intentional',
          confidence: 0.99,
        },
      }),
    ).toMatchObject({
      allowed: true,
      pixelmatchStatus: 'regression',
      modelNoteAdvisoryOnly: true,
    });
  });

  it('marks model notes as advisory and never lets an intentional model note bypass missing human review', () => {
    const res = evaluatePromotionGate({
      reviews: [],
      actorKind: 'human',
      confirmHumanReview: true,
      pixelmatchStatus: 'regression',
      advisoryModelNote: {
        classification: 'intentional',
        explanation: 'Intentional copy update',
        confidence: 0.99,
      },
    });
    expect(res.allowed).toBe(false);
    expect(res.modelNoteAdvisoryOnly).toBe(true);
    expect(res.pixelmatchStatus).toBe('regression');
  });
});
