# Frontguard — Product-Completion Plan

*Authored 2026-06-14 by the orchestration coordinator. Anchored to
[`docs/research.md`](./research.md) (mid-2026 competitive bar) and
[`docs/adversarial-review.md`](./adversarial-review.md) (audit of the current
codebase). **This document is the frozen boundary.** Every item in §IN and
§FIX is built to full depth in the build that follows. Nothing in IN may
be thinned, mocked, stubbed, or shortened to ship faster. Anything not in
IN or FIX is, by definition, ROADMAP.*

> **Positioning the build executes against:** "AI-powered frontend visual
> regression testing for web teams — detect, understand, and fix visual bugs
> before they ship to production."

---

## 0. One-paragraph product definition

Frontguard is a complete visual-regression-testing product. A developer
installs `@frontguard/cli`, runs `frontguard init` to get a working
configuration, and runs `frontguard run` to catch visual regressions against
a baseline branch with multi-render anti-flake consensus, AI classification,
and structured fix suggestions that are sandbox-verified before being
proposed. In CI, the GitHub App / GitHub Actions composite + the
Vercel / Netlify / Slack integrations post a PR comment carrying baseline /
current / diff thumbnails and the AI explanation, and a one-click accept
flow updates baselines. A self-hostable cloud platform (Cloudflare Workers
+ D1 + R2, with a Docker-Compose alternative) provides team baselines,
history, flake-score badges, spend cap alerts, billing, and a Storybook
integration. An MCP server exposes the current PR's regressions and fix
suggestions to in-IDE coding agents (Claude Code, Cursor, Copilot). A
rendered demo GIF, an honest validation-results table run against five real
OSS repos, marketplace listings on GitHub / Vercel / Netlify / Slack App
Directory, and a Docker render image complete the distribution surface.
The README, landing, docs, and dashboard speak with one voice, with no
fabricated claims, no broken links, and a consistent set of feature
counts, version numbers, and import paths.

That is the bar. Everything below is the build order to reach it.

---

## 1. FIX — must-repair items inherited from the audit

These are the P0/P1/P2 findings from
[`docs/adversarial-review.md`](./adversarial-review.md). The IDs are stable
across the rest of the build — worker task specs reference them directly.

### P0 (blocks calling Frontguard a product) — 13 items

| ID | Fix | Affected files |
|----|-----|----------------|
| **P0-1** | Settle on `@frontguard/cli` as the canonical CLI package name; replace every `frontguard` / `npm install -g frontguard` / `frontguard@latest` mention in code, templates, marketing copy, and CI examples. The bare-`frontguard` name is unowned. | `apps/landing/src/components/GettingStarted.tsx`, `apps/landing/index.html` (SEO fallback × 3+), `apps/docs/content/docs/installation.mdx`, `apps/docs/content/docs/ci-cd/github-actions.mdx` (× 5), `packages/cli/src/core/config.ts:524`, `packages/cli/src/templates/github-actions.ts`, `packages/cli/action.yml`, `packages/cloud-api/src/snapshot.ts:24`, `packages/cloud-api/src/daytona-runner.ts:109`, `integrations/netlify/README.md` |
| **P0-2** | Pick ONE env-var convention — `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` is the right choice (no namespace collision). Update doctor, the CI template, the GitHub-Actions docs, and any other surface. The Playwright plugin keeps accepting either. | `packages/cli/src/cli/doctor.ts:209-210`, `packages/cli/src/templates/github-actions.ts:89-90`, `apps/docs/content/docs/ci-cd/github-actions.mdx:87-89` |
| **P0-3** | Fix the generated `init` config import: `import type { FrontguardConfig } from '@frontguard/cli'` (and add the matching type-only `exports` mapping if needed). | `packages/cli/src/core/config.ts:524`, `packages/cli/package.json` exports map |
| **P0-4** | Every docs plugin guide must import from `@frontguard/cli/plugins` and use the real exported names (`createFigmaPlugin`, not `figmaPlugin`). | `apps/docs/content/docs/guides/accessibility.mdx`, `production-monitoring.mdx`, `custom-plugins.mdx`, `ai-fixes.mdx`, `performance-budgets.mdx`, `third-party-scripts.mdx` |
| **P0-5** | Remove or replace every fabricated marketing stat from `apps/landing/index.html`: the `aggregateRating` block (`:69-75`), "200 visual regressions / 87% accuracy" (`:285`), "2,000 weekly downloads" (`:342`), Stripe / Testim / Software-House citations, the author bio paragraph + the `@anthropicdev` X handle (`:417-418`), the `© 2025` footer (`:463`). | `apps/landing/index.html` |
| **P0-6** | Decide the cloud's reality and execute. **Decision:** the cloud is real. Unify `packages/cloud-api/app/src/index.js` (the deployed Math.random() shim) and `packages/cloud-api/src/` (the Hono / D1 / R2 / Stripe source of truth) onto a single Workers-compatible runtime, replace the `Math.random()` diff path with the real pipeline, fix every `process.env` / `process.on` Node-only call to read `env` bindings, and stand up `api.frontguard.dev` on Cloudflare Workers. | `packages/cloud-api/app/src/index.js`, `packages/cloud-api/src/index.ts`, `packages/cloud-api/src/processor.ts`, `packages/cloud-api/src/entry.ts` |
| **P0-7** | Patch the Stripe webhook to refuse all events when secrets are unset (currently any unauthenticated POST flips any team to `business`). | `packages/cloud-api/src/routes/billing.ts:69-75` |
| **P0-8** | Fix the GitHub App's preview-URL inference — derive the real preview deploy URL (Vercel preview, Netlify deploy preview, or the configured project base) instead of forwarding `pull_request.html_url`. | `integrations/github-app/src/handler.ts:181` |
| **P0-9** | Fix the GitHub App's bootstrap config to import from `@frontguard/cli`, not the non-existent `@frontguard/core`. | `integrations/github-app/src/github-api.ts:336` |
| **P0-10** | Fix the Slack app: persist OAuth tokens (multi-team KV / D1 store), then actually queue a run on `/frontguard status <url>`. The slash command must execute, not just `response_type: ephemeral` an empty acknowledgement. | `integrations/slack-app/src/handler.ts:103-106`, `integrations/slack-app/src/events.ts:75-80` |
| **P0-11** | Fix the Netlify plugin's failure detection: inspect the cloud-api's actual response shape (`results[].status === 'failed'`), not the invented `results.changed`. Publish `@frontguard/netlify-plugin` to npm so the README install step works. | `integrations/netlify/lib/core.js:228`, `integrations/netlify/package.json` |
| **P0-12** | Run `validation/run-external.sh` against the 5 OSS repos, fill `validation/results-v0.2.md` with measured TP / FP / FN and classification accuracy. The landing-page accuracy claims must source from this file — never a literal number in marketing copy. | `validation/run-external.sh`, `validation/results-v0.2.md`, `validation/results/` |
| **P0-13** | Remove the `SoftwareApplication` `aggregateRating` structured-data block (`apps/landing/index.html:69-75`) before any Google indexing — publishing a fake aggregate rating is a Google Search policy violation that can blacklist the domain from rich results. | `apps/landing/index.html` |

### P1 (a paying customer would call it out) — 11 items

| ID | Fix |
|----|-----|
| **P1-1** | Reconcile every "N tests / N source files / N KB bundle" number across README, CHANGELOG, docs index. Generate from `scripts/stats.ts` at build time; never freeze a number in prose. |
| **P1-2** | Render `demo/frontguard-demo.gif` (and `demo/frontguard-report.mp4`); wire `DemoSection` to actually load the GIF (currently no code path uses it). |
| **P1-3** | When `discovery` already failed with ECONNREFUSED, bail with one clear error instead of falling back to `/` and producing three more identical errors per render. |
| **P1-4** | Daytona sandbox: either build & publish the `frontguard-playwright-v1` snapshot and ship a `frontguard-render` binary, or remove the Daytona path and stop advertising it. Decision: **ship it** — the local sandbox plus the snapshot path is the moat for sandbox-verified fixes. |
| **P1-5** | Vercel integration: accept arbitrary preview hostnames or expose an allowlist in the integration config. The `*.vercel.app` lock-in breaks the common custom-domain case. |
| **P1-6** | Slack / GitHub-App / Vercel / Netlify integrations: ship a README (and a docs page) for each, documenting env vars, deploy target, and registration steps. |
| **P1-7** | Fix the docs's "3 built-in plugins" / "395 tests" / "v0.1.0" version-stamped lines. |
| **P1-8** | Reposition README + landing + docs so all three say the same thing. Today they differ — "Visual regression testing for Playwright" vs "AI-powered frontend visual regression testing." Pick one and use it everywhere. |
| **P1-9** | `apps/landing/index.html:417-418` author bio + Twitter — replace placeholder with the real author bio and `@ravidsrk` handle. |
| **P1-10** | The GitHub Check Run callback fails silently when `FRONTGUARD_CALLBACK_SECRET` / `PUBLIC_BASE_URL` are unset. Add an explicit startup warning. |
| **P1-11** | CI examples using `uses: ravidsrk/frontguard@main` must point at a tagged version (`@v1`), not `main`. |

### P2 (polish, but everything ships polished) — 10 items

| ID | Fix |
|----|-----|
| **P2-1** | `apps/landing/public/sitemap.xml` — list the docs + comparison + migration subpages; update `lastmod`. |
| **P2-2** | Footer copyright year drift (`apps/landing/index.html:463` vs `Footer.tsx:73`). |
| **P2-3** | `/health` version drift (`packages/cloud-api/src/index.ts:123` reports `0.1.0` while everything else is `0.2.0`). |
| **P2-4** | `alerts/index.ts:28-33` — fingerprint dedup ignores severity, so escalating regressions don't re-alert. Add `severity` or `diffPercentBucket` to the fingerprint. |
| **P2-5** | `scheduler.ts:57` — hardcoded `chromium` browser overrides per-monitor config. Honor the monitor's `browsers` field. |
| **P2-6** | Verify the `alerts@frontguard.dev` domain in Resend (and document it) before any alert emails go out. |
| **P2-7** | `GitHubStars.tsx` — ensure the badge shows a number even when offline / rate-limited. |
| **P2-8** | `apps/docs/content/docs/cli/commands.mdx:35` — drop the duplicate `--update-baselines` flag listing if the canonical command is `frontguard update-baselines`. |
| **P2-9** | Netlify plugin defaults `CONTEXT='deploy-preview'` and so runs on every local build. Default to "do nothing if `CONTEXT` is unset." |
| **P2-10** | Resend "from" address & all activity-feed PII paths — needs a redaction & retention policy doc before customers see it. |

---

## 2. IN — every feature/flow that belongs in the full product

Each area is built end-to-end with no stubs, no placeholder UI, no
"coming soon," and full coverage of loading / empty / error / edge states.
Every IN area writes tests; the reviewer worker fails the task if tests
are absent or fail. Per-area acceptance criteria are listed under each
area's header.

### IN-1 — Critical path: install → init → doctor → run → AI → fix

The journey from `npm install` to "I see a real diff explained by AI" works
end-to-end on a fresh machine with no special configuration.

**Acceptance:**
- A fresh `mkdir t && cd t && git init && npm install @frontguard/cli`
  succeeds and resolves the published package.
- `npx frontguard init` writes a buildable `frontguard.config.ts` that
  TypeScript compiles without errors.
- `npx frontguard doctor` reports correctly whether `FRONTGUARD_OPENAI_KEY` /
  `FRONTGUARD_ANTHROPIC_KEY` are set, agreeing exactly with the env-var
  contract the runtime uses.
- `npx frontguard run --url <localhost>` against an unreachable URL exits
  with one clear error message, not four ECONNREFUSEDs.
- `npx frontguard run --url <real URL>` produces a `report/` directory with
  baseline / current / diff PNGs and an AI classification + suggested fix
  for each regression.
- `npx frontguard update-baselines` accepts the current run as new baseline.
- Includes: P0-1, P0-2, P0-3, P0-4, P1-3.

### IN-2 — Cloud-api: real platform, not Math.random()

Unify the two implementations into a single Cloudflare Workers deployment
backed by D1, R2, and KV; replace the deployed shim's `Math.random()` diff
with the real pipeline; provision `api.frontguard.dev`. The cloud is the
backbone of every integration; it must work or every other surface is dead.

**Acceptance:**
- Single source of truth — the Hono app in `packages/cloud-api/src/` builds,
  passes type-check, and deploys to Workers (`npm run deploy` via
  `wrangler.toml`). The `app/src/index.js` shim is deleted or replaced by
  the Hono build artifact.
- Every `process.env.X` / `process.on(...)` / Node-only API is replaced by
  the Workers `env` binding pattern. `processor.ts:26` no longer
  short-circuits to a `Math.random()` path on Workers.
- `POST /v1/runs` produces a real diff result (or hands off to the queue)
  for a screenshot pair submitted by the CLI.
- `api.frontguard.dev` is live on a Workers route, with a documented public
  health check that returns the canonical product version.
- Includes: P0-6, P0-7, P0-15 (Stripe), P2-3 (`/health` version).
- Tests: integration tests for `/v1/runs`, `/v1/billing/webhook` (Stripe
  signed event accepted, unsigned rejected), `/health`.

### IN-3 — Integrations to full depth, each with its own README and marketplace listing

Each of the four integrations is repaired to work end-to-end and is
published to its respective marketplace.

#### IN-3a — Slack App

- **Acceptance:** OAuth callback persists `{ team_id → bot_token }` into KV
  / D1. `/frontguard status <url>` actually enqueues a run via the cloud-api
  and posts the result back to the channel when complete. The Slack
  manifest deploys against `https://slack.frontguard.dev` (or a documented
  alternative), not `example.com`. Listed in Slack App Directory.
- Includes: P0-10, P1-6.

#### IN-3b — GitHub App

- **Acceptance:** Webhook receives `pull_request` events, infers the
  preview deploy URL (Vercel preview detection, Netlify deploy-preview
  detection, configured `previewUrlTemplate` fallback), submits a run to
  cloud-api, posts a Check Run + PR comment with thumbnails. Bootstrap PR
  emits a `frontguard.config.ts` that imports from `@frontguard/cli`. App
  published to GitHub Marketplace (free tier).
- Includes: P0-8, P0-9, P1-6, P1-11.

#### IN-3c — Netlify Build Plugin

- **Acceptance:** `@frontguard/netlify-plugin` is published to npm. The
  plugin reads the deploy URL from `process.env.DEPLOY_PRIME_URL`, runs
  `frontguard run` against it, fails the build when any
  `results[].status === 'failed'`. README install step works. Listed in
  the Netlify Build Plugins marketplace.
- Includes: P0-11, P1-6, P2-9.

#### IN-3d — Vercel Integration

- **Acceptance:** Accepts any preview hostname for projects the user has
  connected (via Vercel OAuth scopes), not only `*.vercel.app`. Documents
  the allowlist behaviour. Published to Vercel Integration Marketplace.
- Includes: P1-5, P1-6.

### IN-4 — Landing page rebuild

Positioning-led conversion landing page that tells the truth.

**Acceptance:**
- Hero, problem, solution, features, comparison, demo, getting-started,
  FAQ, and footer sections — each with real copy, no AI-generated stats,
  no fabricated citations, no placeholder bio.
- Every install line points at `@frontguard/cli`.
- The demo section loads `demo/frontguard-demo.gif` (rendered as part of
  IN-5).
- The comparison table reflects T2's research — Frontguard vs Percy /
  Chromatic / Argos with documented behaviour, not marketing puffery.
- Real author bio with the correct X / GitHub handles.
- The `<script type="application/ld+json">` block describes a
  `SoftwareApplication` with `offers` but no `aggregateRating` (since no
  rating source exists).
- Footer copyright tracks current year.
- Sitemap.xml lists the docs / comparison / migration pages.
- Open Graph image regenerated and tested.
- Responsive on every viewport (sm, md, lg, xl). Lighthouse score ≥ 90
  for Performance, Accessibility, Best Practices, SEO on the production
  build.
- Includes: P0-5, P0-13, P1-2, P1-9, P2-1, P2-2.

### IN-5 — Demo asset

The marketing demo exists as a real artifact.

**Acceptance:**
- `demo/frontguard-demo.gif` is rendered from `demo/frontguard-demo.tape`
  and committed.
- `demo/frontguard-report.mp4` is rendered and committed (or replaced
  with a documented alternative format).
- `apps/landing/src/components/DemoSection.tsx` actually loads the GIF
  and falls back to the terminal mock only when the GIF asset 404s.
- README and docs index reference an asset that exists.
- Includes: P1-2.

### IN-6 — Docs reconciliation

Every doc page agrees with the code; every install snippet copy-pastes
into working state.

**Acceptance:**
- `apps/docs` builds clean.
- Every plugin guide imports from `@frontguard/cli/plugins` and uses real
  export names.
- Every install snippet uses `@frontguard/cli`.
- Stale numbers ("3 plugins / 395 tests / v0.1.0 / 142KB bundle") replaced
  by build-time-injected values from `scripts/stats.ts` (or removed).
- `vs Argos` comparison page added.
- README + landing + docs all use the same positioning sentence.
- Migration guides for BackstopJS and Lost Pixel updated for the
  Lost-Pixel-sunset reality.
- Includes: P1-1, P1-7, P1-8, C-7 (3 vs 5 plugins).

### IN-7 — Cross-OS render normalisation

The reason teams abandon Playwright built-in. Frontguard ships a
Dockerised renderer image so baselines render identically regardless of
the developer's OS.

**Acceptance:**
- `packages/cli/docker/Dockerfile` builds a renderer image with pinned
  Chromium / Firefox / WebKit versions + system fonts.
- `frontguard run --docker` runs the renderer in the image rather than on
  the host.
- The cloud-api's Daytona snapshot (IN-8) uses the same image so cloud
  renders are byte-equivalent to local Docker renders.
- A `docs/cross-os-rendering.mdx` page documents the trade-off (build
  time vs determinism) and the recipe.

### IN-8 — Fix-pattern verification: Daytona path real

The "verified fix" loop is a Frontguard moat — but the Daytona path
currently references an unbuilt snapshot and a non-existent binary.

**Acceptance:**
- `scripts/build-daytona-snapshot.ts` builds the `frontguard-playwright-v1`
  snapshot using the IN-7 Docker image as the base.
- A `frontguard-render` thin wrapper binary is built and bundled in the
  snapshot.
- `packages/cli/src/sandbox/daytona.ts` end-to-end test passes against a
  real Daytona instance (gated on `DAYTONA_API_KEY` env in CI).
- Local sandbox (`sandbox/local.ts`) remains the no-config default;
  Daytona is opt-in via the cloud-api setting.
- Includes: P1-4.

### IN-9 — Storybook integration

Half of the VRT audience uses Storybook. The thin Storybook detector +
`play()`-function support is the minimum required to compete.

**Acceptance:**
- `frontguard init` detects an existing Storybook (looks for
  `.storybook/main.ts` / `main.js`) and offers to scaffold a
  Storybook-aware config.
- `frontguard.config.ts` supports a `storybook: { url, stories }` block
  that enumerates story IDs.
- The new `packages/cli/src/discovery/storybook.ts` adapter walks the
  Storybook iframe, runs each story's `play()` function (if any), and
  produces a screenshot per story × viewport.
- Docs page `docs/integrations/storybook.mdx` with copy-paste recipe.
- Tests: a fixture Storybook in `packages/cli/__fixtures__/storybook/`
  with two stories, one with `play()`.

### IN-10 — MCP server (`@frontguard/mcp`)

Applitools and Chromatic shipped MCP in H1 2026. Frontguard without one
reads as dated within six months.

**Acceptance:**
- New package `packages/mcp` published as `@frontguard/mcp`.
- Exposes `frontguard-mcp` binary; runs as `npx @frontguard/mcp`.
- Tools provided: `list_regressions(pr_id)`, `get_suggested_fix(diff_id)`,
  `accept_baseline(diff_id)`, `recent_runs(repo, branch)`.
- Authenticated via the cloud-api's existing API-key system.
- Docs page `docs/integrations/mcp.mdx` with `mcp.json` snippets for
  Claude Code, Cursor, Copilot.
- Tests: stub MCP client exercises each tool.

### IN-11 — Cloud dashboard polish

The cloud-api SSR dashboard is the customer-facing review UI. It must be
on-par with what Argos / Chromatic provide for the table-stakes paths.

**Acceptance:**
- Per-test history view (commits the test ran across, pass/fail/flaky).
- Argos-style flake badge with a 0–100 stability score, computed from the
  anti-flake consensus history.
- Side-by-side baseline / current / diff comparison page with
  pixel-overlay ↔ heatmap toggle.
- Bulk-approve: select N diffs by category (AI classification) and accept
  baselines in one POST.
- "Ignore region forever" — paint a rectangle in the diff view, persist as
  a `mask` on the affected route.
- Trace / DOM-snapshot / console-log attached to each regression result
  (downloadable links).
- Spend cap UX: a "you're at 80% of your plan" alert on the dashboard
  header + the same as an email through Resend.
- Includes: P2-4 (alert fingerprint), P2-5 (scheduler browsers).

### IN-12 — Self-host story

The OSS / self-host pitch must be real, with a working recipe.

**Acceptance:**
- `packages/cloud-api/docker-compose.yml` runs the full backend locally
  (Workers-equivalent runtime via `miniflare`, plus SQLite-in-place-of-D1
  and a local-disk-in-place-of-R2 adapter).
- `docs/self-host.mdx` documents the recipe and lists the trade-offs vs
  the hosted version.
- The landing page's "Self-host: yes" claim links to this page.

### IN-13 — Validation: actually run the harness

The "AI is N% accurate" claim must source from a real measurement.

**Acceptance:**
- `validation/run-external.sh` runs against the five repos in
  `validation/repos.json` (shadcn-ui taxonomy, shadcn-ui next-template,
  chakra-ui-docs, medusajs storefront, shuding nextra).
- `validation/results/` contains the per-repo TP/FP/FN counts.
- `validation/results-v0.2.md` is filled with measured accuracy,
  false-positive rate, and per-classification breakdown.
- The landing page's accuracy claim sources its number directly from this
  file (via a build-time injection or hardcoded with a citation).
- If accuracy < 70%, the launch gate fires: tune the prompt and re-run
  before any accuracy number ships on the marketing site.
- Includes: P0-12.

### IN-14 — Marketplace publication

Code that exists but is unpublished is code that doesn't ship. Each
integration in IN-3 must be listed on its marketplace.

**Acceptance:** Published in:
- GitHub Marketplace (GitHub App + composite Action).
- Vercel Integration Marketplace.
- Netlify Build Plugins.
- Slack App Directory.
- `@frontguard/cli`, `@frontguard/playwright`, `@frontguard/netlify-plugin`,
  `@frontguard/mcp` published to npm with current version numbers.

### IN-15 — P1/P2 polish pass

The 11 P1 and 10 P2 items not already absorbed by IN-1…IN-14 are addressed
in a polish pass:

- P1-10: cloud-api startup warns when callback secrets are unset.
- P2-6: Resend "from" address (`alerts@frontguard.dev`) verified in Resend
  console and documented.
- P2-7: GitHubStars badge falls back to a static number when offline.
- P2-8: drop the duplicate `--update-baselines` flag in CLI docs.
- P2-10: redaction / retention policy documented for the activity feed.

### IN-16 — Honest accessibility-fused AI claim

Frontguard fuses axe-core findings into the AI vision prompt — no
competitor advertises this. Verify it actually works on real diffs as
part of IN-13, then market it.

**Acceptance:**
- A regression on a fixture page that breaks a focus outline (no visual
  diff, axe-core failure) is correctly classified as `accessibility:
  focus-outline-removed` with a fix that restores the rule.
- The landing-page feature copy ("AI sees what axe-core sees") is sourced
  from this fixture run.

---

## 3. ROADMAP — genuine post-v1 scope, deliberately deferred

These items are real but advanced. Frontguard ships v1.0 without them; v1.x
and v2 add them in this order.

| # | Item | Why deferred |
|---|------|--------------|
| R-1 | Auto-accept infrastructure diffs (Chromium upgrade classifier) | Applitools shipped this in June 2026; requires tracking browser-engine version per baseline and a classifier that can disambiguate "engine upgrade" from "code change." Implement once IN-2 cloud is stable and we have baseline metadata to track engine versions. |
| R-2 | Fine-tuned visual model | Meaningful only after ≥10K real diffs through the system; uses fix-pattern DB as training input. v2 work. |
| R-3 | Community fix-pattern marketplace | Depends on cumulative real-user data. v2 work. |
| R-4 | Mobile-app screenshots (iOS Simulator, Android Emulator) | Different rendering pipeline (Appium / Maestro), different audience (Drizz / Panto / Applitools Mobile). Deliberate non-scope for the web-team positioning. |
| R-5 | Production visual monitoring as a sold tier | Monitor plugin and scheduler exist; selling it as "Datadog-for-frontend" with SLO alerting is a separate GTM motion. v1.x. |
| R-6 | SAML SSO + SCIM provisioning | Enterprise gate; Argos and Chromatic both reserve this to Enterprise. On-demand, with paid customer ask. |
| R-7 | On-prem cloud deployment (single-tenant) | Self-host (IN-12) is the OSS path; full on-prem support contract is sold per-customer. |
| R-8 | Agent-driven visual checks without baselines (Qtrl.ai approach) | Research bet; semantic-only checks that ask "does this page make sense" rather than diffing. Not table-stakes for v1. |
| R-9 | Acceptance bands for non-deterministic regions | Statistical-range matching rather than exact diff; useful for ad surfaces and personalised content. v1.x. |
| R-10 | Native Figma plugin (Community store listing) | Frontguard already does design-vs-prod comparison; the Figma Community store listing is the polish item. v1.x. |
| R-11 | Bulk-approve by AI category in the dashboard (advanced) | The basic bulk-approve gesture is IN-11. Category-aware bulk approval (Applitools June 2026) requires the AI classifier's confidence calibration to be trusted, which is a v1.x maturity item. |
| R-12 | Run-over-run Core-Web-Vital SLO alerting | The deltas ship as part of the existing report; selling SLO-alerts on top of them is a separate product motion. v1.x. |
| R-13 | Vercel Marketplace billing integration (Stripe-via-Vercel) | Initial Vercel listing in IN-3d uses standalone billing; integrated-billing-via-Vercel is a v1.x upgrade. |
| R-14 | Chromatic-style branched MCP per PR (an MCP that lives at `<pr>/mcp` and exposes that PR's regressions to an in-IDE agent for self-correction) | The MCP server (IN-10) ships with global tools; per-PR ephemeral MCP endpoints are a v1.x extension. |

ROADMAP items go into `docs/ROADMAP.md` (refreshed after IN ships) with
honest "shipping when X" gates. No item in IN may be moved here mid-build;
new ideas surfaced during the build land in ROADMAP if they're genuine
future scope, not as a way to ship less of v1.

---

## 4. Build order and dependency graph

The pipeline runs in waves. Tasks in the same wave run as parallel
implementer+reviewer worker pairs; tasks across waves serialize on the
dependencies listed.

### Wave A — Critical path (CLI install → AI fires)

- **T4** — IN-1 critical-path repair. Resolves P0-1, P0-2, P0-3, P0-4,
  P1-3. (Blocks: T5 landing copy uses `@frontguard/cli`; T6 cloud
  Stripe-secret guard isolated to its own task; T_FINAL.)

### Wave B — In parallel with T4 (no file overlap)

- **T5** — IN-4 landing rebuild. Resolves P0-5, P0-13, P1-2 (asset
  reference only — actual render in T17), P1-9, P2-1, P2-2.
- **T6** — IN-2 cloud-api unification. Resolves P0-6, P0-7, P2-3.

### Wave C — Cloud-dependent integrations (gated on T6)

- **T7** — IN-3a Slack app (P0-10, P1-6 Slack).
- **T8** — IN-3b GitHub App (P0-8, P0-9, P1-6 GH-App, P1-11).
- **T9** — IN-3c Netlify plugin (P0-11, P1-6 Netlify, P2-9).
- **T10** — IN-3d Vercel integration (P1-5, P1-6 Vercel).

These four run in parallel — they touch disjoint files under
`integrations/`.

### Wave D — Independent of cloud (in parallel with Wave C)

- **T11** — IN-7 Docker render image + cross-OS docs.
- **T12** — IN-9 Storybook integration.
- **T13** — IN-10 MCP server (`@frontguard/mcp`).
- **T14** — IN-6 docs reconciliation (P1-1, P1-7, P1-8; vs Argos page).

### Wave E — Cloud-dashboard work (gated on T6)

- **T15** — IN-11 dashboard polish (history, flake badge, side-by-side,
  bulk-approve, ignore-region, trace attachment, spend cap UX).
- **T16** — IN-12 self-host docker-compose + docs.
- **T17** — IN-5 demo render (VHS → GIF + MP4; wires DemoSection).
- **T18** — IN-8 Daytona snapshot + frontguard-render binary (P1-4).

### Wave F — Validation + marketplace (gated on Wave C + E)

- **T19** — IN-13 validation harness run + results + landing-page accuracy
  number wiring (P0-12).
- **T20** — IN-14 marketplace publication (npm, GitHub Marketplace,
  Vercel Marketplace, Netlify Marketplace, Slack App Directory).

### Wave G — Polish + verification

- **T_POLISH** — IN-15 P1/P2 catch-all + full-product consistency pass
  (visual language coherence between landing/docs/app; no console errors
  anywhere; no broken links; coherent positioning everywhere; IN-16
  a11y-fused-AI claim verified against the IN-13 fixture).
- **T_FINAL** — IN-17 launch verification + `docs/launch-readiness.md`.
  Walk the entire product as a new user. Confirm every IN feature is
  complete to real depth, the ROADMAP is honest, the build / lint / tests
  are green, the entire shipping surface is consistent.

### Gating rules

- A task is **done** only when implementer + fresh reviewer both pass.
  Reviewer fails the task if: tests are absent or red, lint / typecheck
  red, a feature in the task's IN-block is stubbed / mocked / thinned,
  reachable UI ships a "coming soon," any reachable surface has console
  errors, the area's docs aren't updated.
- The boundary is frozen. New scope discovered mid-build → ROADMAP entry,
  recorded in `docs/DECISIONS.md`. Items inside IN may not be thinned to
  ship faster — any temptation to shortcut becomes a ROADMAP deferral
  decision documented in `docs/DECISIONS.md` and reviewed by the
  coordinator before the worker proceeds.
- Coordinator merges each PR with a clean, author=`ravidsrk`,
  trailer-free squash-commit; `ship-progress.md` updates after each merge.

---

## 5. Landing-page rebuild brief

Detailed brief for **T5 (IN-4)** so the worker has a single source of
truth. Worker reads this section before starting.

**Positioning sentence (canonical, used verbatim on landing, README,
docs hero):** "AI-powered frontend visual regression testing for web
teams — detect, understand, and fix visual bugs before they ship to
production."

**Above the fold:**
- Hero headline: "Visual bugs ship past every other test. Frontguard
  catches them."
- Sub-head: the positioning sentence.
- Two CTAs: **Install (primary, → #install)** and **See it work
  (secondary, → #demo)**.
- A real demo GIF (loaded from `/demo/frontguard-demo.gif`) renders
  inline above the fold — not below.

**Body sections (in order):**
1. **Problem** — "Why pixel-diff alone fails": three concrete failure
   modes pulled from T2 research (Lost-Pixel-sunset / Playwright-built-in
   cross-OS flake / Percy-Chromatic price cliff). One short paragraph
   each, no fabricated stats.
2. **How it works** — Detect (anti-flake consensus + SSIM) →
   Understand (AI classifies what changed) → Fix (sandbox-verified
   patch). One sentence per pillar, plus a one-line illustration.
3. **Features grid** — six tiles, each with a real screenshot or
   inline code snippet: anti-flake, AI classification, sandbox-verified
   fixes, plugin architecture, CI-native, self-hostable.
4. **Comparison table** — vs Percy / Chromatic / Argos. Pulled directly
   from T2's competitive matrix. Each row is a feature from the
   table-stakes set; each column reflects documented competitor
   behaviour. No "✅ vs ❌" pattern; every cell has a short label
   describing the reality (e.g. "$179/mo · Chrome-only on Free").
5. **Quick start** — three tabs: CLI, Playwright plugin, GitHub Action.
   Each tab's first line is `npm install …` and uses `@frontguard/cli`.
6. **Trust** — Validation results (accuracy/FPR/FN) **only if IN-13 has
   landed and produced honest numbers**. Until then, this section is
   "Validation results coming soon (see [`validation/results-v0.2.md`])"
   linked to the harness. Either way, no fabricated percentages.
7. **Pricing** — Free CLI forever (BYO AI key) + Pro $29/mo (cloud +
   GitHub App + dashboard) + Enterprise (custom). Stripe checkout link
   wired live in T15.
8. **FAQ** — Eight questions sourced from T1's audit gaps: install
   process, cross-OS rendering, self-host story, env-var convention,
   AI key choice (OpenAI vs Anthropic), Storybook support, MCP support,
   data retention.
9. **Footer** — copyright = current year (live, from JS), real social
   handles (`@ravidsrk`), real GitHub repo link, sitemap links to docs +
   comparison + migration pages.

**Forbidden content (from P0-5 / P0-13):**
- Any `aggregateRating` block in structured data.
- Any unsourced percentage ("87% accuracy", "94% precision").
- Any unsourced download number ("2,000 weekly downloads").
- Any fabricated citation (Stripe survey, Software-House report,
  Testim report). If a stat appears, it cites a fetchable URL.
- The `@anthropicdev` X handle or the AI-generated author bio.

**Visual language coherence:**
- Reuses the existing typography stack (Outfit + Plus Jakarta + JetBrains
  Mono) and color tokens — the visual design is good. Do not redo this.
- The SEO fallback HTML in `index.html` is rewritten to mirror the
  React tree exactly (no separate AI-essay-flavored fallback paragraph).
- Open Graph image regenerated to match the new hero treatment.

**Acceptance gates (reviewer enforces):**
- Lighthouse ≥ 90 across Performance / A11y / Best Practices / SEO on
  the production build.
- No fabricated stats; every percentage cites a source.
- Every install snippet uses `@frontguard/cli`.
- The demo GIF loads inline (no terminal-mock fallback rendered when
  the asset exists).
- Mobile responsive verified at 375px, 768px, 1440px.
- No console errors in production build.

---

## 6. App UI/UX plan — every IN flow at a polished standard

For the cloud-side dashboard (IN-11), the flows below are built to
real-product depth. Each flow has its own loading / empty / error /
edge state. No reachable screen is a dead end.

### 6.1 Sign-up + onboarding (IN-3b GitHub App + IN-11 dashboard)

- User clicks "Sign in with GitHub" → GitHub App OAuth → returns with
  installation id → cloud-api creates / updates the team record →
  redirect to `/teams/<slug>/onboarding`.
- Onboarding wizard: (1) Select repos to enable, (2) Confirm baseline
  branch (default `frontguard-baselines`), (3) Set AI provider key
  (OpenAI / Anthropic / skip), (4) Trigger first run on a chosen PR.
- Empty state when no PRs: "Open a PR with a UI change, or trigger a
  run manually with `frontguard run`."
- Error state: GitHub App installation failed → clear message + retry
  link.

### 6.2 Run review (IN-11)

- Per-run page lists all routes × viewports × browsers; status badges;
  AI classification chip per regression.
- Side-by-side viewer: baseline / current / diff. Toggle pixel-overlay
  ↔ heatmap. Keyboard shortcuts: `←/→` next/prev regression, `A` accept
  baseline, `R` reject, `I` paint ignore region.
- AI explanation panel below the viewer; suggested fix as a diff block
  with "Copy patch" and (when sandbox-verified) "Apply via PR" buttons.
- Loading state: skeleton rows while the run uploads screenshots.
- Empty state: "No regressions detected." with a green check.

### 6.3 History + flake score (IN-11)

- Per-test history view: timeline of pass/fail/flaky across the last 30
  runs. Flake score 0–100 with the Argos-style colored badge.
- Filter by route, viewport, branch.
- Clicking a historic run navigates to its own page.

### 6.4 Bulk approve (IN-11)

- Multi-select regressions in the run page, group by AI classification
  category, "Accept N baselines" button posts a single `update-baselines`
  call to the cloud.
- Confirmation modal lists what's being accepted with a "back out"
  affordance.

### 6.5 Ignore regions (IN-11)

- "Paint mask" tool in the diff viewer: drag to draw a rectangle;
  modal asks "Persist as global mask on `<selector or rect>`?".
- Saved masks listed on `/teams/<slug>/settings/masks` with per-route
  scope.

### 6.6 Spend + billing (IN-11)

- Header progress bar showing usage / plan limit. Turns yellow at 80%,
  red at 95%.
- "Upgrade plan" CTA opens a Stripe checkout session.
- Billing page lists current plan, usage history, invoices, "Cancel"
  affordance.

### 6.7 Settings (IN-11)

- Team settings: members, API keys, baseline branch, AI provider key,
  webhook secret regeneration.
- Activity feed with PII redaction policy banner.

### 6.8 Self-host (IN-12)

- Public docs page with the docker-compose recipe.
- Landing page footer "Self-host" link → that page.

---

## 7. Boundary discipline — how the coordinator handles drift

Three failure modes the brief warns about. The coordinator decisions
for each:

1. **A worker proposes a new feature mid-task.** Coordinator response:
   capture in ROADMAP via `docs/DECISIONS.md`; the worker must finish
   the task as-defined.
2. **A worker proposes thinning an IN item to ship faster.** Coordinator
   response: reject. If the worker insists the IN item is unachievable
   as defined, the coordinator splits it into smaller IN items rather
   than thinning. The boundary frozen here covers depth; the only
   adjustment allowed during the build is *decomposition*, never
   *deletion*.
3. **A worker discovers an P0/P1 not in §1.** Coordinator response: add
   to §1 immediately, attach to the nearest task. New P0s do not get
   pushed to ROADMAP.

The reviewer worker for each task explicitly checks for these failure
modes during review and refuses to mark the task complete if it sees
any. The fresh-reviewer's mandate is "would a paying customer call
this complete?" — if the answer is no on any IN slice the task covered,
the task fails review and goes back to implementation.

---

## 8. The "complete and full-fledged" test

This plan ships if a new user can:

1. Land on `frontguard.dev`, see a real demo, read truthful copy.
2. Run `npm install @frontguard/cli && npx frontguard init` against a
   working project, with the generated config TypeScript-compiling on
   the first try.
3. Set `FRONTGUARD_OPENAI_KEY` and have `frontguard doctor` correctly
   say AI is configured.
4. Run `frontguard run --url <project>` and see a real diff + AI
   explanation + suggested fix.
5. Install the GitHub App, open a PR with a UI change, and see a PR
   comment with thumbnail triplet + AI explanation, with a working
   "Accept baseline" button posting to a live cloud-api.
6. (For Storybook teams) point `frontguard.config.ts` at a Storybook URL
   and get per-story screenshots in the same loop.
7. (For Vercel / Netlify users) connect the integration and get
   PR-comment flow without further config.
8. (For agentic-coding-tool users) add `@frontguard/mcp` to their
   Claude Code / Cursor / Copilot config and ask the agent "what
   regressions exist on this PR" and get a real answer.
9. (For self-host users) follow `docs/self-host.mdx` and have the cloud
   running on `localhost:8787` with all the same dashboard flows.

If any of those nine flows hits a dead end, broken state, or "coming
soon," the product is not complete and the build is not done.
