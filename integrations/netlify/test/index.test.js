import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onSuccess } from '../index.js';

describe('onSuccess — missing API config', () => {
  const logs = [];
  const origLog = console.log;
  const origEnv = { ...process.env };

  beforeEach(() => {
    logs.length = 0;
    console.log = (msg) => logs.push(String(msg));
    process.env.CONTEXT = 'deploy-preview';
    process.env.DEPLOY_PRIME_URL = 'https://preview.netlify.app';
    delete process.env.FRONTGUARD_API_URL;
    delete process.env.FRONTGUARD_API_KEY;
  });

  afterEach(() => {
    console.log = origLog;
    process.env = { ...origEnv };
  });

  it('skips without calling cloud-api when apiUrl and env URL are unset', async () => {
    const failBuild = vi.fn();
    await onSuccess({ inputs: { apiKey: 'fg_test' }, utils: { build: { failBuild } } });
    expect(logs.some((l) => l.includes('FRONTGUARD_API_URL / FRONTGUARD_API_KEY not set'))).toBe(
      true,
    );
    expect(failBuild).not.toHaveBeenCalled();
  });

  it('does not fall back to api.frontguard.dev', async () => {
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    try {
      await onSuccess({
        inputs: { apiKey: 'fg_test' },
        utils: { build: { failBuild: vi.fn() } },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('prefers FRONTGUARD_API_URL over netlify.toml inputs.apiUrl on deploy previews', async () => {
    const origFetch = globalThis.fetch;
    const calledUrls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calledUrls.push(String(url));
      if (String(url).endsWith('/v1/run')) {
        return new Response(JSON.stringify({ id: 'run_1' }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: 'completed', results: [] }), { status: 200 });
    });
    process.env.FRONTGUARD_API_URL = 'https://trusted-api.example.com/';
    process.env.FRONTGUARD_API_KEY = 'fg_secret_key';
    try {
      await onSuccess({
        inputs: { apiUrl: 'https://evil-pr-override.example.com' },
        utils: { build: { failBuild: vi.fn() } },
      });
      expect(calledUrls.length).toBeGreaterThanOrEqual(2);
      expect(calledUrls.every((u) => u.startsWith('https://trusted-api.example.com/'))).toBe(true);
      expect(calledUrls.some((u) => u.includes('evil-pr-override'))).toBe(false);
      expect(logs.some((l) => /Refusing.*inputs\.apiUrl/i.test(l))).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('rejects non-https apiUrl without sending API key', async () => {
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    process.env.FRONTGUARD_API_KEY = 'fg_secret_key';
    const failBuild = vi.fn();
    try {
      await onSuccess({
        inputs: { apiUrl: 'http://evil.example.com', failBuild: true },
        utils: { build: { failBuild } },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(failBuild).toHaveBeenCalledWith(expect.stringMatching(/https/i));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});