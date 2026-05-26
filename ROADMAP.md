# Frontguard Roadmap

*Last updated: May 2026. Based on competitive research across 10 competitors, developer pain point analysis from Reddit/HN/GitHub, technology trend analysis, and GTM playbook research. Full research available internally (see project documentation).*

---

# The Strategic Thesis

The visual regression testing market (~$1B, 9.5% CAGR) has a **retention crisis, not a demand crisis.** Teams try visual testing, get burned by false positives from cross-OS rendering differences, blind-approve everything, lose trust, and abandon the tool within months.

**The gap:** No tool combines CLI-first + AI vision analysis + Playwright-native + self-hostable + affordable. Percy is slow and expensive. Chromatic requires Storybook. Applitools is enterprise-only and opaque. Lost Pixel has no AI and is going stale. Playwright's built-in visual testing is notoriously flaky (428-day debugging battles documented).

**Frontguard's bet:** AI that understands *what changed and whether it matters* beats pixel-perfect comparison. The rendering layer is a commodity (Daytona, Browserbase, etc. commoditize it further every quarter). The moat is the intelligence layer — AI classification, auto-fix generation, and the fix pattern database that compounds with usage.

**The threat clock:** GitHub Copilot could add visual PR review in 12-18 months. Observability platforms (Datadog, Grafana) could bolt on visual monitoring in 12-24 months. We have a window, not infinite runway.

---

# What's Shipped (v0.1)

Phase 1 is complete. The core engine works — deterministic rendering, AI-powered analysis, full CLI workflow, and CI integration. This is a working visual regression testing tool, not a prototype.

✅ **Anti-flake rendering**
Multi-render consensus via `findConsensusScreenshot()` — takes N screenshots (default `antiFlakeRenders: 3`), groups identical frames, returns the majority vote. Combined with SSIM perceptual matching, this solves the #1 reason teams abandon visual testing. Runs in <10 seconds where Percy adds 5+ minutes.

✅ **AI analysis & classification**
Dual-model analysis using GPT-4o and Anthropic vision. Classifies every diff as regression, intentional change, or content update. Outputs severity scoring, confidence levels, and a `suggestedFix` field with AI-generated remediation guidance. This is the feature no competitor has — understanding *what changed and whether it matters.*

✅ **Screenshot diffing**
Dual-engine comparison: pixelmatch for pixel-level precision, plus a full SSIM (Structural Similarity Index) implementation for perceptual matching. Catches real regressions while ignoring rendering noise.

✅ **CLI tool**
Full command set: `run` (execute visual tests), `init` (scaffold config), `update-baselines` (approve changes). Comprehensive option flags for routes, viewports, thresholds, AI provider selection, and output formatting.

✅ **GitHub Action**
Composite action via `action.yml` with automatic preview URL detection for Vercel and Netlify deployments. Parses JSON output for structured CI integration. Copy-paste setup:
```yaml
- uses: frontguard/action@v1
  with:
    url: ${{ steps.deploy.outputs.url }}
```

✅ **Route discovery**
Filesystem-based discovery for Next.js (App Router + Pages Router), Remix, SvelteKit, and Nuxt. Falls back to live breadth-first crawling for unknown frameworks. Zero-config for supported frameworks — point it at a codebase and it finds the routes.

✅ **Multi-viewport rendering**
Default viewports at 375px (mobile), 768px (tablet), and 1440px (desktop). Fully configurable via CLI flags or config file. Every route is tested at every viewport automatically.

✅ **Baseline management**
Git orphan branch storage with worktree-based reads and writes. Baselines live in version control alongside your code, not in a third-party cloud. Concurrent update detection prevents baseline conflicts in team workflows.

✅ **Figma design compliance**
Full Figma plugin implementation — connects to the Figma API, exports design frames as PNGs, and reports pixel-level deviations between design intent and rendered production pages. "Your login page drifted 12% from the approved Figma design. Here's where."

---

# What's Next: v0.2

**Goal:** Ship the items that are 80% done, add the high-impact distribution pieces, and validate on real-world repos. This is the "earn trust and get noticed" release.

🟡 **PR thumbnail grid** *(partially shipped)*
PR comments work — Frontguard creates and updates markdown comments with regression/warning sections and AI classifications. What's missing: embedded screenshot thumbnails showing before/after/diff inline in the PR. This is the #1 conversion trigger from "neat tool" to "team standard." Developers want visual diffs *in the PR*, not in terminal output.

🔴 **Per-route threshold overrides** *(not started)*
Global threshold works, but different pages need different sensitivity. A marketing page with dynamic testimonials needs a higher threshold than a checkout form:
```typescript
routes: [
  { path: '/checkout', threshold: 0.001 }, // strict
  { path: '/blog/*', threshold: 0.05 },    // lenient
  { path: '/pricing', ignore: ['.testimonial-carousel'] },
]
```

🔴 **`frontguard doctor` command** *(not started)*
Environment diagnostic that checks for sources of non-determinism: Playwright version, Chromium version, font availability, viewport/device scale factor, animation state, time zone. Outputs actionable warnings. This is table-stakes developer UX — every serious CLI tool has a `doctor` command.

🔴 **Comparison content: "Frontguard vs Percy vs Chromatic"** *(not started)*
Honest, technical comparison pages for the docs site. Developers search for "percy alternative" and "chromatic alternative" — own these search terms. Include: setup time, CI impact, pricing at 1K/5K/50K screenshots, false positive rates, AI capabilities. This is an SEO play with compounding returns.

🔴 **Real-world validation on 5 open-source repos** *(not started)*
Synthetic test accuracy means nothing. Run against real repos: a Next.js app, a Tailwind dashboard, a component library, an e-commerce storefront, a docs site. Measure: true positives, false positives, false negatives, classification accuracy. If accuracy is below 70% on real diffs, retune prompts before promoting AI as a feature.

🔴 **Demo GIF + 30-second video** *(not started)*
The launch lives or dies on the first 10 seconds of the README. Show: a real regression detected, the AI explanation, the diff overlay, the PR comment. For HN, Reddit, Twitter — show the zero-to-first-regression-caught flow. Without this, nobody clicks install.

🟡 **Vercel/Netlify platform integration** *(partially shipped)*
Preview URL auto-detection from environment variables works. What's missing: dedicated platform plugins for Vercel Integration Marketplace and Netlify Build Plugins that provide one-click setup and deeper integration.

**Distribution plan for v0.2 launch:**
1. Pre-launch: answer questions in r/Playwright and r/QualityAssurance for 2 weeks (build credibility, don't promote)
2. Submit PR to awesome-playwright list
3. Launch day (Tue/Wed 9-10am ET): HN Show HN + r/Playwright + r/webdev + X thread simultaneously
4. Week 1: Dev.to article "How to add visual regression testing to Playwright in 5 minutes"
5. Respond to EVERY issue and comment personally

**Kill criteria:** If you can't get 10 people to try it in 6 weeks of the v0.2 launch, the positioning is wrong. Pivot to pure Playwright plugin (drop the standalone CLI angle) or pivot to production monitoring (drop the CI testing angle).

---

# Phase 3: The Moat — AI Auto-Fix (Month 3–6)

**Goal:** 500 stars. 200 weekly users. Fix suggestions accepted >20% of the time. First paying customers.

This is the feature no competitor has. Every competitor stops at "here's what changed." Frontguard goes further: "here's what changed, here's why it's a regression, here's the fix, and I've verified the fix works."

🟡 **AI fix generation — sandbox verification loop** *(partially shipped)*
The `suggestedFix` field is already populated by AI analysis and displayed in reports. What's missing: the automated verify-and-apply loop.
1. AI generates a CSS patch (already works)
2. 🔴 Fix is applied in a Daytona sandbox
3. 🔴 Sandbox renders the page with the fix applied
4. 🔴 New screenshot is compared against baseline
5. 🔴 If it matches: "Verified fix — apply?" If not: discard, suggest manual review

Start with CSS-only fixes (highest AI reliability):
- Overflow/truncation fixes
- Spacing/margin/padding corrections
- Responsive breakpoint fixes
- Z-index/stacking fixes
- Color/opacity regressions

🔴 **Fix pattern database**
Every accepted fix becomes training data. After 1,000 accepted fixes, Frontguard knows: "When a Tailwind `space-y-4` is removed and content overflows, the fix is usually to add `gap-4` to the parent flex container." This is the compounding moat that no competitor can replicate without the same volume of real-world fix data.

🔴 **Accessibility convergence**
Same screenshot, dual analysis: visual regression + accessibility audit. The regulatory tailwind is massive — web accessibility lawsuits up 320% since 2018, European Accessibility Act mandating compliance. This is allocated budget you can capture with zero additional rendering cost.
- Color contrast violations
- Missing alt text on visible images
- Touch target sizes
- Focus indicator visibility
- Heading hierarchy issues

🟡 **Cloud tier launch** *(partially shipped)*
The Hono API scaffold and Daytona sandbox runner exist. What's missing: persistent storage (replace in-memory Map with Turso/D1), real auth (GitHub OAuth), and actual deployment. Launch only if 5+ teams actively ask for hosted rendering.
- Free: 500 cloud screenshots/mo. Pro: $29/mo, 10K screenshots/mo.
- Never per-screenshot pricing. Feature-gated: team collaboration is the upsell.

---

# Phase 4: Production Visual Monitoring (Month 6–12)

**Goal:** 1,000 stars. $15K MRR. 30 paying teams. Expand from CI tool to always-on reliability platform.

This is the "Datadog for frontend" move. Production visual monitoring is an emerging category — PageBolt, Visual Sentinel, MonitorSensei are all early movers, but nobody dominant yet. Frontguard already has the rendering, diffing, and AI analysis. Adding a scheduler makes it a monitoring platform.

🟡 **Zero-config URL monitoring** *(partially shipped)*
The production monitoring plugin exists with URL monitoring, threshold alerting, and history tracking. What's missing: a scheduler/cron to run checks on cadence (hourly, daily, on-deploy). Once that's in, this becomes:
- Crawl the site, auto-discover critical pages
- Establish baselines from current production state
- Render on schedule, alert when visual drift exceeds threshold
- Catches: broken deploys, CDN failures, third-party script injection, ad layout corruption, A/B test leakage

This is differentiated from uptime monitoring (which checks HTTP 200) and from CI testing (which runs pre-merge). This is "does your live site look right, right now?"

🟡 **Integration layer: Slack, PagerDuty, webhooks** *(partially shipped)*
Generic webhook alerting works (Slack/Discord incoming webhooks). What's missing: platform-specific integrations (native Slack app, PagerDuty integration, OpenTelemetry export). Position Frontguard as "the visual layer you embed" rather than a standalone destination. This also mitigates the threat of observability platforms adding visual features — if Frontguard IS the visual layer they use, expansion is partnership, not competition.

🔴 **Third-party script monitoring**
Detect when an ad network, analytics SDK, or chat widget changes your page layout. This is a pain point nobody owns. An ad partner changes their creative sizes, your page layout breaks, and you don't know until customers complain. Frontguard detects it in the next monitoring cycle.

🟡 **Performance visual correlation**
When a page gets slower (Core Web Vitals degrade), correlate with visual changes. "The homepage got 400ms slower AND the hero image layout shifted. Here's when it started." Bridges the gap between performance monitoring (Datadog, Lighthouse) and visual quality.

**Pricing evolution:**
- Add Monitoring tier: $49/mo — unlimited production URLs, hourly checks, alerting
- Or bundle into Pro: $29/mo includes CI + monitoring (aggressive positioning vs Checkly's $60/mo)

---

# Phase 5: Network Effects + Enterprise (Month 12–18)

**Goal:** $50K MRR. 100 paying teams. Enterprise pipeline.

🟡 **Marketplace integrations** *(partially shipped)*
Preview URL auto-detection for Vercel and Netlify works. What's missing:
- 🔴 Vercel Integration Marketplace listing (auto-run on every preview deployment)
- 🔴 Netlify Build Plugin
- ✅ GitHub Action (shipped — composite action with JSON output parsing)

🔴 **Team features**
- Shared baselines across team members (cloud-hosted)
- Approval workflows (designer approves visual changes, dev approves code)
- Role-based access (viewer, reviewer, admin)
- SSO/SAML for enterprise
These are the conversion trigger from Free → Pro → Enterprise. Gate team features, never individual developer workflow.

✅ **Figma-to-production visual comparison** *(shipped)*
Full Figma plugin connects to the Figma API, exports design frames as PNGs, and reports deviations between design intent and rendered production pages. This was originally a Phase 5 item — shipped early as part of v0.1.

🔴 **Fine-tuned visual analysis model**
After 10,000+ comparisons with human feedback, fine-tune a smaller model (Phi-4 class, 15B params) for:
- Higher accuracy on common regression patterns
- Faster inference (local execution possible)
- Lower cost per analysis
- Privacy-friendly: can run on-prem for enterprise customers who can't send screenshots to OpenAI

🔴 **Fix pattern marketplace**
Community-contributed fix patterns for common frameworks:
- Tailwind overflow patterns
- React hydration mismatch fixes
- Next.js image optimization regressions
- CSS Grid/Flexbox cross-browser fixes

This creates a data flywheel: more users → more fix patterns → better auto-fix accuracy → more users.

---

# What's Deliberately Not On This Roadmap

**Mobile app screenshots.** Completely different rendering pipeline (iOS Simulator, Android Emulator), different audience (mobile QA teams vs web developers), different competitors (Applitools does this well). Adding mobile would dilute focus without expanding the core market.

**Puppeteer support.** Playwright does everything Puppeteer does, plus Firefox and WebKit. The 117M downloads/month Playwright market is large enough. Maintaining a second browser automation abstraction is pure engineering overhead with near-zero market expansion.

**Self-hosted cloud (for now).** Only build if enterprise customers demand it AND are willing to pay $500+/mo for it. Until then, the CLI is effectively self-hosted and the cloud is managed.

**Browser extension / DevTools integration.** Looks cool in demos, adds zero distribution. Developers work in terminals and CI, not DevTools.

**Video-based regression (Replay.io's approach).** Technically interesting but compute-heavy, slow, and unproven. Static screenshot + AI analysis is faster, cheaper, and already works. Monitor Replay.io's progress but don't chase their approach.

---

# Threat Mitigation Map

| Threat | Window | Mitigation Strategy |
|--------|--------|---------------------|
| GitHub Copilot adds visual PR review | 12-18 months | Ship auto-fix before they ship visual review. Auto-fix is 10x harder than detection — it's defensible even if Copilot can screenshot. |
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
| v0.2: Earn Trust | 🟡 Next up | 50 stars, 20 weekly users, <10% FP rate on real repos | Can't find 10 users in 6 weeks of launch |
| Phase 3: The Moat | 🔴 Future | Fix suggestions accepted >20%, first paying customers | <5% fix acceptance after tuning |
| Phase 4: Monitor | 🔴 Future | $15K MRR, 30 paying teams | <$5K MRR after 6 months of cloud |
| Phase 5: Scale | 🔴 Future | $50K MRR, 100 paying teams | Stalling growth, losing to platform incumbents |

---

# The Honest Bottom Line

Frontguard's window is 12-18 months before GitHub Copilot and observability platforms enter this space. The path to defensibility runs through two moats:

1. **The fix pattern database.** Every accepted auto-fix trains the system. At 10K fixes, the accuracy advantage is insurmountable by a new entrant. This is the data moat.

2. **Workflow integration depth.** Being the visual layer embedded in GitHub PRs, Slack alerts, Vercel deploys, and Datadog dashboards makes Frontguard hard to rip out — even if a bigger player offers a "good enough" alternative.

The core engine is built and working. The AI classification, anti-flake rendering, CLI workflow, CI integration, and Figma compliance are all shipped. What's next is validation on real-world repos, distribution (demo, comparison content, launch), and building the auto-fix moat before the window closes.
