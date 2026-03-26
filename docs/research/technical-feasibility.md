# AI-Powered Frontend Visual Regression & Auto-Fix Tool — Technical Feasibility Research

**Date:** March 2026
**Status:** Research Complete

---

# 1. Vision Models for UI Comparison

**Can GPT-4V / Claude Vision / Gemini reliably detect visual regressions?**

**Short answer: YES — with caveats.** Modern vision models are excellent at detecting layout shifts, missing elements, color changes, and structural regressions. They struggle with sub-pixel differences and anti-aliasing artifacts (which is actually a *feature* — humans don't notice those either).

**State of the Art (March 2026):**

| Model | MMMU Pro Score | Best For |
|-------|--------------|----------|
| Gemini 3 Flash/Pro | Top tier | Fast batch processing, cost-effective for high-volume comparison |
| Claude Opus 4.5 | Top tier | Detailed structural analysis, nuanced layout description |
| GPT-4V/4o | Strong | Good balance of speed and accuracy |

**Key Research Papers:**

| Paper | Year | Key Finding |
|-------|------|-------------|
| **Design2Code** (Stanford/Georgia Tech/Microsoft/Google DeepMind, NAACL 2025) | 2024-2025 | Benchmark of 484 real-world webpages. GPT-4V generates code matching original designs ~49% of the time (human preference). Proves MLLMs understand UI structure deeply. |
| **VisRefiner** (Chinese Academy of Sciences, Feb 2026) | 2026 | Iterative refinement using **visual diffs between generated and target screenshots**. Directly relevant — shows models CAN learn from visual differences to generate code fixes. Uses reinforcement learning on visual similarity. |
| **FrontendBench** (ByteDance, Jun 2025) | 2025 | Benchmark for evaluating LLMs on frontend development via automatic evaluation. Tests CSS/HTML generation quality. |
| **Using Vision LLMs For UI Testing** (UW, 2025) | 2025 | Direct study on using vision LLMs for automated UI testing. Found vision models can detect regressions that pixel-diff tools miss (and vice versa). |
| **AI for Context-Aware Visual Change Detection** (arXiv 2405.00874, 2024) | 2024 | Context-aware approach to visual change detection in software test automation using AI. |

**Commercial Validation:**

- **Applitools Eyes** — Production-grade AI visual testing used by thousands of companies. Uses proprietary deep learning (not generic LLMs) trained specifically on UI comparison. Proves the market and technical feasibility.
- **TestMu AI (fka LambdaTest)** — AI-native visual regression with Selenium/Playwright integration.
- **Percy (BrowserStack)** — Widespread adoption of visual regression in CI pipelines.

**Practical Capability Assessment for Our Use Case:**

| Task | Feasibility | Notes |
|------|-------------|-------|
| Detect missing/moved elements | 🟢 High | Vision models excel at structural comparison |
| Detect color/typography changes | 🟢 High | Reliable across all models |
| Detect layout shifts/overlaps | 🟢 High | Very strong — this is their sweet spot |
| Detect subtle spacing changes (1-3px) | 🟡 Medium | Need to send high-res crops, not full page |
| Detect animation regressions | 🔴 Low | Requires multi-frame comparison or video |
| Quantify regression severity | 🟢 High | Natural language output can classify severity |
| Describe what changed in English | 🟢 High | This is uniquely valuable vs pixel-diff tools |

**Recommended Approach:**
Use a **two-layer system**: Fast pixel-level diff (pixelmatch/SSIM) as a gate, then AI vision analysis only on pages that show changes. This controls cost while adding intelligence.

---

# 2. DOM Diffing Approaches

**Beyond text diff — semantic DOM comparison tools and libraries:**

| Library | Stars/Downloads | What It Does | Relevance |
|---------|----------------|--------------|-----------|
| **diff-dom** (fiduswriter) | 54K weekly downloads | Structural DOM diffing — detects insertions, removals, modifications between two DOM trees. Outputs a patch list. | 🔴 **HIGH** — Core library for semantic comparison |
| **@open-wc/semantic-dom-diff** | Active maintenance | Semantic comparison of DOM and Shadow DOM trees. Ignores whitespace, attribute order. Used for web component testing. | 🔴 **HIGH** — Handles Shadow DOM which is critical for modern frameworks |
| **micromorph** (natemoo-re) | 365 stars | Tiny library for diffing DOM nodes. Minimal and fast. | 🟡 Medium — Good for lightweight comparisons |
| **htmlnorm** (vassudanagunta) | Small | Normalizes HTML for testing and semantic diffs. Canonicalizes attribute order, whitespace. | 🟢 Useful — Preprocessing step |
| **diffblazer** | Small | Super fast diffing for HTML and plaintext. | 🟡 Medium |
| **diff-dom-streaming** | Active | DOM diff with streaming HTML reader support. | 🟡 Niche — For SSR/streaming scenarios |

**Key Insight for Our Tool:**

DOM diffing should operate at **three levels**:
1. **Structural diff** (diff-dom): Elements added/removed/moved
2. **Attribute diff**: Class changes, style changes, data attribute changes
3. **Computed style diff**: Actual rendered CSS property values (must be extracted via Playwright `getComputedStyle`)

The combination of DOM structure diff + computed style diff + visual screenshot diff gives a **complete regression signal** that no single approach provides alone.

**Semantic DOM Snapshot Strategy:**
```
1. Serialize DOM to normalized tree (strip dynamic IDs, data attributes)
2. Extract computed styles for key elements (layout, color, typography)
3. Diff trees structurally → identify changed nodes
4. For changed nodes, diff computed styles → identify CSS regressions
5. Cross-reference with visual diff → confirm visual impact
```

---

# 3. Playwright Capabilities

**Playwright is the ideal foundation.** Here's the complete capability matrix:

**Screenshot Comparison (Built-in):**
```typescript
// Basic visual comparison
await expect(page).toHaveScreenshot('baseline.png');

// With configuration
await expect(page).toHaveScreenshot('name.png', {
  maxDiffPixels: 100,        // Allow up to 100 different pixels
  maxDiffPixelRatio: 0.01,   // Or 1% different pixels
  threshold: 0.2,            // Per-pixel color threshold (0-1)
  animations: 'disabled',    // Disable CSS animations
  mask: [page.locator('.ad-banner'), page.locator('.timestamp')], // Mask dynamic content
  fullPage: true,            // Capture full scrollable page
  scale: 'css',              // Consistent scaling
});

// Element-level screenshots
await expect(page.locator('.header')).toHaveScreenshot();
```

**Under the hood:** Uses **pixelmatch** library (6.7K stars, by Mapbox). Anti-aliasing aware. ~150ms for 1920x1080 comparison.

**DOM Snapshot Capabilities:**
```typescript
// Full page HTML
const html = await page.content();

// Specific element HTML
const elementHtml = await page.locator('.component').innerHTML();

// Accessibility tree (structured)
const accessibilityTree = await page.accessibility.snapshot();

// Computed styles extraction
const styles = await page.evaluate(() => {
  const el = document.querySelector('.target');
  return window.getComputedStyle(el);
});
```

**Network Interception:**
```typescript
// Mock API responses for deterministic rendering
await page.route('**/api/**', route => route.fulfill({
  body: JSON.stringify(mockData),
}));

// Block ads, analytics
await page.route('**/*.{png,jpg}', route => route.abort());
await page.route('**/analytics/**', route => route.abort());
```

**Performance Metrics:**
```typescript
// Navigation Timing API
const perfMetrics = await page.evaluate(() => JSON.stringify(performance.timing));

// Core Web Vitals via CDP
const client = await page.context().newCDPSession(page);
await client.send('Performance.enable');
const metrics = await client.send('Performance.getMetrics');

// Layout shifts (CLS)
// Can observe via PerformanceObserver injection
```

**Critical Playwright Features for Our Tool:**
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-browser (Chromium/FF/WebKit) | ✅ Built-in | Cross-browser regression in one run |
| Responsive viewports | ✅ Built-in | `page.setViewportSize({width, height})` |
| Auth state persistence | ✅ Built-in | `storageState` saves/loads cookies+localStorage |
| CSS animation disabling | ✅ Built-in | `animations: 'disabled'` in screenshot options |
| Element masking | ✅ Built-in | Mask dynamic content via locators |
| Parallel execution | ✅ Built-in | Workers for parallel page testing |
| Trace viewer | ✅ Built-in | DOM snapshots + screenshots + network at each step |
| HAR recording | ✅ Built-in | Record and replay network for deterministic tests |
| Docker support | ✅ Official image | `mcr.microsoft.com/playwright:v1.x-jammy` |

---

# 4. AI Code Fix Generation

**How good are LLMs at generating CSS/HTML fixes given a visual diff?**

**Benchmarks and Research:**

| Source | Finding |
|--------|---------|
| **Design2Code** (Stanford, 2025) | GPT-4V generates code that matches original designs 49% of the time by human preference. With iterative refinement, quality improves significantly. |
| **VisRefiner** (Feb 2026) | **Directly relevant.** Uses visual diff between current render and target to iteratively fix code. Shows that feeding the model "here's what it looks like now" + "here's what it should look like" + "here's the diff" produces reliable fixes. Uses reinforcement learning to improve. |
| **Responsive Layout Failure Repair via RAG** (ICSME 2025) | Uses RAG to repair responsive layout failures. LLMs + retrieval of similar past fixes = effective CSS repair. Tested on real-world RLFs. |
| **LayoutDR** (Allegheny College/Sheffield) | Automated repair of responsive web page layouts using search-based approach. Proves CSS layout fixes are automatable. |
| **FrontendBench** (ByteDance, 2025) | Comprehensive benchmark showing LLMs can generate correct frontend code, with GPT-4 and Claude leading. |

**Practical Assessment for CSS/HTML Fix Generation:**

| Fix Type | LLM Capability | Confidence |
|----------|---------------|------------|
| Spacing/margin/padding fixes | 🟢 Excellent | Simple property changes — very reliable |
| Layout fixes (flex/grid) | 🟢 Good | Models understand CSS layout well |
| Responsive breakpoint fixes | 🟡 Good | Needs context of media queries |
| Z-index/stacking fixes | 🟢 Good | Straightforward once identified |
| Font/typography fixes | 🟢 Excellent | Direct property mapping |
| Color/theme fixes | 🟢 Excellent | Trivial for models |
| Complex animation fixes | 🔴 Weak | Keyframe/transition debugging is hard |
| Cross-browser compatibility | 🟡 Medium | Needs specific browser info as context |

**Key Insight — The Fix Generation Pipeline:**
```
1. Visual diff → "Header shifted 20px right on mobile viewport"
2. DOM diff → "Element .nav-header has new margin-left: 20px"  
3. Computed style diff → "margin-left changed from 0px to 20px"
4. Git diff → "In commit abc123, file header.css line 42 changed"
5. Feed ALL context to LLM → "Fix this regression"
6. LLM generates targeted CSS patch
7. Re-render and verify → visual diff = 0 = fix confirmed
```

The **verify-after-fix loop** is the killer feature. Unlike code review where fixes are speculative, we can immediately render the fix and confirm it works visually.

---

# 5. Existing Open-Source Tools

**Comprehensive landscape analysis:**

| Tool | Stars | What It Does | Approach | Limitations |
|------|-------|-------------|----------|-------------|
| **BackstopJS** | ~6.7K | Screenshot comparison across viewports. Configurable scenarios. HTML reports with diffs. | Pixel comparison via Puppeteer/Playwright. Configurable selectors, viewports, scenarios. | No AI — pixel-only. No auto-fix. No cloud storage. |
| **Lost Pixel** | ~1.1K | Visual regression for components + pages. Open-source core + cloud platform. | Screenshot + comparison. Supports Storybook, Ladle, page screenshots. | Pixel comparison only. Cloud platform for review UI. |
| **Argos CI** | Active | CI-native visual testing. PR-based workflow. Centralized baseline governance. | Upload screenshots → cloud comparison → PR status check. | SaaS dependency. No AI analysis. No auto-fix. |
| **reg-suit** | ~1K | Visual regression testing tool that stores snapshots on cloud (S3/GCS). | Compare screenshots, publish reports. Git-hash based baseline management. | Pixel-only. Separate CLI tool, not a testing framework. |
| **jest-image-snapshot** | ~3.9K | Jest matcher for image comparisons. Used with Puppeteer/Playwright. | pixelmatch + ssim.js options. Configurable thresholds. | Library only — no workflow, no CI integration, no AI. |
| **Playwright built-in** | 85K (framework) | `toHaveScreenshot()` with pixelmatch. Built into test runner. | Pixel comparison with configurable thresholds and masking. | No AI layer. No cross-run baseline management. No auto-fix. |
| **Chromatic** | SaaS | Storybook visual testing. Component-level regression detection. | Cloud rendering + comparison. Review UI + PR integration. | SaaS. Component-only (not full pages). $$$ at scale. |
| **Percy (BrowserStack)** | SaaS | Visual testing platform. Cross-browser rendering. | Cloud rendering on multiple browsers + comparison + review. | SaaS. Cost grows linearly with screenshots. |
| **Applitools Eyes** | SaaS | AI-powered visual testing. Visual AI + Ultrafast Grid. | Proprietary deep learning for comparison. Cloud rendering. | SaaS. Most expensive option. Proprietary AI. |

**What NO existing tool does (our opportunity):**
1. ❌ AI-powered semantic understanding of visual changes
2. ❌ Natural language description of regressions
3. ❌ Automated code fix generation
4. ❌ Verify-after-fix loop
5. ❌ Combined DOM + visual + computed style analysis
6. ❌ Regression root-cause analysis (which commit/file/line caused it)

**The gap is enormous.** Existing tools stop at "here's a diff image." They don't explain *what* changed, *why* it matters, or *how* to fix it.

---

# 6. Technical Challenges & Solutions

**6.1 Dynamic Content (Timestamps, Ads, User-Generated Content)**

| Approach | Implementation | Effectiveness |
|----------|---------------|---------------|
| **Playwright masking** | `mask: [page.locator('.timestamp'), page.locator('.ad')]` | 🟢 Built-in, reliable for known elements |
| **Network mocking** | `page.route('**/api/**', route => route.fulfill({body: mockData}))` | 🟢 Deterministic data = deterministic renders |
| **CSS injection** | Hide/freeze dynamic elements via injected stylesheet | 🟡 Fragile if selectors change |
| **HAR replay** | Record network → replay exact responses on test | 🟢 Full determinism, built into Playwright |
| **AI-aware diffing** | Teach the vision model to ignore expected dynamic areas | 🟡 Requires training/prompting, novel approach |
| **Clock freezing** | `page.clock.setFixedTime(new Date('2024-01-01'))` | 🟢 Handles timestamps perfectly |

**Recommended:** Multi-layer approach. HAR replay for API determinism + clock freezing for timestamps + masking for ads/UGC + AI awareness as fallback.

**6.2 Animations**

| Approach | Implementation | Effectiveness |
|----------|---------------|---------------|
| **Disable CSS animations** | `animations: 'disabled'` in Playwright screenshot | 🟢 Built-in, one flag |
| **Disable JS animations** | Inject `* { animation: none !important; transition: none !important; }` | 🟢 Catches CSS-in-JS animations too |
| **Wait for idle** | `page.waitForLoadState('networkidle')` + custom animation-complete wait | 🟡 Doesn't guarantee all animations done |
| **Reduce motion** | `page.emulateMedia({ reducedMotion: 'reduce' })` | 🟢 Respects prefers-reduced-motion |
| **Multi-frame capture** | Take screenshots at intervals, compare sequences | 🔴 Complex, storage-heavy, but thorough |

**Recommended:** `animations: 'disabled'` + CSS injection + reduced motion. Covers 99% of cases.

**6.3 Auth-Gated Pages**

| Approach | Implementation | Effectiveness |
|----------|---------------|---------------|
| **Storage state** | `storageState: 'auth.json'` saves cookies + localStorage | 🟢 First-class Playwright support |
| **Global setup** | Login once in global setup, reuse state across all tests | 🟢 Efficient, recommended by Playwright docs |
| **Service account** | Dedicated test account with stable data | 🟢 Essential for deterministic testing |
| **API auth** | Bypass UI login, set auth tokens directly via API | 🟢 Fastest, most reliable |
| **Session injection** | Inject session cookies directly | 🟢 Fastest setup time |

**Recommended:** API-based auth + storage state persistence. Login once per test suite, not per test.

**6.4 Baseline Management at Scale**

| Challenge | Solution |
|-----------|----------|
| Baselines per branch | Git-based baseline storage. Main branch = source of truth. PRs compare against main's baselines. |
| Multiple viewports × browsers | Naming convention: `{page}-{viewport}-{browser}.png`. Tree structure in storage. |
| Baseline updates | PR workflow: detected change → human approves → baseline auto-updates on merge. |
| Storage growth | Deduplicate identical baselines. Compress with WebP. Keep only N most recent per page. |
| Baseline drift | Periodic full re-baseline from main. Alert if baselines are >30 days old. |
| Multiple environments | Environment-specific baselines (staging vs prod have different data). |

**Storage Estimate:**
- 100 pages × 3 viewports × 1 browser = 300 screenshots
- Average screenshot: 200KB (PNG) or 50KB (WebP)
- Per run: 15MB (WebP) to 60MB (PNG)
- 50 PRs/week: 750MB-3GB/week
- With 4-week retention: 3-12GB baseline storage

**6.5 Cost of Running Playwright in CI for Every PR**

| Resource | Cost | Notes |
|----------|------|-------|
| **GitHub Actions runner** | $0.008/min (Linux) | Standard 2-core runner |
| **Playwright install** | ~60s (cached: ~10s) | Cache browser binaries in CI |
| **100 page screenshots** | ~120-300s | Parallel workers, depends on page complexity |
| **Pixel comparison (100 pages)** | ~2-5s | pixelmatch is extremely fast |
| **AI vision analysis (10 changed pages)** | ~$0.10-0.50 | Only for pages with detected pixel changes |
| **AI fix generation (3 regressions)** | ~$0.05-0.30 | Only for confirmed regressions |
| **Total per PR** | ~$0.50-2.00 | With the gate-then-AI approach |

**At 200 PRs/month:** $100-400/month for the visual regression pipeline. **Very reasonable.**

**Cost Optimization:**
- Only run on PRs that touch CSS/HTML/component files (file-path filter)
- Cache Playwright browsers (saves 60s per run)
- Use pixel-diff as gate → AI only on changes (saves 90%+ on AI costs)
- Parallel workers (Playwright supports sharding)
- Use cheaper models (Gemini Flash) for initial triage, expensive models (Claude) for fix generation

---

# 7. Infrastructure Considerations

**7.1 Running Headless Browsers at Scale**

| Approach | Pros | Cons |
|----------|------|------|
| **CI runner (GitHub Actions)** | Simple, no infra. Built-in caching. | Limited parallelism. Cold starts. |
| **Docker containers** | Reproducible. Official Playwright image. Scalable. | Need orchestration (K8s/ECS). |
| **Playwright Docker image** | `mcr.microsoft.com/playwright:v1.x-jammy` — all browsers pre-installed | ~1.5GB image size |
| **Browserless.io** | Managed headless browser service. API-based. | SaaS dependency. Per-minute pricing. |
| **AWS Lambda + Chromium** | Serverless. Pay-per-execution. | 10GB limit. Cold starts. Only Chromium. |
| **Azure Playwright Testing** | Microsoft's managed service (being migrated to Azure App Testing) | Retiring March 2026. |

**Resource Requirements per Browser Instance:**
- **Memory:** 256-512MB per Chromium instance (headless)
- **CPU:** 0.5-1 core per instance
- **Disk:** ~400MB for Chromium binary, ~200MB for Firefox, ~200MB for WebKit
- **Network:** Varies by page complexity. Mock APIs reduce to near-zero.

**Scaling Strategy:**
```
Small (< 50 pages):     GitHub Actions, 4 parallel workers
Medium (50-500 pages):  Docker on ECS/K8s, 8-16 parallel workers  
Large (500+ pages):     Distributed across multiple nodes, Playwright sharding
```

**7.2 Screenshot Storage**

| Option | Cost | Speed | Durability |
|--------|------|-------|------------|
| **S3/R2/GCS** | $0.023/GB/mo (S3) or free (R2) | Fast | High |
| **Git LFS** | Free (GitHub 1GB) then $5/50GB | Slow | High |
| **Artifact storage** | Free in CI (retention limited) | Fast | Low (expires) |
| **SQLite + filesystem** | Free (self-hosted) | Fast | Medium |

**Recommended:** Cloudflare R2 (free egress, S3-compatible) for screenshot storage. ~$0 for typical usage.

**7.3 Comparison Compute**

| Operation | Time | Resource |
|-----------|------|----------|
| pixelmatch (1920×1080) | ~150ms | CPU-bound, single core |
| SSIM comparison | ~300ms | CPU-bound |
| AI vision comparison | ~2-5s | API call (network-bound) |
| DOM diff (medium page) | ~50ms | CPU-bound |
| AI fix generation | ~5-15s | API call |

**Total pipeline per page:** ~3-20s depending on whether AI is triggered.
**100 pages with 4 workers:** ~75-500s total.

---

# 8. Notable GitHub Repos & Projects

| Project | URL | Relevance |
|---------|-----|-----------|
| **Project Hawkeye** | github.com/subhashbs36/Project-Hawkeye | AI-powered visual verification QA automation |
| **Playwright Visual Regression (Figma)** | github.com/AshfaqSourav/playwright-visual-regression | Fetches Figma designs, compares to live UI, generates HTML diff reports |
| **Verycorder** | github.com/lequan310/Verycorder | AI-powered web recorder for DOM + canvas testing |
| **UI-Venus** | github.com/inclusionAI/UI-Venus | 1.1K stars. Native UI agent for GUI element grounding using screenshots. Multimodal LLM + RL. |
| **TestDriver.ai** | testdriver.ai | AI-powered testing that operates software visually (no selectors) |
| **Awesome-MLLM-for-Code** | github.com/xjywhu/Awesome-Multimodal-LLM-for-Code | Curated list of papers on multimodal LLMs for code generation |
| **pixelmatch** | github.com/mapbox/pixelmatch | 6.7K stars. Core image comparison library used by Playwright |
| **jest-image-snapshot** | github.com/americanexpress/jest-image-snapshot | 3.9K stars. Visual regression testing with Jest |
| **BackstopJS** | github.com/garris/BackstopJS | ~6.7K stars. Visual regression testing framework |
| **Lost Pixel** | github.com/lost-pixel/lost-pixel | ~1.1K stars. Modern visual regression testing |

---

# 9. Architecture Recommendation

Based on all research, here's the recommended architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    CI PIPELINE TRIGGER                    │
│              (PR opened / code pushed)                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              PLAYWRIGHT RENDER ENGINE                     │
│                                                          │
│  • Load pages with HAR replay (deterministic data)      │
│  • Freeze clock, disable animations, mask dynamic       │
│  • Auth via stored session state                        │
│  • Capture: screenshot + DOM snapshot + computed styles  │
│  • Multiple viewports (mobile/tablet/desktop)           │
│  • Performance metrics (CLS, LCP)                       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FAST DIFF GATE (Layer 1)                     │
│                                                          │
│  • pixelmatch: pixel-level comparison (~150ms/image)    │
│  • DOM structural diff via diff-dom                     │
│  • Computed style diff for layout properties            │
│  • Result: PASS (no changes) or CHANGED (proceed)       │
│                                                          │
│  ~90% of pages pass here → no AI cost                   │
└──────────────────────┬──────────────────────────────────┘
                       │ (only changed pages)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              AI ANALYSIS ENGINE (Layer 2)                 │
│                                                          │
│  Input: baseline screenshot + current screenshot        │
│         + pixel diff image + DOM diff + style diff       │
│         + git diff (changed files)                      │
│                                                          │
│  Vision model analyzes:                                  │
│  • What specifically changed visually                   │
│  • Severity (critical/warning/info)                     │
│  • Is this intentional or a regression?                 │
│  • Root cause (which CSS property, which file)          │
│                                                          │
│  Output: Structured regression report                   │
└──────────────────────┬──────────────────────────────────┘
                       │ (only regressions)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              AUTO-FIX ENGINE (Layer 3)                    │
│                                                          │
│  Input: Regression report + source files + DOM context  │
│                                                          │
│  LLM generates:                                         │
│  • CSS/HTML patch to fix regression                     │
│  • Explanation of the fix                               │
│  • Confidence score                                     │
│                                                          │
│  Verify: Re-render with fix applied → visual diff = 0  │
│  If verified → suggest as PR comment or auto-commit     │
└─────────────────────────────────────────────────────────┘
```

**Key Architectural Decisions:**
1. **Gate pattern** — pixel diff first, AI only when needed (controls cost)
2. **Multi-signal regression detection** — visual + DOM + style (reduces false positives)
3. **Verify-after-fix loop** — re-render to confirm fix works (unique differentiator)
4. **HAR replay** — deterministic network for reproducible tests
5. **Git integration** — trace regressions to specific commits/files

---

# 10. Feasibility Verdict

| Dimension | Verdict | Confidence |
|-----------|---------|------------|
| Vision models can detect visual regressions | ✅ Proven | 🟢 High |
| LLMs can generate CSS/HTML fixes | ✅ Proven (with caveats) | 🟡 Medium-High |
| Playwright provides all needed capabilities | ✅ Complete | 🟢 High |
| Can handle dynamic content deterministically | ✅ Multiple approaches | 🟢 High |
| Affordable at scale in CI | ✅ ~$0.50-2.00/PR | 🟢 High |
| End-to-end auto-fix is possible | ✅ For simple regressions | 🟡 Medium |
| No existing tool does this | ✅ Clear market gap | 🟢 High |

**Bottom Line:** This is technically feasible TODAY. The key research (Design2Code, VisRefiner, RAG-based layout repair) proves each component works. No one has combined them into a single product. The architecture above is buildable with existing tools and APIs.

**Highest-risk component:** AI fix generation reliability. Fix rate will likely be ~60-80% for CSS regressions, lower for complex layout issues. The verify-after-fix loop mitigates this — bad fixes are caught automatically.

**Lowest-risk component:** Playwright rendering + screenshot capture. Mature, well-documented, battle-tested.
