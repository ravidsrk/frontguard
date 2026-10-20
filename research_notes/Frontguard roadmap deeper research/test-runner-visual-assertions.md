# Test runners with built-in screenshot / visual assertions (state as of 2026-10-19)

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

Conventions used in these notes:
- Fetch date: every source below was fetched on 2026-10-19. "npm registry" means `npm view <pkg> ...` output on that date. GitHub files were read through `gh api repos/{owner}/{repo}/contents/{path}` on the default branch unless a ref is named, and are cited with their github.com URL.
- Time window: anything dated before 2025-01-01 is labelled "background" with its date.
- Version snapshot (npm `latest`, 2026-10-19): vitest 5.0.5, @vitest/browser 5.0.5, @playwright/test 1.64.1, @storybook/addon-vitest 10.6.2 (storybook `next` = 11.0.0-alpha.6), @storybook/test-runner 0.26.0, @wdio/visual-service 11.0.0, @wdio/image-comparison-core 3.0.0, @wdio/visual-reporter 0.5.0, testplane 9.3.3, html-reporter 11.17.2, looks-same 10.0.1, jest-image-snapshot 6.5.2, cypress-visual-regression 6.0.1, lost-pixel 3.22.0, histoire 1.0.0-beta.1, @ladle/react 5.1.1 — [npm registry](https://www.npmjs.com/) (fetched 2026-10-19).
- Vitest is now on major version 5. The brief asked about "Vitest 4", so the notes cover 4.0 through 5.0.5.

## Q1. Vitest browser mode `toMatchScreenshot` (4.0 to 5.0.5)

### Takeaway
`toMatchScreenshot` shipped in Vitest 4.0.0 (2025-10-22) and is still marked experimental in 5.0.5. The only built-in comparator is named `"pixelmatch"`, but since 4.1.0 (2026-03-12) it runs on `@blazediff/core`, not pixelmatch. By default no mismatched pixels are allowed (per-pixel YIQ `threshold` 0.1). Baselines go to `__screenshots__/<testFile>/<name>-<browser>-<platform>.png` and are committed to the repo. Updates use `-u`. Capture retries until two consecutive screenshots match (5 s timeout). The UI mode has a diff viewer but no documented approve action.

### Cited Findings
- **Release and version.** The Vitest 4.0 announcement, dated 2025-10-22, says "Vitest 4 adds support for Visual Regression testing in Browser Mode… We will continue to iterate on this feature", using the `toMatchScreenshot` assertion — [Vitest 4 blog](https://github.com/vitest-dev/vitest/blob/main/docs/blog/vitest-4.md) (fetched 2026-10-19). npm shows vitest 4.0.0 published 2025-10-22, 4.1.0 on 2026-03-12, 5.0.0 on 2026-09-03 and 5.0.5 on 2026-10-15 — [npm registry](https://www.npmjs.com/package/vitest) (fetched 2026-10-19).
- **Experimental status.** The API page still marks the assertion "toMatchScreenshot <Experimental />" — [Vitest assertions API](https://github.com/vitest-dev/vitest/blob/main/docs/api/browser/assertions.md) (fetched 2026-10-19).
- **Comparator dependency history.**
  - @vitest/browser 3.2.0 had no image-diff dependency.
  - 4.0.0 and 4.0.10 depend on `pixelmatch` 7.1.0 and `pngjs` ^7.
  - 4.1.0 depends on `@blazediff/core` 1.9.1.
  - 5.0.0 and 5.0.5 depend on `@blazediff/core` 1.10.0.
  - Source: [npm registry, @vitest/browser](https://www.npmjs.com/package/@vitest/browser) (fetched 2026-10-19).
- **The switch was deliberate.** PR #9514, "feat(browser): use BlazeDiff instead of pixelmatch", was opened 2026-01-23 and merged 2026-02-19 — [vitest PR #9514](https://github.com/vitest-dev/vitest/pull/9514) (GitHub search API, fetched 2026-10-19).
- **About BlazeDiff (vendor claim).** `@blazediff/core` describes itself as "Blazing-fast pixel-by-pixel image comparison with block-based optimization. 1.5x times faster than pixelmatch". It is MIT licensed, homepage blazediff.dev, first published 2025-08-29 — [npm registry, @blazediff/core](https://www.npmjs.com/package/@blazediff/core) (fetched 2026-10-19).
- **Comparator options and defaults (API docs).**
  - `comparatorName: "pixelmatch"` is "the only built-in comparator". The docs say the comparator "uses `@blazediff/core` under the hood".
  - `allowedMismatchedPixelRatio`: default undefined, range 0–1.
  - `allowedMismatchedPixels`: default undefined. "If set to `undefined`, any non-zero difference will cause the test to fail."
  - `threshold`: default 0.1. It is the per-pixel perceived colour difference from 0 (strict) to 1 (lenient), computed "using the YIQ color space".
  - `includeAA`: default false.
  - Diff-image styling: `alpha` 0.1, `aaColor` [255,255,0], `diffColor` [255,0,0], `diffColorAlt` undefined, `diffMask` false.
  - `timeout`: 5000 ms.
  - Source: [Vitest assertions API](https://github.com/vitest-dev/vitest/blob/main/docs/api/browser/assertions.md) (fetched 2026-10-19).
- **Pass/fail logic (source).** `comparators/pixelmatch.ts` imports `diff` from `@blazediff/core`.
  - A dimension mismatch fails immediately with no diff image, with the message "Expected image dimensions to be W×H px, but received …".
  - The allowed count is `min(allowedMismatchedPixels, allowedMismatchedPixelRatio × area)`. If neither is set, the allowed count is 0.
  - It passes when the mismatched count is ≤ the allowed count. The failure message is "N pixels (ratio R) differ.", with the ratio rounded up to 2 decimals.
  - Source: [pixelmatch.ts](https://github.com/vitest-dev/vitest/blob/main/packages/browser/src/node/commands/screenshotMatcher/comparators/pixelmatch.ts) (fetched 2026-10-19).
- **No default pixel budget.** The guide says "Vitest does not define a default tolerance for mismatched pixels" and recommends `allowedMismatchedPixelRatio`. When both limits are set, "Vitest uses whichever limit is stricter".
- **Docs contradict each other.** The guide still says "Vitest ships with `pixelmatch` as its built-in comparator", and its example config uses `threshold: 0.2` with `allowedMismatchedPixelRatio: 0.01` ("1% of pixels can differ"). The API docs and source say the default is 0.1 and the engine is BlazeDiff. Source for the guide: [Vitest VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md) (fetched 2026-10-19).
- **Custom comparators.** You register them under `browser.expect.toMatchScreenshot.comparators` and type them through the `ScreenshotComparatorRegistry` interface.
  - Signature: `(reference, actual, { createDiff, ...options }) => { pass, diff, message }`.
  - The docs suggest `@blazediff/ssim` (SSIM, MS-SSIM, Hitchhiker's SSIM) and `@blazediff/gmsd`.
  - They explain why perceptual comparators are not bundled: there is "no clear single 'best one'", and they bring heavier dependencies.
  - Sources: [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md); [browser.expect config](https://github.com/vitest-dev/vitest/blob/main/docs/config/browser/expect.md) (fetched 2026-10-19).
- **Baseline layout and naming.**
  - The default `resolveScreenshotPath` is `path.resolve(root, testFileDirectory, screenshotDirectory, testFileName, `${arg}-${browserName}-${platform}${ext}`)`, with `screenshotDirectory` defaulting to `__screenshots__`.
  - `platform` is `process.platform`.
  - `arg` comes from the call argument or is auto-generated from the test name (for example `calls-onclick-1`).
  - Unsupported extensions fall back to `.png`.
  - The default `resolveDiffPath` is `path.resolve(root, attachmentsDir, testFileDirectory, testFileName, …)`.
  - A `project` field was added to the resolver input (experimental, 4.1.6).
  - Source: [browser.expect config](https://github.com/vitest-dev/vitest/blob/main/docs/config/browser/expect.md) (fetched 2026-10-19).
- **Example layout from the guide.**
  - `__screenshots__/test-file.vrt.test.ts/test-name-chromium-darwin.png`, `…-firefox-linux.png` and `…-webkit-win32.png`. Browser names depend on the provider (chrome, chromium, firefox, webkit).
  - Failure output points at `tests/.vitest/attachments/<file>/<name>-chromium-darwin-actual.png` and `…-diff.png`.
  - The guide says to commit `__screenshots__` and to consider Git LFS for large suites.
  - Source: [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md) (fetched 2026-10-19).
- **Vitest 5 output location.** In Vitest 5, reporters (`html`, `json`, `junit`), `attachmentsDir`, failure screenshots and traces all default to a single `.vitest` directory at the project root — [Vitest 5 blog](https://github.com/vitest-dev/vitest/blob/main/docs/blog/vitest-5.md) (fetched 2026-10-19).
- **Update flow.**
  - The first run with no reference writes one and fails with "No existing reference screenshot found; a new one was created. Review it before running tests again."
  - Updates use `vitest --update` / `-u`, or `u` in watch mode.
  - Screenshots for deleted or renamed tests "aren't removed automatically".
  - The guide recommends a manually triggered (`workflow_dispatch`) GitHub Actions job that regenerates references in CI. It never runs on main and commits with the triggering user as co-author.
  - Sources: [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md); [assertions API](https://github.com/vitest-dev/vitest/blob/main/docs/api/browser/assertions.md) (fetched 2026-10-19).
- **Update logic (source).**
  - If no reference exists and `updateSnapshot === 'all'`, it writes the reference.
  - If `updateSnapshot === 'none'` (CI), the new image goes to the diffs/attachments location instead of the reference path, and the test fails.
  - If the first capture is byte-identical to the reference (`Buffer.compare`), it returns "matched-immediately" with no comparator run.
  - On a mismatch with `'all'`, it overwrites the reference.
  - Outcomes are `unstable-screenshot`, `missing-reference`, `update-reference`, `matched-immediately`, `matched-after-comparison` and `mismatch`.
  - Source: [screenshotMatcher/index.ts](https://github.com/vitest-dev/vitest/blob/main/packages/browser/src/node/commands/screenshotMatcher/index.ts) (fetched 2026-10-19).
- **Stability ("retry until stable").** "The assertion automatically retries taking screenshots until two consecutive captures yield the same result." `timeout` defaults to 5000 ms. With `0` there is no timeout, and "if a stable screenshot can't be determined the process will not end".
- **Playwright provider defaults.** With the Playwright provider, `animations: "disabled"` is the default in `screenshotOptions`. Masking goes through Playwright's `mask`.
- Sources for stability and provider defaults: [assertions API](https://github.com/vitest-dev/vitest/blob/main/docs/api/browser/assertions.md); [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md); `timeout: 5_000` in [utils.ts](https://github.com/vitest-dev/vitest/blob/main/packages/browser/src/node/commands/screenshotMatcher/utils.ts) (fetched 2026-10-19).
- **Review UI.** "While in UI mode, Vitest shows a tabbed diff view with an A/B slider", with "Diff", "Reference", "Actual" and "Slider" tabs. The guide documents no accept/approve action — [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md) (fetched 2026-10-19).
- **Teams and shared environments.** The guide warns that "references generated on one machine will often fail on another". It recommends self-hosted Docker runners, CI-generated references, or cloud services "like Azure App Testing or Chromatic". This is a first-party mention of vendors, not an endorsement test — [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md) (fetched 2026-10-19).
- **ARIA snapshots.** Vitest has experimental ARIA snapshots, badged version 4.1.4 — [Vitest ARIA snapshots guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/aria-snapshots.md). Vitest 5 prints the ARIA tree in locator errors (`browser.locators.errorFormat`) — [Vitest 5 blog](https://github.com/vitest-dev/vitest/blob/main/docs/blog/vitest-5.md) (fetched 2026-10-19).
- **Open issues (GitHub search API on 2026-10-19; titles only).**
  - [#11178](https://github.com/vitest-dev/vitest/issues/11178) (2026-09-08): toMatchScreenshot skips createDiff:true when the first capture is stable against the reference.
  - [#9341](https://github.com/vitest-dev/vitest/issues/9341) (2025-12-24): request for a beforeComparison hook.
  - [#11455](https://github.com/vitest-dev/vitest/issues/11455) (2026-10-02): failure screenshots hit ENAMETOOLONG on long test names.
  - [#10423](https://github.com/vitest-dev/vitest/issues/10423) (2026-05-21): toMatchScreenshot clips the UI with the Playwright provider.
  - [#9751](https://github.com/vitest-dev/vitest/issues/9751): unify timeout configuration.
- **Closed issues since mid-2025 (titles show the failure modes).**
  - [#10211](https://github.com/vitest-dev/vitest/issues/10211): a failing toMatchScreenshot writes a new auto-named file on every retry, "accumulating dozens of orphan PNGs".
  - [#10204](https://github.com/vitest-dev/vitest/issues/10204): the retry loop never stopped until timeout.
  - [#8959](https://github.com/vitest-dev/vitest/issues/8959): infinite loop of screenshot creation on failure.
  - [#11382](https://github.com/vitest-dev/vitest/issues/11382): redundant reference screenshots with the retry option.
  - [#10859](https://github.com/vitest-dev/vitest/issues/10859): failure screenshots mixed with VRT screenshots.
  - [#10039](https://github.com/vitest-dev/vitest/issues/10039): filenames ignore instance names.
  - [#9236](https://github.com/vitest-dev/vitest/issues/9236): two screenshots, one without browser info.
  - [#9158](https://github.com/vitest-dev/vitest/issues/9158): screenshots generated even when passing.
  - [#8604](https://github.com/vitest-dev/vitest/issues/8604): a folder is still created when a custom path is set.
  - Source: GitHub search API (fetched 2026-10-19).

### Inferences
- Vitest's built-in comparator keeps pixelmatch-7-style option names and YIQ semantics, but the engine is BlazeDiff, not pixelmatch. A CLI on pixelmatch 7.2 is closest to Vitest's defaults in option meaning. Byte-for-byte identical diff counts are not guaranteed (see Gaps).
- From the source logic, `-u` only rewrites references that fail comparison (or are missing). That makes it behave like Playwright's `--update-snapshots=changed`, not `all`.
- Vitest, like Playwright, assumes baselines are committed next to tests and keyed by browser and `process.platform`. Neither offers cross-run history or a hosted review step; Vitest points teams to cloud vendors for that.
- The bug history clusters around retry/stability loops and orphan file accumulation. That is a known weak spot for any "retry until stable" design.

### Gaps
- I did not verify whether `@blazediff/core` produces exactly the same mismatch counts as pixelmatch 7.x for identical options. The vendor speed claim is unverified.
- I did not check whether `toMatchScreenshot` existed in 4.0 betas before 2025-10-22.
- I found no documentation of an approve button in Vitest UI. Absence is from the guide only; I did not inspect the UI source.

## Q2. Storybook 9/10 (`@storybook/addon-vitest`), the test-runner archive, and Ladle/Histoire

### Takeaway
`@storybook/addon-vitest` does no pixel comparison of its own. Storybook's documented visual path is Chromatic's Visual Tests addon (`@chromatic-com/storybook`), a cloud service, which shows up in the addon-vitest testing widget. `@storybook/test-runner` is archived (2026-09-30), and the Storybook 11 migration notes say its official support ended. For non-Vite projects, or anyone avoiding Chromatic, the documented fallback is "plain Playwright… that generates tests from stories". Ladle documents Playwright `toHaveScreenshot` over its `meta.json`. Histoire's main branch documents a full built-in visual testing system (pixelmatch ^7.2, workbench approval, CLI exit codes 0/1/2/130), but it is marked "1.0-beta.2+" and is not on npm yet (npm latest is 1.0.0-beta.1).

### Cited Findings
- **Release dates.** @storybook/addon-vitest 9.0.0 was published 2025-05-28, 10.0.0 on 2025-10-28 and 10.6.2 on 2026-10-12. The `storybook` `next` dist-tag is 11.0.0-alpha.6 — [npm registry](https://www.npmjs.com/package/@storybook/addon-vitest) (fetched 2026-10-19).
- **Storybook's visual tests are Chromatic (first-party/vendor docs).**
  - The docs say "Storybook supports cross-browser visual testing natively using Chromatic, a cloud service made by the Storybook team."
  - You install `@chromatic-com/storybook` and sign in to a Chromatic account. Running tests "will send your stories to the cloud to take snapshots and detect visual changes".
  - Changes are accepted as baselines in the addon panel. CI runs Chromatic, and PRs get a "UI Tests" check. Configuration lives in `chromatic.config.json`.
  - Source: [Storybook "Visual tests" docs (next)](https://github.com/storybookjs/storybook/blob/next/docs/writing-tests/visual-testing.mdx) (fetched 2026-10-19).
- **How addon-vitest relates to visual tests.**
  - If the Visual tests addon is installed, "you'll see an option to run Visual tests alongside Component tests".
  - "Some test types, like visual tests, are run independently."
  - The comparison table marks Visual tests ✅ for the Vitest addon and ❌ for test-runner, and Snapshot tests ❌ for the Vitest addon and ✅ for test-runner.
  - Source: [Vitest addon docs (next)](https://github.com/storybookjs/storybook/blob/next/docs/writing-tests/integrations/vitest-addon/index.mdx) (fetched 2026-10-19).
- **No native Vitest screenshot path in Storybook.** A GitHub search for `toMatchScreenshot` in storybookjs/storybook returned only 2 unrelated issues, #33153 and #33215 — [GitHub search API](https://github.com/storybookjs/storybook/issues/33153) (fetched 2026-10-19). I found no Storybook doc on using Vitest's `toMatchScreenshot` inside stories.
- **test-runner archive.** The repo reports `archived=true`, last pushed 2026-09-30T12:38:17Z. Its README warns "Official support for Storybook Test Runner has ended" and points Vite-based projects to the Vitest integration — [storybookjs/test-runner](https://github.com/storybookjs/test-runner) (fetched 2026-10-19). npm shows @storybook/test-runner 0.26.0 published 2026-09-30 — [npm registry](https://www.npmjs.com/package/@storybook/test-runner) (fetched 2026-10-19).
- **Storybook 11 migration notes ("From version 10.x to 11.0.0", next branch).**
  - "Official support for `@storybook/test-runner` has ended. The package stays published and accepts Storybook 11 and later as a peer dependency… no longer receives fixes or compatibility updates and prints a warning on every run."
  - The Vitest addon needs a Vite-based framework, so Webpack users must switch framework first.
  - "Another option is to switch to plain Playwright with a minimal setup that generates tests from stories", linking a gist by AriPerkkio.
  - The Vitest addon now requires Vitest ≥ 4.0, and setup always installs `@vitest/browser-playwright`.
  - Source: [Storybook MIGRATION.md (next)](https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#test-runner-support-ended) (fetched 2026-10-19).
- **Ladle.**
  - The "Visual Snapshots" doc builds Playwright tests from Ladle's static `meta.json`: fetch `/meta.json`, visit `?story=<key>&mode=preview`, wait for `[data-storyloaded]`, then call `toHaveScreenshot(`${storyKey}.png`)`. There is no built-in comparator — [Ladle visual snapshots doc](https://github.com/tajo/ladle/blob/main/packages/website/docs/visual-snapshots.md) (fetched 2026-10-19).
  - @ladle/react 5.1.1 was last modified 2025-11-04, and the repo was last pushed 2026-06-28 — [npm registry](https://www.npmjs.com/package/@ladle/react); [tajo/ladle](https://github.com/tajo/ladle) (fetched 2026-10-19).
- **Histoire (main-branch docs, badge "1.0-beta.2+"): configuration and capture.**
  - You enable it with `visual: {}`, and it needs a Playwright Chromium install.
  - The default profile is `desktop-light`: 1024×640 CSS px, scale 1.
  - Options: `baselineDir: '.histoire-visual'`, `baselineRef: 'main'`, `profiles`, `threshold: 0.1`, `maxDiffPixelRatio: 0`, `includeAA: false`. The default "accepts zero differing pixels after anti-aliasing detection".
  - Dimension or capture-spec changes "require explicit baseline replacement".
  - Captures wait for fonts and "two equal consecutive images". Animations are disabled, motion is reduced, locale is en-US and timezone is UTC. Histoire "does not rewrite application clocks or responses".
- **Histoire workbench review.**
  - Side-by-side, diff, and opacity overlay views.
  - "Create baseline" / "Approve baseline" writes the exact captured image, and bulk approval is supported.
  - "Compare to main" reads approved images from a Git ref "without branch checkout".
  - "No automatic baseline pruning occurs."
- **Histoire CLI.**
  - `histoire visual` with `--baseline-ref`, `--incremental`, `--story/--variant/--case/--profile`. `--update` requires an explicit filter or `--all`.
  - Exit codes are 0 (pass or explicitly approved), 1 (comparison/capture failure), 2 (setup/config/ref/filter failure) and 130 (interrupt).
  - "Ordinary runs never change approved baselines. Update does not stage, commit, or push files."
- Source for the Histoire visual-testing bullets above: [Histoire visual testing guide (main)](https://github.com/histoire-dev/histoire/blob/main/docs/guide/visual-testing.md) (fetched 2026-10-19).
- **Histoire screenshots and MCP.** Histoire also documents canvas screenshots (PNG/WebP, 1×–3×) under `.histoire/screenshots/` and an MCP activity pane sharing the same capture lane (1.0-beta.2+) — [Histoire canvas screenshots and MCP guide](https://github.com/histoire-dev/histoire/blob/main/docs/guide/ui-screenshots-mcp.md) (fetched 2026-10-19).
- **Histoire comparator and storage.**
  - `packages/histoire/package.json` on main lists `pixelmatch` ^7.2.0 and `pngjs` ^7.0.0, while the version field is still 1.0.0-beta.1 — [histoire package.json (main)](https://github.com/histoire-dev/histoire/blob/main/packages/histoire/package.json) (fetched 2026-10-19).
  - The example baselines are content-addressed per platform and architecture, for example `examples/vue3/.histoire-visual/baselines/linux-x64/<sha256>/<sha256>.json` — [histoire repo tree](https://github.com/histoire-dev/histoire/tree/main/examples/vue3/.histoire-visual/baselines/linux-x64) (fetched 2026-10-19).
- **Histoire release status.** npm dist-tags are `latest` 1.0.0-beta.1 and `next` 1.0.0-alpha.1, last modified 2026-01-07. So the beta.2 visual features are unreleased on npm as of 2026-10-19 — [npm registry](https://www.npmjs.com/package/histoire) (fetched 2026-10-19). Histoire also ships `@histoire/plugin-percy`, and its docs include Lost Pixel and Percy examples — [histoire repo tree](https://github.com/histoire-dev/histoire/tree/main/docs/examples/visual-regression-testing) (fetched 2026-10-19).

### Inferences
- In 2026, Storybook users without Chromatic or a Vite framework have no first-party open-source visual runner. The Storybook team itself recommends "plain Playwright… tests from stories", which is exactly the niche an external Playwright-based capture CLI fills.
- For Storybook 9/10/11, the integration point is the built Storybook (story index plus iframe URLs), not the Storybook UI. Chromatic owns the in-Storybook visual testing UI.
- Histoire is about to become a direct local-first competitor for Vue/Svelte story visual testing. Its design is notably close to a git-baseline CLI: pixelmatch 7.2, zero-pixel default, Git-ref compare, explicit update filter, exit codes 0/1/2. That makes Histoire discovery less valuable for its own users once beta.2 ships.

### Gaps
- I did not verify whether Storybook 9/10/11 changed the `index.json` story index format or iframe URL scheme that external capture tools rely on.
- I found no official Storybook guidance on `toMatchScreenshot` inside the Vitest addon.
- I did not read the gist linked from MIGRATION.md.
- I did not confirm when Histoire 1.0-beta.2 will be published.

## Q3. Playwright 1.50 to 1.64 (2025-01 to 2026-10): visual-testing-relevant changes and gaps

### Takeaway
Playwright still compares with its own vendored pixelmatch: `threshold` 0.2 (YIQ), no pixel budget by default, and an experimental `ssim-cie94` comparator. The 2025–26 changes are mostly about workflow:
- update modes `changed|all|missing|none|default` (1.50; `missing` passes since 1.64);
- source-update methods for ARIA snapshots (1.50);
- `pathTemplate` per assertion (1.50) and a `{testFileBaseName}` token (1.60);
- lossless WebP goldens (1.62) and a config-level `type: 'webp'` (1.64);
- Chrome for Testing builds (1.57);
- a large ARIA-snapshot expansion;
- LLM agents (planner/generator/healer, 1.56) and a bundled MCP server plus `playwright-cli` (1.62).

None of the release notes I read add a baseline approval UI, cross-run history, or an agent that updates baselines. Baselines remain committed files with per-platform suffixes.

### Cited Findings
- **Release dates (@playwright/test).** 1.50.0 on 2025-01-23; 1.51.0 on 2025-03-06; 1.52.0 on 2025-04-17; 1.53.0 on 2025-06-10; 1.54.0 on 2025-07-10; 1.55.0 on 2025-08-20; 1.56.0 on 2025-10-06; 1.57.0 on 2025-11-25; 1.58.0 on 2026-01-23; 1.59.0 on 2026-04-01; 1.60.0 on 2026-05-11; 1.61.0 on 2026-06-15; 1.62.0 on 2026-07-24; 1.63.0 on 2026-09-04; 1.64.0 on 2026-10-07; 1.64.1 on 2026-10-14 — [npm registry](https://www.npmjs.com/package/@playwright/test) (fetched 2026-10-19).
- **1.50 (snapshot workflow).**
  - `toMatchAriaSnapshot` can store snapshots "in separate YAML files".
  - `updateSnapshots` gained `changed`, and `all` "now updates all snapshots, regardless of whether there are any differences" (breaking).
  - New `updateSourceMethod` with `overwrite`, `3way` and `patch`, e.g. `--update-snapshots=changed --update-source-method=3way`.
  - New `pathTemplate` for `toHaveScreenshot` and `toMatchAriaSnapshot` in `TestConfig.expect`.
  - Codegen got a button to pick elements for ARIA snapshots.
  - Source: [Playwright release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.51–1.55.**
  - 1.51: "Copy prompt" button on errors in the HTML report, trace viewer and UI mode (a pre-filled LLM prompt).
  - 1.52: ARIA snapshot `/children` (strict matching) and `/url`.
  - 1.53: `TestInfo.snapshotPath({ kind })` and an HTML reporter `title`.
  - 1.54: HTML reporter `noSnippets`.
  - Source: [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.56.**
  - Playwright Test Agents: planner (writes a Markdown plan), generator (turns the plan into tests) and healer ("executes the test suite and automatically repairs failing tests"), set up with `npx playwright init-agents --loop=vscode|claude|opencode`.
  - UI Mode gained an "option… mirroring the `--update-snapshots` options".
  - ARIA snapshots now compare `input` `placeholder`.
  - Source: [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.57.** Playwright "now runs on Chrome for Testing builds rather than Chromium": headed uses `chrome`, headless uses `chrome-headless-shell`, and Arm64 Linux stays on Chromium. The notes say "Existing tests should continue to pass" — [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **Background: 1.49 (late 2024; exact date not fetched).** 1.49 introduced `toMatchAriaSnapshot` and warned that after upgrading "you will probably need to update your snapshots" (issue #33566) — [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.58–1.61.**
  - 1.58: HTML report Speedboard "Timeline" for merged (sharded) reports.
  - 1.59: `Page.ariaSnapshot`, `depth`/`mode` options, screencast "Agentic video receipts", `Browser.bind` (attach `playwright-cli` / `@playwright/mcp` to a running browser), `npx playwright test --debug=cli`, and `npx playwright trace` CLI including `trace snapshot <n> --name before|after`.
  - 1.60: `toMatchAriaSnapshot` on `Page`, a `boxes` option "useful for AI consumption", `TestInfoError.errorContext` (ARIA snapshot at failure), and a new `{testFileBaseName}` token in `snapshotPathTemplate`.
  - Source: [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.62.**
  - `toHaveScreenshot` can store goldens as WebP by giving the name a `.webp` extension. "Visual comparisons store the golden snapshot as lossless WebP"; `page.screenshot` WebP quality 100 is lossless.
  - New `retryStrategy: 'isolated'`.
  - New `Reporter.preprocess`.
  - "Playwright now bundles the Playwright MCP server and `playwright-cli`, runnable via `npx playwright mcp` and `npx playwright cli`."
  - Source: [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.63.** The tracing `snapshots` option accepts `{ dom, aria, screen }`, and the trace viewer gained a "Display Aria" mode. New `ariaSnapshotJSON()` — [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **1.64 (2026-10-07).**
  - New `expect.toHaveScreenshot.type: 'webp'` stores all unnamed screenshots as WebP.
  - Breaking: "`--update-snapshots=missing` now passes the test run… so that CI can generate new snapshots and verify the existing ones in a single run". The unspecified mode is renamed `'default'` (it writes missing snapshots and fails).
  - Breaking: `screen` is now forwarded from device descriptors, so "`window.screen` and media queries now see the emulated screen size".
  - Also new: `TestProject.default`, `--shuffle`, `Page.getByRef`, and WebMCP support.
  - Source: [release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-js.md) (fetched 2026-10-19).
- **Update modes (current docs).**
  - `all`: every executed test updates.
  - `changed`: updates non-matching snapshots and creates missing ones.
  - `missing`: creates missing ones, and those tests pass.
  - `none`: no updates.
  - `default`: missing ones are created but those tests fail, "so that the run does not silently pass in CI".
  - `updateSourceMethod` defaults to `patch`.
  - Source: [TestConfig docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md) (fetched 2026-10-19).
- **Comparator and defaults.**
  - The visual comparisons guide says "Playwright Test uses the pixelmatch library". `threshold` "Defaults to `0.2`", and `maxDiffPixels` is "Unset by default".
  - `stylePath` can inject CSS.
  - Snapshots live in `<test file>-snapshots/` next to the test, and "You should commit this directory".
  - The example name `example-test-1-chromium-darwin.png` encodes "the browser name and the platform. Screenshots differ between browsers and platforms…".
  - Source: [Playwright visual comparisons guide](https://github.com/microsoft/playwright/blob/main/docs/src/test-snapshots-js.md) (fetched 2026-10-19).
- **Expect defaults.** `animations` "disabled", `caret` "hide", `scale` "css", `maxDiffPixels`/`maxDiffPixelRatio` unset, `threshold` in YIQ, `type` png|webp (default png), `pathTemplate` — [TestConfig docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md) (fetched 2026-10-19).
- **Comparator source.**
  - Uses vendored `third_party/pixelmatch` with `threshold: options.threshold ?? 0.2`.
  - An alternative `comparator === 'ssim-cie94'` path exists.
  - The allowed count is `min(maxDiffPixels, ratio × area)`, else 0.
  - The failure message is "N pixels (ratio R of all image pixels) are different."
  - It includes a WebP decoder.
  - Source: [comparators.ts](https://github.com/microsoft/playwright/blob/main/packages/utils/comparators.ts) (fetched 2026-10-19).
- **Stability.** "This function will wait until two consecutive page screenshots yield the same result, and then compare the last screenshot with the expectation." — [PageAssertions docs](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-pageassertions.md) (fetched 2026-10-19).
- **Default path templates (source).**
  - Screenshots use `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}`, with the extension taken from `expect.toHaveScreenshot.type` (png default).
  - ARIA snapshots default to `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}` with `.aria.yml`, so no platform/project suffix.
  - Source: [testInfo.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/worker/testInfo.ts) (fetched 2026-10-19).
  - Template tokens include `{platform}` (`process.platform`), `{projectName}`, `{testFilePath}`, `{testFileBaseName}`, `{testName}` and `{arg}`/`{ext}` — [params.md](https://github.com/microsoft/playwright/blob/main/docs/src/api/params.md) (fetched 2026-10-19).
- **Healer and baselines.** The healer "Replays the failing steps; Inspects the current UI…; Suggests a patch (e.g., locator update, wait adjustment, data fix); Re-runs the test until it passes or until guardrails stop the loop". Its output is "A passing test, or a skipped test if the healer believes that functionality is broken." The doc never mentions screenshots, snapshots or baselines — [Playwright test agents docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-agents-js.md) (fetched 2026-10-19).
- **MCP and CLI screenshots.**
  - Playwright MCP "operates on the page's accessibility tree, not pixels" but lists "Screenshots: Capture the current page or specific elements for visual verification" — [Playwright MCP docs](https://github.com/microsoft/playwright/blob/main/docs/src/getting-started-mcp.md) (fetched 2026-10-19).
  - `playwright-cli screenshot`, `screenshot [ref]`, `--filename` and `--hires` (device pixels). The CLI doc lists no compare/diff command — [playwright-cli docs](https://github.com/microsoft/playwright/blob/main/docs/src/getting-started-cli.md) (fetched 2026-10-19).
- **Built-in reporters.** list, line, dot, failures, html, blob, json, junit, perfetto and GitHub Actions annotations — [Playwright reporters docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-reporters-js.md) (fetched 2026-10-19).
- **Third-party approval UI for Playwright.** html-reporter ("Testplane UI") supports Playwright and offers "Accept or undo changes in visual checks with one click". "UI mode is available only for Testplane and Playwright. To use with Playwright, add `--tool playwright`" — [gemini-testing/html-reporter README](https://github.com/gemini-testing/html-reporter#readme) (fetched 2026-10-19).

### Inferences
- **Gaps that remain in Playwright as of 1.64:**
  - Approval is a CLI or UI-mode re-run. The release notes I read add no per-image accept in the HTML report.
  - Baselines are committed files.
  - Names carry per-OS/project suffixes, so developers on macOS cannot verify Linux CI goldens locally without Docker.
  - The HTML report is per run, and 1.58's Timeline only covers merged shards. There is no cross-run history.
  - The comparator is not pluggable beyond `pixelmatch` / `ssim-cie94`.
- 1.64's `missing`-passes change makes it easier for CI to write new baselines without a human step. That is the opposite direction from a "human confirmation for baseline writes" policy.
- 1.57 (Chrome for Testing / headless shell) and 1.64 (`screen` forwarding into media queries) are both upgrade events that can shift renders. A tool that pins baselines should record the Playwright and browser build.
- No evidence was found that the healer edits baselines. An LLM following it could still run `--update-snapshots`; that is unverified.

### Gaps
- I did not verify the HTML report's current image-diff viewer features (slider, side-by-side) from source.
- I did not verify the documentation status of the `ssim-cie94` comparator (experimental or private).
- I did not confirm where `snapshotSuffix` is set to `process.platform` in code. The docs state the platform suffix behaviour.

## Q4. WebdriverIO `@wdio/visual-service` and Testplane `assertView` + html-reporter

### Takeaway
WebdriverIO moved its visual engine twice in 2026:
- 1.x used jimp/Resemble-style comparison;
- `@wdio/image-comparison-core` 2.0.0 (2026-06-28) switched to pixelmatch 7.2;
- 3.0.0 / visual-service 11.0.0 (2026-10-10) switched to pixelmatch 8 (OKLab/HyAB), with ignored regions handled through pixelmatch's `ignoreMask`.

Its review UI is a static report built from JSON, with no approval found. Testplane 9 (2026-06-16) rewrote `assertView` on looks-same 10, relaxed its defaults (`tolerance` 2.3 → 3.0, `ignoreDiffPixelCount` 0 → 4 px), and keeps the strongest local approval GUI in this group (html-reporter accept/undo, which also works for Playwright).

### Cited Findings
- **Release dates.** @wdio/visual-service 6.4.0 on 2025-03-31; 7.0.0 on 2025-04-18; 8.0.0 on 2025-05-12; 9.0.0 on 2025-07-23; 9.1.0 on 2025-12-23; 9.2.0 on 2026-03-15; 10.0.0 on 2026-06-28; 10.2.0 on 2026-10-05; 11.0.0 on 2026-10-10 — [npm registry](https://www.npmjs.com/package/@wdio/visual-service) (fetched 2026-10-19).
- **WDIO comparator dependency history.**
  - `webdriver-image-comparison` (last release 9.0.4 on 2025-05-25) and `@wdio/image-comparison-core` 1.0.0 (2025-07-23) depend on `jimp`.
  - 2.0.0 (2026-06-28) depends on `pixelmatch` ^7.2.0 and `fast-png`.
  - 3.0.0 (2026-10-10) depends on `pixelmatch` ^8.0.0 and `fast-png`.
  - visual-service 11.0.0 depends on core 3.0.0.
  - Source: [npm registry](https://www.npmjs.com/package/@wdio/image-comparison-core) (fetched 2026-10-19).
- **WDIO core 3.0.0 changelog (maintainer claims).**
  - "The comparison engine is now pixelmatch 8. It measures color differences in the OKLab color space with the HyAB distance instead of YIQ… fewer false positives and fewer missed changes."
  - "The threshold scale did not change (0 to 1…)".
  - "mismatch percentages can differ a little… On real screenshots the number of different pixels changed by about −3% to +3%".
  - Ignored regions "are now skipped by pixelmatch itself instead of being painted black", so neighbouring pixels keep real anti-aliasing neighbours. Regions overflowing the right edge are now clipped, fixing a wrap-around bug.
  - v11 supports WebdriverIO v10 only and Node ≥ 22.19.
  - Source: [image-comparison-core CHANGELOG](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/CHANGELOG.md) (fetched 2026-10-19).
- **WDIO tolerance model.**
  - The default strict preset is `{ threshold: 0.063, includeAA: true }`, "calibrated to resemble's 16/255 per channel".
  - The `ignoreAlpha/ignoreAntialiasing/ignoreColors/ignoreLess/ignoreNothing` presets map to preset threshold/includeAA values.
  - Mixing `ignore*` keys with direct `pixelmatch` options throws `CompareOptionsConflictError`.
  - Source: [options.ts](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/src/helpers/options.ts) (fetched 2026-10-19).
  - In direct mode the defaults are `threshold` 0.1, `includeAA` false, magenta diff colour and `checkerboard: true` — [constants.ts](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/src/helpers/constants.ts) (fetched 2026-10-19).
  - Compare code: optional bilinear `scaleToSameSize`, then pad both images to the larger canvas with opaque white, then diff — [compareImages.ts](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/src/pixelmatch/compareImages.ts) (fetched 2026-10-19).
- **WDIO storage and naming.**
  - Folder constants: `DEFAULT.BASE: './__snapshots__/'`, `SCREENSHOTS: '.tmp/'`, with `actual` and `diff` subfolders.
  - Default image name `'{tag}-{browserName}-{width}x{height}-dpr-{dpr}'`; Storybook mode uses `'{tag}-{logName}-…'`.
  - Other defaults: `autoSaveBaseline` true, `alwaysSaveActualImage` true, `waitForFontsLoaded` true, `hideScrollBars` true outside Storybook mode, `disableCSSAnimation` false, `ignoreRegionPadding` 1.
  - Sources: [constants.ts](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/src/helpers/constants.ts); [options.ts](https://github.com/webdriverio/visual-testing/blob/main/packages/image-comparison-core/src/helpers/options.ts) (fetched 2026-10-19).
- **WDIO review UI.**
  - The README describes `@wdio/visual-reporter` as "a sample of what people could do with the output". It needs `output.json` from `createJsonReportFiles: true` (available since visual-service v5.2.0) and runs as `npx wdio-visual-reporter --jsonOutput … --reportFolder …`. No accept/approve flow is described — [visual-reporter README](https://github.com/webdriverio/visual-testing/blob/main/packages/visual-reporter/README.md) (fetched 2026-10-19).
  - 0.5.0 (2026-10-10; previous release 0.4.0 on 2024-10-15) fixed opening the report "from any folder of a static host, for example an AWS S3 bucket" — [visual-reporter CHANGELOG](https://github.com/webdriverio/visual-testing/blob/main/packages/visual-reporter/CHANGELOG.md); [npm registry](https://www.npmjs.com/package/@wdio/visual-reporter) (fetched 2026-10-19).
- **Testplane 9.0.0 (2026-06-16).** Breaking changes include "implement new assertView version", a screen-shooter "split into 3 versions", `disableHover`, `cropMargins`, Node 22, and `gridUrl: "local"` by default. Latest is 9.3.3 (2026-10-14) — [Testplane CHANGELOG](https://github.com/gemini-testing/testplane/blob/master/CHANGELOG.md); [npm registry](https://www.npmjs.com/package/testplane) (fetched 2026-10-19).
- **Testplane comparator.** testplane 9.3.3 depends on `looks-same` 10.0.1 (looks-same 10.0.0 released 2025-08-18) — [npm registry](https://www.npmjs.com/package/looks-same) (fetched 2026-10-19). The looks-same README says:
  - "By default, it will detect only noticeable differences";
  - "Default `tolerance` in non-strict mode is 2.3";
  - `strict: true` is equivalent to tolerance 0;
  - `ignoreAntialiasing` and `ignoreCaret` are on by default;
  - `antialiasingTolerance` is a minimum brightness difference, and the README recommends not going above 10;
  - `pixelRatio` defaults to 1;
  - `shouldCluster` / `clustersSize` return diff clusters.
  - Source: [looks-same README](https://github.com/gemini-testing/looks-same#readme) (fetched 2026-10-19).
- **Testplane v9 defaults (master).**
  - `screenshotsDir: "testplane/screens"`, falling back to the legacy `hermione/screens` if that exists.
  - `tolerance: 3.0`, `antialiasingTolerance: 4`, `disableAnimation: true`, `diffColor: "#ff00ff"`.
  - `buildDiffOpts {ignoreAntialiasing: true, ignoreCaret: true}`.
  - `assertViewOpts {ignoreElements: [], captureElementFromTop: true, allowViewportOverflow: false, ignoreDiffPixelCount: 4, waitForStaticToLoadTimeout: 5000, disableHover: WhenScrollingNeeded, cropMargins: {}}`.
  - `compositeImage: true`, `retry: 0`.
  - Source: [defaults.js (master)](https://github.com/gemini-testing/testplane/blob/master/src/config/defaults.js); [browser-options.js](https://github.com/gemini-testing/testplane/blob/master/src/config/browser-options.js) (fetched 2026-10-19).
  - By contrast, v8.47.2 had `tolerance: 2.3`, `antialiasingTolerance: 4` and `ignoreDiffPixelCount: 0` — [defaults.js @ v8.47.2](https://github.com/gemini-testing/testplane/blob/v8.47.2/src/config/defaults.js) (fetched 2026-10-19).
- **Testplane tolerance semantics (source).** `ignoreDiffPixelCount` accepts either an absolute pixel count or a `'${number}%'` string (0–100). A diff is "minor" (passes) if `differentPixels <= count` or `diffRatio <= pct` — [assert-view/index.js](https://github.com/gemini-testing/testplane/blob/master/src/browser/commands/assert-view/index.js) (fetched 2026-10-19). The v8 docs say `ignoreDiffPixelCount` was added in 8.2.0 with default 0, and `disableAnimation` became true in 8.0.0. They label v8 "no longer actively maintained" — [testplane.io v8 assertView](https://testplane.io/docs/v8/commands/browser/assertView/) (fetched 2026-10-19).
- **Testplane baseline layout.** `getScreenshotPath` resolves to `path.resolve(cwd, screenshotsDir, test.id, browserId, `${stateName}.png`)`, unless `screenshotsDir` is a function — [browser-config.ts](https://github.com/gemini-testing/testplane/blob/master/src/config/browser-config.ts) (fetched 2026-10-19).
- **Testplane update flow.** `--update-refs` dates from the hermione era (changelog entry "option '--update-refs' for 'assertView' command"), and v9 still has a `capture-processors/update-refs.js` driven by `RuntimeConfig.updateRefs` — [Testplane CHANGELOG](https://github.com/gemini-testing/testplane/blob/master/CHANGELOG.md); [assert-view source dir](https://github.com/gemini-testing/testplane/tree/master/src/browser/commands/assert-view) (fetched 2026-10-19).
- **Testplane GUI (html-reporter).**
  - Described as "Accept or undo changes in visual checks with one click", "More than a reporter… update reference images".
  - It can merge data from multiple sources (`merge-reports`) and "works with Testplane, Playwright and Jest", with `npx html-reporter gui` for Testplane and Playwright.
  - html-reporter 11.0.0 was released 2025-08-26 and 11.17.2 on 2026-10-01.
  - Sources: [html-reporter README](https://github.com/gemini-testing/html-reporter#readme); [npm registry](https://www.npmjs.com/package/html-reporter) (fetched 2026-10-19).

### Inferences
- With WDIO 11, both of the long-standing alternative engines (Resemble in WDIO, YIQ pixelmatch elsewhere) are converging on pixelmatch. WDIO is the first mainstream runner on pixelmatch 8, and it publishes a measured ±3% shift in pixel counts.
- Testplane is the only runner here with CIEDE2000-style perceptual tolerance (see Gap) plus a mature local accept/undo GUI. Its html-reporter is also the only cross-tool approval UI found (Testplane, Playwright, Jest), so it is a candidate to interoperate with, not to rebuild.
- Testplane v9 raised the defaults to tolerance 3.0 and 4 ignored pixels. Even so, its default budget is a handful of pixels, not a percentage of the image.

### Gaps
- I did not verify WDIO matcher semantics: the numeric `toMatchScreenSnapshot(tag, expected)` mismatch-percentage default, `saveAboveTolerance`, or the CLI flag for updating baselines (believed to be `--update-visual-baseline`; unverified here).
- I did not confirm whether WDIO's default file names include a platform token. The default format string has none.
- The looks-same README lines I fetched do not say "CIEDE2000"; the colour-distance metric is unverified in this pass.
- The Testplane v9 assertView docs URL returned 404.
- I did not verify what html-reporter writes when accepting a Playwright screenshot (which file paths it overwrites).

## Q5. jest-image-snapshot and cypress-visual-regression: comparator and defaults

### Takeaway
jest-image-snapshot (6.5.2, 2026-03-09) still uses pixelmatch ^5.1. Its defaults are: per-pixel `threshold` 0.01, `failureThreshold` 0 counted in `pixel` units, optional SSIM (`bezkrovny`), baselines in `__image_snapshots__/` with no browser or platform in the name, and `-u` to update. cypress-visual-regression 6.x (2026) uses pixelmatch 7.2.0 with `errorThreshold` 0, a fraction of pixels that fails on `>`, and per-pixel `threshold` 0.1. Baselines live in `cypress/snapshots/base`. It has a "base" mode and an opt-in auto-update-on-mismatch flag.

### Cited Findings
- **jest-image-snapshot releases and dependencies.** 6.5.0 on 2025-05-12, 6.5.1 on 2025-05-20 and 6.5.2 on 2026-03-09. Dependencies: `pixelmatch` ^5.1.0, `ssim.js` ^3.1.1, `pngjs` ^3.4.0 and `glur` (blur). The repo is not archived (last pushed 2026-10-17) — [npm registry](https://www.npmjs.com/package/jest-image-snapshot); [americanexpress/jest-image-snapshot](https://github.com/americanexpress/jest-image-snapshot) (fetched 2026-10-19).
- **jest-image-snapshot README.**
  - Baselines go to a `__image_snapshots__` directory next to the test. Updates use `--updateSnapshot` / `-u`.
  - `customDiffConfig`: "By default we have set the `threshold` to 0.01" (per-pixel).
  - `comparisonMethod`: default `pixelmatch`; `ssim` is "experimental", with `ssim: 'bezkrovny'` as the default and `'fast'` for higher precision.
  - `failureThreshold`: default 0. `failureThresholdType`: default `pixel`, or `percent`.
  - `blur` 0, `allowSizeMismatch` false, `storeReceivedOnFailure` false ("useful when updating baseline images from CI"), `customReceivedPostfix` `-received`, `updatePassedSnapshot` false, `runInProcess` false.
  - Obsolete images need the `outdated-snapshot-reporter` to be removed. `jest.retryTimes` requires a unique `customSnapshotIdentifier`.
  - The README recommends a 1% threshold for SSIM.
  - Source: [jest-image-snapshot README](https://github.com/americanexpress/jest-image-snapshot#readme) (fetched 2026-10-19).
- **jest-image-snapshot naming (source).** `SNAPSHOTS_DIR = '__image_snapshots__'`. The default identifier is `kebabCase(`${basename(testPath)}-${currentTestName}-${counter}`) + '-snap'`, giving `<id>.png`, with no browser or platform component — [src/index.js](https://github.com/americanexpress/jest-image-snapshot/blob/HEAD/src/index.js) (fetched 2026-10-19).
- **cypress-visual-regression releases and dependencies.** 5.3.0 on 2025-02-16, 6.0.0 on 2026-06-12 and 6.0.1 on 2026-09-08. Dependencies: `pixelmatch` 7.2.0 and `pngjs` 7.0.0. Peer dependency `cypress >=15` — [npm registry](https://www.npmjs.com/package/cypress-visual-regression) (fetched 2026-10-19).
- **cypress-visual-regression README.**
  - `visualRegressionType`: `'base'` ("will override any existing base images") or `'regression'`.
  - `visualRegressionUpdateSnapshots` (default false): "regression mismatches update existing base snapshots instead of failing". It can be set via `CYPRESS_visualRegressionUpdateSnapshots=true` or `cypress run --expose …`.
  - Base directory `cypress/snapshots/base`, diff directory `cypress/snapshots/diff`, actuals in Cypress `screenshotsFolder`.
  - `visualRegressionGenerateDiff` default `'fail'`; `visualRegressionFailSilently` default false.
  - `errorThreshold` default 0, described as "Represented in percentages". The example `compareSnapshot('homePage', 0.2)` means "bigger than 0.2 (20% difference)".
  - Source: [cypress-visual-regression README](https://github.com/cypress-visual-regression/cypress-visual-regression#readme) (fetched 2026-10-19).
- **cypress-visual-regression source.** `percentage = mismatchedPixels / width / height` and `regressionError = percentage > errorThreshold` — [src/plugin.ts](https://github.com/cypress-visual-regression/cypress-visual-regression/blob/HEAD/src/plugin.ts). The default command options are `errorThreshold: 0` and `pixelmatchOptions: { threshold: 0.1 }`. The command also renders an in-runner base/actual slider (CSS `clipPath` logic) — [src/command.ts](https://github.com/cypress-visual-regression/cypress-visual-regression/blob/HEAD/src/command.ts) (fetched 2026-10-19).

### Inferences
- **Doc mismatch.** cypress-visual-regression's "percentages" label is misleading: the value is a 0–1 fraction, as in this product's 10%-of-pixels budget.
- **Zero-budget defaults.** Both libraries default to a zero-pixel failure budget.
- **Unsafe update flag.** The Cypress plugin's auto-update-on-mismatch flag is an example of the unsafe update path that a human-confirmation policy should avoid.

### Gaps
- I did not verify jest-image-snapshot's default diff-output directory in source; it is believed to be `__image_snapshots__/__diff_output__`.
- I did not check other Cypress plugins (e.g. FRSOURCE's visual-regression-diff, cypress-image-diff-js) in this pass.

## Q6. Archived lost-pixel repo: who decides pass/fail?

### Takeaway
Pixelmatch decides pass/fail by default. `compareEngine` defaults to `'pixelmatch'`, and `odiff-bin` is opt-in. Pixelmatch runs with per-pixel `threshold: 0` (strictest), and the shot-level `threshold` defaults to 0 differing pixels. A shot threshold below 1 is read as a fraction of total pixels; 1 or more is an absolute pixel count.

### Cited Findings
- **Repo status.** lost-pixel/lost-pixel reports `archived=true`, last pushed 2026-04-22. npm `lost-pixel` latest is 3.22.0 (2024-11-14, background), and it depends on `odiff-bin` 2.6.1 and `pixelmatch` 5.3.0 — [lost-pixel repo](https://github.com/lost-pixel/lost-pixel); [npm registry](https://www.npmjs.com/package/lost-pixel) (fetched 2026-10-19).
- **compare.ts.**
  - `compareImages()` calls pixelmatch when `config.compareEngine === 'pixelmatch'`, otherwise odiff. In platform (cloud) mode it is `featureNotSupported`.
  - Pixelmatch path:
    - Byte-identical buffers pass immediately.
    - On a dimension mismatch, both images are resized to the max width/height.
    - It calls `pixelmatch(..., { threshold: 0 })`.
    - `checkThreshold` treats `threshold < 1` as `pixelDifference <= pixelsTotal * threshold` and otherwise as `pixelDifference <= threshold`.
    - The diff PNG is written only when out of threshold.
  - Odiff path:
    - It calls `odiffCompare(..., { failOnLayoutDiff: false })`.
    - On `pixel-diff` it applies the same fraction/count rule to `diffPercentage/100` or `diffCount`.
    - Any other failure reason throws.
  - Source: [src/compare/compare.ts](https://github.com/lost-pixel/lost-pixel/blob/main/src/compare/compare.ts) (fetched 2026-10-19).
- **Config defaults.** `compareEngine: z.enum(['pixelmatch','odiff']).default('pixelmatch')`, `threshold` default 0, `waitBeforeScreenshot` 1000, `flakynessRetries` 0, `waitBetweenFlakynessRetries` 2000, `compareConcurrency` 10. Directories are `.lostpixel/baseline/`, `.lostpixel/current/` and `.lostpixel/difference/` — [src/config.ts](https://github.com/lost-pixel/lost-pixel/blob/main/src/config.ts) (fetched 2026-10-19).

### Inferences
- **Same rule as this product.** Lost Pixel's dual-unit threshold (fraction below 1, count at 1 or more) with a zero default matches this product's pixelmatch-gated design.
- **What differed.** Lost Pixel was far stricter per pixel (`threshold: 0` YIQ), and it silently resized mismatched dimensions instead of failing. Vitest, Histoire and the CLI's peers fail or require explicit replacement on a size change.

### Gaps
- I did not verify which per-pixel threshold odiff applies when Lost Pixel passes none.

## Q7. Interop: shared baseline layouts and report formats; who adopted CTRF

### Takeaway
There is no cross-tool baseline standard, but there is a de facto naming pattern. Both Playwright and Vitest key screenshots by `<name>-<browser|project>-<process.platform>.<ext>` beside the test file, with configurable token or function templates. Other tools use their own layouts:

| Tool | Baseline layout |
|---|---|
| WDIO | `{tag}-{browserName}-{width}x{height}-dpr-{dpr}` |
| Testplane | `<dir>/<testId>/<browserId>/<state>.png` |
| jest-image-snapshot | `__image_snapshots__/<kebab>-snap.png` |
| cypress-visual-regression | `cypress/snapshots/base` |
| Lost Pixel | `.lostpixel/baseline` |
| Histoire (unreleased) | content-addressed `.histoire-visual/baselines/<os-arch>/…` |

For reports, JUnit XML is the only format built into the major runners (Playwright, Vitest). CTRF is a pre-1.0 JSON spec. It has `attachments` and `screenshot` fields, and its own `baseline` concept means cross-run metrics, not image goldens. Adoption comes mostly through ctrf-io's own reporters and GitHub Action. Self-declared native adopters are xUnit.net, JSON Schema CLI, Katalon Studio and Specmatic.

### Cited Findings
- **Playwright layout.** `{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}`, with name parts like `chromium-darwin` for browser plus platform; ARIA snapshots use `.aria.yml` with no suffix — [testInfo.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/worker/testInfo.ts); [visual comparisons guide](https://github.com/microsoft/playwright/blob/main/docs/src/test-snapshots-js.md) (fetched 2026-10-19).
- **Vitest layout.** `__screenshots__/<testFileName>/<arg>-<browserName>-<platform><ext>` beside the test, with actual/diff images under `.vitest/attachments/...-actual.png` / `-diff.png` — [browser.expect config](https://github.com/vitest-dev/vitest/blob/main/docs/config/browser/expect.md); [VRT guide](https://github.com/vitest-dev/vitest/blob/main/docs/guide/browser/visual-regression-testing.md) (fetched 2026-10-19).
- **Other layouts.** WDIO, Testplane, jest-image-snapshot, cypress-visual-regression, Lost Pixel and Histoire layouts are as cited in Q2, Q4, Q5 and Q6 above.
- **CTRF spec status.** The README says "We are maintaining a pre-1.0 version to allow for community-driven refinements before locking the v1.0.0 standard", and it has an "Adopters" section linking ctrf.io/adopters — [ctrf-io/ctrf README](https://github.com/ctrf-io/ctrf#readme) (fetched 2026-10-19).
- **CTRF fields relevant to visual results.**
  - `screenshot`: "A single base64-encoded screenshot captured during execution of the test case."
  - `attachments`: "An external file or resource referenced by a test case… such as a screenshot, log file, or other artifact", with `contentType` and `path`.
  - `insights` and `baseline` "MAY include aggregated metrics computed across multiple historical runs". A baseline structure describes "a metric's `current` value, the corresponding value from a `baseline` run, and the computed `change`".
  - "Unknown fields MUST NOT appear in the test object except within an `extra` object."
  - The schema also has `flaky`, `retries`/`retryAttempts`, `reportFormat` and `specVersion`.
  - Sources: [CTRF spec](https://github.com/ctrf-io/ctrf/blob/main/spec/ctrf.md); [CTRF JSON schema](https://github.com/ctrf-io/ctrf/blob/main/schema/ctrf.schema.json) (fetched 2026-10-19).
- **Self-declared CTRF adopters.** The adopters page lists xUnit.net, JSON Schema CLI, Katalon Studio and Specmatic. xUnit.net, JSON Schema CLI and Specmatic are described as natively producing CTRF reports. The page does not say how adoption is verified (self-listed) — [ctrf.io/adopters](https://ctrf.io/adopters) (fetched 2026-10-19).
- **ctrf-io tooling.** The org maintains reporters for Playwright (105★), Jest, Cypress, WDIO, Mocha, Jasmine, Newman, Nightwatch, CodeceptJS, Go and .NET. It also maintains `github-test-reporter` (378★), Slack/Teams/Mattermost/Jira reporters, `ai-test-reporter`, `junit-to-ctrf` and `ctrf-cli`. All were pushed in October 2026 — [github.com/ctrf-io](https://github.com/ctrf-io) (GitHub API, fetched 2026-10-19).
- **npm downloads (last month).** playwright-ctrf-json-reporter 1,576,740; jest 524,247; cypress 127,356; vitest 86,154 (vitest reporter at 0.0.3, last modified 2025-09-15); wdio 18,512. The `ctrf` reference package is 0.5.0 (2026-10-10) — [npm downloads API](https://api.npmjs.org/downloads/point/last-month/playwright-ctrf-json-reporter,vitest-ctrf-json-reporter,jest-ctrf-json-reporter,cypress-ctrf-json-reporter,wdio-ctrf-json-reporter); [npm registry](https://www.npmjs.com/package/ctrf) (fetched 2026-10-19).
- **Usage in public repos.** GitHub code search found 362 workflow files referencing `ctrf-io/github-test-reporter`, and 237 `package.json` files referencing `playwright-ctrf-json-reporter`. Sample repos: Automattic/jetpack, ag-grid/ag-grid, RedHatInsights/insights-inventory-frontend, UKHomeOffice/engineering-guidance-and-standards, glpi-project/glpi, juspay/hyperswitch-control-center, 3liz/lizmap-web-client and PrestaShopCorp/ps_accounts — GitHub code search API (fetched 2026-10-19; counts are approximate and limited to the search index).
- **Native report formats in the runners.** Playwright's built-in reporters include JSON and JUnit, not CTRF — [Playwright reporters docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-reporters-js.md). Vitest has built-in `html`, `json` and `junit` reporters — [Vitest 5 blog](https://github.com/vitest-dev/vitest/blob/main/docs/blog/vitest-5.md). `junit-to-ctrf` exists "if there isn't a CTRF reporter available for your test framework" — [junit-to-ctrf README](https://github.com/ctrf-io/junit-to-ctrf#readme) (fetched 2026-10-19).
- **Cross-tool review UI.** The only cross-tool review UI found is html-reporter, with GUI accept/undo for Testplane and Playwright and a viewer for Jest — [html-reporter README](https://github.com/gemini-testing/html-reporter#readme) (fetched 2026-10-19).

### Inferences
- **Most portable import/export target.** That is the Playwright and Vitest `<name>-<browser>-<platform>.png` pattern. Both runners already let users point templates elsewhere: Playwright's `snapshotPathTemplate` / `expect.toHaveScreenshot.pathTemplate` and Vitest's `resolveScreenshotPath`.
- **Name mapping is needed.** Their `{arg}` names are test-derived, not route/viewport-derived, so any import needs an explicit mapping.
- **Recommended report formats.** CTRF suits CI summaries (via the GitHub Action, Slack and so on), and JUnit XML is the universal fallback. Neither format has a standard slot for baseline/actual/diff triples beyond generic `attachments` and `extra`.

### Gaps
- I found no evidence that any surveyed visual runner natively emits CTRF.
- I did not verify Playwright's attachment names in `test-results` (believed to be `-expected` / `-actual` / `-diff`).
- I found no shared "visual result" schema across tools.

## Roadmap implications

Candidates for a local-first, pixelmatch-gated CLI. Each is tied to the evidence above.

1. **[EVIDENCE-FOR-EXISTING-ITEM] pixelmatch 8 adoption, and small-text misses under a 10% budget.**
   - WDIO's core 3.0.0 (2026-10-10) is the first mainstream runner on pixelmatch 8 (OKLab/HyAB), with the same 0–1 threshold scale. It publishes a measured ±3% change in differing-pixel counts and moved masking to pixelmatch's `ignoreMask` (Q4).
   - Elsewhere, Vitest left pixelmatch for BlazeDiff in 4.1 (Q1), and Histoire main and cypress-visual-regression 6 are on pixelmatch 7.2 (Q2, Q5).
   - On the budget question, every runner surveyed defaults to zero or a few allowed pixels:

     | Tool | Default pixel budget |
     |---|---|
     | Vitest | 0 |
     | Playwright | 0 (`maxDiffPixels` unset) |
     | jest-image-snapshot | 0 px |
     | cypress-visual-regression | 0 |
     | Lost Pixel | 0 |
     | Histoire | ratio 0 |
     | Testplane v9 | 4 px |

   - So a 10%-of-pixels default is an outlier by orders of magnitude. This supports the filed small-text-miss item.
2. **[EVIDENCE-FOR-EXISTING-ITEM] Human confirmation for baseline writes.**
   - The ecosystem is moving toward easier unattended writes: Playwright 1.64 makes `--update-snapshots=missing` pass, and cypress-visual-regression offers auto-update on mismatch (Q3, Q5).
   - Counter-examples worth copying:
     - Vitest's guide recommends a manual `workflow_dispatch` update job.
     - Vitest in CI writes missing references to attachments, not to the baseline path.
     - Histoire requires an explicit filter or `--all` for `--update` and never stages, commits or pushes (Q1, Q2).
   - Mirroring Playwright's mode vocabulary (`changed|missing|all`) would aid familiarity. The Playwright healer agent is not documented to touch baselines (Q3).
3. **[EVIDENCE-FOR-EXISTING-ITEM] Ladle/Histoire discovery plus runner-change warning.**
   - Ladle's documented entry points are `meta.json`, `?story=<key>&mode=preview` and `[data-storyloaded]` (Q2).
   - Histoire's main branch has native visual testing that closely overlaps this product: pixelmatch ^7.2, Git-ref compare, workbench approval, exit codes 0/1/2. It is unreleased on npm (1.0.0-beta.1 is still latest). Scope Histoire support to "discover stories and capture", and expect native Histoire visual tests to displace it once beta.2 ships.
   - The runner-change warning should also cover Storybook's test-runner end of support: archived 2026-09-30, and it prints a warning on every run under Storybook 11 (Q2).
4. **[NEW] Confirm Storybook 9/10 support and track 11-alpha.**
   - The product captures Storybook 7/8 stories. Storybook's own migration notes now recommend "plain Playwright… that generates tests from stories" for anyone who can't use the Vitest addon, and the only first-party visual path is cloud Chromatic (Q2).
   - Scoped work: verify index/iframe compatibility on 9.x/10.x (and 11.0.0-alpha), then document the CLI as the open-source, local alternative.
   - Do not build an in-Storybook panel; Chromatic's addon owns that surface.
5. **[NEW] Import or export Playwright and Vitest baseline layouts.**
   - Read-only import, plus optional export, between the orphan-branch store and the two de facto layouts:
     - Playwright: `<file>-snapshots/<arg>-<project>-<platform>.png|.webp`.
     - Vitest: `__screenshots__/<file>/<arg>-<browser>-<platform>.png`.
   - This needs an explicit name-to-route/viewport mapping file, because `{arg}` is test-derived (Q7).
   - It lets teams seed CLI baselines from an existing suite, or hand CLI baselines to an in-test assertion, without rebuilding either runner.
6. **[NEW] Vitest comparator adapter.**
   - A tiny package that registers the CLI's exact gate (pixelmatch 7.2, the same budget semantics, optional SSIM 0.98) as a Vitest `toMatchScreenshot` comparator. It would use the documented `browser.expect.toMatchScreenshot.comparators` registry and its `(reference, actual, {createDiff, ...}) => {pass, diff, message}` contract (Q1).
   - This gives identical pass/fail between CLI runs and Vitest browser-mode tests.
   - Playwright has no pluggable comparator (only `pixelmatch` and `ssim-cie94`), so no Playwright equivalent is possible (Q3).
7. **[NEW] CTRF JSON and JUnit XML output.**
   - Emit one test per route × viewport × browser.
   - Put baseline/actual/diff as `attachments` with `contentType: image/png` and paths, and put mismatch pixels, ratio and threshold under `extra`.
   - Do not map image baselines onto CTRF's `baseline` field, which means cross-run metrics.
   - Payoff: ctrf-io's GitHub Action (≈362 workflow references), Slack/Teams reporters, and JUnit-consuming CI UIs.
   - Caveat: CTRF is pre-1.0, so pin `specVersion` (Q7).
8. **[NEW] Record the environment in baseline keys and metadata, and warn on mismatch.**
   - Every runner keys baselines by environment:

     | Tool | Baseline key |
     |---|---|
     | Playwright, Vitest | browser + `process.platform` |
     | Histoire | `linux-x64` |
     | Testplane | browserId |
     | WDIO | browser + viewport + dpr |

   - Known upgrade events change renders: Playwright 1.57's switch to Chrome for Testing headless shell, 1.64's `screen` forwarding into media queries, and background 1.49's "update your snapshots" note (Q3).
   - Scoped work: store the Playwright version, browser build, OS/arch and DPR with each baseline, and warn (not fail) on comparisons across environments. Verify first that this is not already shipped.
9. **[NEW, low priority] Accept lossless WebP baselines.**
   - Playwright 1.62+ stores goldens as lossless WebP, and 1.64 adds `expect.toHaveScreenshot.type: 'webp'` (Q3).
   - Decode-only support makes item 5 work with WebP suites, and it is relevant to orphan-branch size (see item 12).
10. **[EVIDENCE-FOR-EXISTING-ITEM] Hosted review UI.**
    - The local approval UIs that exist are Histoire's workbench (approve and bulk approve), Testplane's html-reporter GUI (accept/undo, which also supports Playwright), Vitest UI (diff tabs and slider, no approve) and WDIO's visual-reporter (a static "sample" from JSON, no approve) (Q1, Q2, Q4).
    - Chromatic's Storybook panel is cloud-hosted.
    - Do not rebuild a cross-tool local GUI before checking whether html-reporter's adapter model could cover CLI output.
11. **[EVIDENCE-FOR-EXISTING-ITEM] Optional non-gating ARIA/text snapshots.**
    - Playwright's ARIA snapshot format (`.aria.yml`, no platform suffix by default) is the most developed: `/children` and `/url` (1.52), `Page.ariaSnapshot` (1.59), `toMatchAriaSnapshot` on Page and `boxes` (1.60), JSON form (1.63), plus the 1.50 source-update methods. Vitest has an experimental equivalent since 4.1.4 (Q1, Q3).
    - Reuse Playwright's YAML format rather than inventing one.
12. **[EVIDENCE-FOR-EXISTING-ITEM] Orphan-branch PNG history pruning.**
    - Nobody prunes automatically. Vitest says stale screenshots "aren't removed automatically", Histoire says "No automatic baseline pruning occurs", and jest-image-snapshot needs `outdated-snapshot-reporter`.
    - Orphan-PNG accumulation is a reported Vitest bug class (#10211) (Q1, Q2, Q5).
13. **[ALREADY-SHIPPED] waitForStability.**
    - Two equal consecutive captures is the norm in Playwright, Vitest and Histoire (Q1–Q3).
    - Keep a bounded timeout: Vitest's `timeout: 0` can hang, and its loop bugs #10204 and #8959 show the risk.
14. **[ALREADY-SHIPPED] SSIM override.**
    - Do not build a perceptual-comparator zoo. Vitest explicitly declines to bundle perceptual comparators ("no clear single best one"), and no surveyed runner other than Testplane (looks-same) defaults to a perceptual metric (Q1, Q4).
15. **[ALREADY-SHIPPED] MCP server.**
    - Do not build a general browser MCP or CLI. Playwright bundles Playwright MCP and `playwright-cli` (screenshots, `--hires`) since 1.62, but neither documents a compare/diff tool (Q3).
    - So the differentiator is the comparison and baseline workflow, not browser control.
16. **[NEW] Do-not-build list.**
    - A self-healing test agent: Playwright's healer covers it, and its documented scope excludes baselines.
    - An auto-update-on-mismatch flag (as in cypress-visual-regression): it conflicts with the human-confirmation item.
    - Silent resize on dimension mismatch (as in Lost Pixel and WDIO's padding): Vitest and Histoire fail or require explicit replacement on size changes, which is the safer default (Q1, Q2, Q4, Q6).

## Query log

Outbound web search (WebSearch), verbatim:
1. `CTRF Common Test Report Format adoption`

GitHub search API queries (issue/PR/code search), verbatim:
2. `repo:vitest-dev/vitest toMatchScreenshot is:issue is:open`
3. `repo:vitest-dev/vitest toMatchScreenshot is:issue is:closed created:>2025-06-01`
4. `repo:vitest-dev/vitest blazediff is:pr`
5. `repo:storybookjs/storybook toMatchScreenshot`
6. `"ctrf-io/github-test-reporter" path:.github/workflows`
7. `"playwright-ctrf-json-reporter" filename:package.json`

Direct fetches (no search terms):
- **WebFetch:** `https://testplane.io/docs/v8/commands/browser/assertView/`, `https://testplane.io/docs/v9/commands/browser/assertView/` (404) and `https://ctrf.io/adopters`.
- **npm registry lookups (`npm view`):** vitest, @vitest/browser (several versions), @blazediff/core, @storybook/addon-vitest, @storybook/test-runner, storybook, @playwright/test, @wdio/visual-service, webdriver-image-comparison, @wdio/image-comparison-core, @wdio/visual-reporter, testplane, html-reporter, looks-same, jest-image-snapshot, cypress-visual-regression, lost-pixel, histoire, @histoire/plugin-screenshot, @histoire/plugin-percy, @ladle/react and the ctrf reporters.
- **npm downloads API:** the ctrf reporter list.
- **GitHub contents and tree reads (`gh api`):**
  - vitest-dev/vitest
  - microsoft/playwright
  - storybookjs/storybook (next) and storybookjs/test-runner
  - tajo/ladle and histoire-dev/histoire
  - webdriverio/visual-testing
  - gemini-testing/testplane (master and v8.47.2), gemini-testing/looks-same and gemini-testing/html-reporter
  - americanexpress/jest-image-snapshot
  - cypress-visual-regression/cypress-visual-regression
  - lost-pixel/lost-pixel
  - ctrf-io/ctrf, ctrf-io/junit-to-ctrf and the ctrf-io org repo list

### Security notes
- **Confidentiality.** No query contained the product's name, domain, owner/org, internal file names or code. However, `gh` API calls ran under the locally authenticated GitHub account, so GitHub can associate these public-project queries with that account.
- **Agent-instruction files.** The webdriverio/visual-testing repo contains agent instruction files (`.agents/README.md` and `.agents/skills/visual-testing-baselines/SKILL.md`). They were seen only in a file listing; they were not opened or followed.
- **Prompt injection.** None of the fetched content tried to instruct an AI tool.
- **Vendor and maintainer claims.** These are labelled as such where they appear: BlazeDiff "1.5x faster", Storybook/Chromatic "most efficient way", WDIO "closer to how people see colors", and the self-listed CTRF adopters.
