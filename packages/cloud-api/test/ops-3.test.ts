/**
 * OPS-3: failed background runs and monitor checks persist dead-letter records
 * inside awaited work (not fire-and-forget).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { app } from '../src/index.js';
import { resetMemoryStore, getMemoryStore } from '../src/db/factory.js';
import { runMonitor, runScheduledChecks } from '../src/scheduler.js';
import type { Monitor } from '../src/db/monitors.js';
import * as processor from '../src/processor.js';

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 'm1',
    userId: 'u1',
    name: 'Home',
    url: 'https://example.com',
    routes: ['/'],
    viewports: [1440],
    intervalMinutes: 60,
    alertThreshold: 0.05,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('OPS-3 — background failure dead-letter', () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.restoreAllMocks());

  it('awaits dead-letter persistence inside waitUntil before the chain resolves', async () => {
    vi.spyOn(processor, 'processRun').mockImplementation(async (run) => {
      run.status = 'failed';
      run.error = 'sandbox exploded';
    });

    const store = getMemoryStore();
    const originalRecord = store.recordBackgroundFailure.bind(store);
    let resolveRecord!: () => void;
    const recordGate = new Promise<void>((resolve) => {
      resolveRecord = resolve;
    });
    vi.spyOn(store, 'recordBackgroundFailure').mockImplementation(async (failure) => {
      await recordGate;
      return originalRecord(failure);
    });

    const waitUntilPromises: Promise<unknown>[] = [];
    const executionCtx = {
      waitUntil(promise: Promise<unknown>) {
        waitUntilPromises.push(promise);
      },
    };

    const req = new Request('http://localhost/v1/run', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });

    const res = await app.fetch(req, {}, executionCtx);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string };
    expect(waitUntilPromises).toHaveLength(1);

    const beforeAwait = await store.listBackgroundFailures({ kind: 'run', sourceId: body.id });
    expect(beforeAwait).toHaveLength(0);

    resolveRecord();
    await Promise.all(waitUntilPromises);

    const run = await store.getRun(body.id);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe('sandbox exploded');

    const deadLetters = await store.listBackgroundFailures({ kind: 'run', sourceId: body.id });
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      kind: 'run',
      sourceId: body.id,
      error: 'sandbox exploded',
      attempt: 1,
    });
    expect(deadLetters[0].createdAt).toBeTruthy();
  });

  it('records a dead-letter when a scheduled monitor check fails terminally', async () => {
    const store = getMemoryStore();
    const monitor = makeMonitor();
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    vi.spyOn(processor, 'processRun').mockRejectedValue(new Error('target unreachable'));

    const { run } = await runMonitor({}, store, monitor, now);
    expect(run.status).toBe('error');

    const deadLetters = await store.listBackgroundFailures({ kind: 'monitor', sourceId: monitor.id });
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      kind: 'monitor',
      sourceId: monitor.id,
      userId: monitor.userId,
      error: 'target unreachable',
      attempt: 2,
    });
    expect(deadLetters[0].context).toMatchObject({ monitorRunId: run.id });
  });

  it('records a dead-letter when runScheduledChecks catches an unexpected monitor failure', async () => {
    const store = getMemoryStore();
    await store.createUser({ id: 'u1', plan: 'business', createdAt: '2026-01-01T00:00:00Z' });
    const monitor = makeMonitor({ id: 'm-catch', lastRunAt: '2026-01-01T10:00:00Z' });
    await store.createMonitor(monitor);
    const now = new Date('2026-01-01T12:00:00Z');

    // Force runMonitor to throw after the check succeeds so the scheduler catch
    // path runs (ESM internal calls are not replaceable via export spy).
    vi.spyOn(store, 'incrementUsage').mockRejectedValueOnce(new Error('tick blew up'));

    const result = await runScheduledChecks({}, now);
    expect(result.errors).toBe(1);

    const deadLetters = await store.listBackgroundFailures({ kind: 'monitor', sourceId: monitor.id });
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      kind: 'monitor',
      sourceId: monitor.id,
      userId: monitor.userId,
      error: 'tick blew up',
      attempt: 0,
    });
    expect(deadLetters[0].context).toMatchObject({ phase: 'runScheduledChecks' });
  });
});