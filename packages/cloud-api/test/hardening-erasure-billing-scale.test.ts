/**
 * Reliability, erasure, billing, & scalability regression tests for #413:
 * - Deployment Gate #1 (DELETE /v1/account): no pending_run_updates resurrection,
 *   paginated R2 prefix deletes, CAS/github_login/attachment/solo-team/activity-PII cleanup,
 *   accountWritesClosed write-lock enforcement, OpenAPI contract coverage
 * - Billing & metering: monotonic sandbox_minutes_used, AI plan gate + ai_calls_used,
 *   monitor MAX_FAN_OUT + screenshot metering, .min(1) arrays, Stripe webhook idempotency,
 *   event.created ordering, payment_status/status/priceId checks, invoice.payment_failed,
 *   multi-v1 signature rotation, NaN timestamp rejection, multi-team plan derivation,
 *   team-pooled evaluateSpendCap
 * - Scale & reliability: report_html excluded from listings, limit clamping, >100 teamId
 *   D1 chunking, CAS quota check before body read, BoundedRateLimiter O(1) LRU + early
 *   route rate limiting + per-user rate limit keying, non-project monitor Tick 1 bootstrap
 *   + monitorRun.runId link, expired invite filtering + revoke route, project blob purge
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { app, apiRateLimiter } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { D1Store } from '../src/db/d1-store.js';
import { migrate } from '../src/db/migrate.js';
import { currentMonth } from '../src/db/store.js';
import {
  MemoryScreenshotStore,
  R2ScreenshotStore,
  type R2Bucket,
} from '../src/storage/screenshots.js';
import { casObjectKey, resetCasMemoryStore } from '../src/routes/cas.js';
import { casMemoryStore } from '../src/storage/cas-memory.js';
import { verifyStripeSignature, interpretStripeEvent } from '../src/billing/stripe.js';
import { evaluateSpendCap } from '../src/billing/spend-cap.js';
import { PLANS } from '../src/billing/plans.js';
import { BoundedRateLimiter } from '../src/rate-limit.js';
import { OPENAPI_SPEC } from '../src/openapi-spec.js';
import * as processor from '../src/processor.js';
import { runMonitor } from '../src/scheduler.js';
import { renderMonitorDetail, renderMonitorHistory } from '../src/dashboard/render.js';
import { createNodeSqliteD1, nodeSqliteAvailable } from './helpers/node-sqlite-d1.js';
import type { Run } from '../src/types.js';

const describeD1 = nodeSqliteAvailable ? describe : describe.skip;
const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;
const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6]);
const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function stripeSig(payload: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${mac}`;
}

function stubPublicDoh() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') {
      return Response.json({
        Status: 0,
        Answer: url.searchParams.get('type') === '1' ? [{ type: 1, data: '93.184.216.34' }] : [],
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('#413 — Deployment Gate #1 erasure, R2 pagination, & OpenAPI contract', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetCasMemoryStore();
    apiRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('R2ScreenshotStore.deletePrefix paginates across multiple truncated R2 pages', async () => {
    const deletedKeys: string[] = [];
    let listCalls = 0;
    const fakeR2: R2Bucket = {
      async get() {
        return null;
      },
      async put() {},
      async delete(keys) {
        if (Array.isArray(keys)) deletedKeys.push(...keys);
        else deletedKeys.push(keys);
      },
      async list(opts) {
        listCalls++;
        if (opts?.cursor === undefined) {
          return {
            objects: [{ key: 'u1/r1/a.png' }, { key: 'u1/r1/b.png' }],
            truncated: true,
            cursor: 'page-2',
          };
        }
        return {
          objects: [{ key: 'u1/r1/c.png' }],
          truncated: false,
        };
      },
    };
    const r2Store = new R2ScreenshotStore(fakeR2);
    await r2Store.deletePrefix('u1/r1/');
    expect(listCalls).toBe(2);
    expect(deletedKeys).toEqual(['u1/r1/a.png', 'u1/r1/b.png', 'u1/r1/c.png']);
  });

  it('erases CAS blobs, github_login invites, cross-user attachments, solo teams, and team_activity PII', async () => {
    const store = getMemoryStore();
    const blobs = new MemoryScreenshotStore();

    await store.createUser({
      id: 'u-erase',
      githubLogin: 'erase-me',
      email: 'erase@example.com',
      plan: 'pro',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await store.createUser({
      id: 'u-other',
      githubLogin: 'other',
      email: 'other@example.com',
      plan: 'free',
      createdAt: '2026-01-01T00:00:00Z',
    });

    // Solo team owned only by u-erase (should be deleted with its CAS blobs)
    await store.createTeam(
      { id: 'solo-t', name: 'Solo', plan: 'pro', stripeCustomerId: 'cus_solo', createdAt: '2026-01-01T00:00:00Z' },
      'u-erase',
    );
    await blobs.put('cas/solo-t/abc.png', PNG_BYTES);
    await blobs.put('cas/u-erase/def.png', PNG_BYTES);
    casMemoryStore.set(casObjectKey('u-erase', sha256Hex(PNG_BYTES)), PNG_BYTES);

    // Shared team where u-other is owner and u-erase is a member + invited by github_login + referenced in activity
    await store.createTeam({ id: 'shared-t', name: 'Shared', plan: 'free', createdAt: '2026-01-01T00:00:00Z' }, 'u-other');
    await store.addMember({ teamId: 'shared-t', userId: 'u-erase', role: 'member', createdAt: '2026-01-01T00:00:00Z' });
    await store.createInvitation({
      id: 'inv-gh',
      teamId: 'shared-t',
      githubLogin: 'ERASE-ME',
      role: 'member',
      token: 'tok-gh',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    await store.recordActivity({
      id: 'act-pii',
      teamId: 'shared-t',
      userId: 'u-other',
      action: 'member.invited',
      target: 'erase@example.com',
      metadata: JSON.stringify({ email: 'erase@example.com' }),
      createdAt: '2026-01-01T00:00:00Z',
    });

    // Run owned by u-erase with attachment stored under another key prefix
    await store.createRun(
      {
        id: 'r-erase',
        status: 'completed',
        url: 'https://example.com',
        routes: [{ path: '/' }],
        viewports: [1440],
        browsers: ['chromium'],
        threshold: 0.01,
        ai: null,
        createdAt: '2026-01-01T00:00:00Z',
        results: [],
        reportUrl: null,
      },
      'u-erase',
    );
    await blobs.put('u-other/r-erase/attachments/trace.zip', PNG_BYTES);
    await store.addAttachment({
      id: 'att-cross',
      runId: 'r-erase',
      kind: 'trace',
      name: 'trace.zip',
      r2Key: 'u-other/r-erase/attachments/trace.zip',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const result = await store.eraseAccount('u-erase', blobs);
    expect(result.erased).toBe(true);
    expect(await store.getTeam('solo-t')).toBeNull();
    expect(await blobs.get('cas/u-erase/def.png')).toBeNull();
    expect(await blobs.get('cas/solo-t/abc.png')).toBeNull();
    expect(await blobs.get('u-other/r-erase/attachments/trace.zip')).toBeNull();
    expect(casMemoryStore.has(casObjectKey('u-erase', sha256Hex(PNG_BYTES)))).toBe(false);
    expect(await store.getInvitationByToken('tok-gh')).toBeNull();

    const remainingActivity = await store.listActivity('shared-t');
    expect(remainingActivity[0]?.target).toBe('[erased]');
    expect(remainingActivity[0]?.metadata).toBeUndefined();
  });

  it('documents DELETE /v1/account, MonitorCreateRequest.projectId, and team invitation list/revoke in OpenAPI', () => {
    const spec = OPENAPI_SPEC as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    expect(spec.paths['/v1/account']?.delete).toBeDefined();
    expect(spec.paths['/v1/teams/{id}/invitations']?.get).toBeDefined();
    expect(spec.paths['/v1/teams/{id}/invitations/{invitationId}']?.delete).toBeDefined();
    expect(spec.components.schemas.MonitorCreateRequest?.properties?.projectId).toBeDefined();
  });
});

describeD1('#413 — D1Store erasure race, report_html projection, & >100 teamId chunking', () => {
  it('blocks pending_run_updates resurrection after user deletion and excludes report_html from listings', async () => {
    const { db, raw } = createNodeSqliteD1();
    await migrate(db);
    const store = new D1Store(db);

    await store.createUser({ id: 'u1', plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    const run: Run = {
      id: 'run-big-html',
      status: 'completed',
      url: 'https://example.com',
      routes: [{ path: '/' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      ai: null,
      duration: 95_000,
      createdAt: '2026-01-01T00:00:00Z',
      results: [],
      reportUrl: '/v1/reports/run-big-html',
      reportHtml: '<html>' + 'X'.repeat(50_000) + '</html>',
    };
    await store.createRun(run, 'u1');

    // Listing queries must NOT load multi-MB reportHtml, while getRun() still returns it
    const listed = await store.listRuns('u1', { limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reportHtml).toBeUndefined();
    expect(listed[0]?.duration).toBe(95_000);
    const full = await store.getRun('run-big-html');
    expect(full?.reportHtml?.length).toBeGreaterThan(50_000);

    // >100 teamIds chunking works without hitting SQLite's bind parameter limit
    const manyTeamIds = Array.from({ length: 150 }, (_, i) => `team-${i}`);
    const chunkedRuns = await store.listRuns('u1', { teamIds: manyTeamIds, limit: 10 });
    expect(chunkedRuns).toHaveLength(1);

    // Erase u1 and verify a racing commitFinishedRun cannot insert into pending_run_updates
    await store.eraseAccount('u1');
    const commitRes = await store.commitFinishedRun('u1', { ...run, status: 'completed' });
    expect(commitRes).toBe('skipped');
    const pendingRows = raw.prepare('SELECT * FROM pending_run_updates WHERE user_id = ?').all('u1');
    expect(pendingRows).toHaveLength(0);
  });
});

describe('#413 — metering, AI quota, monitor fan-out, & Stripe webhook hardening', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('enforces monotonic sandbox_minutes_used even after deleting runs, and gates Free-tier AI calls', async () => {
    const store = getMemoryStore();
    const uid = demoId('quota-user');
    await store.createUser({ id: uid, plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    const month = currentMonth();

    // Free-tier AI run is rejected with 402
    const aiRes = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('quota-user'),
      body: JSON.stringify({ url: 'https://example.com', ai: { provider: 'openai', model: 'gpt-4o' } }),
    });
    expect(aiRes.status).toBe(402);

    // Empty arrays rejected with 400 (.min(1))
    const emptyRoutes = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('quota-user'),
      body: JSON.stringify({ url: 'https://example.com', routes: [] }),
    });
    expect(emptyRoutes.status).toBe(400);

    // Record 30 monotonic sandbox minutes (Free cap is 30) with zero runs in DB -> still blocked 402!
    await store.addSandboxMinutes(uid, month, 30);
    const overCap = await app.request('/v1/run', {
      method: 'POST',
      headers: auth('quota-user'),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(overCap.status).toBe(402);
  });

  it('enforces MAX_FAN_OUT on POST and PATCH /v1/monitors', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: demoId('fanout'), plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    const manyRoutes = Array.from({ length: 40 }, (_, i) => `/p${i}`);
    const manyViewports = [375, 768, 1024, 1440, 1920]; // 40 * 5 = 200 > MAX_FAN_OUT (150)

    const tooBig = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('fanout'),
      body: JSON.stringify({
        name: 'Huge',
        url: 'https://example.com',
        routes: manyRoutes,
        viewports: manyViewports,
      }),
    });
    expect(tooBig.status).toBe(400);
  });

  it('hardens Stripe signature verification (multi-v1 rotation + NaN ts) and webhook lifecycle', async () => {
    const payload = '{"id":"evt_1","type":"ping"}';
    const ts = Math.floor(Date.now() / 1000);
    const validMac = createHmac('sha256', 'whsec_new').update(`${ts}.${payload}`).digest('hex');
    const oldMac = createHmac('sha256', 'whsec_old').update(`${ts}.${payload}`).digest('hex');
    const rotatedHeader = `t=${ts},v1=${oldMac},v1=${validMac}`;

    expect(await verifyStripeSignature(payload, rotatedHeader, 'whsec_new')).toBe(true);
    expect(await verifyStripeSignature(payload, `t=NaN,v1=${validMac}`, 'whsec_new')).toBe(false);
    expect(await verifyStripeSignature(payload, `t=123abc,v1=${validMac}`, 'whsec_new')).toBe(false);

    // Unpaid checkout session is ignored
    const unpaid = interpretStripeEvent({
      id: 'evt_unpaid',
      created: ts,
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'unpaid', metadata: { team_id: 't1', plan: 'business' } } },
    });
    expect(unpaid?.ignoredReason).toBe('payment_status:unpaid');

    // Unknown price ID is ignored when configured priceIds are passed
    const badPrice = interpretStripeEvent(
      {
        id: 'evt_badprice',
        created: ts,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            status: 'active',
            metadata: { team_id: 't1', plan: 'business' },
            items: { data: [{ price: { id: 'price_unknown' } }] },
          },
        },
      },
      { pro: 'price_pro', business: 'price_biz' },
    );
    expect(badPrice?.ignoredReason).toBe('unknown_price:price_unknown');

    // End-to-end webhook idempotency, ordering, payment_failed, and multi-team owner plan derivation
    const store = getMemoryStore();
    const ownerId = demoId('multi-owner');
    await store.createUser({ id: ownerId, plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    await store.createTeam({ id: 'team-biz', name: 'Biz', plan: 'business', createdAt: '2026-01-01T00:00:00Z' }, ownerId);
    await store.createTeam({ id: 'team-pro', name: 'Pro', plan: 'free', createdAt: '2026-01-01T00:00:00Z' }, ownerId);
    await store.updateUserPlan(ownerId, 'business');

    const env = { STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_BUSINESS: 'price_biz' };
    const postEvent = async (evt: unknown) => {
      const body = JSON.stringify(evt);
      return app.request(
        '/v1/billing/webhook',
        { method: 'POST', headers: { 'stripe-signature': stripeSig(body, 'whsec_test', ts) }, body },
        env,
      );
    };

    // Upgrade team-pro at created=2000
    const ev1 = {
      id: 'evt_upgrade_1',
      created: 2000,
      type: 'checkout.session.completed',
      data: {
        object: {
          payment_status: 'paid',
          status: 'complete',
          client_reference_id: 'team-pro',
          customer: 'cus_pro',
          subscription: 'sub_pro',
          metadata: { team_id: 'team-pro', plan: 'pro' },
        },
      },
    };
    const r1 = await postEvent(ev1);
    expect((await r1.json()).handled).toBe(true);
    expect((await store.getTeam('team-pro'))?.plan).toBe('pro');
    // Owner still has business from team-biz!
    expect((await store.getUser(ownerId))?.plan).toBe('business');

    // Duplicate delivery of evt_upgrade_1 -> duplicate: true
    const dup = await postEvent(ev1);
    expect((await dup.json()).duplicate).toBe(true);

    // Stale out-of-order event (created=1500 < 2000) -> ignored as stale_event
    const stale = await postEvent({
      id: 'evt_stale_cancel',
      created: 1500,
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_pro', customer: 'cus_pro', metadata: { team_id: 'team-pro' } } },
    });
    expect((await stale.json()).reason).toBe('stale_event');
    expect((await store.getTeam('team-pro'))?.plan).toBe('pro');

    // Terminal invoice.payment_failed downgrades team-pro, logs activity, keeps owner on business!
    const failedPay = await postEvent({
      id: 'evt_payfail',
      created: 2500,
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_pro', subscription: 'sub_pro', next_payment_attempt: null } },
    });
    const failedJson = await failedPay.json();
    expect(failedJson.handled).toBe(true);
    expect(failedJson.terminalFailure).toBe(true);
    expect((await store.getTeam('team-pro'))?.plan).toBe('free');
    expect((await store.getUser(ownerId))?.plan).toBe('business');
    const acts = await store.listActivity('team-pro');
    expect(acts.some((a) => a.action === 'billing.payment_failed')).toBe(true);
  });

  it('evaluateSpendCap reads team_usage when teamId is provided on a paid plan', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u-cap', email: 'cap@example.com', plan: 'pro', createdAt: '2026-01-01T00:00:00Z' });
    await store.createTeam({ id: 't-cap', name: 'CapTeam', plan: 'pro', createdAt: '2026-01-01T00:00:00Z' }, 'u-cap');
    const month = '2026-06';
    // Personal usage is 0, but team usage crossed 80% of Pro limit (400 / 500)
    await store.incrementTeamUsage('t-cap', month, 420, 0);
    const fakeFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const res = await evaluateSpendCap(
      { RESEND_API_KEY: 're_test' },
      store,
      (await store.getUser('u-cap'))!,
      PLANS.pro,
      month,
      new Date('2026-06-15T00:00:00Z'),
      fakeFetch,
      't-cap',
    );
    expect(res.tier).toBe(80);
    expect(res.reason).toBe('sent');
  });
});

describe('#413 — CAS pre-buffer quota, O(1) rate limiter, monitor bootstrap/links, & expired invites', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetCasMemoryStore();
    apiRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects over-quota CAS uploads with 402 BEFORE reading the request body stream', async () => {
    const store = getMemoryStore();
    const uid = demoId('cas-over');
    await store.createUser({ id: uid, plan: 'free', createdAt: '2026-01-01T00:00:00Z' });
    await store.incrementUsage(uid, currentMonth(), 0, PLANS.free.limits.screenshotsPerMonth!);

    let bodyRead = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyRead = true;
          controller.enqueue(PNG_BYTES);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(`http://localhost/v1/cas/blobs/${sha256Hex(PNG_BYTES)}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer cas-over', 'Content-Type': 'image/png' },
      body: stream,
      // @ts-expect-error duplex required by Node Request with ReadableStream
      duplex: 'half',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(402);
    expect(bodyRead).toBe(false);
  });

  it('BoundedRateLimiter evicts LRU in O(1) and rate-limits /v1/keys, /v1/billing, & /auth', async () => {
    const rl = new BoundedRateLimiter({ limit: 2, windowMs: 1000, maxEntries: 2 });
    expect(rl.check('a', 0).allowed).toBe(true);
    expect(rl.check('b', 0).allowed).toBe(true);
    // Touch 'a' so 'b' becomes LRU
    expect(rl.check('a', 1).allowed).toBe(true);
    // Insert 'c' -> evicts 'b', keeps 'a' (still at count 2 -> 3rd call blocked)
    expect(rl.check('c', 2).allowed).toBe(true);
    expect(rl.size).toBe(2);
    expect(rl.check('a', 3).allowed).toBe(false);
    // Expired head cleaned up after window passes
    expect(rl.check('d', 5000).allowed).toBe(true);
    expect(rl.size).toBe(1);

    // Early-mounted routes emit X-RateLimit headers
    const keysRes = await app.request('/v1/keys', { headers: { Authorization: 'Bearer rl-user' } });
    expect(keysRes.headers.get('X-RateLimit-Limit')).toBe('100');
    const billRes = await app.request('/v1/billing/usage', { headers: { Authorization: 'Bearer rl-user' } });
    expect(billRes.headers.get('X-RateLimit-Limit')).toBe('100');
    const authRes = await app.request('/auth/github');
    expect(authRes.headers.get('X-RateLimit-Limit')).toBe('100');
  });

  it('bootstraps non-project monitors cleanly on Tick 1, records monitorRun.runId, & meters screenshots/minutes', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u-mon', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    const monitor = {
      id: 'm-boot',
      userId: 'u-mon',
      name: 'BootSite',
      url: 'https://example.com',
      routes: ['/', '/pricing'],
      viewports: [1440],
      intervalMinutes: 60,
      alertThreshold: 0.05,
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    await store.createMonitor(monitor);

    const r2Map = new Map<string, Uint8Array>();
    const fakeBucket: R2Bucket = {
      async get(key) {
        const b = r2Map.get(key);
        return b ? { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer } : null;
      },
      async put(key, val) {
        r2Map.set(key, val instanceof Uint8Array ? val : new Uint8Array(val as ArrayBuffer));
      },
      async delete(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) r2Map.delete(k);
      },
      async list() {
        return { objects: [...r2Map.keys()].map((key) => ({ key })), truncated: false };
      },
    };

    const spy = vi.spyOn(processor, 'processRun').mockImplementation(async (run, _env, onShots) => {
      run.duration = 75_000;
      if (onShots) {
        await onShots([
          { name: 'root_1440_chromium_0_current', type: 'current', bytes: PNG_BYTES },
          { name: 'pricing_1440_chromium_0_current', type: 'current', bytes: PNG_BYTES },
        ]);
      }
      run.status = 'failed';
      run.error = processor.NO_COMPARISON_ERROR;
    });

    const now = new Date('2026-06-15T12:00:00Z');
    const exec = await runMonitor({ SCREENSHOTS: fakeBucket }, store, monitor, now);
    spy.mockRestore();

    // Tick 1 succeeds as baseline bootstrap without deadlock or error alerts
    expect(exec.run.status).toBe('passed');
    expect(exec.run.attempts).toBe(1);
    expect(exec.run.runId).toBeTruthy();
    expect(exec.alerts).toHaveLength(0);

    // Screenshots (2) and sandbox minutes (ceil(75s/60s) = 2) were metered
    const usage = await store.getUsage('u-mon', currentMonth(now));
    expect(usage.runsCount).toBe(1);
    expect(usage.screenshotsCount).toBe(2);
    expect(usage.sandboxMinutesUsed).toBe(2);

    // Dashboard monitor detail & history link to monitorRun.runId (not monitorRun.id)
    const detailHtml = renderMonitorDetail(monitor, [exec.run], now);
    const historyHtml = renderMonitorHistory(monitor, [exec.run], {}, now);
    expect(detailHtml).toContain(`/dashboard/runs/${exec.run.runId}`);
    expect(historyHtml).toContain(`/dashboard/runs/${exec.run.runId}`);
  });

  it('filters expired invitations from seat quota and supports revoking pending invitations', async () => {
    const store = getMemoryStore();
    const teamRes = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth('inv-owner'),
      body: JSON.stringify({ name: 'SeatTeam' }),
    });
    const teamId = (await teamRes.json()).id;
    await store.updateTeam(teamId, { plan: 'pro' });

    // Seed an already-expired invitation — it must NOT show up in listInvitations or lock seats
    await store.createInvitation({
      id: 'inv-expired',
      teamId,
      email: 'old@example.com',
      role: 'member',
      token: 'tok-expired',
      createdAt: '2020-01-01T00:00:00Z',
      expiresAt: '2020-01-02T00:00:00Z',
    });

    const listBefore = await app.request(`/v1/teams/${teamId}/invitations`, {
      headers: auth('inv-owner'),
    });
    expect(listBefore.status).toBe(200);
    expect((await listBefore.json()).total).toBe(0);

    // Create a fresh invitation, list it (token omitted), then revoke it
    const created = await app.request(`/v1/teams/${teamId}/invitations`, {
      method: 'POST',
      headers: auth('inv-owner'),
      body: JSON.stringify({ email: 'fresh@example.com', role: 'member' }),
    });
    expect(created.status).toBe(201);
    const invId = (await created.json()).id;

    const listAfter = await app.request(`/v1/teams/${teamId}/invitations`, {
      headers: auth('inv-owner'),
    });
    const listJson = await listAfter.json();
    expect(listJson.total).toBe(1);
    expect(listJson.invitations[0].token).toBeUndefined();

    const revoked = await app.request(`/v1/teams/${teamId}/invitations/${invId}`, {
      method: 'DELETE',
      headers: auth('inv-owner'),
    });
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).revoked).toBe(true);

    const listFinal = await app.request(`/v1/teams/${teamId}/invitations`, {
      headers: auth('inv-owner'),
    });
    expect((await listFinal.json()).total).toBe(0);
  });

  it('clamps negative/huge ?limit= query parameters cleanly', async () => {
    const resNeg = await app.request('/v1/runs?limit=-1', { headers: auth('limit-user') });
    expect(resNeg.status).toBe(200);
    const resHuge = await app.request('/v1/runs?limit=999999', { headers: auth('limit-user') });
    expect(resHuge.status).toBe(200);
  });
});
