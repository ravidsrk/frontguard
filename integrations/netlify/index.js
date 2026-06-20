/**
 * Frontguard Netlify Build Plugin (Task 8.3).
 *
 * Runs Frontguard visual-regression checks against the deploy preview URL on
 * every Netlify deploy. Results are posted to the originating GitHub PR when a
 * token is available.
 *
 * Lifecycle: runs in `onSuccess` (after the deploy is live, so the preview URL
 * is reachable). Configuration via `netlify.toml` `[[plugins]]` inputs or env:
 *
 *   [[plugins]]
 *     package = "@frontguard/netlify-plugin"
 *     [plugins.inputs]
 *       apiUrl = "https://your-cloud-api.example.com"
 *       routes = ["/", "/pricing"]
 *       failBuild = false
 *
 * Secrets (`FRONTGUARD_API_KEY`, optional `GITHUB_TOKEN`) come from the
 * Netlify site environment, never from `netlify.toml`.
 *
 * @module index
 */

import {
  decideRun,
  parseGitHubRepo,
  triggerRun,
  pollRun,
  postPrComment,
  renderSummary,
  isFailingRun,
} from './lib/core.js';

/**
 * @param {Object} args
 * @param {Record<string, any>} args.inputs   Plugin inputs from netlify.toml.
 * @param {Object} args.utils                 Netlify build utils (build.failBuild, etc.).
 * @param {Object} [args.constants]           Netlify constants (unused, reserved).
 */
export const onSuccess = async ({ inputs = {}, utils }) => {
  const log = (msg) => console.log(`[frontguard] ${msg}`);

  const ctx = {
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL,
    URL: process.env.URL,
    CONTEXT: process.env.CONTEXT,
    REVIEW_ID: process.env.REVIEW_ID,
    REPOSITORY_URL: process.env.REPOSITORY_URL,
    COMMIT_REF: process.env.COMMIT_REF,
    HEAD: process.env.HEAD,
  };

  const decision = decideRun(ctx, inputs);
  if (!decision.run) {
    log(`Skipped: ${decision.reason}`);
    return;
  }

  const apiUrl = inputs.apiUrl || process.env.FRONTGUARD_API_URL;
  const apiKey = inputs.apiKey || process.env.FRONTGUARD_API_KEY;
  if (!apiUrl || !apiKey) {
    log('FRONTGUARD_API_URL / FRONTGUARD_API_KEY not set — skipping run.');
    return;
  }

  log(`Testing ${decision.previewUrl} (${decision.reason})`);

  let run;
  try {
    const triggered = await triggerRun({
      apiUrl,
      apiKey,
      previewUrl: decision.previewUrl,
      routes: inputs.routes,
    });
    log(`Run queued: ${triggered.id}`);
    run = await pollRun({ apiUrl, apiKey, runId: triggered.id });
    log(`Run finished: ${run.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (inputs.failBuild) {
      utils.build.failBuild(`Frontguard run failed: ${message}`);
    } else {
      log(`Run error (non-blocking): ${message}`);
    }
    return;
  }

  // Best-effort PR comment.
  const githubToken = inputs.githubToken || process.env.GITHUB_TOKEN;
  const repo = parseGitHubRepo(ctx.REPOSITORY_URL);
  if (githubToken && repo && decision.reviewId) {
    const ok = await postPrComment({
      token: githubToken,
      owner: repo.owner,
      repo: repo.repo,
      prNumber: decision.reviewId,
      body: renderSummary(run, decision.previewUrl),
    });
    log(ok ? 'Posted results to PR.' : 'Could not post PR comment (non-blocking).');
  }

  if (inputs.failBuild && isFailingRun(run)) {
    utils.build.failBuild('Frontguard detected visual changes. Review the report before deploying.');
  }
};

export default { onSuccess };
