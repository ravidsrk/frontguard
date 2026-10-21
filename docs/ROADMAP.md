# Frontguard Roadmap

*Last updated: 2026-10-20. Anchored to [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) (frozen local-and-CI launch contract), [`docs/completion/SHIPLOG.md`](./completion/SHIPLOG.md) (launch gate **GO** on `2026-10-19`), and the post-launch backlog tracked in [#283](https://github.com/ravidsrk/frontguard/issues/283) (children [#284](https://github.com/ravidsrk/frontguard/issues/284)–[#299](https://github.com/ravidsrk/frontguard/issues/299) from the first research pass, [#301](https://github.com/ravidsrk/frontguard/issues/301)–[#310](https://github.com/ravidsrk/frontguard/issues/310) from the second, and [#321](https://github.com/ravidsrk/frontguard/issues/321) from the follow-up). The reports, source notes and query logs are in the [research archive](../reports/README.md).*

> **Status note (2026-10-19):** Source is at **v0.2.3** (`0.2.2` published on npm with unreleased changelog entries ahead of that tag). The binding launch gate in [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) is **GO**: `main` is green across `lint`, `build`, `test` (Node 22 & 24), `e2e`, `audit`, and `docs-links`; `frontguard.dev` and `www.frontguard.dev` serve the live `frontguard-web` Worker with `/privacy`, `/terms`, and `/status` returning HTTP 200 and no unbuilt `$29` hosted tier advertised on `/pricing`; D1 Time Travel restore, Worker rollback, and the red-`main` CI failure alert (`#280`) have all been verified with captured evidence.
>
> **Supersession of the `2026-06-29` roadmap:** Earlier revisions of this file described `packages/cloud-api`, Stripe billing, and the GitHub App / Slack / Vercel / Netlify integrations as a live, shipped cloud platform and listed `$29/mo Pro` / `$49/mo Monitoring` / `$99/mo Business` pricing. Per [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) §0 and §4, Frontguard's completed scope is an **excellent local-and-CI visual regression CLI**. The cloud service and marketplace integrations exist as **source in this repository** and are **not deployed** (`api.frontguard.dev` does not resolve; hosted plans are not generally available). Deploying `cloud-api` is forbidden until the three hard gates in [#293](https://github.com/ravidsrk/frontguard/issues/293) are closed.

---

## 1. Strategic Thesis & 2026 Research Grounding

Visual regression testing fails in practice when teams either drown in subpixel rendering noise or hand pass/fail authority to an uncalibrated model that silently waves through real regressions. In 2026 a third failure mode matters as much: a coding agent that both edits the UI and approves the screenshot that proves it.

Two research passes on **2026-10-19** covered GitHub projects and trackers, arXiv papers, platform and vendor docs, CVEs, and practitioner posts on X. Searches were by category only. Every source cited in the children of [#283](https://github.com/ravidsrk/frontguard/issues/283) was re-fetched and matched to its claim before filing.

A bounded follow-up on **2026-10-20** checked the merged roadmap and open tracker, revisited primary sources, and executed the route-selection reproduction below. The [published reports](../reports/README.md) distinguish historical drafts from accepted scope. The X refresh was blocked by authentication and access errors; earlier X evidence retains its 2026-10-19 date, with no new demand claims from the follow-up.

1. **Deterministic `pixelmatch` stays the only pass/fail gate:**
   - **GitHub landscape (first pass):**
     - Playwright's [`toHaveScreenshot`](https://playwright.dev/docs/test-snapshots) is backed by `pixelmatch`, with a per-pixel `threshold` default of `0.2`.
     - [BackstopJS](https://github.com/garris/BackstopJS/blob/master/README.md) (`6.3.25`) uses Resemble.js with `misMatchThreshold: 0.1%`, and is seeking a maintainer.
     - [`reg-suit`](https://github.com/reg-viz/reg-suit) is a comparison CLI that expects caller-supplied images and external object storage.
     - `lost-pixel/lost-pixel` was archived on **22 April 2026** when the team [joined Figma](https://www.lost-pixel.com/blog/lost-pixel-team-is-joining-figma). Its [last release](https://github.com/lost-pixel/lost-pixel/releases) was `v3.22.0` on `2024-11-14`.
     - [`storybookjs/test-runner`](https://github.com/storybookjs/test-runner) was archived on **30 September 2026**.
     - [Loki](https://github.com/oblador/loki/blob/master/packages/loki/README.md) has not released since **August 2024** (`v0.35.1`).
     - Commercial platforms (Argos, Happo, Chromatic, Percy, Applitools) differentiate on hosted multi-user review and object storage. Argos [uses deterministic pixel diffing, not AI-based comparison](https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences.md).
   - **Academic papers (2025–2026):**
     - **WUICC-bench** (*Beyond Pixel Diffs*, [`arXiv:2607.01728v1`](https://arxiv.org/abs/2607.01728), July 2026; 9,906 human-verified synthetic single-rule edits on WebSight HTML):
       - Naive pixel diffing scores `0.00%` no-change accuracy and `100%` change recall on visible non-meaningful edits.
       - Trained image-difference captioners (SEN `96.27% / 96.16%`, ICT-Net `97.01% / 93.80%`, RSICCformer `85.82% / 95.33%`, RMNet `97.39% / 93.55%`) still miss **3.8%–6.5%** of meaningful single edits, with low caption BLEU-4 ($\le 0.2571$).
       - Zero-shot VLMs either fail to suppress noise (Llama-3.2-11B-Vision-Instruct `21.64% / 79.39%`) or miss a third of meaningful regressions (Qwen2-VL-7B-Instruct `99.63% / 65.68%`).
     - **LLMShot** ([`arXiv:2507.10062v2`](https://arxiv.org/abs/2507.10062), July 2025; 17 forced iOS XCTest failures on Gemma 3 4B/12B):
       - 12B precision is only `66.67%` (F1 `74.42%`).
       - The semantic-diff scalar swings wildly across model sizes (`0.921 ± 0.046` on 4B vs `0.079 ± 0.079` on 12B).
       - Prompt-based ignore rules collapse (`13.79%` and `16.67%` F1 on 4B).
     - **VisRefiner** ([`arXiv:2602.05998v1`](https://arxiv.org/abs/2602.05998), Feb 2026) is a screenshot-to-code trainer whose self-refinement is non-monotone across models.
     - **XBIDetective** ([`arXiv:2512.15804v1`](https://arxiv.org/abs/2512.15804), ICSE-SEIP 2026) reaches `79%` accuracy on cross-browser pairs, with ongoing dynamic-content false positives.
     - **UI-Lens** ([CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_UI-Lens_Assessing_General_MLLMs_Potential_to_Automate_UI_Display_Quality_CVPR_2026_paper.pdf)) finds nine general multimodal models near chance on text overflow (`50.04%`), cropped content (`54.07%`) and container overlap (`54.14%`).
   - **Practitioner signals on X (2025-01 to 2026-10-19).** These are low-reach but consistent:
     - Pin the browser binary to the Playwright dependency rather than relying on drifting CI runner browsers ([@karlhorky](https://x.com/karlhorky/status/2082458846031696091)).
     - Do not rely on a single global whole-image ratio. [`pixelmatch` v8.0.0](https://github.com/mapbox/pixelmatch), published **6 October 2026** ([@mourner](https://x.com/mourner/status/2107473428949414020)), adds OKLab + HyAB colour delta and `windowSize` to separate scattered anti-aliasing noise from localized edits.
     - Switching capture runners shifts baselines: one Storybook runner switch made 16 of 22 shots 1px off ([@gregberge_](https://x.com/gregberge_/status/2110303101538451874)).
     - Never let the agent that edited the UI be the only approver of the new baseline ([@gregberge_](https://x.com/gregberge_/status/2111026114911232398), [@Antoniocoppe](https://x.com/Antoniocoppe/status/2100979189583118650)).

2. **What the second pass added:**
   - **Runners now ship screenshot assertions, with zero-pixel defaults.**
     - Vitest 4 `toMatchScreenshot` (experimental), Playwright, jest-image-snapshot, cypress-visual-regression and the archived Lost Pixel all default to a budget of zero differing pixels. Testplane v9 allows 4 pixels.
     - Lost Pixel's default gate was `pixelmatch`; `odiff` was opt-in.
     - Frontguard's `10%`-of-pixels default is the outlier ([#284](https://github.com/ravidsrk/frontguard/issues/284)).
     - None of these runners ships a local review-and-accept flow, except Testplane's html-reporter. Playwright closed its [accept button](https://github.com/microsoft/playwright/issues/24310) and [review CLI](https://github.com/microsoft/playwright/issues/14883) requests as not planned ([#305](https://github.com/ravidsrk/frontguard/issues/305)).
   - **Hosted vendors converge on approval semantics a git branch can copy.**
     - Baselines are selected from the merge base.
     - Approvals are scoped to a PR and keyed by image content.
     - Visual checks are re-run inside merge queues.
     - GitHub requires the [`merge_group`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) trigger for required checks in a queue ([#304](https://github.com/ravidsrk/frontguard/issues/304), [#306](https://github.com/ravidsrk/frontguard/issues/306)).
   - **Renderers and comparators move under users.**
     - Playwright changed its Chromium screenshot path, moved to Chrome for Testing builds (1.57), and now forwards the device `screen` (1.64).
     - WebdriverIO measured `pixelmatch` 8 moving differing-pixel counts by about −3% to +3% ([#303](https://github.com/ravidsrk/frontguard/issues/303)).
   - **MCP.**
     - Tool annotations are untrusted hints, but clients act on them: VS Code, Codex and Claude decide whether to prompt based on them ([#307](https://github.com/ravidsrk/frontguard/issues/307)).
     - The TypeScript SDK's v1.x line gets fixes for at least six months after v2's 2026-07-27 release, so support can end around 2027-01-27 ([#310](https://github.com/ravidsrk/frontguard/issues/310)).
   - **Prompt injection.**
     - Instructions hidden in pixels reach vision agents ([VPI-Bench](https://arxiv.org/abs/2506.02456); [Brave](https://brave.com/blog/unseeable-prompt-injections/)).
     - AI text rendered into PRs and chats has been an exfiltration channel in other tools ([CamoLeak](https://www.legitsecurity.com/blog/camoleak-critical-github-copilot-vulnerability-leaks-private-source-code), [CVE-2026-14898](https://nvd.nist.gov/vuln/detail/CVE-2026-14898)).
     - The pixel gate is unaffected. Two related hardening items are tracked privately per [`SECURITY.md`](../SECURITY.md).
   - **Layout research.**
     - DOM geometry reliably finds one class of layout failure: viewport protrusion was human-visible in 32 of 57 ReDeCheck reports ([VERVE](https://eprints.whiterose.ac.uk/165542/8/stvr.1756.pdf)).
     - Raw collision and element-protrusion lists were mostly invisible to humans ([#308](https://github.com/ravidsrk/frontguard/issues/308)).
   - **Demand is thin.**
     - X had no posts on merge queues, single-mode suites, or agents regenerating baselines.
     - The largest GitHub demand sits in Playwright's tracker, where maintainers closed it as not planned: environment-consistent baselines (about 243 👍) and review-and-accept (about 149 👍).

3. **Frontguard's architectural position:**
   - **Pass/fail is deterministic.** `pixelmatch` controls exit codes `0 / 1 / 2`. A deterministic `ssimFallback` override applies when structural similarity clears `ssimThreshold: 0.98` and no severe local cluster exists.
   - **AI is advisory and grounded.** Vision models classify diffs after a pixel failure, attribute spatial diff clusters to DOM selectors, and propose CSS fixes that are re-rendered in an isolated sandbox. On the default compare path, model output never passes a failing pixel check or overwrites a baseline.
     - Experimental judge mode (`--mode judge --experimental`) reads no baselines. Its notes are advisory and do not set exit `1`. The protocol is [`docs/judge-protocol.md`](./judge-protocol.md). This repo has not published a Frontguard judge accuracy figure ([#286](https://github.com/ravidsrk/frontguard/issues/286)).
   - **Approval belongs to a human.** The shipped agent skill and the Action do not enforce that yet ([#287](https://github.com/ravidsrk/frontguard/issues/287)).

4. **The follow-up found a route-selection gap.**
   - Changing a public SVG used by `/` alongside a source edit to `/about` selects only `/about`. The real parser and resolver reproduced the omission at `main` commit `1eef667`; the empty-set fallback does not protect a nonempty but incomplete selection ([#321](https://github.com/ravidsrk/frontguard/issues/321), [executable evidence](../research_notes/Frontguard%20roadmap%20follow-up/smart-filter-repro.mjs)). No browser or end-to-end CLI verdict was measured.
   - [Chromatic documents external assets that escape dependency tracing](https://docs.chromatic.com/docs/turbosnap/setup/). [The empirical VRT study](https://arxiv.org/html/2608.07020v1) reports non-local regressions; its review-time associations do not establish causality. #285 must measure omitted observable mutations separately from pixel-comparator misses.
   - [VISTA](https://arxiv.org/html/2605.26144v1) and [UI2App](https://arxiv.org/html/2607.06306v1) separately assess visual resemblance and interaction behavior in generated apps. They support keeping evaluation dimensions separate, without validating a replacement regression gate. Their limits and relevance are recorded in the [follow-up report](../reports/Frontguard%20roadmap%20follow-up.md).

---

## 2. What Is Shipped & Verified (`v0.1`–`v0.2.3`)

Everything below ships in the published local-and-CI packages (`@frontguard/cli`, `@frontguard/playwright`, `@frontguard/mcp`, `create-frontguard-plugin`, and `action.yml`) and is covered by the green CI pipeline and launch-gate evidence.

### Core CLI & Deterministic Diff Engine (`@frontguard/cli`)
- ✅ **Pixelmatch gate + perceptual SSIM (`diff/pixel.ts`, `diff/ssim.ts`)**
  - `compareScreenshot` uses `pixelmatch` as the pass/fail gate, with exit codes `0` (pass / warning), `1` (regression / new page) and `2` (tool / config error).
  - The default CLI `threshold` is `0.1`, meaning `10%` of pixels across the image, unlike Playwright's per-pixel `0.2`. It can be overridden per route (`routes: [{ path, threshold, ignore, viewport }]`).
  - Includes full SSIM, chroma-SSIM, CW-SSIM, `ssimFallback: true` (`ssimThreshold: 0.98`), connected-component 8-neighbour spatial diff clustering, and DOM bounding-box selector attribution.
- ✅ **Deterministic anti-flake controls (`render/stability.ts`, `docker/`)**
  - Capture-time `freezeTime`, Mulberry32 `seedRandom`, the `blockUrls` network abort guard, `waitForStability` consecutive-frame convergence, `redactSensitive` input masking, and CSS selector / coordinate `ignore` masks.
  - Optional multi-render consensus: `antiFlakeRenders`, default `1` in practice, with opt-in `3+` renders via `findConsensusScreenshot()`, which keeps the most common byte-identical frame.
  - Source for a pinned `linux/amd64` Docker renderer (`packages/cli/Dockerfile`).
  - *(Correction to the `2026-06-29` roadmap: `antiFlakeRenders` defaults to `1`, not `3`.)*
- ✅ **Capture options (`render/playwright.ts`)** — Per-route `actions`, a single `colorScheme` per route or per run, Playwright `storageState` auth, and `workers` concurrency (default `4`).
- ✅ **Framework & Storybook discovery (`discovery/`)**
  - Filesystem route discovery for Next.js (App and Pages Router), Remix, SvelteKit and Nuxt.
  - Storybook 8 `/index.json` and Storybook 7 `/stories.json` discovery.
  - A live BFS crawler fallback.
  - `smartFilter` changed-file route scoping, with an automatic all-routes fallback. Lockfiles, configs, global CSS and token files force all routes. The README line `"12/47 routes affected by changed files"` is illustrative sample output, not a benchmark measurement.
- ✅ **Multi-viewport & multi-browser capture (`render/`)** — Default viewports `375 / 768 / 1440`. `chromium` by default, with `firefox` and `webkit` supported via `config.browsers`.
- ✅ **Git orphan-branch baselines (`storage/git-orphan.ts`)** — Stores baseline PNGs and a SHA-256 manifest on an isolated `frontguard-baselines` git orphan branch via temporary worktrees, so `main` stays free of binary bloat.
- ✅ **Interactive local HTML workbench & PR reporter (`report/html.ts`, `report/github-pr.ts`)**
  - A self-contained 4-mode HTML diff inspector (`packages/cli/src/report/html.ts`, 1,403 lines): Side-by-Side, Swipe Curtain, Onion Skin and Diff Heatmap, plus a spatial cluster table and keyboard navigation.
  - GitHub PR Markdown comments with `renderImageGrid()` thumbnails backed by `imageUpload` (Cloudflare R2, AWS S3, GitHub Actions artifacts, or local disk).
- ✅ **CLI commands & onboarding (`cli/`)** — `init`, `doctor` (Node, browser, config and git diagnostics), `run`, `update-baselines`, `monitor` (`--once`, `--watch`/`--interval`, `--history`, webhook alerts), `accept-fix`, `reject-fix`, `export-patterns` and `plugin`.
- ✅ **5 built-in plugins & 9 lifecycle hooks (`plugins/`, `create-frontguard-plugin`)**:
  1. **Accessibility (`plugins/accessibility.ts`)** — An `@axe-core/playwright` WCAG audit in the same render pass. Options are `impact`, `rules`, `excludeRules` and `failOnViolation`; violations are warnings unless `failOnViolation: true`. Findings are fused into the optional AI analysis prompts. *(The README and docs site currently show options that do not exist, `failOnImpact` and `standard`; see [#302](https://github.com/ravidsrk/frontguard/issues/302).)*
  2. **Performance budgets (`plugins/perf-budgets.ts`)** — LCP, CLS, FCP, TTFB and transfer-size budgets, correlated inline with visual diffs and run-over-run regressions (`trackRegressions`).
  3. **Third-party scripts (`plugins/third-party-scripts.ts`)** — Inventories external `<script src>` origins per route and flags newly added or removed third-party domains.
  4. **Figma design compliance (`plugins/figma.ts`)** — Compares live rendered routes against exported Figma frames.
  5. **Production URL monitor (`plugins/monitor.ts`)** — Scheduled or one-shot live URL drift checks, with webhook and Slack alerting.
- ✅ **Optional BYOK AI triage, sandbox fix verification & experimental judge (`diff/ai-vision.ts`, `diff/ai-fix.ts`, `diff/model-judge.ts`, `sandbox/`, `storage/fix-patterns.ts`)**
  - Multi-provider BYOK vision analysis (OpenAI, Anthropic, Gemini, custom `baseUrl`), with DOM text fenced as untrusted.
  - Candidate CSS patch generation, verified by re-rendering with local Playwright (`sandbox/local.ts`) or Daytona (`sandbox/daytona.ts`).
  - A local SQLite fix-pattern store (`accept-fix` / `reject-fix` / `export-patterns`).
  - Opt-in experimental judge mode (`--mode judge --experimental`).
- ✅ **Demo & comparison guides (`demo/`, `apps/web/src/lib/docs-content.ts`)** — Committed `demo/frontguard-demo.gif` and `demo/frontguard-demo.svg` assets, plus comparison and migration guides (`frontguard-vs-percy`, `frontguard-vs-chromatic`, `migrate-from-backstopjs`, `migrate-from-lost-pixel`). *(Closes the `2026-06-29` roadmap's demo-recording follow-up.)*

### Playwright In-Test Package (`@frontguard/playwright`)
- ✅ `visualTest()` and `expectVisual()` assertions with `__visual_baselines__/` storage, SSIM calculation, connected-component cluster extraction, DOM selector attribution, `mask` / `maskRegions`, `redactSensitive`, `freezeTime`, `seedRandom`, `blockUrls` and `waitForStable`. Optional `captureAriaSnapshot` and `textSnapshot` store a text file next to the PNG and diff it as text. A mismatch is reported on its own. It does not change `passed`, and axe-core remains the accessibility plugin ([#299](https://github.com/ravidsrk/frontguard/issues/299)).

### Agentic MCP Server (`@frontguard/mcp`)
- ✅ A stdio JSON-RPC 2.0 server, built on `@modelcontextprotocol/sdk` `^1.32.1`, exposing seven tools with `outputSchema` and `structuredContent`:
  - read tools: `list_regressions`, `inspect_diff_cluster_dom`, `get_suggested_fix`, `verify_css_patch` (static, with a CSS policy) and `recent_runs`;
  - write tools: `promote_baseline` (requires `confirm_reviewed: true` and refuses unconfirmed local-report orphan-branch overwrites) and `accept_baseline`.

  It works in both zero-cloud local `report.json` mode and Cloud API mode.

### Known Issues in Shipped Behaviour (filed 2026-10-19–20)
- Route entries that share a path, such as light and dark, or menu closed and open, share one baseline file ([#301](https://github.com/ravidsrk/frontguard/issues/301)).
- The accessibility plugin's documented recipe uses options the plugin ignores, so serious violations never fail the run ([#302](https://github.com/ravidsrk/frontguard/issues/302)).
- Experimental judge mode sets exit codes from model verdicts ([#286](https://github.com/ravidsrk/frontguard/issues/286)).
- `skills/frontguard/SKILL.md` steers agents to `update-baselines` and `promote_baseline`. With `update-baselines: true`, the Action pushes `frontguard-baselines` from any event ([#287](https://github.com/ravidsrk/frontguard/issues/287)).
- `smartFilter` can omit an asset consumer when a public asset and a different mapped route change together. The executed reproduction covers route selection, with end-to-end pixel validation still required ([#321](https://github.com/ravidsrk/frontguard/issues/321)).

---

## 3. Source-in-Repo — Gated & Not Deployed in Production

Per [`docs/completion/DEFINITION.md`](./completion/DEFINITION.md) §4, the following subsystems exist as tested source code in the monorepo but are **not deployed as live production services**. They must not be advertised as generally available until their post-launch gates are met:

- 🔒 **`packages/cloud-api` (Hono / Cloudflare Worker, D1, R2, GitHub OAuth, Cron scheduler, Slack/email/PagerDuty alerting, hand-rolled OTLP/HTTP exporter in `src/otel/index.ts`)** — Not deployed (`api.frontguard.dev` does not resolve). Hard-gated on [#293](https://github.com/ravidsrk/frontguard/issues/293):
  - (a) a user-data erasure path;
  - (b) a restore-tested backup;
  - (c) fixing the run-status path so a run can never report `completed` without having compared.
- 🔒 **Stripe billing & hosted pricing tiers (`packages/cloud-api/src/billing/`)** — Source only, with no live money path. Public `/pricing` on `frontguard.dev` states that hosted plans are not generally available.
- 🔒 **Third-party marketplace listings (`integrations/github-app`, `integrations/slack-app`, `integrations/vercel`, `integrations/netlify`)** — Handler source and tests live in `integrations/*`. External marketplace listings (`CF-06`) and production cloud hooks remain deferred until `cloud-api` clears [#293](https://github.com/ravidsrk/frontguard/issues/293).

---

## 4. Post-Launch Roadmap (Tracked in GitHub Issue [#283](https://github.com/ravidsrk/frontguard/issues/283))

All actionable post-launch engineering work is tracked under parent issue [#283](https://github.com/ravidsrk/frontguard/issues/283) (*"Post-launch roadmap: keep pixelmatch as the only pass/fail gate"*), ordered into **Now**, **Next** and **Later**. The order within each group is the working order. The second research pass (2026-10-19) added #301–#310, moved #288 to Next, and split #289. The follow-up added #321 to Now before validation. Two security hardening items are tracked privately per [`SECURITY.md`](../SECURITY.md) and appear below only as placeholders. [Delivery checkpoints](../reports/Frontguard%20roadmap%20follow-up.md#delivery-checkpoints) state the evidence required between groups; they are not calendar estimates.

### Now — Close the Approval Edges, Fix Shipped Bugs, Fingerprint, Then Upgrade

1. **[#287](https://github.com/ravidsrk/frontguard/issues/287) — Separate baseline writes from the agent that edited the UI.**
   - Rewrite the shipped skill so agents stop at evidence and hand promotion to a human.
   - Make the Action refuse `update-baselines` on `pull_request`, `pull_request_target` and `merge_group` without an explicit override.
   - Make the control a credential the agent does not hold: promotion after merge, or a protected environment. `confirm_reviewed` stays as UX only.
2. **[#286](https://github.com/ravidsrk/frontguard/issues/286) — Publish an advisory judge evaluation and keep model output off exit codes.**
   - First change: judge verdicts stop setting exit `1`.
   - Then an evaluation protocol with paired clean and attacked injection fixtures, scored in both directions with Clopper-Pearson bounds, plus UI-Lens classes as negative evidence.
3. **[#301](https://github.com/ravidsrk/frontguard/issues/301) — Route entries that share a path overwrite each other's baselines.**
   - Reject duplicate baseline keys at config validation (exit `2`) until named modes exist.
   - Document that `--color-scheme` compares against the default scheme's baselines.
   - Warn when the run's effective color scheme differs from the scheme stored on the baseline. The warning does not change the exit code.
4. **[#302](https://github.com/ravidsrk/frontguard/issues/302) — Accessibility plugin docs use options the plugin ignores.**
   - Fix the recipe to `impact` + `failOnViolation: true`.
   - Warn on unknown option keys.
5. **[#303](https://github.com/ravidsrk/frontguard/issues/303) — Record the renderer and comparator in the baseline manifest.**
   - Record the Frontguard, Playwright, browser build/channel, OS/arch, device scale factor, `pixelmatch` version/options and effective screenshot options.
   - Warn on mismatch; exit `2` only in strict mode.
   - Bound the `document.fonts.ready` wait.
   - Absorbs #289's runner-change warning. Lands before #284.
6. *Private hardening item, tracked per `SECURITY.md`.*
7. **[#321](https://github.com/ravidsrk/frontguard/issues/321) — Keep `smartFilter` conservative for public assets in mixed changes.**
   - Capture all routes when changed asset consumers cannot be proved, even if another route was selected.
   - Cover mixed image, font and CSS-background edits; explain incomplete-analysis fallbacks.
   - Retain scoping for proven route-only edits. Lands before #285's selection validation.
8. **[#284](https://github.com/ravidsrk/frontguard/issues/284) — Measure small-text misses under the 10% pixel budget and adopt `pixelmatch` 8 as the same gate.**
   - Both packages depend on `pixelmatch` `^8.0.0`. The 10% whole-image budget stays. A 16×16 window fails above 64 differing pixels.
   - A dimension mismatch is padded, then judged by that same gate.
   - WebdriverIO's about ±3% count shift is their corpus. This repo does not publish a rate from it.
   - Screenshot runs install the Playwright browser build that matches the capturing package ([@karlhorky](https://x.com/karlhorky/status/2082458846031696091)).
9. **[#285](https://github.com/ravidsrk/frontguard/issues/285) — Re-run pixel validation on the current tree with true-positive fixtures.**
   - HTML/CSS mutation operators, with recall bucketed by how many viewports show the change.
   - Seeded neighbour-moving faults, nuisance fixtures drawn from UI flaky-test causes, and the #303 fingerprint recorded.
   - Compare full capture with filtered selection after #321, reporting omitted observable mutations and denominators separately from comparator misses.
   - No implied rate of unreviewed acceptance.

### Next — Give Humans, Not Agents, the Merge Gate

10. **[#288](https://github.com/ravidsrk/frontguard/issues/288) — Block baseline updates on new serious `axe-core` violations.** Moved from Now: the block attaches to the approval channels #287, #305 and #306 define. It uses the real option names (`impact`, `failOnViolation`).
11. **[#304](https://github.com/ravidsrk/frontguard/issues/304) — Run a verify-only full check in GitHub merge queues.**
    - Document `merge_group`.
    - On queue runs, render all routes and refuse writes.
    - Exit `1` on regression, so the PR is removed from the queue.
    - Fix `smartFilter`'s hard-coded `origin/main...HEAD` base on queue refs.
12. **[#305](https://github.com/ravidsrk/frontguard/issues/305) — Add a human `frontguard review` command that accepts shots one at a time.**
    - Accept, skip or quit per shot.
    - `--from` a downloaded CI artifact, byte for byte, refused on a fingerprint mismatch.
    - An audit line per acceptance, and no network calls.
13. **[#306](https://github.com/ravidsrk/frontguard/issues/306) — Design PR-scoped approvals and merge-base baseline selection for the orphan branch.**
    - A decision record plus a spike: pick baselines from the merge base, and key approvals by baseline and candidate SHA-256.
    - Promotion happens after merge.
    - `pixelmatch` stays the only comparator.
14. *Private hardening item, tracked per `SECURITY.md`.*
15. **[#307](https://github.com/ravidsrk/frontguard/issues/307) — Declare MCP tool annotations and mark promotion tools destructive.**
    - Read-only hints on the five read tools.
    - `destructiveHint` plus Claude Code's `requiresUserInteraction` on `promote_baseline` and `accept_baseline`.
    - Documented as hints, not controls.
16. **[#289](https://github.com/ravidsrk/frontguard/issues/289) — Discover Ladle, Histoire and Storybook 9–11 stories.**
    - Discovery only.
    - Fixtures for Storybook 9, 10 and the 11 alpha, now that `storybookjs/test-runner` is archived.
    - Ladle via `meta.json`, and Histoire discovery while its native visual testing is unreleased.
17. **[#290](https://github.com/ravidsrk/frontguard/issues/290) — Prune PNG history on the `frontguard-baselines` orphan branch.**
    - Adds stale-shot removal.
    - Never prunes from filtered or sharded runs, and always offers a dry run.
    - Keeps every baseline set reachable as a merge base (#306).
18. **[#291](https://github.com/ravidsrk/frontguard/issues/291) — Split `pipeline.ts` at 1,422 lines and drop the stale `index.tsx` refactor.** Unchanged.
19. **[#292](https://github.com/ravidsrk/frontguard/issues/292) — Enforce coverage thresholds in the CLI Vitest config.** Unchanged; ratchets after the Now tests land.

### Later — Gated Hosted Differentiators, Non-Gating Artifacts & Dated Upgrades

20. **[#293](https://github.com/ravidsrk/frontguard/issues/293) — Close the three `cloud-api` deployment gates without deploying.**
    - The run-status path (`G-34`), user-data erasure, and a restore-tested backup.
    - Does **not** deploy `api.frontguard.dev` or enable billing.
21. **[#294](https://github.com/ravidsrk/frontguard/issues/294) — Design a hosted review UI only after the `cloud-api` gates.** Blocked by #293 and #305: local review comes first.
22. **[#295](https://github.com/ravidsrk/frontguard/issues/295) — Design S3-backed baseline storage only after the `cloud-api` gates.**
    - Blocked by #293, #290, #306 and #303.
    - Distinct from `imageUpload`, which already uploads PR diff thumbnails.
23. **[#298](https://github.com/ravidsrk/frontguard/issues/298) — Surface aged ignore masks for a human to drop.** One vendor account asked for this. `frontguard ignores --older-than <days>` lists rules whose `since` date is older than that, and the shots they cover. Shot coverage comes from configured routes. When routes are omitted, the command says coverage is unavailable and does not discover Storybook, crawl, or filesystem routes. Removing a rule is a config edit. No model, prompt, or flake heuristic removes a mask.
24. **[#299](https://github.com/ravidsrk/frontguard/issues/299) — Add optional ARIA and non-image text snapshots that do not gate pixels.** Optional `captureAriaSnapshot` and `textSnapshot.json` / `textSnapshot.markdown` store a text file next to the PNG and diff it as text. A mismatch is reported on its own. It does not change `comparisonMethod` from pixelmatch and does not pass a pixel regression. axe-core remains the accessibility plugin. Text diff is not a gate.
25. **[#308](https://github.com/ravidsrk/frontguard/issues/308) — Report horizontal viewport overflow without gating.**
    - `scrollWidth` vs `innerWidth`, plus visible unclipped elements past the right edge, taken from the same settled state as the screenshot.
    - Never an exit-code input.
26. **[#309](https://github.com/ravidsrk/frontguard/issues/309) — Add named capture modes with mode-keyed baselines (bet).**
    - Named bundles (`colorScheme`, `reducedMotion`, `forcedColors`, `contrast`, `locale`, `timezoneId`).
    - Emulation probed before each capture, and a projected capture count.
    - Demand is weak.
27. **[#310](https://github.com/ravidsrk/frontguard/issues/310) — Move the MCP server to SDK v2 before v1.x support ends, then list it in the registry.**
    - Dated: start the spike in December 2026 and ship before about 2027-01-27.
    - Publish `server.json` from the npm release job.
28. **[#296](https://github.com/ravidsrk/frontguard/issues/296) — Add CLI OpenTelemetry without deploying the `cloud-api` exporter.** Unchanged.
29. **[#297](https://github.com/ravidsrk/frontguard/issues/297) — Audit `apps/web` accessibility separately from the CLI `axe-core` plugin.** Unchanged.

### Ongoing Operations & Hardening Tracked Separately

- **[#157](https://github.com/ravidsrk/frontguard/issues/157) — Weekly npm audit (production tree):** an automated weekly production dependency audit workflow.
- **H-05 / G-44 — npm trusted publishing (OIDC without `NPM_TOKEN`):** recorded in [`docs/completion/HUMAN_ACTIONS.md`](./completion/HUMAN_ACTIONS.md) and [`docs/completion/GAPS.md`](./completion/GAPS.md) with expiry **2027-03-01**. The current release workflow already enforces tag/version match, `main` ancestry, green CI on the exact SHA, and npm OIDC provenance attestation.

---

## 5. What Is Deliberately Not On This Roadmap

- **Replacing `pixelmatch` with `odiff`, `Resemble.js`, a perceptual hash, a captioner or a VLM as the pass/fail gate, including prompt-based ignore rules.**
  - No benchmark in the 2026 literature shows these outperforming `pixelmatch` on UI accuracy.
  - WUICC-bench, LLMShot and UI-Lens show why models cannot serve as a deterministic regression gate.
  - Noise handling stays inside the same gate (`windowSize`, `ignoreMask`; [#284](https://github.com/ravidsrk/frontguard/issues/284)).
- **Selectable alternative comparators as gates.** Playwright closed pluggable comparators as [out of scope](https://github.com/microsoft/playwright/issues/28578). Vitest declines to bundle perceptual comparators because there is no clear best one.
- **A Vitest `toMatchScreenshot` comparator adapter, or a clone of a Storybook visual-test addon.** There is no practitioner pull, and Chromatic already sells hosted Vitest visual testing. Frontguard is positioned as the local Storybook path instead ([#289](https://github.com/ravidsrk/frontguard/issues/289)).
- **An in-house prompt-injection detector, more "ignore page instructions" prompt text, defenses that need model internals, or a dual-LLM rebuild of triage.** Adaptive attacks bypassed 12 published defenses ([arXiv:2510.09023](https://arxiv.org/abs/2510.09023)). The pixel gate already fixes control flow.
- **Skill or prompt wording as the thing that stops promotion, or an agent's own "looks good" verdict as a stop condition.** The control is a credential the agent does not hold ([#287](https://github.com/ravidsrk/frontguard/issues/287)).
- **Auto-passing or switching off the visual check in merge queues, Checks API approve buttons (GitHub Apps only), auto-update on mismatch, or CI writes of missing baselines that pass.**
- **A browser-binary cache step in the Action.** Playwright documents that restoring takes about as long as downloading. The Action already installs browsers from the CLI's own pinned Playwright.
- **Determinism by flags.** Not planned: font hinting by default, shared cross-OS baselines, or WebGL guarantees.
- **Raw DOM collision or element-protrusion lists, small-range layout warnings, LLM CSS auto-repair, VLM layout gating, or cross-locale / cross-browser pixel comparison as a gate.** Humans saw 9 of 43 collisions and 3 of 90 protrusions in VERVE's data. All 53 small-range reports there were false positives.
- **A self-healing test agent.** Playwright's healer covers that, and its documented scope excludes baselines.
- **MCP Tasks, Sampling, Roots or logging, or Skills over MCP.** The 2026-07-28 spec moves or deprecates them.
- **Origin limits on MCP-triggered renders** (the MCP server launches no browser) **and a "fail closed on zero comparisons" issue** (the CLI and Action already exit with an error when nothing was compared).
- **Git LFS, or sharding as a headline feature.** No in-window demand: sharding requests total 3 👍.
- **Re-filing already-shipped local capabilities.** These already ship: SSIM / chroma-SSIM / CW-SSIM (`ssimFallback`), Storybook `/index.json` discovery, CSS and coordinate ignore masks, the `@axe-core/playwright` plugin, anti-flake controls (`freezeTime`, `seedRandom`, `blockUrls`, `waitForStability`), Firefox and WebKit capture, `smartFilter` changed-file scoping, local MCP `report.json` inspection, experimental judge mode, the external validation harness, and the 4-mode HTML diff report.
- **Stale god-file refactors (`apps/web/src/routes/index.tsx`, `html.ts`, `docs-content.ts`).** `apps/web/src/routes/index.tsx` is 91 lines. Only `packages/cli/src/core/pipeline.ts` (1,422 lines) is tracked for modularization ([#291](https://github.com/ravidsrk/frontguard/issues/291)).
- **Premature cloud deployment, live billing, or marketplace submissions.** Deploying `packages/cloud-api`, turning on Stripe billing, or submitting GitHub App / Slack / Vercel / Netlify marketplace listings stays off the near-term backlog until [#293](https://github.com/ravidsrk/frontguard/issues/293) is closed.
- **Native mobile app screenshots (iOS Simulator / Android Emulator), a Puppeteer abstraction, browser extensions, or video-replay diffing.** These are different rendering pipelines and audiences, and they dilute focus from deterministic Playwright-based web visual regression testing.

### Deferred Until a Trigger (no issue yet)

| Deferred | Trigger to revisit |
| --- | --- |
| Lost Pixel / BackstopJS config importers; Playwright / Vitest baseline import or export | A user asks. Migration guides already ship |
| JUnit XML and CTRF output | A user asks. No visual runner emits CTRF, and CTRF is pre-1.0 |
| Grouping repeated diffs across routes, shift-aware summaries, moved-element attribution | #285 measures reviewer load |
| A geometry-only width sweep | Geometry baselines exist |
| Pseudo-locale, HiDPI, forced-colors and RTL modes | #309 v1 ships |
| A remote Linux renderer for macOS and Windows | #305's `--from` proves insufficient |
| MCP rows with image paths and unscaled crops | Agents ask |
| An MCP App diff viewer with an app-only promote tool | #287 lands |
| Reporting instability through the unused `flaky` status | #285 measures how often multi-render consensus disagrees |
