# CEO Review — Sections 7-11

---

## Section 7: Performance

### Pipeline Time Budgets

🔴 **Target: Total CI pipeline under 3 minutes for typical project (50 routes, 3 viewports, 1 browser)**

| Stage | 50 routes | 200 routes | 500 routes |
|-------|-----------|------------|------------|
| Route discovery (crawl) | 5-15s | 20-45s | 60-120s |
| Dependency graph parse | 1-3s | 3-8s | 8-20s |
| Smart render filter | <1s | <1s | <1s |
| Playwright render (4 workers) | 30-60s | 90-180s | 240-500s |
| Pixel diff (pixelmatch) | 2-5s | 8-15s | 20-40s |
| AI Vision (10% of pages, avg) | 10-30s | 30-60s | 60-120s |
| PR comment generation | 1-2s | 2-4s | 3-5s |
| **Total** | **~60-120s** | **~180-300s** | **~400-800s** |

### Memory Budget

| Config | RAM Required | Notes |
|--------|-------------|-------|
| 1 worker × Chromium | ~300-500MB | Minimal, slow |
| 4 workers × Chromium | ~1.2-2GB | Sweet spot for CI runners (GitHub Actions: 7GB available) |
| 4 workers × 3 browsers | ~3-5GB | Cross-browser, still fits standard CI |
| 8 workers × Chromium | ~2.5-4GB | Fast, for larger projects |

🟡 **Recommendation:** Default to 4 workers. Auto-detect available memory and scale workers accordingly. Config override: `workers: 8`.

### AI API Latency

| Provider | Vision Call Latency | Tokens/Call | Cost/Call |
|----------|-------------------|-------------|-----------|
| GPT-4o | 3-8s | ~1,500-3,000 | $0.02-0.06 |
| Claude 3.5 Sonnet | 2-6s | ~1,500-3,000 | $0.02-0.05 |
| Gemini 1.5 Pro | 2-5s | ~1,500-3,000 | $0.01-0.03 |

🟡 **Optimization: Parallel AI calls.** Don't process diffs sequentially. Fire all vision calls in parallel (respecting rate limits). With 5 diffs × 5s each: sequential = 25s, parallel = 5-8s.

🟡 **Optimization: Batching.** If multiple pages have similar diffs (same component changed), batch into one AI call with multiple screenshots. Reduces calls by 30-50% for component-level changes.

### PR Comment Size Limits

🔴 **GitHub PR comment limit: 65,536 characters.** With 200 routes, a verbose report would blow this limit easily.

**Strategy:**
- Summary table (pass/fail per route) — always fits
- Detail view: only include flagged routes (regression/warning)
- If still too large: link to full HTML report hosted as GitHub Actions artifact
- Config: `maxCommentRoutes: 20` — limit detailed entries in PR comment

### Cost at Scale

| Team Size | PRs/mo | Smart Render Savings | AI Calls/mo | Total Cost/mo |
|-----------|--------|---------------------|-------------|---------------|
| Small (5 devs) | 80 | 70% skip | ~200 | $10-30 |
| Medium (20 devs) | 300 | 70% skip | ~750 | $40-120 |
| Large (50 devs) | 800 | 70% skip | ~2,000 | $100-300 |

These are BYOK costs (user pays their own AI API). Our infra cost is $0 (runs in their CI).

### 🚀 Expansion: Persistent Cache Layer

Cache screenshots by content hash. If a page's dependencies haven't changed AND the page content hash matches, skip re-rendering entirely. Could reduce render count by additional 40-60% on top of dependency graph filtering.

**Effort:** M | **Risk:** Low | **Impact:** HIGH — cuts CI time nearly in half for repeat runs

### 🚀 Expansion: Performance Budgets

```typescript
// frontguard.config.ts
performance: {
  lcp: { warning: 2500, error: 4000 },  // ms
  cls: { warning: 0.1, error: 0.25 },
  fid: { warning: 100, error: 300 },     // ms
  bundleSize: { warning: '500KB', error: '1MB' },
}
```

Track performance metrics per page over time. Alert when a PR degrades performance beyond budgets. This is the "Datadog" angle — not just visual, but performance reliability.

**Effort:** S-M | **Risk:** Low | **Impact:** HIGH — expands value prop significantly

---

## Section 8: Observability

### CLI Output Design

🔴 **The CLI output IS the product for v1.** If it's ugly or confusing, developers won't trust it.

**Required states:**

| State | What User Sees |
|-------|---------------|
| INITIALIZING | `⚙ Loading config from frontguard.config.ts` |
| DISCOVERING | `🔍 Discovering routes from http://localhost:3000... found 47 routes` |
| FILTERING | `📊 Dependency graph: 12/47 routes affected by this change` |
| RENDERING | Progress bar: `🖥 Rendering [████████░░] 8/12 routes (4 workers)` |
| COMPARING | `🔍 Comparing screenshots against baselines...` |
| ANALYZING | `🤖 AI analyzing 3 visual differences...` |
| COMPLETE | Summary table with pass/fail per route |

### Debug Mode

🟡 **Three verbosity levels:**

```bash
npx frontguard run                    # Normal: summary only
npx frontguard run --verbose          # Verbose: per-route details, timing
npx frontguard run --debug            # Debug: full Playwright traces, DOM dumps, raw AI responses
```

Debug mode should save a `.frontguard-debug/` directory with:
- Playwright traces (viewable in Playwright Trace Viewer)
- Raw screenshots (pre-compression)
- DOM snapshots
- AI request/response logs (with API keys redacted)
- Timing breakdown per stage

### Structured Output

🟡 **JSON output mode for CI integration:**

```bash
npx frontguard run --output json > results.json
```

Enables other tools to consume results: custom dashboards, Slack bots, quality gates.

```json
{
  "summary": { "total": 47, "rendered": 12, "passed": 9, "regressions": 2, "warnings": 1 },
  "routes": [
    {
      "path": "/checkout",
      "viewport": "375",
      "browser": "chromium",
      "status": "regression",
      "confidence": 92,
      "explanation": "Button overflow on mobile...",
      "diffPercentage": 4.2,
      "screenshotUrl": "./snapshots/checkout-375-chromium.webp"
    }
  ],
  "timing": { "discovery": 8200, "render": 34500, "compare": 2100, "ai": 12400, "total": 57200 }
}
```

### Error Diagnosis Flow

🔴 **When frontguard fails, the user needs to know WHY immediately.** Bad error messages kill dev tool adoption.

**Pattern:** Every error includes:
1. What happened (one line)
2. Why it likely happened (context)
3. How to fix it (actionable step)

```
✘ Failed to render /checkout

  Playwright timed out after 30s waiting for page load.
  This usually means the page has a loading spinner that never resolves,
  or the dev server isn't running.

  Try:
  → Ensure your dev server is running at http://localhost:3000
  → Increase timeout: frontguard.config.ts → timeout: 60000
  → Run with --debug to see the Playwright trace
```

### 🚀 Expansion: Opt-in Telemetry

Anonymous usage analytics (like Next.js telemetry):
- How many routes discovered
- Average render time
- How many AI calls made
- Error types encountered
- Framework detected (Next.js, Remix, Vite, etc.)

**Effort:** S | **Risk:** Low (must be opt-in + clearly disclosed) | **Impact:** Medium — informs roadmap

### 🚀 Expansion: Run History & Trends

Store run results locally (`.frontguard/history/`). Show trends:

```bash
npx frontguard history

Run History (last 10):
DATE         BRANCH          ROUTES  PASSED  REGRESS  TIME
2026-01-15   feat/checkout    12      10      2       58s
2026-01-14   fix/header       8       8       0       34s
2026-01-13   feat/pricing     15      14      1       72s
```

**Effort:** S | **Risk:** Low | **Impact:** Medium — builds developer confidence over time

---

## Section 9: Deployment & Distribution

### npm Versioning

🔴 **Semver, strictly:**
- `0.x.y` during pre-1.0 (breaking changes allowed in minor)
- `1.0.0` when: config format stable, CLI API stable, baseline format stable
- Breaking changes = major bump only

**Release process:**
```
main branch → CI tests pass → npm publish → GitHub release → Docker build → GHCR push
```

### Docker Image Strategy

🟡 **Tag strategy:**

| Tag | Meaning | Updates |
|-----|---------|---------|
| `latest` | Most recent stable | Every release |
| `v1` | Latest 1.x.y | Every 1.x patch/minor |
| `v1.2.3` | Exact version | Immutable |
| `canary` | Latest main commit | Every merge to main |

Users in CI should pin to major: `ghcr.io/frontguard/runner:v1`

### GitHub Action Versioning

🔴 **Follow GitHub's convention:**

```yaml
- uses: frontguard/action@v1        # Recommended: major version tag
- uses: frontguard/action@v1.2.3    # Exact pin
- uses: frontguard/action@main      # Bleeding edge
```

`@v1` tag is a floating tag that points to latest `v1.x.x`. This is how `actions/checkout@v4` works.

### Backward Compatibility

🟡 **Config migration strategy:**

```typescript
// frontguard.config.ts
export default {
  version: 1,  // Config schema version — enables future migrations
  // ... rest of config
}
```

When config format changes:
1. New version reads old format, prints deprecation warning
2. `npx frontguard migrate` auto-updates config to new format
3. Old format supported for 2 major versions, then removed

### Orphan Branch Schema

🟡 **Baseline branch needs a manifest:**

```json
// manifest.json in orphan branch root
{
  "schemaVersion": 1,
  "createdBy": "frontguard@1.0.0",
  "routes": {
    "/checkout": {
      "viewports": ["375", "768", "1440"],
      "browsers": ["chromium"],
      "lastUpdated": "2026-01-15T10:30:00Z"
    }
  }
}
```

Schema version enables future migrations without breaking existing baselines.

### 🚀 Expansion: Update Notifications

```
⚡ frontguard v1.3.0 available (current: v1.2.1)
   Changelog: https://frontguard.dev/changelog#v1.3.0
   Update: npm install -g frontguard@latest
```

Show once per day, suppress with `--no-update-check`.

**Effort:** S | **Risk:** Low | **Impact:** Low-Medium

---

## Section 10: Future-Proofing

### Reversibility Scores

| Decision | Score | Rationale |
|----------|-------|-----------|
| Git orphan branch baselines | **4/5** | Easy to migrate to cloud storage later. Just change where CLI reads/writes. The orphan branch is isolated — deleting it has zero impact on main. |
| Playwright as rendering engine | **2/5** | Deeply embedded. Every rendering, screenshot, DOM snapshot, auth, network mock depends on Playwright APIs. Switching to Puppeteer/Selenium would be a rewrite. BUT Playwright is the clear winner — low risk of needing to switch. |
| BYOK AI model | **5/5** | Trivially swappable. Abstract behind an interface: `analyzeScreenshots(baseline, current, diff) → AnalysisResult`. Swap providers with zero user impact. |
| npm distribution | **5/5** | Standard. Can add other channels (brew, cargo, binary downloads) without removing npm. |
| TypeScript config | **3/5** | Good for DX but locks out non-JS ecosystems. If we want Python/Ruby users, need JSON/YAML config too. Adding alternative formats is medium effort. |
| Dependency graph approach | **4/5** | Purely additive optimization. If it breaks, fall back to "render all." Can be removed entirely with zero impact on correctness. |
| Smart Route Discovery | **4/5** | Falls back to manual routes. Discovery is opt-in by nature. |
| Preview URL auto-detection | **5/5** | Just env var reading. Zero coupling. Can add new platforms (Railway, Render, Cloudflare Pages) trivially. |

### What Each Decision Opens / Closes

**Orphan branch opens:** Simple local-first workflow, works offline, no cloud dependency, easy to understand.
**Orphan branch closes:** Real-time collaboration on baselines, cross-repo baseline sharing, baseline analytics without cloning repo.

**Playwright opens:** Multi-browser from one API, excellent trace debugging, active development, Microsoft backing.
**Playwright closes:** Environments without Node.js, browser-less CI (but who runs visual tests without browsers?).

**BYOK opens:** Zero revenue friction at adoption, user controls costs, supports any model.
**BYOK closes:** Fine-tuned model monetization (can't ship custom model if user brings their own), usage analytics for model improvement.

### Plugin Architecture

🟡 **Design the plugin interface now, even if no plugins exist yet:**

```typescript
interface FrontguardPlugin {
  name: string;
  
  // Hook into pipeline stages
  onRouteDiscovered?(route: Route): Route | null;  // Filter/modify routes
  onBeforeRender?(page: Page, route: Route): void;  // Inject setup
  onAfterScreenshot?(screenshot: Buffer, route: Route): Buffer;  // Process screenshots
  onDiffDetected?(diff: DiffResult): DiffResult;  // Enrich diff results
  onBeforeReport?(report: Report): Report;  // Modify report
  
  // Custom reporters
  reporter?(results: RunResults): void;
}
```

This enables:
- Framework adapters as plugins (Next.js, Nuxt, SvelteKit)
- Custom reporters (Slack, Teams, Jira)
- Auth plugins (OAuth, SSO, custom login flows)
- Screenshot processors (redaction, annotation)

**Effort:** M | **Risk:** Low | **Impact:** HIGH — enables ecosystem

### Path from CLI → Cloud SaaS

| Component | CLI (v1) | Cloud (v2) | Migration Effort |
|-----------|----------|------------|-----------------|
| Rendering | User's CI | Our workers | New infra, same Playwright code |
| Baselines | Git orphan branch | Cloud storage (R2) | New storage adapter |
| AI | BYOK | Our API key (managed) | Config change |
| Reporting | PR comment + HTML | Dashboard + PR comment | New frontend, same data format |
| Auth | GitHub token from CI | OAuth + API keys | New auth layer |
| Scheduling | CI triggers | Cron + webhooks | New scheduler |

**Key insight:** The core engine (render → diff → analyze → report) is identical. Cloud is a new hosting layer around the same engine. Design the engine as a library that both CLI and cloud import.

### 🚀 Expansion: Figma Integration (Future)

Import Figma designs as baselines. Compare rendered pages against design intent, not just previous code.

```
Figma frame → export as screenshot → use as "design baseline"
Rendered page → screenshot
AI: "Does the implementation match the design?"
```

This transforms frontguard from "regression detection" to "design compliance" — a much bigger market.

**Effort:** L | **Risk:** Medium (Figma API complexity) | **Impact:** VERY HIGH — opens design team as buyer

### 🚀 Expansion: SDK for Programmatic Use

```typescript
import { frontguard } from 'frontguard';

const results = await frontguard.run({
  baseUrl: 'http://localhost:3000',
  routes: ['/checkout'],
  viewports: [375],
});

if (results.regressions.length > 0) {
  // Custom handling
}
```

Enables: custom test frameworks, integration into existing CI pipelines, programmatic baseline management.

**Effort:** M | **Risk:** Low | **Impact:** Medium — power users and integrations

---

## Section 11: Design Review

### State Coverage

| State | CLI | PR Comment | HTML Report |
|-------|-----|------------|-------------|
| **LOADING** | Spinner + stage name + progress bar | N/A (comment posted after completion) | N/A (generated after completion) |
| **EMPTY** | "No routes found. Check your config or try --discover." | "Frontguard ran but found no routes to compare." | Empty state with setup instructions |
| **SUCCESS** | Green summary: "✓ 47 routes checked. All clear." | Green badge: "✅ Frontguard: All Clear (47 routes)" | Green header, all routes showing ✓ |
| **PARTIAL** | Yellow summary: "⚠ 2 warnings in 47 routes." | Yellow badge: "⚠️ Frontguard: 2 Warnings" + details | Yellow header, flagged routes highlighted |
| **ERROR/REGRESSION** | Red summary: "✘ 3 regressions detected in 47 routes." | Red badge: "🔴 Frontguard: 3 Regressions" + details | Red header, regressions at top |
| **TOOL FAILURE** | Red error with diagnosis + fix steps | "❌ Frontguard failed to run. [error details]" | N/A (not generated) |

### CLI Output Mockup

```
 frontguard v1.0.0

 ⚙  Config loaded: frontguard.config.ts
 🔍 Discovering routes from http://localhost:3000...
    Found 47 routes (max depth: 3)
 📊 Dependency graph: 12/47 routes affected by changed files
 🖥  Rendering 12 routes × 3 viewports × 1 browser (36 snapshots)

    Rendering [████████████████████░░░░] 32/36  /checkout @ 768px

 🔍 Comparing against baselines (branch: frontguard-baselines)

 ───────────────────────────────────────────────────────────────
  RESULTS                                          12 routes
 ───────────────────────────────────────────────────────────────

  ✓ /                          375  768  1440     PASS
  ✓ /pricing                   375  768  1440     PASS
  ✓ /blog                      375  768  1440     PASS
  ✓ /about                     375  768  1440     PASS
  ✓ /contact                   375  768  1440     PASS
  ✓ /features                  375  768  1440     PASS
  ✓ /docs                      375  768  1440     PASS
  ✓ /login                     375  768  1440     PASS
  ✓ /signup                    375  768  1440     PASS
  ⚠ /checkout                  375  768  1440     WARNING
  ✘ /dashboard                 375  768  1440     REGRESSION
  ★ /settings                  375  768  1440     NEW (no baseline)

 ───────────────────────────────────────────────────────────────
  REGRESSIONS (1)
 ───────────────────────────────────────────────────────────────

  ✘ /dashboard @ 375px (chromium)
    Diff: 8.4% pixels changed
    AI: "The sidebar menu overlaps the main content area on
         mobile viewport. The new flex-direction change in
         Dashboard.module.css:28 removes the column layout
         that kept the sidebar contained."
    Severity: 🔴 Critical (confidence: 94%)
    
 ───────────────────────────────────────────────────────────────
  WARNINGS (1)
 ───────────────────────────────────────────────────────────────

  ⚠ /checkout @ 768px (chromium)
    Diff: 1.2% pixels changed
    AI: "Minor spacing change in form field margins. Likely
         intentional from the padding update in Form.css:15."
    Severity: 🟡 Low (confidence: 78%)

 ───────────────────────────────────────────────────────────────

  1 regression · 1 warning · 9 passed · 1 new

  📄 Full report: ./frontguard-report/index.html
  ⏱  Completed in 58.2s (render: 34s, compare: 2s, AI: 12s)
```

### PR Comment Mockup

```markdown
## 🔍 Frontguard Visual Regression Report

**🔴 1 regression** · ⚠️ 1 warning · ✅ 9 passed · ★ 1 new

<details>
<summary>🔴 <code>/dashboard</code> @ 375px — Sidebar overlaps content</summary>

| Baseline | Current | Diff |
|----------|---------|------|
| ![baseline](url) | ![current](url) | ![diff](url) |

**AI Analysis** (confidence: 94%)
> The sidebar menu overlaps the main content area on mobile viewport. 
> The new `flex-direction` change in `Dashboard.module.css:28` removes 
> the column layout that kept the sidebar contained.

**Severity:** 🔴 Critical

**Suggested Action:**
- [ ] 🔧 Apply suggested fix
- [ ] ✅ Approve as new baseline
- [ ] 👀 Will fix manually

</details>

<details>
<summary>⚠️ <code>/checkout</code> @ 768px — Minor spacing change</summary>

| Baseline | Current | Diff |
|----------|---------|------|
| ![baseline](url) | ![current](url) | ![diff](url) |

**AI Analysis** (confidence: 78%)
> Minor spacing change in form field margins. Likely intentional 
> from the padding update in `Form.css:15`.

**Severity:** 🟡 Low

- [ ] ✅ Approve as new baseline
- [ ] 👀 Will review

</details>

<details>
<summary>★ <code>/settings</code> — New page (no baseline)</summary>

No baseline exists for this route. Screenshots captured for review.

| 375px | 768px | 1440px |
|-------|-------|--------|
| ![375](url) | ![768](url) | ![1440](url) |

- [ ] ✅ Approve as baseline

</details>

---
*Frontguard v1.0.0 · 12 routes · 58.2s · [Full Report](artifact-url)*
```

### HTML Report Design

🟡 **Key design principles:**
- Dark mode default
- Left sidebar: route list with status icons (✓ ⚠ ✘ ★)
- Main area: selected route detail (before/after/diff images)
- Image comparison: slider overlay (drag to reveal before/after)
- Filter bar: show all / regressions only / warnings only / new only
- Export button: download as PDF for stakeholder review

### 🚀 Expansion: Interactive HTML Report

Add client-side interactivity to the HTML report:
- **Before/after slider** — drag handle to reveal baseline vs current
- **Zoom** — click to zoom into specific areas
- **Filter by severity** — toggle regression/warning/pass/new
- **Diff highlight toggle** — show/hide pixel diff overlay
- **Responsive preview** — toggle between viewport sizes in the report
- **Approve/reject inline** — buttons that update baseline branch (requires GitHub token)

**Effort:** M | **Risk:** Low | **Impact:** HIGH — transforms report from "file to glance at" to "tool to work in"

### UX Feel Assessment

🟡 **Current plan feels: Professional but utilitarian.** To feel premium:
- Custom color palette (not default terminal colors) — match branding
- ASCII art logo in CLI header
- Celebration animation on all-clear: `✨ All 47 routes look perfect! ✨`
- Thoughtful empty states (not just "no data")
- Consistent emoji language throughout (✓ ⚠ ✘ ★ not mixed systems)

The difference between "another CLI tool" and "a tool developers love" is 20% more effort on these details.
