/**
 * Multi-user review policy and promotion gate for the hosted review design spike (#294).
 *
 * Rules:
 * - Only each reviewer's latest review counts.
 * - One active rejection from any reviewer blocks promotion.
 * - Promotion requires explicit human confirmation (`confirmHumanReview: true`, `actorKind: 'human'`).
 * - Judge mode (`judgeMode: true`) and model/agent verdicts cannot supply confirmation.
 * - `axe-core` blocking violations (`#288`) block promotion regardless of visual approvals.
 * - `pixelmatch` remains the sole pass/fail comparator; model text is marked advisory.
 */

export type ReviewDecision = 'approve' | 'reject';
export type ActorKind = 'human' | 'agent' | 'model';

export interface ShotReviewEvent {
  reviewerId: string;
  decision: ReviewDecision;
  timestampMs: number;
  comment?: string;
}

export interface AdvisoryModelNote {
  classification: 'regression' | 'intentional' | 'content_update';
  explanation: string;
  confidence: number;
}

export interface EvaluatedReviewTally {
  latestByReviewer: Map<string, ShotReviewEvent>;
  approvals: string[];
  rejections: string[];
  approved: boolean;
  blockedByRejection: boolean;
}

export interface PromotionGateInput {
  reviews: readonly ShotReviewEvent[];
  actorKind: ActorKind;
  confirmHumanReview: boolean;
  judgeMode?: boolean;
  axeBlocked?: boolean;
  axeViolationSummary?: string;
  pixelmatchStatus: 'pass' | 'changed' | 'regression' | 'new' | 'error';
  advisoryModelNote?: AdvisoryModelNote;
}

export interface PromotionGateResult {
  allowed: boolean;
  reason?: string;
  pixelmatchStatus: PromotionGateInput['pixelmatchStatus'];
  modelNoteAdvisoryOnly: true;
  tally: {
    approvals: string[];
    rejections: string[];
  };
}

/**
 * Computes the effective review tally where only each reviewer's latest event counts
 * and any active rejection blocks.
 */
export function evaluateMultiUserReviews(
  events: readonly ShotReviewEvent[],
): EvaluatedReviewTally {
  const latestByReviewer = new Map<string, ShotReviewEvent>();

  for (const event of events) {
    const existing = latestByReviewer.get(event.reviewerId);
    if (!existing || event.timestampMs >= existing.timestampMs) {
      latestByReviewer.set(event.reviewerId, event);
    }
  }

  const approvals: string[] = [];
  const rejections: string[] = [];

  for (const [reviewerId, latest] of latestByReviewer.entries()) {
    if (latest.decision === 'approve') {
      approvals.push(reviewerId);
    } else {
      rejections.push(reviewerId);
    }
  }

  approvals.sort();
  rejections.sort();

  const blockedByRejection = rejections.length > 0;
  const approved = approvals.length > 0 && !blockedByRejection;

  return {
    latestByReviewer,
    approvals,
    rejections,
    approved,
    blockedByRejection,
  };
}

/**
 * Evaluates whether a baseline promotion is permitted under #294, #287, and #288.
 */
export function evaluatePromotionGate(input: PromotionGateInput): PromotionGateResult {
  const tally = evaluateMultiUserReviews(input.reviews);
  const base = {
    pixelmatchStatus: input.pixelmatchStatus,
    modelNoteAdvisoryOnly: true as const,
    tally: {
      approvals: tally.approvals,
      rejections: tally.rejections,
    },
  };

  if (input.judgeMode) {
    return {
      ...base,
      allowed: false,
      reason: 'Judge mode is advisory and cannot promote or confirm baselines (#287).',
    };
  }

  if (input.actorKind !== 'human' || !input.confirmHumanReview) {
    return {
      ...base,
      allowed: false,
      reason:
        'Baseline promotion requires explicit human confirmation (`confirmHumanReview: true` from a human reviewer).',
    };
  }

  if (input.axeBlocked) {
    return {
      ...base,
      allowed: false,
      reason: `Accessibility check failed (${input.axeViolationSummary ?? 'axe-core blocking violations'}). Baselines were not promoted (#288).`,
    };
  }

  if (input.pixelmatchStatus === 'error') {
    return {
      ...base,
      allowed: false,
      reason: 'Cannot promote a capture that failed with a render or comparison error.',
    };
  }

  if (tally.blockedByRejection) {
    return {
      ...base,
      allowed: false,
      reason: `Promotion blocked by rejection from: ${tally.rejections.join(', ')}.`,
    };
  }

  if (!tally.approved) {
    return {
      ...base,
      allowed: false,
      reason: 'Promotion requires at least one active reviewer approval.',
    };
  }

  return {
    ...base,
    allowed: true,
  };
}
