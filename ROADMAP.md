# Frontguard Roadmap

*Last updated: March 2026. Based on competitive research across 10 competitors, developer pain point analysis from Reddit/HN/GitHub, technology trend analysis, and GTM playbook research. Full research at `/workspace/drive/research-synthesis.md`.*

---

# The Strategic Thesis

The visual regression testing market (~$1B, 9.5% CAGR) has a **retention crisis, not a demand crisis.** Teams try visual testing, get burned by false positives from cross-OS rendering differences, blind-approve everything, lose trust, and abandon the tool within months.

**The gap:** No tool combines CLI-first + AI vision analysis + Playwright-native + self-hostable + affordable. Percy is slow and expensive. Chromatic requires Storybook. Applitools is enterprise-only and opaque. Lost Pixel has no AI and is going stale. Playwright's built-in visual testing is notoriously flaky (428-day debugging battles documented).

**Frontguard's bet:** AI that understands *what changed and whether it matters* beats pixel-perfect comparison. The rendering layer is a commodity (Daytona, Browserbase, etc. commoditize it further every quarter). The moat is the intelligence layer — AI classification, auto-fix generation, and the fix pattern database that compounds with usage.

**The threat clock:** GitHub Copilot could add visual PR review in 12-18 months. Observability platforms (Datadog, Grafana) could bolt on visual monitoring in 12-24 months. We have a window, not infinite runway.

---

# Phase 1: Prove It Works (Week 0–6)

**Goal:** 50 stars, 20 weekly CLI users, <15% false positive rate on real repos.

**The core problem to solve:** Deterministic screenshots that match locally and in CI. This is the #1 reason teams abandon visual testing. Everything else is noise until this works reliably.

**What to build:**

🟢 **Anti-flake rendering (already built)**
Multi-render consensus is fully wired: `findConsensusScreenshot()` in `src/render/playwright.ts` takes N screenshots, groups identical frames, returns the majority vote. Config: `antiFlakeRenders: 3`. This gives Frontguard a structural advantage — Percy adds 5+ minutes to CI trying to solve flakiness. Frontguard solves it in <10 seconds with consensus + SSIM perceptual matching. **Phase 1 task: validate it works on a real-world flaky page, not build it.**

🔴 **Real-world AI validation**
Synthetic test accuracy (100%) means nothing. Run against 5 real open-source repos: a Next.js app, a Tailwind dashboard, a component library, an e-commerce storefront, a docs site. Measure: true positives, false positives, false negatives, classification accuracy. If accuracy is below 70% on real diffs, retune prompts before promoting AI as a feature. The AI must at minimum reliably distinguish these 4 cases:
- Intentional redesign (large visual change, code change explains it)
- Regression (visual break, code change doesn't intend it)
- Content update (text/image changed, layout intact)
- Rendering noise (anti-aliasing, font rendering, subpixel differences)

🔴 **GitHub Action polish**
The action.yml and Dockerfile exist but haven't been tested in real CI. The GitHub Action is distribution channel #1 (71M jobs/day, 35% YoY growth). The integration must be copy-paste:
```yaml
- uses: frontguard/action@v1
  with:
    url: ${{ steps.deploy.outputs.url }}
```
Publish to GitHub Marketplace. Most Playwright users already run in GitHub Actions — meet them where they are.

🟡 **Demo GIF + comparison screenshots for README**
The launch lives or dies on the first 10 seconds of the README. Show: a real regression detected, the AI explanation, the diff overlay, the PR comment. Without this, nobody clicks install.

🟡 **30-second demo video**
For HN, Reddit, Twitter. Show the zero-to-first-regression-caught flow.

**What NOT to build:** Cloud dashboard, production monitoring, Figma integration, team features. All premature at 0 users.

**Distribution:**
1. Pre-launch: answer questions in r/Playwright and r/QualityAssurance for 2 weeks (build credibility, don't promote)
2. Submit PR to awesome-playwright list
3. Launch day (Tue/Wed 9-10am ET): HN Show HN + r/Playwright + r/webdev + X thread simultaneously
4. Week 1: Dev.to article "How to add visual regression testing to Playwright in 5 minutes"
5. Respond to EVERY issue and comment personally

**Kill criteria:** If you can't get 10 people to try it in 6 weeks, the positioning is wrong. Pivot to pure Playwright plugin (drop the standalone CLI angle) or pivot to production monitoring (drop the CI testing angle).

---

# Phase 2: Solve the False Positive Problem (Week 6–14)

**Goal:** <10% false positive rate. 200 stars. 50 weekly active CLI users. First 5 teams running in CI.

This phase exists because every data signal says the same thing: **false positives kill visual testing adoption.** Teams don't stop because features are missing. They stop because they can't trust the results. Every feature in this phase exists to earn trust.

**What to build:**

🔴 **Intelligent baseline management**
Current: orphan branch stores baselines. Problem: when a team intentionally redesigns a page, they have to manually update baselines. This creates a "baseline rot" problem where nobody updates and diffs accumulate.
Build: `frontguard update --interactive` — shows each diff with AI classification ("this looks intentional based on the code change"), lets developer approve/reject per-screenshot. PR-based baseline update flow: Frontguard opens a PR to update baselines, team reviews visual changes in the PR diff, merge = approved.

🔴 **Smart threshold tuning**
Different pages need different sensitivity. A marketing page with dynamic testimonials needs a higher threshold than a checkout form. Build per-route threshold overrides:
```typescript
routes: [
  { path: '/checkout', threshold: 0.001 }, // strict
  { path: '/blog/*', threshold: 0.05 },    // lenient
  { path: '/pricing', ignore: ['.testimonial-carousel'] },
]
```

🔴 **PR-native review (not a dashboard)**
Research is clear: developers want visual diffs inline in GitHub PRs, not in a separate tool. Build a GitHub App that posts a PR comment with:
- Thumbnail grid of all changed screenshots
- AI classification for each (regression / intentional / content change)
- One-click "approve new baseline" button
- Collapsible full-size diffs
This is the #5 developer want ("review in the PR, not a separate dashboard") and the key conversion trigger from free → paid.

🟡 **Deterministic rendering hardening**
Document and enforce: specific Playwright version, specific Chromium version, specific font fallbacks, consistent viewport + device scale factor, disabled animations, frozen time. Create a `frontguard doctor` command that checks the environment and warns about sources of non-determinism.

🟡 **Comparison content: "Frontguard vs Percy vs Chromatic"**
Honest, technical comparison blog post. Developers search for "percy alternative" and "chromatic alternative." Own these search terms. Include: setup time, CI impact, pricing at 1K/5K/50K screenshots, false positive rates, AI capabilities.

**What NOT to build:** Cloud rendering, production monitoring, auto-fix, team management. Still premature.

---

# Phase 3: The Moat — AI Auto-Fix (Week 14–26)

**Goal:** 500 stars. 200 weekly users. Fix suggestions accepted >20% of the time. First paying customers.

This is the feature no competitor has. Every competitor stops at "here's what changed." Frontguard goes further: "here's what changed, here's why it's a regression, here's the fix, and I've verified the fix works."

**What to build:**

🔴 **AI fix generation (CSS-first)**
When Frontguard classifies a diff as a regression, generate a CSS fix:
1. AI analyzes the baseline screenshot, current screenshot, and the git diff that caused the change
2. AI generates a CSS patch (not full file rewrite — surgical fix)
3. Fix is applied in a Daytona sandbox
4. Sandbox renders the page with the fix applied
5. New screenshot is compared against baseline
6. If it matches (within threshold): "Verified fix — apply?"
7. If it doesn't match: discard, suggest manual review

Start with CSS-only fixes (highest AI reliability):
- Overflow/truncation fixes
- Spacing/margin/padding corrections
- Responsive breakpoint fixes
- Z-index/stacking fixes
- Color/opacity regressions

The Daytona sandbox infrastructure is already built. This is assembling existing pieces into the killer workflow.

🔴 **Fix pattern database**
Every accepted fix becomes training data. After 1,000 accepted fixes, Frontguard knows: "When a Tailwind `space-y-4` is removed and content overflows, the fix is usually to add `gap-4` to the parent flex container." This is the compounding moat that no competitor can replicate without the same volume of real-world fix data.

🟡 **Accessibility convergence**
Same screenshot, dual analysis: visual regression + accessibility audit. The regulatory tailwind is massive — web accessibility lawsuits up 320% since 2018, European Accessibility Act mandating compliance. This is allocated budget you can capture with zero additional rendering cost.
- Color contrast violations
- Missing alt text on visible images
- Touch target sizes
- Focus indicator visibility
- Heading hierarchy issues

🟡 **Cloud tier launch (minimal)**
Only if there are 5+ teams actively asking for hosted rendering. Launch with:
- Daytona-powered cloud rendering (already built)
- Turso/D1 persistence (replace in-memory Map)
- GitHub OAuth for auth (real user accounts)
- Free: 500 cloud screenshots/mo. Pro: $29/mo, 10K screenshots/mo.
- Never per-screenshot pricing. Feature-gated: team collaboration is the upsell.

---

# Phase 4: Production Visual Monitoring (Month 6–12)

**Goal:** 1,000 stars. $15K MRR. 30 paying teams. Expand from CI tool to always-on reliability platform.

This is the "Datadog for frontend" move. Research shows production visual monitoring is an emerging category — PageBolt, Visual Sentinel, MonitorSensei are all early movers, but nobody dominant yet. Frontguard already has the rendering, diffing, and AI analysis. Adding a scheduler makes it a monitoring platform.

**What to build:**

🔴 **Zero-config URL monitoring**
"Paste your production URL. We'll monitor it."
- Crawl the site, auto-discover critical pages
- Establish baselines from current production state
- Render on schedule (hourly, daily, on-deploy)
- Alert when visual drift exceeds threshold
- Catches: broken deploys, CDN failures, third-party script injection, ad layout corruption, A/B test leakage

This is differentiated from uptime monitoring (which checks HTTP 200) and from CI testing (which runs pre-merge). This is "does your live site look right, right now?"

🔴 **Integration layer: Slack, PagerDuty, webhooks, OpenTelemetry**
Visual regressions become alerts in existing workflows. Position Frontguard as "the visual layer you embed" rather than a standalone destination. This also mitigates the threat of observability platforms adding visual features — if Frontguard IS the visual layer they use, expansion is partnership, not competition.

🟡 **Third-party script monitoring**
Detect when an ad network, analytics SDK, or chat widget changes your page layout. This is a pain point nobody owns. An ad partner changes their creative sizes, your page layout breaks, and you don't know until customers complain. Frontguard detects it in the next monitoring cycle.

🟡 **Performance visual correlation**
When a page gets slower (Core Web Vitals degrade), correlate with visual changes. "The homepage got 400ms slower AND the hero image layout shifted. Here's when it started." Bridges the gap between performance monitoring (Datadog, Lighthouse) and visual quality.

**Pricing evolution:**
- Add Monitoring tier: $49/mo — unlimited production URLs, hourly checks, alerting
- Or bundle into Pro: $29/mo includes CI + monitoring (aggressive positioning vs Checkly's $60/mo)

---

# Phase 5: Network Effects + Enterprise (Month 12–18)

**Goal:** $50K MRR. 100 paying teams. Enterprise pipeline.

**What to build:**

🔴 **Marketplace integrations**
- Vercel: Integration that auto-runs Frontguard on every preview deployment (Vercel Marketplace listing)
- Netlify: Build plugin
- GitHub App: One-click install, auto-configures for all repos in an org
These are distribution multipliers. Each integration puts Frontguard in front of the platform's entire user base.

🔴 **Team features**
- Shared baselines across team members (cloud-hosted)
- Approval workflows (designer approves visual changes, dev approves code)
- Role-based access (viewer, reviewer, admin)
- SSO/SAML for enterprise
These are the conversion trigger from Free → Pro → Enterprise. Gate team features, never individual developer workflow.

🟡 **Figma-to-production visual comparison**
Import Figma designs as expected baselines. Compare rendered production pages against designer intent. "Your login page drifted 12% from the approved Figma design. Here's where." This is premium positioning — design teams pay for this.

🟡 **Fine-tuned visual analysis model**
After 10,000+ comparisons with human feedback, fine-tune a smaller model (Phi-4 class, 15B params) for:
- Higher accuracy on common regression patterns
- Faster inference (local execution possible)
- Lower cost per analysis
- Privacy-friendly: can run on-prem for enterprise customers who can't send screenshots to OpenAI

🟡 **Fix pattern marketplace**
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

| Phase | When | Key Metric | Kill Signal |
|-------|------|-----------|-------------|
| 1: Prove It | Week 6 | 50 stars, 20 weekly users | Can't find 10 users in 6 weeks |
| 2: Earn Trust | Week 14 | <10% false positive rate, 50 weekly users | >25% FP rate after tuning |
| 3: The Moat | Month 6 | Fix suggestions accepted >20%, first paying customers | <5% fix acceptance |
| 4: Monitor | Month 12 | $15K MRR, 30 paying teams | <$5K MRR after 6 months of cloud |
| 5: Scale | Month 18 | $50K MRR, 100 paying teams | Stalling growth, losing to platform incumbents |

---

# The Honest Bottom Line

Frontguard's window is 12-18 months before GitHub Copilot and observability platforms enter this space. The path to defensibility runs through two moats:

1. **The fix pattern database.** Every accepted auto-fix trains the system. At 10K fixes, the accuracy advantage is insurmountable by a new entrant. This is the data moat.

2. **Workflow integration depth.** Being the visual layer embedded in GitHub PRs, Slack alerts, Vercel deploys, and Datadog dashboards makes Frontguard hard to rip out — even if a bigger player offers a "good enough" alternative.

The product is built. The technology works. The market gap is validated. What's left is execution against a clock.
