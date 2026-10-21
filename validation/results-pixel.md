# Pixel validation, 2026-10-21

This is a measurement on issue #285. Pixelmatch is the only pass/fail signal. A recheck pass is not accuracy. This note publishes no Frontguard accuracy percentage, no confidence interval, and no AI accuracy table. It does not move the launch gate.

## What ran

Host: macOS 27.0.1 (build 26A434), arm64, Node v24.20.0. One machine.

Pixel arm CLI: package `@frontguard/cli` 0.2.3, `frontguard --version` printed `0.2.3`, git `1e016b5866de0957a47c9ac51d91c7fa04250313`. The binary was `git archive` of `packages/cli` at that sha, then a temp build. AI was off (provider keys unset, `FRONTGUARD_TELEMETRY=0`). Threshold ratio stayed `0.1`. Resolved `pixelmatch` is 7.2.0 and was not upgraded. Differing pixels in the 1–2px range were not ignored.

Browser: the engine launched. Playwright Chromium `browser.version()` was `156.0.8078.4`. Executable: `/Users/ravindra/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`. Configured browsers were `chromium` only. Firefox did not run. WebKit did not run. A default Chromium run is not a cross-browser result.

`ssimOverride` fired on 0 diffs in the fixture recheck, the fixture mutation, and the selection arm. SSIM was computed for the under-threshold nuisance diffs below and stayed under 0.98, so the override did not flip them.

Selection arm CLI, used only for filtered versus full capture: package 0.2.3, git `5a775c4c55a4426c5e7f7175fd57113ccac25411`, branch `ravidsrk/now-shipped-correctness`. Built from `git archive` of that checkout. That checkout's branch was not switched. `node_modules` was symlinked only inside the temp build directory and removed with it. The filter bundle contains the string `untraced static asset`. The pixel bundle from `1e016b5` does not. Runtime modules came from that parent install, not a fresh install of `1e016b5`.

Fixture viewports were 375, 768, and 1440. Viewport height is the CLI default, 720. Fixture config set `workers: 1` and `smartRender: false`. Seed 285 (mulberry32). The operator set is fixed; the seed chooses the replacement glyph (`#`), colors, the neighbour margin (231px), the animation length (1202ms), and the font stack.

`antiFlakeRenders` was not set, so the CLI default is 1. The multi-render consensus loop did not run, and no consensus disagreement was observed. The `flaky` status exists and was not assigned.

The fixture baseline manifest keys were `schemaVersion`, `createdBy` (`frontguard@0.2.3`), `updatedAt`, and `routes`. `fingerprint` was absent. The manifest fingerprint field is #303 and was not present on the tree measured (`1e016b5`). OS, arch, and the Playwright browser version above are the values actually observed. No fingerprint field was added.

## True positives beside false positives

A gate catch is pixelmatch status `regression` (over the 10% ratio) with `ssimOverride` not set. Status `changed` is under 10% and does not fail the process. It is not a gate catch.

Unchanged-code fixture recheck, 11 routes × 3 viewports, `FRONTGUARD_DISABLE_BYTE_COMPARE=1`. This is the false-positive count for the fixture app. It is not accuracy.

- pass 33 / 33, diff percentage 0, `comparisonMethod` `pixelmatch`, `hasBaselineImage` true
- changed 0 / 33, regression 0 / 33, error 0 / 33, `ssimOverride` 0 / 33
- exit 0

Seeded operators that should fail pixelmatch where the viewport is expected to show the change. Caught means every expected viewport was a gate catch. These seven operators are the recall denominator. Nuisance pages are not in it.

| Operator | Viewports expected to show the change | Gate result |
| --- | --- | --- |
| text (`html-text`, glyph `#`) | 3 (375, 768, 1440) | caught 3 / 3. Diff 32.07%, 51.03%, 52.67% |
| color (`css-color`, `#50b366`) | 3 | caught 3 / 3. Diff 100% at each |
| neighbour (margin 231px) | 3 | caught 3 / 3. Diff 52.55%, 52.56%, 52.56% |
| logo (inline SVG fill `#1529fb`) | 3 | caught 3 / 3. Diff 97.29%, 97.46%, 97.63% |
| layout-two (`max-width: 1000px`) | 2 (375, 768) | caught 2 / 2. Diff 90.23% at each. 1440 was pass, diff percentage 0 |
| layout-desktop (`min-width: 1200px`) | 1 (1440) | caught 1 / 1. Diff 90.23%. 375 and 768 were pass, diff percentage 0 |
| layout-mobile (`max-width: 500px`) | 1 (375) | caught 1 / 1. Diff 90.23%. 768 and 1440 were pass, diff percentage 0 |

Recall by how many viewports show the change: bucket 1 is 2 / 2 caught, bucket 2 is 1 / 1 caught, bucket 3 is 4 / 4 caught. Expected-viewport gate catches: 16 / 16. Partial 0. Missed 0. Error 0.

Side by side: true-positive gate catches 16 / 16 expected viewport diffs; unchanged-code fixture false-positive gate catches 0 / 33 recheck diffs.

The mutated process also reported 33 diffs: regression 19, changed 6, pass 8, `ssimOverride` 0, pixelmatch 33 / 33, exit 1. Of the 19 regressions, 16 are the recall catches above and 3 are the animation nuisance below. Those 3 are not true positives and not unchanged-code false positives.

## Nuisance, not comparator misses

These four fixtures are ordinary UI flake causes. They stay out of the recall denominator and out of the unchanged-code false-positive count.

- Animation: regression at 100% on 375, 768, and 1440. The comparator flagged it. It is still nuisance, not a recall hit.
- Font swap: `changed` on 375, 768, and 1440 (4.19%, 2.23%, 1.28%). SSIM 0.882, 0.939, 0.966. `ssimOverride` false. Not a comparator miss.
- Caret: `changed` on 375, 768, and 1440 (0.81%, 0.54%, 0.42%). SSIM 0.957, 0.958, 0.967. `ssimOverride` false. Not a comparator miss.
- Scrollbar: pass, diff percentage 0, on 375, 768, and 1440. Not a comparator miss.

## Full capture versus filtered selection

This arm is not the viewport-recall measurement. It uses viewport 1440 only and the filter CLI at `5a775c4`. An observable route is a full-capture diff whose status is `regression` or `changed`. An omission is an observable route missing from the filtered route set. Omissions are not comparator misses.

| Scenario | Files in `git diff HEAD~1` | Full-capture observable routes | Filtered `Smart filter:` reason | Omissions |
| --- | --- | --- | --- | --- |
| about-only | `pages/about.js`, `site/about.html` | `/about` (regression 100%). `/`, `/gallery`, `/brand` pass | `1/4 routes affected by 2 changed file(s) (16ms)`. Filtered routes: `/about` | 0 / 1 |
| svg-and-about | `pages/about.js`, `public/logo.svg`, `site/about.html` | `/` (regression 64.50%) and `/about` (regression 100%) | `untraced static asset public/logo.svg — rendering all routes (16ms)`. Filtered routes: `/`, `/about`, `/brand`, `/gallery` | 0 / 2 |
| css-background | `public/bg.png` | `/gallery` (regression 100%) | `untraced static asset public/bg.png — rendering all routes (20ms)` | 0 / 1 |
| font-file | `public/fonts/brand.woff` | none. 4 / 4 routes pass, diff percentage 0 | `untraced static asset public/fonts/brand.woff — rendering all routes (16ms)` | 0 / 0 |

Omission total: 0 / 4 observable routes. The font-file change was not pixel-observable on full capture, so its denominator is 0 and it is not a comparator miss. Full capture's own reason on every scenario was `smart rendering disabled (0ms)`. On these four scenarios the filtered arm did not drop an observable route. That count is this fixture only.

`update-baselines` for the selection baseline exited with stdout that was not a run JSON (`updateBaselinesEmittedRunJson` false).

## External repos

The denominator is the five names in `validation/repos.json`. A repo that does not boot stays in it. Time box was 1200s. All five were attempted. None were left unattempted for the time box. Counts are recheck diffs with `FRONTGUARD_DISABLE_BYTE_COMPARE=1`. `aiEnabled` in the written JSON is false. Browser on every scored diff is `chromium`.

| Repo | What happened |
| --- | --- |
| taxonomy | Did not boot. Next failed to load `next.config.mjs`: invalid environment variables `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PLAN_ID`, `NEXT_PUBLIC_APP_URL`. No recheck JSON. |
| tailwind-dashboard | Booted. Recheck 12 / 12 diffs pixelmatch, `hasBaselineImage` true, pass, diff percentage 0, regression 0, changed 0, `ssimOverride` 0. Routes `/`, `/dashboard`, `/dashboard/settings`, `/dashboard/analytics` at 375, 768, and 1440. |
| chakra-ui-docs | Booted. Recheck of `/` exited non-zero. The harness then replaced that stdout with `{"error":"frontguard run failed"}`, so the 3 viewport diffs for `/` are unscored. They are not passes and they are not counted regressions. Button, modal, and getting-started are 9 / 9 pass, pixelmatch, diff percentage 0, `ssimOverride` 0. The harness now keeps a JSON stdout when the exit status is non-zero. `/` was not re-run. |
| medusa-storefront | Did not boot. The dev server exited missing `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`. No recheck JSON. |
| nextra-docs | Did not boot. `pnpm dev` built workspace packages and did not bind `http://localhost:3000` within the wait. No recheck JSON. |

Booted 2 / 5. Scored external recheck diffs: 21 (12 + 9). Gate false positives on those scored diffs: regression 0 / 21, changed 0 / 21, `ssimOverride` 0 / 21. The unscored chakra `/` route is outside that 21.

The v0.2 note's pixel-only false-positive rate of 0.0% is two of five repos, Chromium, one macOS host, AI off, no true-positive arm, SSIM not exercised, CLI 0.2.0 (`validation/results-v0.2.md`, 2026-06-20). This run does not replace that sentence and does not publish a new rate.

## Baseline command and what did not run

Fixture `update-baselines` was invoked without `--output json`. It exited 0, wrote 33 baselines, and its stdout was 1175 bytes that did not parse as a run JSON (`emittedRunJson` false). The external harness passed `--output json` together with `--update-baselines` and stored a `baselineUpdate: true` document whose diffs are status `new`. Those baseline diffs are not the false-positive count.

Firefox did not run. WebKit did not run. No AI table was filled. WebdriverIO's ±3% is not a result from this run. Earlier fixture invocations blocked the in-process static server and every capture timed out waiting for `networkidle`; those error counts are not in the tables above.

JSON for this run is `validation/results/pixel-285/summary.json` and `validation/results/pixel-285/external/`. The v0.2 files in `validation/results/*.json` were not overwritten.
