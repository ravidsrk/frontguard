/**
 * Pure, testable core for the Frontguard Netlify build plugin (Task 8.3).
 *
 * Netlify runs build plugins through Node directly (no TypeScript build step),
 * so this is plain ESM JavaScript with JSDoc types. The lifecycle wiring lives
 * in `index.js`; all decision/IO logic lives here so it can be unit-tested.
 *
 * @module core
 */

/**
 * @typedef {Object} NetlifyContext
 * @property {string} [DEPLOY_PRIME_URL]  Permalink to this specific deploy (preview).
 * @property {string} [DEPLOY_URL]         Unique deploy URL.
 * @property {string} [URL]                Production URL.
 * @property {string} [CONTEXT]            'production' | 'deploy-preview' | 'branch-deploy'.
 * @property {string} [REVIEW_ID]          PR number for deploy previews.
 * @property {string} [REPOSITORY_URL]     e.g. https://github.com/owner/repo.
 * @property {string} [COMMIT_REF]         Head commit SHA.
 * @property {string} [HEAD]               Head branch name.
 */

/**
 * @typedef {Object} PluginInputs
 * @property {string} [apiUrl]        Frontguard Cloud API base URL (prefer env FRONTGUARD_API_URL).
 * @property {string} [apiKey]        Frontguard API key (prefer env FRONTGUARD_API_KEY).
 * @property {string[]} [routes]      Routes to screenshot. Defaults to ['/'].
 * @property {boolean} [failBuild]    If true, a failing run fails the Netlify build.
 * @property {boolean} [productionToo] If true, also run on production context.
 * @property {string} [githubToken]   Token to post results to the PR (optional; prefer env GITHUB_TOKEN).
 * @property {string} [projectId]     Optional project ID (prefer env FRONTGUARD_PROJECT_ID).
 */

const DEFAULT_TRIGGER_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_GITHUB_TIMEOUT_MS = 15_000;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Returns true if `hostname` is a loopback address where plain HTTP is
 * acceptable for local development and tests.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Validates and normalizes the Frontguard Cloud API base URL.
 *
 * Enforces `https:` (except loopback hosts), rejects embedded credentials,
 * control characters, query strings, and fragments, and strips trailing slashes.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeApiUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw new Error('apiUrl must be a string');
  }
  if (CONTROL_CHARS.test(rawUrl)) {
    throw new Error('apiUrl must not contain control characters');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('apiUrl must be a non-empty URL');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('apiUrl is not a valid URL');
  }
  if (parsed.username || parsed.password) {
    throw new Error('apiUrl must not contain embedded credentials');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('apiUrl must not contain a query string or fragment');
  }
  const isHttps = parsed.protocol === 'https:';
  const isLocalHttp = parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  if (!isHttps && !isLocalHttp) {
    throw new Error('apiUrl must use https: (http: is only allowed for loopback hosts)');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

/**
 * Resolves the Cloud API base URL, always preferring the trusted site env var
 * `FRONTGUARD_API_URL` over repo-controlled `netlify.toml` `inputs.apiUrl`.
 *
 * Refuses `inputs.apiUrl` overrides when `FRONTGUARD_API_URL` is configured
 * (critical in `deploy-preview` contexts so PR branches cannot redirect
 * `FRONTGUARD_API_KEY` to an attacker-controlled server).
 *
 * @param {NetlifyContext} ctx
 * @param {PluginInputs} [inputs]
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ apiUrl: string | undefined, warning?: string }}
 */
export function resolveApiUrl(ctx, inputs = {}, env = process.env) {
  const envUrl = typeof env.FRONTGUARD_API_URL === 'string' ? env.FRONTGUARD_API_URL.trim() : '';
  const inputUrl = typeof inputs.apiUrl === 'string' ? inputs.apiUrl.trim() : '';

  if (envUrl) {
    const normalizedEnv = normalizeApiUrl(envUrl);
    let warning;
    if (inputUrl) {
      let inputMatches = false;
      try {
        inputMatches = normalizeApiUrl(inputUrl) === normalizedEnv;
      } catch {
        inputMatches = false;
      }
      if (!inputMatches) {
        warning =
          ctx.CONTEXT === 'deploy-preview'
            ? 'Refusing netlify.toml inputs.apiUrl override in deploy-preview context because FRONTGUARD_API_URL is set.'
            : 'Ignoring netlify.toml inputs.apiUrl because FRONTGUARD_API_URL is set.';
      }
    }
    return { apiUrl: normalizedEnv, warning };
  }

  if (inputUrl) {
    return { apiUrl: normalizeApiUrl(inputUrl) };
  }

  return { apiUrl: undefined };
}

/**
 * @typedef {Object} RunDecision
 * @property {boolean} run            Whether to run Frontguard.
 * @property {string} reason          Human-readable explanation.
 * @property {string} [previewUrl]    Resolved URL to test.
 * @property {string} [reviewId]      PR number, if a deploy preview.
 */

/**
 * Decides whether the plugin should run for this Netlify context and resolves
 * the URL to test.
 *
 * Rules:
 * - When `CONTEXT` is undefined, never run. Netlify always sets `CONTEXT`
 *   during a real build, so a missing value means we are executing locally
 *   (or inside another tool's harness) and must do nothing (P2-9).
 * - `deploy-preview` and `branch-deploy` always run (preview URLs).
 * - `production` only runs when `inputs.productionToo` is set.
 * - Prefers `DEPLOY_PRIME_URL`, falling back to `DEPLOY_URL`, then `URL`.
 *
 * @param {NetlifyContext} ctx
 * @param {PluginInputs} [inputs]
 * @returns {RunDecision}
 */
export function decideRun(ctx, inputs = {}) {
  if (!ctx.CONTEXT) {
    return { run: false, reason: 'No Netlify CONTEXT set (not running inside a Netlify build)' };
  }
  const context = ctx.CONTEXT;
  const previewUrl = ctx.DEPLOY_PRIME_URL || ctx.DEPLOY_URL || ctx.URL;

  if (context === 'production' && !inputs.productionToo) {
    return { run: false, reason: 'Skipping production context (set productionToo to enable)' };
  }
  if (!previewUrl) {
    return { run: false, reason: 'No deploy URL available (DEPLOY_PRIME_URL/DEPLOY_URL/URL all empty)' };
  }
  return {
    run: true,
    reason: `Running on ${context} deploy`,
    previewUrl,
    reviewId: ctx.REVIEW_ID || undefined,
  };
}

/**
 * Parses `owner` and `repo` from a Netlify `REPOSITORY_URL`.
 *
 * Handles `https://github.com/owner/repo`, `https://github.com/owner/my.repo.git`,
 * `git@github.com:owner/my.repo.git`, and `ssh://git@github.com/owner/repo.git`.
 * Returns null for non-GitHub URLs or unsafe path segments.
 *
 * @param {string | undefined} repositoryUrl
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubRepo(repositoryUrl) {
  if (typeof repositoryUrl !== 'string' || !repositoryUrl) return null;
  const trimmed = repositoryUrl.trim();
  const m =
    trimmed.match(
      /^(?:https?:\/\/(?:[^/@]+@)?|ssh:\/\/git@|git@)github\.com[/:]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i,
    ) ?? null;
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/**
 * Triggers a Frontguard run via the Cloud API.
 *
 * @param {Object} opts
 * @param {string} opts.apiUrl
 * @param {string} opts.apiKey
 * @param {string} opts.previewUrl
 * @param {string[]} [opts.routes]
 * @param {string} [opts.projectId]
 * @param {number} [opts.requestTimeoutMs]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, statusUrl?: string }>}
 */
export async function triggerRun(opts, fetchImpl = fetch) {
  const baseUrl = normalizeApiUrl(opts.apiUrl);
  const res = await fetchImpl(`${baseUrl}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      url: opts.previewUrl,
      routes: (opts.routes ?? ['/']).map((path) => ({ path })),
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    }),
    signal: AbortSignal.timeout(opts.requestTimeoutMs ?? DEFAULT_TRIGGER_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Frontguard run request failed: ${res.status}`);
  }
  return /** @type {Promise<{ id: string, statusUrl?: string }>} */ (res.json());
}

/**
 * Polls a run until it reaches a terminal status or the timeout elapses.
 *
 * Cloud-api `Run.status` is `queued | running | completed | failed`, so those
 * are the terminal values we look for. `passed` and `error` are kept in the
 * set for forward compatibility — the cloud API has used both labels at
 * different times.
 *
 * Fails fast on permanent 4xx errors (other than 408/429) instead of spinning
 * until `timeoutMs`.
 *
 * @param {Object} opts
 * @param {string} opts.apiUrl
 * @param {string} opts.apiKey
 * @param {string} opts.runId
 * @param {number} [opts.timeoutMs]   Default 120000.
 * @param {number} [opts.intervalMs]  Default 3000.
 * @param {number} [opts.requestTimeoutMs] Per-request timeout. Default 15000.
 * @param {typeof fetch} [fetchImpl]
 * @param {(ms: number) => Promise<void>} [sleepImpl]
 * @returns {Promise<{ status: string, results?: Array<{ status: string, route?: string, viewport?: number, diffPercentage?: number, classification?: string }> | null, reportUrl?: string | null }>}
 */
export async function pollRun(opts, fetchImpl = fetch, sleepImpl = defaultSleep) {
  const baseUrl = normalizeApiUrl(opts.apiUrl);
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 3000;
  const requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_POLL_REQUEST_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const terminal = new Set(['passed', 'failed', 'error', 'completed']);
  const runUrl = `${baseUrl}/v1/runs/${encodeURIComponent(opts.runId)}`;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetchImpl(runUrl, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (res.ok) {
      const data = /** @type {any} */ (await res.json());
      if (terminal.has(data.status)) return data;
    } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new Error(`Frontguard run poll failed: ${res.status}`);
    }
    if (Date.now() >= deadline) {
      return { status: 'timeout' };
    }
    await sleepImpl(intervalMs);
  }
}

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Posts a results comment to a GitHub PR. Best-effort; returns false on any
 * failure rather than throwing (build plugins should not crash on comment IO).
 *
 * @param {Object} opts
 * @param {string} opts.token
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} opts.prNumber
 * @param {string} opts.body  Markdown comment body.
 * @param {number} [opts.requestTimeoutMs]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function postPrComment(opts, fetchImpl = fetch) {
  const prNumber = String(opts.prNumber ?? '').trim();
  if (!/^\d+$/.test(prNumber)) return false;
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(opts.owner)}/${encodeURIComponent(opts.repo)}/issues/${encodeURIComponent(prNumber)}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'frontguard-netlify-plugin',
        },
        body: JSON.stringify({ body: opts.body }),
        signal: AbortSignal.timeout(opts.requestTimeoutMs ?? DEFAULT_GITHUB_TIMEOUT_MS),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Counts results by category from a cloud-api `Run.results` array.
 *
 * Mirrors the cloud-api convention (see github-callback.ts:deriveOutcome):
 *   - `regression` and `changed` are visual regressions (failure-worthy).
 *   - `failed` would be a per-result error (treated as a failure too).
 *   - `warning` is a soft warning, surfaced but not a failure.
 *   - `passed` and `new_baseline` are clean outcomes.
 *
 * @param {Array<{ status?: string }> | null | undefined} results
 * @returns {{ total: number, regressions: number, warnings: number, failed: number, passed: number }}
 */
export function summarizeResults(results) {
  const summary = { total: 0, regressions: 0, warnings: 0, failed: 0, passed: 0 };
  if (!Array.isArray(results)) return summary;
  summary.total = results.length;
  for (const r of results) {
    const s = r && typeof r === 'object' ? r.status : undefined;
    if (s === 'regression' || s === 'changed') summary.regressions += 1;
    else if (s === 'warning') summary.warnings += 1;
    else if (s === 'failed') summary.failed += 1;
    else if (s === 'passed' || s === 'new_baseline') summary.passed += 1;
  }
  return summary;
}

/**
 * Validates that a URL uses `https:` and encodes characters that could break
 * out of Markdown links or inject HTML in PR comments.
 *
 * @param {string | null | undefined} rawUrl
 * @returns {string | null}
 */
export function sanitizeMarkdownUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || CONTROL_CHARS.test(trimmed) || /\s/.test(trimmed)) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return parsed.href.replace(
    /[()[\]<>\\"`']/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/**
 * Escapes HTML and Markdown metacharacters so untrusted status strings cannot
 * break inline code spans or inject HTML/links into PR comments.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeMarkdownInline(value) {
  const str = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[`\\[\]()*_~|]/g, (ch) => `\\${ch}`);
}

/**
 * Renders a Markdown summary of a run for posting to a PR.
 *
 * @param {{ status: string, results?: Array<{ status?: string, route?: string, viewport?: number, diffPercentage?: number }> | null, reportUrl?: string | null }} run
 * @param {string} previewUrl
 * @returns {string}
 */
export function renderSummary(run, previewUrl) {
  // Derive the icon from isFailingRun so a completed-with-regressions run shows
  // ❌, consistent with the fail-build decision.
  const icon = isFailingRun(run) ? '❌' : '✅';
  const safePreview = sanitizeMarkdownUrl(previewUrl);
  const safeStatus = escapeMarkdownInline(run.status);
  const safeReport = sanitizeMarkdownUrl(run.reportUrl);
  const lines = [
    `## ${icon} Frontguard visual check`,
    '',
    safePreview ? `**Preview:** \`${safePreview}\`` : '**Preview:** _(invalid URL omitted)_',
    `**Status:** \`${safeStatus}\``,
  ];
  const counts = summarizeResults(run.results);
  if (counts.total > 0) {
    lines.push(`**Screenshots:** ${counts.total}`);
    if (counts.regressions > 0) lines.push(`**Regressions:** ${counts.regressions}`);
    if (counts.warnings > 0) lines.push(`**Warnings:** ${counts.warnings}`);
    if (counts.failed > 0) lines.push(`**Failed:** ${counts.failed}`);
  }
  if (safeReport) lines.push('', `[View full report](${safeReport})`);
  return lines.join('\n');
}

/**
 * Determines whether a finished run represents a failure (for fail-build).
 *
 * Cloud-api wire shape (from packages/cloud-api/src/types.ts):
 *   - top-level `status` ∈ `queued | running | completed | failed`
 *   - per-result `status` ∈ `passed | regression | changed | warning |
 *     new_baseline | failed` (failed is defensive; the API does not emit it
 *     today but the type is widened so we don't ignore it if it appears).
 *
 * Failure conditions:
 *   - top-level `failed` / `error` (cloud-api errored before producing results)
 *   - `timeout` (we gave up polling — surface as failure so failBuild flags it)
 *   - any individual result with `status: failed | regression | changed`
 *
 * @param {{ status: string, results?: Array<{ status?: string }> | null }} run
 * @returns {boolean}
 */
export function isFailingRun(run) {
  if (run.status === 'failed' || run.status === 'error' || run.status === 'timeout') return true;
  const counts = summarizeResults(run.results);
  return counts.regressions > 0 || counts.failed > 0;
}
