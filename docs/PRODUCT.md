> For product strategy and roadmap, see [ROADMAP.md](../ROADMAP.md). This document covers product specification and architecture.

# Frontend Reliability Platform — Product Deep-Dive

**AI-Powered Frontend Monitoring, Regression Detection & Auto-Fix**

---

# Architecture Decisions

**Key Decisions from Review:**

🔴 **Baseline Storage → Orphan Branch (not git-tracked in main)**
Git-tracked baselines in `.frontguard/` would balloon repo size with binary WebP files. Merge conflicts on binary files are unsolvable. Solution: separate `frontguard-baselines` orphan branch — no code, just baselines. CLI reads from it automatically. Keeps main branch clean, avoids Git LFS setup, and baseline updates have their own clear commit history.

🔴 **CI Cold-Start → Pre-built Docker Image**
Playwright Docker image is ~1.5GB. Downloading every CI run adds 30-60s. Solution: pre-built image on GHCR (`ghcr.io/frontguard/runner:latest`) with Playwright + frontguard pre-installed. One-line CI config.

🟡 **Smart Rendering → Dependency Graph**
Rendering ALL pages on every PR is wasteful. If a PR only touches checkout CSS, don't re-render the blog. Solution: lightweight dependency tracer — parse imports/CSS to build page→component→style graph. Render only affected pages. Fall back to "render all" if graph can't determine impact.

🟡 **Multi-Browser → Enabled from Day 1**
Playwright supports Chromium, Firefox, WebKit at zero additional integration cost. Cross-browser regressions (Safari flex bugs, Firefox grid issues) are a real pain point. Config option from day 1: `browsers: ['chromium', 'webkit', 'firefox']`.

🟢 **Verify Loop → The Architectural Gem**
Generate fix → apply → re-render → compare → confirm/discard. No competitor does this. It transforms AI suggestions from "maybe useful hallucination" to "verified fix that provably resolves the regression." This is the core moat. Protect it.

---

# 1. Executive Summary

**One-liner:** Datadog + Sentry for frontend — catches visual bugs before production and fixes them automatically.

**The Problem:** Frontend reliability is a massive blind spot. Backend has a $20B+ monitoring ecosystem (Datadog, Sentry, PagerDuty, New Relic, Honeycomb). Frontend gets crash reporting and session replay — both reactive, post-production tools. Visual regressions, layout breaks, CSS bugs, and responsive failures ship to production daily because no tool catches them pre-deploy. E2E test suites are so painful to maintain that 73% of teams have lost faith in test automation entirely.

**The Solution:** A CI-integrated platform that renders every critical page via Playwright on every PR, compares against approved baselines using AI vision + DOM diffing, identifies regressions with human-readable explanations ("the checkout button overflows on mobile because the new padding pushes it outside the container"), and suggests or auto-applies code fixes — verified by re-rendering before merge.

**Why Now:**
- Vision models (GPT-4V, Claude, Gemini) are now good enough to understand UI semantics, not just pixel differences
- Code LLMs can generate reliable CSS/HTML fixes (proven by VisRefiner, RAG-based layout repair research)
- Playwright has matured into a complete testing platform with screenshot APIs, DOM snapshots, HAR replay, and performance metrics
- Preview deployments (Vercel, Netlify) create the perfect testing surface — every PR has a live URL
- The "shift left" movement is mainstream but frontend is still stuck in manual QA

---

# 2. The Problem — Deep

## Frontend Reliability Is a Blind Spot

The backend monitoring ecosystem is mature and comprehensive:

| Layer | Backend Tools | Frontend Equivalent |
|-------|--------------|-------------------|
| Error tracking | Sentry, Bugsnag, Rollbar | Sentry JS SDK (errors only, no visual) |
| Performance | Datadog APM, New Relic, Dynatrace | Datadog RUM, Lighthouse (no CI integration) |
| Uptime | PagerDuty, Pingdom, Checkly | Checkly (functional only, no visual) |
| Tracing | Jaeger, Zipkin, Honeycomb | Nothing comparable |
| Profiling | py-spy, pprof, async-profiler | Chrome DevTools (manual only) |
| Regression testing | Automated test suites (mature) | Visual regression (<5-10% adoption) |
| Auto-remediation | PagerDuty runbooks, auto-scaling | **Nothing** |

Backend engineers know within seconds when a deployment causes a 500 error, latency spike, or memory leak. Frontend engineers discover visual bugs from customer complaints, QA screenshots in Slack, or "hey, the checkout page looks broken on mobile" messages.

## The Numbers

- **$607 billion** — cost of software bugs in the US alone (2020, Consortium for IT Software Quality)
- **6-15x** — cost multiplier of fixing a bug in production vs catching it in design/development
- **$2.6 trillion** — global impact of poor digital experiences (UX crisis)
- **73%** of engineering teams have lost faith in test automation due to flaky tests
- **<5-10%** of frontend teams use visual regression testing of any kind
- **$48 billion** software testing market (2025), growing to $94B by 2030

## Why E2E Test Suites Fail

Every team starts with good intentions. "We'll write Cypress/Playwright tests for every critical flow." Here's what actually happens:

1. **Setup cost is brutal** — configuring browsers, auth, test data, CI integration takes weeks
2. **Flaky tests erode trust** — timing issues, animation races, dynamic content cause random failures. Teams start ignoring failures. Then they skip tests entirely.
3. **Maintenance is a full-time job** — every UI change breaks 20 tests. Nobody wants to update them. Tests rot.
4. **They test the wrong things** — asserting that a button exists doesn't catch that it's invisible, overlapped, or overflowing off-screen
5. **No visual awareness** — E2E tests verify functionality, not appearance. A test passes while the page looks completely broken.

The result: most frontend teams rely on manual QA, PR screenshots, and hoping for the best.

## Real-World Frontend Failures

- **Amazon's $100M Prime Day CSS bug** — a CSS change caused product images to disappear on mobile during their highest-traffic event
- **Stripe's checkout form regression** — a padding change pushed the submit button below the fold on smaller screens, dropping conversion
- **GitHub's dark mode rollout** — dozens of components had unreadable text in dark mode that shipped to production
- **Every SaaS company ever** — "the modal is behind the header", "text is truncated", "the button is cut off on iPad"

These aren't edge cases. They're the norm. And they're invisible to backend monitoring.

---

# 3. Competitive Landscape

## Direct Competitors

| Tool | What It Does | Pricing | Funding/Revenue | Key Limitation |
|------|-------------|---------|-----------------|---------------|
| **Percy (BrowserStack)** | Visual regression screenshots in CI | $50/mo+ | BrowserStack: $381M rev | Dumb pixel diff. No understanding of what broke. No fix suggestions. |
| **Chromatic (Storybook)** | Visual regression for Storybook components | $149/mo+ | Part of Storybook ecosystem | Component-only, not full pages. Requires Storybook. |
| **Applitools** | AI-powered visual testing (Visual AI) | Enterprise pricing | $300M raised, ~$31.5M rev | Enterprise-locked. Expensive. Has root cause analysis but no auto-fix. |
| **Meticulous.ai** | Zero-config visual testing from session replay | Unknown | $4M seed | Closest concept. No auto-fix. Replay-based, not render-based. |
| **Stably AI** | Auto-heal Playwright tests when UI changes | Unknown | YC W22 | Heals tests, not the actual code. Different problem. |
| **Lost Pixel** | OSS visual regression | Free/OSS | - | Basic pixel diff. No AI. No understanding. |
| **BackstopJS** | OSS visual regression | Free/OSS | - | Configuration-heavy. No AI. Maintenance burden. |

## Adjacent Competitors (Monitoring/Observability)

| Tool | What It Does | Pricing | Revenue | Key Limitation |
|------|-------------|---------|---------|---------------|
| **Sentry** | Error tracking + session replay | Free tier, $26/mo+ | $100M+ ARR | Post-production only. Catches JS errors, blind to visual issues. |
| **LogRocket** | Session replay + error tracking | $99/mo+ | ~$30M+ ARR | Replay only. Shows what happened, doesn't prevent it. |
| **FullStory** | Session analytics + replay | Enterprise | $93M rev | Analytics tool, not prevention. |
| **Datadog RUM** | Real user monitoring, performance | Usage-based | Part of $2B+ Datadog | Performance metrics only. No visual testing. |
| **Checkly** | Synthetic monitoring + API checks | $30/mo+ | Growing | Functional checks only. No visual comparison. |

## AI Testing Platforms

| Tool | What It Does | Key Limitation |
|------|-------------|---------------|
| **QA Wolf** | Managed E2E testing service | Human-maintained, expensive ($3K+/mo). Service, not product. |
| **mabl** | AI-powered test automation | Enterprise-focused. No visual regression focus. |
| **Testim** | AI test authoring + maintenance | Test maintenance tool, not regression detection. |

## The Three Gaps Nobody Fills

🔴 **Gap 1: No tool bridges pre-production testing AND production monitoring**
Percy/Chromatic only run in CI. Sentry/LogRocket only work in production. Nobody connects "this visual change in the PR" to "this visual issue in production."

🔴 **Gap 2: No tool suggests or auto-applies code fixes**
Every existing tool stops at "here are the differences." The developer still has to figure out what's wrong, why, and how to fix it. The AI capability to go from diff → understanding → fix now exists but nobody has productized it.

🔴 **Gap 3: No unified "frontend reliability" platform**
Backend has Datadog (one platform: metrics, traces, logs, errors, profiling). Frontend has a fragmented mess of single-purpose tools that don't talk to each other.

---

# 4. The Product

## Core Concept

Zero-config frontend reliability. Point it at your app — it auto-discovers your routes, connects to your preview deployments, and watches every PR and every deploy for visual regressions, performance degradation, accessibility issues, and functional errors — then tells you exactly what broke and how to fix it. No manual route lists. No CI plumbing. Just connect and go.

## How It Works — Full Flow

```
Developer pushes code to PR
         │
         ▼
┌─────────────────────────────────┐
│  CI TRIGGERS PIPELINE           │
│  (GitHub Action / GitLab CI)    │
│  Pre-built Docker image:        │
│  ghcr.io/frontguard/runner      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  RESOLVE TARGET                 │
│                                 │
│  Auto-detect preview URL:       │
│  • Vercel: VERCEL_URL env       │
│  • Netlify: DEPLOY_PRIME_URL    │
│  • Custom: FRONTGUARD_URL env   │
│  • Fallback: baseUrl from config│
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  ROUTE DISCOVERY                │
│                                 │
│  Option A (auto): Crawl from    │
│  startUrl, follow links,        │
│  discover all routes (maxDepth) │
│                                 │
│  Option B (manual): Use routes  │
│  from frontguard.config.ts      │
│                                 │
│  Option C (smart): Dependency   │
│  graph — parse git diff to find │
│  changed files, trace which     │
│  pages depend on them, render   │
│  only affected pages. Fallback  │
│  to "render all" if uncertain.  │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  RENDER PHASE                   │
│                                 │
│  Playwright renders each route  │
│  × each viewport × each browser│
│  (Chromium default, optional    │
│   Firefox + WebKit)             │
│                                 │
│  Captures per page:             │
│  • Full-page screenshot (WebP)  │
│  • DOM snapshot (serialized)    │
│  • Computed styles snapshot     │
│  • Console logs                 │
│  • Network requests/failures    │
│  • Performance metrics (LCP,    │
│    CLS, FID via CDP)            │
│  • Accessibility tree           │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  GATE PHASE (Fast & Cheap)      │
│                                 │
│  Pixel diff (pixelmatch) each   │
│  screenshot against baseline    │
│  from orphan branch             │
│  (frontguard-baselines)         │
│                                 │
│  If diff < threshold:           │
│    → PASS (no AI needed, $0)    │
│  If diff ≥ threshold:           │
│    → Forward to AI Analysis     │
│                                 │
│  ~90% of pages pass here        │
│  (most PRs don't change most    │
│   pages visually)               │
└─────────────┬───────────────────┘
              │ (only changed pages)
              ▼
┌─────────────────────────────────┐
│  AI ANALYSIS PHASE              │
│                                 │
│  Vision Model receives:         │
│  • Baseline screenshot          │
│  • Current screenshot           │
│  • Highlighted diff image       │
│  • DOM diff (structural)        │
│  • CSS diff (computed styles)   │
│  • Git diff (what code changed) │
│                                 │
│  Outputs:                       │
│  • Issue classification:        │
│    "Layout regression" /        │
│    "Intentional change" /       │
│    "Content update"             │
│  • Human-readable explanation:  │
│    "The checkout button         │
│     overflows its container on  │
│     768px viewport because the  │
│     new padding-left: 24px in   │
│     CheckoutForm.css:42 pushes  │
│     total width beyond parent"  │
│  • Severity: critical/warning/  │
│    info                         │
│  • Confidence score: 0-100      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  FIX GENERATION PHASE           │
│                                 │
│  Code LLM receives:             │
│  • The issue analysis           │
│  • The relevant source files    │
│  • Component tree context       │
│  • CSS cascade context          │
│                                 │
│  Generates:                     │
│  • Specific code fix            │
│  • Explanation of the fix       │
│  • Confidence score             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  VERIFY PHASE                   │
│                                 │
│  Apply fix to codebase          │
│  Re-render the affected page    │
│  Compare to baseline again      │
│                                 │
│  If baseline match improved:    │
│    → Fix verified ✓             │
│  If not:                        │
│    → Discard fix, report        │
│      issue without fix          │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  REPORT PHASE                   │
│                                 │
│  PR Comment with:               │
│  • Visual diff (before/after)   │
│  • Issue explanation            │
│  • Suggested fix (as diff)      │
│  • "Apply Fix" button           │
│  • Approve as new baseline btn  │
│                                 │
│  Or: Auto-commit fix to PR      │
│  Or: Block merge (configurable) │
└─────────────────────────────────┘
```

## Three Pillars

**DETECT** — Find what changed (pixel diff, DOM diff, performance metrics, console errors, accessibility violations)

**UNDERSTAND** — Explain what broke and why in human language, not "62 pixels differ at coordinates (340, 890)" but "The newsletter signup form overlaps the footer on mobile because the margin-bottom was removed in Header.module.css"

**FIX** — Generate, verify, and apply code changes. Not hallucinated guesses — verified fixes that are re-rendered and confirmed before suggestion.

## Feature Breakdown

**Smart Route Discovery & Dependency Graph**
- Auto-crawl app from a start URL — discover all routes automatically (no manual config)
- Configurable max depth, exclude patterns, and auth handling
- Dependency graph: parse imports/CSS to map page→component→style relationships
- On PR: diff changed files against graph, render only affected pages
- Falls back to "render all" if graph can't determine impact
- Reduces CI time by 60-80% on typical PRs (most PRs touch few pages)

**Preview Deployment Integration**
- Auto-detect Vercel preview URLs (VERCEL_URL env var)
- Auto-detect Netlify deploy previews (DEPLOY_PRIME_URL env var)
- Custom preview URL support (FRONTGUARD_URL env var)
- Zero-config: push code → preview deploys → frontguard runs against preview → PR comment
- The "magic moment" — developer does nothing, visual regression report appears

**Visual Regression Detection**
- Screenshot comparison at multiple viewports (320px, 768px, 1024px, 1440px)
- DOM structure comparison (semantic, not text diff)
- Computed style comparison (catches CSS cascade issues)
- Cross-browser rendering from day 1 (Chromium default, Firefox + WebKit optional via config)

**AI-Powered Issue Understanding**
- Classifies changes: regression vs intentional vs content update
- Maps visual changes back to specific code changes in the PR
- Explains the root cause in developer-friendly language
- Provides severity and confidence scoring

**Auto-Fix with Verify Loop**
- Generates CSS/HTML/JSX fixes
- Applies fix, re-renders, compares to baseline
- Only suggests verified fixes (fix is confirmed to improve baseline match)
- Supports suggest-only mode (no auto-commit) for cautious teams

**Performance Regression Detection**
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- First Input Delay (FID) / Interaction to Next Paint (INP)
- Bundle size comparison
- Network waterfall analysis

**Accessibility Regression Detection**
- axe-core integration for WCAG violations
- Color contrast checking
- Focus order verification
- Screen reader text coverage
- Diff against baseline accessibility score

**Console Error & Network Failure Detection**
- Catches new console errors introduced by PR
- Detects failed network requests
- Identifies 404s, CORS errors, mixed content warnings

**Production Monitoring Mode**
- Continuous rendering of production pages on a schedule (every 15m, hourly, daily)
- Compares against approved production baselines
- Alerts on visual drift, performance degradation, third-party script breakage
- Catches issues from CMS changes, A/B test interactions, third-party widget updates

---

# 5. Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ GitHub   │  │ Config   │  │ Baseline │  │ Route  │ │
│  │ App /    │  │ Parser   │  │ Manager  │  │Discover│ │
│  │ Webhook  │  │          │  │ (orphan  │  │+ Dep   │ │
│  │          │  │          │  │  branch) │  │ Graph  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │              │             │             │       │
│       └──────────────┴─────────────┴─────────────┘       │
│                          │                               │
│  Preview URL Detection:                                  │
│  Vercel (VERCEL_URL) / Netlify (DEPLOY_PRIME_URL)       │
│  / Custom (FRONTGUARD_URL) / localhost fallback          │
│                                                          │
└──────────────────────────┼───────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    RENDER WORKERS                        │
│  Pre-built: ghcr.io/frontguard/runner:latest            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Playwright Multi-Browser                         │   │
│  │                                                   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│   │
│  │  │Worker 1 │ │Worker 2 │ │Worker 3 │ │Worker 4││   │
│  │  │ /home   │ │/pricing │ │/checkout│ │/blog   ││   │
│  │  │ 3 VP    │ │ 3 VP    │ │ 3 VP    │ │ 3 VP   ││   │
│  │  │ 3 Brows │ │ 3 Brows │ │ 3 Brows │ │ 3 Brows││   │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘│   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Browsers: Chromium (default) + Firefox + WebKit (opt)  │
│  Memory: 256-512MB per instance                         │
│  Smart rendering: only affected pages via dep graph     │
│  Speed: 100 pages × 4 viewports = 75-500s              │
│  Parallelism: sharded across workers                    │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   COMPARISON ENGINE                      │
│                                                         │
│  Layer 1: Pixel Diff (pixelmatch)        ← FAST, FREE  │
│  ┌───────────────────────────────────┐                  │
│  │ Baseline.webp vs Current.webp     │                  │
│  │ Threshold: 0.1% pixel difference  │                  │
│  │ ~90% of pages pass here → DONE    │                  │
│  └───────────────┬───────────────────┘                  │
│                  │ (failed gate)                         │
│                  ▼                                       │
│  Layer 2: DOM Diff (structural)          ← FAST, FREE  │
│  ┌───────────────────────────────────┐                  │
│  │ diff-dom: tree structure changes  │                  │
│  │ Attribute diff: class, style, etc │                  │
│  │ Computed style diff: box model,   │                  │
│  │   colors, fonts, positions        │                  │
│  └───────────────┬───────────────────┘                  │
│                  │                                       │
│                  ▼                                       │
│  Layer 3: AI Vision Analysis             ← EXPENSIVE    │
│  ┌───────────────────────────────────┐                  │
│  │ GPT-4V / Claude Vision / Gemini   │                  │
│  │ Inputs: baseline img, current img,│                  │
│  │   diff overlay, DOM diff, git diff│                  │
│  │ Output: classification, explain,  │                  │
│  │   severity, root cause            │                  │
│  └───────────────┬───────────────────┘                  │
│                  │                                       │
│                  ▼                                       │
│  Layer 4: Fix Generation                 ← EXPENSIVE    │
│  ┌───────────────────────────────────┐                  │
│  │ Code LLM (GPT-4 / Claude)        │                  │
│  │ Inputs: issue analysis, source    │                  │
│  │   files, component tree, CSS      │                  │
│  │   cascade context                 │                  │
│  │ Output: code fix + explanation    │                  │
│  └───────────────────────────────────┘                  │
│                                                         │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   VERIFY & REPORT                        │
│                                                         │
│  1. Apply fix to temp branch                            │
│  2. Re-render affected page                             │
│  3. Compare to baseline                                 │
│  4. If improved → verified fix                          │
│  5. Post PR comment / commit fix / block merge          │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    STORAGE                               │
│                                                         │
│  LOCAL (CLI mode):                                      │
│  Git orphan branch: frontguard-baselines                │
│  ├── baselines/{route}/{viewport}/{browser}.webp        │
│  ├── baselines/{route}/{viewport}/{browser}.dom.json    │
│  └── manifest.json (route→file mapping + metadata)      │
│                                                         │
│  CLOUD (SaaS mode):                                     │
│  Cloudflare R2 (free egress, S3-compatible)             │
│  ├── /baselines/{project}/{branch}/{route}/{vp}.webp    │
│  ├── /snapshots/{pr-id}/{sha}/{route}/{vp}.webp         │
│  ├── /diffs/{pr-id}/{sha}/{route}/{vp}-diff.webp        │
│  └── /reports/{pr-id}/{sha}/report.json                 │
│                                                         │
│  WebP compression: 300 screenshots ≈ 15MB               │
│  Orphan branch keeps main clean — no binary bloat       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Dynamic Content Handling

| Challenge | Solution |
|-----------|----------|
| Timestamps, "5 min ago" | Playwright `page.clock.setFixedTime()` — freeze time |
| API responses varying | HAR replay — record once, replay deterministically |
| Ads, third-party widgets | CSS selector masking — exclude regions from comparison |
| User-generated content | Seed data fixtures — same data every run |
| Animations | `page.emulateMedia({ reducedMotion: 'reduce' })` + CSS injection `* { animation: none !important; transition: none !important; }` |
| Randomized content (A/B tests) | Cookie/header injection to force variant |
| Loading spinners | `page.waitForLoadState('networkidle')` + custom ready selectors |

## Auth-Gated Pages

```javascript
// Login once, save state, reuse across all workers
const context = await browser.newContext({ storageState: 'auth.json' });

// Or: API-based auth (faster)
const token = await fetchToken(credentials);
await context.addCookies([{ name: 'session', value: token, domain: '.app.com' }]);
```

## Cost Model

| Component | Cost per PR | Notes |
|-----------|-------------|-------|
| Playwright rendering | ~$0.01-0.05 | Compute: 100 pages × 4 VP ≈ 2-5 min on shared runner |
| Screenshot storage | ~$0.001 | 15MB WebP to R2, negligible |
| Pixel diff (pixelmatch) | $0.00 | CPU-only, runs on same worker |
| AI Vision (10% of pages) | ~$0.30-1.50 | ~10 screenshots × $0.03-0.15 per vision API call |
| AI Fix generation | ~$0.10-0.50 | ~2-5 fixes × $0.05-0.10 per generation |
| **Total per PR** | **$0.50-2.00** | |
| **Monthly (200 PRs)** | **$100-400** | |

The gate-then-AI architecture is critical. Without it (sending every screenshot to vision API), costs would be 10x higher.

---

# 6. Moat & Defensibility

**Data Flywheel**
Every comparison across every customer builds the pattern library: "this type of DOM change + this visual diff = this bug category = this fix pattern." The more customers, the better the AI gets at classifying issues and generating fixes. This is a compounding advantage that new entrants can't replicate without volume.

**Baseline Lock-in**
Once a team has approved baselines across 200+ routes × 4 viewports × 2 themes = 1,600+ baselines, switching means re-approving everything. That's weeks of work. Nobody switches visual regression tools casually.

**Fix Pattern Library**
Over time, the system accumulates fix patterns: "overflow issues in flex containers are fixed by adding `min-width: 0`", "z-index conflicts in modals need `isolation: isolate` on the parent." These patterns, validated by the verify loop across thousands of customers, become a proprietary fix database that makes auto-fix more reliable over time.

**CI Integration Stickiness**
Once embedded in CI, removing the tool means losing the safety net. Teams build confidence that "if it passes [tool], it's safe to merge." That trust takes months to build and creates deep switching costs.

**Network Effects (Weak but Present)**
Shared fix patterns across the customer base. If 50 teams using Tailwind CSS all hit the same regression pattern, the system learns from the first occurrence and prevents it for the other 49.

---

# 7. Risks & Mitigations

**🔴 False Positive Fatigue**
*Risk:* If the tool flags too many non-issues, teams will ignore it — the same alert fatigue problem that plagues Sentry.
*Mitigation:* Confidence scoring (only surface high-confidence issues by default). "Intentional change" classification (AI learns to distinguish refactors from regressions). Adjustable sensitivity per route. Quiet mode: only alert on critical issues.

**🔴 Fix Quality Trust**
*Risk:* If auto-fixes introduce new bugs, trust dies permanently. One bad fix = team disables auto-fix forever.
*Mitigation:* Verify loop — every fix is re-rendered and confirmed before suggestion. Suggest-only mode as default (team explicitly opts into auto-commit). Fix confidence scoring. "This fix was verified to resolve the visual regression" badge.

**🟡 AI Cost at Scale**
*Risk:* Vision API calls are expensive. At high volume, costs could eat margins.
*Mitigation:* Gate-then-AI architecture (90% of pages never hit AI). Caching: identical screenshots skip analysis. Batch processing: group similar diffs. Eventually: fine-tuned smaller model for common patterns (runs locally, much cheaper).

**🟡 "Just Write Tests" Objection**
*Risk:* Senior engineers may dismiss this as "a crutch for teams that won't write proper tests."
*Mitigation:* This catches what tests can't — visual regressions that pass all functional assertions. It's complementary, not replacement. Message: "Your tests verify the button works. We verify it's visible." Also: the <5% adoption of visual regression testing proves the "just write tests" approach has failed at scale.

**🟡 Incumbent Expansion**
*Risk:* Sentry adds visual regression to session replay. Datadog adds frontend visual testing. Vercel builds it natively.
*Mitigation:* Speed and focus. Incumbents will build a checkbox feature. A focused startup builds the best-in-class product. Sentry's core competency is error tracking, not visual testing. Vercel's incentive is platform lock-in, not cross-platform tools. Window is 18-24 months to establish category leadership.

**🟢 Browser Rendering Costs**
*Risk:* Running headless browsers for every PR at scale is expensive.
*Mitigation:* Efficient parallelization, worker pooling, snapshot caching (if no code changed in a route's dependency tree, skip re-render). Browser reuse between pages. WebP compression for storage.

---

# 8. MVP Specification (v0.1)

## What to Build

**Absolute minimum to validate the concept:**

1. **CLI tool** (`npx frontguard run`)
   - Input: URL (auto-discovers routes) or explicit route list + viewports
   - Smart route discovery: crawl from start URL, find all pages
   - Dependency graph: parse git diff → determine affected pages → render only those
   - Render via Playwright (Chromium default, Firefox + WebKit optional)
   - Screenshot + DOM snapshot per page/viewport/browser
   - Compare against baselines stored in git orphan branch (`frontguard-baselines`)
   - Pixel diff with highlighted overlay image
   - If AI key provided: send diff to vision model for analysis

2. **GitHub Action**
   - Wraps CLI in pre-built Docker image (`ghcr.io/frontguard/runner:latest`)
   - Auto-detects Vercel/Netlify preview deployment URLs
   - Posts PR comment with:
     - Side-by-side screenshots (before/after)
     - Diff overlay
     - AI analysis (if configured)
     - "Approve as new baseline" link
   - Sets GitHub status check (pass/fail)

3. **Config file** (`frontguard.config.ts`)
   ```typescript
   export default {
     // Target URL — auto-detects Vercel/Netlify preview URLs if available
     baseUrl: 'http://localhost:3000',

     // Route discovery — choose one:
     // Option A: Auto-discover (zero config)
     discover: {
       startUrl: '/',        // Crawl from here
       maxDepth: 3,          // How deep to follow links
       exclude: ['/admin/*', '/api/*', '/internal/*'],
     },
     // Option B: Manual routes (explicit control)
     // routes: ['/', '/pricing', '/checkout', '/blog'],

     // Smart rendering — only render pages affected by the PR
     smartRender: true,       // Uses dependency graph (default: true)

     // Viewports
     viewports: [375, 768, 1440],

     // Browsers — Playwright supports all three
     browsers: ['chromium'],  // Add 'firefox', 'webkit' for cross-browser

     // Comparison
     threshold: 0.1,          // Pixel diff threshold (%)

     // AI analysis (BYOK)
     ai: {
       provider: 'openai',   // or 'anthropic'
       model: 'gpt-4o',
       // API key from env: FRONTGUARD_AI_KEY
     },

     // Ignore dynamic content
     ignore: [
       { selector: '.dynamic-timestamp' },
       { selector: '.ad-banner' },
     ],

     // Auth for gated pages (optional)
     auth: {
       storageState: './auth.json',  // Playwright storage state
     },
   };
   ```

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| CLI | Node.js + TypeScript | Same ecosystem as target users |
| Browser engine | Playwright (Chromium + Firefox + WebKit) | Best-in-class: multi-browser, screenshot API, DOM access, network interception |
| Pixel diff | pixelmatch | Battle-tested, fast, Playwright's own choice |
| DOM snapshot | Playwright `page.content()` + custom serializer | Full DOM tree with computed styles |
| Route discovery | Custom crawler (Playwright link following) | Discover all routes from start URL |
| Dependency graph | TypeScript AST parser + CSS import tracer | Map file changes to affected pages |
| AI integration | OpenAI API + Anthropic API (BYOK) | Vision models for analysis |
| Storage (local) | Git orphan branch (`frontguard-baselines`) | Keeps main clean, avoids binary bloat |
| Storage (cloud) | Cloudflare R2 | Free egress, S3-compatible |
| CI | GitHub Actions | Largest market share, expand later |
| Docker | GHCR pre-built image | Eliminates 30-60s cold start |
| Package | npm | Standard distribution |

## Module Architecture

```
src/
├── cli/index.ts              # CLI (init, run, update-baselines)
├── core/
│   ├── config.ts             # Zod schema, config loading
│   ├── pipeline.ts           # Orchestrator (discover→filter→render→compare→analyze→report)
│   ├── plugins.ts            # Plugin manager + hook system
│   └── types.ts              # Shared types
├── diff/
│   ├── ai-vision.ts          # OpenAI/Anthropic vision API integration
│   ├── pixel.ts              # pixelmatch comparison
│   └── ssim.ts               # Structural similarity index
├── discovery/
│   ├── crawler.ts            # BFS web crawler for route discovery
│   └── filesystem.ts         # Framework-aware filesystem scanner
├── graph/
│   ├── filter.ts             # Smart rendering filter
│   ├── parser.ts             # Import/dependency parser
│   └── resolver.ts           # Dependency graph resolver
├── plugins/
│   ├── index.ts              # Plugin exports
│   ├── figma.ts              # Figma design comparison
│   ├── monitor.ts            # Production monitoring
│   └── perf-budgets.ts       # Performance budget enforcement
├── render/playwright.ts      # Multi-browser Playwright renderer
├── report/
│   ├── console.ts            # Terminal output
│   ├── github-pr.ts          # GitHub PR comments
│   ├── html.ts               # HTML report generator
│   └── json.ts               # JSON output
├── storage/git-orphan.ts     # Git orphan branch baseline storage
└── utils/
    ├── logger.ts             # Structured logger with redaction
    ├── preview-url.ts        # Vercel/Netlify preview URL detection
    ├── redact.ts             # API key redaction
    └── retry.ts              # Retry with backoff
```

**Key principles:**
- Strict pipeline: `discover → filter → render → diff → analyze → report` — each stage independent
- Error boundary per stage — one page failing doesn't kill the entire run
- Abstraction interfaces: `Renderer`, `Reporter`, `Differ`, `BaselineStorage` — swappable implementations
- Config validated once at startup (Zod schema), passed through pipeline. No `process.env` deep in modules.
- `npx frontguard init` detects framework (Next.js, Remix, etc.) and generates smart defaults

## Plugin Architecture

```typescript
interface FrontguardPlugin {
  name: string;
  beforeDiscover?(config: ResolvedConfig): void | Promise<void>;
  afterDiscover?(routes: Route[]): Route[] | Promise<Route[]>;
  afterRender?(screenshots: Screenshot[]): void | Promise<void>;
  afterCompare?(results: DiffResult[]): DiffResult[] | Promise<DiffResult[]>;
  afterRun?(report: Report): void | Promise<void>;
  onError?(error: Error, context: string): void | Promise<void>;
}
```

Core engine (render → diff → analyze → report) is identical between CLI and Cloud. Design engine as importable library from day 1.

---

# Appendix: Research References

- **VisRefiner (Feb 2026):** Visual diff → iterative code fix loop using vision models. Directly validates the core product pattern.
- **Design2Code (Stanford/NAACL 2025):** GPT-4V reproduces original designs from screenshots 49% of the time. Proves vision model UI understanding.
- **RAG-based Responsive Layout Repair (ICSME 2025):** LLMs + retrieval of similar past fixes = effective CSS repair. Validates fix pattern library approach.
- **diff-dom (54K weekly npm downloads):** Mature structural DOM comparison library.
- **Playwright documentation:** toHaveScreenshot(), pixelmatch integration, HAR replay, storageState, CDP performance metrics.
