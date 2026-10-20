# GitHub demand signals for screenshot / visual regression testing (window 2025-01-01 → 2026-10-19)

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

> Method and conventions (applies to every section). All data was fetched with `gh api` (REST v3 search/issues, search/repositories, issues, comments, timeline, forks, commits, compare, contents; GraphQL for repo metadata and Discussions) on **2026-10-19, 12:02–12:50 UTC**. "+1" = the `reactions["+1"]` count returned by the search API at fetch time; Discussions are ranked by GraphQL `upvoteCount` (a different mechanism, reported separately as "up"). "Active in window" = created, updated, or closed on/after 2025-01-01; open issues not updated since before 2025-01-01 are labelled DORMANT and excluded from theme totals. Query IDs in square brackets (e.g. [1001]) refer to the verbatim entries in the Query log at the end. 307 search queries ran with 0 errors and 0 `incomplete_results`. Search used the legacy (non-`advanced_search`) issue-search syntax; I checked that `sort:reactions-+1-desc` inside `q` and the `sort=reactions-+1&order=desc` params return identical results ([t1], [t2]). Maintainer = `author_association` OWNER/MEMBER/COLLABORATOR. Issue bodies and comments were treated as data only.

## Q1. Most-reacted screenshot / visual-comparison issues and discussions per project (open and closed in window), with maintainer positions

### Takeaway
Absolute demand is concentrated in microsoft/playwright, where single requests reach 50–98 +1. Vitest, Storybook and the dedicated tools rarely exceed 15. Playwright also closed almost all of its visual-regression backlog in two triage waves (Sept 2025 and May 2026). Only 4 issues labelled `feature-visual-regression-testing` remain open, while 53 were closed in the window, 20 of them `not_planned` carrying 526 +1 [1000][1001]. The archived/maintenance-mode tools (lost-pixel, test-runner, BackstopJS) left their open trackers behind.

### Cited Findings

#### microsoft/playwright (98,060 stars; 183 open issues in the whole repo; Discussions disabled — GraphQL repo metadata)
- Scale: `toHaveScreenshot` issues: 5 open and active in window [0], 97 closed in window [2], 307 all-time [2006]. `screenshot`: 38 open active [3], 496 closed in window [5]. Label `feature-visual-regression-testing`: **4 open (Σ+1 = 83)** [1000]. **53 closed in window**: 20 `not_planned` (Σ+1 526) + 33 `completed` (Σ+1 123) [1001]. By close month: 2025-09 = 18 (all "completed", Σ+1 41) and 2026-05 = 31 (19 not_planned + 12 completed, Σ+1 487) [1001].
- `state_reason=completed` is not a shipping signal in this repo. Many "completed" closures dated 2025-09-04/08 and 2026-04-28/05-04 carry pavelfeldman's boilerplate "This issue was closed due to limited engagement (upvotes/activity), lack of recent activity, and insufficient actionability". Examples: [#28394](https://github.com/microsoft/playwright/issues/28394), [#23197](https://github.com/microsoft/playwright/issues/23197), [#30199](https://github.com/microsoft/playwright/issues/30199), [#35357](https://github.com/microsoft/playwright/issues/35357), [#36440](https://github.com/microsoft/playwright/issues/36440), [#33236](https://github.com/microsoft/playwright/issues/33236), [#33953](https://github.com/microsoft/playwright/issues/33953), [#22064](https://github.com/microsoft/playwright/issues/22064), [#34197](https://github.com/microsoft/playwright/issues/34197), [#33098](https://github.com/microsoft/playwright/issues/33098), [#35150](https://github.com/microsoft/playwright/issues/35150), [#29250](https://github.com/microsoft/playwright/issues/29250), [#34438](https://github.com/microsoft/playwright/issues/34438), [#21620](https://github.com/microsoft/playwright/issues/21620). The May 7–12 2026 `not_planned` wave was mostly closed by pavelfeldman with **no comment at all**. Examples with 0 maintainer comments: [#8161](https://github.com/microsoft/playwright/issues/8161), [#24310](https://github.com/microsoft/playwright/issues/24310), [#37019](https://github.com/microsoft/playwright/issues/37019), [#34775](https://github.com/microsoft/playwright/issues/34775), [#24312](https://github.com/microsoft/playwright/issues/24312), [#23502](https://github.com/microsoft/playwright/issues/23502), [#15275](https://github.com/microsoft/playwright/issues/15275). A few got a terse "Not planned." ([#20552](https://github.com/microsoft/playwright/issues/20552), [#4295](https://github.com/microsoft/playwright/issues/4295)).

Open, active in window (visual-relevant), by +1:

| Issue | +1 | Created | State | Maintainer position |
|---|---|---|---|---|
| [#16928](https://github.com/microsoft/playwright/issues/16928) `locator.screenshot()` option to expand captured space around locator | 33 | 2022-08-30 | open (P3-collecting-feedback; updated 2025-05-04) | No maintainer comment (5 comments) |
| [#29878](https://github.com/microsoft/playwright/issues/29878) Content in `<dialog>` cannot be masked | 9 | 2024-03-11 | open (reopened) | Boilerplate-closed 2024-08-16, reopened. A user noted 2025-12-17 that it affects everything in the top layer, incl. popovers |
| [#40819](https://github.com/microsoft/playwright/issues/40819) Capture screenshots at `expect.soft()` failures (debug, adjacent) | 6 | 2026-05-13 | open | None |
| [#34376](https://github.com/microsoft/playwright/issues/34376) Flag to update reference screenshots from latest results without re-running | 3 | 2025-01-17 | open | No maintainer comment |
| [#19861](https://github.com/microsoft/playwright/issues/19861) Full-page screenshots on lazy-load pages | 2 | 2023-01-04 | open (reopened) | None. User 2026-10-19: CDP `captureBeyondViewport` doesn't trigger IntersectionObserver content |
| [#43045](https://github.com/microsoft/playwright/issues/43045) WebP compression-effort option | 1 | 2026-10-01 | open (v1.65) | Contributor says PR #43020 was rejected "due to missing issue" |
| [#41532](https://github.com/microsoft/playwright/issues/41532) Stable screenshot API without waiting for stability | 0 | 2026-05-11 | open | yury-s pointed to video recording via a `playwright-cli` skill; dgozman linked an upstream Chromium change |
| [#41504](https://github.com/microsoft/playwright/issues/41504) `mask` overlay affected by page `::backdrop` styles | 0 | 2026-06-27 | open | None (a commenter explains the mask overlay uses the popover API, so it sits in the top layer) |
| [#42393](https://github.com/microsoft/playwright/issues/42393) "Update snapshot" action in UI Mode Attachments panel | 0 | 2026-08-25 | open | None. The request implies no such per-image action exists yet |
| DORMANT: [#12077](https://github.com/microsoft/playwright/issues/12077) Element loses hover on `locator.screenshot` in headed Docker | 38 | 2022-02-14 | open, last update 2023-06-13 | — |

Closed in window (visual-relevant), by +1:

| Issue | +1 | Created → closed | Outcome | Maintainer position |
|---|---|---|---|---|
| [#20954](https://github.com/microsoft/playwright/issues/20954) Add back support for docker and VNC (body: using Playwright CT "as a visual regression solution") | 98 | 2023-02-16 → 2026-05-08 | not_planned | 2023-07-27 pavelfeldman: "pretty much stalled due to the lack of demand… only has a dozen of upvotes" |
| [#8161](https://github.com/microsoft/playwright/issues/8161) feat: better support for visual regression testing (umbrella: docker fixture, blur vs anti-aliasing, review UI) | 84 | 2021-08-12 → 2026-05-12 | not_planned | No maintainer comment |
| [#22984](https://github.com/microsoft/playwright/issues/22984) Save screenshots as WebP | 68 | 2023-05-12 → 2026-07-14 | **shipped** | yury-s: "Will be released in 1.62" |
| [#24310](https://github.com/microsoft/playwright/issues/24310) "Accept new snapshot" button in HTML reporter / UI Mode | 58 | 2023-07-19 → 2026-05-12 | not_planned | No maintainer comment. User 2026-07-14: "has it been added? I can't find the option" |
| [#28578](https://github.com/microsoft/playwright/issues/28578) Built-in adapter for image comparison library | 57 | 2023-12-11 → 2025-10-24 | closed ("completed" reason) | pavelfeldman: "This does not sound like this is converging. I'll close it as out of scope, sorry." Later: extensibility "would imply committing to the new public API, documentation, tests"; "the idea is worth pursuing… file an issue, document the API" |
| [#16582](https://github.com/microsoft/playwright/issues/16582) Can `updateSnapshots` remove stale snapshots? | 52 | 2022-08-16 → 2026-08-03 | not_planned | yury-s: "decided not to proceed. Baselines are platform- and project-specific… distinguishing 'unused' from 'belongs to another configuration' adds more complexity than the feature justifies. This is straightforward to script on top of git instead" |
| [#18827](https://github.com/microsoft/playwright/issues/18827) Same test, different runs → different heights / compression | 48 | 2022-11-15 → 2026-05-12 | not_planned | 2022: "That is something we might be able to fix!". Users still reporting on v1.60 (2026-06-08) |
| [#14883](https://github.com/microsoft/playwright/issues/14883) CLI tool to interactively review & update snapshots | 42 | 2022-06-15 → 2026-05-07 | not_planned | 2022 dgozman: "There is no such tool yet… such a tool would make sense" |
| [#23502](https://github.com/microsoft/playwright/issues/23502) Do not fail when a snapshot doesn't exist | 36 | 2023-06-03 → 2026-05-12 | not_planned | No comment. Later superseded by shipped [#42652](https://github.com/microsoft/playwright/issues/42652) |
| [#15275](https://github.com/microsoft/playwright/issues/15275) Compare screenshots outside `test()` | 35 | 2022-06-30 → 2026-05-12 | not_planned | No maintainer comment |
| [#29227](https://github.com/microsoft/playwright/issues/29227) Remote storage for VRT (S3, Azure Blob) | 32 | 2024-01-29 → 2026-05-08 | not_planned | 2024: "Your request is clear, thanks!". No closing rationale |
| [#24312](https://github.com/microsoft/playwright/issues/24312) "The problem with visual comparison" (pixelmatch AA; 6/500 runs = 1.2% flaky; propose CIEDE2000 tolerance) | 28 | 2023-07-19 → 2026-05-12 | not_planned | Cited 2026-01-25 by yury-s as where "we already track the general problem of flaky visual results", then closed |
| [#18937](https://github.com/microsoft/playwright/issues/18937) `toMatchScreenshot()` comparing two different screenshots | 26 | 2022-11-19 → 2026-05-08 | not_planned | 2022 dgozman floated `expect(image1).toMatchImage(image2)` |
| [#16970](https://github.com/microsoft/playwright/issues/16970) "Update snapshots" checkbox in VS Code extension | 24 | 2022-01-16 → 2025-02-03 | completed | Skn0tt 2025-05-12: run the test after checking the checkbox (the feature exists) |
| [#38200](https://github.com/microsoft/playwright/issues/38200) Screenshot issues with `<select>` | 23 | 2025-11-12 → 2026-01-07 | not_planned | dgozman: native `<select>` is "implemented differently on different browser platforms… I don't think we can or should do anything about that" |
| [#4295](https://github.com/microsoft/playwright/issues/4295) Scrollbars in Firefox headless | 20 | 2020-10-30 → 2026-05-07 | not_planned | "Not planned." |
| [#37019](https://github.com/microsoft/playwright/issues/37019) Custom comparators for snapshot matching | 20 | 2025-08-13 → 2026-05-08 | not_planned | No comment (0 comments) |
| [#32373](https://github.com/microsoft/playwright/issues/32373) Bigger-size screenshot is incomplete | 20 | 2024-08-29 → 2026-05-07 | not_planned (upstream) | — |
| [#20552](https://github.com/microsoft/playwright/issues/20552) Native docker integration (body: VRT "very difficult with different browsers and setups", cites Loki) | 19 | 2023-02-01 → 2026-05-07 | not_planned | pavelfeldman: "Not planned." |
| [#34775](https://github.com/microsoft/playwright/issues/34775) Detect and remove obsolete snapshots | 19 | 2025-02-13 → 2026-05-08 | not_planned | No comment (dup of #16582) |
| [#12683](https://github.com/microsoft/playwright/issues/12683) Chromium/WebKit headless vs headed rendering differences | 17 | 2022-03-11 → 2026-05-07 | not_planned | 2022 yury-s: "no good way to make the browsers produce identical images in both modes" |
| [#38673](https://github.com/microsoft/playwright/issues/38673) Mask sensitive input in test reports | 17 | 2026-01-03 → 2026-10-16 | **shipped** | PRs [#43334](https://github.com/microsoft/playwright/pull/43334) "feat(reporters): add secrets option to redact sensitive values" (merged 2026-10-14) and [#43423](https://github.com/microsoft/playwright/pull/43423) (trace, merged 2026-10-16) |
| [#32889](https://github.com/microsoft/playwright/issues/32889) Global timeout for `toHaveScreenshot()` | 16 | 2024-10-01 → 2026-05-08 | **shipped** | PR [#40720](https://github.com/microsoft/playwright/pull/40720) "support toHaveScreenshot timeout in expect config" merged 2026-05-08 |
| [#20987](https://github.com/microsoft/playwright/issues/20987) Less flaky `toHaveScreenshot` by using the target screenshot as goal | 16 | 2023-02-17 → 2026-05-08 | not_planned | 2023 yury-s: could support as an option, with caveats about rebaselining |
| [#13873](https://github.com/microsoft/playwright/issues/13873) Visual testing in docker on different CPU architecture (70 comments) | 15 | 2022-05-02 → 2026-05-12 | not_planned | 2022 dgozman: "It is expected that arm docker image vs intel docker image produce different screenshots"; suggests `maxDiffPixels` |
| [#17294](https://github.com/microsoft/playwright/issues/17294) Only update snapshots that changed | 7 | 2022-09-13 → 2025-09-04 | **shipped** | dgozman: "possible with `--update-snapshots=changed`, which is now the default" |
| [#38933](https://github.com/microsoft/playwright/issues/38933) `exactDiffPixels` option | 4 | 2026-01-23 → 2026-01-25 | closed (merged into #24312) | yury-s: "pixel diffs are not stable or predictable, and baking special-case thresholds into the API doesn't really solve that" |
| [#42652](https://github.com/microsoft/playwright/issues/42652) CLI option to generate missing snapshots without failing | 3 | 2026-09-10 → 2026-09-10 | **shipped** | PR [#42662](https://github.com/microsoft/playwright/pull/42662) "add --update-snapshots=missing that passes tests" merged 2026-09-10 |
| [#34956](https://github.com/microsoft/playwright/issues/34956) `snapshotPathTemplate` hardcodes `process.platform` (remote browsers) | 1 | 2025-02-27 → 2026-04-28/05-04 | boilerplate | yury-s 2025-02-28 (team meeting): "hardcode the remote platform in the `snapshotPathTemplate`… no easy and reliable way for playwright to tell the remote platform" |

#### vitest-dev/vitest (17,263 stars; Discussions enabled — 456 discussions active in window fetched)
- Scale: `toMatchScreenshot`: 6 open [51], 18 closed in window [53], 24 all-time [2008]. Vitest 4 shipped built-in visual regression (`toMatchScreenshot`). [#6265](https://github.com/vitest-dev/vitest/issues/6265) "Support visual regression testing in the browser" (13 +1, 2024-08-02 → completed 2025-08-05). Maintainer macarie: the implementation "generally follows Playwright's approach… supports all screenshot options from the provider and all `pixelmatch` options". Cross-browser size differences: "this is expected and one of the challenges with visual regression testing". [#7892](https://github.com/vitest-dev/vitest/issues/7892) native image matcher: "This is implemented by @macarie in Vitest beta" (2025-09-06).
- Open: [#4060](https://github.com/vitest-dev/vitest/issues/4060) Display snapshot of the component in Vitest UI (7 +1, 2023, updated 2026-05-29; comments not reviewed). [#2229](https://github.com/vitest-dev/vitest/issues/2229) Interactive snapshot update/create mode (4 +1, 2022, updated 2026-10-05): macarie 2026-07-05 "Insta's `review` mode is exactly what I had in mind for this issue". [#6979](https://github.com/vitest-dev/vitest/issues/6979) detect `--update` flag (3). [#9341](https://github.com/vitest-dev/vitest/issues/9341) `beforeComparison` hook (0 +1): macarie skeptical, "Transforming screenshots before comparison is pretty uncommon". [#11178](https://github.com/vitest-dev/vitest/issues/11178) createDiff short-circuit (0): "The current behavior is intentional". [#9904](https://github.com/vitest-dev/vitest/issues/9904) failure screenshots not attached to JUnit (1).
- Closed in window: [#9363](https://github.com/vitest-dev/vitest/issues/9363) Screenshot dimensions (11 +1; DPR/retina scaling; one user switched to a Docker image for consistency and said that partly defeats its purpose; completed 2026-04-21 without maintainer comment). [#9124](https://github.com/vitest-dev/vitest/issues/9124) low-resolution `page.screenshot` with large viewport (6). [#8399](https://github.com/vitest-dev/vitest/issues/8399) headless Chromium rendering (5; reporter closed after upgrading). [#10211](https://github.com/vitest-dev/vitest/issues/10211) failing `toMatchScreenshot` writes a new auto-named file per retry, "accumulating dozens of orphan PNGs" (2; fixed by PR #10233 in v5 beta). [#9431](https://github.com/vitest-dev/vitest/issues/9431) faster image-diff comparator (completed 2026-02-19). [#8265](https://github.com/vitest-dev/vitest/issues/8265) fuzzy (text) snapshots (not_planned).
- Discussions: [D#7749](https://github.com/vitest-dev/vitest/discussions/7749) Browser Mode screenshot fullPage support (14 up, 2025-03-28, 12 replies, no maintainer reply). [D#690](https://github.com/vitest-dev/vitest/discussions/690) Visual testing (11 up / 7 +1, 2022; satisfied by v4). [D#8892](https://github.com/vitest-dev/vitest/discussions/8892) "Confused by behavior of toMatchScreenshot" (2 up): macarie explains `.vitest-attachments` and recommends a dedicated Vitest project for VRT. [D#9878](https://github.com/vitest-dev/vitest/discussions/9878) hover state leaking into screenshots only in full-suite runs (2 up, no maintainer reply).

#### storybookjs/storybook (91,336 stars; 769 discussions active in window fetched)
- Issues carry little visual-testing demand. Label `addon: visual test` (Chromatic's Visual Tests addon): 1 open [1002] ([#31699](https://github.com/storybookjs/storybook/issues/31699), 1 +1) and 5 closed in window, each ≤1 +1 [1003]. Label `test-runner`: 17 open [1004], top [#19281](https://github.com/storybookjs/storybook/issues/19281) "Support playwright test runner and playwright/test api for interaction testing" (29 +1, 2022, updated 2026-05-27).
- Discussions (the main demand channel): [D#31826](https://github.com/storybookjs/storybook/discussions/31826) "Use non-Chromatic solution for visual testing using Storybook 9 and Vitest runner" (9 up, 2025-06-19, no maintainer reply). The body says "no generic alternative is provided… storing the screenshots locally on disk"; a commenter: "We need a generic plugin that just saves the screenshots in the project folder". [D#32930](https://github.com/storybookjs/storybook/discussions/32930) "Will Storybook vitest addon support new `toMatchScreenshot`…" (6 up / 2 +1, 2025-11-03): the accepted answer is from a CONTRIBUTOR pointing to the migration-guide FAQ. [D#27030](https://github.com/storybookjs/storybook/discussions/27030) Chromatic asks to re-review already-reviewed components on every PR (3 up). [D#31790](https://github.com/storybookjs/storybook/discussions/31790) tests don't run against both themes (3 up). [D#35199](https://github.com/storybookjs/storybook/discussions/35199) "Change detection for static builds (CI / PR review)" (2 up, 2026-06-17).
- Storybook's own docs (repo file `docs/writing-tests/integrations/vitest-addon/migration-guide.mdx`, branch `next`), under "What if I am doing image snapshot testing?", list only "On the cloud with the Visual tests addon" or "Locally with `storybook-addon-vis`" ([repobuddy/visual-testing](https://github.com/repobuddy/visual-testing)) — [migration-guide.mdx](https://github.com/storybookjs/storybook/blob/next/docs/writing-tests/integrations/vitest-addon/migration-guide.mdx).
- Shipped: "Review Changes" tracking issue [#34250](https://github.com/storybookjs/storybook/issues/34250) (closed completed 2026-05-26). It uses "git diff… combine[d] with Vite's module graph to identify affected stories transitively (similar to TurboSnap)", targets Storybook 10.4 and is Vite-only at first. Its motivation explicitly includes code "modified… by an AI coding agent".

#### cypress-io/cypress (51,045 stars; 568 discussions active in window fetched)
- No native visual comparison. Label `topic: screenshots 📸`: 15 open (8 active in window, 7 dormant) [1010]. 4 closed in window [1011].
- Open and active: [#3143](https://github.com/cypress-io/cypress/issues/3143) screenshot attachment path not passed to reporters (43 +1, 2019, updated 2026-03-20; reporting, adjacent). [#24052](https://github.com/cypress-io/cypress/issues/24052) screenshot/video folder structure (20; jennifer-shehane 2024-06-19 "No updates on this issue, sorry."). [#2319](https://github.com/cypress-io/cypress/issues/2319) screenshots saved under "All Specs" (15). [#7966](https://github.com/cypress-io/cypress/issues/7966) element extending past viewport top replicates the image top (8). [#25516](https://github.com/cypress-io/cypress/issues/25516) `capture: 'fullPage'` clips UI on scaled viewports (7). [#28674](https://github.com/cypress-io/cypress/issues/28674) `cy.screenshot()` doesn't wait for scrolling (3; jennifer-shehane 2024-10-01 "No, we're not currently prioritizing looking at this."). The two individual comment threads #2319 and #7966 were not reviewed.
- DORMANT but large: [#587](https://github.com/cypress-io/cypress/issues/587) configurable screenshot size (44), [#3324](https://github.com/cypress-io/cypress/issues/3324) `cypress open` vs `cypress run` produce different screenshot sizes (31), [#2681](https://github.com/cypress-io/cypress/issues/2681) (18) and [#2348](https://github.com/cypress-io/cypress/issues/2348) (13) full-page stitching bugs [1010].
- Closed in window: [#9443](https://github.com/cypress-io/cypress/issues/9443) screenshotting triggers a window resize event (50 +1), closed 2025-08-04 by `cypress-app-bot` "due to inactivity". [#29144](https://github.com/cypress-io/cypress/issues/29144) minor image differences with animation disabled ("Released in 15.18.0"). [#31086](https://github.com/cypress-io/cypress/issues/31086) screenshot on success: jennifer-shehane, use `cy.screenshot()` in `afterEach`; "I'd also recommend checking out Test Replay as it is greatly superior for debugging". Discussion [D#27899](https://github.com/cypress-io/cypress/discussions/27899) waiting for animated elements to stop moving (7 up, no maintainer reply).

#### garris/BackstopJS (7,186 stars; Discussions disabled)
- 33 open active [192] (18 created in window [193]); only 8 closed in window, max +1 = 3 [194]. Top open: [#1303](https://github.com/garris/BackstopJS/issues/1303) inconsistent results with docker (4 +1, 2021, active 2025-07: "removing the animations… helped"). [#1587](https://github.com/garris/BackstopJS/issues/1587) WebP instead of PNG (3; contributor PR #1624 proposed 2026-08-12). [#1165](https://github.com/garris/BackstopJS/issues/1165) undo Approve in report (2). [#1607](https://github.com/garris/BackstopJS/issues/1607) missing UI elements not detected at threshold 0 (0 +1): owner garris, "This definitely sounds wrong. Threshold of 0 should do an exact comparison". [#1603](https://github.com/garris/BackstopJS/issues/1603) high false-positive rate: "probably environmental".
- Maintenance status: the README "News" now says "BackstopJS needs a new maintainer/owner" (repo README via API). Last release commit is "6.3.25" on 2024-09-07; the last commit is a README update on 2026-09-08 (commits API). In [#1625](https://github.com/garris/BackstopJS/issues/1625) garris wrote on 2026-09-08 "It is way past time for me to pass the baton". On 2026-10-08 an outside volunteer (`bensynapse`, "I run Live Tennis API") offered to maintain. They were added as a collaborator, and npm account `livetennisapi` was added as an npm owner on 2026-10-10. PR [#1627](https://github.com/garris/BackstopJS/pull/1627) (Puppeteer upgrade, requires Node ≥22.12) is open and unmerged.

#### argos-ci/argos (641 stars; description: "The open source visual testing platform for teams and AI agents")
- 0 open issues [195]; 58 closed in window [197]. Shipped in window: [#1152](https://github.com/argos-ci/argos/issues/1152) "Add screenshot variants" (8 +1; mark multiple variations as valid to reduce flakes), 2025-08-11 "We can now ignore some changes, it's shipped". [#1384](https://github.com/argos-ci/argos/issues/1384) preserve previous approvals (1; a user was re-reviewing "100+ files at each commit"). [#1582](https://github.com/argos-ci/argos/issues/1582) flaky analytics (2025-08-20). [#1943](https://github.com/argos-ci/argos/issues/1943) wait for background images (2026-06-26). [#1248](https://github.com/argos-ci/argos/issues/1248) group by browser/resolution. [#2078](https://github.com/argos-ci/argos/issues/2078) CLI or MCP for inspecting builds (see Q5). Discussion [D#1811](https://github.com/argos-ci/argos/discussions/1811) "Self hosting possible?" (1 up, 2025-09-10, no maintainer reply).

#### reg-viz/reg-suit (1,301 stars)
- 3 open active [198], 1 closed in window [200]. [#691](https://github.com/reg-viz/reg-suit/issues/691) more than one PR comment per run (2 +1, completed 2025-08-08). [#730](https://github.com/reg-viz/reg-suit/issues/730) monorepo namespaces/scopes in the GitHub notify plugin (0 +1, 2026-06-12, open, no maintainer reply).

#### americanexpress/jest-image-snapshot (3,918 stars)
- 7 open active [201], 7 closed [203]. [#331](https://github.com/americanexpress/jest-image-snapshot/issues/331) `storeReceivedOnFailure` refuses to store received images in CI (4 +1; a user hit it while "setting up CI to automatically create and after review commit the images"). [#375](https://github.com/americanexpress/jest-image-snapshot/issues/375) "Consider blazediff for faster pixel-by-pixel and SSIM comparisons" (0, 2025-11-11). Closed: [#371](https://github.com/americanexpress/jest-image-snapshot/issues/371) Jest 30 support (9, released 2025-09-23) and [#366](https://github.com/americanexpress/jest-image-snapshot/issues/366) "Release of new version?" (6).

#### webdriverio/visual-testing (157 stars)
- 5 open [204], 60 closed in window [206]; all open items 0 +1. [#1311](https://github.com/webdriverio/visual-testing/issues/1311) (2026-10-09, proposal for v11): "a check counts all different pixels and compares the percentage with a tolerance… A real change in a small area (an icon, a badge, a few letters) changes few pixels in total, so a tolerance can hide it". It proposes a noise-tolerant mode using pixelmatch 8 ("Since #1289 we use pixelmatch 8"). [#690](https://github.com/webdriverio/visual-testing/issues/690) "Wait for Screenshot to Match" (open since 2024-12).

#### gemini-testing/testplane (832 stars)
- 14 open active [180], 1 closed in window [182]. `screenshot`: 1 open, 0 closed [183–185]. No visual issue above 0 +1; top issue overall [#959](https://github.com/gemini-testing/testplane/issues/959) (3 +1, Russian-language, browser methods). [#1212](https://github.com/gemini-testing/testplane/issues/1212) "Build docker images with browsers" (0, 2026-02-25).

### Inferences
- Playwright users' visual-testing asks (review/accept UI, docker rendering, stale cleanup, remote storage, pluggable comparators) have been triaged out of the runner, not rejected for lack of demand. Several had 50–98 +1, which is high for these trackers.
- Vitest is now the second built-in runner VRT (pixelmatch-based, Playwright-like semantics). Its tracker is mostly 2025–2026 polish bugs with low reactions, so its demand is early-stage rather than unmet-at-scale.
- Storybook steers visual testing to Chromatic (cloud) and names a third-party addon for local use. The non-Chromatic local VRT ask (D#31826) has had no maintainer reply.

### Gaps
- Keyword search matches title, body and comments, so relevance was judged manually from titles and bodies. Visual issues whose text lacks my terms may be missed. Testplane's Russian-language issues are likely under-sampled.
- I did not read every thread. Maintainer positions are stated only where comments were fetched (111 issues); "not reviewed" is marked where relevant.
- `updated:` filters count bot activity (Cypress stale bot, Playwright triage), which inflates "active in window" for some old issues.
- Discussions upvotes and issue +1 are not comparable units. Playwright, BackstopJS, reg-suit and wdio have no Discussions.

## Q2. Theme clusters: total reactions, representative issues, dominant maintainer response

### Takeaway
By summed +1 on active-in-window issues, the largest themes are:
- cross-OS/environment-consistent capture (243)
- review/approval UI (149)
- the baseline update workflow (141)
- capture stability (138)
- comparator/tolerance semantics (110)
- storage/format (105)
- element vs full-page geometry (97)

Themes with almost no reaction signal: sharding/merging (3), changed-only scoping (1 +1, 2 up), and agents/MCP (8 +1).

### Cited Findings
Totals were computed by a script over the fetched search and comment data. Each issue is assigned to exactly one theme; DORMANT issues are excluded.

| Theme | Active issues | Σ +1 | Discussions (n / Σ up) | Representative issues (+1) | Dominant maintainer response |
|---|---|---|---|---|---|
| T1 Cross-OS / environment-consistent baselines (docker, CPU arch, headless/headed, DPR, platform widgets) | 21 | **243** | 0 | PW [#20954](https://github.com/microsoft/playwright/issues/20954) (98), [#38200](https://github.com/microsoft/playwright/issues/38200) (23), [#4295](https://github.com/microsoft/playwright/issues/4295) (20), [#20552](https://github.com/microsoft/playwright/issues/20552) (19), [#12683](https://github.com/microsoft/playwright/issues/12683) (17), [#13873](https://github.com/microsoft/playwright/issues/13873) (15), [#18810](https://github.com/microsoft/playwright/issues/18810) (12); Vitest [#9363](https://github.com/vitest-dev/vitest/issues/9363) (11), [#9124](https://github.com/vitest-dev/vitest/issues/9124) (6); BackstopJS [#1303](https://github.com/garris/BackstopJS/issues/1303) (4) | Playwright: "Not planned." / "expected" divergence / hardcode the platform in `snapshotPathTemplate` ([#34956](https://github.com/microsoft/playwright/issues/34956)). Dormant extras: PW #12077 (38), Cypress #3324 (31) |
| T4 Review / approval UI | 11 | **149** | 1 / 3 | PW [#24310](https://github.com/microsoft/playwright/issues/24310) (58), [#14883](https://github.com/microsoft/playwright/issues/14883) (42), [#16970](https://github.com/microsoft/playwright/issues/16970) (24, VS Code checkbox exists), [#23197](https://github.com/microsoft/playwright/issues/23197) (7); Vitest [#4060](https://github.com/vitest-dev/vitest/issues/4060) (7), [#2229](https://github.com/vitest-dev/vitest/issues/2229) (4); BackstopJS [#1165](https://github.com/garris/BackstopJS/issues/1165) (2); Argos [#1384](https://github.com/argos-ci/argos/issues/1384) (1) | Playwright not_planned, no comment. Vitest wants an Insta-style review mode, not built. Hosted vendors (Argos) ship |
| T5 Baseline update workflow (changed-only, missing, stale cleanup, fail+update, update-from-results) | 15 | **141** | 1 / 2 | PW [#16582](https://github.com/microsoft/playwright/issues/16582) (52), [#23502](https://github.com/microsoft/playwright/issues/23502) (36), [#34775](https://github.com/microsoft/playwright/issues/34775) (19), [#17294](https://github.com/microsoft/playwright/issues/17294) (7), [#30199](https://github.com/microsoft/playwright/issues/30199) (4), [#35153](https://github.com/microsoft/playwright/issues/35153) (4), [#34376](https://github.com/microsoft/playwright/issues/34376) (3), [#42652](https://github.com/microsoft/playwright/issues/42652) (3); jest-image-snapshot [#331](https://github.com/americanexpress/jest-image-snapshot/issues/331) (4); lost-pixel [D#432](https://github.com/lost-pixel/lost-pixel/discussions/432) (2 up) | Split. Playwright shipped `changed` (default) and `missing` modes; stale cleanup explicitly declined; fail+update and update-from-results not done |
| T6 Capture stability / anti-flake | 13 | **138** | 2 / 9 | Cypress [#9443](https://github.com/cypress-io/cypress/issues/9443) (50); PW [#18827](https://github.com/microsoft/playwright/issues/18827) (48), [#20987](https://github.com/microsoft/playwright/issues/20987) (16), [#32889](https://github.com/microsoft/playwright/issues/32889) (16, shipped); Cypress [D#27899](https://github.com/cypress-io/cypress/discussions/27899) (7 up); Vitest [D#9878](https://github.com/vitest-dev/vitest/discussions/9878) (2 up) | Mostly not_planned or stale-bot closed. Small shipped fixes: PW expect-config timeout, Cypress 15.18.0, Argos background-image wait and flaky analytics |
| T2 Comparator / tolerance semantics | 13 | **110** | 0 | PW [#28578](https://github.com/microsoft/playwright/issues/28578) (57), [#24312](https://github.com/microsoft/playwright/issues/24312) (28), [#37019](https://github.com/microsoft/playwright/issues/37019) (20), [#38933](https://github.com/microsoft/playwright/issues/38933) (4); wdio [#1311](https://github.com/webdriverio/visual-testing/issues/1311) (0); jest-image-snapshot [#375](https://github.com/americanexpress/jest-image-snapshot/issues/375) (0); BackstopJS [#1607](https://github.com/garris/BackstopJS/issues/1607) (0) | Playwright explicitly "out of scope" and declined. Vitest shipped a faster comparator ([#9431](https://github.com/vitest-dev/vitest/issues/9431)) |
| T9 Baseline storage & image format | 5 | **105** | 0 | PW [#22984](https://github.com/microsoft/playwright/issues/22984) WebP (68, shipped 1.62), [#29227](https://github.com/microsoft/playwright/issues/29227) remote storage (32), [#35071](https://github.com/microsoft/playwright/issues/35071) S3 path in merged reports (1); BackstopJS [#1587](https://github.com/garris/BackstopJS/issues/1587) WebP (3) | WebP shipped; remote/S3 storage not planned. LFS: only pre-window issues ([#23012](https://github.com/microsoft/playwright/issues/23012) dormant) [2002][2010] |
| T8 Element vs full-page / capture geometry | 17 | **97** | 2 / 15 | PW [#16928](https://github.com/microsoft/playwright/issues/16928) (33), [#32373](https://github.com/microsoft/playwright/issues/32373) (20), [#28394](https://github.com/microsoft/playwright/issues/28394) (14); Cypress [#7966](https://github.com/cypress-io/cypress/issues/7966) (8), [#25516](https://github.com/cypress-io/cypress/issues/25516) (7); Vitest [D#7749](https://github.com/vitest-dev/vitest/discussions/7749) (14 up) | Left open or boilerplate-closed. Dormant extras: Cypress #587 (44), #2681 (18), #2348 (13) |
| T11 Component / Storybook VRT outside the runner | 6 | **77** | 4 / 27 | PW [#15275](https://github.com/microsoft/playwright/issues/15275) (35), [#18937](https://github.com/microsoft/playwright/issues/18937) (26); Vitest [#6265](https://github.com/vitest-dev/vitest/issues/6265) (13, shipped v4); SB [D#31826](https://github.com/storybookjs/storybook/discussions/31826) (9 up), [D#32930](https://github.com/storybookjs/storybook/discussions/32930) (6 up); Vitest [D#690](https://github.com/vitest-dev/vitest/discussions/690) (11 up) | PW not_planned. Vitest shipped. Storybook points to Chromatic or a third-party addon |
| T10 Reports / CI output (non-debug) | 12 | 46 | 0 | Cypress [#24052](https://github.com/cypress-io/cypress/issues/24052) (20), [#2319](https://github.com/cypress-io/cypress/issues/2319) (15); reg-suit [#691](https://github.com/reg-viz/reg-suit/issues/691) (2, shipped), [#730](https://github.com/reg-viz/reg-suit/issues/730) (0) | Cypress "No updates"; Vitest bugs fixed |
| T3 Masking / ignore regions | 5 | 26 | 0 | PW [#29878](https://github.com/microsoft/playwright/issues/29878) (9), [#12816](https://github.com/microsoft/playwright/issues/12816) (7; 2022 maintainer: "planning a feature… that ignores region while comparing, yet shows the content"), [#41504](https://github.com/microsoft/playwright/issues/41504) (0); Argos [#1152](https://github.com/argos-ci/argos/issues/1152) (8, shipped) | PW open / not_planned. Argos shipped "ignore some changes" |
| T13 Capture matrices (theme / colorScheme / globals / browser) | 6 | 16 | 1 / 3 | test-runner [#516](https://github.com/storybookjs/test-runner/issues/516) "Testing multiple themes?" (8), [#573](https://github.com/storybookjs/test-runner/issues/573) viewports in SB9 (4, completed), [#535](https://github.com/storybookjs/test-runner/issues/535) change globals before render (3); lost-pixel [#457](https://github.com/lost-pixel/lost-pixel/issues/457) only one browser baseline stored (0); SB [D#31790](https://github.com/storybookjs/storybook/discussions/31790) (3 up) | Left open at archive. lost-pixel [#406](https://github.com/lost-pixel/lost-pixel/issues/406) light/dark is dormant |
| T7 Fonts / text rendering | 5 | 11 | 0 | PW [#29968](https://github.com/microsoft/playwright/issues/29968) (8; yury-s "No easy workaround"), [#33236](https://github.com/microsoft/playwright/issues/33236) MS core fonts in docker (3); new WebKit/Chromium font bugs [#42986](https://github.com/microsoft/playwright/issues/42986), [#43004](https://github.com/microsoft/playwright/issues/43004), [#42962](https://github.com/microsoft/playwright/issues/42962) (0) | Not planned or boilerplate; mostly browser-level |
| T15 Agents / MCP | 8 | 8 | 2 / 2 | Vitest [#8411](https://github.com/vitest-dev/vitest/issues/8411) (6); Argos [#2078](https://github.com/argos-ci/argos/issues/2078) (1, shipped) | See Q5 |
| T14 Sharding / merging reports | 3 | 3 | 0 | test-runner [#577](https://github.com/storybookjs/test-runner/issues/577) (2), lost-pixel [#449](https://github.com/lost-pixel/lost-pixel/issues/449) (1), PW [#39855](https://github.com/microsoft/playwright/issues/39855) (0) | Archived or not_planned [2000][2001] |
| T12 Changed-only / scoped runs | 1 | 1 | 1 / 2 | SB [#34250](https://github.com/storybookjs/storybook/issues/34250) (shipped, local dev), [D#35199](https://github.com/storybookjs/storybook/discussions/35199) (2 up, CI) | Storybook shipped local-only, Vite-only first |
| ADJ Debug screenshots (not VRT) | 5 | 127 | 0 | Cypress [#3143](https://github.com/cypress-io/cypress/issues/3143) (43); PW [#20068](https://github.com/microsoft/playwright/issues/20068) (42), [#23191](https://github.com/microsoft/playwright/issues/23191) (36) | not_planned; Cypress steers to Test Replay |
| ADJ Report / artifact redaction | 3 | 19 | 0 | PW [#38673](https://github.com/microsoft/playwright/issues/38673) (17, shipped v1.65 `secrets`) | Shipped |
| Merge queue | 0 | 0 | — | `"merge queue"` across PW, Argos, BackstopJS, reg-suit, Storybook returned 2 irrelevant hits [2009] | No signal |

Not in the table: ARIA snapshot items with Σ+1 = 61, all closed states as reported by the API and not individually verified. Playwright: [#34264](https://github.com/microsoft/playwright/issues/34264) (16, open), [#34555](https://github.com/microsoft/playwright/issues/34555) (8, open), [#34839](https://github.com/microsoft/playwright/issues/34839) (16, closed completed), [#35223](https://github.com/microsoft/playwright/issues/35223) (6, closed completed), [#38833](https://github.com/microsoft/playwright/issues/38833) (3, open), [#39345](https://github.com/microsoft/playwright/issues/39345) (3, closed v1.59). Vitest: [#6933](https://github.com/vitest-dev/vitest/issues/6933) (7, closed completed), [#9947](https://github.com/vitest-dev/vitest/issues/9947) (2, open).

### Inferences
- The top three themes (T1, T4, T5; 533 +1 combined) are environment and workflow problems around baselines, not comparison math. They are where runner maintainers have stopped engaging.
- T1 is underestimated by these totals. The large dormant asks (PW #12077 38, Cypress #3324 31) and the docker-centric T7 font issues point the same way: users want "render the same everywhere".
- T13 (capture matrices) and T14 (sharding) carry little demand in these trackers. They live mainly in the archived tools' orphaned backlogs.

### Gaps
- Theme assignment is my judgment (one theme per issue). A few issues could fit two themes, e.g. #18827 (stability vs geometry) and #29968 (fonts vs stability).
- Reactions measure only users who found the issue. Hosted-vendor demand (Chromatic, Percy, Applitools) is invisible here.
- Merge-queue and Git-LFS demand: the targeted queries found nothing relevant in window [2009][2002][2010]. That is absence of evidence in these trackers only. Merge-queue pain may surface in CI-provider or vendor trackers I did not search.
- Sharding/merging and monorepo queries [2000][2001][2003] returned mostly unrelated runner issues. Any visual-specific demand there is below the noise floor of keyword search.

## Q3. What maintainers explicitly declined as out of scope vs. shipped

### Takeaway
Playwright explicitly declined:
- pluggable comparators ("out of scope")
- stale-baseline cleanup ("script on top of git")
- exact-diff thresholds
- docker integration ("Not planned.")
- platform-identical rendering ("expected" / "no good way")

It bulk-closed the review/accept UI, interactive review CLI, remote storage, image-to-image compare and compare-outside-test requests without stating a reason. What runners do ship is incremental: WebP, `--update-snapshots=changed|missing`, timeout config and report secret redaction in Playwright, plus `toMatchScreenshot` in Vitest 4. Hosted vendors (Argos, Chromatic) ship the review/approval features.

### Cited Findings
- **Explicitly declined, with rationale:**
  - Pluggable image comparator: [PW #28578](https://github.com/microsoft/playwright/issues/28578), "I'll close it as out of scope". Rationale: a public extensibility API means long-term API, docs and test commitment, and the request "Only collected 10 upvotes over 2 years (very low number on Playwright scale)" at that time.
  - Stale/obsolete baseline removal: [PW #16582](https://github.com/microsoft/playwright/issues/16582), "decided not to proceed… straightforward to script on top of git instead".
  - Exact diff-pixel thresholds: [PW #38933](https://github.com/microsoft/playwright/issues/38933), "pixel diffs are not stable or predictable".
  - Docker integration: [PW #20552](https://github.com/microsoft/playwright/issues/20552), "Not planned."; [PW #20954](https://github.com/microsoft/playwright/issues/20954), "stalled due to the lack of demand", later not_planned.
  - Native `<select>` rendering: [PW #38200](https://github.com/microsoft/playwright/issues/38200), "I don't think we can or should do anything about that".
  - Remote-platform detection: [PW #34956](https://github.com/microsoft/playwright/issues/34956), team recommends hardcoding the platform in config.
  - Firefox headless scrollbars: [PW #4295](https://github.com/microsoft/playwright/issues/4295), "Not planned."
  - Cypress success screenshots: [#31086](https://github.com/cypress-io/cypress/issues/31086), use `afterEach` and Test Replay.
  - Cypress scroll-settle: [#28674](https://github.com/cypress-io/cypress/issues/28674), "not currently prioritizing".
  - Vitest `beforeComparison` transform hook: [#9341](https://github.com/vitest-dev/vitest/issues/9341), skeptical. createDiff behaviour: [#11178](https://github.com/vitest-dev/vitest/issues/11178), "intentional".
- **Closed `not_planned` without a stated reason** (Playwright, May 2026): [#24310](https://github.com/microsoft/playwright/issues/24310) accept button (58), [#14883](https://github.com/microsoft/playwright/issues/14883) interactive review CLI (42), [#29227](https://github.com/microsoft/playwright/issues/29227) remote storage (32), [#37019](https://github.com/microsoft/playwright/issues/37019) custom comparators (20), [#8161](https://github.com/microsoft/playwright/issues/8161) umbrella VRT (84), [#15275](https://github.com/microsoft/playwright/issues/15275) compare outside `test()` (35), [#18937](https://github.com/microsoft/playwright/issues/18937) image-vs-image compare (26), [#34775](https://github.com/microsoft/playwright/issues/34775) obsolete snapshots (19), [#20987](https://github.com/microsoft/playwright/issues/20987) target-screenshot stabilization (16), [#18827](https://github.com/microsoft/playwright/issues/18827) height/compression flake (48), [#12816](https://github.com/microsoft/playwright/issues/12816) ignore-region-but-show-content (7), [#24312](https://github.com/microsoft/playwright/issues/24312) flaky visual comparison umbrella (28).
- **Shipped in window:**
  - Playwright: WebP screenshots in 1.62 ([#22984](https://github.com/microsoft/playwright/issues/22984)). `--update-snapshots=changed` became the default ([#17294](https://github.com/microsoft/playwright/issues/17294)). `--update-snapshots=missing` that passes, via [PR #42662](https://github.com/microsoft/playwright/pull/42662) ([#42652](https://github.com/microsoft/playwright/issues/42652)). `toHaveScreenshot` timeout in expect config, via [PR #40720](https://github.com/microsoft/playwright/pull/40720). Reporter/trace `secrets` redaction, via [PR #43334](https://github.com/microsoft/playwright/pull/43334) and [PR #43423](https://github.com/microsoft/playwright/pull/43423). VS Code "Update snapshots" checkbox ([#16970](https://github.com/microsoft/playwright/issues/16970)).
  - Vitest: `toMatchScreenshot` in v4 ([#6265](https://github.com/vitest-dev/vitest/issues/6265), [#7892](https://github.com/vitest-dev/vitest/issues/7892)), faster comparator ([#9431](https://github.com/vitest-dev/vitest/issues/9431)), retry orphan-file fixes ([#10211](https://github.com/vitest-dev/vitest/issues/10211), [#11382](https://github.com/vitest-dev/vitest/issues/11382)).
  - Storybook: Review Changes ([#34250](https://github.com/storybookjs/storybook/issues/34250)).
  - Cypress: 15.18.0 animation-diff fix ([#29144](https://github.com/cypress-io/cypress/issues/29144)).
  - Argos: variants/ignore changes, preserve approvals, flaky analytics, background-image wait, browser/resolution grouping, agent-review CLI ([#1152](https://github.com/argos-ci/argos/issues/1152), [#1384](https://github.com/argos-ci/argos/issues/1384), [#1582](https://github.com/argos-ci/argos/issues/1582), [#1943](https://github.com/argos-ci/argos/issues/1943), [#1248](https://github.com/argos-ci/argos/issues/1248), [#2078](https://github.com/argos-ci/argos/issues/2078)).
  - jest-image-snapshot: Jest 30 support ([#371](https://github.com/americanexpress/jest-image-snapshot/issues/371)).
  - reg-suit: multiple PR comments ([#691](https://github.com/reg-viz/reg-suit/issues/691)).
- Storybook does not ship first-party local VRT. Its docs offer the cloud Visual Tests addon or third-party `storybook-addon-vis` for image snapshots ([migration-guide.mdx](https://github.com/storybookjs/storybook/blob/next/docs/writing-tests/integrations/vitest-addon/migration-guide.mdx)).

### Inferences
- The strongest "dedicated tool can fill this" signals are the explicitly declined and silently closed Playwright items with high reactions. Ranked: docker/consistent rendering (#20954 98, #20552 19), review/accept (#24310 58, #14883 42), stale cleanup (#16582 52, #34775 19), pluggable/perceptual comparison (#28578 57, #24312 28, #37019 20), remote storage (#29227 32), and compare-outside-runner (#15275 35, #18937 26).
- pavelfeldman's #28578 rationale (API commitment cost) suggests Playwright will keep VRT minimal and built-in rather than become a platform. Standalone tools can own the extensibility surface.

### Gaps
- Bulk not_planned closures carry no rationale. They may reflect database hygiene rather than a product decision, and several could be reopened on request (the boilerplate invites new issues).
- I verified "shipped" only where a maintainer comment or merged PR said so. Closures I didn't open individually keep their API `state_reason`.

## Q4. Forks and successors of archived lost-pixel/lost-pixel and storybookjs/test-runner

### Takeaway
No community fork of either project has meaningful traction. Every fork has 0–2 stars, and only two lost-pixel forks have functional or docs commits after the archive date, both 0 stars. lost-pixel's team went to Figma and sunset the product. test-runner's visual-testing users are being routed to Chromatic, the Vitest addon, or small third-party addons (storybook-addon-vis 58 stars, storycap-testrun 69 stars). Both tools' open backlogs (43 and 119 issues) were orphaned.

### Cited Findings
- **lost-pixel/lost-pixel** (GraphQL): `isArchived=true`, `archivedAt=2026-04-22T18:24:14Z`, 1,679 stars, 89 forks, 43 open issues. Last commit 2026-04-22 "Lost Pixel team is joining Figma"; the previous one was 2024-11-25 "update deps" (commits API). README: "Lost Pixel is joining Figma. We are sunsetting the product and building what's next." ([repo](https://github.com/lost-pixel/lost-pixel)). All 19 repos in the `lost-pixel` org are archived (orgs/lost-pixel/repos).
- Forks (`repos/lost-pixel/lost-pixel/forks?sort=stargazers`, 89 listed): maximum 2 stars ([axic/lost-pixel](https://github.com/axic/lost-pixel), last push 2024-11-16). Forks pushed after 2026-04-22T18:24:14Z:
  - [erickirt/lost-pixel](https://github.com/erickirt/lost-pixel) (1 star, pushed 2026-04-23): compare = identical, 0 commits after the archive date.
  - [jason-gose/lost-pixel](https://github.com/jason-gose/lost-pixel) (0 stars, pushed 2026-05-20): identical, 0 new commits.
  - [ckorhonen/lost-pixel](https://github.com/ckorhonen/lost-pixel) (0 stars, pushed 2026-09-26): 1 commit, 2026-09-26 "docs: add repository-specific Codex instructions (#1)" (ahead 1 / behind 1). Not a functional continuation.
  - [DSeeHappy/lost-pixel](https://github.com/DSeeHappy/lost-pixel) (0 stars, created 2026-08-16, default branch `molecule/owned`): 2 commits on 2026-08-16, "action: run from the fork's own Dockerfile, not the dead upstream image" and "entrypoint: honor GITHUB_WORKSPACE…" (ahead 2 / behind 0). Description: "Molecule's in-house visual regression engine — fork of lost-pixel (MIT, upstream archived 2026-04), enhanced and maintained by us".
- Repository search `lost-pixel fork:true pushed:>2026-04-22` [1031] returned 33 results, mostly unrelated pixel-art projects. The only VRT-related ones are the forks above, a marketplace-validation mirror (`actions-marketplace-validations/lost-pixel_lost-pixel`, 0 stars), and [tak2-08/universal-visual-kit](https://github.com/tak2-08/universal-visual-kit). The latter has 1 star, was created 2026-08-28, and describes itself as a "Universal self-hosted visual testing kit for AI coding agents — Playwright multi-viewport capture + Lost Pixel + layout-engine diagnosis + scoped auto-fix loop". The `in:readme` searches [1032][1033] were dominated by awesome-lists and were not useful.
- lost-pixel's orphaned open issues (43) [1015][1017] are all ≤3 +1:
  - [#427](https://github.com/lost-pixel/lost-pixel/issues/427) breaking change in a minor version (3)
  - [#445](https://github.com/lost-pixel/lost-pixel/issues/445) process stuck at the end of the last batch (3)
  - [#449](https://github.com/lost-pixel/lost-pixel/issues/449) "Sharding?" (1; a user splits stories manually, "we need a build for each shard which is not ideal")
  - [#431](https://github.com/lost-pixel/lost-pixel/issues/431) Storybook 8 index.json not supported (1)
  - [#383](https://github.com/lost-pixel/lost-pixel/issues/383) Docker mode on Windows (1)
  - [#457](https://github.com/lost-pixel/lost-pixel/issues/457) only one browser baseline stored
  - [#452](https://github.com/lost-pixel/lost-pixel/issues/452) docker exit code 1 on failure
  - [#448](https://github.com/lost-pixel/lost-pixel/issues/448) root threshold ignored in OSS mode
  - [#462](https://github.com/lost-pixel/lost-pixel/issues/462) and [#471](https://github.com/lost-pixel/lost-pixel/issues/471) Histoire options
  - [#453](https://github.com/lost-pixel/lost-pixel/issues/453) Figma as source of truth
  - Discussions [D#432](https://github.com/lost-pixel/lost-pixel/discussions/432) filter stories in update mode (~640 stories × 2 breakpoints) and [D#456](https://github.com/lost-pixel/lost-pixel/discussions/456) run on one component
- **storybookjs/test-runner** (GraphQL): `archivedAt=2026-09-30T13:07:26Z`, 279 stars, 90 forks, 119 open issues [1012]. Last commits 2026-09-28/29: "fix: log warning about ended support" and the merge of PR #610 `fix/remove-official-support`. README: "Official support for Storybook Test Runner has ended… you might want to use Storybook's Vitest integration instead" ([repo](https://github.com/storybookjs/test-runner)).
- Storybook MIGRATION.md (10.x → 11.0.0, "Test runner support ended"): the package "no longer receives fixes or compatibility updates and prints a warning on every run". The Vitest addon "requires a Vite-based framework". Webpack users can "continue using the test runner without official support" or "switch to plain Playwright with a minimal setup that generates tests from stories" ([MIGRATION.md](https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#test-runner-support-ended)).
- test-runner forks (92 listed): maximum 2 stars ([piratetaco/storybook-test-runner](https://github.com/piratetaco/storybook-test-runner), [Niznikr/test-runner](https://github.com/Niznikr/test-runner), both last pushed 2023). No starred fork was pushed after 2025-10-17. The only fork pushed after the archive date, [Morin3/test-runner](https://github.com/Morin3/test-runner) (pushed 2026-10-16), has 0 commits after the archive on `next`, is 179 behind, and its branches are dependabot/snyk only.
- Non-fork successors for test-runner visual testing:
  - [reg-viz/storycap-testrun](https://github.com/reg-viz/storycap-testrun): 69 stars, MIT, pushed 2026-10-19, "Stable visual testing for Storybook. Supporting both `@storybook/test-runner` and `@storybook/addon-vitest` workflows" [1034][1035].
  - [repobuddy/visual-testing](https://github.com/repobuddy/visual-testing) (`storybook-addon-vis`): 58 stars, pushed 2026-10-19, named in Storybook's migration guide.
  - [reg-viz/storycap](https://github.com/reg-viz/storycap): 755 stars, pushed 2026-10-15.
- Biggest orphaned test-runner asks [1012]: [#502](https://github.com/storybookjs/test-runner/issues/502) retry failed tests (41 +1), [#442](https://github.com/storybookjs/test-runner/issues/442) (23), [#78](https://github.com/storybookjs/test-runner/issues/78) move to `@playwright/test` (16), [#516](https://github.com/storybookjs/test-runner/issues/516) testing multiple themes (8), [#577](https://github.com/storybookjs/test-runner/issues/577) `--shard` with `--url` duplicates (2). Closed in window: [#434](https://github.com/storybookjs/test-runner/issues/434) "Any plans to move or support vitest?" (39). shilman: "Vitest-based component testing is the headline feature of Storybook 9".
- Related: [storybookjs/mcp](https://github.com/storybookjs/mcp) is also archived (271 stars, pushed 2026-09-07; orgs/storybookjs/repos).

### Inferences
- There is no community "lost-pixel 2" to compete with or merge into. The only post-archive work is company-internal patching to keep the GitHub Action alive ("dead upstream image"), which suggests lost-pixel Action users in CI are already broken.
- Webpack-based Storybook 7/8 users lose official test-runner support. Storybook's own fallback is "plain Playwright… generates tests from stories", which is exactly what a Storybook-discovering Playwright CLI provides.

### Gaps
- I checked post-archive commits only on each fork's default branch, plus branch names; non-default-branch pushes weren't dated individually.
- Off-GitHub sources (npm downloads, the lost-pixel blog post, Figma announcement details) were not fetched, per the GitHub-only source constraint.

## Q5. Discussions or issues about how coding agents / MCP should interact with screenshot baselines

### Takeaway
No issue in the 10 repos directly debates whether agents may write baselines, and absolute reactions are tiny (Σ +1 = 8, 2 discussion upvotes). The concrete signals are qualitative and recent (2026):
- A Playwright contributor documented AI-CLI prompts that step through failing snapshots with a human choose/accept/skip loop.
- Argos shipped a CLI for "review builds with AI agents" after a user asked for one.
- Storybook's core team is QA-ing an "agentic review session" for visual changes.
- Vitest maintainers want an MCP server but haven't built one.

### Cited Findings
- [PW #14883](https://github.com/microsoft/playwright/issues/14883): contributor karlhorky, 2026-05-08, one day after the issue was closed not_planned. "This behavior can now be prompted for on the command line using Codex CLI… or Claude Code". His prompt asks the agent to "go through the failing snapshots… prompt me to choose… 1) open the files for me to review… 2) update the baseline (copy the actual result to the snapshots) 3) skip". A second flow downloads a failing GitHub Actions artifact "(which uses Linux, so the snapshots have slightly different rendering than our local macOS machines)" and updates baselines from it.
- [Argos #2078](https://github.com/argos-ci/argos/issues/2078) (2026-03-28): "We use AI coding agents to analyze and fix issues detected in our CI. It would be incredibly powerful if the agent could inspect failing Argos builds via a CLI or MCP… an MVP only needs include a list of all the snapshot that failed". gregberge 2026-05-27: "We updated the CLI it now has everything's needed for a review", linking `argos-ci.com/docs/review-builds-with-ai-agents`.
- Storybook [#35450](https://github.com/storybookjs/storybook/issues/35450) (internal 10.5 QA, 2026-07-10, sub-issue of tracking [#35384](https://github.com/storybookjs/storybook/issues/35384) "On-going effort to fix flakey agent behaviors"): "When a second prompt in an agentic review session produces no visual changes… Either delete the existing review or explicitly surface a 'no visual changes' state… showing a review when none is needed is considered as bad as showing no review when one is needed." [#34250](https://github.com/storybookjs/storybook/issues/34250) frames Review Changes around code changed "by an AI coding agent" and notes "Tools like Storybook MCP can help write stories, but the review step still requires manual navigation".
- [Vitest #8411](https://github.com/vitest-dev/vitest/issues/8411) "MCP server for test results and coverage" (6 +1, open): sheremet-va 2026-01-08, "the team is busy with other features at the moment and we also luck [sic] the experience in building an MCP server, but I have created a repository for the official MCP server because we do want to have one: https://github.com/vitest-community/mcp". hi-ogawa suggested feeding `llms-full.txt` instead. [Vitest #7818](https://github.com/vitest-dev/vitest/issues/7818) "`vitest` seems to be an issue now that we have code agents" was fixed by PR #7673.
- Playwright MCP/CLI screenshot tooling (not baselines): [#42362](https://github.com/microsoft/playwright/issues/42362) "Unnecessary screenshot image scaling degrades model vision" (fixed 2026-08-27), [#42511](https://github.com/microsoft/playwright/issues/42511) named screenshot saved in output dir (open), [#41417](https://github.com/microsoft/playwright/issues/41417) PNG/JPEG/WebP output format (completed). The healer/test-agents issues are about language and IDE support, not baselines: [#38610](https://github.com/microsoft/playwright/issues/38610) Python (44), [#37739](https://github.com/microsoft/playwright/issues/37739) Cursor (41) [1028][1029]. microsoft/playwright-mcp has no baseline or VRT requests: `"visual regression"` returned 1 irrelevant hit [1020] and `toHaveScreenshot` returned 0 [1022].
- Storybook discussions: [D#34432](https://github.com/storybookjs/storybook/discussions/34432) Chromatic-hosted Storybook MCP failing with Claude Code (OAuth). [D#35860](https://github.com/storybookjs/storybook/discussions/35860) versioned MCP instances, so an AI agent sees the design-system version a consumer actually uses.

#### Security and data-quality notes
- No content attempted to instruct me, and nothing was followed. Several items are AI-agent-authored or AI-styled and were treated as data only:
  - [Argos D#2611](https://github.com/argos-ci/argos/discussions/2611) (2026-09-21): an account self-described as "an AI agent exploring practical uses for ATTO" solicits a provider-run visual diff.
  - [PW #40819](https://github.com/microsoft/playwright/issues/40819): comment "Bean Labs took a source/docs pass…".
  - [reg-suit #730](https://github.com/reg-viz/reg-suit/issues/730): a "Technical analysis and implementation suggestion" comment.
  - [PW #8161](https://github.com/microsoft/playwright/issues/8161): last comment promotes a third-party extension.
  - PW #14883 contains prompts written for AI CLIs (benign, aimed at humans).
- Supply chain: BackstopJS npm ownership went to the new account `livetennisapi` two days after a volunteer offer ([#1625](https://github.com/garris/BackstopJS/issues/1625)). Any interop or migration guidance should pin versions and verify package provenance.

### Inferences
- Practitioners already use agents as the review UI that runners declined to build, and they keep a human choice step. Vendors (Argos, Storybook/Chromatic) are converging on "agent reads a structured list of changed snapshots; human approves".
- Storybook's QA rule ("a review when none is needed is as bad as no review") is a concrete acceptance criterion for any MCP that reports visual changes.

### Gaps
- No issue or discussion found asking for policy controls (e.g. "block agents from updating baselines") or for diff-region metadata formats. Demand there is inferred, not observed.
- The Argos docs page and the vitest-community/mcp repo contents were not inspected (off-GitHub page, and out of scope respectively).

## Roadmap implications
Signal = Σ +1 of active-in-window issues (plus Discussion upvotes where stated). The product context was used only to judge relevance. Tags: NEW, EVIDENCE-FOR-EXISTING-ITEM, ALREADY-SHIPPED.

1. **NEW: Container-pinned capture with environment-keyed baselines (closes the cross-OS gap without per-OS variants first).**
   - Scope: an opt-in capture mode that renders inside the official Playwright Docker image matching the installed Playwright version. The manifest records {image digest or Playwright version, browser, DPR, OS tag}. Comparing across mismatched environment keys warns or skips rather than reporting pixel diffs. Per-OS baseline variants are a later step.
   - Signal: 243 (T1, 21 issues), led by PW #20954 (98), #38200 (23), #4295 (20), #20552 (19), #12683 (17), #13873 (15), #18810 (12) and Vitest #9363 (11). It also absorbs the font theme (T7, 11).
   - Why: Playwright says "Not planned." (#20552) and calls cross-arch differences "expected" (#13873). Practitioners currently download Linux CI artifacts to rebaseline from macOS (#14883 comment).
2. **NEW: Local review-and-accept loop (CLI plus HTML-report hooks), feeding the existing human-confirmation gate.**
   - Scope: a `review` command iterates failing, new and missing snapshots (open expected/actual/diff; accept, skip, quit) and writes only accepted actuals to the orphan branch. It supports `--from <run dir or downloaded CI artifact>` to promote actuals without re-running (PW #34376, 3; jest-image-snapshot #331, 4). The static HTML report gets per-snapshot "copy accept command" or accepted-list export, because a self-contained report can't write.
   - Signal: 149 (T4: PW #24310 58, #14883 42, #16970 24; Vitest #4060 7, #2229 4).
   - Why: Playwright closed #24310 and #14883 not_planned without comment. Vitest wants it but hasn't built it.
   - Also EVIDENCE-FOR-EXISTING-ITEM "human confirmation for baseline writes" (#14883 AI-CLI flow keeps a human choice step).
3. **EVIDENCE-FOR-EXISTING-ITEM: orphan-branch PNG pruning.**
   - Signal: 71 (PW #16582 52 + #34775 19) plus Vitest orphan-PNG reports (#10211 2, #11382 0).
   - Design constraint from the decline: Playwright refused because "any given run only observes a subset" of baselines (other OSes, filtered or sharded runs). Prune from the manifest only for entries unreferenced by any declared target × config, never from a filtered or sharded run, and show a dry-run.
4. **EVIDENCE-FOR-EXISTING-ITEM: pixelmatch 8 adoption and small-text misses, and pixel validation with true-positive fixtures.**
   - wdio #1311 (2026-10-09): a percentage tolerance lets "a real change in a small area (an icon, a badge, a few letters)" pass. This bears directly on a 10%-of-pixels default.
   - BackstopJS #1607: missing UI not detected even at threshold 0.
   - PW #24312: 1.2% flake from anti-aliasing noise across 500 runs.
5. **NEW: Opt-in alternative comparators behind the true-positive fixture suite.**
   - Scope: keep pixelmatch as the default gate, with a small comparator interface (e.g. SSIM, perceptual colour-difference tolerance, a faster odiff-class engine) selectable per target. A comparator ships only if it passes the existing true-positive fixtures.
   - Signal: 110 (T2: PW #28578 57, #24312 28, #37019 20, #38933 4; jest-image-snapshot #375 and wdio #1311 at 0).
   - Why: Playwright called this "out of scope" (#28578) and declined exact thresholds (#38933).
6. **NEW: Lossless WebP encoding option for stored baselines and actuals.**
   - Signal: 72 (PW #22984 68, shipped in Playwright 1.62, so users will expect parity; BackstopJS #1587 3; PW #43045 1).
   - Design note (inference): if manifest SHA-256 hashes cover encoded bytes, encoder or version changes will churn hashes. Hash decoded RGBA or pin the encoder.
7. **EVIDENCE-FOR-EXISTING-ITEM: S3 baseline storage (keep gated).**
   - Signal: 33 (PW #29227 32 + #35071 1). Playwright closed both not planned. Git LFS showed no in-window demand [2002][2010], so do not build LFS support.
8. **NEW: Element-capture padding/clip and full-page robustness.**
   - Scope: per-target `padding` and `clip`, a full-page height cap with tiled capture and seam check, and an iframe/canvas capture caveat list.
   - Signal: 97 + 15 up (T8: PW #16928 33, the top active open VRT-labelled Playwright issue; #32373 20; #28394 14; Cypress #7966 8, #25516 7; Vitest D#7749 14 up).
9. **ALREADY-SHIPPED (anti-flake controls), with NEW sub-items to verify or extend.**
   - Sub-items: pointer parking / hover reset between captures (Vitest D#9878; dormant PW #12077 38), no viewport resize during capture (Cypress #9443 50; BackstopJS #1604), pre-scroll to trigger lazy content before full-page capture (PW #19861, #40941), N-consecutive-stable-frames with per-target timeout (PW #18827 48, #20987 16, #32889 16), background-image wait (Argos #1943).
   - Signal: 138 + 9 up (T6).
10. **NEW: Storybook 9/10 (Vite + addon-vitest era) and Webpack-Storybook continuity.**
    - Scope: extend discovery beyond Storybook 7/8 to the current index format. Position explicitly as the "plain Playwright… generates tests from stories" fallback that Storybook's MIGRATION.md recommends for Webpack users after test-runner's end of support.
    - Signal: 77 + 27 up (T11), plus test-runner #434 (39) and #502 (41, retries).
    - Competing local options are small: storybook-addon-vis (58 stars), storycap-testrun (69 stars).
    - Also EVIDENCE-FOR-EXISTING-ITEM "Ladle/Histoire discovery and runner-change warning": lost-pixel orphaned Histoire issues #462 and #471 (0 +1 each), plus the test-runner end-of-support warning.
11. **NEW (low): Capture matrices for theme/colorScheme/globals per story or route.**
    - Signal: 16 + 3 up (test-runner #516 8, #535 3, #573 4; lost-pixel #457 0, #406 dormant; Storybook D#31790 3 up).
    - Keep it minimal, e.g. a list of colorSchemes or Storybook globals per target.
12. **NEW: MCP "visual change summary" contract.**
    - Scope: a tool returns structured changed/new/missing snapshot lists with diff ratio, bounding boxes and unscaled crops (PW #42362: scaling "degrades model vision"). It reports an explicit `no_visual_changes` state (Storybook #35450). Baseline writes go only through the human-confirmation item.
    - Signal: 8 +1 + 2 up (T15). The asks are direct but small: Argos #2078 shipped; Vitest #8411 (6) is wanted but unbuilt.
    - Also EVIDENCE-FOR-EXISTING-ITEM "advisory judge evaluation": Storybook tracks "flakey agent behaviors" (#35384), which supports keeping AI judgement advisory.
13. **EVIDENCE-FOR-EXISTING-ITEM: blocking baseline updates on new serious axe violations.**
    - Signal is weak and older. Storybook [D#17966](https://github.com/storybookjs/storybook/discussions/17966) "Will accessibility tests also run automatically when publishing to chromatic?" (37 up; created 2022, active 2025-04-05) and D#31790 (3 up) show users pairing a11y checks with visual runs.
14. **EVIDENCE-FOR-EXISTING-ITEM: non-gating ARIA/text snapshots.**
    - Runners are actively building ARIA snapshots (Σ+1 61 across PW #34264, #34555, #34839, #35223, #38833, #39345 and Vitest #6933, #9947). Interoperate with the runners' formats rather than invent one (inference).
15. **ALREADY-SHIPPED: changed-file scoping and PR comments.**
    - Storybook now ships local, Vite-only change detection (#34250). CI/static-build scoping is still requested (D#35199, 2 up), so the product's CI scoping is a differentiator, but on low reaction signal.
    - Optional NEW (very low): per-package sections in PR comments for monorepos (reg-suit #730, 0 +1).
16. **NEW (signal is market events, not reactions): importers for orphaned users.**
    - Map lost-pixel config (stories/pages/threshold/masks) and BackstopJS `scenarios` to the CLI's targets and masks.
    - Basis: lost-pixel is archived (1,679 stars) with no living fork; its Action's upstream image is described as "dead". BackstopJS (7,186 stars) is in a maintainer handover with a new npm owner.
17. **Do-not-build or deprioritize:**
    - Sharding/merge-report features (T14, 3).
    - Merge-queue handling (0 relevant hits [2009]; absence of evidence, see Gaps).
    - Git LFS storage (no in-window demand).
    - Font-management features (T7, 11; mostly browser bugs, better solved by item 1).
    - Debug screenshots at `test.step`/`expect.soft` (127 +1, but runner debugging, not VRT).
    - Report secret redaction beyond basic hygiene (Playwright shipped `secrets` in 1.65; 19).
    - Hosted review UI stays gated: the review demand found here is satisfiable locally (item 2), and hosted vendors (Argos) already compete on approvals, variants and flaky analytics.

## Query log
All queries below were executed on 2026-10-19 (UTC) through the authenticated `gh` CLI. Search queries name public projects only. Verified by grep: no query contains the product name, its domain, its owner/org name, internal file names or code.

### A. GitHub REST search (`gh api -X GET <endpoint> -f q=<q> -f sort=<sort> -f order=desc -f per_page=100`), all fetched 2026-10-19 UTC; format: `[id] endpoint sort | q | total_count`
- [t1] search/issues (no sort param; per_page=8) | `repo:microsoft/playwright toHaveScreenshot is:issue sort:reactions-+1-desc` | 307 (sort-syntax check)
- [t2] search/issues reactions-+1 (per_page=8) | `repo:microsoft/playwright toHaveScreenshot is:issue` | 307 (sort-syntax check; identical order to t1)
- [0] issues reactions-+1 | `repo:microsoft/playwright toHaveScreenshot is:issue is:open updated:2025-01-01..2026-10-19` | 5
- [1] issues reactions-+1 | `repo:microsoft/playwright toHaveScreenshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [2] issues reactions-+1 | `repo:microsoft/playwright toHaveScreenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 97
- [3] issues reactions-+1 | `repo:microsoft/playwright screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 38
- [4] issues reactions-+1 | `repo:microsoft/playwright screenshot is:issue is:open created:2025-01-01..2026-10-19` | 21
- [5] issues reactions-+1 | `repo:microsoft/playwright screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 496
- [6] issues reactions-+1 | `repo:microsoft/playwright snapshot is:issue is:open updated:2025-01-01..2026-10-19` | 23
- [7] issues reactions-+1 | `repo:microsoft/playwright snapshot is:issue is:open created:2025-01-01..2026-10-19` | 17
- [8] issues reactions-+1 | `repo:microsoft/playwright snapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 355
- [9] issues reactions-+1 | `repo:microsoft/playwright visual is:issue is:open updated:2025-01-01..2026-10-19` | 15
- [10] issues reactions-+1 | `repo:microsoft/playwright visual is:issue is:open created:2025-01-01..2026-10-19` | 9
- [11] issues reactions-+1 | `repo:microsoft/playwright visual is:issue is:closed closed:2025-01-01..2026-10-19` | 178
- [12] issues reactions-+1 | `repo:microsoft/playwright pixel is:issue is:open updated:2025-01-01..2026-10-19` | 12
- [13] issues reactions-+1 | `repo:microsoft/playwright pixel is:issue is:open created:2025-01-01..2026-10-19` | 8
- [14] issues reactions-+1 | `repo:microsoft/playwright pixel is:issue is:closed closed:2025-01-01..2026-10-19` | 72
- [15] issues reactions-+1 | `repo:microsoft/playwright threshold is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [16] issues reactions-+1 | `repo:microsoft/playwright threshold is:issue is:open created:2025-01-01..2026-10-19` | 0
- [17] issues reactions-+1 | `repo:microsoft/playwright threshold is:issue is:closed closed:2025-01-01..2026-10-19` | 43
- [18] issues reactions-+1 | `repo:microsoft/playwright baseline is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [19] issues reactions-+1 | `repo:microsoft/playwright baseline is:issue is:open created:2025-01-01..2026-10-19` | 3
- [20] issues reactions-+1 | `repo:microsoft/playwright baseline is:issue is:closed closed:2025-01-01..2026-10-19` | 43
- [21] issues reactions-+1 | `repo:microsoft/playwright mask is:issue is:open updated:2025-01-01..2026-10-19` | 5
- [22] issues reactions-+1 | `repo:microsoft/playwright mask is:issue is:open created:2025-01-01..2026-10-19` | 3
- [23] issues reactions-+1 | `repo:microsoft/playwright mask is:issue is:closed closed:2025-01-01..2026-10-19` | 42
- [24] issues reactions-+1 | `repo:microsoft/playwright flaky screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 7
- [25] issues reactions-+1 | `repo:microsoft/playwright flaky screenshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [26] issues reactions-+1 | `repo:microsoft/playwright flaky screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 38
- [27] issues reactions-+1 | `repo:microsoft/playwright font screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [28] issues reactions-+1 | `repo:microsoft/playwright font screenshot is:issue is:open created:2025-01-01..2026-10-19` | 5
- [29] issues reactions-+1 | `repo:microsoft/playwright font screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 33
- [30] issues reactions-+1 | `repo:microsoft/playwright platform screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [31] issues reactions-+1 | `repo:microsoft/playwright platform screenshot is:issue is:open created:2025-01-01..2026-10-19` | 4
- [32] issues reactions-+1 | `repo:microsoft/playwright platform screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 51
- [33] issues reactions-+1 | `repo:microsoft/playwright "visual regression" is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [34] issues reactions-+1 | `repo:microsoft/playwright "visual regression" is:issue is:open created:2025-01-01..2026-10-19` | 1
- [35] issues reactions-+1 | `repo:microsoft/playwright "visual regression" is:issue is:closed closed:2025-01-01..2026-10-19` | 36
- [36] issues reactions-+1 | `repo:microsoft/playwright "update-snapshots" is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [37] issues reactions-+1 | `repo:microsoft/playwright "update-snapshots" is:issue is:open created:2025-01-01..2026-10-19` | 4
- [38] issues reactions-+1 | `repo:microsoft/playwright "update-snapshots" is:issue is:closed closed:2025-01-01..2026-10-19` | 48
- [39] issues reactions-+1 | `repo:microsoft/playwright maxDiffPixels is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [40] issues reactions-+1 | `repo:microsoft/playwright maxDiffPixels is:issue is:open created:2025-01-01..2026-10-19` | 0
- [41] issues reactions-+1 | `repo:microsoft/playwright maxDiffPixels is:issue is:closed closed:2025-01-01..2026-10-19` | 13
- [42] issues reactions-+1 | `repo:microsoft/playwright animations screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 2
- [43] issues reactions-+1 | `repo:microsoft/playwright animations screenshot is:issue is:open created:2025-01-01..2026-10-19` | 1
- [44] issues reactions-+1 | `repo:microsoft/playwright animations screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 23
- [45] issues reactions-+1 | `repo:microsoft/playwright docker screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [46] issues reactions-+1 | `repo:microsoft/playwright docker screenshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [47] issues reactions-+1 | `repo:microsoft/playwright docker screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 67
- [48] issues reactions-+1 | `repo:microsoft/playwright snapshotPathTemplate is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [49] issues reactions-+1 | `repo:microsoft/playwright snapshotPathTemplate is:issue is:open created:2025-01-01..2026-10-19` | 0
- [50] issues reactions-+1 | `repo:microsoft/playwright snapshotPathTemplate is:issue is:closed closed:2025-01-01..2026-10-19` | 15
- [51] issues reactions-+1 | `repo:vitest-dev/vitest toMatchScreenshot is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [52] issues reactions-+1 | `repo:vitest-dev/vitest toMatchScreenshot is:issue is:open created:2025-01-01..2026-10-19` | 6
- [53] issues reactions-+1 | `repo:vitest-dev/vitest toMatchScreenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 18
- [54] issues reactions-+1 | `repo:vitest-dev/vitest screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 27
- [55] issues reactions-+1 | `repo:vitest-dev/vitest screenshot is:issue is:open created:2025-01-01..2026-10-19` | 26
- [56] issues reactions-+1 | `repo:vitest-dev/vitest screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 77
- [57] issues reactions-+1 | `repo:vitest-dev/vitest snapshot is:issue is:open updated:2025-01-01..2026-10-19` | 38
- [58] issues reactions-+1 | `repo:vitest-dev/vitest snapshot is:issue is:open created:2025-01-01..2026-10-19` | 31
- [59] issues reactions-+1 | `repo:vitest-dev/vitest snapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 79
- [60] issues reactions-+1 | `repo:vitest-dev/vitest visual is:issue is:open updated:2025-01-01..2026-10-19` | 11
- [61] issues reactions-+1 | `repo:vitest-dev/vitest visual is:issue is:open created:2025-01-01..2026-10-19` | 9
- [62] issues reactions-+1 | `repo:vitest-dev/vitest visual is:issue is:closed closed:2025-01-01..2026-10-19` | 24
- [63] issues reactions-+1 | `repo:vitest-dev/vitest pixel is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [64] issues reactions-+1 | `repo:vitest-dev/vitest pixel is:issue is:open created:2025-01-01..2026-10-19` | 6
- [65] issues reactions-+1 | `repo:vitest-dev/vitest pixel is:issue is:closed closed:2025-01-01..2026-10-19` | 8
- [66] issues reactions-+1 | `repo:vitest-dev/vitest threshold is:issue is:open updated:2025-01-01..2026-10-19` | 2
- [67] issues reactions-+1 | `repo:vitest-dev/vitest threshold is:issue is:open created:2025-01-01..2026-10-19` | 2
- [68] issues reactions-+1 | `repo:vitest-dev/vitest threshold is:issue is:closed closed:2025-01-01..2026-10-19` | 31
- [69] issues reactions-+1 | `repo:vitest-dev/vitest baseline is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [70] issues reactions-+1 | `repo:vitest-dev/vitest baseline is:issue is:open created:2025-01-01..2026-10-19` | 4
- [71] issues reactions-+1 | `repo:vitest-dev/vitest baseline is:issue is:closed closed:2025-01-01..2026-10-19` | 12
- [72] issues reactions-+1 | `repo:vitest-dev/vitest mask is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [73] issues reactions-+1 | `repo:vitest-dev/vitest mask is:issue is:open created:2025-01-01..2026-10-19` | 4
- [74] issues reactions-+1 | `repo:vitest-dev/vitest mask is:issue is:closed closed:2025-01-01..2026-10-19` | 7
- [75] issues reactions-+1 | `repo:vitest-dev/vitest flaky screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [76] issues reactions-+1 | `repo:vitest-dev/vitest flaky screenshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [77] issues reactions-+1 | `repo:vitest-dev/vitest flaky screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 4
- [78] issues reactions-+1 | `repo:vitest-dev/vitest font screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 2
- [79] issues reactions-+1 | `repo:vitest-dev/vitest font screenshot is:issue is:open created:2025-01-01..2026-10-19` | 2
- [80] issues reactions-+1 | `repo:vitest-dev/vitest font screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 2
- [81] issues reactions-+1 | `repo:vitest-dev/vitest platform screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [82] issues reactions-+1 | `repo:vitest-dev/vitest platform screenshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [83] issues reactions-+1 | `repo:vitest-dev/vitest platform screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 4
- [84] issues reactions-+1 | `repo:vitest-dev/vitest "visual regression" is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [85] issues reactions-+1 | `repo:vitest-dev/vitest "visual regression" is:issue is:open created:2025-01-01..2026-10-19` | 4
- [86] issues reactions-+1 | `repo:vitest-dev/vitest "visual regression" is:issue is:closed closed:2025-01-01..2026-10-19` | 12
- [87] issues reactions-+1 | `repo:vitest-dev/vitest "image snapshot" is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [88] issues reactions-+1 | `repo:vitest-dev/vitest "image snapshot" is:issue is:open created:2025-01-01..2026-10-19` | 0
- [89] issues reactions-+1 | `repo:vitest-dev/vitest "image snapshot" is:issue is:closed closed:2025-01-01..2026-10-19` | 6
- [90] issues reactions-+1 | `repo:vitest-dev/vitest toMatchImageSnapshot is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [91] issues reactions-+1 | `repo:vitest-dev/vitest toMatchImageSnapshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [92] issues reactions-+1 | `repo:vitest-dev/vitest toMatchImageSnapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 2
- [93] issues reactions-+1 | `repo:storybookjs/storybook screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 110
- [94] issues reactions-+1 | `repo:storybookjs/storybook screenshot is:issue is:open created:2025-01-01..2026-10-19` | 14
- [95] issues reactions-+1 | `repo:storybookjs/storybook screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 182
- [96] issues reactions-+1 | `repo:storybookjs/storybook snapshot is:issue is:open updated:2025-01-01..2026-10-19` | 34
- [97] issues reactions-+1 | `repo:storybookjs/storybook snapshot is:issue is:open created:2025-01-01..2026-10-19` | 20
- [98] issues reactions-+1 | `repo:storybookjs/storybook snapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 36
- [99] issues reactions-+1 | `repo:storybookjs/storybook visual is:issue is:open updated:2025-01-01..2026-10-19` | 24
- [100] issues reactions-+1 | `repo:storybookjs/storybook visual is:issue is:open created:2025-01-01..2026-10-19` | 17
- [101] issues reactions-+1 | `repo:storybookjs/storybook visual is:issue is:closed closed:2025-01-01..2026-10-19` | 65
- [102] issues reactions-+1 | `repo:storybookjs/storybook pixel is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [103] issues reactions-+1 | `repo:storybookjs/storybook pixel is:issue is:open created:2025-01-01..2026-10-19` | 1
- [104] issues reactions-+1 | `repo:storybookjs/storybook pixel is:issue is:closed closed:2025-01-01..2026-10-19` | 5
- [105] issues reactions-+1 | `repo:storybookjs/storybook threshold is:issue is:open updated:2025-01-01..2026-10-19` | 10
- [106] issues reactions-+1 | `repo:storybookjs/storybook threshold is:issue is:open created:2025-01-01..2026-10-19` | 8
- [107] issues reactions-+1 | `repo:storybookjs/storybook threshold is:issue is:closed closed:2025-01-01..2026-10-19` | 8
- [108] issues reactions-+1 | `repo:storybookjs/storybook baseline is:issue is:open updated:2025-01-01..2026-10-19` | 12
- [109] issues reactions-+1 | `repo:storybookjs/storybook baseline is:issue is:open created:2025-01-01..2026-10-19` | 11
- [110] issues reactions-+1 | `repo:storybookjs/storybook baseline is:issue is:closed closed:2025-01-01..2026-10-19` | 20
- [111] issues reactions-+1 | `repo:storybookjs/storybook mask is:issue is:open updated:2025-01-01..2026-10-19` | 9
- [112] issues reactions-+1 | `repo:storybookjs/storybook mask is:issue is:open created:2025-01-01..2026-10-19` | 4
- [113] issues reactions-+1 | `repo:storybookjs/storybook mask is:issue is:closed closed:2025-01-01..2026-10-19` | 9
- [114] issues reactions-+1 | `repo:storybookjs/storybook flaky screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [115] issues reactions-+1 | `repo:storybookjs/storybook flaky screenshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [116] issues reactions-+1 | `repo:storybookjs/storybook flaky screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 1
- [117] issues reactions-+1 | `repo:storybookjs/storybook font screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [118] issues reactions-+1 | `repo:storybookjs/storybook font screenshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [119] issues reactions-+1 | `repo:storybookjs/storybook font screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 9
- [120] issues reactions-+1 | `repo:storybookjs/storybook platform screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [121] issues reactions-+1 | `repo:storybookjs/storybook platform screenshot is:issue is:open created:2025-01-01..2026-10-19` | 1
- [122] issues reactions-+1 | `repo:storybookjs/storybook platform screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 5
- [123] issues reactions-+1 | `repo:storybookjs/storybook "visual regression" is:issue is:open updated:2025-01-01..2026-10-19` | 2
- [124] issues reactions-+1 | `repo:storybookjs/storybook "visual regression" is:issue is:open created:2025-01-01..2026-10-19` | 2
- [125] issues reactions-+1 | `repo:storybookjs/storybook "visual regression" is:issue is:closed closed:2025-01-01..2026-10-19` | 6
- [126] issues reactions-+1 | `repo:storybookjs/storybook "visual tests" is:issue is:open updated:2025-01-01..2026-10-19` | 8
- [127] issues reactions-+1 | `repo:storybookjs/storybook "visual tests" is:issue is:open created:2025-01-01..2026-10-19` | 8
- [128] issues reactions-+1 | `repo:storybookjs/storybook "visual tests" is:issue is:closed closed:2025-01-01..2026-10-19` | 20
- [129] issues reactions-+1 | `repo:storybookjs/storybook storyshots is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [130] issues reactions-+1 | `repo:storybookjs/storybook storyshots is:issue is:open created:2025-01-01..2026-10-19` | 0
- [131] issues reactions-+1 | `repo:storybookjs/storybook storyshots is:issue is:closed closed:2025-01-01..2026-10-19` | 26
- [132] issues reactions-+1 | `repo:storybookjs/storybook "test-runner" is:issue is:open updated:2025-01-01..2026-10-19` | 92
- [133] issues reactions-+1 | `repo:storybookjs/storybook "test-runner" is:issue is:open created:2025-01-01..2026-10-19` | 45
- [134] issues reactions-+1 | `repo:storybookjs/storybook "test-runner" is:issue is:closed closed:2025-01-01..2026-10-19` | 116
- [135] issues reactions-+1 | `repo:storybookjs/storybook chromatic is:issue is:open updated:2025-01-01..2026-10-19` | 120
- [136] issues reactions-+1 | `repo:storybookjs/storybook chromatic is:issue is:open created:2025-01-01..2026-10-19` | 58
- [137] issues reactions-+1 | `repo:storybookjs/storybook chromatic is:issue is:closed closed:2025-01-01..2026-10-19` | 205
- [138] issues reactions-+1 | `repo:cypress-io/cypress screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 84
- [139] issues reactions-+1 | `repo:cypress-io/cypress screenshot is:issue is:open created:2025-01-01..2026-10-19` | 14
- [140] issues reactions-+1 | `repo:cypress-io/cypress screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 209
- [141] issues reactions-+1 | `repo:cypress-io/cypress snapshot is:issue is:open updated:2025-01-01..2026-10-19` | 33
- [142] issues reactions-+1 | `repo:cypress-io/cypress snapshot is:issue is:open created:2025-01-01..2026-10-19` | 15
- [143] issues reactions-+1 | `repo:cypress-io/cypress snapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 78
- [144] issues reactions-+1 | `repo:cypress-io/cypress visual is:issue is:open updated:2025-01-01..2026-10-19` | 18
- [145] issues reactions-+1 | `repo:cypress-io/cypress visual is:issue is:open created:2025-01-01..2026-10-19` | 4
- [146] issues reactions-+1 | `repo:cypress-io/cypress visual is:issue is:closed closed:2025-01-01..2026-10-19` | 27
- [147] issues reactions-+1 | `repo:cypress-io/cypress pixel is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [148] issues reactions-+1 | `repo:cypress-io/cypress pixel is:issue is:open created:2025-01-01..2026-10-19` | 1
- [149] issues reactions-+1 | `repo:cypress-io/cypress pixel is:issue is:closed closed:2025-01-01..2026-10-19` | 6
- [150] issues reactions-+1 | `repo:cypress-io/cypress threshold is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [151] issues reactions-+1 | `repo:cypress-io/cypress threshold is:issue is:open created:2025-01-01..2026-10-19` | 2
- [152] issues reactions-+1 | `repo:cypress-io/cypress threshold is:issue is:closed closed:2025-01-01..2026-10-19` | 15
- [153] issues reactions-+1 | `repo:cypress-io/cypress baseline is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [154] issues reactions-+1 | `repo:cypress-io/cypress baseline is:issue is:open created:2025-01-01..2026-10-19` | 4
- [155] issues reactions-+1 | `repo:cypress-io/cypress baseline is:issue is:closed closed:2025-01-01..2026-10-19` | 11
- [156] issues reactions-+1 | `repo:cypress-io/cypress mask is:issue is:open updated:2025-01-01..2026-10-19` | 7
- [157] issues reactions-+1 | `repo:cypress-io/cypress mask is:issue is:open created:2025-01-01..2026-10-19` | 4
- [158] issues reactions-+1 | `repo:cypress-io/cypress mask is:issue is:closed closed:2025-01-01..2026-10-19` | 11
- [159] issues reactions-+1 | `repo:cypress-io/cypress flaky screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 5
- [160] issues reactions-+1 | `repo:cypress-io/cypress flaky screenshot is:issue is:open created:2025-01-01..2026-10-19` | 1
- [161] issues reactions-+1 | `repo:cypress-io/cypress flaky screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 13
- [162] issues reactions-+1 | `repo:cypress-io/cypress font screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [163] issues reactions-+1 | `repo:cypress-io/cypress font screenshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [164] issues reactions-+1 | `repo:cypress-io/cypress font screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 4
- [165] issues reactions-+1 | `repo:cypress-io/cypress platform screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 6
- [166] issues reactions-+1 | `repo:cypress-io/cypress platform screenshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [167] issues reactions-+1 | `repo:cypress-io/cypress platform screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 22
- [168] issues reactions-+1 | `repo:cypress-io/cypress "visual regression" is:issue is:open updated:2025-01-01..2026-10-19` | 4
- [169] issues reactions-+1 | `repo:cypress-io/cypress "visual regression" is:issue is:open created:2025-01-01..2026-10-19` | 1
- [170] issues reactions-+1 | `repo:cypress-io/cypress "visual regression" is:issue is:closed closed:2025-01-01..2026-10-19` | 6
- [171] issues reactions-+1 | `repo:cypress-io/cypress "cy.screenshot" is:issue is:open updated:2025-01-01..2026-10-19` | 9
- [172] issues reactions-+1 | `repo:cypress-io/cypress "cy.screenshot" is:issue is:open created:2025-01-01..2026-10-19` | 0
- [173] issues reactions-+1 | `repo:cypress-io/cypress "cy.screenshot" is:issue is:closed closed:2025-01-01..2026-10-19` | 9
- [174] issues reactions-+1 | `repo:cypress-io/cypress blackout is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [175] issues reactions-+1 | `repo:cypress-io/cypress blackout is:issue is:open created:2025-01-01..2026-10-19` | 0
- [176] issues reactions-+1 | `repo:cypress-io/cypress blackout is:issue is:closed closed:2025-01-01..2026-10-19` | 0
- [177] issues reactions-+1 | `repo:cypress-io/cypress "image snapshot" is:issue is:open updated:2025-01-01..2026-10-19` | 5
- [178] issues reactions-+1 | `repo:cypress-io/cypress "image snapshot" is:issue is:open created:2025-01-01..2026-10-19` | 0
- [179] issues reactions-+1 | `repo:cypress-io/cypress "image snapshot" is:issue is:closed closed:2025-01-01..2026-10-19` | 6
- [180] issues reactions-+1 | `repo:gemini-testing/testplane is:issue is:open updated:2025-01-01..2026-10-19` | 14
- [181] issues reactions-+1 | `repo:gemini-testing/testplane is:issue is:open created:2025-01-01..2026-10-19` | 11
- [182] issues reactions-+1 | `repo:gemini-testing/testplane is:issue is:closed closed:2025-01-01..2026-10-19` | 1
- [183] issues reactions-+1 | `repo:gemini-testing/testplane screenshot is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [184] issues reactions-+1 | `repo:gemini-testing/testplane screenshot is:issue is:open created:2025-01-01..2026-10-19` | 0
- [185] issues reactions-+1 | `repo:gemini-testing/testplane screenshot is:issue is:closed closed:2025-01-01..2026-10-19` | 0
- [186] issues reactions-+1 | `repo:gemini-testing/testplane assertView is:issue is:open updated:2025-01-01..2026-10-19` | 1
- [187] issues reactions-+1 | `repo:gemini-testing/testplane assertView is:issue is:open created:2025-01-01..2026-10-19` | 0
- [188] issues reactions-+1 | `repo:gemini-testing/testplane assertView is:issue is:closed closed:2025-01-01..2026-10-19` | 0
- [189] issues reactions-+1 | `repo:gemini-testing/testplane visual is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [190] issues reactions-+1 | `repo:gemini-testing/testplane visual is:issue is:open created:2025-01-01..2026-10-19` | 0
- [191] issues reactions-+1 | `repo:gemini-testing/testplane visual is:issue is:closed closed:2025-01-01..2026-10-19` | 0
- [192] issues reactions-+1 | `repo:garris/BackstopJS is:issue is:open updated:2025-01-01..2026-10-19` | 33
- [193] issues reactions-+1 | `repo:garris/BackstopJS is:issue is:open created:2025-01-01..2026-10-19` | 18
- [194] issues reactions-+1 | `repo:garris/BackstopJS is:issue is:closed closed:2025-01-01..2026-10-19` | 8
- [195] issues reactions-+1 | `repo:argos-ci/argos is:issue is:open updated:2025-01-01..2026-10-19` | 0
- [196] issues reactions-+1 | `repo:argos-ci/argos is:issue is:open created:2025-01-01..2026-10-19` | 0
- [197] issues reactions-+1 | `repo:argos-ci/argos is:issue is:closed closed:2025-01-01..2026-10-19` | 58
- [198] issues reactions-+1 | `repo:reg-viz/reg-suit is:issue is:open updated:2025-01-01..2026-10-19` | 3
- [199] issues reactions-+1 | `repo:reg-viz/reg-suit is:issue is:open created:2025-01-01..2026-10-19` | 2
- [200] issues reactions-+1 | `repo:reg-viz/reg-suit is:issue is:closed closed:2025-01-01..2026-10-19` | 1
- [201] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot is:issue is:open updated:2025-01-01..2026-10-19` | 7
- [202] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot is:issue is:open created:2025-01-01..2026-10-19` | 3
- [203] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot is:issue is:closed closed:2025-01-01..2026-10-19` | 7
- [204] issues reactions-+1 | `repo:webdriverio/visual-testing is:issue is:open updated:2025-01-01..2026-10-19` | 5
- [205] issues reactions-+1 | `repo:webdriverio/visual-testing is:issue is:open created:2025-01-01..2026-10-19` | 3
- [206] issues reactions-+1 | `repo:webdriverio/visual-testing is:issue is:closed closed:2025-01-01..2026-10-19` | 60
- [207] issues reactions-+1 | `repo:microsoft/playwright MCP screenshot is:issue updated:2025-01-01..2026-10-19` | 43
- [208] issues reactions-+1 | `repo:microsoft/playwright MCP snapshot is:issue updated:2025-01-01..2026-10-19` | 68
- [209] issues reactions-+1 | `repo:microsoft/playwright MCP visual is:issue updated:2025-01-01..2026-10-19` | 8
- [210] issues reactions-+1 | `repo:microsoft/playwright agent screenshot is:issue updated:2025-01-01..2026-10-19` | 64
- [211] issues reactions-+1 | `repo:microsoft/playwright agent baseline is:issue updated:2025-01-01..2026-10-19` | 10
- [212] issues reactions-+1 | `repo:microsoft/playwright "AI agent" is:issue updated:2025-01-01..2026-10-19` | 136
- [213] issues reactions-+1 | `repo:microsoft/playwright LLM is:issue updated:2025-01-01..2026-10-19` | 46
- [214] issues reactions-+1 | `repo:vitest-dev/vitest MCP screenshot is:issue updated:2025-01-01..2026-10-19` | 0
- [215] issues reactions-+1 | `repo:vitest-dev/vitest MCP snapshot is:issue updated:2025-01-01..2026-10-19` | 0
- [216] issues reactions-+1 | `repo:vitest-dev/vitest MCP visual is:issue updated:2025-01-01..2026-10-19` | 0
- [217] issues reactions-+1 | `repo:vitest-dev/vitest agent screenshot is:issue updated:2025-01-01..2026-10-19` | 7
- [218] issues reactions-+1 | `repo:vitest-dev/vitest agent baseline is:issue updated:2025-01-01..2026-10-19` | 0
- [219] issues reactions-+1 | `repo:vitest-dev/vitest "AI agent" is:issue updated:2025-01-01..2026-10-19` | 11
- [220] issues reactions-+1 | `repo:vitest-dev/vitest LLM is:issue updated:2025-01-01..2026-10-19` | 10
- [221] issues reactions-+1 | `repo:storybookjs/storybook MCP screenshot is:issue updated:2025-01-01..2026-10-19` | 6
- [222] issues reactions-+1 | `repo:storybookjs/storybook MCP snapshot is:issue updated:2025-01-01..2026-10-19` | 16
- [223] issues reactions-+1 | `repo:storybookjs/storybook MCP visual is:issue updated:2025-01-01..2026-10-19` | 9
- [224] issues reactions-+1 | `repo:storybookjs/storybook agent screenshot is:issue updated:2025-01-01..2026-10-19` | 18
- [225] issues reactions-+1 | `repo:storybookjs/storybook agent baseline is:issue updated:2025-01-01..2026-10-19` | 16
- [226] issues reactions-+1 | `repo:storybookjs/storybook "AI agent" is:issue updated:2025-01-01..2026-10-19` | 60
- [227] issues reactions-+1 | `repo:storybookjs/storybook LLM is:issue updated:2025-01-01..2026-10-19` | 10
- [228] issues reactions-+1 | `repo:cypress-io/cypress MCP screenshot is:issue updated:2025-01-01..2026-10-19` | 1
- [229] issues reactions-+1 | `repo:cypress-io/cypress MCP snapshot is:issue updated:2025-01-01..2026-10-19` | 1
- [230] issues reactions-+1 | `repo:cypress-io/cypress MCP visual is:issue updated:2025-01-01..2026-10-19` | 0
- [231] issues reactions-+1 | `repo:cypress-io/cypress agent screenshot is:issue updated:2025-01-01..2026-10-19` | 26
- [232] issues reactions-+1 | `repo:cypress-io/cypress agent baseline is:issue updated:2025-01-01..2026-10-19` | 3
- [233] issues reactions-+1 | `repo:cypress-io/cypress "AI agent" is:issue updated:2025-01-01..2026-10-19` | 4
- [234] issues reactions-+1 | `repo:cypress-io/cypress LLM is:issue updated:2025-01-01..2026-10-19` | 5
- [235] issues reactions-+1 | `repo:gemini-testing/testplane MCP is:issue updated:2025-01-01..2026-10-19` | 1
- [236] issues reactions-+1 | `repo:gemini-testing/testplane agent is:issue updated:2025-01-01..2026-10-19` | 1
- [237] issues reactions-+1 | `repo:gemini-testing/testplane AI is:issue updated:2025-01-01..2026-10-19` | 1
- [238] issues reactions-+1 | `repo:gemini-testing/testplane LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [239] issues reactions-+1 | `repo:garris/BackstopJS MCP is:issue updated:2025-01-01..2026-10-19` | 0
- [240] issues reactions-+1 | `repo:garris/BackstopJS agent is:issue updated:2025-01-01..2026-10-19` | 2
- [241] issues reactions-+1 | `repo:garris/BackstopJS AI is:issue updated:2025-01-01..2026-10-19` | 1
- [242] issues reactions-+1 | `repo:garris/BackstopJS LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [243] issues reactions-+1 | `repo:argos-ci/argos MCP is:issue updated:2025-01-01..2026-10-19` | 1
- [244] issues reactions-+1 | `repo:argos-ci/argos agent is:issue updated:2025-01-01..2026-10-19` | 1
- [245] issues reactions-+1 | `repo:argos-ci/argos AI is:issue updated:2025-01-01..2026-10-19` | 2
- [246] issues reactions-+1 | `repo:argos-ci/argos LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [247] issues reactions-+1 | `repo:reg-viz/reg-suit MCP is:issue updated:2025-01-01..2026-10-19` | 0
- [248] issues reactions-+1 | `repo:reg-viz/reg-suit agent is:issue updated:2025-01-01..2026-10-19` | 0
- [249] issues reactions-+1 | `repo:reg-viz/reg-suit AI is:issue updated:2025-01-01..2026-10-19` | 0
- [250] issues reactions-+1 | `repo:reg-viz/reg-suit LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [251] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot MCP is:issue updated:2025-01-01..2026-10-19` | 0
- [252] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot agent is:issue updated:2025-01-01..2026-10-19` | 0
- [253] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot AI is:issue updated:2025-01-01..2026-10-19` | 0
- [254] issues reactions-+1 | `repo:americanexpress/jest-image-snapshot LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [255] issues reactions-+1 | `repo:webdriverio/visual-testing MCP is:issue updated:2025-01-01..2026-10-19` | 0
- [256] issues reactions-+1 | `repo:webdriverio/visual-testing agent is:issue updated:2025-01-01..2026-10-19` | 0
- [257] issues reactions-+1 | `repo:webdriverio/visual-testing AI is:issue updated:2025-01-01..2026-10-19` | 0
- [258] issues reactions-+1 | `repo:webdriverio/visual-testing LLM is:issue updated:2025-01-01..2026-10-19` | 0
- [1000] issues reactions-+1 | `repo:microsoft/playwright label:feature-visual-regression-testing is:issue is:open` | 4
- [1001] issues reactions-+1 | `repo:microsoft/playwright label:feature-visual-regression-testing is:issue is:closed closed:2025-01-01..2026-10-19` | 53
- [1002] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: visual test" is:issue is:open` | 1
- [1003] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: visual test" is:issue is:closed closed:2025-01-01..2026-10-19` | 5
- [1004] issues reactions-+1 | `repo:storybookjs/storybook label:test-runner is:issue is:open` | 17
- [1005] issues reactions-+1 | `repo:storybookjs/storybook label:test-runner is:issue is:closed closed:2025-01-01..2026-10-19` | 9
- [1006] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: vitest" is:issue is:open` | 69
- [1007] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: vitest" is:issue is:closed closed:2025-01-01..2026-10-19` | 163
- [1008] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: storyshots" is:issue is:open` | 1
- [1009] issues reactions-+1 | `repo:storybookjs/storybook label:"addon: storyshots" is:issue is:closed closed:2025-01-01..2026-10-19` | 1
- [1010] issues reactions-+1 | `repo:cypress-io/cypress label:"topic: screenshots 📸" is:issue is:open` | 15
- [1011] issues reactions-+1 | `repo:cypress-io/cypress label:"topic: screenshots 📸" is:issue is:closed closed:2025-01-01..2026-10-19` | 4
- [1012] issues reactions-+1 | `repo:storybookjs/test-runner is:issue is:open` | 119
- [1013] issues reactions-+1 | `repo:storybookjs/test-runner is:issue is:closed closed:2025-01-01..2026-10-19` | 5
- [1014] issues reactions-+1 | `repo:storybookjs/test-runner is:issue created:2025-01-01..2026-10-19` | 28
- [1015] issues reactions-+1 | `repo:lost-pixel/lost-pixel is:issue is:open` | 43
- [1016] issues reactions-+1 | `repo:lost-pixel/lost-pixel is:issue is:closed closed:2025-01-01..2026-10-19` | 1
- [1017] issues reactions-+1 | `repo:lost-pixel/lost-pixel is:issue created:2025-01-01..2026-10-19` | 11
- [1018] issues reactions-+1 | `repo:storybookjs/test-runner snapshot is:issue` | 37
- [1019] issues reactions-+1 | `repo:storybookjs/test-runner screenshot is:issue` | 77
- [1020] issues reactions-+1 | `repo:microsoft/playwright-mcp "visual regression" is:issue updated:2025-01-01..2026-10-19` | 1
- [1021] issues reactions-+1 | `repo:microsoft/playwright-mcp baseline is:issue updated:2025-01-01..2026-10-19` | 2
- [1022] issues reactions-+1 | `repo:microsoft/playwright-mcp toHaveScreenshot is:issue updated:2025-01-01..2026-10-19` | 0
- [1023] issues reactions-+1 | `repo:microsoft/playwright-mcp screenshot compare is:issue updated:2025-01-01..2026-10-19` | 5
- [1024] issues reactions-+1 | `repo:microsoft/playwright-mcp visual diff is:issue updated:2025-01-01..2026-10-19` | 1
- [1025] issues reactions-+1 | `repo:storybookjs/mcp visual is:issue` | 3
- [1026] issues reactions-+1 | `repo:storybookjs/mcp screenshot is:issue` | 9
- [1027] issues reactions-+1 | `repo:storybookjs/mcp baseline is:issue` | 0
- [1028] issues reactions-+1 | `repo:microsoft/playwright healer is:issue updated:2025-01-01..2026-10-19` | 26
- [1029] issues reactions-+1 | `repo:microsoft/playwright "test agents" is:issue updated:2025-01-01..2026-10-19` | 50
- [1030] issues reactions-+1 | `repo:microsoft/playwright playwright-cli screenshot is:issue updated:2025-01-01..2026-10-19` | 61
- [1031] repositories stars | `lost-pixel fork:true pushed:>2026-04-22` | 33
- [1032] repositories stars | `lost-pixel in:name,description,readme pushed:>2026-04-22` | 36955
- [1033] repositories stars | `lost-pixel in:readme stars:>5` | 3866
- [1034] repositories stars | `storybook test-runner in:name,description pushed:>2026-09-30` | 1
- [1035] repositories stars | `test-runner storybook fork:true pushed:>2026-09-30` | 1
- [1036] repositories stars | `"visual regression" in:name,description,topics pushed:>2026-04-22 stars:>50` | 19
- [2000] issues reactions-+1 | `repo:microsoft/playwright shard snapshot is:issue updated:2025-01-01..2026-10-19` | 11
- [2001] issues reactions-+1 | `repo:microsoft/playwright merge-reports screenshot is:issue updated:2025-01-01..2026-10-19` | 15
- [2002] issues reactions-+1 | `repo:microsoft/playwright lfs snapshot is:issue` | 9
- [2003] issues reactions-+1 | `repo:microsoft/playwright monorepo snapshot is:issue updated:2025-01-01..2026-10-19` | 7
- [2004] issues reactions-+1 | `repo:microsoft/playwright colorScheme screenshot is:issue updated:2025-01-01..2026-10-19` | 9
- [2005] issues reactions-+1 | `repo:microsoft/playwright "dark mode" screenshot is:issue updated:2025-01-01..2026-10-19` | 6
- [2006] issues reactions-+1 | `repo:microsoft/playwright toHaveScreenshot is:issue sort:reactions-+1-desc` | 307
- [2007] issues reactions-+1 | `repo:vitest-dev/vitest shard screenshot is:issue updated:2025-01-01..2026-10-19` | 3
- [2008] issues reactions-+1 | `repo:vitest-dev/vitest toMatchScreenshot is:issue` | 24
- [2009] issues reactions-+1 | `repo:microsoft/playwright repo:argos-ci/argos repo:garris/BackstopJS repo:reg-viz/reg-suit repo:storybookjs/storybook "merge queue" is:issue` | 2
- [2010] issues reactions-+1 | `repo:microsoft/playwright repo:vitest-dev/vitest repo:storybookjs/storybook repo:cypress-io/cypress "git lfs" is:issue` | 12

### B. GitHub GraphQL (`gh api graphql -f query=...`)
- Repo metadata: `repository(owner,name){nameWithOwner stargazerCount forkCount isArchived archivedAt pushedAt updatedAt hasDiscussionsEnabled hasIssuesEnabled description homepageUrl licenseInfo{spdxId} issues(states:OPEN){totalCount} discussions{totalCount}}` for microsoft/playwright, vitest-dev/vitest, storybookjs/storybook, garris/BackstopJS, argos-ci/argos, reg-viz/reg-suit, americanexpress/jest-image-snapshot, webdriverio/visual-testing, gemini-testing/testplane, cypress-io/cypress, lost-pixel/lost-pixel, storybookjs/test-runner
- Discussion listing (paginated, stop when updatedAt < 2025-01-01): `repository(owner,name){discussions(first:100, after:$cursor, orderBy:{field:UPDATED_AT, direction:DESC}){pageInfo{hasNextPage endCursor} nodes{number title url createdAt updatedAt closed closedAt isAnswered answerChosenAt upvoteCount category{name} author{login} authorAssociation comments{totalCount} thumbs: reactions(content: THUMBS_UP){totalCount} reactions{totalCount} labels(first:10){nodes{name}} bodyText}}}` for vitest-dev/vitest (5 pages), storybookjs/storybook (8), cypress-io/cypress (6), argos-ci/argos (1), americanexpress/jest-image-snapshot (1), gemini-testing/testplane (1), lost-pixel/lost-pixel (1)
- Discussion detail: `repository(owner,name){discussion(number:$num){number title url createdAt upvoteCount closed isAnswered category{name} author{login} authorAssociation bodyText answer{author{login} authorAssociation createdAt bodyText} comments(first:60){totalCount nodes{author{login} authorAssociation createdAt bodyText upvoteCount replies(first:30){nodes{author{login} authorAssociation createdAt bodyText}}}}}}` for vitest-dev/vitest #7749 #690 #8892 #9878; storybookjs/storybook #31826 #32930 #35199 #27030 #32010 #34432 #35860; argos-ci/argos #2611 #1811; lost-pixel/lost-pixel #432 #456; cypress-io/cypress #27899
- Discussion answer check: `repository(owner,name){discussion(number:$num){title answer{author{login} authorAssociation createdAt bodyText upvoteCount} comments(first:10){nodes{author{login} authorAssociation createdAt bodyText upvoteCount}}}}` for storybookjs/storybook #32930 #31826

### C. GitHub REST (core) calls
- `gh auth status; gh api rate_limit (repeated)`
- `repos/lost-pixel/lost-pixel; repos/storybookjs/test-runner`
- `repos/lost-pixel/lost-pixel/forks?sort=stargazers&per_page=100 (--paginate); repos/storybookjs/test-runner/forks?sort=stargazers&per_page=100 (--paginate)`
- `repos/lost-pixel/lost-pixel/readme; repos/storybookjs/test-runner/readme; orgs/lost-pixel/repos?per_page=100`
- `repos/{fork}/commits?sha={branch}&since={archive ts}&per_page=30, repos/{upstream}/compare/{base}...{owner}:{branch}, repos/{fork}/branches?per_page=100 for erickirt/lost-pixel, ckorhonen/lost-pixel, DSeeHappy/lost-pixel (branch molecule/owned), jason-gose/lost-pixel (since 2026-04-22T18:24:14Z, base main) and Morin3/test-runner (since 2026-09-30T13:07:26Z, base next)`
- `repos/lost-pixel/lost-pixel/commits?per_page=3; repos/storybookjs/test-runner/commits?per_page=3`
- `repos/{repo}/labels?per_page=100 (--paginate) for the 10 target repos`
- `repos/microsoft/playwright-mcp; orgs/argos-ci/repos?per_page=100; orgs/storybookjs/repos?per_page=100; repos/argos-ci/argos`
- `repos/repobuddy/visual-testing; repos/repobuddy/visual-testing/commits?per_page=3`
- `repos/storybookjs/storybook/issues/34250`
- `repos/microsoft/playwright/pulls/{42662,40720,43333,43334,43423}`
- `repos/microsoft/playwright/issues/{42652,32889,38673,8161}/timeline?per_page=100`
- `repos/garris/BackstopJS/pulls/1627; repos/garris/BackstopJS/commits?per_page=5; repos/garris/BackstopJS/readme`
- `repos/{reg-viz/storycap-testrun, DSeeHappy/lost-pixel, tak2-08/universal-visual-kit, mukiwu/muki-ai-plugins, pixsame/pixsame, reg-viz/storycap}`
- `repos/storybookjs/storybook/contents/docs/writing-tests/integrations/vitest-addon?ref=next; repos/storybookjs/storybook/contents/docs/writing-tests/integrations/vitest-addon/migration-guide.mdx?ref=next; repos/storybookjs/storybook/contents/MIGRATION.md?ref=next (raw)`
- `repos/americanexpress/jest-image-snapshot/issues/{n}` + `repos/americanexpress/jest-image-snapshot/issues/{n}/comments?per_page=100` (--paginate) for n in 331,375
- `repos/argos-ci/argos/issues/{n}` + `repos/argos-ci/argos/issues/{n}/comments?per_page=100` (--paginate) for n in 1152,1384,1582,2078
- `repos/cypress-io/cypress/issues/{n}` + `repos/cypress-io/cypress/issues/{n}/comments?per_page=100` (--paginate) for n in 9443,24052,25516,28674,29144,31086
- `repos/garris/BackstopJS/issues/{n}` + `repos/garris/BackstopJS/issues/{n}/comments?per_page=100` (--paginate) for n in 1303,1587,1603,1607,1613,1625
- `repos/lost-pixel/lost-pixel/issues/{n}` + `repos/lost-pixel/lost-pixel/issues/{n}/comments?per_page=100` (--paginate) for n in 406,449,457
- `repos/microsoft/playwright/issues/{n}` + `repos/microsoft/playwright/issues/{n}/comments?per_page=100` (--paginate) for n in 4295,8161,9006,12683,12816,13873,14883,15275,16582,16928,16970,17294,18373,18827,18937,19861,20068,20097,20552,20954,20987,21620,22064,22984,23191,23197,23502,24310,24312,28394,28578,29227,29250,29315,29878,29968,30199,31503,31542,32889,33098,33236,33953,34197,34376,34438,34775,34956,35150,35153,35357,36440,37019,38200,38673,38933,40819,41417,41504,41532,42362,42393,42511,42652,43045
- `repos/reg-viz/reg-suit/issues/{n}` + `repos/reg-viz/reg-suit/issues/{n}/comments?per_page=100` (--paginate) for n in 730
- `repos/storybookjs/storybook/issues/{n}` + `repos/storybookjs/storybook/issues/{n}/comments?per_page=100` (--paginate) for n in 26533,31164,34250,35384,35450,35816
- `repos/storybookjs/test-runner/issues/{n}` + `repos/storybookjs/test-runner/issues/{n}/comments?per_page=100` (--paginate) for n in 434,502,516
- `repos/vitest-dev/vitest/issues/{n}` + `repos/vitest-dev/vitest/issues/{n}/comments?per_page=100` (--paginate) for n in 2229,6265,7818,7892,8265,8399,8411,9124,9341,9363,9431,10211,11178
- `repos/webdriverio/visual-testing/issues/{n}` + `repos/webdriverio/visual-testing/issues/{n}/comments?per_page=100` (--paginate) for n in 690,1311
