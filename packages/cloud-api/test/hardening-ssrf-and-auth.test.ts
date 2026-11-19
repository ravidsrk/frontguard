/**
 * Security & contract regression tests for:
 * - #400: origin-bound routes[].path validation + hardened render-target SSRF/DoH guard
 * - #401: authenticated service-to-service checkRunId/installationId + runId in GitHub callback
 * - #406 / #413: self-host Dockerfile, docker-compose, docker-entrypoint, and pinned CLI snapshot
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import {
  assertSafeRenderTarget,
  assertSafeRoutePaths,
  isPrivateOrLoopbackHost,
  isSafeRelativeRoutePath,
  SafeRenderTargetError,
} from '../src/security/render-target.js';
import { completeCheckRun } from '../src/github-callback.js';
import { FRONTGUARD_CLI_VERSION } from '../src/daytona-runner.js';
import type { Run } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');

const auth = (token = 'tester') => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const demoId = (token: string) => `demo:${createHash('sha256').update(token).digest('hex')}`;

function stubPublicDoh(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin === 'https://cloudflare-dns.com' && url.pathname === '/dns-query') {
      return Response.json({
        Status: 0,
        Answer: url.searchParams.get('type') === '1' ? [{ type: 1, data: '93.184.216.34' }] : [],
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
}

describe('#400 — origin-bound relative route paths', () => {
  beforeEach(() => {
    resetMemoryStore();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts valid relative paths and rejects full URLs, protocol-relative, backslashes, and control chars', () => {
    expect(isSafeRelativeRoutePath('/')).toBe(true);
    expect(isSafeRelativeRoutePath('/pricing?tier=pro#faq')).toBe(true);
    expect(isSafeRelativeRoutePath('/a/b/c')).toBe(true);

    for (const bad of [
      '',
      'pricing',
      '//evil.example/admin',
      'https://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:8080/internal',
      'file:///etc/passwd',
      '/\\evil.example',
      '/foo\r\nbar',
      '/foo\0bar',
      '/@evil.example',
    ]) {
      if (bad === '/@evil.example') {
        // Starts with / and stays on same origin when resolved against https://example.com
        expect(isSafeRelativeRoutePath(bad)).toBe(true);
        continue;
      }
      expect(isSafeRelativeRoutePath(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }

    expect(() =>
      assertSafeRoutePaths('https://example.com', [{ path: 'http://169.254.169.254/latest' }]),
    ).toThrow(SafeRenderTargetError);
    expect(() => assertSafeRoutePaths('https://example.com', ['//127.0.0.1/secret'])).toThrow(
      SafeRenderTargetError,
    );
  });

  it('rejects absolute or protocol-relative routes[].path on POST /v1/run', async () => {
    for (const badPath of ['http://169.254.169.254/latest', '//evil.example/steal', 'file:///etc/passwd']) {
      const res = await app.request('/v1/run', {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({
          url: 'https://example.com',
          routes: [{ path: badPath }],
        }),
      });
      expect(res.status, `path ${badPath} should return 400`).toBe(400);
    }
  });

  it('rejects unsafe route paths on POST and PATCH /v1/monitors', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: demoId('pro-mon'), plan: 'business', createdAt: '2026-01-01T00:00:00Z' });

    const badCreate = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('pro-mon'),
      body: JSON.stringify({
        name: 'Bad route',
        url: 'https://example.com',
        routes: ['https://169.254.169.254/latest'],
      }),
    });
    expect(badCreate.status).toBe(400);

    const okCreate = await app.request('/v1/monitors', {
      method: 'POST',
      headers: auth('pro-mon'),
      body: JSON.stringify({
        name: 'Good monitor',
        url: 'https://example.com',
        routes: ['/'],
      }),
    });
    expect(okCreate.status).toBe(201);
    const { id } = await okCreate.json();

    const badPatch = await app.request(`/v1/monitors/${id}`, {
      method: 'PATCH',
      headers: auth('pro-mon'),
      body: JSON.stringify({ routes: ['//internal.corp/admin'] }),
    });
    expect(badPatch.status).toBe(400);
  });
});

describe('#400 — render-target.ts DNS, trailing-dot, and IPv6/IPv4 range hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  it('blocks trailing-dot hosts, *.localhost, *.local, *.internal, and special IPv4/IPv6 ranges', () => {
    const blockedHosts = [
      'localhost.',
      'sub.localhost',
      'sub.localhost.',
      'printer.local',
      'printer.local.',
      'api.internal',
      'metadata.google.internal.',
      '192.0.0.1',
      '198.18.0.1',
      '198.19.255.254',
      '192.0.2.1',
      '198.51.100.1',
      '203.0.113.1',
      '[::127.0.0.1]',
      '[::ffff:169.254.169.254]',
      '[64:ff9b::10.0.0.1]',
      '[64:ff9b:1::1]',
      '[2002:7f00:0001::1]',
      '[2001:0000:4136:e378:8000:63bf:3fff:fdd2]',
      '[ff02::1]',
      '[fec0::1]',
      '[fe80::1%25eth0]',
    ];
    for (const host of blockedHosts) {
      expect(isPrivateOrLoopbackHost(host), `host ${host} must be blocked`).toBe(true);
    }

    // Global public addresses remain allowed.
    expect(isPrivateOrLoopbackHost('93.184.216.34')).toBe(false);
    expect(isPrivateOrLoopbackHost('[2606:2800:220:1:248:1893:25c8:1946]')).toBe(false);
    expect(isPrivateOrLoopbackHost('example.com')).toBe(false);
  });

  it('fails closed when DoH returns only CNAME/TXT records with no A/AAAA answers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        Status: 0,
        Answer: [{ type: 5, data: 'alias.example.net.' }],
      }),
    );

    await expect(assertSafeRenderTarget('https://cname-only.example.com')).rejects.toThrow(
      SafeRenderTargetError,
    );
  });

  it('blocks a hostname whose DoH response includes a CNAME pointing to an internal host', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        Status: 0,
        Answer: [
          { type: 5, data: 'redis.cluster.internal.' },
          { type: 1, data: '93.184.216.34' },
        ],
      }),
    );

    await expect(assertSafeRenderTarget('https://sneaky.example.com')).rejects.toThrow(
      SafeRenderTargetError,
    );
  });
});

describe('#401 — checkRunId / installationId service-to-service authorization & runId callback', () => {
  beforeEach(() => {
    resetMemoryStore();
    stubPublicDoh();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns 403 when checkRunId or installationId is sent without valid X-Frontguard-Callback-Secret', async () => {
    // 1. Secret not configured in env -> 403
    const unconfigured = await app.request('/v1/run', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ url: 'https://example.com', checkRunId: 42 }),
    });
    expect(unconfigured.status).toBe(403);
    expect((await unconfigured.json()).error).toBe(
      'checkRunId and installationId require authenticated service-to-service authorization',
    );

    // 2. Secret configured, header missing -> 403
    const missingHdr = await app.request(
      '/v1/run',
      {
        method: 'POST',
        headers: auth(),
        body: JSON.stringify({ url: 'https://example.com', installationId: 99 }),
      },
      { FRONTGUARD_CALLBACK_SECRET: 'super-secret-s2s-token' },
    );
    expect(missingHdr.status).toBe(403);

    // 3. Wrong secret header -> 403
    const wrongHdr = await app.request(
      '/v1/run',
      {
        method: 'POST',
        headers: { ...auth(), 'X-Frontguard-Callback-Secret': 'wrong-secret' },
        body: JSON.stringify({ url: 'https://example.com', checkRunId: 42, installationId: 99 }),
      },
      { FRONTGUARD_CALLBACK_SECRET: 'super-secret-s2s-token' },
    );
    expect(wrongHdr.status).toBe(403);

    // 4. Matching secret header -> 202
    const allowed = await app.request(
      '/v1/run',
      {
        method: 'POST',
        headers: { ...auth(), 'X-Frontguard-Callback-Secret': 'super-secret-s2s-token' },
        body: JSON.stringify({
          url: 'https://example.com',
          github: { owner: 'acme', repo: 'web', commitSha: 'abc123' },
          checkRunId: 42,
          installationId: 99,
        }),
      },
      { FRONTGUARD_CALLBACK_SECRET: 'super-secret-s2s-token' },
    );
    expect(allowed.status).toBe(202);
  });

  it('completeCheckRun includes runId and passes an AbortSignal timeout on fetch', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedSignal: AbortSignal | null | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      capturedSignal = init.signal;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const run: Run = {
      id: 'run-callback-401',
      status: 'completed',
      url: 'https://preview.example.com',
      routes: [{ path: '/' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      ai: null,
      createdAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:10Z',
      results: [{ route: '/', viewport: 1440, status: 'unchanged', diffPercentage: 0, timestamp: 'now' }],
      reportUrl: '/v1/reports/run-callback-401',
      github: { owner: 'acme', repo: 'web', commitSha: 'deadbeef' },
      checkRunId: 123,
      installationId: 456,
    };

    const res = await completeCheckRun(
      { GITHUB_APP_URL: 'https://app.frontguard.dev', FRONTGUARD_CALLBACK_SECRET: 's2s' },
      run,
      fakeFetch,
    );
    expect(res).toBe(true);
    expect(capturedBody?.runId).toBe('run-callback-401');
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('#406 / #413 — self-host Dockerfile, docker-compose, entrypoint, and snapshot pinning', () => {
  it('uses Node 22 and non-root USER node in packages/cloud-api/Dockerfile', () => {
    const dockerfile = readFileSync(join(pkgRoot, 'Dockerfile'), 'utf-8');
    expect(dockerfile).toContain('FROM node:22-bookworm-slim');
    expect(dockerfile).not.toContain('FROM node:20');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).not.toContain('--var');
  });

  it('removes weak default session secret from docker-compose.yml', () => {
    const compose = readFileSync(join(pkgRoot, 'docker-compose.yml'), 'utf-8');
    expect(compose).not.toContain('change-me-in-production');
    expect(compose).toContain('${DASHBOARD_SESSION_SECRET:?');
  });

  it('fails closed in docker-entrypoint.sh and forwards allowlisted env vars to .dev.vars', () => {
    const entrypoint = readFileSync(join(pkgRoot, 'docker-entrypoint.sh'), 'utf-8');
    expect(entrypoint).toContain('.dev.vars');
    expect(entrypoint).toContain('exit 1');
    expect(entrypoint).not.toContain('continuing anyway');
    expect(entrypoint).toContain('DASHBOARD_SESSION_SECRET');
  });

  it('pins @frontguard/cli version in snapshot.ts instead of @latest', () => {
    const snapshotSrc = readFileSync(join(pkgRoot, 'src/snapshot.ts'), 'utf-8');
    expect(snapshotSrc).not.toContain('@frontguard/cli@latest');
    expect(snapshotSrc).toContain('FRONTGUARD_CLI_VERSION');
    expect(snapshotSrc).toContain('node:22-bookworm');
    expect(FRONTGUARD_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
