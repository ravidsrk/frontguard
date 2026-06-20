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
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    await onSuccess({
      inputs: { apiKey: 'fg_test' },
      utils: { build: { failBuild: vi.fn() } },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = undefined;
  });
});