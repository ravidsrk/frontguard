/**
 * Billing plan definitions and limits (Task 8.2).
 *
 * Plans gate cloud usage. Limits are enforced by the billing middleware;
 * `null` means unlimited.
 *
 * @module billing/plans
 */

/** Supported plan identifiers. */
export type PlanId = 'free' | 'pro' | 'business';

/** Per-plan limits. `null` = unlimited. */
export interface PlanLimits {
  runsPerMonth: number | null;
  screenshotsPerMonth: number | null;
  sandboxMinutesPerMonth: number | null;
  historyRetentionDays: number;
  teamMembers: number | null;
  monitors: number | null;
  productionMonitoring: boolean;
  ssoSaml: boolean;
  casUnchangedDeduplication: boolean;
}

/** A plan definition. */
export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD cents (0 for free). */
  priceCents: number;
  limits: PlanLimits;
}

/** The plan catalogue. */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    limits: {
      runsPerMonth: 50,
      screenshotsPerMonth: 500,
      sandboxMinutesPerMonth: 30,
      historyRetentionDays: 7,
      teamMembers: 1,
      monitors: 1,
      productionMonitoring: false,
      ssoSaml: false,
      casUnchangedDeduplication: true,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 2900,
    limits: {
      runsPerMonth: 500,
      screenshotsPerMonth: 35000,
      sandboxMinutesPerMonth: 500,
      historyRetentionDays: 30,
      teamMembers: 10,
      monitors: 10,
      productionMonitoring: false,
      ssoSaml: false,
      casUnchangedDeduplication: true,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    priceCents: 9900,
    limits: {
      runsPerMonth: null,
      screenshotsPerMonth: null,
      sandboxMinutesPerMonth: 3000,
      historyRetentionDays: 90,
      teamMembers: 50,
      monitors: null,
      productionMonitoring: true,
      ssoSaml: true,
      casUnchangedDeduplication: true,
    },
  },
};

/** Resolves a plan by id, defaulting to free for unknown ids. */
export function getPlan(planId: string | undefined): Plan {
  return PLANS[(planId ?? 'free') as PlanId] ?? PLANS.free;
}

/** Result of a limit check. */
export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  current: number;
  metric: string;
}

/**
 * Checks whether an action that would push `current` usage to `current + amount`
 * stays within the plan limit. Unlimited (`null`) always allows.
 */
export function checkLimit(
  plan: Plan,
  metric: 'runsPerMonth' | 'screenshotsPerMonth' | 'teamMembers' | 'monitors' | 'sandboxMinutesPerMonth',
  current: number,
  amount = 1,
): LimitCheck {
  const limit = plan.limits[metric];
  if (limit === null) return { allowed: true, limit: null, current, metric };
  return { allowed: current + amount <= limit, limit, current, metric };
}

/** Whether a plan grants a boolean feature. */
export function hasFeature(
  plan: Plan,
  feature: 'productionMonitoring' | 'ssoSaml' | 'casUnchangedDeduplication',
): boolean {
  return plan.limits[feature];
}
