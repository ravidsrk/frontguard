# Follow-up on outstanding PR comments — 2026-10-20

This change addresses all 16 current unresolved findings from the latest-30-PR audit: 15 on #276 and one on #278. It also completes the concurrency fix from a previously resolved #278 thread. The two old #274 image findings are obsolete after the documentation rebuild. All changes are reviewed together in one PR.

## Dispositions

| Original comment | Resolution |
| --- | --- |
| [#278: Pending alerts can disappear](https://github.com/ravidsrk/frontguard/pull/278#discussion_r4312083023) | Give ignored events unique concurrency groups and skip their jobs, preserving the production alert queue. |
| [#278: PR builds repeat failure alerts](https://github.com/ravidsrk/frontguard/pull/278#discussion_r4312193516) | Guard the original push event before tip reconciliation; fork PR completions cannot write alerts. |
| [#276: Performance recipe cannot load](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228651) | Use createPerfBudgetPlugin, supported budget keys and KB units in both READMEs and both article stores. |
| [#276: Accessibility options are ignored](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228655) | Use impact and failOnViolation; document rules/excludeRules, warn on unknown JavaScript keys and test the actual README recipes. |
| [#276: Custom plugin examples throw](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228656) | Use typed storage-state plugins with beforeRender({ routes, config }); correct every lifecycle signature. afterRun({ summary }) is valid and is explicitly documented as such. |
| [#276: Fix settings have no effect](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228658) | Move generateFixes and verifyFixes to the config top level and use fixSandbox. |
| [#276: MCP setup creates no report](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228665) | Create the report directory and redirect JSON stdout into the MCP report file; explain exit 2 before consuming the file. |
| [#276: MCP arguments do not match](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228667) | Match required/optional MCP inputs to their schemas. Distinguish PNG baselines from local/cloud approval metadata; use returned diffId as the diff_id input. |
| [#276: Story filter is ignored](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228673) | Use storybook.stories and remove the unsupported waitForPlayFunction option. |
| [#276: Playwright reference lists missing fields](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228674) | Document maxAttempts, configured threshold, direct image paths, boolean settled and AI severity. |
| [#276: Viewport example passes extra arguments](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228677) | Pass one comma-separated viewport argument. |
| [#276: Monitor interval uses wrong units](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228689) | Document minutes, single-run behavior and the one-minute watch fallback. |
| [#276: Slack alerts do not arrive](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228695) | Provide a localhost adapter that translates the monitor payload into Slack text; test its message and upstream error handling without contacting Slack. |
| [#276: Reference gives wrong defaults](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228697) | Document SSIM cutoff 0.98, outputDir ./frontguard-report and JSON stdout. |
| [#276: Flag placeholders disappear](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228700) | Escape visible flag placeholders in the HTML tables. |
| [#276: Copy reports success on failure](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228703) | Await clipboard confirmation for page and snippet copies, show failures, ignore superseded requests and clean up timers. |
| [#276: Report viewing instructions are wrong](https://github.com/ravidsrk/frontguard/pull/276#discussion_r4302228705) | Use a real static-file server command and preserve the report images/ directory. |
| [#274: Standalone diagrams do not load](https://github.com/ravidsrk/frontguard/pull/274#discussion_r4302038072) | Obsolete: commit 99aa9d9 removed the referenced image paths from both documentation stores. No asset workaround is needed. |
| [#274: Loading diagrams move the text](https://github.com/ravidsrk/frontguard/pull/274#discussion_r4302038075) | Obsolete: the later site rebuild removed the affected image figures; no image-dimension patch applies to current routes. |

## Validation

- Build, workspace lint/typecheck, version synchronization and documentation links pass.
- Workspace suites pass 2,121 tests with no skips, including three new CI-alert cases, six clipboard cases, the copied-example/schema/Slack contract checks, unknown-option warnings and two real-README plugin-manager tests.
- The CI and clipboard regression cases failed before their fixes and pass afterward.
- A real-browser fixture in a scratch git repository passes an unchanged-pixel comparison with exit 0. With the documented accessibility options enabled, the same page exits 2. A direct axe audit identifies one serious color-contrast violation. The successful JSON comparison report parses after redirection; the error run emits no JSON. See [captured evidence](accessibility-recipe-2026-10-20.json).
- A local production Worker serves all 13 modified docs routes with HTTP 200 and no browser page errors. Real Chromium clipboard writes succeed for both article text and code snippets; the output-flag placeholder remains visible.
- The web and standalone documentation stores are identical.

The live fixture ran on Linux ARM64 with Chromium 156.0.8078.4 and axe-core/playwright 4.13.0. Slack adapter verification uses a stub upstream; no real Slack message or paid sandbox was sent. These checks do not change pixel thresholds, baseline approval policy or the cloud deployment gates.

## Audit correction

The original review and audit overstated the afterRun problem: RunResult contains summary, so destructuring afterRun({ summary }) is supported. The invalid part was the Page argument in beforeRender. The examples now use the typed public plugin interface to make that distinction explicit.

Issue #302 is covered by the corrected recipes, unknown-option warning and failing serious-violation evidence. Its associated #288 tracker must use the actual impact/failOnViolation option names; the future baseline accessibility gate itself remains separate work.
