/**
 * Billing routes (Task 8.2).
 *
 * - `POST /v1/billing/webhook` — Stripe webhook (no auth; signature-verified).
 * - `POST /v1/billing/checkout` — create a Checkout Session (auth required).
 * - `GET  /v1/billing/usage` — current usage vs plan limits (auth required).
 *
 * The webhook is mounted before the `/v1/*` auth guard. Checkout + usage run
 * their own lightweight auth (resolving userId) since they're mounted early too.
 *
 * @module routes/billing
 */

import { Hono } from 'hono';
import type { Bindings } from '../db/factory.js';
import { getStore, isProduction } from '../db/factory.js';
import { allocateDemoUserId } from '../auth/demo-user.js';
import { hashKey } from '../auth/keys.js';
import { getPlan, highestPlanId } from '../billing/plans.js';
import { syncUserPlanFromTeams } from '../billing/spend-cap.js';
import {
  createCheckoutSession,
  verifyStripeSignature,
  interpretStripeEvent,
  type BillingEvent,
  type StripeConfig,
} from '../billing/stripe.js';
import type { Store } from '../db/store.js';
import { currentMonth } from '../db/store.js';
import { clientIpFromHeaders, enforceRateLimit } from '../rate-limit.js';

/** Billing-specific env. */
export interface BillingEnv extends Bindings {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_BUSINESS?: string;
  BILLING_SUCCESS_URL?: string;
  BILLING_CANCEL_URL?: string;
}

export const billingRoutes = new Hono<{ Bindings: BillingEnv }>();

/** Builds StripeConfig from env, or null if not configured. */
function stripeConfig(env: BillingEnv | undefined): StripeConfig | null {
  if (!env?.STRIPE_SECRET_KEY || !env?.STRIPE_WEBHOOK_SECRET) return null;
  return {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceIds: { pro: env.STRIPE_PRICE_PRO, business: env.STRIPE_PRICE_BUSINESS },
    successUrl: env.BILLING_SUCCESS_URL ?? 'https://frontguard.dev/billing/success',
    cancelUrl: env.BILLING_CANCEL_URL ?? 'https://frontguard.dev/billing/cancel',
  };
}

/**
 * Resolves the team a Stripe billing event applies to.
 * Prefers metadata team_id when it points at an existing team; otherwise
 * falls back to stripe_subscription_id and stripe_customer_id linkage.
 */
async function resolveBillingTeamId(store: Store, billing: BillingEvent): Promise<string | undefined> {
  if (billing.teamId) {
    const team = await store.getTeam(billing.teamId);
    if (team) return billing.teamId;
  }
  if (billing.subscriptionId) {
    const team = await store.getTeamByStripeSubscriptionId(billing.subscriptionId);
    if (team) return team.id;
  }
  if (billing.customerId) {
    const team = await store.getTeamByStripeCustomerId(billing.customerId);
    if (team) return team.id;
  }
  return undefined;
}

/** Resolves the caller's userId (mirrors the main guard, dev + prod). */
async function resolveUser(env: BillingEnv | undefined, apiKey: string | undefined): Promise<string | null> {
  if (!apiKey) return null;
  const store = getStore(env);
  if (isProduction(env)) {
    const rec = await store.getApiKey(await hashKey(apiKey));
    return rec?.userId ?? null;
  }
  const userId = await allocateDemoUserId(store, apiKey);
  if (!(await store.getUser(userId))) {
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });
  }
  return userId;
}

// POST /v1/billing/webhook — Stripe → plan changes. No bearer auth.
//
// P0-7: unsigned events are NEVER accepted. When the webhook secret is unset
// the endpoint returns 503 "billing unconfigured" — previously any
// unauthenticated POST flipped a team to `business`. When the secret is set,
// the signature is verified with HMAC-SHA256 (see `verifyStripeSignature`).
billingRoutes.post('/webhook', async (c) => {
  const clientIp = clientIpFromHeaders((name) => c.req.header(name));
  const blocked = enforceRateLimit(c, `webhook:${clientIp}`);
  if (blocked) return blocked;

  const webhookSecret = c.env?.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ error: 'Billing webhook is not configured' }, 503);
  }

  const raw = await c.req.text();
  const valid = await verifyStripeSignature(
    raw,
    c.req.header('stripe-signature') ?? null,
    webhookSecret,
  );
  if (!valid) return c.json({ error: 'Invalid signature' }, 401);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const priceIds = { pro: c.env?.STRIPE_PRICE_PRO, business: c.env?.STRIPE_PRICE_BUSINESS };
  const billing = interpretStripeEvent(event, priceIds);
  if (!billing) return c.json({ handled: false });
  if (billing.ignoredReason) {
    return c.json({ handled: false, reason: billing.ignoredReason, type: billing.type });
  }

  const store = getStore(c.env);
  const teamId = await resolveBillingTeamId(store, billing);

  if (!teamId) {
    console.warn('[billing/webhook] could not resolve team for Stripe event', {
      type: billing.type,
      metadataTeamId: billing.teamId,
      subscriptionId: billing.subscriptionId,
    });
    return c.json({ handled: false, reason: 'team_not_resolved', type: billing.type });
  }

  // Idempotency guard: skip duplicate Stripe webhook deliveries for the same event.id.
  if (billing.eventId) {
    const fresh = await store.recordStripeEvent(
      billing.eventId,
      billing.type,
      billing.created ?? 0,
      teamId,
    );
    if (!fresh) {
      return c.json({
        handled: true,
        duplicate: true,
        eventId: billing.eventId,
        type: billing.type,
        teamId,
      });
    }
  }

  const team = await store.getTeam(teamId);
  if (
    team &&
    billing.created &&
    team.stripeLastEventCreated &&
    billing.created < team.stripeLastEventCreated
  ) {
    return c.json({ handled: false, reason: 'stale_event', type: billing.type, teamId });
  }

  if (billing.paymentFailed) {
    await store.recordActivity({
      id: crypto.randomUUID(),
      teamId,
      action: 'billing.payment_failed',
      target: billing.subscriptionId ?? billing.customerId,
      metadata: JSON.stringify({
        eventId: billing.eventId ?? null,
        terminalFailure: Boolean(billing.terminalFailure),
      }),
      createdAt: new Date().toISOString(),
    });
  }

  if (billing.plan) {
    await store.updateTeam(teamId, {
      plan: billing.plan,
      stripeCustomerId: billing.customerId ?? team?.stripeCustomerId,
      stripeSubscriptionId: billing.cancel ? undefined : (billing.subscriptionId ?? team?.stripeSubscriptionId),
      ...(billing.created ? { stripeLastEventCreated: billing.created } : {}),
    });
    // Derive each owner's effective plan from ALL their active teams so
    // downgrading one team never wipes out a paid subscription on another.
    const members = await store.listMembers(teamId);
    for (const m of members) {
      if (m.role === 'owner') {
        await syncUserPlanFromTeams(store, m.userId);
      }
    }
  } else if (billing.created && team) {
    await store.updateTeam(teamId, { stripeLastEventCreated: billing.created });
  }

  return c.json({
    handled: true,
    type: billing.type,
    plan: billing.plan,
    teamId,
    ...(billing.paymentFailed ? { paymentFailed: true, terminalFailure: Boolean(billing.terminalFailure) } : {}),
  });
});

// POST /v1/billing/checkout — create a Stripe Checkout Session.
billingRoutes.post('/checkout', async (c) => {
  const clientIp = clientIpFromHeaders((name) => c.req.header(name));
  const userId = await resolveUser(c.env, c.req.header('Authorization')?.replace('Bearer ', ''));
  if (!userId) {
    const blocked = enforceRateLimit(c, `unauth:${clientIp}`);
    if (blocked) return blocked;
    return c.json({ error: 'Missing API key' }, 401);
  }
  const blocked = enforceRateLimit(c, `user:${userId}`);
  if (blocked) return blocked;

  const config = stripeConfig(c.env);
  if (!config) return c.json({ error: 'Billing is not configured' }, 501);

  const body = (await c.req.json().catch(() => ({}))) as { plan?: string; teamId?: string; email?: string };
  if (body.plan !== 'pro' && body.plan !== 'business') {
    return c.json({ error: 'plan must be "pro" or "business"' }, 400);
  }
  if (!body.teamId) return c.json({ error: 'teamId is required' }, 400);

  const store = getStore(c.env);
  const member = await store.getMember(body.teamId, userId);
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return c.json({ error: 'Only team owners/admins can manage billing' }, 403);
  }

  try {
    const session = await createCheckoutSession(config, {
      plan: body.plan,
      customerEmail: body.email,
      clientReferenceId: body.teamId,
    });
    return c.json(session);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

// GET /v1/billing/usage — usage vs plan limits.
billingRoutes.get('/usage', async (c) => {
  const clientIp = clientIpFromHeaders((name) => c.req.header(name));
  const userId = await resolveUser(c.env, c.req.header('Authorization')?.replace('Bearer ', ''));
  if (!userId) {
    const blocked = enforceRateLimit(c, `unauth:${clientIp}`);
    if (blocked) return blocked;
    return c.json({ error: 'Missing API key' }, 401);
  }
  const blocked = enforceRateLimit(c, `user:${userId}`);
  if (blocked) return blocked;

  const store = getStore(c.env);
  const teamId = c.req.query('teamId');
  const month = currentMonth();
  // Resolve the plan from the team (if given) else derive highest plan from active teams / user.
  let planId = 'free';
  let effectiveTeamId = teamId;
  if (teamId) {
    const member = await store.getMember(teamId, userId);
    if (!member) return c.json({ error: 'Not a member of the requested team' }, 403);
    const team = await store.getTeam(teamId);
    if (team) planId = team.plan;
  } else {
    const user = await store.getUser(userId);
    const teams = await store.listTeamsForUser(userId);
    const bestTeam = teams.reduce<(typeof teams)[number] | undefined>((best, t) => {
      if (!best) return t;
      return highestPlanId([best.plan, t.plan]) === t.plan && t.plan !== best.plan ? t : best;
    }, undefined);
    planId = highestPlanId([user?.plan, bestTeam?.plan]);
    if (bestTeam && bestTeam.plan !== 'free') {
      effectiveTeamId = bestTeam.id;
    }
  }
  const plan = getPlan(planId);
  const userUsage = await store.getUsage(userId, month);
  let runsCount = userUsage.runsCount;
  let screenshotsCount = userUsage.screenshotsCount;
  if (effectiveTeamId) {
    const teamUsage = await store.getTeamUsage(effectiveTeamId, month);
    runsCount = Math.max(runsCount, teamUsage.runsCount);
    screenshotsCount = Math.max(screenshotsCount, teamUsage.screenshotsCount);
  }

  return c.json({
    plan: plan.id,
    usage: { runs: runsCount, screenshots: screenshotsCount },
    limits: {
      runs: plan.limits.runsPerMonth,
      screenshots: plan.limits.screenshotsPerMonth,
      teamMembers: plan.limits.teamMembers,
      monitors: plan.limits.monitors,
    },
  });
});
