/**
 * COST-1: bound array lengths and total fan-out; reject oversized requests
 * with 400 before any run is started; meter planned screenshots at submit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import { MAX_ROUTES, MAX_FAN_OUT } from '../src/limits.js';

const processRunStarted = vi.fn();
vi.mock('../src/processor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/processor.js')>();
  return {
    ...actual,
    processRun: (...args: Parameters<typeof actual.processRun>) => {
      processRunStarted();
      return actual.processRun(...args);
    },
  };
});

function demoUserId(token: string): string {
  return `demo:${createHash('sha256').update(token).digest('hex')}`;
}

const request = (token: string, body: unknown) =>
  app.request('/v1/run', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

describe('POST /v1/run — fan-out caps (COST-1)', () => {
  beforeEach(() => {
    resetMemoryStore();
    processRunStarted.mockClear();
  });

  it('rejects an over-cap routes array with 400 before starting a run', async () => {
    const store = getMemoryStore();
    const token = 'cost-routes';
    const userId = demoUserId(token);
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });

    const routes = Array.from({ length: MAX_ROUTES + 1 }, (_, i) => ({ path: `/r${i}` }));
    const res = await request(token, { url: 'https://example.com', routes });

    expect(res.status).toBe(400);
    expect(processRunStarted).not.toHaveBeenCalled();
    expect((await store.listRuns(userId)).length).toBe(0);
  });

  it('rejects an over-cap fan-out product with 400 before starting a run', async () => {
    const store = getMemoryStore();
    const token = 'cost-fanout';
    const userId = demoUserId(token);
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });

    // Within per-array caps but product exceeds MAX_FAN_OUT.
    const routes = Array.from({ length: 10 }, (_, i) => ({ path: `/r${i}` }));
    const viewports = Array.from({ length: 6 }, (_, i) => 320 + i * 100);
    const browsers = ['chromium', 'firefox', 'webkit'] as const;
    expect(routes.length * viewports.length * browsers.length).toBeGreaterThan(MAX_FAN_OUT);

    const res = await request(token, {
      url: 'https://example.com',
      routes,
      viewports,
      browsers: [...browsers],
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.maxFanOut).toBe(MAX_FAN_OUT);
    expect(processRunStarted).not.toHaveBeenCalled();
    expect((await store.listRuns(userId)).length).toBe(0);
  });

  it('reserves planned screenshot count at submit time', async () => {
    const store = getMemoryStore();
    const token = 'cost-meter';
    const userId = demoUserId(token);
    const month = new Date().toISOString().slice(0, 7);
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });

    const routes = [{ path: '/' }, { path: '/about' }];
    const viewports = [1440, 375];
    const browsers = ['chromium'];
    const planned = routes.length * viewports.length * browsers.length;

    const res = await request(token, {
      url: 'https://example.com',
      routes,
      viewports,
      browsers,
    });
    expect(res.status).toBe(202);

    const usage = await store.getUsage(userId, month);
    expect(usage.runsCount).toBe(1);
    expect(usage.screenshotsCount).toBe(planned);
  });
});