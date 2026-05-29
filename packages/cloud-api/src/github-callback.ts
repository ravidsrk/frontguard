/**
 * GitHub Check Run completion callback (Tasks 7.1/7.2 wiring).
 *
 * When a run carries GitHub linkage (forwarded by the GitHub App / Vercel
 * integrations), this notifies the GitHub App integration to complete the
 * originating Check Run with the run's results. The integration owns the
 * GitHub App credentials and the actual Checks API call; we authenticate with
 * a shared bearer secret.
 *
 * @module github-callback
 */

import type { Bindings } from './db/factory.js';
import type { Run } from './types.js';

/** Summarised regression counts derived from a run's results. */
export interface RunOutcome {
  regressions: number;
  warnings: number;
  total: number;
  conclusion: 'success' | 'failure' | 'neutral';
}

/**
 * Derives a Check Run conclusion from a run's status and results.
 * - failed run -> neutral (the tool errored; not the user's fault)
 * - any regression -> failure
 * - otherwise -> success
 */
export function deriveOutcome(run: Run): RunOutcome {
  const results = run.results ?? [];
  const total = results.length;
  const regressions = results.filter((r) => r.status === 'regression' || r.status === 'changed').length;
  const warnings = results.filter((r) => r.status === 'warning').length;
  let conclusion: RunOutcome['conclusion'];
  if (run.status === 'failed') conclusion = 'neutral';
  else if (regressions > 0) conclusion = 'failure';
  else conclusion = 'success';
  return { regressions, warnings, total, conclusion };
}

/**
 * Posts the run's outcome to the GitHub App completion endpoint.
 * No-ops (returns false) when linkage or configuration is incomplete.
 */
export async function completeCheckRun(
  env: Bindings & { GITHUB_APP_URL?: string; FRONTGUARD_CALLBACK_SECRET?: string; PUBLIC_BASE_URL?: string },
  run: Run,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!run.github || run.checkRunId == null || run.installationId == null) return false;
  if (!env.GITHUB_APP_URL || !env.FRONTGUARD_CALLBACK_SECRET || !run.github.commitSha) return false;

  const outcome = deriveOutcome(run);
  const detailsUrl = env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/v1/reports/${run.id}` : undefined;
  const summary =
    outcome.conclusion === 'failure'
      ? `Frontguard found ${outcome.regressions} visual regression(s) across ${outcome.total} snapshot(s).`
      : outcome.conclusion === 'neutral'
        ? `Frontguard run did not complete: ${run.error ?? 'unknown error'}.`
        : `Frontguard found no visual regressions across ${outcome.total} snapshot(s).`;

  const res = await fetchImpl(
    `${env.GITHUB_APP_URL.replace(/\/$/, '')}/runs/${run.checkRunId}/complete`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.FRONTGUARD_CALLBACK_SECRET}`,
      },
      body: JSON.stringify({
        owner: run.github.owner,
        repo: run.github.repo,
        commitSha: run.github.commitSha,
        installationId: run.installationId,
        conclusion: outcome.conclusion,
        summary,
        regressions: outcome.regressions,
        warnings: outcome.warnings,
        total: outcome.total,
        detailsUrl,
      }),
    },
  );
  return res.ok;
}
