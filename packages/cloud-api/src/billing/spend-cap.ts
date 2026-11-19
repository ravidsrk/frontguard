/**
 * Spend-cap orchestration (Task 15.7).
 *
 * Two ratios matter: 80% (yellow warning) and 95% (red critical). We email
 * once per tier per month so a user near the cap doesn't get re-spammed on
 * every run. State lives in `usage_alert_state`.
 *
 * @module billing/spend-cap
 */

import type { Store, User } from '../db/store.js';
import { highestPlanId, type Plan, type PlanId } from './plans.js';
import { sendUsageWarningEmail, type AlertEnv, type AlertDeliveryResult } from '../alerts/index.js';

/**
 * Recomputes a user's denormalized `users.plan` from all teams they currently
 * own so cancelling or leaving one team never downgrades an owner who still
 * has another active paid team.
 */
export async function syncUserPlanFromTeams(store: Store, userId: string): Promise<PlanId> {
  const teams = await store.listTeamsForUser(userId);
  const ownedPlans = teams.filter((t) => t.role === 'owner').map((t) => t.plan);
  const effective = highestPlanId(ownedPlans);
  await store.updateUserPlan(userId, effective);
  return effective;
}

/** The thresholds we alert at, in ascending order. */
export const SPEND_TIERS: Array<{ tier: 80 | 95; ratio: number }> = [
  { tier: 80, ratio: 0.8 },
  { tier: 95, ratio: 0.95 },
];

/**
 * Returns the highest tier `usedRuns` crosses given `runsLimit`, or 0 if
 * below 80%. Unlimited plans (`runsLimit == null`) always return 0.
 */
export function highestTierCrossed(usedRuns: number, runsLimit: number | null): 0 | 80 | 95 {
  if (runsLimit == null || runsLimit <= 0) return 0;
  const ratio = usedRuns / runsLimit;
  let highest: 0 | 80 | 95 = 0;
  for (const t of SPEND_TIERS) {
    if (ratio >= t.ratio) highest = t.tier;
  }
  return highest;
}

/** Result of a spend-cap evaluation. */
export interface SpendCapResult {
  reason: 'sent' | 'unchanged' | 'unlimited' | 'no-email';
  tier: 0 | 80 | 95;
  delivery?: AlertDeliveryResult;
}

/**
 * Evaluates the user's current usage against the plan limit, and — if a new
 * tier (80 or 95) has been crossed since the last email — sends a warning
 * email. Persists the highest tier alerted to `usage_alert_state` so
 * subsequent calls in the same month are idempotent at that tier.
 */
export async function evaluateSpendCap(
  env: AlertEnv,
  store: Store,
  user: User,
  plan: Plan,
  month: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  teamId?: string,
): Promise<SpendCapResult> {
  const limit = plan.limits.runsPerMonth;
  if (limit == null) return { reason: 'unlimited', tier: 0 };

  const runsCount =
    teamId && plan.id !== 'free'
      ? (await store.getTeamUsage(teamId, month)).runsCount
      : (await store.getUsage(user.id, month)).runsCount;
  const tier = highestTierCrossed(runsCount, limit);
  if (tier === 0) return { reason: 'unchanged', tier: 0 };

  const state = await store.getUsageAlertState(user.id, month);
  if (state && state.lastTier >= tier) {
    // Already alerted at this (or a higher) tier this month — don't re-spam.
    return { reason: 'unchanged', tier };
  }

  if (!user.email) {
    // Persist the tier so we won't keep retrying when there's no inbox.
    await store.setUsageAlertState({ userId: user.id, month, lastTier: tier, lastAlertAt: now.toISOString() });
    return { reason: 'no-email', tier };
  }

  const delivery = await sendUsageWarningEmail(
    env,
    [user.email],
    { plan: plan.name, tier, used: runsCount, limit },
    fetchImpl,
  );
  await store.setUsageAlertState({ userId: user.id, month, lastTier: tier, lastAlertAt: now.toISOString() });
  return { reason: 'sent', tier, delivery };
}
