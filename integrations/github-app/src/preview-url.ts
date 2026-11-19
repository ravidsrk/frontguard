/**
 * Preview URL inference for the Frontguard GitHub App.
 *
 * Forwarding `pull_request.html_url` to the Cloud API is a known foot-gun
 * (P0-8): it points at the PR page on github.com, not at the deployed
 * preview that visual-regression should actually be tested against.
 *
 * This module turns the four ways PRs typically expose a preview into a
 * single normalised result the handler can forward:
 *
 * 1. **Vercel** publishes a `commit_status` with `context` matching `vercel/*`
 *    or `Vercel` and `target_url` pointing at the deployment.
 * 2. **Netlify** publishes a `deployment_status` event with the preview URL in
 *    `deployment_status.target_url` (older payloads also place it on
 *    `deployment.payload.web_url`).
 * 3. **Cloudflare Pages** publishes a `deployment_status` with `environment`
 *    matching `preview` / `Preview` and the URL in `environment_url`.
 * 4. **Template fallback** — when no provider event is observed, a
 *    user-supplied template (e.g. `https://pr-{prNumber}.preview.example.com`)
 *    is rendered with the PR's metadata.
 *
 * The functions here are intentionally side-effect-free: they consume parsed
 * event payloads (or a template + context) and return the inferred URL.
 *
 * @module preview-url
 */

import {
  isPrivateOrLoopbackHost,
  assertSafeRenderTarget,
  type HostResolver,
} from '@frontguard/cloud-api/render-target';
import type { PullRequestEvent } from './webhook.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validates that a candidate preview URL is a well-formed `https:` URL with no
 * embedded credentials, whitespace, control characters, or private/loopback host.
 */
export function parseSafePreviewUrl(raw: string | null | undefined): URL | null {
  if (typeof raw !== 'string') return null;
  if (CONTROL_CHARS.test(raw)) return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname || isPrivateOrLoopbackHost(parsed.hostname)) return null;
  return parsed;
}

/**
 * Async defense-in-depth SSRF verification (HTTPS + host literal + DNS check).
 */
export async function assertSafePreviewUrl(
  url: string,
  opts?: { resolveHost?: HostResolver },
): Promise<void> {
  if (!parseSafePreviewUrl(url)) {
    throw new Error('Preview URL must be a valid public https: URL');
  }
  await assertSafeRenderTarget(url, opts);
}

/** Returns true when `hostname` is a strict subdomain of `baseDomain`. */
function isSubdomainOf(hostname: string, baseDomain: string): boolean {
  const host = hostname.toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  return host.length > suffix.length && host.endsWith(suffix);
}

/** A GitHub `commit_status` webhook payload (subset used here). */
export interface CommitStatusEvent {
  /** Repository owner + name (e.g. `acme/web`). */
  name?: string;
  /** Commit SHA the status was posted against. */
  sha: string;
  /** Status state — only `success` indicates a usable preview. */
  state: 'pending' | 'success' | 'failure' | 'error';
  /** GitHub status `context` — identifies the source (e.g. `Vercel`). */
  context: string;
  /** URL the status points at — for previews this is the deployment. */
  target_url?: string | null;
  /** Convenience field on the payload — present on some hosts. */
  description?: string | null;
  /** Repository identification. */
  repository?: { name: string; owner: { login: string }; full_name: string };
  /** Installation that produced the event. */
  installation?: { id: number };
}

/** A GitHub `deployment_status` webhook payload (subset used here). */
export interface DeploymentStatusEvent {
  action?: string;
  /** The deployment the status is attached to. */
  deployment: {
    sha: string;
    ref?: string;
    /** GitHub Deployments environment label (e.g. `Preview`, `production`). */
    environment?: string;
    /** Provider-supplied payload — Netlify / CF sometimes nest data here. */
    payload?: unknown;
  };
  /** The status itself. */
  deployment_status: {
    state: 'pending' | 'in_progress' | 'success' | 'failure' | 'error' | 'queued' | 'inactive';
    /** Public URL the deployment is served from (Vercel/Netlify legacy). */
    target_url?: string | null;
    /** Public URL of the environment (Cloudflare / new GitHub). */
    environment_url?: string | null;
    /** Free-form description some providers populate with the preview URL. */
    description?: string | null;
  };
  repository?: { name: string; owner: { login: string }; full_name: string };
  installation?: { id: number };
}

/**
 * Identifies the deployment provider for a `commit_status` payload.
 * Returns `null` when the status was not posted by a recognised provider.
 */
export function classifyCommitStatus(event: CommitStatusEvent): 'vercel' | null {
  const ctx = (event.context ?? '').toLowerCase();
  if (ctx === 'vercel' || ctx.startsWith('vercel/') || ctx.startsWith('vercel –')) {
    return 'vercel';
  }
  return null;
}

/**
 * Identifies the deployment provider for a `deployment_status` payload.
 *
 * Matches strictly against the parsed `URL.hostname` of the validated `https:`
 * deployment URL (never substrings of the path or environment label) so
 * arbitrary hosts or SSRF targets cannot spoof a recognised provider.
 */
export function classifyDeploymentStatus(
  event: DeploymentStatusEvent,
): 'netlify' | 'cloudflare-pages' | 'vercel' | null {
  const env = (event.deployment.environment ?? '').trim().toLowerCase();
  // Exclude production deployments outright — they are not PR previews.
  if (env === 'production') return null;

  const rawUrl = (event.deployment_status.environment_url ?? event.deployment_status.target_url ?? '').trim();
  const parsed = parseSafePreviewUrl(rawUrl);
  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();
  if (isSubdomainOf(host, 'netlify.app')) return 'netlify';
  if (isSubdomainOf(host, 'pages.dev')) return 'cloudflare-pages';
  if (isSubdomainOf(host, 'vercel.app')) return 'vercel';
  return null;
}

/** Outcome of preview-URL inference. */
export interface InferredPreviewUrl {
  /** The URL Frontguard should test against. */
  url: string;
  /** Where the URL came from — useful for logging and tests. */
  source: 'vercel-status' | 'netlify-deployment' | 'cloudflare-deployment' | 'vercel-deployment' | 'template';
}

/**
 * Extracts a preview URL from a `commit_status` event.
 *
 * Only succeeds when the status is `success`, the context maps to a supported
 * provider (currently Vercel), and `target_url` is a validated `https:` URL
 * hosted on `*.vercel.app` (not a private/loopback or arbitrary third-party host).
 */
export function previewUrlFromCommitStatus(event: CommitStatusEvent): InferredPreviewUrl | null {
  if (event.state !== 'success') return null;
  const provider = classifyCommitStatus(event);
  if (!provider) return null;
  const rawUrl = event.target_url?.trim();
  const parsed = parseSafePreviewUrl(rawUrl);
  if (!parsed) return null;
  if (!isSubdomainOf(parsed.hostname, 'vercel.app')) return null;
  return { url: rawUrl!, source: 'vercel-status' };
}

/**
 * Extracts a preview URL from a `deployment_status` event.
 *
 * Only succeeds when the status is `success` and points at a validated `https:`
 * preview host we recognise (`*.netlify.app`, `*.pages.dev`, `*.vercel.app`).
 */
export function previewUrlFromDeploymentStatus(
  event: DeploymentStatusEvent,
): InferredPreviewUrl | null {
  if (event.deployment_status.state !== 'success') return null;
  const provider = classifyDeploymentStatus(event);
  if (!provider) return null;
  const rawUrl = (event.deployment_status.environment_url ?? event.deployment_status.target_url ?? '').trim();
  if (!parseSafePreviewUrl(rawUrl)) return null;
  const source =
    provider === 'netlify'
      ? 'netlify-deployment'
      : provider === 'cloudflare-pages'
        ? 'cloudflare-deployment'
        : 'vercel-deployment';
  return { url: rawUrl, source };
}

/** Context available when rendering a preview URL template. */
export interface PreviewTemplateContext {
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  /** Short (7-character) SHA — convenience placeholder. */
  commitShortSha?: string;
  branch: string;
}

/** Tokens recognised in a preview URL template. */
const TEMPLATE_TOKEN = /\{(owner|repo|prNumber|pr|commitSha|sha|commitShortSha|shortSha|branch)\}/g;
const TEMPLATE_SENTINEL = 'fgplaceholder';

/**
 * Slugifies a branch name (or label) into a safe RFC-1123 DNS label so branch
 * names containing `.`, `@`, `/`, `:`, `?`, or `#` cannot redirect URL authority.
 */
export function slugifyDnsLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

function sanitizeTemplateToken(token: string, ctx: PreviewTemplateContext): string {
  const short = ctx.commitShortSha ?? ctx.commitSha.slice(0, 7);
  switch (token) {
    case 'owner':
      return slugifyDnsLabel(ctx.owner);
    case 'repo':
      return slugifyDnsLabel(ctx.repo);
    case 'pr':
    case 'prNumber':
      return Number.isInteger(ctx.prNumber) && ctx.prNumber > 0 ? String(ctx.prNumber) : '';
    case 'sha':
    case 'commitSha':
      return ctx.commitSha.toLowerCase().replace(/[^0-9a-f]/g, '');
    case 'shortSha':
    case 'commitShortSha':
      return short.toLowerCase().replace(/[^0-9a-f]/g, '');
    case 'branch':
      return slugifyDnsLabel(ctx.branch);
    default:
      return `{${token}}`;
  }
}

/**
 * Renders a preview URL template by substituting `{prNumber}`, `{owner}`,
 * `{repo}`, `{commitSha}`, `{commitShortSha}` and `{branch}` placeholders.
 *
 * `{branch}`, `{owner}`, and `{repo}` are slugified into safe DNS labels so
 * attacker-controlled branch names cannot inject authority delimiters (`@`, `/`,
 * `.`, `:`, `?`, `#`). Unknown tokens are left as-is so misconfigured templates
 * fail validation cleanly.
 */
export function renderPreviewUrlTemplate(
  template: string,
  ctx: PreviewTemplateContext,
): string {
  return template.replace(TEMPLATE_TOKEN, (_, token: string) => sanitizeTemplateToken(token, ctx));
}

/**
 * Verifies that a rendered template URL preserves the template's scheme, port,
 * and static origin/host labels (preventing authority redirection), contains no
 * unresolved `{...}` placeholders, and passes the `https:` + SSRF host check.
 */
export function isValidRenderedTemplateUrl(template: string, rendered: string): boolean {
  if (/\{[^}]+\}/.test(rendered)) return false;
  const sentinelStr = template.replace(TEMPLATE_TOKEN, TEMPLATE_SENTINEL);
  const templateUrl = parseSafePreviewUrl(sentinelStr);
  const renderedUrl = parseSafePreviewUrl(rendered);
  if (!templateUrl || !renderedUrl) return false;
  if (renderedUrl.protocol !== templateUrl.protocol) return false;
  if (renderedUrl.port !== templateUrl.port) return false;

  const templateHost = templateUrl.hostname.toLowerCase();
  const renderedHost = renderedUrl.hostname.toLowerCase();
  if (!templateHost.includes(TEMPLATE_SENTINEL)) {
    return renderedUrl.origin === templateUrl.origin;
  }

  const templateLabels = templateHost.split('.');
  const renderedLabels = renderedHost.split('.');
  if (templateLabels.length !== renderedLabels.length) return false;

  let hasStaticLabel = false;
  for (let i = 0; i < templateLabels.length; i++) {
    const tLabel = templateLabels[i]!;
    const rLabel = renderedLabels[i]!;
    if (!rLabel || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(rLabel)) return false;
    if (tLabel.includes(TEMPLATE_SENTINEL)) {
      const pattern = new RegExp(
        `^${tLabel
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replaceAll(TEMPLATE_SENTINEL, '[a-z0-9-]+')}$`,
      );
      if (!pattern.test(rLabel)) return false;
    } else {
      hasStaticLabel = true;
      if (tLabel !== rLabel) return false;
    }
  }
  return hasStaticLabel;
}

/** Inputs for inferring a preview URL at PR time. */
export interface InferPreviewUrlOptions {
  /** The PR event we received. */
  event: PullRequestEvent;
  /**
   * Optional user-supplied URL template. Wins over `pull_request.html_url`
   * but loses to a provider event observed earlier on the same commit.
   */
  template?: string | null;
  /**
   * Optional cache of provider-derived URLs keyed by `commitSha`. The
   * deployment-status / commit-status handlers populate this before a PR is
   * (re-)processed so we can return the real preview immediately.
   */
  observed?: InferredPreviewUrl | null;
}

/**
 * Resolves the URL Frontguard should test against for a PR event.
 *
 * Order of preference:
 * 1. A provider-observed URL (Vercel / Netlify / Cloudflare).
 * 2. A user-supplied template (validated against template origin + SSRF rules).
 * 3. `null` — caller can then wait for a deployment event or skip the run.
 */
export function inferPreviewUrl(opts: InferPreviewUrlOptions): InferredPreviewUrl | null {
  if (opts.observed) {
    if (!parseSafePreviewUrl(opts.observed.url)) return null;
    return opts.observed;
  }
  const template = opts.template?.trim();
  if (template) {
    const ctx: PreviewTemplateContext = {
      owner: opts.event.repository.owner.login,
      repo: opts.event.repository.name,
      prNumber: opts.event.number,
      commitSha: opts.event.pull_request.head.sha,
      branch: opts.event.pull_request.head.ref,
    };
    const rendered = renderPreviewUrlTemplate(template, ctx);
    if (isValidRenderedTemplateUrl(template, rendered)) {
      return { url: rendered, source: 'template' };
    }
  }
  return null;
}
