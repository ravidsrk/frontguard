import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectPreviewUrl, waitForUrl } from '../../src/utils/preview-url.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VARS = [
  'FRONTGUARD_URL',
  'VERCEL_URL',
  'VERCEL_PREVIEW_URL',
  'DEPLOY_PRIME_URL',
  'DEPLOY_URL',
  'CF_PAGES_URL',
  'RAILWAY_STATIC_URL',
  'RENDER_EXTERNAL_URL',
  'AMPLIFY_URL',
  'SURGE_URL',
];

function clearAllEnvVars(): void {
  for (const key of ENV_VARS) {
    delete process.env[key];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectPreviewUrl', () => {
  afterEach(() => {
    clearAllEnvVars();
  });

  it('returns null when no env vars are set', () => {
    clearAllEnvVars();
    expect(detectPreviewUrl()).toBeNull();
  });

  it('returns Vercel URL with https:// prefix when VERCEL_URL is set', () => {
    process.env.VERCEL_URL = 'my-app-abc123.vercel.app';
    expect(detectPreviewUrl()).toBe('https://my-app-abc123.vercel.app');
  });

  it('does not double-add https:// if already present', () => {
    process.env.VERCEL_URL = 'https://my-app.vercel.app';
    expect(detectPreviewUrl()).toBe('https://my-app.vercel.app');
  });

  it('returns Netlify URL when DEPLOY_PRIME_URL is set', () => {
    process.env.DEPLOY_PRIME_URL = 'https://deploy-preview-42--my-site.netlify.app';
    expect(detectPreviewUrl()).toBe('https://deploy-preview-42--my-site.netlify.app');
  });

  it('strips trailing slash from URLs', () => {
    process.env.DEPLOY_PRIME_URL = 'https://my-site.netlify.app/';
    expect(detectPreviewUrl()).toBe('https://my-site.netlify.app');
  });

  it('strips multiple trailing slashes', () => {
    process.env.DEPLOY_PRIME_URL = 'https://my-site.netlify.app///';
    expect(detectPreviewUrl()).toBe('https://my-site.netlify.app');
  });

  it('FRONTGUARD_URL takes priority over platform env vars', () => {
    process.env.FRONTGUARD_URL = 'https://custom.example.com';
    process.env.VERCEL_URL = 'my-app.vercel.app';
    process.env.DEPLOY_PRIME_URL = 'https://my-site.netlify.app';

    expect(detectPreviewUrl()).toBe('https://custom.example.com');
  });

  it('falls through to Netlify when Vercel env vars are not set', () => {
    process.env.DEPLOY_PRIME_URL = 'https://my-site.netlify.app';
    expect(detectPreviewUrl()).toBe('https://my-site.netlify.app');
  });

  it('detects Cloudflare Pages URL', () => {
    process.env.CF_PAGES_URL = 'https://abc123.my-project.pages.dev';
    expect(detectPreviewUrl()).toBe('https://abc123.my-project.pages.dev');
  });

  it('detects Railway URL and adds https://', () => {
    process.env.RAILWAY_STATIC_URL = 'my-app.up.railway.app';
    expect(detectPreviewUrl()).toBe('https://my-app.up.railway.app');
  });

  it('ignores empty/whitespace env vars', () => {
    process.env.VERCEL_URL = '   ';
    expect(detectPreviewUrl()).toBeNull();
  });

  it('trims whitespace from env var values', () => {
    process.env.VERCEL_URL = '  my-app.vercel.app  ';
    expect(detectPreviewUrl()).toBe('https://my-app.vercel.app');
  });
});

describe('waitForUrl', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns true immediately on a 2xx response', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;
    const ok = await waitForUrl('https://x.test', { maxAttempts: 3, intervalMs: 0 });
    expect(ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('treats 3xx as ready', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 302 })) as typeof fetch;
    expect(await waitForUrl('https://x.test', { maxAttempts: 2, intervalMs: 0 })).toBe(true);
  });

  it('retries on non-ready status then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
    const ok = await waitForUrl('https://x.test', { maxAttempts: 3, intervalMs: 0 });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on fetch rejection (network error)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
    expect(await waitForUrl('https://x.test', { maxAttempts: 3, intervalMs: 0 })).toBe(true);
  });

  it('returns false after exhausting all attempts', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;
    const ok = await waitForUrl('https://x.test', { maxAttempts: 3, intervalMs: 0 });
    expect(ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
