import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { PLANS, getPlan, checkLimit, hasFeature } from '../src/billing/plans.js';
import {
  createCheckoutSession,
  verifyStripeSignature,
  interpretStripeEvent,
  type StripeConfig,
} from '../src/billing/stripe.js';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';

describe('plans', () => {
  it('exposes free/pro/business', () => {
    expect(Object.keys(PLANS)).toEqual(['free', 'pro', 'business']);
    expect(PLANS.pro.priceCents).toBe(2900);
  });
  it('getPlan defaults unknown ids to free', () => {
    expect(getPlan('nope').id).toBe('free');
    expect(getPlan('business').id).toBe('business');
  });
  it('checkLimit enforces finite limits and allows unlimited', () => {
    expect(checkLimit(PLANS.free, 'runsPerMonth', 49).allowed).toBe(true);
    expect(checkLimit(PLANS.free, 'runsPerMonth', 50).allowed).toBe(false);
    expect(checkLimit(PLANS.business, 'runsPerMonth', 1_000_000).allowed).toBe(true);
  });
  it('hasFeature reflects plan gates', () => {
    expect(hasFeature(PLANS.free, 'productionMonitoring')).toBe(false);
    expect(hasFeature(PLANS.business, 'productionMonitoring')).toBe(true);
  });
});

const config: StripeConfig = {
  secretKey: 'sk_test',
  webhookSecret: 'whsec_test',
  priceIds: { pro: 'price_pro', business: 'price_biz' },
  successUrl: 'https://x/success',
  cancelUrl: 'https://x/cancel',
};

describe('createCheckoutSession', () => {
  it('POSTs a subscription session and returns the URL', async () => {
    let body = '';
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await createCheckoutSession(config, { plan: 'pro', clientReferenceId: 'team1' }, fakeFetch);
    expect(res.url).toContain('checkout.stripe.com');
    expect(body).toContain('price_pro');
    expect(body).toContain('mode=subscription');
    expect(body).toContain('metadata%5Bteam_id%5D=team1');
  });

  it('throws for a plan without a configured price', async () => {
    const noBiz = { ...config, priceIds: { pro: 'price_pro' } };
    await expect(createCheckoutSession(noBiz, { plan: 'business', clientReferenceId: 't' })).rejects.toThrow(/No Stripe price/);
  });
});

describe('verifyStripeSignature', () => {
  function sign(payload: string, ts: number): string {
    const mac = createHmac('sha256', config.webhookSecret).update(`${ts}.${payload}`).digest('hex');
    return `t=${ts},v1=${mac}`;
  }
  it('accepts a fresh valid signature', async () => {
    const ts = 1_900_000_000;
    const payload = '{"hello":"world"}';
    expect(await verifyStripeSignature(payload, sign(payload, ts), config.webhookSecret, ts)).toBe(true);
  });
  it('rejects a stale timestamp', async () => {
    const ts = 1_900_000_000;
    const payload = '{}';
    expect(await verifyStripeSignature(payload, sign(payload, ts), config.webhookSecret, ts + 10_000)).toBe(false);
  });
  it('rejects a tampered payload', async () => {
    const ts = 1_900_000_000;
    expect(await verifyStripeSignature('{}', sign('{"a":1}', ts), config.webhookSecret, ts)).toBe(false);
  });
  it('rejects a missing header', async () => {
    expect(await verifyStripeSignature('{}', null, config.webhookSecret)).toBe(false);
  });
});

describe('interpretStripeEvent', () => {
  it('maps checkout.session.completed to a plan upgrade', () => {
    const e = interpretStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'team1', customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'pro', team_id: 'team1' } } },
    });
    expect(e?.teamId).toBe('team1');
    expect(e?.plan).toBe('pro');
  });
  it('maps subscription.deleted to free downgrade', () => {
    const e = interpretStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { team_id: 'team1' } } },
    });
    expect(e?.plan).toBe('free');
    expect(e?.cancel).toBe(true);
  });
  it('returns null for unhandled events', () => {
    expect(interpretStripeEvent({ type: 'charge.refunded', data: { object: {} } })).toBeNull();
  });
});

describe('billing routes (dev mode)', () => {
  beforeEach(() => resetMemoryStore());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  it('GET /v1/billing/usage returns plan + limits', async () => {
    const res = await app.request('/v1/billing/usage', { headers: auth('alice') });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe('free');
    expect(json.limits.runs).toBe(50);
  });

  it('checkout returns 501 when Stripe not configured', async () => {
    // Create a team so the membership check passes.
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;
    const res = await app.request('/v1/billing/checkout', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ plan: 'pro', teamId }),
    });
    expect(res.status).toBe(501);
  });

  it('webhook updates a team plan (no signature in dev)', async () => {
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;

    const event = {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: teamId, customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'pro', team_id: teamId } } },
    };
    const res = await app.request('/v1/billing/webhook', { method: 'POST', body: JSON.stringify(event) });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toBe('pro');

    const team = await getMemoryStore().getTeam(teamId);
    expect(team?.plan).toBe('pro');
  });

  it('checkout 401 without an API key', async () => {
    const res = await app.request('/v1/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'pro', teamId: 't' }),
    });
    expect(res.status).toBe(401);
  });

  // Stripe must be configured for the validation/RBAC branches to be reached
  // (the route returns 501 before validation otherwise).
  const stripeEnv = { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_PRO: 'price_pro' };

  it('checkout 400 on invalid plan', async () => {
    const res = await app.request(
      '/v1/billing/checkout',
      { method: 'POST', headers: auth('alice'), body: JSON.stringify({ plan: 'enterprise', teamId: 't' }) },
      stripeEnv,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/pro.*business/);
  });

  it('checkout 400 when teamId is missing', async () => {
    const res = await app.request(
      '/v1/billing/checkout',
      { method: 'POST', headers: auth('alice'), body: JSON.stringify({ plan: 'pro' }) },
      stripeEnv,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/teamId/);
  });

  it('checkout 403 when caller is not an owner/admin', async () => {
    // alice owns the team; bob is only a member.
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;
    const store = getMemoryStore();
    // Resolve bob's demo id and add as a plain member.
    const { createHash } = await import('node:crypto');
    const bobId = `demo:${createHash('sha256').update('bob').digest('hex')}`;
    await store.createUser({ id: bobId, plan: 'free', createdAt: 'now' });
    await store.addMember({ teamId, userId: bobId, role: 'member', createdAt: 'now' });

    const res = await app.request(
      '/v1/billing/checkout',
      { method: 'POST', headers: auth('bob'), body: JSON.stringify({ plan: 'pro', teamId }) },
      stripeEnv,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/owners\/admins/);
  });

  it('checkout 200 returns a session when Stripe is configured', async () => {
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }), { status: 200 })) as typeof fetch;
    try {
      const res = await app.request(
        '/v1/billing/checkout',
        { method: 'POST', headers: auth('alice'), body: JSON.stringify({ plan: 'pro', teamId, email: 'a@b.com' }) },
        { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_PRO: 'price_pro' },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).url).toContain('checkout.stripe.com');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('webhook 401 on invalid signature when Stripe is configured', async () => {
    const res = await app.request(
      '/v1/billing/webhook',
      { method: 'POST', headers: { 'stripe-signature': 'bad' }, body: '{}' },
      { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh' },
    );
    expect(res.status).toBe(401);
  });

  it('webhook 400 on invalid JSON (dev, no signature)', async () => {
    const res = await app.request('/v1/billing/webhook', { method: 'POST', body: 'not json' });
    expect(res.status).toBe(400);
  });

  it('webhook returns handled:false for unrecognised events', async () => {
    const res = await app.request('/v1/billing/webhook', {
      method: 'POST', body: JSON.stringify({ type: 'ping', data: { object: {} } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).handled).toBe(false);
  });

  it('usage reflects a team plan when teamId is given', async () => {
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'pro' });

    const res = await app.request(`/v1/billing/usage?teamId=${teamId}`, { headers: auth('alice') });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toBe('pro');
  });

  it('rejects usage for a team the caller is not a member of (no plan bypass)', async () => {
    const teamRes = await app.request('/v1/teams', {
      method: 'POST', headers: auth('alice'), body: JSON.stringify({ name: 'A' }),
    });
    const teamId = (await teamRes.json()).id;
    await getMemoryStore().updateTeam(teamId, { plan: 'business' });
    // Mallory is not a member; she must not inherit the business plan.
    const res = await app.request(`/v1/billing/usage?teamId=${teamId}`, { headers: auth('mallory') });
    expect(res.status).toBe(403);
  });

  it('usage 401 without an API key', async () => {
    const res = await app.request('/v1/billing/usage');
    expect(res.status).toBe(401);
  });

  it('enforces the free run limit with a 402', async () => {
    const store = getMemoryStore();
    // The dev guard maps a token to `demo:<sha256(token)>`; compute that id and
    // pre-seed usage at the free-plan limit (50 runs this month).
    const { createHash } = await import('node:crypto');
    const demoId = `demo:${createHash('sha256').update('overlimit').digest('hex')}`;
    const month = new Date().toISOString().slice(0, 7);
    await store.incrementUsage(demoId, month, 50, 0);

    const res = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('overlimit'),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()).upgradeUrl).toContain('pricing');
  });
});
