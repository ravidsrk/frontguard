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

const STRIPE_FETCH_TIMEOUT_MS = 15_000;

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
  // Carry plan + team through checkout and onto the resulting Subscription.
  form.set('metadata[plan]', params.plan);
  form.set('metadata[team_id]', params.clientReferenceId);
  form.set('subscription_data[metadata][plan]', params.plan);
  form.set('subscription_data[metadata][team_id]', params.clientReferenceId);

  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(STRIPE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status}`);
  const data = (await res.json()) as { id: string; url: string };
  return { url: data.url, sessionId: data.id };
}

/**
 * Verifies a Stripe webhook signature (`Stripe-Signature` header).
 *
 * The header is `t=<timestamp>,v1=<hmac>[,v1=<hmac2>...]`; the signed payload
 * is `<timestamp>.<rawBody>` using HMAC-SHA256 with the webhook secret.
 * Supports multiple `v1=` signatures for zero-downtime secret rotation and
 * rejects malformed/non-finite timestamps.
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
  if (!sigHeader || !webhookSecret) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of sigHeader.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!v) continue;
    if (k === 't') {
      timestamp = v;
    } else if (k === 'v1') {
      signatures.push(v);
    }
  }

  if (!timestamp || signatures.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !Number.isFinite(nowSec)) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');

  // Evaluate every candidate signature without early exit on length/value mismatch.
  let matched = false;
  for (const candidate of signatures) {
    if (timingSafeEqual(computed, candidate)) {
      matched = true;
    }
  }
  return matched;
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
  /** Stripe event id (for idempotency deduplication). */
  eventId?: string;
  /** Stripe Unix timestamp in seconds (for out-of-order protection). */
  created?: number;
  /** The team this event applies to (from metadata/client_reference_id). */
  teamId?: string;
  /** New plan (for checkout/subscription updates). */
  plan?: PlanId;
  customerId?: string;
  subscriptionId?: string;
  /** True for downgrade-to-free events (cancellation / terminal non-payment). */
  cancel?: boolean;
  /** True when the event is an invoice.payment_failed notification. */
  paymentFailed?: boolean;
  /** Non-null when payment failed permanently (no further retry scheduled). */
  terminalFailure?: boolean;
  /** When set, the event was intentionally ignored (e.g. unpaid checkout). */
  ignoredReason?: string;
}

/** Raw Stripe event shape (subset). */
export interface StripeEvent {
  id?: string;
  created?: number;
  type: string;
  data: {
    object: {
      client_reference_id?: string;
      customer?: string;
      subscription?: string;
      id?: string;
      status?: string;
      payment_status?: string;
      attempt_count?: number;
      next_payment_attempt?: number | null;
      metadata?: Record<string, string>;
      subscription_details?: { metadata?: Record<string, string> };
      items?: { data: Array<{ price?: { metadata?: Record<string, string>; id?: string } }> };
      line_items?: { data: Array<{ price?: { id?: string } }> };
    };
  };
}

function parsePlanId(raw: string | undefined): PlanId | undefined {
  if (raw === 'free' || raw === 'pro' || raw === 'business') return raw;
  return undefined;
}

/** Resolves a PlanId from a Stripe Price ID using the server's configured price map. */
function planFromPriceId(
  priceId: string | undefined,
  priceIds?: Partial<Record<PlanId, string>>,
): PlanId | undefined {
  if (!priceId || !priceIds) return undefined;
  if (priceIds.business && priceId === priceIds.business) return 'business';
  if (priceIds.pro && priceId === priceIds.pro) return 'pro';
  return undefined;
}

/**
 * Interprets a parsed Stripe event into a normalised {@link BillingEvent}.
 * Validates payment_status, subscription status, and configured price IDs
 * before authorizing plan upgrades. Returns null for events we don't act on.
 */
export function interpretStripeEvent(
  event: StripeEvent,
  priceIds?: Partial<Record<PlanId, string>>,
): BillingEvent | null {
  const obj = event.data?.object;
  if (!obj) return null;

  const base = {
    eventId: typeof event.id === 'string' && event.id.length > 0 ? event.id : undefined,
    created:
      typeof event.created === 'number' && Number.isFinite(event.created) && event.created > 0
        ? event.created
        : undefined,
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      // Reject unpaid / incomplete checkout sessions (e.g. async SEPA/boleto pending).
      if (
        obj.payment_status !== undefined &&
        obj.payment_status !== 'paid' &&
        obj.payment_status !== 'no_payment_required'
      ) {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id ?? obj.client_reference_id,
          customerId: obj.customer,
          subscriptionId: obj.subscription,
          ignoredReason: `payment_status:${obj.payment_status}`,
        };
      }
      if (obj.status !== undefined && obj.status !== 'complete') {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id ?? obj.client_reference_id,
          customerId: obj.customer,
          subscriptionId: obj.subscription,
          ignoredReason: `session_status:${obj.status}`,
        };
      }
      const linePriceId =
        obj.line_items?.data?.[0]?.price?.id ?? obj.items?.data?.[0]?.price?.id;
      const fromPrice = planFromPriceId(linePriceId, priceIds);
      if (linePriceId && priceIds && (priceIds.pro || priceIds.business) && !fromPrice) {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id ?? obj.client_reference_id,
          customerId: obj.customer,
          subscriptionId: obj.subscription,
          ignoredReason: `unknown_price:${linePriceId}`,
        };
      }
      const metaPlan = parsePlanId(obj.metadata?.plan);
      const resolvedPlan = fromPrice ?? (metaPlan && metaPlan !== 'free' ? metaPlan : 'pro');
      return {
        ...base,
        type: event.type,
        teamId: obj.metadata?.team_id ?? obj.client_reference_id,
        plan: resolvedPlan,
        customerId: obj.customer,
        subscriptionId: obj.subscription,
      };
    }

    case 'customer.subscription.updated': {
      const subStatus = obj.status;
      // Terminal non-active statuses must downgrade back to free.
      if (
        subStatus === 'canceled' ||
        subStatus === 'unpaid' ||
        subStatus === 'incomplete_expired'
      ) {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id,
          plan: 'free',
          customerId: obj.customer,
          subscriptionId: obj.id,
          cancel: true,
        };
      }
      // Do not grant or change paid plans while subscription is incomplete, paused, or past_due.
      if (subStatus === 'incomplete' || subStatus === 'paused' || subStatus === 'past_due') {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id,
          customerId: obj.customer,
          subscriptionId: obj.id,
          ignoredReason: `subscription_status:${subStatus}`,
        };
      }
      const itemPriceId = obj.items?.data?.[0]?.price?.id;
      const fromPrice = planFromPriceId(itemPriceId, priceIds);
      if (itemPriceId && priceIds && (priceIds.pro || priceIds.business) && !fromPrice) {
        return {
          ...base,
          type: event.type,
          teamId: obj.metadata?.team_id,
          customerId: obj.customer,
          subscriptionId: obj.id,
          ignoredReason: `unknown_price:${itemPriceId}`,
        };
      }
      return {
        ...base,
        type: event.type,
        teamId: obj.metadata?.team_id,
        plan: fromPrice ?? parsePlanId(obj.metadata?.plan),
        customerId: obj.customer,
        subscriptionId: obj.id,
      };
    }

    case 'customer.subscription.deleted':
      return {
        ...base,
        type: event.type,
        teamId: obj.metadata?.team_id,
        plan: 'free',
        customerId: obj.customer,
        subscriptionId: obj.id,
        cancel: true,
      };

    case 'invoice.payment_failed': {
      const terminalFailure = obj.next_payment_attempt === null;
      return {
        ...base,
        type: event.type,
        teamId: obj.metadata?.team_id ?? obj.subscription_details?.metadata?.team_id,
        customerId: obj.customer,
        subscriptionId: obj.subscription,
        paymentFailed: true,
        terminalFailure,
        ...(terminalFailure ? { plan: 'free' as PlanId, cancel: true } : {}),
      };
    }

    default:
      return null;
  }
}
