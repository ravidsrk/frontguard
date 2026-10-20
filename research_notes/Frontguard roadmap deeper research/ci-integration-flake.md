# CI merge-gate integration and deterministic flake handling in visual regression tools (state as of 2026-10-19)

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

**How to read these notes**

- **Fetch date.** Every URL and `gh api` result cited below was retrieved in this session on **2026-10-19**. Vendor pages without a date are marked "undated".
- **Tags:**
  - `[VENDOR]`: the vendor's own docs or marketing. These are self-reported and not independently verified.
  - `[BACKGROUND yyyy-mm-dd]`: evidence older than 2025-01-01.
  - `[SNIPPET]`: the claim came only from a search-engine result summary. Either the page was not fetched, or the fetched page did not contain the claim. Treat it as weaker evidence.
- **How sources were read:**
  - WebFetch returns passages extracted by a model. Quotes from it are as returned.
  - `gh api` and `curl` outputs are raw. Argos docs were read as raw markdown via `curl` (`<page>.md`).

---

## Q1. GitHub merge queue: `merge_group` semantics, required checks, pitfalls, and vendor support

### Takeaway

**How the queue works.** GitHub's queue tests a temporary `gh-readonly-queue/<base>/pr-<n>-<sha>` commit, made of the latest base plus the PRs queued ahead. It waits for every required check to be reported on that SHA. So a visual check must trigger on `merge_group` and post its status on `merge_group.head_sha`. The payload carries no PR number.

**What vendors do.** Vendors that document queue support (Chromatic and Argos) converge on one model:
- Re-run inside the queue.
- Compare against the target-branch baseline.
- Pass if the PR's changes were already approved on the PR.
- Otherwise fail, which makes GitHub eject the PR.

No vendor documents auto-passing the queue. Some users simply switch visual tools off there (bcgov with Happo), which loses the only test of the exact commit that lands.

### Cited Findings

**GitHub mechanics**

- **The `merge_group` event** ([GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)):
  - Only the `checks_requested` activity type is supported.
  - `GITHUB_SHA` is the "SHA of the merge group" and `GITHUB_REF` is the "Ref of the merge group".
  - The event "is separate from the `pull_request` and `push` events".
  - Only `branches`/`branches-ignore` filters are documented for it.
  - If required checks come from Actions, `merge_group` must be added as a trigger. Otherwise "status checks will not be triggered when you add a pull request to a merge queue."
- **The `pull_request` event**, same page:
  - `GITHUB_SHA` is "the last merge commit of the pull request merge branch" (`refs/pull/N/merge`). Use `github.event.pull_request.head.sha` for the head commit.
  - "Workflows will not run on `pull_request` activity if the pull request has a merge conflict."
- **Payload schema** ([checks_requested](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/merge_group/checks_requested.schema.json), [destroyed](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/merge_group/destroyed.schema.json); octokit/webhooks schemas via `gh api`):
  - `merge_group.checks_requested` and `merge_group.destroyed` both carry `merge_group.head_sha` ("The SHA of the merge group"), `head_ref` ("The full ref of the merge group"), `base_sha` ("The SHA of the merge group's parent commit"), `base_ref` and `head_commit`.
  - `destroyed` adds `reason` ∈ {`dequeued`, `invalidated`, `merged`}.
  - There is **no PR-number field**.
- **Where to report.** For `merge_group`, "you should perform checks on the head SHA and report status back using check runs or commit statuses" — [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads).
- **Queue branch naming:**
  - Chromatic documents the queue branch as "named like `gh-readonly-queue/main/pr-<number>-<sha>`" — [Chromatic: GitHub Actions](https://www.chromatic.com/docs/github-actions/) [VENDOR, undated].
  - GitHub's own page says third-party CI must run on pushes to branches with prefix `gh-readonly-queue/{base_branch}`. Its worked example uses a `main/pr-1` shorthand and the page never reconciles the two forms — [GitHub Docs: Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
- **Queue settings and behaviour**, same "Managing a merge queue" page:
  - The temporary branch contains the latest target branch plus the PRs ahead.
  - **Build concurrency** (1–100) sets the maximum number of `merge_group` webhooks dispatched.
  - **Only merge non-failing pull requests.** When this is disabled, a failing PR can still merge if the group's last PR passes. The page suggests this helps with intermittent failures.
  - **Status check timeout**, after which the queue assumes failure.
  - **Merge limits**: minimum and maximum PRs per merge (1–100), plus a wait time.
  - A failing group removes the PR and rebuilds temporary branches for the rest.
  - Removal reasons: CI failure, timeout, user request, or an unresolved branch-protection failure.
  - "Jump the queue" forces a full rebuild of in-progress groups.
  - The queue is FIFO and can't be enabled with wildcard branch-protection patterns.

**Pitfalls**

- **Skipped required checks** ([GitHub Docs: Troubleshooting required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)):
  - A required check skipped by workflow-level **path filtering, branch filtering or a commit-message skip** stays "Pending" and blocks merging.
  - A job skipped by a conditional (`if:`) reports "Success".
  - If a check and a commit status share a name, "both must pass when that name is required".
  - A branch can require a check from a specific GitHub App ("not set by the expected GitHub App").
  - "Required checks must pass on the latest commit SHA."
- **Community request.** A long-standing community request asks for path-filtered required checks to pass or skip rather than pend. It has 295 upvotes and no accepted answer — [GitHub Community discussion #44490](https://github.com/orgs/community/discussions/44490) (via `gh api graphql`) [BACKGROUND 2023-01-16].
- **Chromatic pending-forever cases** ([Chromatic: Mandatory PR checks](https://www.chromatic.com/docs/mandatory-pr-checks/) [VENDOR, undated]):
  - A required check stays "Pending indefinitely" if the check is disabled in Chromatic or the CI step is skipped with `if:`/`rules:`.
  - The doc says to "Skip the build with `--skip` instead of skipping the CI step", which marks the check skipped and passing.
- **Argos skip mechanisms:**
  - `ARGOS_SKIPPED=true` or `argos skip` "immediately marks the commit status as success" when Argos is a required check — [Argos: Skipping a build](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/skipping-a-build.md) [VENDOR].
  - `argos finalize --skip-if-empty` does the same for cached or sharded runs — [Argos: Cached CI pipelines](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/cached-pipelines.md).

**2026 GitHub platform changes that touch visual gates**

- **2026-02-19, test merge commits** ([GitHub Changelog 2026-02-19](https://github.blog/changelog/2026-02-19-changes-to-test-merge-commit-generation-for-pull-requests/)):
  - Test merge commits for open PRs are now generated only when changes are pushed to the PR branch, the merge base changes, or "The current test merge commit is older than 12 hours".
  - Viewing the PR page no longer triggers generation.
  - Mergeability checks are not affected.
- **2026-04-23, squash-merge incident** (post dated 2026-04-28; [GitHub Blog: An update on GitHub availability](https://github.blog/news-insights/company-news/an-update-on-github-availability/)):
  - A merge-queue regression meant that when a group had more than one PR, squash merges created incorrect merge commits that reverted earlier PRs' changes.
  - 658 repositories and 2,092 PRs were affected. Merge and rebase methods were not.
  - GitHub "could not safely repair every repository automatically".
- **2026-10-06, stacked PRs GA** ([GitHub Changelog 2026-10-06](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)):
  - "A stack now enters and lands through the merge queue as a single merge group".
  - With the merge-commit method, GitHub creates one merge commit per PR.
  - "Approvals stay in place for unchanged code" when an unchanged stack is rebased.
- **2026-10-01, async merge API GA.** It can add PRs to the merge queue and is the only merge API that supports stacked PRs — [SNIPPET: GitHub Changelog 2026-10-01](https://github.blog/changelog/2026-10-01-github-async-merge-api-generally-available/) (page not fetched).

**Vendor support for the merge queue**

- **Chromatic** ([Chromatic: GitHub Actions](https://www.chromatic.com/docs/github-actions/) [VENDOR, undated]):
  - Add `merge_group` next to `push`. Chromatic detects the queue branch and commit automatically, with no extra env vars.
  - Add the job as a required check in a ruleset.
  - If changes were already accepted on the PR, the queue build passes.
  - Otherwise "the merge queue build reports them as changes". With `exitZeroOnChanges: false`, "the Chromatic check fails, and GitHub removes the pull request from the queue". You then accept the changes on the PR and re-queue.
- **Argos** [VENDOR]:
  - **Changelog, 2026-01-06** ([Argos changelog 2026-01-06](https://argos-ci.com/changelog/2026-01-06-github-merge-queue); WebFetch returned 404, then retrieved with `curl` at HTTP 200):
    - "Argos computes the merge base against the last approved commit on the target branch and publishes required visual checks along the merge queue path, preventing regressions that only appear after rebases or batched merges."
    - Workflows should listen to both `pull_request` and `merge_group`.
  - **Docs** ([Argos: GitHub integration](https://argos-ci.com/docs/learn/integrations/github-integration.md)):
    - In the queue, Argos "compares the queued changes against the merge base of all pull requests in the queue".
    - The merge queue needs full Contents access; it is not supported in the limited "no content" mode.
    - For non-GitHub queues (e.g. Mergify), set `ARGOS_MERGE_QUEUE_PRS: "101,102"` so the upload is treated as a queue build.
- **Percy:**
  - No merge-queue documentation was found on browserstack.com or docs.percy.io (searched).
  - The closest controls are the `PERCY_TARGET_BRANCH` override ([Percy: Git baseline management](https://www.browserstack.com/docs/percy/visual-testing-workflows/baseline-management/git)) and `PERCY_TARGET_COMMIT` ([SNIPPET]: from a docs.percy.io "baseline-picking-logic" search result; that URL now 301-redirects to the Git page, which doesn't mention it).
- **Happo:**
  - The CI docs do not mention merge queues — [Happo: Continuous Integration](https://docs.happo.io/docs/continuous-integration).
  - Field example: bcgov/cas-registration PR #5315 (merged 2026-10-09) "makes sure Happo doesn't report for Merge Queue (in the same way that the Nightly doesn't)". It gates Happo credentials on `github.event_name != 'merge_group'` and runs a non-Happo e2e target in the queue — [bcgov/cas-registration#5315](https://github.com/bcgov/cas-registration/pull/5315) (via `gh api`).
- **PostHog field example** (public repo, Sept–Oct 2026):
  - Merge-queue Visual Review runs are submitted with purpose `observe`, i.e. tracking-only. The approve/finalize UI was removed for them because `finalize_run` returned 400 — [PostHog#106955](https://github.com/PostHog/posthog/pull/106955) (merged 2026-10-01).
  - The queue's VR leg still "renders every story" and gates. A squash commit dropped 8 entries from the committed `frontend/snapshots.yml`, after which "Every merge-queue batch that runs visual regression fails the 'Visual regression tests pass' gate". Runs reported "7069 unchanged, 0 changed, 8 new", while PR runs, which render only affected stories, stayed green — [PostHog#109926](https://github.com/PostHog/posthog/pull/109926) (merged 2026-10-01).
  - "The merge queue runs Visual Review, so a real visual change still blocks the merge there" — [PostHog#106132](https://github.com/PostHog/posthog/pull/106132) (opened 2026-09-24; not merged at fetch time).

### Inferences

- **Getting PR context in the queue.** The payload has no PR number. A tool that needs PR context in the queue (comments, PR-scoped approvals) has to parse `head_ref`. That yields only the *last* PR in the group. Earlier PRs in the group can only be found from commits between `base_sha` and `head_sha`, or via the API. Argos asking non-GitHub queues for the full PR list (`ARGOS_MERGE_QUEUE_PRS`) suggests it needs the whole set to choose baselines.
- **The core design problem for an orphan-branch store.** Take a group [PR1, PR2]. PR2's queue commit contains PR1's intended visual changes. If approved baselines only reach the baseline store after merging to main, then comparing PR2's queue run against baselines at `base_sha` flags PR1's *approved* changes as regressions. Argos ("merge base of all pull requests in the queue") and Chromatic ("accepted on the PR → queue build passes") both apply per-PR approvals inside the queue.
- **Skipping visual checks in the queue removes the only exact-commit test.** The queue commit is the one that lands. The April 2026 squash regression and PostHog's stale-merge case both show that a base-plus-PRs combination can differ from what each PR tested on its own.
- **Workflow-level `paths:` filters are unsafe for a required visual check.** The tool itself should decide "nothing to capture" and still post a success status (Chromatic `--skip`, Argos `ARGOS_SKIPPED`).

### Gaps

- No first-party Percy or Happo docs on merge-queue baseline selection or approval carry-over were found.
- GitHub docs don't say whether `merge_group` supports `paths` filters (only `branches` is documented). They don't formally specify the `gh-readonly-queue` naming format either; only Chromatic's doc gives the full pattern.
- No vendor documents behaviour on `merge_group.destroyed`, e.g. cancelling in-flight queue builds. Actions only delivers `checks_requested`.
- Argos does not spell out how "last approved commit on the target branch" is computed when a group holds several PRs, beyond the changelog and docs sentences quoted above.

---

## Q2. Approval as a merge gate (statuses and checks, persistence, OSS patterns)

### Takeaway

**The gate.** All four vendors expose approval as a **commit status**, or a status-like check, on the PR head commit and block merges through GitHub required status checks. No vendor doc found uses Checks API `requested_action` buttons. Those require a GitHub App to receive the click.

**Persistence.** Where approvals persist across commits, they are effectively **content-addressed**:
- Percy carries approval forward for identical snapshots on a branch.
- Happo keys flakes to exact image-hash pairs.
- Chromatic uses a per-branch "last accepted snapshot".

**OSS and local-first patterns** exist but are thin: a committed hash manifest (PostHog) and PR-comment approval (a new, unadopted Action). No label-based or signed-approval pattern was found.

### Cited Findings

- **Argos statuses** ([Argos: GitHub integration](https://argos-ci.com/docs/learn/integrations/github-integration.md) [VENDOR]):
  - Argos reports results as "commit statuses ... on the pull request's head commit, not as check runs".
  - Contexts: `argos`, `argos/<build-name>`, `argos/<project-name>`, `argos/<project-name>/<build-name>`, and `argos/summary`.
  - On `pull_request` events Argos records the ephemeral merge commit as the build commit ("what you tested is the merged result"), but posts the status on the PR head. On `pull_request_target` it uses the PR head as the build commit.
  - Overrides: `ARGOS_COMMIT`/`ARGOS_BRANCH`.
  - GitHub App permissions:
    - Contents, to find a common ancestor.
    - Statuses.
    - Pull requests, for comments.
    - Actions, to "re-run an individual GitHub Actions workflow run when a check is retried from Argos".
- **Argos summary check.** `argos/summary` combines all builds on a commit. By default it is added only when there is more than one build. "Always add a summary check" is the setting to use if you require it and some commits produce only one build — [Argos: Summary checks](https://argos-ci.com/docs/learn/review-workflow/summary-checks.md) [VENDOR].
- **Argos review rules** ([Argos: Review a build](https://argos-ci.com/docs/learn/review-workflow/review-a-build.md); [Argos: Core concepts](https://argos-ci.com/docs/learn/platform-fundamentals.md) [VENDOR]):
  - Only each reviewer's latest review counts, and dismissed reviews are ignored.
  - "One rejection blocks." Otherwise "one approval passes".
  - The review outcome updates the commit status.
- **Chromatic checks and review** [VENDOR, undated]:
  - Checks are "UI Tests, UI Review & Publish". They are pending when visual changes are detected or UI Review is required, and a pending build "blocks merging until someone reviews and approves the changes". They pass automatically with no changes, and `--skip` → skipped and passing — [Chromatic: Mandatory PR checks](https://www.chromatic.com/docs/mandatory-pr-checks/).
  - UI Review gives "a 'UI Review' status check for each PR". All assigned default reviewers must approve. The changeset compares the latest PR commit with the merge base and needs Chromatic builds on both — [Chromatic: Review](https://www.chromatic.com/docs/review/).
  - The CLI exits 0 on changes by default. `exitZeroOnChanges: false` makes the step fail — [Chromatic: GitHub Actions](https://www.chromatic.com/docs/github-actions/).
- **Chromatic persistence.** The baseline is "the last accepted snapshot on a given branch". "Baselines only update when changes are accepted", and each branch keeps its baseline until explicitly updated. Accepted snapshots therefore carry to later commits on the same branch — [Chromatic: Branches and baselines](https://www.chromatic.com/docs/branching-and-baselines/).
- **Percy** [VENDOR]:
  - **Approval** ([Percy: Approval](https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/approval)):
    - You can approve a build, groups of matching changes, or individual snapshots.
    - A build is approved once all its snapshots are; "only marking a complete build as approved will mark your Percy check as 'passed'".
    - There is a "Changes requested" state.
  - **Carry-forward** (same page):
    - "Approved snapshots that were previously accepted will retain their approval status across builds throughout the lifespan of the branch".
    - Identical snapshots "will only require approval once per branch, as they are 'carried forward'". This applies to Git-style workflows only.
    - A new change needs fresh approval.
  - **GitHub integration settings:**
    - The integration needs read/write commit statuses, and approvals are not required to merge by default — [SNIPPET: Percy GitHub integration](https://www.browserstack.com/docs/percy/integrations/source-control/github) and the docs.percy.io approval-workflows search result.
    - Auto-approve branches are set by a regex filter (API attribute `auto-approve-branch-filter`, e.g. `"main release/*"`) [SNIPPET: same search].
- **Happo** [VENDOR]:
  - **Status and acceptance** ([Happo: Continuous Integration](https://docs.happo.io/docs/continuous-integration)):
    - Status is failure "If there is a diff" and success if none.
    - Clicking Accept on the comparison page turns the GitHub status to success.
    - Without the GitHub App, Happo posts a PR comment via `--githubToken`.
  - **Reported flakes and status** ([Happo: Reporting Flake](https://docs.happo.io/docs/reporting-flake)):
    - The status updates automatically when reported flakes leave no remaining diffs.
    - If reviewing is restricted, only reviewers can report flakes, "since an ignored diff can approve a comparison".
  - **Other:**
    - Approve/reject was removed from the npm package in 2.0.0 but remains in the API/MCP [SNIPPET: happo.io release notes 2.0.0].
    - A change that adds an accessibility violation blocks approval [SNIPPET: happo.io search results].
- **Checks API constraints:**
  - **Check runs** ([GitHub REST: Check runs](https://docs.github.com/en/rest/checks/runs)):
    - Write access "is only available to GitHub Apps".
    - `actions`: "A maximum of three actions are accepted", with label ≤ 20 chars, description ≤ 40, identifier ≤ 20.
    - Conclusions include `action_required`.
    - Annotations are capped at 50 per request.
    - Output can carry images (`alt`, `image_url`, `caption`).
  - **Requested actions** ([GitHub Docs: Building CI checks with a GitHub App](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-ci-checks-with-a-github-app)):
    - A click "sends a `requested_action` `check_run` event to the GitHub App".
    - The `identifier` tells the app which button was clicked.
    - The app needs Checks Read & write.
- **No vendor uses `requested_action` approve buttons**, in any doc fetched. Argos explicitly uses statuses, not check runs.
- **OSS and local-first patterns:**
  - **PostHog committed manifest:**
    - PostHog commits `frontend/snapshots.yml` (`version: 1`), mapping each snapshot id (e.g. `...--default--dark`) to a content `hash:` of the form `v1.<k…>.<64-hex>.<…>` — [PostHog frontend/snapshots.yml](https://github.com/PostHog/posthog/blob/master/frontend/snapshots.yml) (via `gh api`).
    - Fork PRs run an "offline check that needs an exact pixel-hash match with `frontend/snapshots.yml`" — [PostHog#106132](https://github.com/PostHog/posthog/pull/106132).
    - The gate is a commit status, `PostHog Visual Review / playwright`, with a green "(tracking)" variant for observe runs [SNIPPET: search summary of PostHog/posthog.com#19670].
    - Recording a per-snapshot approval "Does not commit the baseline or change the GitHub gate — call finalize to ship the run" [SNIPPET: posthog.com/docs/api/visual-review; the fetched page body was truncated to navigation].
  - **Comment approval, krystxf/storybook-vrt** ([krystxf/storybook-vrt](https://github.com/krystxf/storybook-vrt) README via `gh api`):
    - A composite Action created 2026-06-17, with 0 stars and no license.
    - Diff images are committed to an orphan branch (`vrt-snapshots`) and embedded via raw URLs.
    - It sets a blocking commit status `visual-regression` using `github.token` with `statuses: write`.
    - Approval is a PR comment such as `approve changes UI/Button` or `approve changes UI/Button › Default`, from owner, member or collaborator only.
    - "Deleting (or editing out) an approval comment **revokes** it."
    - Because `issue_comment` runs from the default branch, the workflow "must be on `main` before approvals take effect".
    - This is evidence of the pattern, not of adoption.
  - **No label-based or cryptographically signed approval pattern** was found in searches.

### Inferences

- **A commit status is the lowest-friction primitive.** It works with the Actions `GITHUB_TOKEN` (`statuses: write`, as storybook-vrt shows), it is what Argos, Percy, Happo and storybook-vrt use, and it can be made required. Checks API buttons need a GitHub App to receive `requested_action`, which a composite Action cannot host.
- **Content-addressed approvals survive history rewrites.** Approving the pair (route/viewport, baseline hash → candidate hash) survives new commits, force-pushes, rebases and squash merges for free. SHA-addressed approvals don't. That is effectively what Percy's carry-forward and Happo's hash identity do.
- **Committed approval files travel with the code but carry two risks.** A committed approval file (as PostHog does) moves with the code through squash, rebase and the merge queue. The risks are merge conflicts and silent entry loss on stale merges (PostHog#109926).
- **Where the status must be posted.** A separate approval status must be posted on whichever SHA the gate evaluates: the PR head for PRs, and `merge_group.head_sha` in the queue. Its name should differ from the job/check name, because a same-named check and status must *both* pass.

### Gaps

- No vendor documents approval behaviour after a PR force-push or rebase explicitly, beyond Chromatic's rebase notes and Percy's per-branch carry-forward.
- Unverified: whether a check run created with the Actions `GITHUB_TOKEN` can usefully deliver `requested_action` clicks back to a workflow (`check_run` event). The pages fetched do not cover it, and it was not tested.
- Percy's "require approval before merge" setting is only evidenced by a search snippet.

---

## Q3. Baseline selection strategies (merge-base vs latest default branch vs per-branch)

### Takeaway

**The consensus rule (2025–2026).** Selection is anchored on the merge base: use the newest *approved* build whose commit is an ancestor of `merge-base(PR, target)`. Fall back to the latest target-branch build, and finally to "everything is new". Argos, Percy and Happo document exactly this, and Chromatic's ancestor-build model is close to it.

**What breaks:**
- **Squash and rebase merges** break git ancestry between PR builds and main. Tools rely on a fresh auto-approved main build after merge (Argos, Percy) or use provider APIs to copy accepted PR baselines across (Chromatic).
- **Long-lived and stacked branches** drift from the target's baseline.
- **Capturing the synthetic merge commit** makes diffs non-deterministic.

### Cited Findings

- **Argos** [VENDOR]:
  - **Candidate build criteria** ([Argos: Baseline build](https://argos-ci.com/docs/learn/platform-fundamentals/baseline-build.md)):
    - The build is complete, its tests passed, it is not a subset, and it has no active rejection.
    - It is approved: "an auto-approved build, an orphan, or a check build with an approved review or a merged pull request".
    - It has the same build name and mode.
    - Its commit "must be an ancestor of the **merge base**".
  - **Baseline branch, overrides and fallbacks** (same page):
    - The baseline branch is the PR's base branch for PR builds, and the project's default baseline branch for pushes.
    - Auto-approved branches default to the default branch.
    - Overrides: `ARGOS_REFERENCE_BRANCH`, `ARGOS_REFERENCE_COMMIT`.
    - An orphan build is one where no baseline was found.
    - Monitoring mode ignores git and uses the latest approved build.
    - The UI shows a baseline-eligibility chip that lists any failed criteria.
  - **How the search walks history.** Argos "resolves the baseline by walking the ancestor commits of the pull request's merge base until it finds an eligible build" — [Argos: Cached CI pipelines](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/cached-pipelines.md).
- **Percy** ([Percy: Git baseline management](https://www.browserstack.com/docs/percy/visual-testing-workflows/baseline-management/git) [VENDOR, undated]):
  - Selection order: merge-base build (PR builds only) → latest build on the default base branch → previous build on the same branch → none, in which case all snapshots are "marked as new".
  - Feature branches without a PR compare against the latest default-branch build.
  - `PERCY_TARGET_BRANCH` overrides the base branch per build.
  - Approval-required branches use only the most recent approved build on the same branch: "Automatic base build selection is turned off for them".
- **Happo** [VENDOR]:
  - Happo finds the baseline "starting at the merge base for the pull request branch". It accepts `--baseBranch` for non-`main` defaults and `--beforeSha` on generic CI. Running on default-branch pushes is how "baselines exist for PR builds to compare against" — [Happo: Continuous Integration](https://docs.happo.io/docs/continuous-integration).
  - Unexpected diffs are blamed on the dynamic merge commit. The fix is `ref: ${{ github.event.pull_request.head.sha || github.ref }}` with `fetch-depth: 100`; "switch to the PR head SHA when you want deterministic Happo diffs" — [Happo: Spurious diffs](https://docs.happo.io/docs/spurious-diffs).
- **Chromatic** ([Chromatic: Branches and baselines](https://www.chromatic.com/docs/branching-and-baselines/) [VENDOR, undated]):
  - **Normal selection:**
    - The baseline comes from ancestor builds, i.e. the most recent ancestor commit with a build.
    - A merge commit with several ancestor builds takes "the most recently accepted snapshot".
    - Rebases always include accepted baselines from the latest build on the current branch, regardless of git history. `--ignore-last-build-on-branch` bypasses this.
  - **Squash and rebase merges:**
    - These are detected through provider APIs: "We'll use the accepted baselines of the _most recent_ commit on the head branch of the PR".
    - GitHub needs the Chromatic App for this. GitLab and unlinked projects use `autoAcceptChanges: "main"` instead.
  - **Failure and fallback cases:**
    - Orphaned or reverted commits can cause wrong comparisons ("Git 'forgets' the commit, but Chromatic remembers it").
    - An account-level "preferring merged baselines" flag exists.
    - With no merge-base build, Chromatic prompts for a patch build (`--patch-build=$head...$base`).
    - Long-lived branches should sync often to reduce false positives.
- **Chromatic on `push` vs `pull_request`** ([Chromatic: GitHub Actions](https://www.chromatic.com/docs/github-actions/)):
  - Chromatic recommends running on `push`. On `pull_request`, the ephemeral merge commit "can cause Chromatic's baselines to be lost in certain scenarios or lead to Chromatic using an unexpected baseline from the `main` branch".
  - Workaround: check out `head.ref` and set `CHROMATIC_BRANCH`, `CHROMATIC_SHA` and `CHROMATIC_SLUG`.
- **TurboSnap after history rewrites.** When rebasing, squashing or force-pushing removes the commit linked to the previous build, TurboSnap "will traverse your repository's git history until a 'replacement build' is found". "We treat rebases like merges" — [Chromatic: TurboSnap](https://www.chromatic.com/docs/turbosnap/).
- **Test merge commits can lag.** Since 2026-02-19 they regenerate only on a PR push, a merge-base change, or when more than 12h old — [GitHub Changelog](https://github.blog/changelog/2026-02-19-changes-to-test-merge-commit-generation-for-pull-requests/).
- **Stacked PRs** (GA 2026-10-06): they land through the queue as one group, get automatic rebases after partial merges, and keep approvals for unchanged code — [GitHub Changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/).
- **PostHog field evidence:**
  - Squash merges plus a committed manifest: the squash commit of #108620 "removed 8 entries from `frontend/snapshots.yml`. Its own diff touches no stories" — [PostHog#109926](https://github.com/PostHog/posthog/pull/109926).
  - Stale baselines behind quarantines: about 30 quarantined snapshots stopped matching their baseline because "real UI changes landed while they were quarantined, so nobody approved the new picture" — [PostHog#111896](https://github.com/PostHog/posthog/pull/111896) (merged 2026-10-06).

### Inferences

What breaks, by case:

- **(a) Capturing `refs/pull/N/merge`.** The "after" image then includes main's newer changes, and since 2026-02 that merge commit can be up to 12h old. Diffs depend on when the ref was last regenerated. Happo and Chromatic both steer users to the head SHA.
- **(b) Squash and rebase merges.** PR-branch builds are never ancestors of main afterwards. Anything keyed by PR commit SHA (approvals, PR baselines) is orphaned unless it is copied over (Chromatic) or superseded by a post-merge main build that becomes the baseline (Argos and Percy auto-approve).
- **(c) Long-lived branches.** An old merge base means an old baseline. The PR diff then includes everything main has approved since, which Chromatic calls false positives.
- **(d) Stacked PRs.** The PR base is another PR's branch. Argos uses the PR base branch as the baseline branch, so it needs approved builds on intermediate branches. Otherwise selection falls back to the default branch, and the lower PR's changes appear in the upper PR's diff.
- **(e) Committed manifests.** Concurrent edits and squash merges can silently drop entries (PostHog).

For an orphan-branch store, merge-base selection needs two things:
- baselines indexed by the target-branch commit they represent;
- enough git history in CI to compute the merge base.

A shallow clone should trigger an explicit fallback with a warning. Compare Turborepo's rule that a checkout that is "too shallow" means all packages are treated as changed (Q5).

### Gaps

- No published comparison of false-positive rates between merge-base and latest-main strategies.
- Percy's handling of squash and rebase merges is not documented on the fetched pages.
- No vendor explicitly documents baseline handling for stacked PRs, including after GitHub's 2026 stacked-PR GA.

---

## Q4. Deterministic flake handling (diff thresholds, fingerprints, recurrence, retries)

### Takeaway

The deterministic toolbox in 2025–2026 has three layers:

1. **Per-pixel tolerance with anti-alias detection.** Chromatic uses YIQ at 0.063 with AA ignored. pixelmatch has its own threshold and AA handling, plus, since 2026-10, windowed counts. Happo hashes bitmaps first, then optionally deep-compares.
2. **Content-addressed ignore memory:**
   - Happo: an exact before/after image-hash pair.
   - Argos: a diff-shape fingerprint, with auto-ignore after 3 recurrences in 7 days.
   - PostHog: tolerated hashes plus expiring quarantines.
3. **Repeat-capture instability detection.** Chromatic Flake Filter and SteadySnap use burst renders. Playwright has retries plus `--fail-on-flaky-tests`.

**Model-based filtering** is mainly Percy's (Visual Review Agent / AI diff). Argos explicitly rejects AI diffing.

**Published noise-reduction numbers** are scarce and vendor-supplied or field anecdotes.

### Cited Findings

**Thresholds and comparators**

- **Chromatic** ([Chromatic: Threshold](https://www.chromatic.com/docs/threshold/) [VENDOR, undated]):
  - The `diffThreshold` default is `.063`. It "measures the color distance in a 3D color space (YIQ)" at the same (x, y) pixel.
  - Anti-aliased pixels are detected and ignored by default; `diffIncludeAntiAliasing` overrides this.
  - Both can be set per story, component or project (Storybook), or per project/test (Vitest/Playwright/Cypress).
- **pixelmatch** ([mapbox/pixelmatch](https://github.com/mapbox/pixelmatch); README and releases via `gh api`):
  - **Options:**
    - `threshold` is a per-pixel perceptual colour difference from 0 to 1, default `0.1`.
    - `includeAA` is `false` by default, so anti-aliased pixels are detected and ignored.
    - Also: `diffMask`, `ignoreMask` (a per-pixel exclusion mask) and `windowSize`.
  - **`windowSize`** returns the maximum diff count in any N×N window. The README explains: "GPU dithering and sub-pixel anti-aliasing scatter stray pixels all over the image, so they never fill up one small square, while a real regression usually changes a compact area."
  - **v8.0.0 (2026-10-06):**
    - OKLab with HyAB distance replaces YIQ.
    - Adds `windowSize` and `ignoreMask`.
    - "The API is unchanged, and `threshold` keeps its scale ... But diff counts will differ because of the new metric. If your tests rely on exact counts or a tuned `threshold`, re-check them."
  - **Earlier releases:** v7.2.0 (2026-04-29) added the `checkerboard` option. v7.0.0 (2025-02-19) was "Potentially breaking" in how it handles semi-transparent pixels.
- **Happo** ([Happo: Compare threshold](https://docs.happo.io/docs/compare-threshold) [VENDOR]):
  - By default any differing pixel is a diff.
  - Comparison uses "bitmap hashing": "We compare hashes, not screenshots".
  - Optional deep compare uses `color-delta` (the default) or `ssim` (experimental). Settings: compare threshold (suggested start 0.002), ignore threshold (e.g. allow 5 pixels in a 1000×500 image), blur, and ignore whitespace.
  - Deep compare with `color-delta` leaves out anti-aliasing pixels.
- **Argos** ([Argos: How Argos detects visual differences](https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences.md) [VENDOR]):
  - "deterministic pixel diffing, not AI-based visual comparison", using the odiff library.
  - Four stages: normalization → "Multiple diff passes" with different thresholds → "Pixel clustering" to separate random noise → a diff mask and score.
  - The implementation is open source (argos-ci/argos). The doc argues that AI "compensates for flakiness, while Argos removes it".
- **PostHog Visual Review** ([diffing.py](https://github.com/PostHog/posthog/blob/master/products/visual_review/backend/diffing.py), [contracts.py](https://github.com/PostHog/posthog/blob/master/products/visual_review/backend/facade/contracts.py); via `gh api`):
  - Uses `pixelhog.compare()` for "single-pass pixelmatch + SSIM".
  - A snapshot is CHANGED if the pixel diff is ≥ `PIXEL_DIFF_THRESHOLD_PERCENT = 2.5`, or the SSIM dissimilarity is ≥ `SSIM_DISSIMILARITY_THRESHOLD = 0.01`.
  - Row shifts of up to `SHIFT_ABSORB_MAX_ROWS = 2` are absorbed.
  - "All below -> UNCHANGED (noise), auto-populate tolerance cache" (`ToleratedHash`).
- **Playwright `toHaveScreenshot`** has `maxDiffPixels`, `maxDiffPixelRatio` and `threshold` (since v1.23) — [Playwright docs source: class-pageassertions.md](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-pageassertions.md) [BACKGROUND: options from v1.23, 2022].

**Ignore memory and fingerprints**

- **Argos ignore and fingerprints** ([Argos: Flaky test detection](https://argos-ci.com/docs/learn/reliability-and-flakiness/flaky-test-detection.md) [VENDOR]):
  - "Ignore" a change, and Argos won't notify if the "**exact same change**" recurs.
  - Each change has a **fingerprint**: "a stable signature computed from the shape of its diff". An ignore is a test-plus-fingerprint pair.
  - The fingerprint "absorbs pixel-level noise such as antialiasing but distinguishes genuinely different changes, so ignoring one flaky change never hides a new regression elsewhere in the screenshot".
  - The PR comment shows counts such as `4 changed, 3 ignored`. Ignoring can be toggled per project.
  - **Auto-ignore:** a change is "considered flaky once it appears at least this many times in auto-approved builds within the last 7 days. The default threshold is **3**".
- **Argos Ignored tab** ([Argos: Ignored changes](https://argos-ci.com/docs/learn/reliability-and-flakiness/ignored-changes.md)):
  - Each row shows **Occurrences** since the change was ignored and when it was **Last seen**.
  - Auto-ignores are attributed to a bot with an "Auto" badge.
  - Ignores that went quiet are flagged as blind spots ("the ignore is now hiding any genuine regression that happens to produce the same diff").
  - Unignoring needs review permission.
- **Argos metrics** ([Argos: Tests dashboard](https://argos-ci.com/docs/learn/reliability-and-flakiness/tests-dashboard.md)):
  - **Stability** is the "ratio of changes to total reference builds".
  - **Consistency** is the "ratio of one-off changes to total changes".
  - The flakiness score summarizes both.
- **Happo "Report flake"** [VENDOR]:
  - It ignores "that specific diff now and in the future" — [Happo: Reporting Flake](https://docs.happo.io/docs/reporting-flake).
  - A snapshot is identified by component, variant, target and "a hash of the image data". Happo remembers "that specific before/after pair" across past, current and future comparisons. The flake "comes back once the baseline changes".
  - Ignored diffs are labelled User, API, MCP or Automated. Automated is mostly for diffs below the compare threshold.
  - The CI status updates when no diffs remain.
  - A `flake` webhook fires on report and on undo [SNIPPET: docs.happo.io/docs/webhooks].
- **PostHog quarantine** ([PostHog quarantine.py](https://github.com/PostHog/posthog/blob/master/products/visual_review/backend/logic/quarantine.py); via `gh api`):
  - Each entry has an `expires_at`; no expiry makes it "a standing exception".
  - There are "expiring soon" notices.
  - Agent-created quarantines are capped at `AGENT_QUARANTINE_MAX_DAYS`.
  - A lift records `lifted_at_sha`.
- **PostHog field case** ([PostHog#111896](https://github.com/PostHog/posthog/pull/111896)):
  - About 30 quarantined snapshots were failing every master run, with quarantines due to expire on Oct 10.
  - "Lift-on-merge requests ... lift each quarantine once a master run renders the approved picture".
  - Root causes fixed: relative dates (pinned with `mockDate`), a Monaco theme lag, graph zoom non-idempotence, and editor mount width.

**Repeat-capture detection and retries**

- **Chromatic Flake Filter** (blog 2026-07-14; [Chromatic blog: Automatic flaky-test filtering](https://www.chromatic.com/blog/automatic-flaky-test-filtering/) [VENDOR]):
  - "Chromatic renders each test multiple times to check whether it's stable."
  - Unstable tests "move into an ignored group, and their diffs do not block your build".
  - Every test is re-evaluated on every build.
  - Repeat renders "still only counts as one billable snapshot". The filter is on by default.
  - A Playwright trace is attached to each unstable test.
  - The render count and the stability criterion are **not disclosed**.
- **Chromatic unstable tests** ([Chromatic: Unstable tests](https://www.chromatic.com/docs/unstable-tests/)):
  - Users can "quarantine" a test to ignore its diffs on every build.
  - The capture window is 15 seconds.
  - Viewport-relative heights fall back to a 900px default.
- **Chromatic SteadySnap** ([Chromatic: SteadySnap](https://www.chromatic.com/features/steadysnap) [VENDOR, undated]):
  - Tracks browser activity, network and asset loading.
  - "captures multiple renders and selects the most stable one".
  - Freezes animations and videos.
  - The features page gives **no numbers**. A "reduces visual inconsistencies by one-third" figure appeared only in a search summary [SNIPPET; unverified].
- **Happo stabilization and retry:**
  - Before capture, Happo waits for images (including srcset and background images), custom fonts and XHR/fetch. It freezes CSS animations at their last frame along with transitions, stops SVG animations, shows the first frame of GIFs and videos, and requests reduced motion — [Happo: Spurious diffs](https://docs.happo.io/docs/spurious-diffs).
  - Single-screenshot retry is manual ("Re-generate snapshot") — [Happo blog](https://happo.io/blog/introducing-single-screenshot-retry) (2024-02-07, updated 2025-09-17) [BACKGROUND origin].
- **Playwright retries** ([Playwright: Retries](https://playwright.dev/docs/test-retries)):
  - On a failure, the worker process is discarded and a fresh one retries the test.
  - Results fall into three categories: passed, **flaky** ("failed on the first run, but passed when retried") and failed.
  - `testInfo.retry` exposes the retry number at runtime.
- **Playwright flaky-test flags** ([Playwright release notes source](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md); release dates via `gh api repos/microsoft/playwright/releases`):
  - `--fail-on-flaky-tests` "sets exit code to `1` upon any flaky tests", since by default the run exits 0 when every failure recovered on retry. Added in v1.45 (2024-06-24) [BACKGROUND].
  - The `failOnFlakyTests` config option arrived in v1.52 (2025-04-17).
  - `FullConfig.failOnFlakyTests`, so reporters can explain why a flaky run failed, arrived in v1.61 (2026-06-15).
- **Playwright `--update-snapshots` modes** are all, changed, missing, none and default — [Playwright CLI docs source](https://github.com/microsoft/playwright/blob/main/docs/src/test-cli-js.md).

**Model-based approaches (for contrast)**

- **Percy levers** [SNIPPET: browserstack.com Percy docs]:
  - "Intelli Ignore".
  - Diff sensitivity levels, from Strict to Relaxed.
  - Region rules with a percentage threshold.
  - Drawing a region or adjusting sensitivity disables AI diff for that snapshot and width combination.
- **Percy Visual Review Agent** ([BrowserStack: Percy Visual Engine / AI agents](https://www.browserstack.com/percy/ai-agents) [VENDOR marketing]):
  - "Reduces review time by up to 3×".
  - "Filters out pixel-level noise".
  - The "Visual AI Engine" is described as OCR, shift detection and edge detection in relaxed mode.

**Published numbers**

- **PostHog field data** — [PostHog#106132](https://github.com/PostHog/posthog/pull/106132):
  - Without the tolerated-hash memory, a fork-PR exact-hash check failed "13 of 16 shards ... with about 1,250 snapshots in the lists", mostly in stories unrelated to the PR.
  - An internal run that could read the tolerated hashes "reports 6051 of 6052 unchanged against the same file".
- **Vendor claims:**
  - Percy: "up to 3×" faster review [VENDOR].
  - Chromatic: "one-third" [SNIPPET].
- No Argos noise-reduction figure was found.

### Inferences

- **Which mechanisms are deterministic:**
  - **Deterministic and documented:** Happo hash pairs; Argos fingerprints and recurrence counting (although the fingerprint algorithm is described only as "shape of its diff"); PostHog thresholds, hashes and expiring quarantines; Chromatic and pixelmatch thresholds; Playwright retries.
  - **Undisclosed:** the Chromatic Flake Filter's stability test and SteadySnap's "most stable" selection.
  - **AI-labelled:** Percy's Visual Review Agent and AI diff.
- **Exact-hash vs fingerprint ignore.** Exact-hash ignore (Happo) is the simplest and safest: a new regression changes the hash, so it is never hidden. Its weakness is that each slight variant of the same flake looks new. Diff-shape fingerprints (Argos) generalize across variants, at the cost of possible collisions.
- **Tolerance memory must be readable wherever the gate runs.** PostHog's fork PRs failed because they could not read the tolerated hashes.
- **Every ignore needs an expiry or occurrence telemetry.** That is why Argos shows occurrences and last-seen, and why PostHog quarantines expire.
- **Upgrading pixelmatch changes gate outcomes.** The v8 metric change means a dependency upgrade alone changes results. Treat it like Chromatic's "infrastructure upgrades" full-rebuild trigger: pin the version and re-baseline deliberately.

### Gaps

- No independent (non-vendor) measurement of how much fingerprinting, auto-ignore or repeat-rendering reduces noise or misses regressions.
- The specifics of Argos's fingerprint (quantization, region hashing) are not in the fetched docs. The source is in argos-ci/argos and was not inspected.
- The Chromatic Flake Filter's render count, comparison method and determinism are undisclosed.

---

## Q5. Affected-only capture (TurboSnap, Nx/Turborepo affected, vendor equivalents)

### Takeaway

Every affected-only scheme found is based on a dependency graph or a git range, and every one falls back to a full run for "global" changes:

- **TurboSnap** runs everything on: Storybook config; files imported by `preview.js`, which is where global CSS and theme tokens usually live; static dirs; `--externals`; a missing or out-of-sync lockfile; and infrastructure upgrades.
- **Nx** marks all projects affected on any lockfile change by default.
- **Turborepo** treats a too-shallow checkout as "everything changed".

Argos's answer for partial runs is **subset builds**: missing screenshots are not reported as removed, and subset builds are never baselines. PostHog shows that PR-scoped runs can pass while full merge-queue runs fail.

### Cited Findings

- **TurboSnap** ([Chromatic: TurboSnap](https://www.chromatic.com/docs/turbosnap/) [VENDOR, undated]):
  - **How it works:**
    - It uses "the git changes between the current commit and the ancestor build's commit" plus the Webpack/Vite dependency graph.
    - Stories with no associated code changes are not re-captured.
  - **Full-rebuild triggers:**
    - Dependency version changes in `package.json` "if no valid lockfile is available".
    - "Changes to your Storybook's configuration".
    - "Changes in files that are imported by your [`preview.js`]".
    - Changes in the static folder.
    - Files listed in `--externals`.
    - `--force-rebuild`.
    - "Infrastructure upgrades".
    - "UI Test in a new browser".
    - Enabling Accessibility Tests for the first time on a branch.
  - **Lockfile:** "If a lockfile is missing or out of sync with `package.json`, we'll have to re-test all stories".
  - **`untraced` caution:** "Don't add `preview.js|ts` to `untraced`", and untrace a file only after confirming its changes cannot affect rendering.
  - **Billing:** copied snapshots are billed "at 1/5th the cost of a captured snapshot".
- **TurboSnap in GitHub Actions.** "The `ref` on the checkout step is required for TurboSnap to correctly detect changed files". `externals` covers files outside webpack's graph — [Chromatic: GitHub Actions](https://www.chromatic.com/docs/github-actions/).
- **Nx** ([Nx: Affected](https://nx.dev/docs/features/ci-features/affected)):
  - Base and head come from `--base`/`--head` or `NX_BASE`/`NX_HEAD`. The recommended base is the latest successful commit on main.
  - "By default, Nx will mark all projects as affected whenever your package manager's lock file changes" (`"all"`). `"auto"` marks only "projects whose dependencies actually changed in the lock file"; an array of projects or globs is also accepted.
- **nx-set-shas.** It needs `actions` and `contents` read, and also the `pull-request` permission "If you are using the action with `merge queues`" — [nrwl/nx-set-shas README](https://github.com/nrwl/nx-set-shas) (via `gh api`).
- **Turborepo `--affected`** ([Turborepo: run reference](https://turborepo.dev/docs/reference/run)):
  - Equivalent to `--filter=...[main...HEAD]`, overridable with `TURBO_SCM_BASE`/`TURBO_SCM_HEAD`.
  - "If the checkout is too shallow, then all packages will be considered changed".
  - Works at package level by default; task level needs `futureFlags.affectedUsingTaskInputs`.
  - The `globalDependencies` key keeps global files in every hash.
- **dorny/paths-filter supports `merge_group`.** "The `base` and `ref` input parameters default to commit hashes from the event". Otherwise it detects changes against the merge-base with the base branch, and "All files are considered as added if there is no common ancestor" — [dorny/paths-filter README](https://github.com/dorny/paths-filter) (via `gh api`).
- **Playwright `--only-changed[=ref]`** runs test files changed since the ref, "This will also run all test files that import any changed files". Added in v1.46 (2024-08-05) [BACKGROUND] — [release notes source](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md).
- **Argos subset builds** ([Argos: Subset builds](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/subset-builds.md) [VENDOR]):
  - Enabled with `ARGOS_SUBSET=true` or `--subset`.
  - Removed screenshots are ignored; only changed and added screenshots are reported.
  - "Subset builds are not eligible as baselines", so the full suite must run on main.
- **Argos cached pipelines (Turbo/Nx)** ([Argos: Cached CI pipelines](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/cached-pipelines.md)):
  - "A cached test task never uploads screenshots". This causes three problems: unpredictable upload counts, missing screenshots looking like removed ones, and stale main baselines.
  - **Preferred fix:** declare the screenshot directory as a cached task `outputs`, then upload the full set (fresh plus cache-restored) once.
  - **Caveats:** snapshots must be "deterministic and machine-independent". A remote cache "extend[s] the cache's trust model to baselines".
  - **Alternative:** subset + finalize, with a hashed cache-bust variable on main so main builds are complete.
- **PostHog field evidence.** "PR runs render only affected stories" while "The merge-queue VR leg renders every story". The queue caught manifest loss that PR checks missed — [PostHog#109926](https://github.com/PostHog/posthog/pull/109926).
- **Percy:** no TurboSnap-style affected-only feature was found in the searches. Teams gate Percy by cost themselves; for example, Metabase runs it on demand via a label or comment [SNIPPET: Metabase-fork docs on GitHub].
- **Happo:** the CI docs describe no changed-only runs — [Happo: Continuous Integration](https://docs.happo.io/docs/continuous-integration).

### Inferences

**Full-run triggers to adopt as defaults:**
- lockfile and package-manifest changes (Nx default; TurboSnap when the lockfile is unreliable);
- tool and framework configuration;
- any globally imported file, such as global CSS, theme or design tokens and fonts (TurboSnap's `preview.js` rule is the analogue);
- static/public asset directories;
- comparator or browser version changes (TurboSnap "infrastructure upgrades");
- git history too shallow to compute the diff (Turborepo).

**How to treat scoped runs:**
- Mark scoped PR runs as "subset". Unscoped routes are "not run", never "removed".
- Never let a scoped run write or promote baselines.
- Keep merge-queue and default-branch runs full, so baselines stay complete and queue verification is exhaustive.

### Gaps

- No vendor explicitly says how global CSS or design-token files are treated, beyond TurboSnap's `preview.js` import rule.
- No published data on regressions missed by affected-only capture.

---

## Q6. CI cost and performance (sharding, browser caching, artifacts, durations)

### Takeaway

- **Sharding.** The standard pattern is Playwright's shard → blob report → `merge-reports`. Argos has a parallel/finalize equivalent.
- **Browser caching.** Playwright advises *against* caching browser binaries.
- **Artifacts.** `upload-artifact` v4+ allows 500 artifacts per job, keeps names immutable unless `overwrite: true`, and retains for 1–90 days. Since v7 (2026-02-26) it can upload a single file unzipped.
- **Durations.** No vendor or Playwright doc publishes durations per 100 screenshots.

### Cited Findings

- **Playwright sharding** ([Playwright: Sharding](https://playwright.dev/docs/test-sharding)):
  - **Mechanics:**
    - `--shard=x/y`.
    - `fullyParallel: true` balances by test; otherwise whole files go to shards.
    - Skipped tests are not counted when balancing.
  - **Reports:**
    - The blob reporter writes to `blob-report` and includes attachments such as "screenshot diffs".
    - `npx playwright merge-reports --reporter html ./all-blob-reports` produces the merged report.
    - Merging across operating systems needs an explicit merge config.
  - **GitHub Actions example:**
    - Matrix `shardIndex: [1,2,3,4]` with `fail-fast: false`.
    - Each shard uploads `blob-report-${{ matrix.shardIndex }}` with `retention-days: 1` when `!cancelled()`.
    - A merge job downloads `blob-report-*` with `merge-multiple: true` and uploads the HTML report with 14-day retention.
  - Four shards make the suite complete "four times faster" (an idealized doc claim).
- **Playwright CI guidance** ([Playwright: CI](https://playwright.dev/docs/ci)):
  - "Caching browser binaries is not recommended, since the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries". OS dependencies can't be cached. If you cache anyway, key on the Playwright version.
  - Use `npx playwright install --with-deps`. A Docker image is available.
  - "We recommend setting workers to '1' in CI environments to prioritize stability and reproducibility."
- **actions/upload-artifact limits** ([actions/upload-artifact README](https://github.com/actions/upload-artifact); via `gh api`):
  - "Within an individual job, there is a limit of 500 artifacts".
  - The storage quota is recalculated every 6–12h.
  - `retention-days` ranges from 1 to 90 unless the repo setting changes it.
  - `compression-level` runs 0–9 with default 6: "For large files that are not easily compressed, a value of `0` is recommended for significantly faster uploads".
  - `overwrite`: by default, uploading to an existing artifact name fails.
  - `archive: false` uploads a single file unzipped. The artifact is named after the file, and multiple files fail.
  - Zipped uploads lose file permissions.
- **upload-artifact releases** ([upload-artifact releases](https://github.com/actions/upload-artifact/releases); via `gh api`):
  - v5.0.0 (2025-10-24): preliminary Node 24 support.
  - v6.0.0 (2025-12-12): runs on Node 24; needs runner ≥ 2.327.1.
  - v7.0.0 (2026-02-26): direct, unzipped single-file uploads; ESM.
  - v7.0.2 (2026-10-07): latest at fetch time.
- **Argos parallel uploads** ([Argos: Cached CI pipelines](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/cached-pipelines.md) [VENDOR]):
  - Finalize mode uses `ARGOS_PARALLEL=true`, `ARGOS_PARALLEL_TOTAL=-1` and a shared build name.
  - The nonce includes the GitHub run attempt, and partial re-runs fill missing shards from the previous attempt.
- **Merge-queue concurrency as a cost lever.** "Build concurrency" (1–100) throttles concurrent `merge_group` builds — [GitHub Docs: Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Separately, GitHub's changelog says Actions concurrency groups now allow larger queues (2026-05-07) [SNIPPET: title only].
- **Field scale.** PostHog runs its VR suite in 16 shards for about 6,052 snapshots — [PostHog#106132](https://github.com/PostHog/posthog/pull/106132).
- **Throughput and billing claims:**
  - Happo "processes hundreds, even thousands of diffs every minute" [VENDOR] — [Happo: Compare threshold](https://docs.happo.io/docs/compare-threshold).
  - TurboSnap bills copied snapshots at 1/5 — [Chromatic: TurboSnap](https://www.chromatic.com/docs/turbosnap/).

### Inferences

- **Compression for diff images.** PNGs are already compressed, so `compression-level: 0` probably speeds up uploads. This applies the README's advice for incompressible data; it was not tested for PNGs.
- **Artifact naming.** Per-shard artifacts need unique names, and a job must stay under 500 artifacts.
- **Unzipped uploads.** v7's unzipped mode suits a single summary or HTML file, not directories of images.
- **Shard layout.** Shard by route list and finish with one merge job that posts a single PR comment and status. This mirrors blob/merge-reports and Argos finalize, and avoids several shards each posting partial statuses.

### Gaps

- No published duration per 100 screenshots from any vendor or Playwright; only qualitative or vendor throughput claims.
- GitHub per-artifact size limits and storage billing tiers were not verified this session (README-level limits only).

---

## Roadmap implications

These items apply to a local-first, pixelmatch-gated CLI with a composite GitHub Action and orphan-branch baselines.

**Tags:**
- **NEW**: a new candidate.
- **EVIDENCE-FOR-EXISTING-ITEM**: evidence for an item already filed.
- **ALREADY-SHIPPED**: confirms or refines something the product already does.
- **DO-NOT-BUILD**: an explicit recommendation against.

Statements about the product's current internals come only from the provided context. They are framed conditionally where the internals are unknown.

1. **NEW — `merge_group` support in the Action, as a verify-only full run.**
   - **Triggers.** Document `on: { pull_request, merge_group }` with an identical job name. Do not use workflow-level `paths:`, which leaves the check Pending forever.
   - **On `merge_group`:**
     - Capture `github.sha`, which equals `merge_group.head_sha`.
     - Anchor baseline selection at `merge_group.base_sha`.
     - Ignore changed-file scoping and run **all routes**.
     - Never write baselines or accept approvals.
     - Exit 1 on regressions so GitHub ejects the PR (Chromatic's behaviour), and keep exit 2 for tool errors.
   - **PR number.** Parse it from `head_ref`: `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>`.
   - **Where to report.** Post results to the job summary and the status, not to a PR comment.
   - **Evidence:**
     - GitHub event docs and the octokit payload schema (Q1).
     - Chromatic and Argos merge-queue docs.
     - PostHog#109926 and PostHog#106955, where the queue runs full and approvals are disabled there.
   - **Counter-example:** bcgov#5315 turned Happo off in the queue.

2. **NEW — Approvals that reach the merge group.**
   - **The problem.** In a group, a later PR's queue commit contains earlier PRs' approved changes. Comparing it only against baselines at `base_sha` would falsely fail it (Q1 inference).
   - **Proposal:**
     - Find the PRs in the group from the commits between `base_sha` and `head_sha`, or via the GitHub API.
     - Apply their approval records on top of the base baseline.
     - Fail if any changed route lacks approval.
   - **Conditional.** If `update-baselines` currently writes straight to the shared orphan branch from a PR, it also changes baselines for every other open PR before merge. Consider PR-scoped staging, promoted on merge or queue success.
   - **Evidence:** Argos "merge base of all pull requests in the queue" and `ARGOS_MERGE_QUEUE_PRS`; Chromatic "accepted on the PR → passes".

3. **NEW — Approval as a commit status on the head SHA (not a check run).**
   - **States.** Post a distinct status context, e.g. `<tool>/visual-approval`:
     - `failure`: unapproved regressions or new pages.
     - `success`: pass, or everything approved.
     - Never leave it `pending`.
   - **Description.** Include counts, e.g. "4 changed, 3 known-flake" (Argos-style).
   - **`target_url`.** Point it at the job summary or artifact.
   - **Which SHA.** Post on the PR head (as Argos does) and on `merge_group.head_sha` in the queue.
   - **Re-evaluating after approval.** Approval events (see item 4) should re-evaluate the status from stored results without re-capturing.
   - **Multi-invocation monorepos.** Offer a single summary status, like `argos/summary` with its "always" option.
   - **Naming.** Use a different name from the job name, because a same-named check and status must both pass.
   - **Evidence:** Argos, Percy and Happo statuses; storybook-vrt sets a blocking status with `github.token`; GitHub troubleshooting docs (Q2).

4. **NEW — Content-addressed approvals, and the approval channel. Overlaps the filed "human confirmation for baseline writes" item.**
   - **Key.** Key each approval on (route, viewport/browser, baselineSha256, candidateSha256). It then carries across new commits, rebases and squash merges, as Percy's carry-forward and Happo's hash identity do.
   - **Channel options:**
     - **(a) A committed approvals file in the PR.** It travels with the code and is visible in review. Mitigate stale-merge entry loss (PostHog#109926) with one entry per line, sorted keys, and a CI check that entries aren't dropped without the route being removed.
     - **(b) A PR-comment command.** storybook-vrt pattern: write-access users only, revoked by deleting the comment, and the workflow must already be on the default branch.
   - **Rule.** Never accept approvals from `merge_group` runs (PostHog `observe` runs).

5. **NEW — A merge-base baseline-selection rule with documented fallbacks.**
   - **Indexing.** Record, for each baseline set on the orphan branch, the target-branch commit it represents.
   - **Selection.** Pick the newest set whose commit is an ancestor of `merge-base(PR head, PR base)` (Argos, Percy, Happo).
   - **Fallbacks:**
     - Use the latest default-branch set with a visible warning (Percy).
     - With no baseline at all, emit a distinct "no baseline" result rather than N "new page" regressions.
   - **Capture SHA.** Capture the PR head SHA rather than `refs/pull/N/merge` (Happo, Chromatic; the GitHub 2026-02 change can leave the merge ref up to 12h old).
   - **Git history.** The Action should fetch enough history (Happo uses `fetch-depth: 100`; Chromatic examples use 0). When the merge base can't be computed, warn and fall back explicitly.
   - **Stacked PRs.** When the PR base isn't the default branch, resolve against the base branch's baselines if any, otherwise against the default-branch merge base. Document the limitation.

6. **NEW — A deterministic known-flake list: exact hash pair first, fingerprint later.**
   - **v1 entry.** {route, viewport, baselineSha256, candidateSha256, reason, addedBy, addedAt, expiresAt}.
   - **v1 behaviour:**
     - A match downgrades the regression to a *warning* (exit 0, which already exists).
     - The PR comment shows "known-flake" counts.
     - An entry auto-invalidates when the baseline hash changes (Happo semantics).
   - **Storage.** Store the list next to the baselines on the orphan branch, so fork PRs and the queue can read it. PostHog's fork PRs failed when tolerance memory was unreadable.
   - **v2 (optional).** A diff-shape fingerprint: a hash of the quantized geometry of diff clusters, or of a downsampled binary diff mask, scoped to the route (Argos's "test + fingerprint" pair).
   - **Hygiene:**
     - Require expiry (PostHog).
     - Show occurrences and last-seen (Argos).
     - Restrict additions to write-access users, since an ignore approves (Happo).
   - **Auto-detection.** Only *propose* entries, after N recurrences in a window on default-branch runs (Argos default: 3 in 7 days). Adding stays behind human confirmation.

7. **NEW — Opt-in repeat-capture instability check.**
   - **Mechanism:**
     - For routes that fail, recapture K times in fresh contexts.
     - If the recaptures differ from each other (hash mismatch), classify the route as **unstable**: a warning, not a regression.
     - If every recapture is identical but differs from the baseline, it is a real regression.
   - **Flag.** Offer `--fail-on-unstable`, mirroring Playwright `--fail-on-flaky-tests`.
   - **Properties.** Deterministic (hashes) and costs only extra captures on failing routes.
   - **Evidence:** the Chromatic Flake Filter (repeat renders, one billable snapshot) and SteadySnap burst capture; Playwright's retry and flaky semantics.

8. **NEW — A comparator version policy, and exposure of pixelmatch's newer noise controls.**
   - **Policy:**
     - Pin pixelmatch's major version.
     - Record the comparator name, version and options in baseline metadata.
     - Treat a change as baseline-affecting: force a full run and require re-baselining.
   - **Why.** v8.0.0 (2026-10-06) replaced YIQ with OKLab/HyAB and says "diff counts will differ"; Chromatic counts "infrastructure upgrades" as a full-rebuild trigger.
   - **Options to expose.** Consider config for `windowSize`, a dense-cluster gate that suppresses scattered anti-alias and dither noise, and `ignoreMask` for per-route masks. Both are deterministic and native to the existing gate.

9. **ALREADY-SHIPPED (changed-file route scoping with all-routes fallback), plus NEW refinements.**
   - **(a) Subset semantics.** Routes outside scope are "not run", never "removed", and scoped runs never write baselines (Argos subset).
   - **(b) Always full** on `merge_group` and default-branch pushes (PostHog).
   - **(c) Built-in full-run triggers**, plus a configurable `globalFiles` glob list:
     - lockfile and package manifest (Nx default `all`);
     - tool config;
     - global CSS, tokens and fonts (TurboSnap's `preview.js` rule);
     - public/static assets;
     - browser or comparator version;
     - history too shallow for merge-base (Turborepo).
   - **(d) Merge-queue diff base.** If scoping is ever applied in the queue, diff `merge_group.base_sha..head_sha` (dorny/paths-filter behaviour).

10. **NEW — A "skip-as-success" outcome.** Add a flag or env var that posts a `success` status ("skipped: no affected routes", or an explicit opt-out) instead of relying on workflow `paths:` filters. Evidence: GitHub's Pending pitfall; Chromatic `--skip`; Argos `ARGOS_SKIPPED` and `finalize --skip-if-empty`.

11. **NEW (small) — Sharded capture plus a single merge step, and artifact hygiene.**
    - Add `--shard i/n` over routes, plus a `merge` command that combines shard results into one PR comment and one status (Playwright blob/merge-reports; Argos finalize).
    - In the Action:
      - unique per-shard artifact names, staying under 500 per job;
      - `compression-level: 0` for PNG-heavy artifacts (an inference);
      - short retention for shard artifacts (Playwright's example uses 1 day);
      - `archive: false` only for single summary files (v7).
    - Document merge-queue "build concurrency" as the main cost knob.

12. **EVIDENCE-FOR-EXISTING-ITEM — Human confirmation for baseline writes.**
    - Argos: "One rejection blocks"; only the latest review per reviewer counts.
    - Happo restricts flake reporting to reviewers because "an ignored diff can approve a comparison".
    - storybook-vrt: write-access-only comment approvals, with revocation.
    - PostHog disables approval on merge-queue runs.
    - Percy: approval-required branches.
    - New sub-requirement from this research: refuse baseline writes or approvals originating from `merge_group` events and from scoped (subset) runs.

13. **EVIDENCE-FOR-EXISTING-ITEM — Blocking baseline updates on new serious axe violations.**
    - Happo blocks approval when a change adds an accessibility violation [SNIPPET].
    - Chromatic forces a full TurboSnap rebuild the first time Accessibility Tests are enabled on a branch [TurboSnap doc].
    - The evidence is thin; no vendor documents severity thresholds.

14. **EVIDENCE-FOR-EXISTING-ITEM — Orphan-branch PNG history pruning.**
    - storybook-vrt uses the same orphan-branch image pattern (`vrt-snapshots`) and documents no pruning.
    - PostHog commits only content hashes (`snapshots.yml`) and keeps images server-side, an alternative that avoids PNG history growth.
    - New constraint from item 5: pruning must keep every baseline set reachable as the merge-base ancestor of an open PR. Otherwise merge-base selection silently falls back.

15. **EVIDENCE-FOR-EXISTING-ITEM — Hosted review UI (gated) and S3 baseline storage (gated).**
    - Vendor review UIs show the expected scope: per-reviewer states, an ignore/flake button, an ignored-changes list with occurrences, and journey views (Argos); ignored-diff provenance labels (Happo).
    - For remote baseline storage, Argos warns that a remote cache "extend[s] the cache's trust model to baselines". The same trust question applies to shared S3 baselines written from PR runners.

16. **DO-NOT-BUILD (now) — Checks API `requested_action` approve buttons.**
    - Only GitHub Apps can write check runs and receive `requested_action`.
    - A composite Action can't host the webhook.
    - The UI is limited to 3 buttons with 20-character labels.
    - No vendor found uses it; Argos deliberately uses statuses.
    - Revisit only alongside the gated hosted review UI or GitHub App.

17. **DO-NOT-BUILD — Auto-passing or skipping the visual gate in the merge queue.**
    - The bcgov pattern gives up the only exact-commit verification.
    - Chromatic and Argos re-verify in the queue.
    - GitHub's April 2026 squash regression and PostHog's stale-merge case show that queue commits can differ from what each PR tested.
    - Ship item 1 instead.

18. **DO-NOT-BUILD — Model or AI-based noise suppression in the pass/fail gate.**
    - It conflicts with "pixelmatch is the only gate".
    - Argos explicitly rejects AI diffing for explainability and auditability.
    - Percy's AI diff is disabled as soon as users add regions or sensitivity overrides.
    - Use items 6–8 for deterministic noise control.

19. **DO-NOT-BUILD — A browser-binary cache step in the Action.**
    - Playwright says restoring the cache takes about as long as downloading the binaries, and OS dependencies can't be cached.
    - Prefer `playwright install --with-deps` or the Playwright Docker image.

---

## Query log

**Web searches (WebSearch tool), verbatim, in order.** Domain filters are shown in brackets.

1. `Chromatic merge queue merge_group`
2. `Argos CI merge queue`
3. `Percy visual testing GitHub merge queue`
4. `Happo merge queue GitHub`
5. `merge queue chromatic docs` [allowed_domains: chromatic.com]
6. `Percy merge queue baseline` [allowed_domains: browserstack.com, docs.percy.io]
7. `happo merge queue` [allowed_domains: happo.io, docs.happo.io, github.com]
8. `Happo GitHub status check required approve diffs` [allowed_domains: docs.happo.io, happo.io]
9. `Chromatic UI Tests UI Review status checks required branch protection` [allowed_domains: chromatic.com]
10. `Chromatic flaky snapshots unstable tests` [allowed_domains: chromatic.com]
11. `Percy GitHub commit status approve build auto-approve branches` [allowed_domains: browserstack.com, docs.percy.io]
12. `Happo flaky diffs flake` [allowed_domains: docs.happo.io, happo.io]
13. `Percy flaky snapshots Intelli-ignore sensitivity noise reduction` [allowed_domains: browserstack.com, docs.percy.io]
14. `github changelog merge queue 2026` [allowed_domains: github.blog]
15. `nx-set-shas merge_group affected base`
16. `Chromatic SteadySnap burst capture`
17. `visual snapshot approval label GitHub Action update screenshots comment command`
18. `SteadySnap Chromatic stabilization` [allowed_domains: chromatic.com]
19. `PostHog visual review snapshots GitHub status check` [allowed_domains: posthog.com, github.com]

**GitHub API search queries (`gh api`), verbatim:**

- GraphQL discussion search: `repo:community/community merge_group required status check` (type: DISCUSSION)
- REST code search: `repo:PostHog/posthog quarantine path:products/visual_review`

**Direct fetches (no search terms sent).** These were WebFetch, `curl` or `gh api` reads of the URLs cited above.

- **GitHub docs and changelog:** docs.github.com pages, github.blog changelog posts and the availability post.
- **Argos:** argos-ci.com changelog, `llms.txt`, `llms-full.txt`, and docs `.md` pages.
- **Chromatic:** chromatic.com docs, blog and features pages.
- **Percy:** browserstack.com Percy docs and the ai-agents page. docs.percy.io returned 301 redirects.
- **Happo:** docs.happo.io pages and sitemap, and the happo.io blog.
- **Playwright:** playwright.dev pages, plus raw docs from microsoft/playwright (`release-notes-js.md`, `test-cli-js.md`, `class-pageassertions.md`) and its release dates.
- **Monorepo tools:** nx.dev and turborepo.dev.
- **GitHub repos via `gh api`:** octokit/webhooks schemas; actions/upload-artifact README and releases; nrwl/nx-set-shas; dorny/paths-filter; mapbox/pixelmatch README and releases; krystxf/storybook-vrt; bcgov/cas-registration#5315; PostHog/posthog PRs #106132, #106955, #109926 and #111896, plus `frontend/snapshots.yml`, `diffing.py`, `contracts.py` and `quarantine.py`.

**Confidentiality check.** No query contained the product's name, domain, owner or org, internal file names, or verbatim code.

### Security notes (instruction-like content observed in fetched data)

- **Argos docs footer.** Argos's GitBook-hosted docs, as fetched in markdown form (e.g. `https://argos-ci.com/docs/learn/integrations/github-integration.md`), end with a "# Agent Instructions" block. It tells AI agents to "Perform an HTTP GET request" to `https://argos-ci.com/docs/<page>.md?ask=<question>&goal=<user_goal>`. That would send the user's goal to a third party.
  - **Not followed.** Treated as data.
  - **Effect on this research.** Later Argos pages were cut off at that marker by the extraction script, so none of their content was lost.
- **PostHog PR bodies.** These contain agent-provenance metadata, such as "Agent context" sections and HTML comments with "self-driving-origin" IDs. They are descriptive, not instructions, and nothing was actioned.
- No other instruction-like content was encountered.
