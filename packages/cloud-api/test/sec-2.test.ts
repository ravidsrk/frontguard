/**
 * SEC-2: POST /v1/run must reject SSRF targets before any render is started.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';

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

describe('POST /v1/run — SSRF guard (SEC-2)', () => {
  beforeEach(() => {
    resetMemoryStore();
    processRunStarted.mockClear();
  });

  it('rejects private/loopback/metadata hosts before starting a run', async () => {
    const store = getMemoryStore();
    const token = 'sec2-blocked';
    const userId = demoUserId(token);
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });

    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost/',
      'https://127.0.0.1/',
      'https://10.0.0.5/',
      'https://192.168.1.1/',
      'https://172.16.0.1/',
      'https://localhost/',
      'https://metadata.google.internal/',
      'https://[::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://[::ffff:169.254.169.254]/',
      'https://[::ffff:7f00:1]/',
      'https://2130706433/',
      'https://0.0.0.0/',
      'file:///etc/passwd',
    ]) {
      processRunStarted.mockClear();
      const res = await request(token, { url });
      expect(res.status).toBe(400);
      expect(processRunStarted).not.toHaveBeenCalled();
    }

    expect((await store.listRuns(userId)).length).toBe(0);
  });

  it('accepts a public https URL', async () => {
    const store = getMemoryStore();
    const token = 'sec2-public';
    const userId = demoUserId(token);
    await store.createUser({ id: userId, plan: 'free', createdAt: new Date().toISOString() });

    const res = await request(token, { url: 'https://example.com' });
    expect(res.status).toBe(202);
    expect(processRunStarted).toHaveBeenCalled();
  });
});