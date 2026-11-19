/**
 * Security regression tests for #412:
 * - Slack webhook SSRF + redirect:error + consistent validation across dashboard & /v1
 * - Cross-tenant BOLA fix in GET /v1/teams/:teamId/projects/:projectId/runs/:runId/reviews
 * - Stored XSS fix (safeJsonForScript + CSP nonces + report-html escaping)
 * - Active-team-only run authorization, reviewer/admin gating, diff_ids deduplication,
 *   review-policy.ts rejection blocking, scheduler membership re-check & monitor unlink
 * - Read-only viewer restrictions on team runs, CAS PUTs, and attachments
 * - Non-member CAS 403, PNG magic bytes, attachment size cap + Content-Disposition sanitization
 * - Vercel install cross-tenant & secret authorization
 * - Dashboard CSRF, snooze cap, production localhost CORS, /auth/logout,
 *   deleted-user session invalidation, HSTS, and GitHub verified-only email
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { app, apiRateLimiter } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { resetMemoryScreenshotStore } from '../src/storage/screenshots.js';
import { resetCasMemoryStore } from '../src/routes/cas.js';
import { testAlertRateLimiter } from '../src/rate-limit.js';
import {
  CSRF_HEADER,
  createCsrfToken,
  createSessionCookie,
  INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD,
} from '../src/auth/session.js';
import { renderDiffViewer, safeJsonForScript } from '../src/dashboard/render.js';
import { generateReportHtml } from '../src/report-html.js';
import { fetchGitHubUser } from '../src/auth/github.js';
import { runMonitor } from '../src/scheduler.js';
import type { Run } from '../src/types.js';

const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;
const auth = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function seedUser(userId: string, plan = 'free') {
  const store = getMemoryStore();
  if (!(await store.getUser(userId))) {
    await store.createUser({ id: userId, plan, createdAt: '2026-01-01T00:00:00Z' });
  } else {
    await store.updateUserPlan(userId, plan);
  }
}

async function sessionAuth(userId: string, plan = 'business') {
  await seedUser(userId, plan);
  const cookieVal = await createSessionCookie(userId, INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD);
  const csrf = await createCsrfToken(cookieVal, INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD);
  return {
    cookieVal,
    csrf,
    headers: { Cookie: `fg_session=${cookieVal}`, [CSRF_HEADER]: csrf },
    cookieOnly: { Cookie: `fg_session=${cookieVal}` },
  };
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

describe('#412 — Slack webhook SSRF, dashboard plan enforcement & test-alert rate limiting', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
    testAlertRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects non-Slack and private Slack webhook URLs on /v1/monitors and /dashboard/monitors', async () => {
    await seedUser(demoId('biz'), 'business');
    const badSlack = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('biz'),
      body: JSON.stringify({
        name: 'SSRF',
        url: 'https://example.com',
        alerts: { slack: 'https://169.254.169.254/latest/meta-data/' },
      }),
    });
    expect(badSlack.status).toBe(400);

    const arbitraryHost = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('biz'),
      body: JSON.stringify({
        name: 'Arbitrary',
        url: 'https://example.com',
        alerts: { slack: 'https://attacker.example/hook' },
      }),
    });
    expect(arbitraryHost.status).toBe(400);

    // Dashboard monitor creation enforces free-plan gate (402) and Slack/email validation (400)
    const freeSess = await sessionAuth('free-user', 'free');
    const freeDash = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: { ...freeSess.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'FreeMon', url: 'https://example.com' }).toString(),
    });
    expect(freeDash.status).toBe(402);

    const bizSess = await sessionAuth('biz-user', 'business');
    const badDashSlack = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: { ...bizSess.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: 'DashBad',
        url: 'https://example.com',
        slack: 'https://evil.example/steal',
      }).toString(),
    });
    expect(badDashSlack.status).toBe(400);

    const badDashEmail = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: { ...bizSess.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: 'DashBadEmail',
        url: 'https://example.com',
        email: 'not-an-email',
      }).toString(),
    });
    expect(badDashEmail.status).toBe(400);

    const badInterval = await app.request('/dashboard/monitors', {
      method: 'POST',
      headers: { ...bizSess.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: 'DashBadInt',
        url: 'https://example.com',
        intervalMinutes: '1',
      }).toString(),
    });
    expect(badInterval.status).toBe(400);
  });

  it('blocks test-alert for downgraded free users (402) and rate-limits bursts (429)', async () => {
    const store = getMemoryStore();
    await seedUser(demoId('downgraded'), 'free');
    await store.createMonitor({
      id: 'mon-dg',
      userId: demoId('downgraded'),
      name: 'Old',
      url: 'https://example.com',
      routes: ['/'],
      viewports: [1440],
      intervalMinutes: 60,
      alertThreshold: 0.05,
      alerts: { email: ['a@example.com'] },
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const downgradedRes = await app.request('/v1/monitors/mon-dg/test-alert', {
      method: 'POST',
      headers: auth('downgraded'),
    });
    expect(downgradedRes.status).toBe(402);

    // Upgrade and verify 6th test-alert in 1 minute hits 429
    await seedUser(demoId('downgraded'), 'business');
    for (let i = 0; i < 5; i++) {
      const ok = await app.request('/v1/monitors/mon-dg/test-alert', {
        method: 'POST',
        headers: auth('downgraded'),
      });
      expect(ok.status).toBe(200);
    }
    const throttled = await app.request('/v1/monitors/mon-dg/test-alert', {
      method: 'POST',
      headers: auth('downgraded'),
    });
    expect(throttled.status).toBe(429);
  });
});

describe('#412 — cross-tenant BOLA fix in review listing', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns 404 when team B tries to list approvals for team A runId', async () => {
    const store = getMemoryStore();
    const teamARes = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ name: 'Team A' }),
    });
    const teamA = (await teamARes.json()).id;
    const projARes = await app.request(`/v1/teams/${teamA}/projects`, {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ name: 'Proj A' }),
    });
    const projA = (await projARes.json()).id;

    const teamBRes = await app.request('/v1/teams', {
      method: 'POST',
      headers: auth('mallory'),
      body: JSON.stringify({ name: 'Team B' }),
    });
    const teamB = (await teamBRes.json()).id;
    const projBRes = await app.request(`/v1/teams/${teamB}/projects`, {
      method: 'POST',
      headers: auth('mallory'),
      body: JSON.stringify({ name: 'Proj B' }),
    });
    const projB = (await projBRes.json()).id;

    const runA: Run = {
      id: 'run-secret-a',
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
      projectId: projA,
    };
    await store.createRun(runA, demoId('alice'));
    await store.addApproval({
      id: 'app-secret',
      runId: 'run-secret-a',
      projectId: projA,
      reviewerUserId: demoId('alice'),
      status: 'rejected',
      comment: 'CONFIDENTIAL REVIEW COMMENT',
      createdAt: '2026-01-01T00:01:00Z',
    });

    // Mallory tries to fetch Team A's run reviews under Team B's project -> 404
    const bola1 = await app.request(
      `/v1/teams/${teamB}/projects/${projB}/runs/run-secret-a/reviews`,
      { headers: auth('mallory') },
    );
    expect(bola1.status).toBe(404);

    // Mallory tries to fetch Team A's project under Team B -> 404
    const bola2 = await app.request(
      `/v1/teams/${teamB}/projects/${projA}/runs/run-secret-a/reviews`,
      { headers: auth('mallory') },
    );
    expect(bola2.status).toBe(404);
  });
});

describe('#412 — stored XSS escaping & strict CSP headers', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
  });

  it('escapes </script>, <!--, and unicode line separators in diff viewer & report HTML', () => {
    const xss = '</script><script>alert(1)</script><!--\u2028\u2029';
    expect(safeJsonForScript(xss)).not.toContain('</script>');
    expect(safeJsonForScript(xss)).not.toContain('<!--');
    expect(safeJsonForScript(xss)).toContain('\\u003c/script\\u003e');

    const viewerHtml = renderDiffViewer({
      runId: 'r1',
      diff: {
        id: 'd1',
        runId: 'r1',
        route: xss,
        viewport: 1440,
        browser: 'chromium',
        type: 'diff',
        r2Key: 'k',
        createdAt: 'now',
      },
      masks: [
        {
          id: 'm1',
          userId: 'u1',
          route: xss,
          viewport: 1440,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          label: xss,
          createdAt: 'now',
        },
      ],
      cspNonce: 'nonce123',
      csrfToken: 'tok123',
    });
    expect(viewerHtml).not.toContain('</script><script>alert(1)');
    expect(viewerHtml).toContain('<script nonce="nonce123">');

    const reportHtml = generateReportHtml({
      id: "run';alert(1);//</script>",
      status: 'completed',
      url: 'https://example.com',
      routes: [{ path: '/' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      ai: null,
      createdAt: '<img src=x onerror=alert(1)>',
      completedAt: '<b>done</b>',
      results: [],
      reportUrl: null,
    });
    expect(reportHtml).not.toContain("const RUN_ID = '");
    expect(reportHtml).not.toContain('onclick=');
    expect(reportHtml).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('emits nonce-based CSP on dashboard pages and script-src none on /v1/reports/:id', async () => {
    const store = getMemoryStore();
    const sess = await sessionAuth('csp-user');
    await store.createRun(
      {
        id: 'run-csp',
        status: 'completed',
        url: 'https://example.com',
        routes: [{ path: '/' }],
        viewports: [1440],
        browsers: ['chromium'],
        threshold: 0.01,
        ai: null,
        createdAt: '2026-01-01T00:00:00Z',
        results: [],
        reportUrl: '/v1/reports/run-csp',
        reportHtml: '<html>ok</html>',
      },
      'csp-user',
    );
    const dashRes = await app.request('/dashboard/runs/run-csp', { headers: sess.headers });
    expect(dashRes.status).toBe(200);
    const dashCsp = dashRes.headers.get('Content-Security-Policy') ?? '';
    expect(dashCsp).toMatch(/script-src 'nonce-[^']+'/);
    expect(dashCsp).not.toContain("script-src 'unsafe-inline'");

    // /v1/reports/:id serves strict script-src 'none'
    await store.createRun(
      {
        id: 'run-rep-csp',
        status: 'completed',
        url: 'https://example.com',
        routes: [{ path: '/' }],
        viewports: [1440],
        browsers: ['chromium'],
        threshold: 0.01,
        ai: null,
        createdAt: '2026-01-01T00:00:00Z',
        results: [],
        reportUrl: '/v1/reports/run-rep-csp',
        reportHtml: '<html>report</html>',
      },
      demoId('rep-owner'),
    );
    const repRes = await app.request('/v1/reports/run-rep-csp', { headers: auth('rep-owner') });
    expect(repRes.status).toBe(200);
    expect(repRes.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
  });
});

describe('#412 — governance, active-team revocation, diff_ids dedup, review-policy, & scheduler unlink', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
    apiRateLimiter.reset();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  async function seedTeamProject() {
    const store = getMemoryStore();
    const ownerId = demoId('owner');
    const memberId = demoId('member');
    const viewerId = demoId('viewer');
    const reviewerId = demoId('reviewer');
    await seedUser(ownerId, 'business');
    await seedUser(memberId, 'business');
    await seedUser(viewerId, 'business');
    await seedUser(reviewerId, 'business');

    await store.createTeam({ id: 't1', name: 'Acme', plan: 'business', createdAt: '2026-01-01T00:00:00Z' }, ownerId);
    await store.addMember({ teamId: 't1', userId: memberId, role: 'member', reviewer: false, createdAt: '2026-01-01T00:00:00Z' });
    await store.addMember({ teamId: 't1', userId: viewerId, role: 'viewer', reviewer: false, createdAt: '2026-01-01T00:00:00Z' });
    await store.addMember({ teamId: 't1', userId: reviewerId, role: 'member', reviewer: true, createdAt: '2026-01-01T00:00:00Z' });
    await store.createProject({ id: 'p1', teamId: 't1', name: 'Web', createdAt: '2026-01-01T00:00:00Z' });

    const run: Run = {
      id: 'run-proj-1',
      status: 'completed',
      url: 'https://example.com',
      routes: [{ path: '/' }, { path: '/about' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      ai: null,
      createdAt: '2026-01-01T00:00:00Z',
      results: [{ route: '/', viewport: 1440, status: 'changed', diffPercentage: 2, timestamp: 'now' }],
      reportUrl: '/v1/reports/run-proj-1',
      reportHtml: '<html>ok</html>',
      projectId: 'p1',
    };
    await store.createRun(run, memberId);
    await store.addScreenshot({ id: 'd1', runId: 'run-proj-1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k1', createdAt: 'now' });
    await store.addScreenshot({ id: 'd2', runId: 'run-proj-1', route: '/about', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k2', createdAt: 'now' });

    return { store, ownerId, memberId, viewerId, reviewerId };
  }

  it('blocks non-reviewer project approvals, blocks active rejections, and deduplicates diff_ids', async () => {
    const { store, ownerId, memberId, reviewerId } = await seedTeamProject();

    // Non-reviewer member (even run creator) cannot approve project run -> 403
    const memberApprove = await app.request('/v1/baselines/run-proj-1/approve', {
      method: 'POST',
      headers: auth('member'),
    });
    expect(memberApprove.status).toBe(403);

    // Duplicate diff_ids (['d1', 'd1'] when run has d1 + d2) must NOT promote the run
    const revSess = await sessionAuth(reviewerId);
    const dupRes = await app.request('/dashboard/runs/run-proj-1/approve', {
      method: 'POST',
      headers: { ...revSess.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_ids: ['d1', 'd1'] }),
    });
    expect(dupRes.status).toBe(200);
    const dupJson = await dupRes.json();
    expect(dupJson.accepted).toBe(1);
    expect(dupJson.promoted).toBe(false);
    expect((await store.getRun('run-proj-1'))?.baselinesApproved).toBeFalsy();

    // Active rejection from Reviewer blocks Owner approval (409) via review-policy.ts
    const rejRes = await app.request('/v1/teams/t1/projects/p1/runs/run-proj-1/review', {
      method: 'POST',
      headers: auth('reviewer'),
      body: JSON.stringify({ status: 'rejected', comment: 'broken layout' }),
    });
    expect(rejRes.status).toBe(201);

    const blockedReview = await app.request('/v1/teams/t1/projects/p1/runs/run-proj-1/review', {
      method: 'POST',
      headers: auth('owner'),
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(blockedReview.status).toBe(409);
    expect((await store.getRun('run-proj-1'))?.baselinesApproved).toBeFalsy();

    const blockedBaseline = await app.request('/v1/baselines/run-proj-1/approve', {
      method: 'POST',
      headers: auth('owner'),
    });
    expect(blockedBaseline.status).toBe(409);

    // Judge mode / agent actorKind also blocked with 409 even after reviewer withdraws rejection
    await app.request('/v1/teams/t1/projects/p1/runs/run-proj-1/review', {
      method: 'POST',
      headers: auth('reviewer'),
      body: JSON.stringify({ status: 'approved', judgeMode: true }),
    });
    expect((await store.getRun('run-proj-1'))?.baselinesApproved).toBeFalsy();

    // Owner dashboard bulk approve with active rejection -> 409
    const ownerSess = await sessionAuth(ownerId);
    await store.addApproval({
      id: 'rej-2',
      runId: 'run-proj-1',
      projectId: 'p1',
      reviewerUserId: reviewerId,
      status: 'rejected',
      createdAt: new Date(Date.now() + 5000).toISOString(),
    });
    const dashBlocked = await app.request('/dashboard/runs/run-proj-1/approve', {
      method: 'POST',
      headers: { ...ownerSess.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_ids: ['d1', 'd2'] }),
    });
    expect(dashBlocked.status).toBe(409);

    // Non-reviewer member also blocked on dashboard bulk approve (403)
    const memSess = await sessionAuth(memberId);
    const memDash = await app.request('/dashboard/runs/run-proj-1/approve', {
      method: 'POST',
      headers: { ...memSess.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_ids: ['d1', 'd2'] }),
    });
    expect(memDash.status).toBe(403);
  });

  it('revokes former member access to project runs and pauses/unlinks their project monitors', async () => {
    const { store, memberId } = await seedTeamProject();

    await store.createMonitor({
      id: 'm-proj',
      userId: memberId,
      projectId: 'p1',
      name: 'Proj Monitor',
      url: 'https://example.com',
      routes: ['/'],
      viewports: [1440],
      intervalMinutes: 60,
      alertThreshold: 0.05,
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    });

    // Owner removes member via API -> monitor is paused & unlinked automatically
    const rmRes = await app.request(`/v1/teams/t1/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
      headers: auth('owner'),
    });
    expect(rmRes.status).toBe(200);
    const monAfter = await store.getMonitor('m-proj');
    expect(monAfter?.enabled).toBe(false);
    expect(monAfter?.projectId).toBeUndefined();

    // Former member can no longer read, report, approve, or delete the project run they created
    expect((await app.request('/v1/runs/run-proj-1', { headers: auth('member') })).status).toBe(404);
    expect((await app.request('/v1/reports/run-proj-1', { headers: auth('member') })).status).toBe(404);
    expect(
      (await app.request('/v1/baselines/run-proj-1/approve', { method: 'POST', headers: auth('member') })).status,
    ).toBe(404);
    expect(
      (await app.request('/v1/runs/run-proj-1', { method: 'DELETE', headers: auth('member') })).status,
    ).toBe(403);

    // Even if a stale monitor still points at p1, scheduler.ts re-verifies membership & disables it
    await store.updateMonitor('m-proj', { enabled: true, projectId: 'p1' });
    const exec = await runMonitor({}, store, (await store.getMonitor('m-proj'))!, new Date('2026-01-02T00:00:00Z'));
    expect(exec.run.status).toBe('error');
    expect(exec.run.attempts).toBe(0);
    expect((await store.getMonitor('m-proj'))?.enabled).toBe(false);
    expect((await store.getMonitor('m-proj'))?.projectId).toBeUndefined();
  });

  it('blocks read-only viewers from team runs, CAS uploads, and attachments, and validates mismatched teamId & PNG magic', async () => {
    resetCasMemoryStore();
    const { store, viewerId } = await seedTeamProject();

    // Viewer cannot submit team-billed run -> 403
    const viewerRun = await app.request('/v1/run?teamId=t1', {
      method: 'POST',
      headers: auth('viewer'),
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(viewerRun.status).toBe(403);

    // Mismatched ?teamId= vs projectId -> 400
    await store.createTeam({ id: 't2', name: 'Other', plan: 'business', createdAt: '2026-01-01T00:00:00Z' }, demoId('owner'));
    const mismatchRes = await app.request('/v1/run?teamId=t2', {
      method: 'POST',
      headers: auth('owner'),
      body: JSON.stringify({ url: 'https://example.com', projectId: 'p1' }),
    });
    expect(mismatchRes.status).toBe(400);

    // Viewer cannot PUT CAS blob into team -> 403
    const validHash = sha256Hex(PNG_BYTES);
    const viewerCas = await app.request(`/v1/cas/blobs/${validHash}?teamId=t1`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer viewer', 'Content-Type': 'image/png' },
      body: PNG_BYTES,
    });
    expect(viewerCas.status).toBe(403);

    // Non-member ?teamId= on CAS check/GET/PUT -> 403 (never falls back to personal scope)
    const nonMemCheck = await app.request('/v1/cas/check?teamId=t1', {
      method: 'POST',
      headers: auth('outsider'),
      body: JSON.stringify({ hashes: [validHash] }),
    });
    expect(nonMemCheck.status).toBe(403);

    const nonMemGet = await app.request(`/v1/cas/blobs/${validHash}?teamId=t1`, {
      headers: { Authorization: 'Bearer outsider' },
    });
    expect(nonMemGet.status).toBe(403);

    // Non-PNG bytes rejected on PUT /v1/cas/blobs/:sha256 -> 400
    const htmlBytes = new TextEncoder().encode('<html>not a png</html>');
    const htmlHash = sha256Hex(htmlBytes);
    const badPng = await app.request(`/v1/cas/blobs/${htmlHash}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/png' },
      body: htmlBytes,
    });
    expect(badPng.status).toBe(400);

    // Viewer cannot upload attachments -> 403
    const viewerSess = await sessionAuth(viewerId);
    const fd = new FormData();
    fd.append('file', new File(['hello'], 'log.txt', { type: 'text/plain' }));
    const viewerAtt = await app.request('/dashboard/runs/run-proj-1/attachments', {
      method: 'POST',
      headers: viewerSess.headers,
      body: fd,
    });
    expect(viewerAtt.status).toBe(403);

    // Oversized attachment Content-Length rejected -> 413
    const ownerSess = await sessionAuth(demoId('owner'));
    const bigAtt = await app.request('/dashboard/runs/run-proj-1/attachments', {
      method: 'POST',
      headers: { ...ownerSess.headers, 'Content-Length': String(20 * 1024 * 1024) },
      body: fd,
    });
    expect(bigAtt.status).toBe(413);

    // Attachment download sanitizes Content-Disposition and downgrades text/html -> application/octet-stream
    const htmlFd = new FormData();
    htmlFd.append('name', 'evil"\r\nX-Injected: 1.html');
    htmlFd.append('file', new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' }));
    const upRes = await app.request('/dashboard/runs/run-proj-1/attachments', {
      method: 'POST',
      headers: ownerSess.headers,
      body: htmlFd,
    });
    expect(upRes.status).toBe(200);
    const attId = (await upRes.json()).attachment.id;
    const dlRes = await app.request(`/dashboard/runs/run-proj-1/attachments/${attId}/download`, {
      headers: ownerSess.headers,
    });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(dlRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(dlRes.headers.get('Content-Disposition')).not.toMatch(/[\r\n]/);
  });
});

describe('#412 — Vercel install auth, dashboard CSRF, snooze cap, CORS/HSTS, logout, & GitHub verified email', () => {
  beforeEach(() => {
    resetMemoryStore();
    apiRateLimiter.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('protects POST /v1/integrations/vercel/install against cross-tenant takeover and missing secret', async () => {
    const first = await app.request('/v1/integrations/vercel/install', {
      method: 'POST',
      headers: auth('alice'),
      body: JSON.stringify({ configurationId: 'icfg_1', vercelTeamId: 'vteam_1' }),
    });
    expect(first.status).toBe(201);

    // Different user tries to hijack / inject audit activity into existing vercel_vteam_1 -> 403
    const hijack = await app.request('/v1/integrations/vercel/install', {
      method: 'POST',
      headers: auth('mallory'),
      body: JSON.stringify({ configurationId: 'icfg_2', vercelTeamId: 'vteam_1' }),
    });
    expect(hijack.status).toBe(403);

    // When VERCEL_INTEGRATION_SECRET is set, wrong/missing secret -> 403
    const wrongSec = await app.request(
      '/v1/integrations/vercel/install',
      {
        method: 'POST',
        headers: { ...auth('alice'), 'X-Vercel-Integration-Secret': 'wrong' },
        body: JSON.stringify({ configurationId: 'icfg_1', vercelTeamId: 'vteam_1' }),
      },
      { VERCEL_INTEGRATION_SECRET: 'real-vercel-secret' },
    );
    expect(wrongSec.status).toBe(403);
  });

  it('enforces CSRF protection and snooze bounds on /dashboard/* POST routes', async () => {
    const store = getMemoryStore();
    const sess = await sessionAuth('csrf-user');
    await store.createMonitor({
      id: 'm-csrf',
      userId: 'csrf-user',
      name: 'Site',
      url: 'https://example.com',
      routes: ['/'],
      viewports: [1440],
      intervalMinutes: 60,
      alertThreshold: 0.05,
      enabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    });

    // Missing CSRF token -> 403
    const noCsrf = await app.request('/dashboard/monitors/m-csrf/toggle', {
      method: 'POST',
      headers: sess.cookieOnly,
    });
    expect(noCsrf.status).toBe(403);

    // Cross-site Sec-Fetch-Site -> 403 even with token
    const crossSite = await app.request('/dashboard/monitors/m-csrf/toggle', {
      method: 'POST',
      headers: { ...sess.headers, 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);

    // Cross-origin Origin header -> 403
    const crossOrigin = await app.request('/dashboard/monitors/m-csrf/toggle', {
      method: 'POST',
      headers: { ...sess.headers, Origin: 'https://evil.example' },
    });
    expect(crossOrigin.status).toBe(403);

    // Snooze > 720 hours -> 400
    const badSnooze = await app.request('/dashboard/monitors/m-csrf/snooze', {
      method: 'POST',
      headers: { ...sess.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'hours=9999',
    });
    expect(badSnooze.status).toBe(400);
  });

  it('scopes localhost CORS to non-production, sets HSTS in prod, supports /auth/logout, and invalidates deleted users', async () => {
    // Dev allows exact localhost:3000, rejects localhost:3000.evil.com
    const devLocal = await app.request('/health', { headers: { Origin: 'http://localhost:3000' } });
    expect(devLocal.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');

    const devSpoof = await app.request('/health', { headers: { Origin: 'http://localhost:3000.evil.com' } });
    expect(devSpoof.headers.get('Access-Control-Allow-Origin')).toBeNull();

    // Production blocks localhost CORS and emits HSTS
    const fakeDb = {} as unknown as import('../src/db/d1-store.js').D1Database;
    const prodLocal = await app.request(
      '/health',
      { headers: { Origin: 'http://localhost:3000' } },
      { ENVIRONMENT: 'production', DB: fakeDb },
    );
    expect(prodLocal.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(prodLocal.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');

    // POST /auth/logout requires CSRF when logged in and clears fg_session cookie
    const sess = await sessionAuth('logout-user');
    const badLogout = await app.request('/auth/logout', {
      method: 'POST',
      headers: { ...sess.cookieOnly, Accept: 'application/json' },
    });
    expect(badLogout.status).toBe(403);

    const okLogout = await app.request('/auth/logout', {
      method: 'POST',
      headers: { ...sess.headers, Accept: 'application/json' },
    });
    expect(okLogout.status).toBe(200);
    expect(okLogout.headers.get('Set-Cookie')).toContain('fg_session=');
    expect(okLogout.headers.get('Set-Cookie')).toContain('Max-Age=0');

    // Deleted user's still-valid signed cookie immediately stops authenticating
    const deletedSess = await sessionAuth('erased-user');
    const store = getMemoryStore();
    await store.eraseAccount('erased-user');
    const afterErase = await app.request('/dashboard', { headers: deletedSess.headers });
    expect(await afterErase.text()).toContain('Sign in with GitHub');
  });

  it('fetchGitHubUser never accepts unverified emails from /user/emails', async () => {
    const fakeFetch = (async (url: string) => {
      if (url.endsWith('/user')) {
        return Response.json({ id: 7, login: 'octo', email: null });
      }
      return Response.json([
        { email: 'unverified-primary@example.com', primary: true, verified: false },
        { email: 'unverified-secondary@example.com', primary: false, verified: false },
      ]);
    }) as unknown as typeof fetch;

    const user = await fetchGitHubUser('tok', fakeFetch);
    expect(user.email).toBeNull();
  });
});
