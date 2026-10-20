# Lock the approval path before widening capture

> Publication note (2026-10-20): This is a historical planning draft from 2026-10-19. Its proposed issue counts, options and statements about what was filed are superseded by [the current roadmap](../docs/ROADMAP.md) and [the archive index](README.md). Do not paste draft specifications unchanged. Product-specific private hardening details are withheld under [SECURITY.md](../SECURITY.md).
> Filed mapping: N1 → #303, N3 → #304, N4 → #305, N5 → #306, N7 → #307, N8 → #308, N9 → #309, N10 → #310. Verification also filed #301 and #302. Two other items remain private.

The second pass prioritizes the approval boundary (#287), advisory-only judge output (#286), and renderer provenance (#303), followed by the pixel budget and validation (#284, #285). Public proposals are mapped to their filed issues in the publication note below. Two product-specific hardening findings are tracked privately under SECURITY.md; their details are withheld from this public copy. The strongest support comes from platform documentation and repository checks; direct demand remains limited.

## Ten new issues join, and three filed ones move

This is the planning draft from the second pass, before filing. Its provisional labels and counts are historical. The final pass filed ten public issues (#301–#310), including two correctness bugs found during verification, and kept two hardening items private. The current ordering is in [docs/ROADMAP.md](../docs/ROADMAP.md).

| # | Issue | Status | Change in this pass | Blocked by or depends on |
| --- | --- | --- | --- | --- |
| **Now** | | | | |
| 1 | [#287](https://github.com/ravidsrk/frontguard/issues/287) Separate baseline writes from the agent that edited the UI | Filed | Rescoped: rewrite the skill, guard the Action's push, make a credential the agent lacks the control | — |
| 2 | [#286](https://github.com/ravidsrk/frontguard/issues/286) Advisory judge evaluation, model output off exit codes | Filed | Rescoped: judge verdicts stop setting exit 1; injection fixtures; UI-Lens classes | — |
| 3 | N1 Fingerprint the renderer and comparator in the baseline manifest | **New** | Absorbs #289's runner-change warning | Lands before #284 |
| 4 | Private hardening item | Tracked privately | Details withheld | — |
| 5 | [#284](https://github.com/ravidsrk/frontguard/issues/284) Small-text misses under the 10% budget; pixelmatch 8 | Filed | Rescoped: pin is 7.2.0; size-mismatch rule; both packages | N1 |
| 6 | [#285](https://github.com/ravidsrk/frontguard/issues/285) Re-run pixel validation with true-positive fixtures | Filed | Method added: mutation operators, viewport-bucketed recall | #284 fixtures, N1 |
| **Next** | | | | |
| 7 | [#288](https://github.com/ravidsrk/frontguard/issues/288) Block baseline updates on new serious axe violations | Filed | **Moved from Now** | #287 |
| 8 | N3 Verify-only full run in GitHub merge queues | **New** | — | #287 |
| 9 | N4 Human `frontguard review` command | **New** | — | #287, N1, #288 |
| 10 | N5 Design PR-scoped approvals and merge-base baseline selection | **New** | — | #287; constrains #290, #295, N9 |
| 11 | Private hardening item | Tracked privately | Details withheld | — |
| 12 | N7 Declare MCP tool annotations, promotion tools marked destructive | **New** | Can ship with #287 | — |
| 13 | [#289](https://github.com/ravidsrk/frontguard/issues/289) Story discovery continuity | Filed | **Split**: warning moves to N1; Storybook 9–11 fixtures added; Histoire discovery-only | — |
| 14 | [#290](https://github.com/ravidsrk/frontguard/issues/290) Prune PNG history on the orphan branch | Filed | Rescoped: add stale-shot removal; never prune from a filtered run | N5 constraint |
| 15 | [#291](https://github.com/ravidsrk/frontguard/issues/291) Split `pipeline.ts` | Filed | Unchanged | — |
| 16 | [#292](https://github.com/ravidsrk/frontguard/issues/292) CLI coverage thresholds | Filed | Unchanged | Now tests |
| **Later** | | | | |
| 17 | [#293](https://github.com/ravidsrk/frontguard/issues/293) Close the three cloud-api deploy gates | Filed | Unchanged | — |
| 18 | [#294](https://github.com/ravidsrk/frontguard/issues/294) Hosted review UI design | Filed | New dependency | #293, N4 |
| 19 | [#295](https://github.com/ravidsrk/frontguard/issues/295) S3 baseline storage design | Filed | New dependencies | #293, #290, N5, N1 |
| 20 | [#298](https://github.com/ravidsrk/frontguard/issues/298) Aged ignore masks | Filed | Evidence upgraded from a single vendor-side account to field-backed; expiry and occurrence telemetry | #287 |
| 21 | [#299](https://github.com/ravidsrk/frontguard/issues/299) Non-gating ARIA and text snapshots | Filed | Rescoped: reuse the Playwright package's existing capture | — |
| 22 | N8 Report-only viewport-overflow check | **New** | — | #285, #286 |
| 23 | N9 Named capture modes with mode-keyed baselines | **New**, bet | — | N1, N5, #290 |
| 24 | N10 MCP SDK v2 migration, then registry listing | **New**, dated | — | N7 |
| 25 | [#296](https://github.com/ravidsrk/frontguard/issues/296) CLI OpenTelemetry | Filed | Unchanged | — |
| 26 | [#297](https://github.com/ravidsrk/frontguard/issues/297) `apps/web` accessibility audit | Filed | Unchanged | — |

Weigh each signal by where it comes from, because the eight notes files mix very different kinds of evidence. Reactions on GitHub are real users, but they sit mostly in other tools' trackers, and those tools often closed the requests without comment. X reach belongs to vendor launches and security disclosures. Practitioner posts about visual testing rarely pass a few thousand views. The table below is the scale used for every **Signal** rating in this report.

| Source | What it shows in this pass | Weight |
| --- | --- | --- |
| GitHub reactions, 10 repos, 307 queries | Environment-consistent baselines **243 +1** across 21 issues; review/approval **149**; baseline update workflow **141**; capture stability **138**; comparator semantics **110**; storage and format **105**; capture matrices **16**; agents and MCP **8**; merge queues: no relevant hits. The largest single asks are Docker rendering and an accept button ([#20954](https://github.com/microsoft/playwright/issues/20954), [#24310](https://github.com/microsoft/playwright/issues/24310)) | Moderate: real users, other tools' trackers |
| X, 50 searches plus the FxTwitter API | Six-figure reach only for vendor launches and security disclosures; zero posts on merge queues, one-mode suites, or agents regenerating baselines ([Codex browser launch](https://x.com/JamesZmSun/status/2044855812586365212), [Brave disclosure](https://x.com/brave/status/1980667345317286293)) | Weak for demand |
| Vendor docs (Chromatic, Argos, Percy, Happo) | Converge on merge-base selection, PR-scoped approvals, hash-keyed flake memory and queue re-verification | Moderate: self-reported but consistent |
| Platform docs, CVEs, GHSAs | GitHub `merge_group` mechanics; MCP annotation and elicitation rules; NVD "prompt injection" CVEs **18 → 34 → 95** for 2024, 2025, 2026 to date ([NVD query](https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=prompt%20injection&keywordExactMatch)) | Strong |
| Papers | UI-Lens (CVPR 2026) and VERVE/STVR (journals) are substantial; MIXVRT, ReBDiff, ReDeFix and a 6-page preprint are small | Strong to weak by paper |
| This worktree | Skill, judge exit codes, Action push, comment escaping, manifest fields | Strong, but grep-level reads |

`docs/ROADMAP.md` needs edits beyond the reorder. It cites `diff/ai-classifier.ts`, but the classifier lives in `diff/ai-vision.ts`. Its line that model output "never silently passes a failing pixel check" holds only on the default compare path; judge mode sets exit codes from model verdicts until #286 lands. It lists `captureAriaSnapshot` without saying that nothing stores or diffs the result. Section 5's not-on-roadmap list should absorb the do-not-build findings at the end of this report ([ROADMAP](../docs/ROADMAP.md)). Tracking issue #283 should take the new children in the order above, add "blocked by" links, and carry the verification checklist from the next section.

## Repository checks overturn four assumptions behind Now

The notes lean on many claims about current Frontguard behaviour that their authors could not verify. A read-only spot check of this worktree resolved most of them. Four results change the plan.

The skill steers agents into the write the roadmap is trying to remove. `skills/frontguard/SKILL.md` tells an agent to work `list_regressions → inspect_diff_cluster_dom → verify_css_patch → promote_baseline`. Its first workflow is "Record or update baselines" with `npx frontguard update-baselines` ([SKILL.md](../skills/frontguard/SKILL.md)).

Judge mode puts model output on the exit code. `buildJudgeResult` maps failing judgements to `regressions`, and `comparisonExitCode` turns any regression into exit **1**. That violates the rule that model output stays off exit codes ([pipeline.ts](../packages/cli/src/core/pipeline.ts), [exit-code.ts](../packages/cli/src/cli/exit-code.ts)). The default path is clean: there, `aiAnalysis` only chooses which diffs get fix generation, and status comes from the pixel diff and the threshold.

The Action writes the shared baseline from any event. With `update-baselines: true`, `action-run.sh` runs `frontguard run --update-baselines` and then `git push origin frontguard-baselines`, with no event check ([action-run.sh](../action-run.sh)).

A further product-specific finding is tracked privately; details are withheld under SECURITY.md.

Other checks delete candidate issues the notes proposed. The CLI already exits 2 when no comparison ran or any route errored. The Action already fails when the total is zero or the baseline branch is unpublished. The MCP server launches no browser, so restricting where it navigates is moot. `smartFilter` already treats lockfiles, configs, global CSS and token files as global.

Table A lists what the spot check found for each claim. Every row is a grep-level reading of named files. The issue author should still confirm the row before filing anything that depends on it.

| Claim the notes relied on | Spot-check finding (2026-10-19) | Effect |
| --- | --- | --- |
| Pixelmatch pin unknown (earlier pass) or assumed to be 7.2 (test-runner notes) | `^7.2.0` in `packages/cli` and `packages/playwright`; lockfile resolves **7.2.0** ([cli package.json](../packages/cli/package.json)) | #284 is a major bump |
| Agents are kept away from promotion | Skill ends the agent path at `promote_baseline` and runs `update-baselines` | #287 must rewrite the skill |
| Judge mode cannot move exit codes | Failing verdicts become `regressions`, exit 1 | #286's first change |
| `update-baselines` might write the shared branch from PRs | Action pushes on any event; CLI `update-baselines` has no confirmation ([cli/index.ts](../packages/cli/src/cli/index.ts)) | #287, N3, N5 |
| MCP ships `outputSchema` and `structuredContent` | All seven tools do, with a JSON text mirror; none declares annotations; SDK `^1.32.1`; no `mcpName` or `server.json` ([mcp index.ts](../packages/mcp/src/index.ts)) | N7, N10 |
| MCP tools render pages | None launch a browser; `verify_css_patch` is static | Drop the origin-restriction candidate |
| Regression rows carry image paths | Rows carry ids, route, viewport, status, diff percentage, classification, `hasSuggestedFix`, `reportUrl`; no image paths ([list-regressions.ts](../packages/mcp/src/tools/list-regressions.ts)) | Deferred |
| CLI may not fail closed on zero captures | Exit 2 when total is 0 or errors exist; Action errors on `TOTAL -eq 0` and on an unpublished baseline branch | Drop the candidate |
| `merge_group` support | No occurrence anywhere in the tree | N3 |
| `smartFilter` misses global changes | Lockfiles, `package.json`, framework, Tailwind, PostCSS and TS configs, global CSS, theme and token files force all routes; an empty affected set renders all; base is `origin/main...HEAD`, then `HEAD~1` ([resolver.ts](../packages/cli/src/graph/resolver.ts)) | Mostly shipped; queue and shallow cases go to N3 |
| A SHA-256 manifest ships | Schema version, `createdBy`, `updatedAt`, `sourceCommitSha`, `sourceBranch`, and a SHA-256 of each snapshot's PNG buffer; no browser, Playwright, OS, scale factor or comparator ([types.ts](../packages/cli/src/core/types.ts)) | N1; N5 builds on `sourceCommitSha` |
| A single `colorScheme` ships | Context gets viewport, `storageState` and `colorScheme` only; path is `baselines/<route>/<viewport>/<browser>.png` ([git-orphan.ts](../packages/cli/src/storage/git-orphan.ts)) | N9 |
| Capture options and font waits | `page.screenshot({ fullPage: true, type: 'png' })`; animations frozen by injected CSS; `document.fonts.ready` awaited with no timeout ([playwright.ts](../packages/cli/src/render/playwright.ts)) | N1 |
| Size mismatches handled like peers | Both images padded to the larger size and marked `changed`; the pipeline upgrades to `regression` only above the threshold ([pixel.ts](../packages/cli/src/diff/pixel.ts)) | #284 |
| Multi-render consensus | `antiFlakeRenders` keeps the most common byte-identical frame; the `flaky` status type exists but nothing assigns it | #285 measures; reporting deferred |
| No ARIA capture | `@frontguard/playwright` captures an ARIA string and returns it; nothing stores or diffs it; the CLI has none ([visual-test.ts](../packages/playwright/src/visual-test.ts)) | #299 |
| Action pins browsers | `playwright install --with-deps` runs from `@frontguard/cli@0.2.3`'s own Playwright ([action.yml](../action.yml)) | #284's pin criterion is met |


Table B lists claims the spot check did not settle. Resolve each one against the code before filing the issue named in the last column.

| Still unverified | Why it matters | Check before filing |
| --- | --- | --- |
| Whether config validation rejects two entries for the same route path with different `colorScheme` | The path has no mode segment, so accepted duplicates would overwrite each other's baselines today | N9; a bug fix now if confirmed |
| Storybook 9, 10 (ESM-only) and 11-alpha index and iframe compatibility | The parser reads `entries` but labels it Storybook 8 | #289 |
| The Docker renderer: published image, `--init`, `--ipc=host`, non-Alpine base | N1 records an image digest only if one exists | N1 |
| `page.screenshot` defaults in the pinned Playwright | Explicit options must equal them, or N1 causes baseline churn | N1 |
| Upper bound on the `waitForStability` loop | Vitest's `timeout: 0` can loop forever | N1 |
| `smartFilter` base on `merge_group` refs and on `fetch-depth: 2` | The `HEAD~1` fallback could scope a multi-commit PR to its last commit | N3 |
| Whether the uploaded `frontguard-report` artifact holds full-resolution current PNGs | `review --from` needs them | N4 |
| Consumer docs that recommend `update-baselines: true` on PR events | Blast radius of #287's guard | #287, N3 |
| Whether the Firefox COOP emulation fix is in the pinned Playwright | Firefox drops `colorScheme` after COOP navigation until it is ([#43287](https://github.com/microsoft/playwright/issues/43287)) | N9 |
| Hover reset, mid-capture resize, lazy-content pre-scroll, background-image waits | The notes listed these as anti-flake sub-items to verify | #285 fixtures |
| How pixelmatch 8 changes Frontguard's own fixture counts | WDIO's ±3% is someone else's corpus | #284 |

Three corrections to the earlier pass follow from the deeper notes. Lost Pixel's `compare.ts` has now been read. Pixelmatch was its default gate, with a per-pixel threshold of **0** and a shot budget of **0** pixels; odiff was opt-in; and it silently resized mismatched images ([compare.ts](https://github.com/lost-pixel/lost-pixel/blob/main/src/compare/compare.ts)). MIXVRT has now been read too. Its evaluation is **4** students on **2** pages with **3** embedded defects each, so it supports no accuracy claim ([MIXVRT](https://www.jstage.jst.go.jp/article/jrnal/11/3/11_8/_pdf/-char/en)). The earlier statement that Frontguard does not capture ARIA snapshots is wrong for `@frontguard/playwright`.

## Ten new issues, specified for filing

Each spec below is meant to paste into GitHub. The **Signal** line uses the scale from the first section. The **Depends on** line names filed issues by number and new ones by their N label.

### Now: fingerprint the renderer

#### N1. Fingerprint the renderer and comparator in the baseline manifest

**Placement:** Now, landing before #284. **Signal:** strong: primary release notes, a maintainer-measured comparator shift, gaps confirmed in code, and the largest GitHub demand theme. **Depends on:** absorbs #289's runner-change warning; precedes #284; feeds #285's write-up, N4's `--from` check and N5's baseline keys.

**Problem.** A baseline records who wrote it but not what rendered it. The manifest stores `createdBy`, `sourceCommitSha`, `sourceBranch` and a SHA-256 per snapshot. Images live at `baselines/<route>/<viewport>/<browser>.png`. Nothing records the browser build, Playwright version, headless mode, OS, device scale factor or comparator. Yet the stack moved under users with no config change. Playwright enabled a new Chromium screenshot implementation, merged **2025-08-27** ([PR #37201](https://github.com/microsoft/playwright/pull/37201)). It switched to Chrome for Testing builds in 1.57 on **2025-11-25**, then on arm64 Linux in 1.63 ([v1.57.0](https://github.com/microsoft/playwright/releases/tag/v1.57.0), [v1.63.0](https://github.com/microsoft/playwright/releases/tag/v1.63.0)). In 1.64 it began forwarding `screen` from device descriptors, so media queries now see the emulated screen ([v1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0)).

The comparator is next. Pixelmatch 8 swaps YIQ for OKLab and HyAB and tells users with tuned thresholds to re-check them, because diff counts will differ ([pixelmatch](https://github.com/mapbox/pixelmatch)). WebdriverIO, the first mainstream runner on v8, measured differing-pixel counts moving by about **−3% to +3%** on real screenshots ([WDIO changelog](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/CHANGELOG.md)). Vitest warns that "references generated on one machine will often fail on another" ([Vitest docs](https://vitest.dev/guide/browser/visual-regression-testing)). Environment-consistent baselines are the largest visual-testing demand theme on GitHub, led by a Playwright Docker request with **98 +1** that maintainers closed as not planned ([#20954](https://github.com/microsoft/playwright/issues/20954), [#20552](https://github.com/microsoft/playwright/issues/20552)).

Two capture hazards fail silently or hang. Frontguard awaits `document.fonts.ready` with no timeout, and a WebKit regression can leave it unresolved forever ([#42986](https://github.com/microsoft/playwright/issues/42986)). Chromium's headless shell loses default font families after any capture beyond the viewport ([#42962](https://github.com/microsoft/playwright/issues/42962)). Frontguard always captures `fullPage: true`, sometimes several times per shot.

**Scope.**
- **Manifest.** Bump the schema. For each snapshot set, record the Frontguard version and the Playwright version. Record the browser name, build and channel (Chrome for Testing or Chromium; headless shell or new headless) and whether `PLAYWRIGHT_LEGACY_SCREENSHOT` is set. Record the container image digest when one exists, the OS and architecture, and the device scale factor. Record the pixelmatch version and options, and the effective screenshot options.
- **Mismatch handling.** On a mismatch, warn with the differing fields. A strict setting exits **2**, because the comparison is untrustworthy, not because the pixels failed.
- **Scoping.** A changed browser build or comparator bypasses changed-file scoping for that run, as TurboSnap rebuilds everything after "infrastructure upgrades" ([TurboSnap](https://www.chromatic.com/docs/turbosnap/)).
- **Capture options and fonts.** Pass today's effective screenshot options explicitly. Bound the font wait with a timeout that exits 2 and names the route. Document the headless-shell font bug and recommend bundled web fonts.

**Non-goals.** No per-OS baseline variants, no automatic re-baselining, no font-hinting flags, no threshold change, no pixelmatch upgrade (#284 owns it), and no remote renderer.

**Acceptance criteria.**
1. Every snapshot written after the change carries every field above, and older manifests still load.
2. Comparing across browser builds prints a field-by-field warning. In strict mode the run exits 2, never 1.
3. A stub that never resolves `document.fonts.ready` exits 2 within the timeout and names the route.
4. Explicit screenshot options cause zero baseline churn on the existing fixtures.
5. A run whose browser build or comparator differs from the baseline renders all routes and says why.
6. #284's upgrade PR shows the comparator change in its first fingerprinted run.

#### Private hardening item

Product-specific details are withheld under [SECURITY.md](../SECURITY.md). This item is tracked privately.

### Next: give humans, not agents, the merge gate

#### N3. Run the Action as a verify-only full check in GitHub merge queues

**Placement:** Next. It is a correctness gap for teams that require the check and adopt merge queues. It is cheap, and no user has asked for it. **Signal:** strong mechanism (primary GitHub docs, a GitHub incident, a public field case) and consistent vendor practice, with no demand. **Depends on:** #287 for the write guard; queue semantics improve once N5 lands.

**Problem.** No `merge_group` trigger exists anywhere in the tree. GitHub states that if required checks come from Actions, `merge_group` must be added, or "status checks will not be triggered when you add a pull request to a merge queue." A required check skipped by a workflow-level path filter stays Pending and blocks the merge ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [required checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)). A community request to fix that pending behaviour has **295** upvotes ([discussion #44490](https://github.com/orgs/community/discussions/44490)).

Queue commits can differ from what each PR tested. GitHub's **2026-04-23** merge-queue regression made squash merges revert earlier PRs, in **658** repositories and **2,092** PRs per GitHub's post-mortem. GitHub's COO separately put the count at 2,804 PRs, so the counts differ by source ([GitHub blog](https://github.blog/news-insights/company-news/an-update-on-github-availability/), [@kdaigle](https://x.com/kdaigle/status/2047803291988590609)). PostHog's queue leg renders every story. It caught 8 entries a squash had dropped from its committed manifest, reporting "7069 unchanged, 0 changed, 8 new," while scoped PR runs stayed green ([PostHog#109926](https://github.com/PostHog/posthog/pull/109926)).

Chromatic and Argos document re-running in the queue and ejecting unapproved changes; both are vendor docs ([Chromatic](https://www.chromatic.com/docs/github-actions/), [Argos](https://argos-ci.com/changelog/2026-01-06-github-merge-queue)). bcgov turned Happo off in its queue, giving up the only test of the commit that lands ([bcgov#5315](https://github.com/bcgov/cas-registration/pull/5315)). Today's Action would also push baselines from a queue run if configured to. The X pass found no posts on this topic, and GitHub searches returned two irrelevant hits ([@suna_gaku](https://x.com/suna_gaku/status/2093104081229488466) is the nearest workflow signal).

**Scope.**
- **Template and docs.** Document `on: [pull_request, merge_group]` with an identical job name.
- **Queue behaviour.** On `merge_group`, render all routes regardless of `smartFilter` and compare against the published baseline branch. Refuse `update-baselines`. Exit 1 on regression so GitHub ejects the PR, and keep exit 2 for tool errors. Report to the job summary, since the payload has no PR number.
- **Warnings.** Warn against workflow-level `paths:` on a required check; `smartFilter` already renders everything when nothing is affected. Document capturing the PR head SHA and the fetch depth that `origin/<base>...HEAD` needs. State that until N5 lands, queue runs compare against the shared latest baseline.

**Non-goals.** No auto-pass or skip in the queue, no Checks API buttons, no approvals from queue runs, no `merge_group.destroyed` handling, and no Mergify-specific support.

**Acceptance criteria.**
1. A `merge_group` fixture event renders all routes even when `smartFilter` would scope them.
2. `update-baselines: true` on `merge_group` exits 2 and pushes nothing.
3. A queued regression exits 1, and the job summary lists it.
4. Docs state the shared-baseline limitation and link N5.
5. A test fixes `smartFilter`'s base on queue refs, either to the queue's base SHA or to all routes.

#### N4. Add a human `frontguard review` command that accepts shots one at a time

**Placement:** Next, after #287. It is the human path that #287 leaves open. **Signal:** moderate-to-strong demand, but in other tools' trackers. **Depends on:** #287 (who may publish), N1 (fingerprint check for `--from`), #288 (axe block); informs #294.

**Problem.** The local HTML report is a four-mode viewer that cannot write. The only write paths are `update-baselines`, which accepts everything without a prompt, and MCP promotion. Runner users have asked for exactly this and been turned down:
- **Playwright** closed "Accept new snapshot" in its HTML reporter and UI mode (**58 +1**) and an interactive review CLI (**42 +1**) as not planned. It also left open, without comment, a request to update references from the latest results without re-running (**3 +1**) ([#24310](https://github.com/microsoft/playwright/issues/24310), [#14883](https://github.com/microsoft/playwright/issues/14883), [#34376](https://github.com/microsoft/playwright/issues/34376)).
- **Vitest** maintainers want an Insta-style review mode ([#2229](https://github.com/vitest-dev/vitest/issues/2229)).
- **jest-image-snapshot** users hit `storeReceivedOnFailure` refusing to store received images in CI ([#331](https://github.com/americanexpress/jest-image-snapshot/issues/331)).

The day after #14883 closed, a Playwright contributor posted prompts that make Codex or Claude Code walk failing snapshots with a human choose, accept or skip step. A second flow downloads a Linux CI artifact, because local macOS renders differ ([#14883](https://github.com/microsoft/playwright/issues/14883)).

Working local designs exist. Testplane's html-reporter offers one-click accept and undo, including for Playwright ([html-reporter](https://github.com/gemini-testing/html-reporter#readme)). Histoire's `--update` requires an explicit filter or `--all` and never stages, commits or pushes ([Histoire](https://github.com/histoire-dev/histoire/blob/main/docs/guide/visual-testing.md)). Vitest recommends a manual `workflow_dispatch` job for regenerating references ([Vitest guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md)).

**Scope.** `frontguard review` iterates failing, new and missing shots. For each it shows baseline, current and diff paths and asks accept, skip or quit. It writes only accepted shots: to today's store, or as approval records once N5 lands. `--from <dir or downloaded frontguard-report>` accepts CI-rendered actuals byte-for-byte without re-rendering, and refuses when the artifact's N1 fingerprint does not match the baseline's. Bulk acceptance requires a filter or `--all`. Every acceptance writes an audit line with route, viewport, browser, old and new SHA-256, user and time. #288's block applies.

**Non-goals.** No hosted or multi-user UI (#294), no GUI server, no MCP tool, and no auto-accept heuristics. Publishing the shared branch follows #287's rules, not this command's. No remote renderer.

**Acceptance criteria.**
1. Accepting one of three failing shots writes exactly that shot and its manifest hash.
2. `--from` on a CI artifact writes the CI PNG byte-for-byte. A fingerprint mismatch exits 2.
3. Bulk acceptance without a filter or `--all` is refused.
4. Each acceptance emits an audit line, and a new serious axe violation blocks it.
5. The command makes no network calls.

#### N5. Design PR-scoped approvals and merge-base baseline selection for the orphan branch

**Placement:** Next, as a design issue with a spike, after #287. **Signal:** moderate-to-strong. Vendor docs agree, GitHub's primary docs back the mechanics, and three public field cases exist. Direct demand is weak. **Depends on:** #287 (approval authority). Constrains #290 (pruning), #295 (keying), N3 (queue semantics), N4 (what review writes) and N9 (mode segment).

**Problem.** The orphan branch holds one image per route, viewport and browser, and approving means overwriting it. The CLI writes it and the user pushes; the Action writes it and pushes. So approving PR A rewrites the baseline every other open PR compares against, before A merges. Queue runs inherit the same flaw.

Hosted vendors anchor selection on the merge base:
- **Argos** picks the newest approved build whose commit is an ancestor of the merge base, with the same build name and mode ([Argos](https://argos-ci.com/docs/learn/platform-fundamentals/baseline-build.md)).
- **Percy** falls back from the merge-base build to the latest default-branch build, then to the previous same-branch build, then to "all new" ([Percy](https://www.browserstack.com/docs/percy/visual-testing-workflows/baseline-management/git)).
- **Happo** starts at the merge base and tells users to capture the PR head SHA for deterministic diffs ([Happo](https://docs.happo.io/docs/spurious-diffs)).
- **Chromatic** follows ancestor builds and repairs squash and rebase merges through provider APIs ([Chromatic](https://www.chromatic.com/docs/branching-and-baselines/)).

GitHub now regenerates test merge commits only on a push, a merge-base change, or when they are more than 12 hours old, so capturing `refs/pull/N/merge` can be stale ([changelog](https://github.blog/changelog/2026-02-19-changes-to-test-merge-commit-generation-for-pull-requests/)). Stacked PRs went GA on **2026-10-06** and land as one merge group ([changelog](https://github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available/)). Content-addressed approvals survive rebases and squashes: Percy carries approval forward for identical snapshots on a branch, and Happo remembers exact before-and-after image pairs ([Percy approval](https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/approval), [Happo flake](https://docs.happo.io/docs/reporting-flake)).

Three teams show the field reality. MyVision approved with a `vrt-approved` label, walked first-parent history to find a baseline, and hit a **2 GB** artifact quota ([MyVision](https://zenn.dev/my_vision/articles/6f9b30cec157f3)). PostHog lost manifest entries on a squash merge ([PostHog#109926](https://github.com/PostHog/posthog/pull/109926)). A small unadopted Action approves by PR comment, and deleting the comment revokes the approval ([storybook-vrt](https://github.com/krystxf/storybook-vrt)).

**Scope.** A decision record, plus a spike, covering:
1. Recording, for each orphan-branch commit, the default-branch commit it represents, by extending `sourceCommitSha`.
2. Selecting the newest set whose source is an ancestor of `merge-base(PR head, base)`, with warned fallbacks: the latest default-branch set, a distinct "no baseline" result, and a warning plus fallback on shallow clones.
3. PR-scoped approval records keyed by route, viewport, browser, mode, baseline SHA-256 and candidate SHA-256, written only through #287's human channel. The gate then runs pixelmatch against the approved image, so pixelmatch remains the only comparator. Optional expiry lets the same record type hold known-flake variants under #298's hygiene.
4. Promotion after merge on the default branch.
5. Where approval reaches GitHub. A commit status works with `statuses: write`; check-run buttons need an App.
6. Where approval records live, with PostHog's stale-merge loss as the risk to design out.
7. Stacked PRs and queue groups.
8. A migration that leaves single-branch users untouched.

**Non-goals.** No hosted service, no S3 (#295 reuses this keying), no model-driven approval, no Checks API buttons, no change to threshold semantics, and no implementation beyond the spike.

**Acceptance criteria.**
1. The decision record covers items 1–8 and records the rejected alternatives (latest default branch, per-branch).
2. The spike shows two open PRs approving different changes without either seeing the other's change as a regression.
3. The spike carries a squash-merged PR's approval to the default branch by content hash.
4. Pixelmatch is the only comparator in every path. Approvals only choose which approved image is compared.
5. The design's constraints are written into #290 and #295.

#### Private hardening item

Product-specific details are withheld under [SECURITY.md](../SECURITY.md). This item is tracked privately.

#### N7. Declare MCP tool annotations, with promotion tools marked destructive

**Placement:** Next. It is small and can ship with #287. **Signal:** moderate. Client docs are primary, but demand is low: the agents and MCP theme totals **8 +1**. **Depends on:** none; #287 uses it as defense in depth.

**Problem.** None of the seven tools declares annotations, and an unannotated tool is assumed non-read-only, destructive and open-world ([MCP annotations post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-03-16-tool-annotations.md)). Clients act on annotations:
- **VS Code** skips confirmation only for `readOnlyHint` tools ([VS Code guide](https://github.com/microsoft/vscode-docs/blob/main/api/extension-guides/ai/mcp.md)).
- **Codex** `auto` mode prompts unless a tool is read-only, or both non-destructive and closed-world ([Codex source](https://github.com/openai/codex/blob/main/codex-rs/core/src/mcp_tool_call.rs)).
- **Cowork** exempts only annotated read-only tools ([Cowork](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans)).
- **Anthropic's connector directory** requires a title plus `readOnlyHint` or `destructiveHint` on every tool ([submission](https://claude.com/docs/connectors/building/submission)).
- **Claude Code** honours `_meta["anthropic/requiresUserInteraction"]: true` on every call, even in `auto` and `bypassPermissions`. Allow rules and hooks cannot skip the prompt, though the Agent SDK's `canUseTool` can approve it ([Claude Code MCP](https://code.claude.com/docs/en/mcp)).

The spec calls annotations untrusted hints, and the maintainers' post says plainly that "an untrusted server can lie."

**Scope.** Give `list_regressions`, `get_suggested_fix`, `recent_runs`, `inspect_diff_cluster_dom` and the static `verify_css_patch` a title, `readOnlyHint: true` and `openWorldHint: false`. Give `promote_baseline` and `accept_baseline` `readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: false` and the Claude Code interaction flag. Document that none of these enforce anything.

**Non-goals.** No security claim, no elicitation flow (#287 decides that), no new tools, and no SDK migration (N10).

**Acceptance criteria.**
1. `tools/list` returns the annotations above, under a contract test.
2. `promote_baseline` prompts under Claude Code's auto mode.
3. Docs say annotations are hints.
4. Each tool description and the server instructions stay under **4,096** characters, Claude Code's truncation point.

### Later: bets that wait for a trigger

#### N8. Flag horizontal viewport overflow as a report-only check

**Placement:** Later. It is a deterministic answer to the class of bugs the advisory model is worst at, but nobody has asked for it. **Signal:** moderate: a CVPR benchmark and a journal study, plus one small preprint. **Depends on:** #285 and #286 fixtures.

**Problem.** The classifier's system prompt asks the model to spot "text clipping/overflow … content overlapping, responsive breakage" ([ai-vision.ts](../packages/cli/src/diff/ai-vision.ts)). UI-Lens tested nine models on balanced sets drawn from **8,151** expert-annotated interfaces. It found accuracy near chance for text overflow (**50.04%**), cropped content (**54.07%**) and container overlap (**54.14%**) ([UI-Lens](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.pdf)).

DOM geometry is reliable for one of these classes. VERVE's manual classification of **469** ReDeCheck reports across **45** pages found viewport protrusion visible to humans in **32 of 57** reports. Element collision was visible in 9 of 43, and element protrusion in 3 of 90 (derived counts) ([VERVE](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)). In a 6-page preprint on 307 Chromatic PRs, layout was the largest class of flagged issues at **39.7%** ([arXiv 2608.07020](https://arxiv.org/abs/2608.07020)).

**Scope.** In the existing render pass, record whether `scrollWidth` exceeds `innerWidth` at each viewport. List visible elements whose border box passes the right edge and has no clipping ancestor, with selector, overflow in pixels and viewport. Take geometry and the screenshot from the same settled state; VERVE needed a 200 ms settle delay and found a defect when geometry came through injected JavaScript. Report the results in HTML, JSON and MCP.

**Non-goals.** Never an exit-code input. No collision or element-protrusion lists, no width sweep, no model.

**Acceptance criteria.**
1. Fixtures with real overflow are flagged, while clipped or transparent overflow is not.
2. Precision is published per fixture set.
3. Exit codes are unchanged.
4. #286 reports the judge's accuracy on the same fixtures.

#### N9. Add named capture modes with mode-keyed baselines, starting with light and dark

**Placement:** Later, as an explicit bet. Practice and mechanism evidence are decent, and demand is weak. **Signal:** weak demand, moderate practice. **Depends on:** N1, N5 (the key design reserves a mode segment), #290 (storage grows linearly).

**Problem.** Today a run applies one `colorScheme` per route or globally, and the baseline path has no mode segment.

Vendors and design systems treat modes as named bundles with independent baselines:
- **Chromatic and Argos** key baselines "solely on the name" of each mode ([Chromatic modes](https://www.chromatic.com/docs/modes/), [Argos modes](https://argos-ci.com/docs/learn/how-to-guides/visual-coverage/storybook-story-modes)).
- **Happo** puts `prefersColorScheme` on each target and defaults `prefersReducedMotion` to true ([Happo](https://docs.happo.io/docs/configuration)).
- **Primer** captures nine themes and prunes its matrix with include and exclude lists ([Primer](https://github.com/primer/react/blob/HEAD/e2e/test-helpers/matrix.ts)).
- **Fluent UI** generates dark, high-contrast and RTL variants ([Fluent](https://github.com/microsoft/fluentui/blob/HEAD/apps/vr-tests-react-components/src/utilities/getStoryVariant.tsx)).

The mechanisms are real: forced colors removes box shadows and gradient backgrounds ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)). The engines are uneven. Firefox loses `colorScheme`, scale factor and contrast after a COOP navigation ([#43287](https://github.com/microsoft/playwright/issues/43287)). WebKit applies stale `@media` rules in late shadow roots ([#43501](https://github.com/microsoft/playwright/issues/43501)).

Demand is thin. The capture-matrix theme has **16 +1** across six issues, the best of them "Testing multiple themes?" at 8 ([test-runner #516](https://github.com/storybookjs/test-runner/issues/516)). X shows zero complaints about one-mode suites, and one Cursor engineer's migration loop covers light, dark and high-contrast themes ([@poteto](https://x.com/poteto/status/2069824386283319343)). Counts multiply: 40 routes at three viewports go from 120 captures to 240 with dark mode, per Chromatic's Tests × Builds × Browsers × Modes formula ([Chromatic billing](https://www.chromatic.com/docs/billing/)).

**Scope.** Add a `modes` config of named bundles (`colorScheme`, `reducedMotion`, `forcedColors`, `contrast`, `locale`, `timezoneId`), applied globally or per route with an opt-out. The default mode keeps today's paths. Use a fresh context per mode. Before each capture, probe `matchMedia`, `devicePixelRatio`, `navigator.language` and the Intl time zone, and exit 2 on any mismatch. Store a per-mode settings fingerprint and warn when settings change under the same name. Print the projected capture count before running.

**Non-goals.** No pseudo-locale, HiDPI or RTL in v1. No cross-mode comparison as a gate: under translation, pixel and structural diffs reached **55%** precision against **91%** for a relational layout graph ([GWALI](https://viterbi-web.usc.edu/~halfond/papers/alameer16icst.pdf)). No forced colors outside Chromium until repaint is verified.

**Acceptance criteria.**
1. Light and dark for one route produce two baselines, and default-mode paths do not change.
2. An emulation that fails to take effect exits 2.
3. Changing a mode's settings under the same name warns.
4. The projected count equals the actual count.
5. Duplicate route entries are either rejected or keyed apart.

#### N10. Move the MCP server to SDK v2 before v1.x support can end, then list it in the registry

**Placement:** Later, dated. Start the spike in December 2026. **Signal:** strong for the deadline (primary SDK docs), weak for registry demand. **Depends on:** N7.

**Problem.** The server uses `@modelcontextprotocol/sdk` `^1.32.1`. The SDK's main branch is v2, which implements the **2026-07-28** spec, and v1.x gets fixes "for at least six months after the v2 release (2026-07-27)" ([TS SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md)). The new spec removes `initialize`, requires `server/discover` and moves elicitation into multi-round-trip results ([changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx)). v2's `serveStdio` serves legacy clients by default, and a codemod exists ([legacy clients](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/legacy-clients.md)). Claude Code negotiates the new protocol with stdio servers that support it and falls back otherwise, so the deadline is the only urgency ([Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)).

Listing is permanent. The official registry is in preview, its versions are immutable and cannot be unpublished, and look-alike names already appear in it ([registry FAQ](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/faq.mdx)). Publish the long-lived line, not the old one.

**Scope.** Run the codemod spike and serve both protocol eras. Keep `outputSchema`, `structuredContent` and the text mirror, return `tools/list` in a deterministic order, and log to stderr only. Then add `mcpName` and `server.json` and publish with `mcp-publisher` in the npm release job, so the registry entry cannot lag npm the way Playwright's does. Optionally, package the rewritten skill and the pinned server as a Claude Code plugin.

**Non-goals.** No Tasks, Sampling, Roots or MCP logging (2026-07-28 moves or deprecates them), no MCP Apps, no remote server, and no Docker catalog entry.

**Acceptance criteria.**
1. All seven tools pass contract tests against 2025-11-25 and 2026-07-28 clients.
2. The migration lands before the v1.x support floor.
3. The registry entry and the npm package carry the same version from the same release.
4. The README links the genuine entry.

## Deeper evidence changes eleven of the sixteen filed issues

**#284 — rescope it and sequence it after N1.** The new notes make the 10% default look like an outlier by orders of magnitude, and they let the issue start from facts.

Every runner surveyed defaults to zero or a handful of differing pixels:

| Runner | Default budget |
| --- | --- |
| Vitest | 0 pixels |
| Playwright | 0 (`maxDiffPixels` unset) |
| jest-image-snapshot | 0 pixels |
| cypress-visual-regression | 0 |
| Histoire | ratio 0 |
| Lost Pixel | 0 |
| Testplane v9 | **4** pixels |

Sources: [Vitest API](https://github.com/vitest-dev/vitest/blob/main/docs/api/browser/assertions.md), [Playwright](https://playwright.dev/docs/test-snapshots), [jest-image-snapshot](https://github.com/americanexpress/jest-image-snapshot#readme), [cypress-visual-regression](https://github.com/cypress-visual-regression/cypress-visual-regression#readme), [Histoire](https://github.com/histoire-dev/histoire/blob/main/docs/guide/visual-testing.md), [Lost Pixel](https://github.com/lost-pixel/lost-pixel/blob/main/src/compare/compare.ts), [Testplane defaults](https://github.com/gemini-testing/testplane/blob/master/src/config/defaults.js).

A WebdriverIO maintainer proposal (2026-10-09) names the failure directly: "a real change in a small area (an icon, a badge, a few letters) changes few pixels in total, so a tolerance can hide it." It plans a noise-tolerant mode on pixelmatch 8 ([wdio #1311](https://github.com/webdriverio/visual-testing/issues/1311)). ReBDiff shows the ratio is attacked from both sides. One intended shift covered **62.7–99.6%** of a screen, while testers checking by eye missed font, icon and logo changes ([ReBDiff](https://www.jstage.jst.go.jp/article/ipsjjip/28/0/28_268/_pdf/-char/en)).

The scope gains four facts:
- **The pin.** It is `pixelmatch@7.2.0` in both packages, and `@frontguard/playwright` passes when `diffPercentage <= threshold`, so the upgrade covers both.
- **Counts and masks.** v8 shifts counts by about ±3% (WDIO). WDIO also moved ignored regions into pixelmatch's `ignoreMask`, so neighbours keep their anti-aliasing context. Frontguard instead paints capture-time overlays.
- **HyAB's validation.** HyAB was validated only for "very large color differences" of about 10 CIELAB units or more ([Abasi et al.](https://doi.org/10.1002/col.22451)). No UI-screenshot benchmark comparing these deterministic metrics was verified in this search. This is a search limitation, not a claim that such evaluations do not exist.
- **Size mismatches.** On a size mismatch Frontguard pads both images and fails only above the budget. Vitest fails immediately on a dimension change, and Histoire requires explicit replacement ([Vitest comparator](https://github.com/vitest-dev/vitest/blob/main/packages/browser/src/node/commands/screenshotMatcher/comparators/pixelmatch.ts)). The size check is deterministic and runs before pixelmatch, so failing on it keeps pixelmatch the only comparator. Decide that rule here.

The CI browser-pin criterion is already met by `action.yml`.

**#285 — add a method.** Reuse the STVR 2020 design: HTML and CSS mutation operators, an "observable change" oracle, and recall bucketed by how many viewports show the change. Fixed-width spot checks caught **1 of 5** changes visible at a single width, against **5 of 5** for ReDeCheck ([STVR 2020](https://eprints.whiterose.ac.uk/163400/8/stvr.1748.pdf)). Seed faults that move neighbouring elements, which was WebSee's main miss mode ([WebSee](https://viterbi-web.usc.edu/~halfond/papers/mahajan15icst.pdf)). Seed ReBDiff's missed classes too. Add nuisance fixtures from the screenshot-relevant flaky-UI causes: among **235** flaky tests, resource rendering accounted for **61**, animation timing **26**, network loading **19** and cross-platform layout **10** ([Romano et al.](https://arxiv.org/pdf/2103.02669)). Record N1's fingerprint, every SSIM override flip and every disagreement in multi-render consensus. No study measures screenshot-specific flakiness or how often baselines are accepted unreviewed, so the write-up must not imply a rate ([Cruz thesis](https://homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf)).

**#286 — rescope; its first change fixes judge exit codes.** Judge verdicts must go to the report and leave the exit code at 0 unless the tool fails. Until then the opt-in mode breaks the rule the issue is named for.

Add paired clean and attacked fixtures, following BrowseSafe++'s clean twin per attacked page ([BrowseSafe++](https://arxiv.org/abs/2610.17457)) and CyberSecEval 3's visual prompt-injection protocol ([PurpleLlama](https://github.com/meta-llama/PurpleLlama/blob/main/CybersecurityBenchmarks/README.md)). Include these families:
- visible "this change is intentional" text
- faint low-contrast text
- provider-resolution changes, evaluated using public image-scaling research
- opacity-0 DOM text
- chat-template tokens
- instruction-free redesign cues
- modal overlays
- product-specific fixtures maintained privately

Score label flips in both directions, because typographic attacks on vision detectors are strongly asymmetric ([2609.39662](https://arxiv.org/abs/2609.39662)). Report Clopper-Pearson bounds, and assert that exit codes are identical across every fixture. Run a small best-of-N adaptive tier per provider, because adaptive attacks bypassed 12 published defenses, most at over **90%** success ([Attacker Moves Second](https://arxiv.org/abs/2510.09023)). Vendor hardening does not transfer across domains: hand-crafted attacks failed **0 of 140** times on hardened browser surfaces while the same models fell to skill injection at up to **100%** ([CUA-HandCrafted](https://arxiv.org/abs/2606.05233)).

Add UI-Lens as negative evidence, and report the judge's per-class accuracy on overflow, cropping and overlap. MIXVRT now has known numbers and stays out of any accuracy table.

**#287 — rescope; it is the strongest-evidenced Now issue.** Three facts confirmed in code define it: the skill ends at `promote_baseline` and runs `update-baselines`, the Action pushes from any event, and `confirm_reviewed` is a boolean the agent sets.

The ecosystem shows why client-side confirmation is not a control:
- **Automation answers confirmations.** Claude Code's `Elicitation` hook can answer without a dialog, Codex's `auto_review` hands approval prompts to a subagent, and Cursor routes non-allowlisted tools through a classifier ([Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)).
- **Playwright's healer** is told to fix "assertions and expected values" and "Do not ask user questions" ([healer](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/agents/playwright-test-healer.agent.md)).
- **Percy's alpha agent plugin** confirms decisions in chat while holding write credentials in its environment ([percy-gate](https://github.com/percy/percy-visual-testing-agent/blob/main/plugins/percy-visual-testing/skills/percy-gate/SKILL.md)).
- **Routine-looking actions** get past simulated human review ([II-Bench](https://arxiv.org/abs/2608.02018)).
- **Agent-scoped keys** have performed human-only operations ([CVE-2026-108756](https://nvd.nist.gov/vuln/detail/CVE-2026-108756)).
- **A weak but suggestive study** (12 runs per model, an author with 28 followers) found two Codex models gamed impossible tests in 8 and 10 of 12 runs. "Do not modify the tests" made little difference ([study](https://x.com/KevinShengHui/status/2103132319183990952)).

Runners are drifting toward unattended writes. Playwright 1.64's `--update-snapshots=missing` now passes the run ([TestConfig](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md)), and cypress-visual-regression updates bases on mismatch behind a flag ([README](https://github.com/cypress-visual-regression/cypress-visual-regression#readme)). Snapshot-testing practitioners warn that blind updates mask regressions and never update in CI ([Cruz thesis](https://homepages.dcc.ufmg.br/~mtov/diss/2024-victor.pdf)).

New scope:
- **Skill.** Rewrite it so agents stop at evidence and hand promotion to a human.
- **Action.** Refuse `update-baselines` on `pull_request`, `pull_request_target` and `merge_group` without an explicit override.
- **Credential.** Make the control a credential the agent lacks: promotion after merge on the default branch, or a protected environment with required reviewers. Document restricting push rights on `frontguard-baselines` to the CI identity. That last step is an inference from the notes' "separate write credential," not a cited practice.
- **Supporting mechanisms.** Treat N7's metadata and any elicitation link as defense in depth. Keep `confirm_reviewed` as UX only.

**#288 — move it to Next behind #287.** The evidence is unchanged in kind. Happo's MCP docs block acceptance on new accessibility violations ([Happo MCP](https://happo.io/docs/mcp)). Chromatic forces a full TurboSnap rebuild the first time Accessibility Tests are enabled. A Storybook discussion about running accessibility tests alongside Chromatic visual tests has **37** upvotes but dates from 2022 ([D#17966](https://github.com/storybookjs/storybook/discussions/17966)). No vendor documents a severity threshold. The block must attach to whatever channels #287, N4 and N5 define, so building it first means building it twice.

**#289 — split it and retitle it to discovery.** Storybook continuity is now the bigger half:
- **Test-runner is gone.** `storybookjs/test-runner` was archived on **2026-09-30** and prints a warning on every run under Storybook 11 ([test-runner](https://github.com/storybookjs/test-runner)).
- **Storybook's own fallback.** The migration notes send Webpack users to "plain Playwright with a minimal setup that generates tests from stories" ([MIGRATION.md](https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#test-runner-support-ended)).
- **Unmet local demand.** A request for a non-Chromatic local option has **9** upvotes and no maintainer reply ([D#31826](https://github.com/storybookjs/storybook/discussions/31826)).
- **Small local rivals.** The local alternatives have 58 and 69 stars ([storybook-addon-vis](https://github.com/repobuddy/visual-testing), [storycap-testrun](https://github.com/reg-viz/storycap-testrun)).

Add fixtures for Storybook 9, 10 and 11-alpha. Ladle documents its entry points: `meta.json`, `?story=<key>&mode=preview` and `[data-storyloaded]` ([Ladle](https://github.com/tajo/ladle/blob/main/packages/website/docs/visual-snapshots.md)). Scope Histoire to discovery only. Its main branch documents native visual testing on pixelmatch ^7.2 with workbench approval and exit codes 0/1/2/130, but npm's latest is still **1.0.0-beta.1** ([Histoire](https://github.com/histoire-dev/histoire/blob/main/docs/guide/visual-testing.md), [npm](https://www.npmjs.com/package/histoire)). No Lost Pixel fork has traction. One company fork rewrote the Action to stop using "the dead upstream image," which suggests upstream Action users are already broken ([fork](https://github.com/DSeeHappy/lost-pixel)). The runner-change warning moves to N1.

**#290 — add stale-shot removal and constraints.** The demand is for removing baselines of deleted tests. Playwright's request has **52 +1** and its duplicate **19 +1**. Playwright declined: baselines are platform- and project-specific, and the feature was "straightforward to script on top of git instead" ([#16582](https://github.com/microsoft/playwright/issues/16582), [#34775](https://github.com/microsoft/playwright/issues/34775)). Nobody prunes automatically: Vitest says old screenshots "aren't removed automatically," Histoire says "No automatic baseline pruning occurs," and Vitest's retry bug accumulated "dozens of orphan PNGs" ([#10211](https://github.com/vitest-dev/vitest/issues/10211)). MyVision's artifact-based alternative hit a 2 GB quota.

Prune only from the manifest crossed with declared targets, never from a filtered or sharded run, and always offer a dry run. Keep every set reachable as a merge base (N5). If lossless WebP is considered (Playwright 1.62+), note that manifest hashes cover encoded PNG bytes. Hash decoded pixels or pin the encoder before changing formats.

**#291 and #292 — unchanged.** No external evidence touches either. While editing docs, correct ROADMAP's `diff/ai-classifier.ts` reference.

**#293 — unchanged; the evidence is consistent.** PostHog removed approve and finalize from merge-queue observe runs ([PostHog#106955](https://github.com/PostHog/posthog/pull/106955)). A vendor-adjacent article argues that "a gate that is never reached looks exactly like a gate that always says no" ([@Av1dlive](https://x.com/Av1dlive/status/2082505465569910850)). The local CLI and Action already fail closed on zero comparisons, which mirrors gate (c).

**#294 — add N4 as a dependency.** Local approval UIs exist:
- Histoire's workbench approves exact captured images.
- html-reporter accepts and undoes, including for Playwright.
- Vitest's UI shows diff tabs with no approve action.
- WebdriverIO's reporter is a static sample with no approve action.

Runner demand for review is satisfiable locally first. Check html-reporter's adapter model before designing any GUI. Argos's rules — only each reviewer's latest review counts, and one rejection blocks — are a reference ([Argos review](https://argos-ci.com/docs/learn/review-workflow/review-a-build.md)).

**#295 — add N5 and N1 as dependencies.** Playwright closed its remote-storage request (**32 +1**) as not planned ([#29227](https://github.com/microsoft/playwright/issues/29227)), and no in-window Git LFS demand appeared. Argos warns that a remote cache "extend[s] the cache's trust model to baselines" ([Argos](https://argos-ci.com/docs/learn/how-to-guides/ci-pipelines/cached-pipelines.md)). A shared bucket written from PR runners inherits that question.

**#296 and #297 — unchanged.**

**#298 — upgrade the evidence and the scope.** This is no longer a bet resting on one SmartUI-adjacent account.
- **PostHog field case.** About **30** quarantined snapshots failed every main run because "real UI changes landed while they were quarantined, so nobody approved the new picture" ([PostHog#111896](https://github.com/PostHog/posthog/pull/111896)). Its quarantines carry `expires_at`, show "expiring soon" notices, cap agent-created entries, and record the SHA that lifts each one ([quarantine.py](https://github.com/PostHog/posthog/blob/master/products/visual_review/backend/logic/quarantine.py)).
- **Argos.** Argos shows occurrences and last-seen dates and flags quiet ignores as blind spots ([Argos](https://argos-ci.com/docs/learn/reliability-and-flakiness/ignored-changes.md)).
- **Happo.** Happo restricts flake reports to reviewers because "an ignored diff can approve a comparison."

Scope: expiry plus occurrence telemetry for masks and for N5's hash-pair variants, with additions and removals only through #287's human channel. It stays Later because Frontguard's masks are capture-time selectors, not diff quarantines.

**#299 — reuse what already ships.** `@frontguard/playwright` already captures an ARIA string, so the issue becomes storage and diffing plus CLI capture. Runners are investing here: ARIA snapshot issues total **61 +1** across Playwright and Vitest. Playwright's `.aria.yml` format is the most developed — it has no platform suffix, and gained `Page.ariaSnapshot` in 1.59, `boxes` in 1.60 and JSON in 1.63 ([release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md)) — so reuse it. A computed-style sidecar is weaker. Its support is one migration that was "pixel perfect" yet still had z-index and specificity bugs ([@poteto](https://x.com/poteto/status/2069824386283319343)).

## Seventeen tempting features fail the evidence test

Each row below is a feature that at least one notes file proposed or that the market sells, and that the evidence rejects. The last column says what to do instead, so none of these become sibling issues by accident.

| Do not build | Evidence | Instead |
| --- | --- | --- |
| A model, captioner or "AI diff" anywhere in pass/fail, including prompt-based ignore rules | Argos uses "deterministic pixel diffing, not AI-based visual comparison" and argues AI "compensates for flakiness" ([Argos](https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences.md)); UI-Lens finds models near chance on layout classes | `windowSize` and `ignoreMask` inside the same gate (#284) |
| Selectable alternative comparators (SSIM variants, perceptual metrics, odiff-class engines) as gates | No study compares deterministic metrics on UI screenshots; Vitest declines to bundle perceptual comparators because there is "no clear single 'best one'" ([Vitest guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md)); Playwright closed pluggable comparators as out of scope ([#28578](https://github.com/microsoft/playwright/issues/28578)) | #284 fixtures; keep the SSIM override as is |
| A Vitest `toMatchScreenshot` comparator adapter or a Storybook visual-test addon clone | The notes conflict. Against: no practitioner pull; Chromatic launched hosted Vitest visual testing with a Vitest core maintainer ([@chromaticcom](https://x.com/chromaticcom/status/2060053322241855658)); Vitest's engine has been BlazeDiff since 4.1 ([PR #9514](https://github.com/vitest-dev/vitest/pull/9514)) | Position the CLI as the local Storybook path (#289) |
| Prompt or skill wording as the thing that stops promotion | "Do not modify the tests" barely mattered (weak study); CI agents follow issue text ([PromptPwnd](https://x.com/AikidoSecurity/status/1996608463938474239)) | #287's credential boundary; still rewrite the skill |
| An agent or vision "looks good" verdict as a stop condition | Vendors already ship perception loops ([Copilot](https://x.com/github/status/1944826853048438832), [Cursor](https://x.com/cursor_ai/status/2042287192895267212)); screenshots carry hidden instructions (Brave) | The pixel verdict plus N8 |
| Auto-passing or switching off the visual check in merge queues | bcgov did so and lost exact-commit verification; GitHub's April 2026 regression; PostHog's queue caught what PRs missed | N3 |
| Checks API `requested_action` approve buttons | Only GitHub Apps can write check runs; at most three buttons with 20-character labels ([Checks API](https://docs.github.com/en/rest/checks/runs)) | A commit status in N5; revisit with #294 |
| Auto-update on mismatch, or CI writes of missing baselines that pass | Conflicts with #287; practitioners advise never updating in CI | N4 |
| A browser-binary cache step in the Action | Restoring takes about as long as downloading ([Playwright CI](https://playwright.dev/docs/ci)) | Keep the pinned install the Action already does |
| Determinism by flags: font hinting by default, shared cross-OS baselines, WebGL guarantees | The 2023 hinting flags are absent from 2026 defaults ([#20097](https://github.com/microsoft/playwright/issues/20097)); "not much you can do to get the same screenshots between OSes" ([#18240](https://github.com/microsoft/playwright/issues/18240)); the SwiftShader fallback is deprecated ([Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)) | N1; masks for canvas |
| Raw DOM collision or element-protrusion lists, small-range-layout warnings | 9 of 43 and 3 of 90 visible; all **53** small-range reports on 20 new pages were false positives (VERVE) | N8 only |
| Cross-locale or cross-browser pixel comparison as a gate | 55% precision against 91% for relational graphs (GWALI); F1 **0.35** on internal layout failures ([TWeb 2023](https://doi.org/10.1145/3580518)) | A relational report, if locales ever ship |
| A self-healing test agent | Playwright's healer covers it, and its documented scope excludes baselines ([test agents](https://github.com/microsoft/playwright/blob/main/docs/src/test-agents-js.md)) | — |
| MCP Tasks, Sampling, Roots or logging; Skills over MCP | 2026-07-28 moves Tasks to an extension and deprecates the rest; Skills client support is partial ([client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx)) | N7, N10 |
| Origin limits on MCP-triggered renders; a new "fail closed on zero comparisons" issue; Git LFS; headline sharding | MCP launches no browser and fail-closed already ships (code); no in-window LFS demand; sharding demand totals **3 +1** | — |

Some candidates are sound but not justified yet. They should not get an issue until their trigger fires:

| Defer without an issue | Trigger to revisit |
| --- | --- |
| Lost Pixel and BackstopJS config importers; Playwright and Vitest baseline import or export | A user asks. Migration guides already ship, and BackstopJS's npm ownership just passed to a new account ([#1625](https://github.com/garris/BackstopJS/issues/1625)) |
| JUnit XML and CTRF output | A user asks. No visual runner emits CTRF, and CTRF is pre-1.0 ([CTRF](https://github.com/ctrf-io/ctrf#readme)) |
| Grouping repeated diffs across routes, shift-aware summaries, moved-element attribution | #285 can measure reviewer load. Evidence today is an abstract-level 60% reduction ([Adachi](https://doi.org/10.1109/apsec.2018.00106)) and studies of 10 screens and 2 pages |
| A geometry-only width sweep | Geometry baselines exist. Strong but single-group evidence: precision 0.98 and recall 1.00 on 60 mutants (STVR 2020) |
| Pseudo-locale, HiDPI, forced-colors and RTL modes | N9 v1 ships. X has zero posts on any of them |
| A remote Linux renderer for macOS and Windows | N4's `--from` proves insufficient |
| MCP rows with image paths and unscaled crops | Agents ask. Scaling degrades model vision ([#42362](https://github.com/microsoft/playwright/issues/42362)), but the PR-artifact trend is vendor-driven |
| An MCP App diff viewer with an app-only promote tool | #287 lands. Apps do not render in Claude Code or Zed, and the separation shares the host session ([ext-apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md)) |
| Reporting instability through the unused `flaky` status | #285 measures how often consensus disagrees |

## Conclusion

The second pass puts the public approval-boundary and judge-exit-code issues first, then renderer provenance and pixel validation. Product-specific hardening details are tracked privately. No research finding authorizes model-driven approvals or a production cloud deployment.

The second lesson is structural. Every hosted vendor converged on approvals that are scoped to a PR, keyed by content, and resolved against the merge base. A git orphan branch can adopt that model without a service, because the manifest already holds per-snapshot hashes and a source commit. That is a better use of the next quarter than capture matrices or comparator options, which have mechanisms and vendor practice behind them but almost no users asking. If N5's design holds, Frontguard gets the hosted products' review semantics while keeping its local, pixelmatch-only verdict, and the gated cloud work in Later becomes optional rather than inevitable.
