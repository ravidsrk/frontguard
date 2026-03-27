# Frontguard — Roadmap

**Last updated:** Based on current codebase state

---

## Done

| Area | Status |
|------|--------|
| Core CLI (render → diff → report) | ✅ Shipped |
| 5-framework route discovery (Next, Nuxt, SvelteKit, Remix, Astro) | ✅ Shipped |
| BFS crawler for runtime route discovery | ✅ Shipped |
| Dependency graph + smart rendering | ✅ Shipped |
| AI vision analysis (OpenAI + Anthropic) | ✅ Shipped, 100% synthetic accuracy |
| GitHub Action | ✅ Shipped |
| Plugin architecture (9 hooks) | ✅ Shipped |
| Figma design compliance plugin | ✅ Built (needs real API testing) |
| Production monitoring plugin | ✅ Built (needs real webhook testing) |
| Performance budgets plugin | ✅ Built |
| Git orphan branch baseline storage | ✅ Shipped |
| HTML + JSON + Console + GitHub PR reporters | ✅ Shipped |
| Security hardening (shell injection, path traversal, redaction) | ✅ Shipped |
| Memory management (streaming, temp files, buffer disposal) | ✅ Shipped |
| CI workflow (Node 18/20/22 matrix) | ✅ Shipped |
| ESLint + TypeScript strict mode | ✅ Shipped |
| 312 tests, 25/26 file coverage | ✅ Shipped |
| VitePress documentation site (10 pages) | ✅ Shipped |
| Dogfood config (frontguard.config.ts) | ✅ Shipped |
| Launch content (HN post, tweet thread) | ✅ Drafted |

---

## Phase 1: Ship to Public (next)

The product is built. Nothing else needs to be coded before people can use it. The only blocker is publishing and getting it in front of users.

**1.1 — Publish npm package**
- `npm publish` — claim the `frontguard` name
- Verify `npx frontguard init` works from a clean project
- Verify `npx frontguard run --url https://example.com` works E2E

**1.2 — Deploy docs site**
- Deploy VitePress site to frontguard.dev (or frontguard.vercel.app)
- Add getting-started quickstart with copy-paste commands
- Add "3 minutes to first visual diff" walkthrough

**1.3 — Create demo repo**
- Public repo: `ravidsrk/frontguard-demo`
- Next.js app with Frontguard GitHub Action running on every PR
- 3 example PRs: one that passes, one with a regression, one with an intentional change
- Screenshots of the PR comment in the README
- This IS the sales pitch — people click, see it working, adopt it

**1.4 — Claim the GitHub Action**
- Publish `ravidsrk/frontguard` as a GitHub Marketplace action
- Verify the `action.yml` + `Dockerfile` work in real CI

---

## Phase 2: Anti-Flake + Ignore Regions (adoption unlocker)

False positives are the #1 reason people abandon visual testing tools. This must be solid before pushing for adoption.

**2.1 — Anti-flake rendering**
- Multi-render: take 2-3 screenshots, only flag if ALL differ from baseline
- Wait-for-idle: `networkidle` + custom `waitForSelector` before capture
- Font loading: wait for `document.fonts.ready`
- Animation freeze: inject CSS `* { animation: none !important; transition: none !important; }`
- Deterministic dates: mock `Date.now()` and `Intl.DateTimeFormat` during render

**2.2 — Ignore regions**
- Config: `ignoreRegions: [{ selector: '.ad-banner' }, { rect: { x, y, w, h } }]`
- Implementation: mask matched regions with solid color before pixel diff
- Built-in ignore patterns: cursor blink, scrollbar rendering, system font differences
- Auto-detect dynamic content: flag regions that change between two identical runs

**2.3 — Perceptual diffing fallback**
- When pixel diff > 0 but < threshold, use structural similarity (SSIM) or perceptual hash
- Reduces noise from anti-aliasing, sub-pixel rendering, gamma differences
- Plugin hook: `afterCompare` can swap in custom diff algorithms

---

## Phase 3: Real-World Validation + Beta Users

**3.1 — Run against real repos**
- Use `scripts/validate-ai-real.ts` against 5 open-source projects
- Target: cal.com, shadcn/ui, next.js docs, tailwindcss.com, vercel.com
- Measure: false positive rate, AI accuracy, CI time overhead
- Document results in `validation-results/`

**3.2 — Recruit 3 beta testers**
- DM maintainers of mid-size open-source projects (100-5K stars)
- Offer: free setup assistance, direct support channel
- Ask for: 2 weeks of usage, honest feedback, permission to quote
- Goal: 1 testimonial, 1 case study for landing page

**3.3 — Iterate on feedback**
- Track every false positive and false negative
- Improve AI prompt with real-world examples (few-shot learning)
- Add DOM context to AI analysis (diff the DOM snapshots, not just pixels)

---

## Phase 4: Launch

**4.1 — Show HN** (draft ready: `docs/launch/hn-post.md`)
- Tuesday or Wednesday, 8-9am ET
- Title: "Show HN: Frontguard – Open-source AI visual regression testing"
- Link to demo repo (not docs site — people want to see it work)

**4.2 — Twitter/X thread** (draft ready: `docs/launch/tweet-thread.md`)
- 6-tweet thread with before/after screenshots
- Post same day as HN for amplification

**4.3 — Dev communities**
- Reddit: r/webdev, r/javascript, r/reactjs, r/nextjs
- Dev.to post: "How We Catch Visual Bugs Before Production"
- Product Hunt (wait 1 week after HN for momentum)

**4.4 — 90-day targets**

| Metric | Target |
|--------|--------|
| npm weekly downloads | 500+ |
| GitHub stars | 500+ |
| Active repos with Frontguard | 50+ |
| False positive rate | <10% |

---

## Phase 5: Cloud Tier (monetization)

**5.1 — Hosted rendering service**
- Users send route list, service returns screenshots + diffs
- Eliminates Playwright from user CI (faster, less flaky)
- API: `POST /v1/run { url, routes, viewports }`

**5.2 — Hosted HTML reports**
- Shareable URLs: `reports.frontguard.dev/{run-id}`
- Team dashboard with historical trends
- Baseline management UI (approve/reject from browser)

**5.3 — Pricing**

| Tier | Price | Includes |
|------|-------|----------|
| OSS | Free forever | CLI + Action, BYOK AI, unlimited local runs |
| Pro | $29/mo | Managed rendering, hosted reports, 5K screenshots/mo |
| Team | $99/mo | Team management, SSO, 20K screenshots/mo |
| Enterprise | Custom | SLA, on-prem, unlimited |

---

## Phase 6: Product Expansion

**6.1 — Figma design compliance (GA)**
- Test Figma plugin against real Figma files
- Figma webhook: auto-compare when designs update
- Design drift score per route over time

**6.2 — Production monitoring (GA)**
- Scheduled visual checks on live URLs (cron)
- Alerting: Slack, PagerDuty, OpsGenie, email
- Visual uptime monitoring: "is the site rendering correctly?"

**6.3 — VS Code extension**
- Live preview of visual changes as you edit
- Side-by-side: baseline vs current in editor
- One-click baseline update

**6.4 — Component-level testing**
- Storybook integration: diff every story
- Playwright component testing bridge
- React/Vue/Svelte component isolation

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives kill adoption | 🔴 Critical | Phase 2 (anti-flake + ignore regions) before push |
| Vercel builds native visual diff | 🔴 Critical | Ship fast, build community, stay framework-agnostic |
| AI unreliable on complex UIs | 🟡 High | Real-world validation (Phase 3), add DOM context |
| Playwright CI is slow | 🟡 High | Smart rendering + cloud tier |
| Nobody cares about visual testing | 🔴 Critical | Validate with beta users first, pivot to design compliance |
| npm name squatted | 🟡 High | Publish immediately (Phase 1.1) |

---

## Immediate Next Actions

1. `npm publish` — claim the name, today
2. Deploy docs site
3. Create `ravidsrk/frontguard-demo` with working GitHub Action
4. Ship anti-flake rendering (Phase 2.1)
5. Find 3 beta testers

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO-0C | Ship Approach A (full product) + add B (Playwright plugin) | P1+P6 | Product is built, ship it. Plugin is low-effort addition. | C (production monitoring) — different audience, defer |
| 2 | CEO-0C | TASTE: Subagent argues B or C should be primary | — | Surfaced at gate | — |
| 3 | CEO-S1 | Fix SSIM crash (unguarded computeSSIM) | P5 | Explicit error handling > silent crash. 1 line fix. | — |
| 4 | CEO-S2 | Flag cloud API persistence as blocker for paid tier | P3 | In-memory Map is fine for demo, not for $29/mo | — |
| 5 | CEO-S6 | Flag pipeline.ts test gap | P1 | 790 LOC orchestrator with 0 direct tests is a risk | — |
| 6 | Design | Fix accessibility P0 items (toggles, contrast, ARIA) | P1 | WCAG AA failure is a legal and ethical requirement | — |
| 7 | Design | Add 768px/1024px dashboard breakpoints | P1 | Single breakpoint at 640px leaves tablet unusable | — |
| 8 | Design | Unify card bg/border colors across pages | P5 | Explicit consistency > subtle drift | — |
| 9 | Design | TASTE: Primary button color (blue vs white) | — | Surfaced at gate | — |
| 10 | Eng | Delete one of two cloud API implementations | P4+P5 | DRY. Two divergent impls will drift. Keep deployed one. | — |
| 11 | Eng | Fix XSS in cloud report script tag | P5 | JSON.stringify for JS context. 1 line fix. | — |
| 12 | Eng | Add auth to deployed cloud API | P1 | Zero auth on mutating endpoints = public write access | — |
| 13 | Eng | Add LRU cap to in-memory Map | P3 | Pragmatic fix: max 1000 runs, evict oldest | — |
| 14 | Eng | Fix threshold unit documentation | P5 | Explicit convention prevents contributor bugs | — |
| 15 | Eng | TASTE: Pipeline test strategy (unit vs E2E-only) | — | Surfaced at gate | — |
| 16 | Eng | TASTE: Ship CLI first, delay cloud launch | — | Surfaced at gate | — |
