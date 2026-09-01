# Frontguard Launch and Market Refresh - August 2026

**Compiled:** 2026-08-29

**Repository snapshot:** `78a5562ac3dfca45472d84cd220e420c08dbc9ba`

**Evidence rule:** first-party product pages, documentation, status pages,
registries, public platform APIs, and Frontguard source only. Prices and service
availability are point-in-time observations, not durable promises.

## Executive decision

**Verdict: prepare a focused OSS public-beta launch, not a hosted-product
launch.** Frontguard has a real, published MIT CLI and a useful no-account
workflow. It does not yet have the public proof, live hosted surfaces, or
end-to-end CI review path required for the broader story currently told by the
website.

| Surface | Decision | Reason |
|---|---|---|
| `@frontguard/cli` | Conditional go | Version `0.2.2` is public with npm provenance; core route discovery, rendering, pixel comparison, git baselines, HTML/JSON/console output, and optional AI calls are implemented. [FG-NPM] [FG-PIPELINE] |
| Optional BYOK AI | Public beta only | Classification and CSS-fix code exists, but the published validation run did not enable AI and measured neither classification accuracy nor true-positive recall. [FG-AI] [FG-VALIDATION] |
| `@frontguard/playwright` | Hold from launch headline | The package exports `visualTest`, while the live homepage and launch drafts teach a nonexistent `expectVisual` API. [FG-PW-EXPORT] [FG-LIVE] |
| GitHub Action | Hold the PR-comment promise | `ravidsrk/frontguard@v0` resolves and runs the CLI, but the action does not instantiate the implemented GitHub reporter or otherwise post a PR comment. Marketplace URLs returned 404 during this audit. [FG-ACTION] [FG-CLI] [FG-PR-REPORTER] |
| Hosted Pro / Team | Do not launch | `api.frontguard.dev` and `app.frontguard.dev` did not resolve. The live pricing page still links to the unavailable signup host and markets dashboard, managed storage, and SSO as purchasable. [FG-LIVE-PRICING] |
| Managed production monitoring | Do not launch | A local `frontguard monitor` command exists, but the managed scheduler depends on the unavailable cloud service. [FG-CLI] |

The launch position should be:

> **Visual checks for real app routes, in your own CI.** Frontguard discovers
> pages, captures Playwright baselines, and reports changed screenshots from a
> local MIT-licensed CLI. Add your own OpenAI or Anthropic key if you want
> model-assisted triage.

Do not lead with "the only AI visual testing tool," "zero false positives," or
"verified fixes." Percy and Applitools already market substantial Visual AI
and root-cause workflows, while Frontguard's AI result has not passed its own
accuracy gate. [PERCY-AI] [APPLITOOLS-EYES] [APPLITOOLS-NEW]

## Evidence boundary

This report distinguishes four states:

| State | Meaning |
|---|---|
| Available | A user could reach or install it during the 2026-08-29 audit. |
| Implemented | Source exists at the audited tag or commit. This does not prove deployment or usability. |
| Validated | A measured run exercises the stated behavior with a disclosed denominator and conditions. |
| Inference | A recommendation derived from the facts above, not a measured product or market fact. |

No defensible market-size number was found in the allowed first-party evidence
set. The old `$20B+`, `<10%`, `73%`, `~40%`, and `$100M` figures should not be
reused. This refresh can establish category activity, current price bands,
competitor capabilities, and Frontguard's public traction; it cannot establish
TAM, adoption rate, or customer willingness to pay.

## Current product truth

### Distribution and traction

| Fact as of 2026-08-29 | Evidence | Interpretation |
|---|---|---|
| `@frontguard/cli@0.2.2` and `@frontguard/playwright@0.2.2` are public and carry npm provenance attestations. | [FG-NPM] [FG-PW-NPM] | The installable OSS product is real. |
| CLI downloads were 10 for 2026-08-21 through 2026-08-27 and 48 for 2026-07-29 through 2026-08-27. | [FG-NPM-WEEK] [FG-NPM-MONTH] | Frontguard is pre-adoption. Optimize for learning and activation, not revenue extraction. |
| The public repository had 2 stars, 0 forks, and 1 open issue. | [FG-REPO] | There is not yet social proof for category-leader claims. |
| Tags include `v0.2.2`, `v0.2.0`, `v0.1.0`, and `v0`, but GitHub Releases exposes only `v0.1.0`. | [FG-TAGS] [FG-RELEASES] | Release discovery and changelog hygiene lag the package registry. |
| Main-branch CI run `33151453503` and web deploy run `33151453565` succeeded on 2026-08-28. | [FG-ACTIONS] | Build health is positive; live-content correctness still needs an external smoke test. |
| The live homepage and pricing page did not match current `main`: live still showed `@v1`, `expectVisual`, the old validation denominator, and the dead hosted-trial link, while source uses `@v0`, `visualTest` remains the package export, and pricing source uses a waitlist email. | [FG-LIVE] [FG-LIVE-PRICING] [FG-WEB-SOURCE] [FG-PRICING-SOURCE] | A successful deploy job is not sufficient proof that the intended artifact reached the public origin. |

### What the published CLI actually does

Verified from the `v0.2.2` source:

- Discovers routes from explicit config, Storybook, a crawler, or framework
  filesystem conventions. [FG-PIPELINE]
- Captures routes across configured Chromium, Firefox, or WebKit engines and
  viewports, with four workers by default. The default browser configuration is
  Chromium, not all three browsers. [FG-RENDER] [FG-TYPES]
- Disables CSS animation and transition duration and waits for fonts when smart
  rendering is enabled. It supports masks, a frozen clock, render retries, and
  auth storage state. [FG-RENDER]
- Stores baselines on a git orphan branch, compares PNGs with pixelmatch and an
  optional SSIM fallback, and emits console, JSON, and HTML reports.
  [FG-PIPELINE] [FG-CLI]
- Captures a serialized DOM string and console errors, but the main comparison
  path does not perform a DOM diff or computed-style diff. The AI classifier is
  passed screenshots, route/browser/viewport metadata, pixel percentage, and
  optional accessibility findings; it is not passed the captured DOM, console
  errors, or a git diff. [FG-RENDER] [FG-PIPELINE] [FG-AI]
- Sends downscaled baseline, current, and optional diff PNGs directly to the
  configured OpenAI or Anthropic API when AI is enabled. Without AI, that
  provider transfer does not occur. [FG-AI]
- Generates a structured fix only when AI and fix generation are explicitly
  enabled. The pipeline does not supply the optional `gitDiff` argument. Local
  verification injects CSS only and ignores HTML or config patches. Verification
  itself is opt-in. [FG-PIPELINE] [FG-FIX] [FG-SANDBOX]
- Supports configurable multi-render consensus, but `antiFlakeRenders` defaults
  to `1`. Multi-render anti-flake behavior is therefore not on by default.
  [FG-RENDER] [FG-TYPES]
- Implements local one-off or polling production checks with webhook alerts.
  This is not evidence of a managed monitoring service. [FG-CLI]

### Validation truth

The strongest measured statement available is:

> On 2026-06-20, 39 successful unchanged rechecks across 2 of 5 attempted OSS
> repositories on one macOS host produced 0 pixel false positives with the
> byte-identical fast path disabled. Four additional recheck attempts errored.
> AI was disabled, no seeded regressions were used, and true-positive recall was
> not measured. [FG-VALIDATION]

This is a useful pixel-engine result. It is not evidence that AI removes false
positives, that the product catches real regressions, or that rendering is stable
across operating systems. Keep the exact conditions adjacent to any use of the
number.

## Market state

### What changed since the earlier research

1. **AI is not a unique category claim.** Percy documents Visual AI and a paid
   Visual Review Agent; Applitools documents Visual AI, root-cause analysis,
   plain-English diff descriptions, and infrastructure-diff auto-accept;
   Meticulous markets generated and evolving visual E2E coverage. [PERCY-AI]
   [APPLITOOLS-EYES] [APPLITOOLS-NEW] [METICULOUS-HOW]
2. **Chromatic is not Storybook-locked.** Its current visual-testing material
   supports Storybook, Playwright, Cypress, and Vitest. Storybook remains its
   center of gravity, but "Storybook-only" is false. [CHROMATIC-VISUAL]
3. **Open source is not unique.** Playwright, BackstopJS, and Argos have public
   source and permissive licenses. Argos is active and cloud-first; an official
   maintainer says self-hosting is possible but unsupported and undocumented.
   [PLAYWRIGHT-SNAPSHOTS] [BACKSTOP-REPO] [ARGOS-REPO] [ARGOS-SELFHOST]
4. **Production visual checks are not uncontested.** Checkly documents visual
   regression checks in scheduled browser monitoring, although they are
   Chromium-only and limited to Team/Enterprise. [CHECKLY-VISUAL]
5. **Lost Pixel is an exit opportunity, not a live benchmark.** Its founders
   announced the product sunset and their move to Figma on 2026-04-22; the
   repository is archived. [LOSTPIXEL-SUNSET] [LOSTPIXEL-REPO]
6. **Hosted review is a mature workflow.** Percy, Chromatic, Applitools, and
   Argos all offer shared baselines, review/approval, and source-control status
   integration. Frontguard should not imply a local HTML report is equivalent
   to those team workflows. [PERCY-APPROVAL] [CHROMATIC-VISUAL]
   [APPLITOOLS-BASELINES] [ARGOS-MARKETPLACE]

### Observed price bands

The first-party pricing evidence shows three practical bands:

- **Local primitives:** free OSS, represented by Playwright and BackstopJS.
- **Hosted visual review:** free entry tiers around 5,000 screenshots, then
  approximately `$100` to `$399` per month before enterprise, represented by
  Argos, Chromatic, and Percy.
- **Enterprise Visual AI:** a materially higher entry, represented by
  Applitools Starter at `$667/month` paid annually.

This proves buyers are offered paid visual-review products. It does not prove
that Frontguard can charge `$29`, that screenshot-independent pricing is viable,
or that its target customer prefers hosted infrastructure.

## Competitive matrix

Prices are USD and were read on 2026-08-29. "Current entry" describes a
purchasable or installable entry point, not a normalized feature-equivalent
quote.

| Product | Operating model and workflow | Noise / AI / remediation | Current entry | Implication for Frontguard |
|---|---|---|---|---|
| Frontguard | MIT CLI; local/CI route discovery, Playwright rendering, git baselines, local reports; optional direct model API calls. Hosted endpoints unavailable. | Pixelmatch/SSIM; configurable multi-render; model classification and opt-in CSS fix suggestion/verification. AI accuracy unmeasured. | CLI `$0`; no verified hosted offer. [FG-NPM] [FG-VALIDATION] | Compete on low-friction ownership and real-route discovery, not proven AI superiority. |
| Playwright screenshots | Apache-2.0 test-runner primitive; snapshot files live in the repository; CI is user-owned. | Two-consecutive-frame stabilization, animation/caret suppression, masks/styles, pixel thresholds; no hosted review or Visual AI in the screenshot docs. | `$0`. [PLAYWRIGHT-SNAPSHOTS] [PLAYWRIGHT-ASSERTIONS] | The default alternative. Frontguard must save authored-test/setup work or add better triage, not merely wrap screenshots. |
| Percy | BrowserStack-managed cloud rendering, dashboard review, approvals, PR sync, and broad SDK/integration coverage. | Visual AI, Intelli Ignore, paid Visual Review Agent, and root-cause/review assistance. | Free 5,000 screenshots/month; Desktop `$199/month` annual for 10,000 plus `$0.036` overage; Desktop and Mobile `$599/month` annual for 25,000 plus `$0.048`. [PERCY-PRICING] [PERCY-BILLING] [PERCY-AI] | "Percy has no AI" and a generic `$399` cliff are stale. Lead with local ownership and transparent data flow. |
| Chromatic | Capture Cloud plus UI Review for Storybook, Playwright, Cypress, and Vitest; branch-aware hosted baselines. | SteadySnap stabilization and TurboSnap changed-only capture; MCP supplies published UI context to agents, not a documented AI visual comparator. | Free 5,000 snapshots; Starter `$179/month` for 35,000 plus `$0.008` overage; Pro `$399/month` for 85,000; Enterprise custom. [CHROMATIC-PRICING] [CHROMATIC-BILLING] [CHROMATIC-STEADY] | Do not call it Storybook-locked. Frontguard's contrast is real-route/no-account operation, not route support alone. |
| Applitools | Managed cloud/UFG with private-cloud and on-prem options, enterprise review, baselines, and 60+ integrations. | Visual AI, match levels, RCA over stored DOM/CSS, plain-English descriptions, self-healing, and infrastructure-diff auto-accept. | 14-day trial; Starter `$667/month` annual for 100,000 component or 1,000 page checkpoints; higher tiers quoted. [APPLITOOLS-PRICING] [APPLITOOLS-TOS] [APPLITOOLS-EYES] | The AI and enterprise quality bar. Frontguard should not imply image-only prompting maps a diff to exact code. |
| Argos CI | Active MIT platform and SDKs; hosted PR review for screenshots, ARIA snapshots, or other files; GitHub/GitLab and framework integrations. Self-host is possible but unsupported. | Pixel diff, stabilization/flake scoring, review/approval, traces, MCP, deployments, and media sharing; no documented AI visual classifier. | Hobby `$0` for 5,000; Pro from `$100/month` for 35,000 plus `$0.004` overage (`$0.0015` Storybook); SSO add-ons and Enterprise. [ARGOS-PRICING] [ARGOS-REPO] [ARGOS-CHANGELOG] | The closest OSS/cloud workflow benchmark. Open source and CLI ergonomics alone are insufficient differentiation. |
| Lost Pixel | MIT standalone engine plus a formerly hosted review platform. Repository is archived and product is being sunset. | Screenshot comparison, retries, masks, multiple browsers/viewports; no current AI claim. | Historical pricing remains rendered but current commercial availability is unverified. [LOSTPIXEL-PRICING] [LOSTPIXEL-SUNSET] | A migration audience, not a product to disparage or benchmark on stale pricing. Do not call the move an acquisition without evidence. |
| BackstopJS | MIT local/Docker screenshot comparison with browser diff/approval UI and Playwright/Puppeteer scripts. No hosted service. | Pixel comparison, scenario scripts, thresholds, JUnit/CLI reports; no AI. | `$0`; npm latest `6.3.25`, published 2024-09-07; repository is not archived but latest commit was also 2024-09-07. [BACKSTOP-NPM] [BACKSTOP-COMMITS] [BACKSTOP-REPO] | Say "last release observed in 2024," not "unmaintained." Frontguard can offer a modern migration path. |
| Meticulous | Hosted cloud execution generated from recorded interactions and code evolution; visual, behavioral, and frontend-logic diffs; agent CLI/MCP. | Automated session selection/evolution, network stubbing, base-versus-head replay, and beta accessibility/performance/custom checks. | Current numeric public pricing unavailable; current FAQ routes Enterprise buyers to contact. The old free-tier post is dated 2024 and not current proof. [METICULOUS-HOW] [METICULOUS-DOCS] [METICULOUS-CHANGELOG] | Competes for "no tests to author," but with a broader autonomous E2E product and a hosted model. Do not reduce it to screenshot diffing. |

### Adjacent production benchmark

Checkly runs Playwright tests in CI and as scheduled multi-region monitors. Its
visual-regression feature is documented for Team/Enterprise and Chromium. Its
2026-08-29 annual-billing page listed Hobby `$0` with 1,000 browser runs,
Starter `$24` with 3,000, and Team `$64` with 12,000. [CHECKLY-PRODUCT]
[CHECKLY-VISUAL] [CHECKLY-PRICING]

## Claim audit

### Keep

| Claim | Safe wording | Evidence |
|---|---|---|
| Open source | "MIT-licensed CLI and repository." | [FG-REPO] [FG-NPM] |
| No account for the CLI | "Install and run the CLI without a Frontguard account." | [FG-NPM] [FG-QUICKSTART] |
| Real-route discovery | "Discover routes by crawling, framework files, Storybook, or config." | [FG-PIPELINE] |
| Browser support | "Supports Chromium, Firefox, and WebKit; Chromium is the default." | [FG-RENDER] [FG-TYPES] |
| Local baseline and report workflow | "Git-orphan baselines with console, JSON, and HTML reports." | [FG-PIPELINE] [FG-CLI] |
| Optional BYOK AI | "When configured, changed screenshots are sent directly to OpenAI or Anthropic for model-assisted classification." | [FG-AI] |
| Narrow validation result | Use the exact 39-success/4-error/2-of-5/macOS/AI-off wording above. | [FG-VALIDATION] |

### Qualify or remove before promotion

| Current claim | Finding | Required action |
|---|---|---|
| `~40%`, `73%`, `<10%`, `$100M`, and `$20B+` | No allowed primary evidence was collected for these figures. | Remove from homepage, README, launch drafts, and social copy. |
| "Pixel + DOM + computed-style diff" | DOM is captured but not compared; no computed-style extraction/diff is in the main path. | Say "pixel comparison" until the other signals are implemented and tested. |
| "Maps it to the exact code change" | AI receives images and basic metadata, not DOM or git diff. | Remove. Describe model output as an explanation, not source attribution. |
| "Only fixes that provably resolve the regression are suggested" | Generation and verification are separate opt-ins; suggestions can be displayed without verification. | Label the feature experimental and distinguish `Suggested`, `Verified`, and `Unverified`. |
| "Anti-flake renders each page multiple times" | Default is one render. | Say "configurable multi-render consensus" or change and validate the default before claiming it is automatic. |
| "The anti-flake gate keeps ~90% away from AI" | No measured denominator supports 90%; the pixel gate, not multi-render, decides whether AI runs. | Remove until instrumented. |
| "Posts a PR comment" / "GitHub Action + PR comments" | Reporter code exists, but CLI reporter selection and the action wire only console/JSON; generated `init --ci` workflow also uses JSON. | Wire and externally smoke-test the reporter, or promise only a status/JSON result and uploaded HTML artifact. |
| `expectVisual(page)` | Package exports `visualTest(page, name, options)`. | Fix all examples or intentionally add and test the documented API. |
| `ravidsrk/frontguard@v1` | No `v1` tag was listed. `v0` resolves. | Use a tested immutable SHA or `v0`; remove `v1`. |
| "Official Marketplace action" | The manifest resolves by tag, but tested Marketplace URLs returned 404. | Say "GitHub Action manifest" until the listing is publicly reachable. |
| "Hosted Pro `$29` / start 14-day trial" | Signup and API hosts do not resolve. | Replace all purchase/trial CTAs with an explicit waitlist or design-partner email. Do not call it available. |
| "No per-screenshot pricing cliff" | True for the free local CLI, but cloud source contains screenshot quotas: Free 500, Pro 5,000, Business unlimited. | Scope the statement to the OSS CLI. Do not promise hosted usage-independent pricing. [FG-PLANS] |
| "SSO" | Found as a Business plan flag, not a proven live auth flow. | Remove from available-product copy until an end-to-end hosted test passes. [FG-PLANS] |
| "Your images never leave" | AI mode sends PNGs to a third-party model API. | State the exact data flow: no Frontguard proxy in CLI mode; baseline/current/diff images go to the configured provider. |
| "Sends diff, DOM, console errors, and axe findings" | The classifier sends images/basic metadata and optional accessibility findings, not DOM or console errors. | Correct the pricing FAQ. [FG-AI] |
| "Claude is default when both keys exist" | The user config explicitly selects provider and model. | Remove the automatic-provider claim. [FG-TYPES] |
| "Cross-OS byte-equivalent baselines" | A Docker path exists, but the published validation did not measure multiple hosts. | Say "pinned renderer option" until cross-host equivalence is measured. |
| "The only one with AI fix verification" | Absolute category claim; competitor capabilities move quickly, and Frontguard's path is opt-in/experimental. | Say "experimental re-render verification for generated CSS suggestions." |
| "Percy has no AI" | Percy documents Visual AI and Visual Review Agent. | Correct comparison tables. [PERCY-AI] |
| "Chromatic is Storybook-locked" | Chromatic supports Playwright, Cypress, and Vitest as well as Storybook. | Use "Storybook-centered." [CHROMATIC-VISUAL] |
| "BackstopJS is unmaintained" | Last observed release/commit was 2024, but no maintainer abandonment statement exists and the repo is unarchived. | Use dated activity facts only. |
| "Lost Pixel was acquired" | The official post says the team joined Figma and the product is sunset; it does not disclose a transaction. | Say exactly that. [LOSTPIXEL-SUNSET] |

## Positioning

### Primary audience

Start with frontend teams that have all of these traits:

- 2 to 20 engineers shipping a web app from a Node-based repository.
- GitHub Actions or another scriptable CI system and a reachable local or
  preview URL.
- Several real routes but little appetite to author a screenshot assertion for
  every page.
- Willingness to keep baselines and execution in their own infrastructure.
- Comfort treating model analysis as optional assistance rather than an
  autonomous approval system.

### Not the initial audience

- Enterprises that require a live SLA, SAML/SCIM, audit logs, managed retention,
  procurement, or a supported private cloud.
- Design-system teams already centered on Chromatic's Storybook review loop.
- Mobile-native teams or teams seeking autonomous functional E2E generation.
- Teams requiring a proven cross-browser cloud grid or measured Visual AI
  accuracy today.

### Jobs to be done

1. "Give me baseline coverage for my real routes without writing a test per
   route."
2. "Fail CI when a route changes beyond my threshold and leave me an inspectable
   artifact."
3. "Let me mask dynamic regions and control rendering without adopting a hosted
   dashboard."
4. "For changed screenshots, optionally give me a model's classification and
   explanation using my provider account."
5. "Let me accept intentional changes and keep baseline history out of my main
   branch."

### Message hierarchy

1. **Control:** local, MIT, no Frontguard account.
2. **Activation:** discover and baseline real routes from one CLI workflow.
3. **Trust:** deterministic controls, inspectable artifacts, explicit data flow.
4. **Optional intelligence:** BYOK classification on changed screenshots.
5. **Experimental depth:** CSS suggestion and re-render verification, clearly
   labeled and never the launch promise.

## Packaging recommendation

| Package | Launch treatment | Price / CTA |
|---|---|---|
| Frontguard Core | Hero product: discovery, render, pixel diff, git baselines, local reports. | Free forever under MIT; install from npm. |
| Frontguard AI | Optional beta configuration within Core. Disclose images sent to the selected provider and that accuracy is not yet validated. | BYOK; Frontguard fee `$0`. |
| Frontguard CI | Offer only after an external repository proves the stable action reference, expected exit codes, artifact upload, and documented comment behavior. | Included with Core. |
| Playwright adapter | Secondary entry after API/docs reconciliation and a published smoke test. | Free under MIT. |
| MCP and self-host cloud | Advanced, documented surfaces for evaluators already operating a cloud API. The MCP server requires an explicit `FRONTGUARD_API_URL`; no hosted default exists. | Free source; no support/SLA promise. [FG-MCP-AUTH] |
| Hosted Frontguard | Design-partner waitlist only until DNS, auth, managed rendering, billing, retention, and support paths pass live acceptance. | Do not advertise `$29` as purchasable. Interview first; price later. |

The `$29` source plan is not a market result. It is an internal configuration
with 500 runs, 5,000 screenshots, 30-day history, 10 members, and 10 monitors;
production monitoring and SSO are disabled on that plan. [FG-PLANS] Publishing
the number now anchors a promise before willingness-to-pay or service cost is
known.

## Acquisition and activation funnel

### Funnel

| Stage | User action | Product proof | Measure |
|---|---|---|---|
| Discover | Reads a technical launch post, migration guide, or GitHub Release. | Accurate problem statement and a real terminal recording. | Qualified repository visits and docs starts, not impressions alone. |
| Evaluate | Opens the repo and installation/quick-start page. | Current release, exact data flow, limitations, supported Node/browser matrix. | Docs-to-install intent; package-page clicks. |
| Activate | Completes a baseline run and a second comparison run on a real project. | At least one route captured, baseline persisted, second run returns an intelligible status and HTML artifact. | Activated repositories / started installs; median time to second run. |
| Deepen | Adds masks, multiple viewports, CI, or optional AI. | Stable reruns and useful changed-page output. | Share enabling each capability; render/API error rate. |
| Retain | Runs on another PR or in the following week. | Low-noise results and manageable baseline updates. | Weekly repositories with at least two successful runs; week-4 retained design partners. |
| Convert | Requests managed baselines/review rather than more local features. | A concrete hosted workflow proposal. | Design-partner interviews, waitlist qualification, and stated willingness to pay. |

The activation unit is **two runs**, not installation and not the first run. The
first run generally creates baselines; value appears only when a subsequent run
compares something.

### Recommended onboarding path

1. Install and initialize without an account or model key.
2. Run against a supplied demo or the user's running app to create baselines.
3. Apply a small, known CSS change and rerun so the diff/report path is visible.
4. Offer AI configuration only after the deterministic path works.
5. Generate CI configuration only after the local two-run loop succeeds.
6. Later, adopt Renovate's pattern: open an onboarding PR that previews the
   exact workflow and activates only when merged. [RENOVATE-ONBOARDING]

The best first-run patterns in adjacent OSS tools are concrete rather than
promotional: Playwright scaffolds runnable examples and optional CI, Storybook
detects the framework and offers guided or minimal setup, Biome imports incumbent
configuration before writing, and Renovate previews behavior in a no-risk PR.
[PLAYWRIGHT-INTRO] [STORYBOOK-INSTALL] [BIOME-MIGRATE]

## 30 / 60 / 90 day plan

### Days 0-30: make the public beta true

| Outcome | Work | Exit evidence |
|---|---|---|
| One honest public surface | Remove unsupported statistics and claims; reconcile homepage, pricing, comparisons, README, launch drafts, and the canonical docs host; redeploy and fetch the public HTML externally. | Public pages match the intended commit; link checker has no dead product CTA; no `expectVisual`, `@v1`, trial, DOM/style diff, or unsupported metric claim remains. |
| One proven activation path | Test install, `init`, baseline, second run, and report on clean fixture repositories and Node 20/22/24 across macOS and Linux. | At least 90% of a declared fixture matrix completes the two-run path; every failure has an owned issue. |
| Release hygiene | Publish a GitHub Release for `v0.2.2`, reconcile README/CHANGELOG/stats, and document whether `v0` is mutable or consumers should pin a SHA. | npm, GitHub Release, README, docs, and action examples agree on version/API. |
| CI truth | Either wire and test PR comments or remove the promise. Smoke `ravidsrk/frontguard@v0` from an external repository. | External PR shows the exact documented status, artifact, and comment behavior. |
| Learning cohort | Recruit 10 design partners from Playwright users, Lost Pixel migrants, and teams evaluating Argos/Percy. | 10 observed setup sessions; friction log and baseline metrics recorded. |

### Days 31-60: prove trust and retention

| Outcome | Work | Exit evidence |
|---|---|---|
| AI evidence | Build a labeled set containing unchanged rechecks, intentional changes, content updates, and seeded regressions across at least 10 repositories. Run each supported provider/model configuration separately. | Existing gate of accuracy `>=70%` and false-positive rate `<15%` is reported with confusion matrix, denominator, model/date, and failures. |
| Cross-host evidence | Re-run identical baselines on pinned macOS/Linux environments and the documented container path. | Cross-host diff rate and error rate published; "equivalent" wording limited to what passed. |
| Better onboarding | Add a reversible sample regression, framework-aware setup feedback, and an onboarding-PR prototype. | Median observed time to second run falls below 10 minutes in the cohort. |
| Migration wedge | Publish factual guides for Playwright snapshots, BackstopJS, and Lost Pixel, with current API examples and no competitor disparagement. | At least 3 external users complete a migration and rerun on a later PR. |
| Retention proof | Follow each design partner through four weeks. | At least 5 of 10 run Frontguard in week 4 and can name a decision it improved. |

### Days 61-90: decide whether hosted convenience is earned

| Outcome | Work | Exit evidence |
|---|---|---|
| Hosted problem validation | Interview retained teams about managed baselines, review/approval, cross-OS rendering, retention, and access control. Test price sensitivity without presenting `$29` as settled. | At least 5 retained teams rank the same hosted job in their top two pains; at least 3 agree to a paid pilot. |
| Private alpha, if warranted | Deploy a bounded hosted alpha with health checks, auth, data deletion/retention, usage limits, support contact, and explicit beta terms. | `api` and `app` resolve; signup, first run, review, billing guardrails, deletion, and incident path pass live acceptance. |
| Distribution | Submit a Marketplace listing only after the external action smoke is stable and support ownership exists. | Public listing is reachable and the listed install path passes from a clean repository. |
| Product decision | Compare retention and hosted demand with the cost of supporting cloud review. | Choose one: remain OSS/BYOK, build managed review, or narrow further. Do not infer conversion from stars or downloads alone. |

## Launch gates and metrics

### Proposed go/no-go gates

These are recommendations, not current results.

| Gate | Go threshold |
|---|---|
| Public truth | 100% of externally visible product, API, price, competitor, and validation claims have a current first-party source or are explicitly labeled beta/inference. |
| Clean activation | `>=90%` success across the declared clean-repo matrix for install -> init -> baseline -> second run -> HTML report. |
| CI integration | One external repository proves the documented stable action reference, exit status, artifact, and PR-comment behavior. |
| Pixel reliability | Recheck error rate `<5%` on the expanded harness; false-positive result reported separately from errors. |
| AI launch claim | Accuracy `>=70%` and false-positive rate `<15%` on at least 100 labeled changed screenshots across at least 10 repositories, with model/version/date disclosed. Otherwise market AI as experimental. |
| Cross-host claim | A declared macOS/Linux/container matrix completes with a published diff distribution. No "byte-equivalent" wording without that result. |
| Retention | At least 5 of 10 design partners still run the tool in week 4. |
| Hosted promotion | Live health, signup, auth, review, retention/deletion, usage limit, and support/incident tests all pass. |

### Scorecard

| Metric | Definition | Why it matters |
|---|---|---|
| Weekly activated repositories | Privacy-safe repository identifiers with at least one baseline run and one later comparison run in seven days. | North-star behavior; excludes installs with no value. |
| Time to second run | Minutes from initialization to the first real comparison result. | Measures onboarding, server setup, and baseline friction. |
| Render completion rate | Successful route/browser/viewport captures divided by attempted captures; errors stay out of false-positive math. | Prevents reliability problems being hidden by a clean diff rate. |
| Actionable-change rate | Changed results that the user marks regression, intentional, or content update. | Measures whether output supports a decision. |
| AI confusion matrix | Ground truth versus model classification by provider/model, including abstentions/errors. | Required before efficacy claims. |
| Fix verification yield | Verified CSS suggestions divided by attempted suggestions, with unverified and inapplicable patches separate. | Tests the experimental remediation wedge. |
| Week-4 retained repositories | Activated repositories that run again in week 4. | Better product signal than stars. |
| Hosted demand | Retained users requesting a specific managed job and agreeing to a pilot/price range. | Prevents building cloud infrastructure from page visits alone. |
| Guardrails | p50/p95 run time, provider error rate, AI cost per changed screenshot, support response time, and accidental-secret/data incidents. | Makes growth operationally and financially legible. |

Telemetry is opt-in in current source. Any central funnel measurement must keep
that contract, disclose fields, avoid raw repository/route names by default, and
offer a local-only path. npm downloads and GitHub stars are useful distribution
signals, not activation or retention.

## Launch copy examples

### Homepage hero

> **Visual checks for real app routes, in your own CI.**
>
> Frontguard discovers pages, captures Playwright baselines, and reports what
> changed from a local MIT-licensed CLI. No account required. Add your own
> OpenAI or Anthropic key for optional model-assisted triage.

### Show HN

**Title:** `Show HN: Frontguard - MIT visual checks for real app routes from the CLI`

**Body:**

> I wanted the coverage of screenshot testing without writing an assertion for
> every route or adopting a hosted dashboard first. Frontguard crawls or reads
> routes, captures Playwright screenshots across configured viewports, stores
> baselines on a git orphan branch, and writes console/JSON/HTML results.
>
> Pixel comparison works without an account or model key. If you enable AI, the
> CLI sends baseline/current/diff images directly to your configured OpenAI or
> Anthropic API for a classification and explanation.
>
> This is an early public beta. Our current published validation is deliberately
> narrow: 39 successful unchanged rechecks on 2 of 5 attempted OSS repos on one
> macOS host produced no pixel false positives; four route attempts errored, and
> AI accuracy is still unmeasured. I am looking for projects that can break the
> setup and classification assumptions.
>
> Repo: https://github.com/ravidsrk/frontguard

### Reddit / technical community

**Title:** `A no-account way to baseline real routes with Playwright`

Lead with the route-discovery, masking, and baseline workflow. Disclose the
author's affiliation in the first paragraph. Ask users to share difficult apps
and dynamic-content cases. Do not lead with competitor price attacks or an
unsupported false-positive statistic.

### Release note lead

> Frontguard `0.2.2` is an early OSS visual-regression CLI for teams that want
> to test real routes in their own CI. The deterministic pixel path is the
> default; OpenAI/Anthropic classification and CSS fix suggestions are optional
> beta features. This release does not include a Frontguard-hosted service.

## Risk register

| Risk | Impact | Response |
|---|---|---|
| Public copy outruns behavior | A technical audience can disprove claims in minutes, damaging the central trust proposition. | Make the claim audit a launch blocker and add tests/link checks for code samples and stable refs. |
| First value requires two runs | Users install, see only new baselines, and churn before comparison value. | Ship a guided known-change demo and measure time to second run. |
| AI accuracy unknown | The headline differentiator can misclassify regressions or intentional changes. | Publish a labeled benchmark; keep AI optional and human-reviewed. |
| AI is no longer unique | Percy and Applitools have stronger public proof and mature review workflows. | Position on ownership, route discovery, and no-account activation; treat AI as assistance. |
| Rendering varies by host | Local baselines can drift across developer and CI machines. | Measure the pinned container across hosts and document one canonical rendering environment. |
| CI review promise is incomplete | Users expect comments/thumbnails and receive only JSON/artifacts or a failed workflow. | Wire and externally test the reporter, or narrow the promise. |
| Hosted CTAs are dead | Prospects hit NXDOMAIN, and pricing appears deceptive. | Waitlist only until live acceptance passes. |
| Version and docs drift | npm, tags, Releases, README, changelog, two docs hosts, source, and deployed HTML disagree. | Establish one release checklist and one canonical docs origin with post-deploy fetch assertions. |
| Provider data disclosure is ambiguous | Users may assume screenshots remain entirely local. | Put the exact no-AI and AI data flows beside configuration and launch copy. |
| Low current adoption | Product decisions may be driven by internal completeness rather than user behavior. | Observe a small design-partner cohort before expanding scope or setting hosted price. |

## Source ledger

All sources below were accessed on 2026-08-29 unless a source date is stated in
the text. Vendor marketing claims are evidence of what the vendor represents,
not independent proof of efficacy.

### Frontguard

- [FG-REPO]: GitHub repository API, including public traction and license.
- [FG-NPM], [FG-PW-NPM]: npm registry latest metadata and provenance.
- [FG-NPM-WEEK], [FG-NPM-MONTH]: npm download API windows.
- [FG-TAGS], [FG-RELEASES], [FG-ACTIONS]: GitHub distribution and workflow
  state.
- [FG-LIVE], [FG-LIVE-PRICING], [FG-QUICKSTART]: public website and docs as
  served during the audit.
- [FG-ACTION], [FG-CLI], [FG-PIPELINE], [FG-RENDER], [FG-AI], [FG-FIX],
  [FG-SANDBOX], [FG-PR-REPORTER], [FG-PW-EXPORT], [FG-TYPES], and [FG-PLANS]:
  source at tag `v0.2.2` or the audited repository snapshot.
- [FG-VALIDATION]: validation method, counts, errors, and limitations.
- [FG-WEB-SOURCE], [FG-PRICING-SOURCE]: current `main` website source used to
  identify deployment drift.

### Competitors and launch patterns

- Playwright: [PLAYWRIGHT-SNAPSHOTS], [PLAYWRIGHT-ASSERTIONS],
  [PLAYWRIGHT-INTRO].
- Percy / BrowserStack: [PERCY-PRICING], [PERCY-BILLING], [PERCY-AI],
  [PERCY-APPROVAL].
- Chromatic: [CHROMATIC-PRICING], [CHROMATIC-BILLING], [CHROMATIC-VISUAL],
  [CHROMATIC-STEADY].
- Applitools: [APPLITOOLS-PRICING], [APPLITOOLS-TOS], [APPLITOOLS-EYES],
  [APPLITOOLS-NEW], [APPLITOOLS-BASELINES].
- Argos: [ARGOS-PRICING], [ARGOS-MARKETPLACE], [ARGOS-REPO],
  [ARGOS-CHANGELOG], [ARGOS-SELFHOST].
- Lost Pixel: [LOSTPIXEL-PRICING], [LOSTPIXEL-SUNSET], [LOSTPIXEL-REPO].
- BackstopJS: [BACKSTOP-REPO], [BACKSTOP-COMMITS], [BACKSTOP-NPM].
- Meticulous: [METICULOUS-HOW], [METICULOUS-DOCS], [METICULOUS-CHANGELOG].
- Checkly: [CHECKLY-PRODUCT], [CHECKLY-VISUAL], [CHECKLY-PRICING].
- Onboarding patterns: [RENOVATE-ONBOARDING], [STORYBOOK-INSTALL],
  [BIOME-MIGRATE].

[FG-REPO]: https://api.github.com/repos/ravidsrk/frontguard
[FG-NPM]: https://registry.npmjs.org/%40frontguard%2Fcli/latest
[FG-PW-NPM]: https://registry.npmjs.org/%40frontguard%2Fplaywright/latest
[FG-NPM-WEEK]: https://api.npmjs.org/downloads/point/last-week/%40frontguard%2Fcli
[FG-NPM-MONTH]: https://api.npmjs.org/downloads/point/last-month/%40frontguard%2Fcli
[FG-TAGS]: https://api.github.com/repos/ravidsrk/frontguard/tags?per_page=100
[FG-RELEASES]: https://api.github.com/repos/ravidsrk/frontguard/releases?per_page=100
[FG-ACTIONS]: https://api.github.com/repos/ravidsrk/frontguard/actions/runs?branch=main&per_page=10
[FG-LIVE]: https://frontguard.dev/
[FG-LIVE-PRICING]: https://frontguard.dev/pricing
[FG-QUICKSTART]: https://frontguard.dev/docs/quick-start/
[FG-ACTION]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0/action.yml
[FG-CLI]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/cli/index.ts
[FG-PIPELINE]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/core/pipeline.ts
[FG-RENDER]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/render/playwright.ts
[FG-AI]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/diff/ai-vision.ts
[FG-FIX]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/diff/ai-fix.ts
[FG-SANDBOX]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/sandbox/local.ts
[FG-PR-REPORTER]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/report/github-pr.ts
[FG-PW-EXPORT]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/playwright/src/index.ts
[FG-TYPES]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cli/src/core/types.ts
[FG-PLANS]: https://raw.githubusercontent.com/ravidsrk/frontguard/v0.2.2/packages/cloud-api/src/billing/plans.ts
[FG-MCP-AUTH]: https://github.com/ravidsrk/frontguard/blob/78a5562ac3dfca45472d84cd220e420c08dbc9ba/packages/mcp/src/auth.ts
[FG-VALIDATION]: https://github.com/ravidsrk/frontguard/blob/78a5562ac3dfca45472d84cd220e420c08dbc9ba/validation/results-v0.2.md
[FG-WEB-SOURCE]: https://github.com/ravidsrk/frontguard/blob/78a5562ac3dfca45472d84cd220e420c08dbc9ba/apps/web/src/routes/index.tsx
[FG-PRICING-SOURCE]: https://github.com/ravidsrk/frontguard/blob/78a5562ac3dfca45472d84cd220e420c08dbc9ba/apps/web/src/routes/pricing.tsx

[PLAYWRIGHT-SNAPSHOTS]: https://playwright.dev/docs/test-snapshots
[PLAYWRIGHT-ASSERTIONS]: https://playwright.dev/docs/api/class-pageassertions
[PLAYWRIGHT-INTRO]: https://playwright.dev/docs/intro
[PERCY-PRICING]: https://www.browserstack.com/pricing?product=percy
[PERCY-BILLING]: https://www.browserstack.com/docs/percy/overview/plans-and-billing
[PERCY-AI]: https://www.browserstack.com/docs/percy/ai-agents/visual-review-agent/overview
[PERCY-APPROVAL]: https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/approval
[CHROMATIC-PRICING]: https://www.chromatic.com/pricing
[CHROMATIC-BILLING]: https://www.chromatic.com/docs/billing/
[CHROMATIC-VISUAL]: https://www.chromatic.com/docs/visual/
[CHROMATIC-STEADY]: https://www.chromatic.com/features/steadysnap
[APPLITOOLS-PRICING]: https://applitools.com/platform-pricing/
[APPLITOOLS-TOS]: https://applitools.com/legal/terms-of-service/
[APPLITOOLS-EYES]: https://support.applitools.com/platform/eyes/
[APPLITOOLS-NEW]: https://applitools.com/platform/whats-new/
[APPLITOOLS-BASELINES]: https://help.applitools.com/hc/en-us/articles/360007189051-Adding-new-steps-to-the-baseline-updating-the-baseline
[ARGOS-PRICING]: https://argos-ci.com/pricing
[ARGOS-MARKETPLACE]: https://github.com/marketplace/argos-ci
[ARGOS-REPO]: https://github.com/argos-ci/argos
[ARGOS-CHANGELOG]: https://argos-ci.com/changelog
[ARGOS-SELFHOST]: https://github.com/argos-ci/argos/discussions/1811
[LOSTPIXEL-PRICING]: https://www.lost-pixel.com/pricing
[LOSTPIXEL-SUNSET]: https://www.lost-pixel.com/blog/lost-pixel-team-is-joining-figma
[LOSTPIXEL-REPO]: https://api.github.com/repos/lost-pixel/lost-pixel
[BACKSTOP-REPO]: https://github.com/garris/BackstopJS
[BACKSTOP-COMMITS]: https://api.github.com/repos/garris/BackstopJS/commits?per_page=1
[BACKSTOP-NPM]: https://registry.npmjs.org/backstopjs/latest
[METICULOUS-HOW]: https://www.meticulous.ai/how-it-works
[METICULOUS-DOCS]: https://app.meticulous.ai/docs
[METICULOUS-CHANGELOG]: https://app.meticulous.ai/changelog
[CHECKLY-PRODUCT]: https://www.checklyhq.com/product/synthetic-monitoring/
[CHECKLY-VISUAL]: https://www.checklyhq.com/docs/detect/synthetic-monitoring/browser-checks/visual-regressions/
[CHECKLY-PRICING]: https://www.checklyhq.com/pricing/
[RENOVATE-ONBOARDING]: https://docs.renovatebot.com/getting-started/installing-onboarding/
[STORYBOOK-INSTALL]: https://storybook.js.org/docs/get-started/install
[BIOME-MIGRATE]: https://biomejs.dev/reference/cli/
