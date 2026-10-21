# Baseline storage

`frontguard-baselines` is a git orphan branch in the project repository. The current accepted PNG for each shot is `baselines/<route>/<viewport>/<browser>.png`. `manifest.json` records the SHA-256 of those bytes, the viewport, the browser, and `sourceCommitSha` for the default-branch commit that set represents. Color scheme, actions, and labels are not part of the path.

This store is not:

- Playwright's `__visual_baselines__/` directory in a test project.
- `imageUpload` thumbnails attached to a pull-request comment.
- Cloud monitor-run pruning (`pruneForUser` / `pruneMonitorRuns`), which deletes monitor-run rows for an account. That store is not this branch.

`frontguard prune-baselines` prints a plan and writes nothing unless `--apply` is passed.

- Stale shots are tip entries whose route, viewport, and browser are not in the configured routes, effective viewports, and browsers. Two entries for one path union their viewport widths. The command does not consult the git diff.
- `--routes`, `--shard`, and `FRONTGUARD_SHARD` exit 2 and write nothing. A filtered or sharded run does not see every baseline, so absence is not deletion.
- The command refuses when `frontguard-baselines` is checked out in any worktree, when that branch moved after the plan was read, and when the branch exists only as `origin/frontguard-baselines`. A missing branch is nothing to prune.
- A stale route whose sanitized path is the same file as a route that stays is removed from the manifest only. The PNG stays.
- Route discovery (`discover`, Storybook, Ladle, or Histoire) skips stale-shot removal. An empty route list, or a viewport list that cannot be resolved, does the same.
- History commits whose `sourceCommitSha` is an ancestor of the merge base stay reachable. Unknown ancestry stays reachable, including a shallow clone that can see the source object but not the path to the merge base. The tip stays reachable. Other commits can become unreachable. The command does not run `git gc`.
- `approvals.json` records, when present, are `{ baselineSha256, candidateSha256 }` objects. A rewrite that would make either hash unreachable fails the dry run and writes nothing. A commit that still holds those bytes is kept. One kept copy of a repeated approval record is enough.
- Shots that remain on the tip keep their PNG bytes. The command does not change the pixelmatch gate.

A search of X from 2025-01-01 through 2026-10-21 for baseline-branch PNG growth and Git LFS returned no posts. The command exists because this orphan branch has no retention cap, not because of a practitioner thread about binary bloat.
