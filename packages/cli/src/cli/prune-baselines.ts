/**
 * `frontguard prune-baselines` removes tip shots the full config does not
 * declare, and drops orphan-branch commits that are not merge-base ancestors.
 * Dry run unless `--apply` is set. `--routes` and `--shard` refuse.
 */

import { loadConfig } from '../core/config.js';
import type { FrontguardConfig } from '../core/types.js';
import {
  applyBaselinePrune,
  declaredTargetKeys,
  formatPrunePlan,
  isMergeBaseAncestor,
  mergeBaseCommit,
  planBaselinePrune,
  readBaselineCommits,
} from '../storage/prune-baselines.js';

function discoveryIncomplete(config: FrontguardConfig): boolean {
  return Boolean(
    config.discover ||
      config.storybook ||
      config.ladle?.url ||
      config.ladle?.dir ||
      config.histoire?.url ||
      config.histoire?.dir,
  );
}

export async function runPruneBaselines(options: {
  cwd: string;
  apply: boolean;
  configPath?: string;
  routesFlag?: string;
  shardFlag?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: (text: string) => void;
}): Promise<number> {
  const write = options.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const env = options.env ?? process.env;
  const filtered = (options.routesFlag ?? '').trim().length > 0;
  const sharded = (options.shardFlag ?? env.FRONTGUARD_SHARD ?? '').trim().length > 0;

  if (filtered || sharded) {
    const plan = planBaselinePrune({
      commitsNewestFirst: [],
      declared: new Set(),
      declaredComplete: false,
      discoveryIncomplete: false,
      isMergeBaseAncestor: () => 'unknown',
      filtered,
      sharded,
    });
    write(formatPrunePlan(plan, options.apply));
    return 2;
  }

  const previous = process.cwd();
  let config: FrontguardConfig;
  try {
    process.chdir(options.cwd);
    config = await loadConfig(options.configPath);
  } finally {
    process.chdir(previous);
  }

  const commits = readBaselineCommits(options.cwd);
  const declared = declaredTargetKeys({
    routes: config.routes,
    viewports: config.viewports,
    browsers: config.browsers,
  });
  const mergeBase = commits.length > 0 ? mergeBaseCommit(options.cwd) : '';
  const plan = planBaselinePrune({
    commitsNewestFirst: commits,
    declared: declared.keys,
    declaredComplete: declared.complete,
    discoveryIncomplete: discoveryIncomplete(config),
    isMergeBaseAncestor: (source) =>
      mergeBase.length > 0 ? isMergeBaseAncestor(options.cwd, source, mergeBase) : 'unknown',
    filtered: false,
    sharded: false,
  });
  write(formatPrunePlan(plan, options.apply));
  if (plan.blockedReason || plan.unreachableApprovalHashes.length > 0) return 2;
  if (options.apply) applyBaselinePrune(options.cwd, plan);
  return 0;
}
