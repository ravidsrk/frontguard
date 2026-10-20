# Dependency PR review: 2026-10-20

Reviewed the nine open Dependabot PRs against `main` at `e0748ed`.
Their overlapping lockfile edits are consolidated into one change so React,
the test runner and browser dependencies can be verified together.

| PR | Disposition in the consolidation | Review finding |
| --- | --- | --- |
| #311 | Playwright and test runner 1.64.1 | The original update left both Docker images, the Daytona base and pin tests at 1.63.0. Launch-example compilation also depended on a hoisted `@playwright/test`. Align the image pins and declare the root test dependency. |
| #312 | Vite React plugin 6.1.2 | Patch fixes to HMR and compiler diagnostics. The app does not configure the optional React compiler. Build and local Worker smoke checks cover the installed configuration. |
| #313 | Zod 4.6.7 | Schema tests and typecheck pass. Checked the maintainer's cleanup PR and the package's published provenance metadata; the release notes say the reverted malicious main-branch commits were never published to npm. This update is not presented as a security fix. |
| #314 | Vitest and coverage provider 5.0.5 | The runner was already on 5.x with a 4.1.11 coverage provider and an invalid peer dependency. Align both packages, and declare the provider at the root so the hoisted runner can load it. |
| #315, #317 | React/React DOM 19.3.1; both type packages 19.3.0 | Both original PRs fail clean installation because the root overrides still pin 19.2.7. Update the pair and overrides atomically, then deduplicate to one runtime. |
| #316 | jest-dom 7.0.1 | Its required DOM peer is already present and its Node 22 minimum matches this repository. Existing web tests pass. |
| #318 | jsdom 30.1.3 | Includes selector/computed-style fixes. Existing web tests pass with the updated selector dependency. |
| #319 | typescript-eslint 8.72.0 | Reviewed the requested 8.71.2 update and the newer 8.72.0 release selected during resolution. The original CI failure is a dashboard test waiting on live DNS. Stub that test's two DNS fixture names while retaining the real URL validator. |

Dependabot now groups React with React DOM and their types, and Vitest with its
companion packages. Root overrides still require deliberate review when changing
React versions; grouping does not replace that review.

## Browser upgrade evidence

Used the actual `renderPages` implementation on the unchanged static fixture app:
home, about and pricing at widths 375, 768 and 1440, with viewport height 720.
Smart rendering, frozen time, seeded randomness, stability checks and sensitive
redaction were enabled. Captured every case twice under each version.

- Before: Playwright 1.63.0, Chromium 153.0.8010.12, browser revision 1243.
- After: Playwright 1.64.1, Chromium 156.0.8078.4, browser revision 1248.
- Host: Ubuntu 24.04, Linux ARM64, with temporary user-space browser libraries.
- All nine cases have identical dimensions and decoded RGBA bytes across the
  upgrade. Repeat comparisons also have zero differing pixels.

The pre-existing revision-1248 cache contained the same binary as revision 1243,
despite its directory name. It was excluded from the final comparison. The new
browser was downloaded into an isolated temporary cache and its runtime version
was checked against Playwright's browser metadata.

[Per-case results](renderer-comparison-2026-10-20.json) record the measured values.
This is a small Chromium compatibility check on one host, not cross-OS, Firefox
or WebKit validation. It does not replace #285's mutation benchmark or #303's
baseline provenance work. No accepted baselines were changed.

## Verification

- Clean npm install, and `npm ls` confirms one React/React DOM runtime, aligned
  Playwright/test packages and matching Vitest/coverage versions.
- Build, lint, typecheck, version sync and docs-link checks pass.
- The production Worker build serves home, docs, pricing, privacy, terms and
  status locally through Wrangler with HTTP 200, working docs navigation and
  no browser page errors under React 19.3.1.
- Full workspace tests: 2,100 passed; three browser tests were skipped locally
  by the existing binary-path heuristic. Those three pass when run separately
  through the suite's CI branch with the freshly downloaded browser.
- CLI e2e: six passed, two Docker cases skipped because the local Docker daemon
  is unavailable. The official 1.64.1-jammy image manifest includes amd64 and
  arm64; the PR's CI e2e job must validate the image build.
- The V8 coverage smoke run passes all 13 pixel tests with the 5.0.5 provider.
  Its 92.59% statement coverage concerns only `src/diff/pixel.ts`.
- Production npm audit: zero vulnerabilities.

Primary release references: [Playwright 1.64.1](https://github.com/microsoft/playwright/releases/tag/v1.64.1),
[React 19.3.1](https://github.com/react/react/releases/tag/v19.3.1),
[typescript-eslint 8.72.0](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.72.0),
and [Zod cleanup #6620](https://github.com/colinhacks/zod/pull/6620).
