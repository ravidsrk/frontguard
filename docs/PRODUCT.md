# Frontend Reliability Platform — Product Deep-Dive

**AI-Powered Frontend Monitoring, Regression Detection & Auto-Fix**

---

# 0. CEO Plan

```
═══════════════════════════════════════════════════════════════
CEO PLAN: Frontend Reliability Platform
═══════════════════════════════════════════════════════════════

VISION: The frontend equivalent of Datadog — a single platform
that makes visual regressions, performance degradation, and
accessibility failures impossible to ship. Every PR gets an
AI reviewer that sees what humans miss and fixes what it finds.
The end state: frontend teams trust their deploy pipeline the
way backend teams trust their monitoring stack.

APPROACH: OSS CLI First
- npm package + GitHub Action
- Playwright rendering + pixelmatch gate + AI vision analysis
- BYOK for AI (user provides OpenAI/Anthropic key)
- Orphan branch baseline storage (not git-tracked in main)
- Cloud platform follows after validation

SCOPE DECISIONS:
- ✅ Accepted: Orphan branch baselines — keeps main clean, avoids LFS
- ✅ Accepted: Dependency graph for smart rendering — only render affected pages
- ✅ Accepted: Multi-browser from day 1 — Playwright abstracts it, near-zero effort
- ✅ Accepted: Smart Route Discovery — auto-crawl app, zero config
- ✅ Accepted: Preview Deployment Integration — auto-detect Vercel/Netlify preview URLs
- ❌ Deferred: Cloud platform → Phase 2
- ❌ Deferred: Auto-fix generation → Phase 2 (after validating AI analysis value)
- ❌ Deferred: Production monitoring → Phase 3

SUCCESS CRITERIA:
1. 500+ GitHub stars in 90 days (developer interest)
2. 100+ weekly active CI runs in 90 days (real usage)
3. <10% false positive rate on real PRs (quality)
4. 5+ organic blog mentions by frontend devs (word of mouth)
5. First 10 paying customers within 6 months of cloud launch

KILL CRITERIA:
1. <50 teams running weekly after 6 months
2. False positive rate >30% after tuning
3. >50% of surveyed users rate AI analysis "not useful"
4. AI fix suggestions accepted <5% of the time
═══════════════════════════════════════════════════════════════
```

---

# 0.1 Architecture Review — CEO Findings

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

**Accepted Expansions:**

🚀 **Smart Route Discovery** — Instead of manually listing routes, crawl the app automatically from a start URL. `discover: { startUrl: 'http://localhost:3000', maxDepth: 3 }`. Removes biggest adoption friction.

🚀 **Preview Deployment Integration** — Auto-detect Vercel/Netlify preview URLs from CI environment. Developer pushes code → Vercel deploys preview → Frontguard automatically renders the preview → Posts comparison in PR. Zero config magic moment.

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

# 7. Business Model

## Pricing Tiers

| Tier | Price | Snapshots/mo | Features |
|------|-------|-------------|----------|
| **Free** | $0 | 50 | Pixel diff, PR comments, 1 project, community support |
| **Pro** | $49/mo | 2,000 | + AI analysis, issue explanation, 3 projects, email support |
| **Team** | $199/mo | 10,000 | + Auto-fix suggestions, verify loop, unlimited projects, cross-browser, Slack integration |
| **Business** | $499/mo | 50,000 | + Production monitoring, priority support, SSO, custom viewports, API access |
| **Enterprise** | Custom | Unlimited | + Self-hosted option, SLA, dedicated support, custom AI models |

**Snapshot = one page × one viewport × one render.** A page rendered at 4 viewports = 4 snapshots.

## Why This Pricing Works

- **Free tier hooks developers** — 50 snapshots covers a small app (12 pages × 4 viewports). Enough to get addicted.
- **Pro is the individual developer** — $49/mo is impulse-buy territory. No procurement needed.
- **Team is the growth engine** — $199/mo for unlimited projects + auto-fix. This is where the value clearly exceeds the cost.
- **Business adds production monitoring** — continuous rendering, alerting, the "Datadog" part of the product.

## Revenue Projections

| Milestone | Customers | Mix | MRR | ARR |
|-----------|-----------|-----|-----|-----|
| 6 months post-launch | 200 Free, 30 Pro, 5 Team | Mostly free | $2,500 | $30K |
| 12 months | 1,000 Free, 150 Pro, 30 Team, 3 Business | Converting | $14,800 | $178K |
| 18 months | 3,000 Free, 400 Pro, 80 Team, 15 Business | Expanding | $43,100 | $517K |
| 24 months | 8,000 Free, 1,000 Pro, 200 Team, 50 Business | Growing | $114,400 | $1.37M |

## Competitor Pricing Comparison

| Tool | Comparable Tier | Price | What You Get |
|------|----------------|-------|-------------|
| Percy | Team | $249/mo | 25K snapshots. Pixel diff only. No AI. |
| Chromatic | Pro | $149/mo | 35K snapshots. Storybook only. No full pages. |
| Applitools | Enterprise | $$$$/mo | Visual AI. No auto-fix. Enterprise sales cycle. |
| Checkly | Team | $90/mo | Synthetic checks. No visual comparison. |
| **This product** | **Team** | **$199/mo** | **AI analysis + auto-fix + verify + cross-browser** |

The product delivers more value at a lower price point than Percy or Chromatic, and makes Applitools-level AI accessible to small teams.

---

# 8. Go-To-Market Strategy

## Phase 1: Open-Source CLI (Month 1-3)

**Goal:** Build credibility, get feedback, establish the category.

```bash
# Zero-config — auto-discovers routes
npx frontguard init
npx frontguard run --url http://localhost:3000

# Or explicit routes
npx frontguard run --url http://localhost:3000 --routes "/,/pricing,/checkout"

# Cross-browser
npx frontguard run --url http://localhost:3000 --browsers "chromium,firefox,webkit"
```

- Open-source Playwright wrapper with multi-browser support
- Smart route discovery — auto-crawl app, no manual route lists
- Dependency graph — only render pages affected by your changes
- Pixel diff + DOM diff (no AI, fully local)
- Generates HTML report with visual diffs
- Orphan branch baseline storage (keeps main clean)
- CI integration (GitHub Actions, GitLab CI) with pre-built Docker image
- Auto-detect Vercel/Netlify preview deployment URLs
- BYOK (Bring Your Own Key) for AI analysis — users provide their OpenAI/Anthropic API key

**Distribution:**
- Launch on Hacker News (OSS tools consistently hit front page)
- DevHunt, Product Hunt
- Twitter/X dev community (frontend devs are very active)
- Write "Frontend Bugs Hall of Shame" blog series
- GitHub README with compelling before/after screenshots

**Success metric:** 500 GitHub stars, 100 weekly active CLI users in 90 days.

## Phase 2: Cloud Platform (Month 3-8)

**Goal:** Convert CLI users to paid, add hosted infrastructure.

- Dashboard: visual timeline of every PR's visual changes
- Hosted rendering (no CI setup needed — just connect GitHub)
- Baseline management UI (approve, reject, compare)
- AI analysis (managed, no BYOK needed)
- Team features (shared baselines, approval workflows)

**Distribution:**
- Vercel Integration (marketplace listing)
- Netlify Build Plugin
- GitHub Marketplace listing
- Launch on Product Hunt as "v2"
- Sponsor frontend-focused newsletters (Bytes, React Status, Frontend Focus)

**Success metric:** 30 paying teams, $15K MRR.

## Phase 3: Production Monitoring (Month 8-14)

**Goal:** Expand from CI tool to always-on reliability platform.

- Continuous rendering of production pages (configurable schedule)
- Alerting: Slack, PagerDuty, email
- Production vs baseline drift detection
- Third-party script change detection
- Performance budget alerts

This is the "Datadog for frontend" phase. Moves from developer tool to platform.

**Success metric:** 10 Business tier customers, $50K MRR.

## Phase 4: Auto-Fix Marketplace (Month 14+)

**Goal:** Network effects and community lock-in.

- Community-contributed fix patterns
- Framework-specific fix packs (React, Next.js, Tailwind, etc.)
- Integration with design systems (Figma → baseline comparison)
- AI model fine-tuned on customer fix data

---

# 9. Risks & Mitigations

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

# 10. MVP Specification (v0.1)

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

## What NOT to Build for MVP

- ❌ Auto-fix generation (Phase 2 — validate AI analysis value first)
- ❌ Production monitoring (Phase 3)
- ❌ Dashboard/UI (Phase 2)
- ❌ Performance metrics (Phase 2)
- ❌ Accessibility testing (Phase 2)
- ❌ Team features (Phase 2)

## What IS in MVP (after CEO review expansions)

- ✅ Smart Route Discovery (auto-crawl, zero config)
- ✅ Preview Deployment Integration (Vercel/Netlify auto-detect)
- ✅ Multi-browser support (Chromium default, Firefox + WebKit optional)
- ✅ Dependency graph for smart rendering (only affected pages)
- ✅ Orphan branch baseline storage (not in main)

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

## Milestones

**M1: Core Rendering + Pixel Diff**
- Playwright renders pages from config (manual route list)
- Multi-browser support (Chromium default, Firefox + WebKit optional)
- pixelmatch compares against baselines (orphan branch storage)
- HTML report generated locally
- `npx frontguard run` works end-to-end

**M2: Smart Discovery + Dependency Graph**
- Route auto-discovery via link crawling from start URL
- Dependency graph: parse imports/CSS to map page→component→style
- Smart rendering: only render pages affected by changed files
- Fallback to "render all" when graph can't determine impact

**M3: GitHub Integration + Preview Deployments**
- GitHub Action wraps CLI (pre-built Docker image on GHCR)
- Auto-detect Vercel/Netlify preview URLs from CI environment
- PR comments with visual diffs (before/after + overlay)
- Baseline approval via PR comment reaction
- Status check (pass/fail)

**M4: AI Analysis**
- Vision model integration (BYOK — OpenAI/Anthropic)
- "What changed and why" explanations
- Issue classification (regression vs intentional vs content update)
- Confidence scoring
- Severity levels (critical / warning / info)

**M5: Polish & Launch**
- Documentation site
- Example repos (Next.js, Remix, Vite, plain HTML)
- Video demo showing zero-config → PR comment flow
- "Frontend Bugs Hall of Shame" launch content
- HN/DevHunt/ProductHunt launch

## What to Validate First

1. **Does route auto-discovery work reliably?** — Test against 20 real web apps (Next.js, Remix, Vite, plain HTML). Does it find all important routes? Does it miss any? Does it crawl too deep?
2. **Does the dependency graph reduce render count meaningfully?** — On 50 real PRs, what % of pages can be skipped? Target: 60-80% reduction.
3. **Does AI vision reliably distinguish regressions from intentional changes?** — Test with 50 real PR diffs from open-source projects
4. **Is the output useful?** — Show AI analysis to 10 frontend devs. Do they find the explanations accurate and helpful?
5. **Does preview URL auto-detection work across Vercel/Netlify?** — Test with 10 real projects on each platform.
6. **What's the false positive rate?** — Run against 20 PRs. How many non-issues does it flag? Target: <10%.

## Success Metrics (First 90 Days)

- **500+ GitHub stars** (indicates developer interest)
- **100+ weekly CLI runs** (indicates actual usage)
- **<10% false positive rate** on real PRs (indicates quality)
- **50+ Discord/community members** (indicates engagement)
- **5 blog post mentions** by frontend devs (indicates organic growth)

---

# 11. Name Candidates

| Name | Domain Vibes | Notes |
|------|-------------|-------|
| **Frontguard** | frontguard.dev | Direct, descriptive. "Guards your frontend." |
| **Vigil** | vigil.dev | "Watchful guardian." Elegant, short. |
| **Eyetest** | eyetest.dev | Literal — it's an eye test for your UI. Memorable. |
| **Pagewatch** | pagewatch.dev | Clear value prop in the name. |
| **Glassbox** | glassbox.dev | "See through your frontend." (Note: Glassbox Analytics exists in a different space.) |
| **Pixelguard** | pixelguard.dev | Specific to visual testing. Clear. |
| **Lookout** | lookout.dev | "On the lookout for frontend bugs." |
| **Shieldwall** | shieldwall.dev | Defensive. "Wall of protection for your UI." |
| **Retina** | retina.dev | Eye/vision reference. Short. Premium feel. |
| **Canopy** | canopy.dev | "Coverage over your frontend." Distinctive. |

**Top 3 recommendation:** Vigil, Frontguard, Retina — each is short, memorable, developer-friendly, and implies protection/visibility.

---

# CEO Review — Sections 2-11

*Full review completed in EXPANSION mode. Each section surfaces critical findings, important improvements, and expansion opportunities.*

---

# Review Section 2: Error & Rescue Map

**50+ failure modes mapped across 10 component categories.**

*Full error map: `/workspace/drive/ceo-sections-2-6.md` — Section 2*

**Critical failures that MUST be handled for v1.0:**

| # | Failure | Why Critical |
|---|---------|-------------|
| 1 | Route crawl finds 0 pages (wrong URL, auth required) | Silent zero-page pass ships broken baseline |
| 2 | Infinite crawl loop (SPA with dynamic params) | OOM + infinite CI minutes + cost explosion |
| 3 | Playwright OOM (too many workers, heavy pages) | Kills entire CI job with no output |
| 4 | Auth wall redirects to login page | All auth pages silently screenshot login = false diffs every PR |
| 5 | First run — no orphan branch exists | First run MUST succeed cleanly or nobody adopts |
| 6 | Concurrent baseline updates from multiple PRs | Race condition corrupts baselines for all subsequent PRs |
| 7 | Shallow git clone can't access orphan branch | Default GitHub Actions checkout is shallow — affects everyone |
| 8 | Pixelmatch dimension mismatch | Throws exception if unhandled — crashes comparison |
| 9 | AI API bad key / expired | Tool appears broken when it's a config issue |
| 10 | AI cost explosion (500 routes × vision API) | Unexpected $50 bill = immediate uninstall |
| 11 | PR comment >65,536 chars | GitHub API rejects = no output on large projects |
| 12 | Fork PR — limited GitHub permissions | Silent failure for all OSS contributors |
| 13 | Preview URL not ready (deployment still building) | Screenshots 404 = wrong diff |

**Key rescue patterns:**
- **Graceful degradation:** AI fails → fall back to pixel-diff-only (tool still useful)
- **Actionable errors:** Every error includes what happened, why, and how to fix it
- **Cost gating:** Only pages that FAIL pixel diff gate hit AI API. Config `aiMaxPages` limit.
- **Retry with backoff:** Preview URL polling, AI API rate limits, git operations

---

# Review Section 3: Security

*Full analysis: `/workspace/drive/ceo-sections-2-6.md` — Section 3*

🔴 **BYOK API Key Exposure Vectors:**
1. API key in error stack traces → redact ALL error output
2. API key in PR comment debug info → never include raw API calls
3. API key in CI logs via verbose mode → mask in structured logging
4. `.env` file committed with key → `.gitignore` template in `frontguard init`
5. Key passed as CLI arg → visible in `ps` output → use env vars only

**Required: Global redaction filter** — intercept ALL output (logs, errors, PR comments, HTML reports) and mask patterns matching API keys, tokens, secrets.

🔴 **Screenshot PII:**
- Rendered pages may contain user emails, financial data, personal info
- Screenshots uploaded to PR comments are visible to all repo collaborators
- **Mitigation:** Mask sensitive selectors, warn about PII in docs, support `redact` config for sensitive elements

🟡 **Auth storageState files:**
- Contain session cookies/tokens
- Must be `.gitignore`d — `frontguard init` adds it automatically
- Never logged, never included in reports

🟡 **GitHub Token Scope:**
- Minimum required: `contents:read`, `pull-requests:write`
- Document exact scopes — don't ask for more than needed
- Fork PRs have restricted permissions — detect and handle gracefully

---

# Review Section 4: Data & UX Edge Cases

*Full analysis: `/workspace/drive/ceo-sections-2-6.md` — Section 4*

**25+ edge cases mapped. The 6 that will define v1.0 quality:**

🔴 **Dark mode / light mode mismatch** — If user's system is dark but CI is light, every page shows as "changed" on every PR. **Fix:** Force consistent `prefers-color-scheme` in Playwright config. Default to `'light'`. Option: `theme: 'both'` creates separate baselines.

🔴 **CSS animations / transitions** — Non-deterministic frame capture = constant false diffs. **Fix:** Force `prefers-reduced-motion: reduce`, inject `* { animation: none !important; transition: none !important; }`, wait for settle after load.

🔴 **OS font rendering differences** — CI Linux fonts ≠ macOS = different text widths = every page differs. **Fix:** Docker image includes standard web fonts. All CI runs use same Docker image. Document font requirements.

🔴 **Flaky pages** — Pages with any non-deterministic content trigger false diffs every PR. **Fix:** Screenshot twice, compare retries. If diff between retries > threshold → mark as "flaky", quarantine from comparison. Config `flakyRetries: 2`.

🔴 **Dynamic content** — Timestamps, avatars, random data change every render. **Fix:** `maskSelectors` config, `page.clock.setFixedTime()`, HAR replay for API responses.

🔴 **Concurrent PRs** — 5 PRs comparing against same baseline. Each PR compares against main baseline, never modifies baselines until merge. Post-merge hook updates baselines.

---

# Review Section 5: Code Quality

*Full analysis: `/workspace/drive/ceo-sections-2-6.md` — Section 5*

**Module Architecture (CRITICAL):**

```
src/
├── cli/              # CLI entry point, arg parsing, config loading
│   ├── index.ts
│   └── commands/
├── core/             # Pipeline orchestrator, types, interfaces
│   ├── pipeline.ts
│   ├── types.ts
│   └── config.ts
├── discovery/        # Route discovery strategies
│   ├── crawler.ts
│   ├── filesystem.ts    # Next.js pages/, Remix routes/
│   └── sitemap.ts
├── graph/            # Dependency graph builder
│   ├── parser.ts
│   ├── resolver.ts
│   └── filter.ts
├── render/           # Page rendering
│   ├── playwright.ts
│   └── types.ts
├── diff/             # Comparison engines
│   ├── pixel.ts
│   ├── dom.ts
│   └── ai-vision.ts
├── storage/          # Baseline storage
│   ├── git-orphan.ts
│   └── types.ts
├── report/           # Output reporters
│   ├── github-pr.ts
│   ├── console.ts
│   └── json.ts
└── utils/            # Shared utilities
    ├── redact.ts     # Secret redaction — used EVERYWHERE
    ├── logger.ts
    └── retry.ts
```

**Key principles:**
- Strict pipeline: `discover → filter → render → diff → analyze → report` — each stage independent
- Error boundary per stage — one page failing doesn't kill the entire run
- Abstraction interfaces: `Renderer`, `Reporter`, `Differ`, `BaselineStorage` — swappable implementations
- Config validated once at startup (Zod schema), passed through pipeline. No `process.env` deep in modules.
- `npx frontguard init` detects framework (Next.js, Remix, etc.) and generates smart defaults

**Framework adapters (priority order):**
1. 🔴 Next.js (App Router + Pages Router) — largest user base
2. 🟡 Remix, Nuxt, SvelteKit
3. 🟢 Astro, Vite SPA, CRA

---

# Review Section 6: Test Coverage

*Full matrix: `/workspace/drive/ceo-sections-2-6.md` — Section 6*

**60+ test scenarios mapped. 17 gaps identified, 12 critical.**

**Critical gaps to fill before v1.0:**

| Gap | Why Critical |
|-----|-------------|
| OOM handling test | Untested = silent CI crash |
| Blank page detection | Silent pass on catastrophic regression |
| Concurrent git updates | Race condition corrupts all baselines |
| Shallow clone handling | Affects default GitHub Actions checkout |
| PR comment size limit | API rejection = no output |
| Fork PR handling | Silent failure for OSS contributors |
| Redaction in errors + comments | API key leak = security incident |
| Pipeline partial failure | One bad page kills run of 500 pages |
| AI cost gating | Unexpected $50 bill |
| Flaky page detection | Noise fatigue = tool abandoned |
| Dark/light mode handling | 100% false positive rate if mismatched |
| Memory limit handling | Silent crash, no diagnostics |

**Required test infrastructure:**
- Fixture Next.js app in `test/fixtures/` (known routes, auth pages, dynamic content)
- Mock GitHub API (nock/msw) for PR comment tests
- Mock AI API for vision analysis tests
- Git test harness (temp repos for orphan branch operations)
- Snapshot tests for PR comment markdown output

---

# Review Section 7: Performance

**Pipeline Time Targets:**

| Project Size | Routes | Smart Render | Total Time Target |
|-------------|--------|-------------|-------------------|
| Small | 50 | 12 affected | **< 2 minutes** |
| Medium | 200 | 40 affected | **< 5 minutes** |
| Large | 500 | 80 affected | **< 10 minutes** |

**Memory Budget:**
- 4 workers × Chromium = ~1.2-2GB (fits GitHub Actions' 7GB)
- Auto-detect available memory, scale workers accordingly
- Default 4 workers, configurable via `workers: N`

**AI API Optimization:**
- Parallel vision calls (not sequential) — 5 diffs × 5s = 5-8s parallel vs 25s sequential
- Batch similar diffs into single call — reduces calls 30-50%
- Cost: ~$0.02-0.06 per vision call (GPT-4o)

**PR Comment Size:** GitHub limit 65,536 chars. Strategy: summary table always fits, detail only for flagged routes, link to full HTML report artifact if too large.

🚀 **Expansion: Persistent Cache Layer** — Cache screenshots by content hash. Skip re-rendering if page dependencies unchanged. Additional 40-60% render reduction. **Effort: M | Impact: HIGH**

🚀 **Expansion: Performance Budgets** — Track LCP, CLS, FID per page. Alert on performance regression beyond budgets. Expands from visual to performance reliability. **Effort: S-M | Impact: HIGH**

---

# Review Section 8: Observability

**CLI Progress States:**

| State | Output |
|-------|--------|
| INITIALIZING | `⚙ Loading config from frontguard.config.ts` |
| DISCOVERING | `🔍 Discovering routes... found 47 routes` |
| FILTERING | `📊 Dependency graph: 12/47 routes affected` |
| RENDERING | `🖥 Rendering [████████░░] 8/12 routes` |
| COMPARING | `🔍 Comparing against baselines...` |
| ANALYZING | `🤖 AI analyzing 3 visual differences...` |
| COMPLETE | Summary table with pass/fail |

**Three verbosity levels:**
```bash
npx frontguard run                    # Summary only
npx frontguard run --verbose          # Per-route details + timing
npx frontguard run --debug            # Playwright traces, DOM dumps, raw AI logs (redacted)
```

**JSON output:** `npx frontguard run --output json` for CI integration and custom tooling.

**Error pattern:** Every error includes (1) what happened, (2) why, (3) how to fix:
```
✘ Failed to render /checkout
  Playwright timed out after 30s waiting for page load.
  Try: Ensure dev server is running, or increase pageTimeout in config.
```

🚀 **Expansion: Run History** — Store results locally, show trends over time. `npx frontguard history`. **Effort: S | Impact: Medium**

---

# Review Section 9: Deployment

**Versioning Strategy:**
- `0.x.y` pre-1.0 (breaking changes in minor OK)
- `1.0.0` when config format + CLI API + baseline format are stable
- npm semver strictly

**Docker Tags:** `latest`, `v1` (floating major), `v1.2.3` (immutable), `canary` (main branch)

**GitHub Action:** `frontguard/action@v1` (recommended), `@v1.2.3` (pinned), `@main` (bleeding edge)

**Config Migration:**
```typescript
export default {
  version: 1,  // Schema version — enables future migrations
  // ...
}
```
New versions read old format with deprecation warning. `npx frontguard migrate` auto-updates.

**Orphan Branch Schema:** `manifest.json` in branch root with schema version, enabling future format migrations without breaking existing baselines.

---

# Review Section 10: Future-Proofing

**Reversibility Scores:**

| Decision | Score | Notes |
|----------|-------|-------|
| Git orphan branch baselines | **4/5** | Easy to migrate to cloud storage later |
| Playwright as renderer | **2/5** | Deeply embedded, but Playwright is the clear winner — low switch risk |
| BYOK AI model | **5/5** | Trivially swappable behind interface |
| npm distribution | **5/5** | Can add brew, cargo, binaries later |
| TypeScript config | **3/5** | Great DX but locks out non-JS ecosystems. Add JSON/YAML later |
| Dependency graph | **4/5** | Purely additive — falls back to "render all" if removed |
| Route discovery | **4/5** | Falls back to manual routes |
| Preview URL detection | **5/5** | Just env var reading, zero coupling |

**Plugin Architecture (design now, implement Phase 2):**
```typescript
interface FrontguardPlugin {
  name: string;
  onRouteDiscovered?(route: Route): Route | null;
  onBeforeRender?(page: Page, route: Route): void;
  onAfterScreenshot?(screenshot: Buffer, route: Route): Buffer;
  onDiffDetected?(diff: DiffResult): DiffResult;
  onBeforeReport?(report: Report): Report;
  reporter?(results: RunResults): void;
}
```

**CLI → Cloud SaaS path:** Core engine (render → diff → analyze → report) is identical. Cloud adds hosting layer around same engine. Design engine as importable library from day 1.

🚀 **Expansion: Figma Integration** — Import designs as baselines. "Does implementation match the design?" Transforms from regression detection to design compliance. **Effort: L | Impact: VERY HIGH**

🚀 **Expansion: SDK** — `import { frontguard } from 'frontguard'` for programmatic use. **Effort: M | Impact: Medium**

---

# Review Section 11: Design Review

**CLI Output Mockup:**
```
 frontguard v1.0.0

 ⚙  Config loaded: frontguard.config.ts
 🔍 Discovering routes from http://localhost:3000...
    Found 47 routes (max depth: 3)
 📊 Dependency graph: 12/47 routes affected by changed files
 🖥  Rendering 12 routes × 3 viewports × 1 browser

    Rendering [████████████████████░░░░] 32/36  /checkout @ 768px

 ───────────────────────────────────────────────────────────────
  RESULTS                                          12 routes
 ───────────────────────────────────────────────────────────────

  ✓ /                          375  768  1440     PASS
  ✓ /pricing                   375  768  1440     PASS
  ✓ /blog                      375  768  1440     PASS
  ⚠ /checkout                  375  768  1440     WARNING
  ✘ /dashboard                 375  768  1440     REGRESSION
  ★ /settings                  375  768  1440     NEW

 ───────────────────────────────────────────────────────────────
  REGRESSIONS (1)
 ───────────────────────────────────────────────────────────────

  ✘ /dashboard @ 375px (chromium)
    Diff: 8.4% pixels changed
    AI: "The sidebar menu overlaps the main content area on
         mobile. The new flex-direction change in
         Dashboard.module.css:28 removes column layout."
    Severity: 🔴 Critical (confidence: 94%)

 ───────────────────────────────────────────────────────────────

  1 regression · 1 warning · 9 passed · 1 new
  📄 Full report: ./frontguard-report/index.html
  ⏱  Completed in 58.2s
```

**PR Comment Layout:**
- Header badge: `🔴 1 regression · ⚠️ 1 warning · ✅ 9 passed · ★ 1 new`
- Collapsible `<details>` per flagged route with before/after/diff images
- AI analysis quote + severity + confidence
- Action checkboxes: Apply fix / Approve as baseline / Will fix manually
- Footer: version, timing, link to full HTML report artifact

**HTML Report:** Dark mode, left sidebar with route list + status icons, main area with before/after slider, filter by severity, export to PDF.

🚀 **Expansion: Interactive HTML Report** — Before/after drag slider, zoom, diff toggle, approve/reject inline. **Effort: M | Impact: HIGH**

---

# Outside Voice — Independent Challenge

*A brutally honest external review challenging every assumption.*

*Full analysis: `/workspace/drive/outside-voice-challenge.md`*

**7 Potentially Fatal Risks Identified:**

🔴 **1. "Low adoption might mean low demand, not underserved market"**
Visual regression tools have existed for 10+ years. <5-10% adoption isn't "greenfield" — it might be "teams don't care enough." Percy launched 2015, Applitools 2013. The tools exist. The market hasn't adopted.
**Counter:** Previous tools had terrible DX (enterprise sales, heavy config). Zero-config + AI explanation is a genuinely new value prop. The "just eyeball it" approach breaks at scale.

🔴 **2. "AI classification can't determine developer intent"**
A vision model looking at two screenshots can't distinguish "button moved 20px (redesign)" from "button moved 20px (CSS bug)." This is the core product promise and it's fundamentally unreliable.
**Counter:** We don't need to be perfect — we need to be better than "pixel diff with no context." Confidence scoring + human override + git diff context significantly improves classification. The verify loop (Phase 2) is the ultimate answer.

🔴 **3. "Playwright ships visual regression for free"**
`toHaveScreenshot()` is built-in. The detection layer is commoditized.
**Counter:** Detection is table stakes. Understanding ("why did this change?") and remediation ("here's the fix") are the value. Nobody wants raw pixel diffs — they want actionable intelligence.

🔴 **4. "10-40x more expensive per PR than Chromatic"**
AI API calls make this structurally more expensive. $0.50-2.00/PR vs $0.05/PR for Chromatic.
**Counter:** BYOK means we don't bear the cost. Gate-then-AI means 90% of pages never hit AI. The value of understanding + fix justifies higher cost for users who experience it. Also: AI API costs are dropping 50%+ annually.

🔴 **5. "Applitools could clone this as a feature"**
$300M in funding, Visual AI, enterprise relationships. They could ship "AI fix suggestions" in one quarter.
**Counter:** Applitools is enterprise-locked. Their DX is poor. They can't compete on developer experience. Speed + focus + OSS distribution beats incumbent feature additions.

🔴 **6. "Data flywheel doesn't work with rented models + BYOK"**
Can't fine-tune GPT-4V/Claude on user data. BYOK blocks data collection. The moat is a rented castle.
**Counter:** The flywheel isn't model fine-tuning — it's the fix pattern library. "This type of DOM change → this fix" is stored data, not model weights. The pattern database is proprietary regardless of which model runs inference.

🔴 **7. "Screenshot flakiness is unsolved"**
Fonts, animations, dynamic content, scrollbars — pixelmatch catches all of these as changes.
**Counter:** This is why the gate-then-AI architecture matters. Pixel diff catches big changes. AI classifies whether they're real regressions or noise. Anti-flake measures (forced reduced-motion, frozen clock, HAR replay, Docker font consistency) address the root causes.

**The Contrarian Insight Worth Listening To:**
> "Visual regression testing might be a permanently niche market. The real opportunity is AI-powered visual *understanding* as a platform — visual regression is the smallest application, not the biggest."

**Our response:** This is actually right. The positioning should be "AI visual understanding for frontend engineering" with visual regression as the wedge. Phase 2 (auto-fix), Phase 3 (production monitoring), and the Figma integration expansion are all applications of the same core: "AI that understands what your frontend looks like and what it should look like." The CLI is the wedge, not the destination.

---

# Completion Summary

```
+====================================================================+
|            CEO PLAN REVIEW — COMPLETION SUMMARY                     |
+====================================================================+
| Mode selected        | EXPANSION                                   |
| Approach chosen      | OSS CLI First (Approach A)                  |
| Step 0               | 5 ambiguities resolved, 2 expansions added  |
+--------------------------------------------------------------------+
| Section 1  (Arch)    | 4 issues found, 2 expansions accepted       |
| Section 2  (Errors)  | 50+ failure modes, 13 CRITICAL              |
| Section 3  (Security)| 5 key threats, BYOK key exposure highest    |
| Section 4  (Data/UX) | 25+ edge cases, 6 CRITICAL for v1.0        |
| Section 5  (Quality) | Module architecture defined, 7 abstractions |
| Section 6  (Tests)   | 60+ scenarios, 17 GAPS, 12 critical         |
| Section 7  (Perf)    | Time budgets set, 2 expansions proposed     |
| Section 8  (Observ)  | 3 verbosity levels, JSON output, 1 expansion|
| Section 9  (Deploy)  | Semver + Docker + Action versioning defined |
| Section 10 (Future)  | Reversibility scored, plugin arch designed  |
| Section 11 (Design)  | CLI + PR comment + HTML report mockups      |
| Outside voice        | RAN — 7 fatal risks, 6 headwinds identified |
+--------------------------------------------------------------------+
| Expansions accepted  | Smart Discovery, Preview URLs,              |
|                      | Multi-browser, Performance Budgets,         |
|                      | Cache Layer, Interactive Report             |
| Expansions deferred  | Figma integration, SDK, Plugin system,      |
|                      | Production monitoring, Auto-fix             |
+--------------------------------------------------------------------+
| Critical path items  | 12 items that block confident v1.0 launch   |
| Unresolved decisions | 0 — all ambiguities resolved in Step 0      |
+====================================================================+
```

**12 Critical Path Items for v1.0:**

| # | Item | Risk if Missed |
|---|------|---------------|
| 1 | API key redaction in ALL output | Security incident |
| 2 | First-run zero-friction baseline creation | Nobody adopts |
| 3 | Animation/font/dark-mode determinism | 100% false positives |
| 4 | Flaky page detection + quarantine | Tool abandoned from noise |
| 5 | Preview URL wait-and-retry | Wrong diffs from timing |
| 6 | Concurrent baseline update safety | Corrupted baselines |
| 7 | OOM/memory resilience in CI | Silent crash, no output |
| 8 | PR comment size limit handling | No output on large projects |
| 9 | AI cost gating + budget limits | Unexpected bills |
| 10 | Pipeline partial failure handling | One page kills 500-page run |
| 11 | Shallow clone handling | Breaks default GH Actions |
| 12 | Blank page detection | Silent pass on catastrophe |

---

# Appendix: Research References

- **VisRefiner (Feb 2026):** Visual diff → iterative code fix loop using vision models. Directly validates the core product pattern.
- **Design2Code (Stanford/NAACL 2025):** GPT-4V reproduces original designs from screenshots 49% of the time. Proves vision model UI understanding.
- **RAG-based Responsive Layout Repair (ICSME 2025):** LLMs + retrieval of similar past fixes = effective CSS repair. Validates fix pattern library approach.
- **diff-dom (54K weekly npm downloads):** Mature structural DOM comparison library.
- **Playwright documentation:** toHaveScreenshot(), pixelmatch integration, HAR replay, storageState, CDP performance metrics.
