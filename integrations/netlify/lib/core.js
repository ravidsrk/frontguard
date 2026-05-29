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
 * @property {string} [apiUrl]        Frontguard Cloud API base URL.
 * @property {string} [apiKey]        Frontguard API key (prefer env FRONTGUARD_API_KEY).
 * @property {string[]} [routes]      Routes to screenshot. Defaults to ['/'].
 * @property {boolean} [failBuild]    If true, a failing run fails the Netlify build.
 * @property {boolean} [productionToo] If true, also run on production context.
 * @property {string} [githubToken]   Token to post results to the PR (optional).
 */

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
 * - `deploy-preview` and `branch-deploy` always run (preview URLs).
 * - `production` only runs when `inputs.productionToo` is set.
 * - Prefers `DEPLOY_PRIME_URL`, falling back to `DEPLOY_URL`, then `URL`.
 *
 * @param {NetlifyContext} ctx
 * @param {PluginInputs} [inputs]
 * @returns {RunDecision}
 */
export function decideRun(ctx, inputs = {}) {
  const context = ctx.CONTEXT ?? 'deploy-preview';
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
 * Handles both `https://github.com/owner/repo` and
 * `git@github.com:owner/repo.git` forms. Returns null for non-GitHub URLs.
 *
 * @param {string | undefined} repositoryUrl
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubRepo(repositoryUrl) {
  if (!repositoryUrl) return null;
  const m =
    repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i) ?? null;
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Triggers a Frontguard run via the Cloud API.
 *
 * @param {Object} opts
 * @param {string} opts.apiUrl
 * @param {string} opts.apiKey
 * @param {string} opts.previewUrl
 * @param {string[]} [opts.routes]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ id: string, statusUrl?: string }>}
 */
export async function triggerRun(opts, fetchImpl = fetch) {
  const res = await fetchImpl(`${opts.apiUrl}/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      url: opts.previewUrl,
      routes: (opts.routes ?? ['/']).map((path) => ({ path })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Frontguard run request failed: ${res.status}`);
  }
  return /** @type {Promise<{ id: string, statusUrl?: string }>} */ (res.json());
}

/**
 * Polls a run until it reaches a terminal status or the timeout elapses.
 *
 * @param {Object} opts
 * @param {string} opts.apiUrl
 * @param {string} opts.apiKey
 * @param {string} opts.runId
 * @param {number} [opts.timeoutMs]   Default 120000.
 * @param {number} [opts.intervalMs]  Default 3000.
 * @param {typeof fetch} [fetchImpl]
 * @param {(ms: number) => Promise<void>} [sleepImpl]
 * @returns {Promise<{ status: string, results?: unknown, reportUrl?: string | null }>}
 */
export async function pollRun(opts, fetchImpl = fetch, sleepImpl = defaultSleep) {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const intervalMs = opts.intervalMs ?? 3000;
  const deadline = Date.now() + timeoutMs;
  const terminal = new Set(['passed', 'failed', 'error', 'completed']);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetchImpl(`${opts.apiUrl}/v1/runs/${opts.runId}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    if (res.ok) {
      const data = /** @type {any} */ (await res.json());
      if (terminal.has(data.status)) return data;
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
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function postPrComment(opts, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${opts.owner}/${opts.repo}/issues/${opts.prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'frontguard-netlify-plugin',
        },
        body: JSON.stringify({ body: opts.body }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Renders a Markdown summary of a run for posting to a PR.
 *
 * @param {{ status: string, results?: any, reportUrl?: string | null }} run
 * @param {string} previewUrl
 * @returns {string}
 */
export function renderSummary(run, previewUrl) {
  const passed = run.status === 'passed' || run.status === 'completed';
  const icon = passed ? '✅' : '⚠️';
  const lines = [
    `## ${icon} Frontguard visual check`,
    '',
    `**Preview:** ${previewUrl}`,
    `**Status:** \`${run.status}\``,
  ];
  const r = run.results;
  if (r && typeof r === 'object') {
    if (typeof r.total === 'number') lines.push(`**Screenshots:** ${r.total}`);
    if (typeof r.changed === 'number') lines.push(`**Changed:** ${r.changed}`);
  }
  if (run.reportUrl) lines.push('', `[View full report](${run.reportUrl})`);
  return lines.join('\n');
}

/**
 * Determines whether a finished run represents a failure (for fail-build).
 *
 * @param {{ status: string, results?: any }} run
 * @returns {boolean}
 */
export function isFailingRun(run) {
  if (run.status === 'failed' || run.status === 'error') return true;
  const r = run.results;
  if (r && typeof r === 'object' && typeof r.changed === 'number') return r.changed > 0;
  return false;
}
