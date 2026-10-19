# Frontguard Roadmap

*Last updated: 2026-10-19. Anchored to [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) (frozen local-and-CI launch contract), [`docs/completion/SHIPLOG.md`](./completion/SHIPLOG.md) (launch gate **GO** on `2026-10-19`), and the post-launch research & issue backlog tracked in [#283](https://github.com/ravidsrk/frontguard/issues/283) ([#284](https://github.com/ravidsrk/frontguard/issues/284)–[#299](https://github.com/ravidsrk/frontguard/issues/299)).*

> **Status note (2026-10-19):** Source is at **v0.2.3** (`0.2.2` published on npm with unreleased changelog entries ahead of that tag). The binding launch gate in [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) is **GO**: `main` is green across `lint`, `build`, `test` (Node 22 & 24), `e2e`, `audit`, and `docs-links`; `frontguard.dev` and `www.frontguard.dev` serve the live `frontguard-web` Worker with `/privacy`, `/terms`, and `/status` returning HTTP 200 and no unbuilt `$29` hosted tier advertised on `/pricing`; D1 Time Travel restore, Worker rollback, and the red-`main` CI failure alert (`#280`) have all been verified with captured evidence.
>
> **Supersession of the `2026-06-29` roadmap:** Earlier revisions of this file described `packages/cloud-api`, Stripe billing, and the GitHub App / Slack / Vercel / Netlify integrations as a live, shipped cloud platform and listed `$29/mo Pro` / `$49/mo Monitoring` / `$99/mo Business` pricing. Per [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) §0 and §4, Frontguard's completed scope is an **excellent local-and-CI visual regression CLI**. The cloud service and marketplace integrations exist as **source in this repository** and are **not deployed** (`api.frontguard.dev` does not resolve; hosted plans are not generally available). Deploying `cloud-api` is forbidden until the three hard gates in [#293](https://github.com/ravidsrk/frontguard/issues/293) are closed.

---

## 1. Strategic Thesis & 2026 Research Grounding

Visual regression testing fails in practice when teams either drown in subpixel rendering noise or hand pass/fail authority to an uncalibrated model that silently waves through real regressions.

Checked on **2026-10-19** across GitHub projects, arXiv papers, and practitioner posts on X:

1. **Deterministic `pixelmatch` stays the only pass/fail gate:**
   - **GitHub landscape (2026-10-19):** Maintained local options remain Playwright's `toHaveScreenshot` (backed by `pixelmatch`, per-pixel `threshold` default `0.2`), BackstopJS (`6.3.25`, Resemble.js `misMatchThreshold: 0.1%`, seeking maintainer), and `reg-suit` (comparison CLI expecting caller-supplied images and external object storage). `lost-pixel/lost-pixel` was archived on **22 April 2026** when the team joined Figma (last release `v3.22.0` on `2024-11-14`), `storybookjs/test-runner` was archived on **30 September 2026**, and Loki has not released since **August 2024** (`v0.35.1`). Commercial platforms (Argos, Happo, Chromatic, Percy, Applitools) differentiate on hosted multi-user review workflows and object storage; Argos itself uses deterministic `odiff` pixel comparison rather than an AI pass/fail gate and states that self-hosting is not officially supported.
   - **Academic papers (2025–2026):**
     - **WUICC-bench** (*Beyond Pixel Diffs*, [`arXiv:2607.01728v1`](https://arxiv.org/abs/2607.01728), July 2026; 9,906 human-verified synthetic single-rule edits on WebSight HTML): naive pixel diffing scores `0.00%` no-change accuracy and `100%` change recall on visible non-meaningful edits, while trained image-difference captioners (SEN `96.27% / 96.16%`, ICT-Net `97.01% / 93.80%`, RSICCformer `85.82% / 95.33%`, RMNet `97.39% / 93.55%`) still miss **3.8%–6.5%** of meaningful single edits and achieve low caption BLEU-4 ($\le 0.2571$). Zero-shot VLMs either fail to suppress noise (Llama-3.2-11B-Vision-Instruct `21.64% / 79.39%`) or miss a third of meaningful regressions (Qwen2-VL-7B-Instruct `99.63% / 65.68%`).
     - **LLMShot** ([`arXiv:2507.10062v2`](https://arxiv.org/abs/2507.10062), July 2025; 17 forced iOS XCTest failures on Gemma 3 4B/12B): 12B precision is only `66.67%` (F1 `74.42%`), the semantic-diff scalar swings wildly across model sizes (`0.921 ± 0.046` on 4B vs `0.079 ± 0.079` on 12B), and prompt-based ignore rules collapse (`13.79%` and `16.67%` F1 on 4B).
     - **VisRefiner** ([`arXiv:2602.05998v1`](https://arxiv.org/abs/2602.05998), Feb 2026) is a screenshot-to-code trainer whose self-refinement is non-monotone across models, and **XBIDetective** ([`arXiv:2512.15804v1`](https://arxiv.org/abs/2512.15804), ICSE-SEIP 2026) reaches `79%` accuracy on cross-browser pairs with ongoing dynamic-content false positives.
   - **Practitioner signals on X (2025-01 to 2026-10-19):** Useful operational warnings center on three rules: (a) pin the browser binary to the Playwright dependency rather than relying on drifting CI runner browsers, (b) do not rely on a single global whole-image ratio (`pixelmatch v8.0.0`, published **6 October 2026**, adds OKLab + HyAB color delta and `windowSize` to separate scattered anti-aliasing noise from localized edits), and (c) never let the AI agent that edited the UI be the sole unconfirmed approver of the new baseline (treat baseline promotion like merge rights).

2. **Frontguard's architectural position:**
   - **Pass/fail is deterministic:** `pixelmatch` (with deterministic `ssimFallback` override when structural similarity clears `ssimThreshold: 0.98` and no severe local cluster exists) controls exit codes `0 / 1 / 2`.
   - **AI is advisory and grounded:** Vision models classify diffs after a pixel failure, attribute spatial diff clusters to DOM selectors, and propose CSS fixes that are re-rendered in an isolated sandbox — but model output never silently passes a failing pixel check or overwrites a baseline.

---

## 2. What Is Shipped & Verified (`v0.1`–`v0.2.3`)

Everything below ships in the published local-and-CI packages (`@frontguard/cli`, `@frontguard/playwright`, `@frontguard/mcp`, `create-frontguard-plugin`, and `action.yml`) and is covered by the green CI pipeline and launch-gate evidence.

### Core CLI & Deterministic Diff Engine (`@frontguard/cli`)
- ✅ **Pixelmatch gate + perceptual SSIM (`diff/pixel.ts`, `diff/ssim.ts`)** — `compareScreenshot` uses `pixelmatch` as the pass/fail gate with exit codes `0` (pass / warning), `1` (regression / new page), and `2` (tool / config error). Default CLI `threshold` is `0.1` (meaning `10%` of pixels across the image, distinct from Playwright's per-pixel `0.2`), overridable per route (`routes: [{ path, threshold, ignore, viewport }]`). Includes full SSIM, chroma-SSIM, CW-SSIM, `ssimFallback: true` (`ssimThreshold: 0.98`), connected-component 8-neighbor spatial diff clustering, and DOM bounding-box selector attribution.
- ✅ **Deterministic anti-flake controls (`render/stability.ts`, `docker/`)** — Capture-time `freezeTime`, Mulberry32 `seedRandom`, `blockUrls` network abort guard, `waitForStability` consecutive-frame convergence, `redactSensitive` input masking, and CSS selector / coordinate `ignore` masks. Optional multi-render consensus (`antiFlakeRenders`, default `1` in practice; opt-in `3+` renders via `findConsensusScreenshot()`), plus the pinned `linux/amd64` Docker renderer source (`packages/cli/Dockerfile`). *(Correction to the `2026-06-29` roadmap: `antiFlakeRenders` defaults to `1`, not `3`.)*
- ✅ **Framework & Storybook discovery (`discovery/`)** — Filesystem route discovery for Next.js (App & Pages Router), Remix, SvelteKit, and Nuxt; Storybook 8 `/index.json` and Storybook 7 `/stories.json` discovery; live BFS crawler fallback; and `smartFilter` changed-file route scoping (with automatic all-routes fallback; note that the README `"12/47 routes affected by changed files"` line is illustrative sample CLI output, not a benchmark measurement).
- ✅ **Multi-viewport & multi-browser capture (`render/`)** — Default `375 / 768 / 1440` viewports; `chromium` by default with `firefox` and `webkit` supported via `config.browsers`.
- ✅ **Git orphan-branch baselines (`storage/git-orphan.ts`)** — Stores baseline PNGs and SHA-256 manifest on an isolated `frontguard-baselines` git orphan branch via temporary worktrees so `main` stays free of binary bloat.
- ✅ **Interactive local HTML workbench & PR reporter (`report/html.ts`, `report/github-pr.ts`)** — Self-contained 4-mode HTML diff inspector (`packages/cli/src/report/html.ts`, 1,403 lines) with Side-by-Side, Swipe Curtain, Onion Skin, Diff Heatmap, spatial cluster table, and keyboard navigation; plus GitHub PR Markdown comments with `renderImageGrid()` thumbnails backed by `imageUpload` (Cloudflare R2, AWS S3, GitHub Actions artifacts, or local disk).
- ✅ **CLI commands & onboarding (`cli/`)** — `init`, `doctor` (Node, browser, config, and git diagnostics), `run`, `update-baselines`, `monitor` (`--once`, `--watch`/`--interval`, `--history`, webhook alerts), `accept-fix`, `reject-fix`, `export-patterns`, and `plugin`.
- ✅ **5 built-in plugins & 9 lifecycle hooks (`plugins/`, `create-frontguard-plugin`)**:
  1. **Accessibility (`plugins/accessibility.ts`)** — `@axe-core/playwright` WCAG audit in the same render pass (`failOnImpact`, findings fused into optional AI analysis prompts).
  2. **Performance budgets (`plugins/perf-budgets.ts`)** — LCP, CLS, FCP, TTFB, and transfer-size budgets correlated inline with visual diffs and run-over-run regressions (`trackRegressions`).
  3. **Third-party scripts (`plugins/third-party-scripts.ts`)** — Inventories external `<script src>` origins per route and flags newly added or removed third-party domains.
  4. **Figma design compliance (`plugins/figma.ts`)** — Compares live rendered routes against exported Figma frames.
  5. **Production URL monitor (`plugins/monitor.ts`)** — Scheduled or one-shot live URL drift checks with webhook/Slack alerting.
- ✅ **Optional BYOK AI triage, sandbox fix verification & experimental judge (`diff/ai-classifier.ts`, `diff/ai-fix.ts`, `diff/model-judge.ts`, `sandbox/`, `storage/fix-patterns.ts`)** — Multi-provider BYOK vision analysis (OpenAI, Anthropic, Gemini, custom `baseUrl`), candidate CSS patch generation with local Playwright (`sandbox/local.ts`) or Daytona (`sandbox/daytona.ts`) re-render verification, local SQLite fix-pattern store (`accept-fix` / `reject-fix` / `export-patterns`), and opt-in experimental judge mode (`--mode judge --experimental`).
- ✅ **Demo & comparison guides (`demo/`, `apps/web/src/lib/docs-content.ts`)** — Committed `demo/frontguard-demo.gif` and `demo/frontguard-demo.svg` assets, plus comparison and migration guides (`frontguard-vs-percy`, `frontguard-vs-chromatic`, `migrate-from-backstopjs`, `migrate-from-lost-pixel`). *(Closes the `2026-06-29` roadmap's demo-recording follow-up.)*

### Playwright In-Test Package (`@frontguard/playwright`)
- ✅ `visualTest()` and `expectVisual()` assertions with `__visual_baselines__/` storage, SSIM calculation, connected-component cluster extraction, DOM selector attribution, `mask` / `maskRegions`, `redactSensitive`, `freezeTime`, `seedRandom`, `blockUrls`, `waitForStable`, and `captureAriaSnapshot`.

### Agentic MCP Server (`@frontguard/mcp`)
- ✅ Stdio JSON-RPC 2.0 server exposing `list_regressions`, `inspect_diff_cluster_dom`, `get_suggested_fix`, `verify_css_patch`, `promote_baseline` (requires `confirm_reviewed: true` and refuses unconfirmed local-report orphan-branch overwrites), `accept_baseline`, and `recent_runs`, operating in both zero-cloud local `report.json` mode and Cloud API mode.

---

## 3. Source-in-Repo — Gated & Not Deployed in Production

Per [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) §4, the following subsystems exist as tested source code in the monorepo but are **not deployed as live production services** and must not be advertised as generally available until their post-launch gates are met:

- 🔒 **`packages/cloud-api` (Hono / Cloudflare Worker, D1, R2, GitHub OAuth, Cron scheduler, Slack/email/PagerDuty alerting, hand-rolled OTLP/HTTP exporter in `src/otel/index.ts`)** — Not deployed (`api.frontguard.dev` does not resolve). Hard-gated on [#293](https://github.com/ravidsrk/frontguard/issues/293): (a) user-data erasure path, (b) restore-tested backup, and (c) fixing the run-status path so a run can never report `completed` without having compared.
- 🔒 **Stripe billing & hosted pricing tiers (`packages/cloud-api/src/billing/`)** — Source only; no live money path. Public `/pricing` on `frontguard.dev` states that hosted plans are not generally available.
- 🔒 **Third-party marketplace listings (`integrations/github-app`, `integrations/slack-app`, `integrations/vercel`, `integrations/netlify`)** — Handler source and tests live in `integrations/*`; external marketplace listings (`CF-06`) and production cloud hooks remain deferred until `cloud-api` clears [#293](https://github.com/ravidsrk/frontguard/issues/293).

---

## 4. Post-Launch Roadmap (Tracked in GitHub Issue [#283](https://github.com/ravidsrk/frontguard/issues/283))

All actionable post-launch engineering work is tracked in GitHub under parent issue [#283](https://github.com/ravidsrk/frontguard/issues/283) (*"Post-launch roadmap: keep pixelmatch as the only pass/fail gate"*), ordered into **Now**, **Next**, and **Later**.

### Now — Protect the `pixelmatch` Gate & Approval Boundary

1. **[#284](https://github.com/ravidsrk/frontguard/issues/284) — Measure small-text misses under the 10% pixel budget and adopt `pixelmatch` 8 as the same gate**
   - **Problem:** Frontguard's default `threshold: 0.1` is a `10%` whole-image pixel ratio (unlike Playwright's per-pixel `0.2`), which can classify a small copy or icon regression as `changed` (exit `0`). Meanwhile, the lockfile resolves `pixelmatch@7.2.0` while `pixelmatch@8.0.0` (published `2026-10-06`) adds OKLab + HyAB perceptual color delta and `windowSize` to separate scattered anti-aliasing speckle from localized regressions.
   - **Scope:** Upgrade to `pixelmatch@8.0.0`, test `windowSize` + OKLab/HyAB against scattered anti-alias noise vs. small text/icon edits, document `threshold` units vs. Playwright, measure `ssimOverride` flip frequency, and document browser binary pinning in CI.

2. **[#285](https://github.com/ravidsrk/frontguard/issues/285) — Re-run pixel validation on the current tree with true-positive fixtures**
   - **Problem:** `validation/results-v0.2.md` (`2026-06-20`) measured `0.0%` pixel false-positive rate on CLI `0.2.0` across 2 of 5 repos (`39/43` routes with baseline), Chromium only, one macOS host, AI off, `ssimFallback` unexercised, and no true-positive arm.
   - **Scope:** Extend `validation/run-external.sh` with intentional visual regression fixtures so true-positive recall and `ssimOverride` activations are recorded alongside false positives on the current `v0.2.3+` tree, preserving all v0.2 caveats whenever `0.0%` is cited.

3. **[#286](https://github.com/ravidsrk/frontguard/issues/286) — Publish an advisory judge evaluation and keep model output off exit codes**
   - **Problem:** `--mode judge --experimental` is unmeasured in-repo (`G-22`), and external benchmarks (WUICC-bench `arXiv:2607.01728`, LLMShot `arXiv:2507.10062`, VisRefiner `arXiv:2602.05998`, XBIDetective `arXiv:2512.15804`) show vision models and prompt-ignore rules cannot safely replace a pixel gate.
   - **Scope:** Publish an in-repo evaluation protocol reporting no-change accuracy and change recall separately, keep judge output strictly advisory (never altering exit codes `0 / 1 / 2` or promoting baselines), and reject scalar semantic-diff thresholds or prompt-ignore suppression.

4. **[#287](https://github.com/ravidsrk/frontguard/issues/287) — Separate baseline writes from the agent that edited the UI**
   - **Problem:** While MCP `promote_baseline` requires `confirm_reviewed: true` and refuses local-report mode, `confirm_reviewed` is a self-asserted boolean and CLI `frontguard update-baselines` has no confirmation gate. An autonomous coding agent with shell access can edit UI code and run `frontguard update-baselines` to rubber-stamp its own regression.
   - **Scope:** Require explicit human confirmation or a separate write credential on baseline promotion paths, ensure judge mode cannot trigger baseline writes, and document baseline promotion as equivalent to merge rights.

5. **[#288](https://github.com/ravidsrk/frontguard/issues/288) — Block baseline updates on new serious `axe-core` violations**
   - **Problem:** Frontguard ships `@axe-core/playwright` (`plugins/accessibility.ts`, `failOnImpact: 'serious'`), but accessibility violations do not currently block baseline promotion (`update-baselines` / `promote_baseline`), allowing a pixel-clean accessibility regression to be laundered into a baseline.
   - **Scope:** Refuse baseline promotion when the accessibility plugin detects new violations at or above `failOnImpact`, while keeping `pixelmatch` as the image pass/fail comparator.

### Next — Component Runner Supply Gap & CLI Maintenance

6. **[#289](https://github.com/ravidsrk/frontguard/issues/289) — Discover Ladle and Histoire stories, and warn when the capture runner changes**
   - **Problem:** With `lost-pixel/lost-pixel` archived (`2026-04-22`), `storybookjs/test-runner` archived (`2026-09-30`), and Loki inactive since August 2024, there is a supply gap for a maintained MIT CLI that discovers **Ladle** and **Histoire** component stories alongside Storybook.
   - **Scope:** Add local Ladle and Histoire story index discovery feeding the existing `pixelmatch` pipeline, and emit a baseline-invalidation warning when the capture runner changes (citing the 1px runner-switch drift report).

7. **[#290](https://github.com/ravidsrk/frontguard/issues/290) — Prune PNG history on the `frontguard-baselines` orphan branch**
   - **Problem:** `frontguard-baselines` keeps binary PNGs off `main`, but accumulating historical baseline commits over time bloats the orphan branch (`G-41`).
   - **Scope:** Add a documented CLI retention command to truncate old PNG commit history on `frontguard-baselines` while preserving the current accepted baseline for every route/viewport/browser, verified by a post-prune comparison test.

8. **[#291](https://github.com/ravidsrk/frontguard/issues/291) — Split `pipeline.ts` at 1,422 lines and drop the stale `index.tsx` refactor**
   - **Problem:** `DEFINITION.md` §4 (`G-39`) cited `packages/cli/src/core/pipeline.ts` at 1,328 lines and `apps/web/src/routes/index.tsx` at 1,811 lines. On the current tree, `index.tsx` is already refactored to **91 lines**, whereas `pipeline.ts` measures **1,422 lines**.
   - **Scope:** Modularize `packages/cli/src/core/pipeline.ts` without changing `pixelmatch`, `ssimOverride`, `smartFilter`, or judge behavior, retire the obsolete `index.tsx` task, and label the README `"12/47 routes"` snippet as sample output.

9. **[#292](https://github.com/ravidsrk/frontguard/issues/292) — Enforce coverage thresholds in the CLI Vitest config**
   - **Problem:** `packages/cli/vitest.config.ts` does not enforce coverage thresholds (`G-40`).
   - **Scope:** Ratchet `packages/cli/vitest.config.ts` coverage thresholds from the current tree's measured coverage after the **Now** tests land.

### Later — Gated Hosted Differentiators & Non-Gating Artifacts

10. **[#293](https://github.com/ravidsrk/frontguard/issues/293) — Close the three `cloud-api` deployment gates without deploying**
    - **Scope:** Prerequisite gate from `DEFINITION.md` §4 before any `cloud-api` deployment: (1) verify/fix the run-status path (`daytona-runner.ts` / `processor.ts`, `G-34`) so a run never reports `completed` without a comparison, (2) implement and demonstrate user-data erasure across baselines and reports, and (3) demonstrate a restore-tested backup verified against source data. Does **not** deploy `api.frontguard.dev` or enable billing.

11. **[#294](https://github.com/ravidsrk/frontguard/issues/294) — Design a hosted review UI only after the `cloud-api` gates *(blocked by [#293](https://github.com/ravidsrk/frontguard/issues/293))***
    - **Scope:** Multi-user PR visual review and approval UI design, strictly gated behind [#293](https://github.com/ravidsrk/frontguard/issues/293), enforcing the same human-confirmation and `axe-core` promotion blocks as local CLI/MCP workflows while keeping `pixelmatch` as the pass/fail signal.

12. **[#295](https://github.com/ravidsrk/frontguard/issues/295) — Design S3-backed baseline storage only after the `cloud-api` gates *(blocked by [#293](https://github.com/ravidsrk/frontguard/issues/293) and [#290](https://github.com/ravidsrk/frontguard/issues/290))***
    - **Scope:** Object-storage baseline backend design (distinct from `imageUpload`, which already uploads PR diff thumbnails to R2/S3), gated on solving git orphan retention ([#290](https://github.com/ravidsrk/frontguard/issues/290)) and closing the `cloud-api` gates ([#293](https://github.com/ravidsrk/frontguard/issues/293)).

13. **[#296](https://github.com/ravidsrk/frontguard/issues/296) — Add CLI OpenTelemetry without deploying the `cloud-api` exporter**
    - **Scope:** Optional local CLI spans/timings for capture and comparison (`G-38`), off by default and never exporting screenshot bytes, documented separately from the existing `packages/cloud-api/src/otel/index.ts` worker exporter.

14. **[#297](https://github.com/ravidsrk/frontguard/issues/297) — Audit `apps/web` accessibility separately from the CLI `axe-core` plugin**
    - **Scope:** Automated `axe-core` and keyboard-navigation verification against the built `apps/web` marketing and docs routes (`G-42`).

15. **[#298](https://github.com/ravidsrk/frontguard/issues/298) — Surface aged ignore masks for a human to drop *(explicit bet, weak external evidence)***
    - **Scope:** Optional CLI report listing `ignore` selectors/regions older than a configured age so a human can review and remove stale masks (never auto-unmasked by a model or flake heuristic).

16. **[#299](https://github.com/ravidsrk/frontguard/issues/299) — Add optional ARIA and non-image text snapshots that do not gate pixels**
    - **Scope:** Optional sidecar ARIA tree / JSON / Markdown text diffing alongside PNG captures, reported separately without altering `pixelmatch` pass/fail status or replacing `axe-core`.

### Ongoing Operations & Hardening Tracked Separately

- **[#157](https://github.com/ravidsrk/frontguard/issues/157) — Weekly npm audit (production tree):** Automated weekly production dependency audit workflow.
- **H-05 / G-44 — npm trusted publishing (OIDC without `NPM_TOKEN`):** Recorded in [`docs/completion/HUMAN_ACTIONS.md`](./completion/HUMAN_ACTIONS.md) and [`docs/completion/GAPS.md`](./completion/GAPS.md) with expiry **2027-03-01** (current release workflow already enforces tag/version match, `main` ancestry, green CI on exact SHA, and npm OIDC provenance attestation).

---

## 5. What Is Deliberately Not On This Roadmap

- **Replacing `pixelmatch` with `odiff`, `Resemble.js`, a perceptual hash, or a VLM pass/fail gate:** No benchmark in the 2026 literature shows `odiff` or `Resemble.js` outperforming `pixelmatch` on UI accuracy, and WUICC-bench / LLMShot demonstrate why VLMs and prompt-ignore rules cannot serve as a deterministic regression gate.
- **Re-filing already-shipped local capabilities:** SSIM / chroma-SSIM / CW-SSIM (`ssimFallback`), Storybook `/index.json` discovery, CSS & coordinate ignore masks, `@axe-core/playwright` plugin, anti-flake controls (`freezeTime`, `seedRandom`, `blockUrls`, `waitForStability`), Firefox & WebKit capture, `smartFilter` changed-file scoping, local MCP `report.json` inspection, experimental judge mode, the external validation harness, and the 4-mode HTML diff report already ship.
- **Stale god-file refactors (`apps/web/src/routes/index.tsx`, `html.ts`, `docs-content.ts`):** `apps/web/src/routes/index.tsx` is 91 lines; only `packages/cli/src/core/pipeline.ts` (1,422 lines) is tracked for modularization ([#291](https://github.com/ravidsrk/frontguard/issues/291)).
- **Premature cloud deployment, live billing, or marketplace submissions:** Deploying `packages/cloud-api`, turning on Stripe billing, or submitting GitHub App / Slack / Vercel / Netlify marketplace listings stays off the near-term backlog until [#293](https://github.com/ravidsrk/frontguard/issues/293) is closed.
- **Native mobile app screenshots (iOS Simulator / Android Emulator), Puppeteer abstraction, browser extensions, or video-replay diffing:** Different rendering pipelines and audiences that dilute focus from deterministic Playwright-based web visual regression testing.
