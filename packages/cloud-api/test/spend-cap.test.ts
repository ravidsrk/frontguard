import { describe, it, expect } from 'vitest';
import { evaluateSpendCap, highestTierCrossed, SPEND_TIERS } from '../src/billing/spend-cap.js';
import { InMemoryStore } from '../src/db/store.js';
import { getPlan } from '../src/billing/plans.js';

describe('highestTierCrossed', () => {
  it('returns 0 for unlimited plans', () => {
    expect(highestTierCrossed(1_000_000, null)).toBe(0);
  });
  it('returns 0 below 80%', () => {
    expect(highestTierCrossed(39, 50)).toBe(0); // 78%
  });
  it('returns 80 between 80% and 95%', () => {
    expect(highestTierCrossed(40, 50)).toBe(80); // 80%
    expect(highestTierCrossed(47, 50)).toBe(80); // 94%
  });
  it('returns 95 at or above 95%', () => {
    expect(highestTierCrossed(48, 50)).toBe(95); // 96%
  });
  it('exposes both tiers in order', () => {
    expect(SPEND_TIERS.map((t) => t.tier)).toEqual([80, 95]);
  });
});

describe('evaluateSpendCap', () => {
  const month = '2026-06';
  const plan = getPlan('free'); // 50 runs/month

  it('returns unlimited for the business plan', async () => {
    const store = new InMemoryStore();
    const business = getPlan('business');
    await store.createUser({ id: 'u1', email: 'u@x.com', plan: 'business', createdAt: 'now' });
    const u = (await store.getUser('u1'))!;
    const res = await evaluateSpendCap({}, store, u, business, month);
    expect(res.reason).toBe('unlimited');
  });

  it('does not email when usage is below 80%', async () => {
    const store = new InMemoryStore();
    await store.createUser({ id: 'u1', email: 'u@x.com', plan: 'free', createdAt: 'now' });
    await store.incrementUsage('u1', month, 30, 0); // 60%
    const u = (await store.getUser('u1'))!;
    const res = await evaluateSpendCap({}, store, u, plan, month);
    expect(res.reason).toBe('unchanged');
    expect(res.tier).toBe(0);
  });

  it('emails once per tier per month (idempotent)', async () => {
    const store = new InMemoryStore();
    await store.createUser({ id: 'u1', email: 'u@x.com', plan: 'free', createdAt: 'now' });
    await store.incrementUsage('u1', month, 41, 0); // 82%

    let sentCount = 0;
    const fakeFetch = (async () => {
      sentCount++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const u = (await store.getUser('u1'))!;
    const first = await evaluateSpendCap({ RESEND_API_KEY: 'k' }, store, u, plan, month, new Date(), fakeFetch);
    expect(first.reason).toBe('sent');
    expect(first.tier).toBe(80);
    expect(sentCount).toBe(1);

    // Same call again must not re-send.
    const second = await evaluateSpendCap({ RESEND_API_KEY: 'k' }, store, u, plan, month, new Date(), fakeFetch);
    expect(second.reason).toBe('unchanged');
    expect(sentCount).toBe(1);
  });

  it('escalates 80 → 95 with a second email', async () => {
    const store = new InMemoryStore();
    await store.createUser({ id: 'u1', email: 'u@x.com', plan: 'free', createdAt: 'now' });
    await store.incrementUsage('u1', month, 41, 0); // 82%

    let sentCount = 0;
    const fakeFetch = (async () => {
      sentCount++;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const u = (await store.getUser('u1'))!;
    await evaluateSpendCap({ RESEND_API_KEY: 'k' }, store, u, plan, month, new Date(), fakeFetch);
    expect(sentCount).toBe(1);

    // Usage climbs into critical band — should re-email at tier 95.
    await store.incrementUsage('u1', month, 7, 0); // now 48 (96%)
    const escalated = await evaluateSpendCap({ RESEND_API_KEY: 'k' }, store, u, plan, month, new Date(), fakeFetch);
    expect(escalated.reason).toBe('sent');
    expect(escalated.tier).toBe(95);
    expect(sentCount).toBe(2);
  });

  it('does not email a user with no recorded address (but still persists tier)', async () => {
    const store = new InMemoryStore();
    await store.createUser({ id: 'u1', plan: 'free', createdAt: 'now' }); // no email
    await store.incrementUsage('u1', month, 41, 0);
    const u = (await store.getUser('u1'))!;
    const res = await evaluateSpendCap({ RESEND_API_KEY: 'k' }, store, u, plan, month);
    expect(res.reason).toBe('no-email');
    expect(res.tier).toBe(80);
    const state = await store.getUsageAlertState('u1', month);
    expect(state?.lastTier).toBe(80);
  });
});
