# Frontguard Roadmap

*Last updated: June 2026. Based on competitive research across 10 competitors, developer pain point analysis from Reddit/HN/GitHub, technology trend analysis, and GTM playbook research. Full research available internally (see project documentation).*

> **Status note (June 2026):** This document was reconciled against the actual
> codebase. The engine and platform shipped well ahead of the original plan —
> most of what earlier drafts listed as "v0.2, not started" is now built, tested,
> and documented. The honest remaining work is **distribution** (demo, launch,
> real-world validation) and a handful of **external-account integrations**, not
> core engineering.

---

# The Strategic Thesis

The visual regression testing market (~$1B, 9.5% CAGR) has a **retention crisis, not a demand crisis.** Teams try visual testing, get burned by false positives from cross-OS rendering differences, blind-approve everything, lose trust, and abandon the tool within months.

**The gap:** No tool combines CLI-first + AI vision analysis + Playwright-native + self-hostable + affordable. Percy is slow and expensive. Chromatic requires Storybook. Applitools is enterprise-only and opaque. Lost Pixel has no AI and is going stale. Playwright's built-in visual testing is notoriously flaky (428-day debugging battles documented).

**Frontguard's bet:** AI that understands *what changed and whether it matters* beats pixel-perfect comparison. The rendering layer is a commodity (Daytona, Browserbase, etc. commoditize it further every quarter). The moat is the intelligence layer — AI classification, auto-fix generation, and the fix pattern database that compounds with usage.

**The threat clock:** GitHub Copilot could add visual PR review in 12-18 months. Observability platforms (Datadog, Grafana) could bolt on visual monitoring in 12-24 months. We have a window, not infinite runway.

---

# What's Shipped

The core engine, the AI moat, the cloud platform, and the integration surface are all built and tested. This is a working product, not a prototype.

## Core engine (v0.1)

✅ **Anti-flake rendering** — Multi-render consensus via `findConsensusScreenshot()` (default `antiFlakeRenders: 3`), combined with SSIM perceptual matching. Solves the #1 reason teams abandon visual testing. Runs in <10 seconds where Percy adds 5+ minutes.

✅ **AI analysis & classification** — Dual-model analysis (GPT-4o + Anthropic vision). Classifies every diff as regression, intentional change, or content update, with severity scoring, confidence levels, and a `suggestedFix` field. When the accessibility plugin is active, axe-core findings for the page are **fused into the analysis prompt** so the model can correlate a visual change with a known a11y issue. No competitor has this.

✅ **Screenshot diffing** — Dual-engine: pixelmatch for pixel precision + a full SSIM implementation for perceptual matching.

✅ **CLI tool** — `run`, `init`, `update-baselines`, plus the commands below. Comprehensive flags for routes, viewports, thresholds, AI provider, and output formatting.

✅ **GitHub Action** — Composite `action.yml` with automatic preview-URL detection for Vercel and Netlify, JSON output parsing.

✅ **Route discovery** — Filesystem discovery for Next.js (App + Pages Router), Remix, SvelteKit, and Nuxt; live BFS crawl fallback for unknown frameworks.

✅ **Multi-viewport rendering** — Default 375 / 768 / 1440px, fully configurable; every route tested at every viewport.

✅ **Baseline management** — Git orphan-branch storage with worktree reads/writes and concurrent-update detection. Baselines live in version control, not a third-party cloud.

✅ **Figma design compliance** — Figma plugin connects to the Figma API, exports frames as PNGs, and reports pixel deviations between design intent and rendered pages.

## Earn-trust release (v0.2)

✅ **PR thumbnail grid** — PR comments embed before/after/diff thumbnails (`renderImageGrid()` in `report/github-pr.ts`) backed by a 4-backend image-upload layer (`storage/image-upload.ts`): Cloudflare R2, AWS S3, GitHub Actions artifacts, and local filesystem. Configured via `imageUpload` in the config.

✅ **Per-route threshold overrides** — `routes` accepts objects with per-route `threshold`, `ignore`, and `viewport`, resolved by `resolveThreshold()` in the pipeline:
```typescript
routes: [
  { path: '/checkout', threshold: 0.001 },           // strict
  { path: '/blog/*', threshold: 0.05 },              // lenient
  { path: '/pricing', ignore: ['.testimonial-carousel'] },
]
```

✅ **`frontguard doctor` command** — Environment diagnostics (`cli/doctor.ts`): Node, Playwright/Chromium versions, config validity, and git state, with actionable warnings.

✅ **`frontguard monitor` command** — Live production URL checks with `--once`, `--watch`/`--interval` daemon polling, `--history` inspection, and webhook alerts.

✅ **Comparison content** — `frontguard-vs-percy` and `frontguard-vs-chromatic` guides, plus `migrate-from-backstopjs` and `migrate-from-lost-pixel`. SEO play for "percy/chromatic alternative" search terms.

✅ **Accessibility audits** — axe-core plugin (`plugins/accessibility.ts`) runs in the same render pass; reports WCAG violations (contrast, alt text, target size, focus, heading order) in console, HTML, **and** PR reports; optional `failOnViolation`.

✅ **Performance budgets + visual correlation** — Perf-budgets plugin collects LCP/CLS/TTFB/page-weight/requests and enforces budgets. Budget violations are surfaced on `RunResult.perf` and **correlated inline with the visual diff for the same route** in every reporter ("this page shifted *and* is over its LCP budget"). With `trackRegressions`, it also persists metrics and flags **run-over-run regressions** ("*and* its TTFB is up 35% since last run").

✅ **Third-party script monitoring** — `plugins/third-party-scripts.ts` inventories `<script src>` origins per page, classifies first- vs third-party against `baseUrl`, and reports origins that appeared/disappeared since the previous run (ad networks, analytics SDKs, chat widgets).

✅ **Vercel / Netlify / GitHub-App integrations** — Real, functional integrations under `integrations/`: a Vercel OAuth app with webhook-driven preview runs, a Netlify Build Plugin (`manifest.yml` + `onSuccess` hook), and a GitHub App with signature verification, Check Runs, and installation bootstrapping.

## The moat — AI auto-fix (Phase 3)

✅ **AI fix generation + sandbox verification loop** — `diff/ai-fix.ts` generates minimal CSS patches (overflow, spacing, responsive, z-index, color). With `verifyFixes`, the **local sandbox** applies the patch, re-renders, and re-compares against the baseline (`sandbox/verify-fix.ts` + `sandbox/local.ts`); verified fixes are marked distinctly in reports.

✅ **Fix pattern database** — `storage/fix-patterns.ts`: a `better-sqlite3` store recording accepted/rejected fixes, with `accept-fix` / `reject-fix` / `export-patterns` commands. The pipeline probes the DB before calling the AI, reusing patterns accepted ≥3 times — the compounding data moat.

## Cloud platform (Phase 3–5 foundations)

✅ **Cloud API** — Hono service (`packages/cloud-api`) with run submission, status, reports, baseline approval, usage metering, and a `/health` check.

✅ **Persistent storage** — Cloudflare D1 (SQLite) store for runs/screenshots/monitors/teams/usage; Cloudflare R2 for screenshot blobs; in-memory store for dev/tests.

✅ **Real auth** — GitHub OAuth + hashed API keys, per-key rate limiting.

✅ **Production monitoring scheduler** — Workers Cron trigger (`scheduler.ts`) runs due monitors on cadence, retries once, prunes history per plan, and meters usage.

✅ **Alerting with dedup + snooze** — Slack (incoming webhook), email (Resend), and **PagerDuty** (Events API v2) channels. Fingerprint-based deduplication suppresses repeat alerts for the same regression set; per-monitor snooze suppresses for N hours.

✅ **Billing + teams** — Stripe customer/subscription tracking; multi-tenant teams with roles, invitations, baseline approvals, and an activity feed; per-plan feature gates and limits.

---

# Genuinely Remaining (in code)

The code-buildable backlog is essentially empty — the remaining items need external accounts/collectors to *verify*, not to write.

✅ **Daytona sandbox fix verification** — **shipped.** `sandbox/daytona.ts` is a full implementation: it boots a Daytona sandbox via `@daytonaio/sdk`, uploads the AI-generated CSS to a temp file (never interpolated into a shell), runs the renderer, and returns the screenshot, with URL/viewport/browser validation and graceful failure when the SDK or `DAYTONA_API_KEY` is absent. Verifying it end-to-end needs a Daytona account; the code is done.

✅ **OpenTelemetry export** — **shipped** (cloud-api `otel/`): run/monitor completions emit OTLP/HTTP metrics to a configurable `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op when unset). Point it at any OTLP collector (Datadog, Grafana, Honeycomb) to make Frontguard the visual module in your observability stack.

✅ **Native Slack app** — **shipped** (`integrations/slack-app/`): signing-secret verification, OAuth install, the `url_verification` handshake, and `chat.postMessage` posting — same bar as the Vercel/GitHub-App integrations (functional handler + tests; activation needs a registered Slack app).

*Also recently closed:* **run-over-run CWV delta correlation** and **accessibility-aware AI analysis** — see "What's Shipped".

---

# Follow-ups Requiring External Action

These can't be completed from the codebase alone — they need accounts, recording, external repos, or human distribution. Tracked here so they aren't mistaken for shipped work.

🟠 **Demo GIF + 30-second video** — the VHS tape (`demo/frontguard-demo.tape`) is **written**. *Owner action:* run `vhs demo/frontguard-demo.tape` against a running app to render `demo/frontguard-demo.gif`, then embed it at the top of the README. The launch lives or dies on the first 10 seconds.

🟠 **Real-world validation on 5 OSS repos** — the harness is **built** (`validation/run-external.sh` + `validation/repos.json`: a Next.js app, Tailwind dashboard, component-library docs, e-commerce storefront, docs site). *Owner action:* run `./validation/run-external.sh` with AI API keys set (needs cloning the repos + render time) and fill in `validation/results-v0.2.md` with TP/FP/FN and classification accuracy. If accuracy is below 70% on real diffs, retune prompts before promoting AI as a feature.

🟠 **v0.2 launch** — *Owner action:* pre-seed credibility in r/Playwright and r/QualityAssurance for 2 weeks, submit to awesome-playwright, then Show HN + r/Playwright + r/webdev + X thread on a Tue/Wed 9–10am ET, followed by a Dev.to walkthrough. Respond to every issue and comment personally.

🟠 **Vercel Integration Marketplace listing** — the OAuth app works; publishing to the Marketplace is a separate submission with pricing/screenshots/category metadata. (The **OTel export** and **native Slack app** that previously sat here are now shipped — see "Genuinely Remaining".)

🟠 **Long-horizon moat** — fine-tuned visual analysis model (after 10K+ labeled comparisons) and a community fix-pattern marketplace. Both depend on accumulated real-world usage data.

**Kill criteria:** If you can't get 10 people to try it in 6 weeks of the v0.2 launch, the positioning is wrong. Pivot to pure Playwright plugin (drop the standalone CLI angle) or pivot to production monitoring (drop the CI testing angle).

---

# Phase 4: Production Visual Monitoring (Month 6–12)

**Goal:** 1,000 stars. $15K MRR. 30 paying teams. Expand from CI tool to always-on reliability platform.

The "Datadog for frontend" move. The rendering, diffing, AI analysis, scheduler, alerting, and third-party-script detection are built — the work here is depth and distribution, not new primitives.

✅ **Zero-config URL monitoring** — Monitor plugin + cloud scheduler crawl, baseline, render on schedule, and alert on drift. Catches broken deploys, CDN failures, third-party script injection, ad layout corruption, A/B leakage.

✅ **Third-party script monitoring** — Shipped (see above): detects when an ad/analytics/widget origin appears or disappears between runs.

🟡 **Integration layer** — Slack + email + PagerDuty + generic webhooks work. *Remaining:* native Slack app and OpenTelemetry export (see follow-ups) to position Frontguard as "the visual layer you embed."

✅ **Performance visual correlation** — Budget-violation ↔ visual-diff correlation is shipped, as is **run-over-run CWV delta** correlation (a page that got slower since the last run is flagged and joined to its visual diff).

**Pricing evolution:**
- Add Monitoring tier: $49/mo — unlimited production URLs, hourly checks, alerting
- Or bundle into Pro: $29/mo includes CI + monitoring (aggressive positioning vs Checkly's $60/mo)

---

# Phase 5: Network Effects + Enterprise (Month 12–18)

**Goal:** $50K MRR. 100 paying teams. Enterprise pipeline.

🟡 **Marketplace integrations**
- ✅ GitHub Action (composite action with JSON output parsing)
- ✅ GitHub App (webhooks, Check Runs, installation flow)
- ✅ Netlify Build Plugin
- ✅ Vercel OAuth integration (webhook-driven preview runs)
- 🔴 Vercel Integration **Marketplace** listing (external submission — see follow-ups)

🟡 **Team features**
- ✅ Shared baselines / runs (cloud-hosted), role-based access (viewer/reviewer/admin), approval workflows, activity feed
- 🔴 SSO/SAML for enterprise (gated to Business tier in plan config; integration unbuilt)

✅ **Figma-to-production visual comparison** — Shipped early in v0.1.

🔴 **Fine-tuned visual analysis model** — After 10,000+ comparisons with human feedback, fine-tune a smaller model (Phi-4 class) for higher accuracy, faster/cheaper inference, and on-prem privacy. *Depends on accumulated data.*

🔴 **Fix pattern marketplace** — Community-contributed fix patterns (Tailwind overflow, React hydration, Next.js image regressions, Grid/Flexbox cross-browser). Creates a data flywheel: more users → more patterns → better auto-fix → more users.

---

# What's Deliberately Not On This Roadmap

**Mobile app screenshots.** Different rendering pipeline (iOS Simulator, Android Emulator), different audience, different competitors (Applitools). Dilutes focus.

**Puppeteer support.** Playwright covers Puppeteer plus Firefox/WebKit. A second automation abstraction is pure overhead.

**Self-hosted cloud (for now).** Only if enterprise customers demand it AND will pay $500+/mo. The CLI is already self-hosted; the cloud is managed.

**Browser extension / DevTools integration.** Looks cool, adds zero distribution. Developers work in terminals and CI.

**Video-based regression (Replay.io's approach).** Compute-heavy, slow, unproven. Static screenshot + AI is faster and already works.

---

# Threat Mitigation Map

| Threat | Window | Mitigation Strategy |
|--------|--------|---------------------|
| GitHub Copilot adds visual PR review | 12-18 months | Ship auto-fix before they ship visual review. Auto-fix is 10x harder than detection — defensible even if Copilot can screenshot. |
| Observability platforms add visual monitoring | 12-24 months | Position as "the visual layer they embed." Build OpenTelemetry integration so Frontguard IS the visual module for Datadog/Grafana. |
| TestMu AI scale (2M+ users) | Now | They're enterprise/QA-first. Frontguard is developer-first, CLI-native. Different initial market. Don't compete head-on. |
| Replay.io pivots to visual regression | 6-12 months | Video analysis is slow and expensive. Screenshot + AI is faster. Monitor but don't react. |
| AI model commoditization | Ongoing | The moat isn't the model — it's the fix pattern database and workflow integration. Models are interchangeable; data isn't. |
| Percy/Applitools improve their AI | Ongoing | Legacy architecture = slow iteration. Born-AI-native is structurally faster. Ship weekly. |

---

# Pricing Strategy

**Principle: Never charge per screenshot.** This is the market's loudest pricing complaint. "No per-screenshot fees" is a selling point by itself.

| Tier | Price | Target | Conversion Trigger |
|------|-------|--------|-------------------|
| **Free** | $0 forever | Solo dev, evaluation | — |
| **Pro** | $29/mo | Small teams (2-10) | Team collaboration: shared baselines, PR review, approval workflows |
| **Business** | $99/mo | Mid-market (10-50) | SSO, production monitoring, unlimited projects |
| **Enterprise** | Custom ($199+/mo) | Large orgs (50+) | On-prem, dedicated support, SLA |

**Free tier includes:** Unlimited local CLI, 1 project, 500 cloud screenshots/mo, 7-day cloud history.
**Pro gate:** Shared baselines, PR comments with review, unlimited projects, 30-day history.
**Business gate:** Production monitoring, SSO/SAML, unlimited cloud screenshots, 90-day history.

**Why $29/mo Pro:** Chromatic's avg enterprise contract is $44K/yr. Applitools charges ~$299/user/mo. Frontguard Pro at $348/yr is 100x cheaper — an easy team-lead purchase with no procurement approval needed.

**Why not $19/mo:** The research shows 8-15% free-to-paid conversion for dev tools. At $19/mo, you need 2x the customers to hit the same MRR. $29/mo is the sweet spot — still impulse-purchase territory for a dev team lead, but meaningful revenue per customer.

---

# Success Metrics

| Phase | Status | Key Metric | Kill Signal |
|-------|--------|-----------|-------------|
| v0.1: Core Engine | ✅ Shipped | Working CLI + GitHub Action + AI analysis + Figma compliance | — |
| v0.2: Earn Trust | ✅ Built · 🟠 Launch pending | Engine, docs, integrations done; needs demo + real-repo validation + launch | Can't find 10 users in 6 weeks of launch |
| Phase 3: The Moat | ✅ Built · 🟠 Adoption pending | Fix gen + verify + pattern DB shipped; need >20% fix acceptance from real users | <5% fix acceptance after tuning |
| Phase 4: Monitor | ✅ Built · 🟠 Revenue pending | Scheduler + alerting + third-party detection shipped; need $15K MRR / 30 teams | <$5K MRR after 6 months of cloud |
| Phase 5: Scale | 🟡 Foundations built | Teams/billing/integrations in place; need SSO, marketplace listing, fine-tuned model | Stalling growth, losing to platform incumbents |

---

# The Honest Bottom Line

Frontguard's window is 12-18 months before GitHub Copilot and observability platforms enter this space. The engineering bet has largely been made: the AI classification, anti-flake rendering, CLI workflow, CI integration, Figma compliance, auto-fix-with-verification, fix-pattern database, accessibility and performance analysis, third-party-script monitoring, production monitoring with multi-channel alerting, and the cloud platform (auth, storage, billing, teams) are all built and tested.

What remains is **proving it and getting it adopted**, plus closing the last external-account integrations:

1. **Validate on real repos and launch.** Synthetic accuracy means nothing — run against real diffs, record the numbers, record the demo, and ship the launch.
2. **The fix pattern database.** Every accepted auto-fix trains the system. At 10K fixes the accuracy advantage is insurmountable by a new entrant. This is the data moat — and it only compounds with real usage.
3. **Workflow integration depth.** Being the visual layer embedded in GitHub PRs, Slack/PagerDuty alerts, Vercel deploys, and (next) Datadog dashboards makes Frontguard hard to rip out.

The code is ready. The next move is distribution.
