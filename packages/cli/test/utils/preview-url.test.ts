import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectPreviewUrl } from '../../src/utils/preview-url.js';

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
