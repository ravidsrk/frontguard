import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import {
  previewUrlFromCommitStatus,
  previewUrlFromDeploymentStatus,
  classifyCommitStatus,
  classifyDeploymentStatus,
  renderPreviewUrlTemplate,
  inferPreviewUrl,
  type CommitStatusEvent,
  type DeploymentStatusEvent,
} from '../src/preview-url.js';
import {
  createGitHubApp,
  rememberPreviewUrl,
  recallPreviewUrl,
  clearPreviewUrlCache,
} from '../src/handler.js';
import type { PullRequestEvent } from '../src/webhook.js';

const SECRET = 'webhook-secret';
const APP_ID = '424242';
const APP_PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
}) as string;
const APP_ENV = { GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: APP_PEM };

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

function prEvent(commitSha = 'deadbeef'): PullRequestEvent {
  return {
    action: 'opened',
    number: 7,
    pull_request: {
      head: { sha: commitSha, ref: 'feature' },
      base: { ref: 'main' },
      html_url: 'https://github.com/acme/web/pull/7',
    },
    repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    installation: { id: 123 },
  };
}

beforeEach(() => clearPreviewUrlCache());

describe('classifyCommitStatus', () => {
  it('classifies Vercel statuses by context', () => {
    expect(classifyCommitStatus({ context: 'Vercel', state: 'success', sha: 'a' })).toBe('vercel');
    expect(classifyCommitStatus({ context: 'vercel/preview', state: 'success', sha: 'a' })).toBe('vercel');
  });
  it('returns null for unrecognised contexts', () => {
    expect(classifyCommitStatus({ context: 'ci/circle', state: 'success', sha: 'a' })).toBeNull();
  });
});

describe('previewUrlFromCommitStatus', () => {
  it('extracts a Vercel preview URL on success', () => {
    const event: CommitStatusEvent = {
      context: 'Vercel',
      state: 'success',
      target_url: 'https://my-app-abc.vercel.app',
      sha: 'deadbeef',
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    };
    expect(previewUrlFromCommitStatus(event)).toEqual({
      url: 'https://my-app-abc.vercel.app',
      source: 'vercel-status',
    });
  });

  it('ignores pending or failed statuses', () => {
    const base: CommitStatusEvent = {
      context: 'Vercel',
      state: 'pending',
      target_url: 'https://x.vercel.app',
      sha: 'a',
    };
    expect(previewUrlFromCommitStatus(base)).toBeNull();
    expect(previewUrlFromCommitStatus({ ...base, state: 'failure' })).toBeNull();
  });

  it('ignores statuses from non-provider contexts', () => {
    const event: CommitStatusEvent = {
      context: 'ci/lint',
      state: 'success',
      target_url: 'https://x.example.com',
      sha: 'a',
    };
    expect(previewUrlFromCommitStatus(event)).toBeNull();
  });

  it('ignores non-http target_urls', () => {
    const event: CommitStatusEvent = {
      context: 'Vercel',
      state: 'success',
      target_url: 'ftp://nope.vercel.app',
      sha: 'a',
    };
    expect(previewUrlFromCommitStatus(event)).toBeNull();
  });
});

describe('classifyDeploymentStatus', () => {
  it('classifies Netlify by URL host', () => {
    const ev: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'Deploy Preview' },
      deployment_status: { state: 'success', environment_url: 'https://deploy-preview-42--app.netlify.app' },
    };
    expect(classifyDeploymentStatus(ev)).toBe('netlify');
  });

  it('classifies Cloudflare Pages by URL host', () => {
    const ev: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'preview' },
      deployment_status: { state: 'success', environment_url: 'https://abc.my-app.pages.dev' },
    };
    expect(classifyDeploymentStatus(ev)).toBe('cloudflare-pages');
  });

  it('classifies Vercel deployments', () => {
    const ev: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'Preview' },
      deployment_status: { state: 'success', target_url: 'https://my-app-xyz.vercel.app' },
    };
    expect(classifyDeploymentStatus(ev)).toBe('vercel');
  });

  it('ignores production environments', () => {
    const ev: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'production' },
      deployment_status: { state: 'success', environment_url: 'https://example.com' },
    };
    expect(classifyDeploymentStatus(ev)).toBeNull();
  });
});

describe('previewUrlFromDeploymentStatus', () => {
  it('extracts the Netlify preview URL', () => {
    const event: DeploymentStatusEvent = {
      deployment: { sha: 'deadbeef', environment: 'Deploy Preview' },
      deployment_status: {
        state: 'success',
        environment_url: 'https://deploy-preview-42--app.netlify.app',
      },
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    };
    expect(previewUrlFromDeploymentStatus(event)).toEqual({
      url: 'https://deploy-preview-42--app.netlify.app',
      source: 'netlify-deployment',
    });
  });

  it('extracts the Cloudflare Pages preview URL', () => {
    const event: DeploymentStatusEvent = {
      deployment: { sha: 'deadbeef', environment: 'preview' },
      deployment_status: { state: 'success', environment_url: 'https://abc.my-app.pages.dev' },
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    };
    expect(previewUrlFromDeploymentStatus(event)).toEqual({
      url: 'https://abc.my-app.pages.dev',
      source: 'cloudflare-deployment',
    });
  });

  it('falls back to target_url when environment_url is missing', () => {
    const event: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'Deploy Preview' },
      deployment_status: { state: 'success', target_url: 'https://x.netlify.app' },
    };
    expect(previewUrlFromDeploymentStatus(event)?.url).toBe('https://x.netlify.app');
  });

  it('ignores non-success states', () => {
    const event: DeploymentStatusEvent = {
      deployment: { sha: 'a', environment: 'preview' },
      deployment_status: { state: 'failure', environment_url: 'https://x.pages.dev' },
    };
    expect(previewUrlFromDeploymentStatus(event)).toBeNull();
  });
});

describe('renderPreviewUrlTemplate', () => {
  const ctx = {
    owner: 'acme',
    repo: 'web',
    prNumber: 42,
    commitSha: 'deadbeefcafe1234',
    branch: 'feat/x',
  };

  it('substitutes the standard placeholders', () => {
    expect(
      renderPreviewUrlTemplate(
        'https://pr-{prNumber}.{owner}-{repo}.preview.example.com/{commitShortSha}',
        ctx,
      ),
    ).toBe('https://pr-42.acme-web.preview.example.com/deadbee');
  });

  it('accepts aliases (pr, sha, shortSha)', () => {
    expect(renderPreviewUrlTemplate('https://{owner}.dev/pr/{pr}/{sha}/{shortSha}/{branch}', ctx)).toBe(
      'https://acme.dev/pr/42/deadbeefcafe1234/deadbee/feat/x',
    );
  });

  it('leaves unknown tokens unsubstituted', () => {
    expect(renderPreviewUrlTemplate('https://example.com/{unknown}', ctx)).toBe(
      'https://example.com/{unknown}',
    );
  });
});

describe('inferPreviewUrl', () => {
  it('prefers an observed URL over a template', () => {
    const observed = { url: 'https://real.vercel.app', source: 'vercel-status' as const };
    const out = inferPreviewUrl({
      event: prEvent(),
      template: 'https://pr-{prNumber}.example.com',
      observed,
    });
    expect(out).toEqual(observed);
  });

  it('renders the template when no URL has been observed', () => {
    const out = inferPreviewUrl({
      event: prEvent(),
      template: 'https://pr-{prNumber}.example.com',
    });
    expect(out).toEqual({ url: 'https://pr-7.example.com', source: 'template' });
  });

  it('returns null when neither is available', () => {
    expect(inferPreviewUrl({ event: prEvent() })).toBeNull();
  });

  it('rejects a template that renders to a non-http URL', () => {
    expect(
      inferPreviewUrl({ event: prEvent(), template: 'not-a-url-{prNumber}' }),
    ).toBeNull();
  });
});

describe('handler — preview URL caching + run trigger', () => {
  async function postWebhook(
    app: ReturnType<typeof createGitHubApp>,
    event: string,
    body: string,
    extraEnv: Record<string, unknown> = {},
  ): Promise<Response> {
    return app.request(
      '/webhook',
      { method: 'POST', body, headers: { 'x-github-event': event, 'x-hub-signature-256': sign(body) } },
      { GITHUB_WEBHOOK_SECRET: SECRET, ...extraEnv },
    );
  }

  it('caches the preview URL from a Vercel commit_status', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify({
      context: 'Vercel',
      state: 'success',
      target_url: 'https://my-app-abc.vercel.app',
      sha: 'sha-vercel',
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    });
    const res = await postWebhook(app, 'status', body);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.source).toBe('vercel-status');
    expect(recallPreviewUrl('acme', 'web', 'sha-vercel')?.url).toBe('https://my-app-abc.vercel.app');
  });

  it('caches the preview URL from a Netlify deployment_status', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify({
      deployment: { sha: 'sha-netlify', environment: 'Deploy Preview' },
      deployment_status: {
        state: 'success',
        environment_url: 'https://deploy-preview-7--app.netlify.app',
      },
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    });
    const res = await postWebhook(app, 'deployment_status', body);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.source).toBe('netlify-deployment');
    expect(recallPreviewUrl('acme', 'web', 'sha-netlify')?.url).toBe(
      'https://deploy-preview-7--app.netlify.app',
    );
  });

  it('caches the preview URL from a Cloudflare Pages deployment_status', async () => {
    const app = createGitHubApp();
    const body = JSON.stringify({
      deployment: { sha: 'sha-cf', environment: 'preview' },
      deployment_status: { state: 'success', environment_url: 'https://abc.my-app.pages.dev' },
      repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
    });
    const res = await postWebhook(app, 'deployment_status', body);
    const json = await res.json();
    expect(json.cached).toBe(true);
    expect(json.source).toBe('cloudflare-deployment');
  });

  it('uses the cached preview URL when a PR event arrives next', async () => {
    rememberPreviewUrl('acme', 'web', 'cached-sha', {
      url: 'https://cached.vercel.app',
      source: 'vercel-status',
    });
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (String(url).includes('/v1/run')) {
        sentBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: 'run_x' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;
    try {
      const body = JSON.stringify(prEvent('cached-sha'));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
      });
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.previewUrl).toBe('https://cached.vercel.app');
      expect(json.previewSource).toBe('vercel-status');
      const runBody = sentBody as { url?: string } | null;
      expect(runBody?.url).toBe('https://cached.vercel.app');
      // Critical: we must NOT forward the github.com PR URL.
      expect(runBody?.url).not.toContain('github.com');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('falls back to the configured template when no URL is observed', async () => {
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (String(url).includes('/v1/run')) {
        sentBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: 'run_y' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;
    try {
      const body = JSON.stringify(prEvent('uncached-sha'));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_PREVIEW_URL_TEMPLATE: 'https://pr-{prNumber}.preview.example.com',
      });
      const json = await res.json();
      expect(json.triggered).toBe(true);
      expect(json.previewUrl).toBe('https://pr-7.preview.example.com');
      expect(json.previewSource).toBe('template');
      expect((sentBody as { url?: string } | null)?.url).toBe('https://pr-7.preview.example.com');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('skips the run when no preview URL can be inferred', async () => {
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let runCalled = false;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('/v1/run')) runCalled = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const body = JSON.stringify(prEvent('no-url-sha'));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
      });
      const json = await res.json();
      expect(json.triggered).toBe(false);
      expect(json.reason).toMatch(/preview URL/i);
      expect(runCalled).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('still skips when app creds are configured and config is found, but no preview URL', async () => {
    // Reproduces the original P0-8 scenario before the fix — we must not
    // silently substitute github.com here even though everything else is wired.
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let runUrl: string | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'ghs_test' }), { status: 201 });
      }
      if (u.includes('/check-runs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 777 }), { status: 201 });
      }
      if (u.includes('/contents/')) return new Response('no', { status: 404 });
      if (u.includes('/v1/run')) {
        runUrl = JSON.parse(init!.body as string).url;
        return new Response(JSON.stringify({ id: 'r' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${u}`);
    }) as typeof fetch;
    try {
      const body = JSON.stringify(prEvent('unobserved'));
      const res = await postWebhook(app, 'pull_request', body, {
        ...APP_ENV,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
      });
      const json = await res.json();
      expect(json.triggered).toBe(false);
      expect(runUrl).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });
});
