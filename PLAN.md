# Frontguard — Forward Plan

**Status:** Core product complete. 312 tests. 100% file coverage. Plugin system shipped. Ready for validation + launch.

---

## Where We Are

| Dimension | Status |
|-----------|--------|
| Core CLI (render, diff, report) | ✅ Complete |
| GitHub Action | ✅ Complete |
| Plugin architecture | ✅ Complete (9 hooks, 3 built-in plugins) |
| Route discovery (filesystem + crawler) | ✅ Complete (5 frameworks) |
| Dependency graph (smart rendering) | ✅ Complete |
| AI vision analysis | ✅ Built, ⚠️ unvalidated |
| Security hardening | ✅ Shell injection, path traversal, redaction |
| Memory management | ✅ Streaming, temp files, buffer disposal |
| Test coverage | ✅ 312 tests, 25/26 files with direct tests |
| Documentation site | ✅ VitePress, 10 pages |
| npm publish prep | ✅ LICENSE, CHANGELOG, package.json |
| Figma plugin | ✅ Built, needs real-world testing |
| Monitoring plugin | ✅ Built, needs real-world testing |
| Perf budgets plugin | ✅ Built, needs real-world testing |

---

## What's Next — Ordered by Impact

### Phase 1: Validate AI (CRITICAL — blocks everything)

The entire product thesis depends on AI accurately classifying visual changes. Zero real-world validation exists.

**1A. Run synthetic validation suite**
```bash
npx tsx scripts/validate-ai.ts
```
- 10 programmatic test cases already built
- Needs: OPENAI_API_KEY or ANTHROPIC_API_KEY
- Target: >70% classification accuracy on synthetic cases
- If <60%: rethink the prompt, add DOM/CSS diff context, or pivot to rule-based classification

**1B. Run against real open-source repos (5-10 PRs)**
```bash
npx tsx scripts/validate-ai-real.ts --repo vercel/next.js --pr 12345
```
- Script scaffold exists, needs completion:
  - Framework detection → dev server startup
  - Screenshot capture on base vs head branch
  - Ground-truth labeling UI (simple HTML page)
- Target repos: next.js, shadcn/ui, tailwindcss.com, cal.com
- Target: >80% agreement with human labels on 50+ diffs

**1C. Build prompt iteration pipeline**
- Save each AI response alongside the prompt version
- A/B test prompt variations: more context (DOM diff, CSS diff, git diff) vs less
- Track accuracy per prompt version in `validation-results/`

**Deliverable:** A confidence number. "Frontguard's AI correctly classifies X% of visual changes." If X < 70%, the product doesn't work and we need to fix the AI before anything else.

---

### Phase 2: First Real Users (2-3 beta teams)

**2A. npm publish**
```bash
npm publish
```
- Package is ready (LICENSE, CHANGELOG, files field, bin entry)
- Claim the `frontguard` name on npm

**2B. Dogfood on Frontguard itself**
- Add `frontguard.config.ts` to this repo
- Set up GitHub Action on PRs to this repo
- Use the product to catch regressions in its own HTML report output
- Fix any rough edges found during dogfooding

**2C. Recruit 2-3 beta testers**
- Target: Open-source projects with >100 GitHub stars
- Offer: Free setup, direct Slack/Discord support
- Goal: 1 organic testimonial, 1 case study
- Track: false positive rate, CI time impact, user complaints

**2D. Iterate on false positives**
- This is the #1 killer of visual testing tools
- Implement: anti-flake rendering (multiple renders, wait for network idle, font loading)
- Implement: ignore regions (header timestamps, ads, dynamic content)
- Implement: perceptual hashing fallback when pixel diff is noisy

---

### Phase 3: Launch

**3A. Show HN post** (draft in `docs/launch/hn-post.md`)
- Time: Tuesday or Wednesday 8-9am ET
- Include: before/after demo GIF, npm install one-liner, GitHub Action setup
- Link to: live demo repo with Frontguard running on PRs

**3B. Twitter/X thread** (draft in `docs/launch/tweet-thread.md`)
- 6-tweet thread with screenshots
- Tag: @veraborja (Percy), @chromaborja (Chromatic), @nicedayfor (Lost Pixel)
- Pin the thread

**3C. Dev tool directories**
- Product Hunt launch
- dev.to post
- Reddit r/webdev, r/javascript, r/reactjs
- DevHunt, AlternativeTo

**3D. Success metrics (90-day)**
| Metric | Target |
|--------|--------|
| npm weekly downloads | 500+ |
| GitHub stars | 500+ |
| Active repos using Frontguard | 50+ |
| False positive rate | <10% |
| AI classification accuracy | >80% |

---

### Phase 4: Monetization

**4A. Cloud tier**
- Managed screenshot infrastructure (no Playwright in user CI)
- Hosted HTML reports with shareable URLs
- Team management, notification preferences
- Historical trend dashboard

**4B. Pricing**
| Tier | Price | Includes |
|------|-------|----------|
| OSS | Free | CLI + Action, BYOK AI, 500 screenshots/mo |
| Pro | $29/mo | Managed rendering, hosted reports, 5K screenshots/mo |
| Team | $99/mo | Team management, SSO, 20K screenshots/mo |
| Enterprise | Custom | SLA, on-prem, unlimited |

**4C. Revenue model**
- Managed rendering = server cost + margin
- AI analysis = API cost + margin (or bundled model)
- Historical data = storage cost + margin

---

### Phase 5: Product Expansion

**5A. Figma integration GA**
- Currently: plugin built, needs real Figma API testing
- Next: Figma webhook for auto-comparison on design changes
- Next: Design drift dashboard (how far has code drifted from design?)

**5B. Production monitoring GA**
- Currently: plugin built with webhook alerts
- Next: Scheduled monitoring (cron-style visual checks)
- Next: Visual uptime monitoring (is the site rendering correctly?)
- Next: Alerting integrations (PagerDuty, OpsGenie, Slack)

**5C. VS Code extension**
- Live preview of visual changes as you code
- Inline diff annotations in the editor
- One-click baseline update

**5D. Multi-framework deepening**
- Storybook integration (component-level visual testing)
- Playwright component testing integration
- React Native / mobile web support

---

## Architecture Decisions Log

| Decision | Status | Reversibility |
|----------|--------|---------------|
| TypeScript + ESM | Locked | 1/5 — would require full rewrite |
| Playwright for rendering | Locked | 2/5 — abstracted behind interface |
| Pixelmatch for pixel diff | Locked | 4/5 — swappable via plugin |
| Git orphan branch baselines | Default | 5/5 — BaselineStorage interface |
| BYOK AI | Default | 5/5 — can add managed AI later |
| Plugin architecture | Locked | 3/5 — plugin API is public contract |
| VitePress docs | Default | 5/5 — just markdown files |

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI classification unreliable | 🔴 Critical | Medium | Validate before launch (Phase 1) |
| Vercel builds native visual diff | 🔴 Critical | Low | Move fast, build community moat |
| False positives kill adoption | 🔴 Critical | High | Anti-flake rendering, ignore regions |
| Playwright CI is slow/heavy | 🟡 High | Medium | Smart rendering, managed cloud tier |
| npm name squatted | 🟡 High | Low | Publish immediately |
| No one cares about visual testing | 🔴 Critical | Medium | Pivot to design compliance if needed |

---

## Immediate Next Actions

1. **Run `npx tsx scripts/validate-ai.ts`** — get a real accuracy number
2. **`npm publish`** — claim the package name
3. **Add frontguard.config.ts to this repo** — dogfood
4. **Set up GitHub Action on this repo** — eat your own cooking
5. **Find 2 beta testers** — DM open-source maintainers

Everything else follows from validation results.
