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
import { getStore } from '../db/factory.js';
import { hashKey } from '../auth/keys.js';
import { isProduction } from '../db/factory.js';
import { getPlan } from '../billing/plans.js';
import {
  createCheckoutSession,
  verifyStripeSignature,
  interpretStripeEvent,
  type StripeConfig,
} from '../billing/stripe.js';
import { currentMonth } from '../db/store.js';

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

/** Resolves the caller's userId (mirrors the main guard, dev + prod). */
async function resolveUser(env: BillingEnv | undefined, apiKey: string | undefined): Promise<string | null> {
  if (!apiKey) return null;
  const store = getStore(env);
  if (isProduction(env)) {
    const rec = await store.getApiKey(await hashKey(apiKey));
    return rec?.userId ?? null;
  }
  const userId = `demo:${await hashKey(apiKey)}`;
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

  const billing = interpretStripeEvent(event);
  if (!billing) return c.json({ handled: false });

  const store = getStore(c.env);
  if (billing.teamId && billing.plan) {
    await store.updateTeam(billing.teamId, {
      plan: billing.plan,
      stripeCustomerId: billing.customerId,
      stripeSubscriptionId: billing.subscriptionId,
    });
  }
  return c.json({ handled: true, type: billing.type, plan: billing.plan });
});

// POST /v1/billing/checkout — create a Stripe Checkout Session.
billingRoutes.post('/checkout', async (c) => {
  const userId = await resolveUser(c.env, c.req.header('Authorization')?.replace('Bearer ', ''));
  if (!userId) return c.json({ error: 'Missing API key' }, 401);

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
  const userId = await resolveUser(c.env, c.req.header('Authorization')?.replace('Bearer ', ''));
  if (!userId) return c.json({ error: 'Missing API key' }, 401);

  const store = getStore(c.env);
  const teamId = c.req.query('teamId');
  // Resolve the plan from the team (if given) else the user's default (free).
  // A team's plan may only be claimed by an actual member of that team.
  let planId = 'free';
  if (teamId) {
    const member = await store.getMember(teamId, userId);
    if (!member) return c.json({ error: 'Not a member of the requested team' }, 403);
    const team = await store.getTeam(teamId);
    if (team) planId = team.plan;
  }
  const plan = getPlan(planId);
  const usage = await store.getUsage(userId, currentMonth());

  return c.json({
    plan: plan.id,
    usage: { runs: usage.runsCount, screenshots: usage.screenshotsCount },
    limits: {
      runs: plan.limits.runsPerMonth,
      screenshots: plan.limits.screenshotsPerMonth,
      teamMembers: plan.limits.teamMembers,
      monitors: plan.limits.monitors,
    },
  });
});
