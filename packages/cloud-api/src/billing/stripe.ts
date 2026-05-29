/**
 * Stripe integration (Task 8.2) — SDK-free, Workers-compatible.
 *
 * Uses the Stripe REST API directly (form-encoded) for Checkout Session
 * creation and verifies webhook signatures with Web Crypto HMAC-SHA256. This
 * avoids bundling the Node-only Stripe SDK into a Worker.
 *
 * @module billing/stripe
 */

import type { PlanId } from './plans.js';

/** Stripe config from Worker secrets. */
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Map of planId → Stripe Price id. */
  priceIds: Partial<Record<PlanId, string>>;
  /** Where to send users after checkout. */
  successUrl: string;
  cancelUrl: string;
}

/**
 * Creates a Stripe Checkout Session for a subscription. Returns the hosted
 * checkout URL.
 *
 * @throws if the plan has no configured price or the API call fails.
 */
export async function createCheckoutSession(
  config: StripeConfig,
  params: { plan: PlanId; customerEmail?: string; clientReferenceId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; sessionId: string }> {
  const priceId = config.priceIds[params.plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan "${params.plan}"`);

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', config.successUrl);
  form.set('cancel_url', config.cancelUrl);
  form.set('client_reference_id', params.clientReferenceId);
  if (params.customerEmail) form.set('customer_email', params.customerEmail);
  // Carry plan + team through to the webhook.
  form.set('metadata[plan]', params.plan);
  form.set('metadata[team_id]', params.clientReferenceId);

  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status}`);
  const data = (await res.json()) as { id: string; url: string };
  return { url: data.url, sessionId: data.id };
}

/**
 * Verifies a Stripe webhook signature (`Stripe-Signature` header).
 *
 * The header is `t=<timestamp>,v1=<hmac>`; the signed payload is
 * `<timestamp>.<rawBody>` using HMAC-SHA256 with the webhook secret.
 *
 * @param toleranceSec - Max allowed clock skew (default 5 minutes).
 */
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  webhookSecret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k.trim(), v];
    }),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;

  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(computed, expectedSig);
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A normalised billing event derived from a Stripe webhook. */
export interface BillingEvent {
  type: string;
  /** The team this event applies to (from metadata/client_reference_id). */
  teamId?: string;
  /** New plan (for checkout/subscription updates). */
  plan?: PlanId;
  customerId?: string;
  subscriptionId?: string;
  /** True for downgrade-to-free events (cancellation). */
  cancel?: boolean;
}

/** Raw Stripe event shape (subset). */
interface StripeEvent {
  type: string;
  data: {
    object: {
      client_reference_id?: string;
      customer?: string;
      subscription?: string;
      id?: string;
      metadata?: Record<string, string>;
      items?: { data: Array<{ price: { metadata?: Record<string, string>; id: string } }> };
    };
  };
}

/**
 * Interprets a parsed Stripe event into a normalised {@link BillingEvent}.
 * Returns null for events we don't act on.
 */
export function interpretStripeEvent(event: StripeEvent): BillingEvent | null {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      return {
        type: event.type,
        teamId: obj.metadata?.team_id ?? obj.client_reference_id,
        plan: (obj.metadata?.plan as PlanId) ?? 'pro',
        customerId: obj.customer,
        subscriptionId: obj.subscription,
      };
    case 'customer.subscription.updated':
      return {
        type: event.type,
        teamId: obj.metadata?.team_id,
        plan: (obj.metadata?.plan as PlanId) ?? undefined,
        customerId: obj.customer,
        subscriptionId: obj.id,
      };
    case 'customer.subscription.deleted':
      return {
        type: event.type,
        teamId: obj.metadata?.team_id,
        plan: 'free',
        customerId: obj.customer,
        subscriptionId: obj.id,
        cancel: true,
      };
    case 'invoice.payment_failed':
      return { type: event.type, teamId: obj.metadata?.team_id, customerId: obj.customer };
    default:
      return null;
  }
}
