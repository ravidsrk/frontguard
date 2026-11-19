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

const VALID_SHA = 'deadbeef0123456789abcdef0123456789abcdef';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

function stubPublicDnsFetch(
  inner: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('cloudflare-dns.com/dns-query')) {
      const isAaaa = /[?&]type=(28|AAAA)(?:&|$)/i.test(urlStr);
      const body = isAaaa ? { Answer: [] } : { Answer: [{ type: 1, data: '93.184.216.34' }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/dns-json' },
      });
    }
    return inner(String(url), init);
  }) as typeof fetch;
}

function prEvent(commitSha = VALID_SHA, branch = 'feature'): PullRequestEvent {
  return {
    action: 'opened',
    number: 7,
    pull_request: {
      head: { sha: commitSha, ref: branch, repo: { full_name: 'acme/web', fork: false } },
      base: { ref: 'main', repo: { full_name: 'acme/web' } },
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

  it('ignores non-https and arbitrary/SSRF target_urls on Vercel commit_status', () => {
    for (const target_url of [
      'ftp://nope.vercel.app',
      'http://my-app.vercel.app',
      'https://evil.example/vercel.app',
      'https://169.254.169.254/latest/meta-data/',
      'https://vercel.app.evil.example',
    ]) {
      const event: CommitStatusEvent = {
        context: 'Vercel',
        state: 'success',
        target_url,
        sha: 'a',
      };
      expect(previewUrlFromCommitStatus(event), target_url).toBeNull();
    }
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

  it('rejects path-spoofed hosts, env-label spoofing, non-https, and private hosts', () => {
    for (const ev of [
      {
        deployment: { sha: 'a', environment: 'netlify preview' },
        deployment_status: { state: 'success' as const, environment_url: 'https://evil.example/' },
      },
      {
        deployment: { sha: 'a', environment: 'preview' },
        deployment_status: { state: 'success' as const, environment_url: 'https://evil.example/.netlify.app/' },
      },
      {
        deployment: { sha: 'a', environment: 'cloudflare preview' },
        deployment_status: { state: 'success' as const, environment_url: 'https://169.254.169.254/latest' },
      },
      {
        deployment: { sha: 'a', environment: 'preview' },
        deployment_status: { state: 'success' as const, environment_url: 'http://app.netlify.app' },
      },
    ]) {
      expect(classifyDeploymentStatus(ev)).toBeNull();
      expect(previewUrlFromDeploymentStatus(ev)).toBeNull();
    }
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

  it('accepts aliases (pr, sha, shortSha) and slugifies branch to a safe DNS label', () => {
    expect(renderPreviewUrlTemplate('https://{owner}.dev/pr/{pr}/{sha}/{shortSha}/{branch}', ctx)).toBe(
      'https://acme.dev/pr/42/deadbeefcafe1234/deadbee/feat-x',
    );
  });

  it('prevents authority redirection via malicious branch names', () => {
    const evilCtx = { ...ctx, branch: 'evil.example@ignored' };
    const rendered = renderPreviewUrlTemplate('https://{branch}.preview.example.com', evilCtx);
    expect(rendered).toBe('https://evil-example-ignored.preview.example.com');
    expect(new URL(rendered).hostname).toBe('evil-example-ignored.preview.example.com');
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

  it('rejects a template that renders to a non-https URL, unknown token, or private host', () => {
    expect(
      inferPreviewUrl({ event: prEvent(), template: 'not-a-url-{prNumber}' }),
    ).toBeNull();
    expect(
      inferPreviewUrl({ event: prEvent(), template: 'http://pr-{prNumber}.example.com' }),
    ).toBeNull();
    expect(
      inferPreviewUrl({ event: prEvent(), template: 'https://example.com/{unknown}' }),
    ).toBeNull();
    expect(
      inferPreviewUrl({ event: prEvent(), template: 'https://127.0.0.1/pr-{prNumber}' }),
    ).toBeNull();
  });

  it('preserves template origin when branch contains URL authority characters', () => {
    const out = inferPreviewUrl({
      event: prEvent(VALID_SHA, 'attacker.com#@x'),
      template: 'https://{branch}.preview.example.com',
    });
    expect(out).toEqual({
      url: 'https://attacker-com-x.preview.example.com',
      source: 'template',
    });
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
    rememberPreviewUrl('acme', 'web', VALID_SHA, {
      url: 'https://cached.vercel.app',
      source: 'vercel-status',
    });
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;
    globalThis.fetch = stubPublicDnsFetch(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/run')) {
        sentBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ id: 'run_x' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    try {
      const body = JSON.stringify(prEvent(VALID_SHA));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
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
    globalThis.fetch = stubPublicDnsFetch(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/run')) {
        sentBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ id: 'run_y' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    try {
      const body = JSON.stringify(prEvent('1111111111111111111111111111111111111111'));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
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
    globalThis.fetch = stubPublicDnsFetch(async (url: string) => {
      if (String(url).includes('/v1/run')) runCalled = true;
      return new Response('{}', { status: 200 });
    });
    try {
      const body = JSON.stringify(prEvent('2222222222222222222222222222222222222222'));
      const res = await postWebhook(app, 'pull_request', body, {
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
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
    globalThis.fetch = stubPublicDnsFetch(async (url: string, init?: RequestInit) => {
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
    });
    try {
      const body = JSON.stringify(prEvent('3333333333333333333333333333333333333333'));
      const res = await postWebhook(app, 'pull_request', body, {
        ...APP_ENV,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
      });
      const json = await res.json();
      expect(json.triggered).toBe(false);
      expect(runUrl).toBeNull();
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('triggers the pending PR run when deployment_status arrives after pull_request', async () => {
    const app = createGitHubApp();
    const orig = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;
    const deferredSha = '4444444444444444444444444444444444444444';
    globalThis.fetch = stubPublicDnsFetch(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'ghs_test' }), { status: 201 });
      }
      if (u.includes('/check-runs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 888 }), { status: 201 });
      }
      if (u.includes('/contents/')) return new Response('no', { status: 404 });
      if (u.includes('/v1/run')) {
        sentBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ id: 'run_deferred' }), { status: 202 });
      }
      throw new Error(`Unhandled fetch: ${u}`);
    });
    try {
      const env = {
        ...APP_ENV,
        FRONTGUARD_API_URL: 'https://api.frontguard.dev',
        FRONTGUARD_API_KEY: 'fg_x',
        FRONTGUARD_SINGLE_TENANT_INSTALLATION_ID: '123',
      };
      // 1. pull_request arrives first — no preview URL yet
      const prRes = await postWebhook(app, 'pull_request', JSON.stringify(prEvent(deferredSha)), env);
      const prJson = await prRes.json();
      expect(prJson.triggered).toBe(false);
      expect(prJson.checkRunId).toBe(888);

      // 2. deployment_status arrives later for the same commit (or branch)
      const depBody = JSON.stringify({
        deployment: { sha: deferredSha, ref: 'feature', environment: 'Deploy Preview' },
        deployment_status: {
          state: 'success',
          environment_url: 'https://deploy-preview-7--app.netlify.app',
        },
        repository: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
      });
      const depRes = await postWebhook(app, 'deployment_status', depBody, env);
      const depJson = await depRes.json();
      expect(depJson.cached).toBe(true);
      expect(depJson.triggered).toBe(true);
      expect(depJson.runId).toBe('run_deferred');
      expect(depJson.checkRunId).toBe(888);
      expect(sentBody).toMatchObject({
        url: 'https://deploy-preview-7--app.netlify.app',
        previewSource: 'netlify-deployment',
        projectId: 'acme/web',
        checkRunId: 888,
        github: {
          owner: 'acme',
          repo: 'web',
          commitSha: deferredSha,
          prNumber: 7,
        },
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});
