# PR-scoped approvals and merge-base baselines

Decision record for [#306](https://github.com/ravidsrk/frontguard/issues/306). The spike is `packages/cli/src/storage/baseline-selection.ts`. It is not wired into `update-baselines`, the Action, or the orphan branch. Pixelmatch stays the only comparator. An approval only chooses which image bytes are compared.

## 1. What an orphan-branch commit represents

Each baseline commit records the default-branch commit it represents in `sourceCommitSha` (already on the manifest). A pull-request write is not that commit. Promotion onto the default branch, after merge, is what publishes a set other pull requests can select.

## 2. Which set a pull request compares against

Select the newest baseline set whose `sourceCommitSha` is an ancestor of `merge-base(PR head, base)`.

Warned fallbacks, in order:

- The latest set published from the default branch, with a warning that it is not an ancestor.
- A distinct `no-baseline` result when no published set applies. That is not a pass.
- On a shallow clone, ancestry outside the fetched history is `unknown`. The run warns and tells the user to fetch the merge base. It does not treat unknown as an ancestor.

Rejected: always using the latest default-branch set. That is the bug this replaces. An unmerged approval of pull request A would become the baseline for pull request B.

Rejected: one baseline branch per pull-request branch. It duplicates PNG history and still needs a merge rule.

## 3. What an approval is

An approval is a record, not a branch move:

`route`, `viewport`, `browser`, `mode`, baseline SHA-256, candidate SHA-256.

`mode` is reserved for [#309](https://github.com/ravidsrk/frontguard/issues/309). The empty mode is today's path, `baselines/<route>/<viewport>/<browser>.png`.

The record is written only through the human confirm in [#287](https://github.com/ravidsrk/frontguard/issues/287). `confirm_reviewed` set by the same agent is not that confirm. Judge notes cannot write it.

The compare step still runs pixelmatch against the selected image. A matching approval selects that approval's candidate bytes. Another pull request's candidate is not selected. The spike test `does not treat the other pull request as the baseline` is this case.

## 4. Promotion after merge

Promotion happens on the default branch after the pull request merges. The orphan branch's `sourceCommitSha` becomes that default-branch commit. Until then, other pull requests keep using the ancestor set from section 2.

## 5. How approval reaches GitHub

A commit status can be posted with `statuses: write`. Check-run buttons need a GitHub App and are out of scope. Queue runs ([#304](https://github.com/ravidsrk/frontguard/issues/304)) compare and do not approve.

## 6. Where the records live

Store approval records on the orphan branch next to the manifest, keyed by the two content hashes, not by a pull-request number alone. A squash or rebase changes the commit SHA and can drop a merge commit. The content hash does not move. [#290](https://github.com/ravidsrk/frontguard/issues/290) may rewrite PNG history only if every image that is still an ancestor baseline, and every approved candidate hash, stays reachable. Deleting the current bytes of an approval fails the dry run.

## 7. Stacked pull requests and merge queues

A stacked pull request uses the same ancestor rule against its own merge base. It does not inherit an unmerged parent's unpublished images unless that parent has been promoted. A merge queue compares the queue commit against the published ancestor set and writes nothing.

## 8. Migration

Single-branch users who only run `update-baselines` on the default branch keep one published set. Their paths and their latest PNG bytes stay the same. Missing approval records mean "compare against the selected baseline," which is today's behavior when the selected set is that latest set.

## Constraints this imposes

[#290](https://github.com/ravidsrk/frontguard/issues/290) must not prune a set that is still a merge-base ancestor, and must not drop an approved candidate's bytes. The dry run lists anything it would make unreachable.

[#295](https://github.com/ravidsrk/frontguard/issues/295), if object storage is ever designed after the cloud-api gates, keys objects by the same content hash tuple. A single mutable key per route is the orphan-branch bug moved to S3.

## Rejected again

Always using the latest default-branch set. Per-branch baseline branches. Model-driven approval. Checks API buttons.
