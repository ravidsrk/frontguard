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

import type { PullRequestEvent } from './webhook.js';

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
 * Detection is heuristic — GitHub does not stamp the provider on the event,
 * so we look at the environment label and the URL host. Returns `null` when
 * the status is not for a preview deployment we can map.
 */
export function classifyDeploymentStatus(
  event: DeploymentStatusEvent,
): 'netlify' | 'cloudflare-pages' | 'vercel' | null {
  const env = (event.deployment.environment ?? '').toLowerCase();
  const url = (event.deployment_status.environment_url ?? event.deployment_status.target_url ?? '')
    .toLowerCase();

  // Exclude production deployments outright — they are not PR previews.
  if (env === 'production') return null;

  if (/\.netlify\.app(\/|$)/.test(url) || env.includes('netlify')) return 'netlify';
  if (/\.pages\.dev(\/|$)/.test(url) || env.includes('cloudflare')) return 'cloudflare-pages';
  if (/\.vercel\.app(\/|$)/.test(url) || env.includes('vercel')) return 'vercel';
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
 * Only succeeds when the status is `success` and the context maps to a
 * supported provider (currently Vercel).
 */
export function previewUrlFromCommitStatus(event: CommitStatusEvent): InferredPreviewUrl | null {
  if (event.state !== 'success') return null;
  const provider = classifyCommitStatus(event);
  if (!provider) return null;
  const url = event.target_url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return { url, source: 'vercel-status' };
}

/**
 * Extracts a preview URL from a `deployment_status` event.
 *
 * Only succeeds when the status is `success` and points at a preview-style
 * URL we recognise (Netlify / Cloudflare Pages / Vercel preview).
 */
export function previewUrlFromDeploymentStatus(
  event: DeploymentStatusEvent,
): InferredPreviewUrl | null {
  if (event.deployment_status.state !== 'success') return null;
  const provider = classifyDeploymentStatus(event);
  if (!provider) return null;
  const url = (event.deployment_status.environment_url ?? event.deployment_status.target_url ?? '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const source =
    provider === 'netlify'
      ? 'netlify-deployment'
      : provider === 'cloudflare-pages'
        ? 'cloudflare-deployment'
        : 'vercel-deployment';
  return { url, source };
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

/**
 * Renders a preview URL template by substituting `{prNumber}`, `{owner}`,
 * `{repo}`, `{commitSha}`, `{commitShortSha}` and `{branch}` placeholders.
 *
 * Unknown tokens are left as-is so misconfigured templates fail loudly when
 * the URL is fetched, rather than silently producing a wrong host.
 *
 * @example
 * ```ts
 * renderPreviewUrlTemplate('https://pr-{prNumber}.preview.example.com', {
 *   owner: 'acme', repo: 'web', prNumber: 42, commitSha: 'deadbeefcafe', branch: 'feat/x',
 * });
 * // → 'https://pr-42.preview.example.com'
 * ```
 */
export function renderPreviewUrlTemplate(
  template: string,
  ctx: PreviewTemplateContext,
): string {
  const short = ctx.commitShortSha ?? ctx.commitSha.slice(0, 7);
  return template.replace(TEMPLATE_TOKEN, (_, token: string) => {
    switch (token) {
      case 'owner':
        return ctx.owner;
      case 'repo':
        return ctx.repo;
      case 'pr':
      case 'prNumber':
        return String(ctx.prNumber);
      case 'sha':
      case 'commitSha':
        return ctx.commitSha;
      case 'shortSha':
      case 'commitShortSha':
        return short;
      case 'branch':
        return ctx.branch;
      default:
        return `{${token}}`;
    }
  });
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
 * 2. A user-supplied template.
 * 3. `null` — caller can then fall back to its previous default, or skip the
 *    run rather than test the github.com PR page (the original bug).
 */
export function inferPreviewUrl(opts: InferPreviewUrlOptions): InferredPreviewUrl | null {
  if (opts.observed) return opts.observed;
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
    if (/^https?:\/\//i.test(rendered)) {
      return { url: rendered, source: 'template' };
    }
  }
  return null;
}
