/**
 * Shared run-selection helpers for MCP tools.
 *
 * "Newest" always means the greatest `createdAt`, in both modes. A local
 * report is a single run, so the newest run there is the report's run.
 *
 * @module tools/_runs
 */

import type { CloudRun } from '../client/cloud.js';

/** `pr_id` value that selects the newest run instead of a PR or run id. */
export const LATEST_RUN = 'latest';

/** True when the run is linked to the given `owner/name` repository. */
export function matchesRepo(run: CloudRun, repo: string): boolean {
  if (!run.github) return false;
  return `${run.github.owner}/${run.github.repo}` === repo;
}

/** The run with the greatest `createdAt`, or null when there are none. */
export function newestRun(runs: readonly CloudRun[]): CloudRun | null {
  let newest: CloudRun | null = null;
  for (const run of runs) {
    if (!newest || run.createdAt > newest.createdAt) newest = run;
  }
  return newest;
}
