/**
 * Loads `prune-baselines` from a sibling file so it stays out of the published
 * bin (`dist/cli/index.js`) unless the subcommand is invoked.
 */
import type { runPruneBaselines } from './prune-baselines.js';

export async function loadPruneBaselines(): Promise<{
  runPruneBaselines: typeof runPruneBaselines;
}> {
  let dir = import.meta.url;
  for (let n = 0; n < 4; n++) {
    const slash = dir.lastIndexOf('/');
    if (slash <= 0) break;
    dir = dir.slice(0, slash);
    for (const file of ['prune-baselines.js', 'prune-baselines.ts']) {
      try {
        return await import(new URL(file, `${dir}/`).href);
      } catch {
        // Source and built bin resolve beside the entry.
      }
    }
  }
  throw new Error('Could not load prune-baselines command module');
}
