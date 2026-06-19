/**
 * COST-2: Stripe subscription metadata propagates plan changes on
 * customer.subscription.updated / customer.subscription.deleted.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { createCheckoutSession, interpretStripeEvent, type StripeConfig } from '../src/billing/stripe.js';

const stripeEnv = {
  STRIPE_SECRET_KEY: 'sk_test',
  STRIPE_WEBHOOK_SECRET: 'whsec_cost2',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_BUSINESS: 'price_biz',
};

const config: StripeConfig = {
  secretKey: stripeEnv.STRIPE_SECRET_KEY,
  webhookSecret: stripeEnv.STRIPE_WEBHOOK_SECRET,
  priceIds: { pro: stripeEnv.STRIPE_PRICE_PRO, business: stripeEnv.STRIPE_PRICE_BUSINESS },
  successUrl: 'https://x/success',
  cancelUrl: 'https://x/cancel',
};

function stripeSig(payload: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const mac = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${mac}`;
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function postWebhook(event: unknown): Promise<Response> {
  const body = JSON.stringify(event);
  return app.request(
    '/v1/billing/webhook',
    {
      method: 'POST',
      headers: { 'stripe-signature': stripeSig(body, stripeEnv.STRIPE_WEBHOOK_SECRET) },
      body,
    },
    stripeEnv,
  );
}

describe('createCheckoutSession — subscription metadata (COST-2)', () => {
  it('sets subscription_data metadata so lifecycle events carry team + plan', async () => {
    let body = '';
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }), { status: 200 });
    }) as unknown as typeof fetch;

    await createCheckoutSession(config, { plan: 'business', clientReferenceId: 'team_abc' }, fakeFetch);

    expect(body).toContain('subscription_data%5Bmetadata%5D%5Bteam_id%5D=team_abc');
    expect(body).toContain('subscription_data%5Bmetadata%5D%5Bplan%5D=business');
  });
});

describe('interpretStripeEvent — subscription lifecycle (COST-2)', () => {
  it('resolves teamId from subscription metadata on updated', () => {
    const e = interpretStripeEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          metadata: { team_id: 'team1', plan: 'business' },
        },
      },
    });
    expect(e?.teamId).toBe('team1');
    expect(e?.plan).toBe('business');
  });

  it('downgrades to free on subscription.deleted', () => {
    const e = interpretStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { team_id: 'team1' } } },
    });
    expect(e?.teamId).toBe('team1');
    expect(e?.plan).toBe('free');
    expect(e?.cancel).toBe(true);
  });
});

describe('POST /v1/billing/webhook — subscription lifecycle (COST-2)', () => {
  beforeEach(() => resetMemoryStore());

  async function seedProTeam(): Promise<{ teamId: string; subscriptionId: string }> {
    const teamRes = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ name: 'Billing Team' }),
    });
    const teamId = (await teamRes.json()).id;
    const subscriptionId = 'sub_cost2_test';

    const checkoutRes = await postWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: teamId,
          customer: 'cus_cost2',
          subscription: subscriptionId,
          metadata: { plan: 'pro', team_id: teamId },
        },
      },
    });
    expect(checkoutRes.status).toBe(200);

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('pro');
    expect(team?.stripeSubscriptionId).toBe(subscriptionId);

    return { teamId, subscriptionId };
  }

  it('customer.subscription.deleted downgrades the team to free', async () => {
    const { teamId, subscriptionId } = await seedProTeam();

    const res = await postWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          customer: 'cus_cost2',
          metadata: { team_id: teamId },
        },
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.plan).toBe('free');
    expect(json.teamId).toBe(teamId);

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('free');
    expect(team?.stripeSubscriptionId).toBeUndefined();
  });

  it('customer.subscription.updated changes the team plan', async () => {
    const { teamId, subscriptionId } = await seedProTeam();

    const res = await postWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subscriptionId,
          customer: 'cus_cost2',
          metadata: { team_id: teamId, plan: 'business' },
        },
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.plan).toBe('business');
    expect(json.teamId).toBe(teamId);

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('business');
  });

  it('resolves team by stripeSubscriptionId when subscription metadata is empty', async () => {
    const { teamId, subscriptionId } = await seedProTeam();

    const res = await postWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          customer: 'cus_cost2',
          metadata: {},
        },
      },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toBe('free');

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('free');
  });

  it('falls back to stripeSubscriptionId when metadata team_id is stale', async () => {
    const { teamId, subscriptionId } = await seedProTeam();

    const res = await postWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subscriptionId,
          customer: 'cus_cost2',
          metadata: { team_id: 'team_deleted_or_stale', plan: 'business' },
        },
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.teamId).toBe(teamId);
    expect(json.plan).toBe('business');

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('business');
  });

  it('falls back to stripeSubscriptionId on deleted when metadata team_id is invalid', async () => {
    const { teamId, subscriptionId } = await seedProTeam();

    const res = await postWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscriptionId,
          customer: 'cus_cost2',
          metadata: { team_id: 'team_does_not_exist' },
        },
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.handled).toBe(true);
    expect(json.teamId).toBe(teamId);
    expect(json.plan).toBe('free');

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('free');
  });
});