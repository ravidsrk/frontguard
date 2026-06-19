/**
 * REL-1: POST /v1/run must hand processRun to executionCtx.waitUntil so
 * background work survives past the 202 response on Cloudflare Workers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';

describe('POST /v1/run — executionCtx.waitUntil (REL-1)', () => {
  beforeEach(() => resetMemoryStore());

  it('hands processRun to waitUntil and completes the run after awaiting it', async () => {
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
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe('queued');
    expect(waitUntilPromises.length).toBeGreaterThan(0);

    await Promise.all(waitUntilPromises);

    const store = getMemoryStore();
    const run = await store.getRun(body.id);
    expect(run?.status).toBe('completed');
  });
});