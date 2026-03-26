# Frontguard CEO Review — Autoplan Deep Audit

**Project:** Frontguard v0.1.0 — AI-powered frontend visual regression testing  
**Codebase:** 6,874 LoC across 22 TypeScript source files  
**Date:** Auto-generated  
**Methodology:** Full source read of 15 primary modules + all utilities, tests, and package config  
**Autoplan Priorities:** P1=completeness, P2=boil lakes, P3=pragmatic, P5=explicit over clever, P6=bias toward action

---

# Section 1 — Architecture

**ASCII Dependency Graph:**

```
                         ┌──────────────┐
                         │  cli/index   │ 383 LoC
                         │  (Commander) │
                         └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │   core/pipeline.ts    │ 554 LoC
                    │  (6-stage orchestrator)│
                    └───┬──┬──┬──┬──┬──┬───┘
                        │  │  │  │  │  │
           ┌────────────┘  │  │  │  │  └──────────────┐
           ▼               │  │  │  │                  ▼
  ┌─────────────┐          │  │  │  │        ┌──────────────┐
  │ discovery/  │          │  │  │  │        │  report/*    │
  │ crawler.ts  │ 371      │  │  │  │        │ console 265  │
  │ filesystem  │ 388      │  │  │  │        │ github  403  │
  └─────────────┘          │  │  │  │        │ html    512  │
                           │  │  │  │        │ json    132  │
              ┌────────────┘  │  │  │        └──────────────┘
              ▼               │  │  │
     ┌──────────────┐        │  │  │
     │ graph/filter │ 182    │  │  │
     │ graph/parser │ 267    │  │  │
     │ graph/resolve│ 553    │  │  │
     └──────────────┘        │  │  │
                    ┌────────┘  │  └───────┐
                    ▼           ▼          ▼
           ┌────────────┐ ┌──────────┐ ┌──────────────┐
           │  render/   │ │ diff/    │ │ storage/     │
           │ playwright │ │ pixel.ts │ │ git-orphan   │
           │   346 LoC  │ │  221 LoC │ │  520 LoC     │
           └────────────┘ │ ai-vis   │ └──────────────┘
                          │  462 LoC │
                          └──────────┘

  Shared utilities: logger (112), redact (72), retry (92), preview-url (188)
  Types:            core/types (358)
  Config:           core/config (460) — Zod validation
```

**Architecture Assessment:**

| Finding | Severity | Decision |
|---------|----------|----------|
| Clean 6-stage pipeline (discover→filter→render→compare→analyze→report) with error boundaries per stage | 🟢 | P1 — Solid foundational design |
| Unidirectional data flow — no circular dependencies between modules | 🟢 | P1 — Correct layering |
| `BaselineStorage` interface abstraction allows future S3/R2 backends without pipeline changes | 🟢 | P3 — Pragmatic extensibility |
| Reporter interface implemented by 4 reporters (console, json, html, github-pr) — loose coupling | 🟢 | P1 — Good contract design |
| Pipeline mutates `diff.status` and `diff.aiAnalysis` in-place during AI stage (lines 367-381) instead of producing new objects | 🟡 | P5 — Mutation makes debugging harder, should spread |
| `core/types.ts` exports ALL types from one module — correct for library, but 358 lines and growing | 🟢 | P3 — Acceptable at current scale |

---

# Section 2 — Error Handling & Rescue Paths

Every pipeline stage has an explicit error boundary. This is the strongest part of the architecture.

| Stage | Error Strategy | Rescue Path | Severity |
|-------|---------------|-------------|----------|
| **Stage 0: Preview URL** | `waitForUrl()` polls 10× with 15s intervals | Proceeds with warning if URL never responds (line 122) | 🟡 — Could render 100% failures silently |
| **Stage 1: Discover** | try/catch around entire discovery | Falls back to `[{path: '/'}]` root-only (line 182) | 🟢 — Never zero routes |
| **Stage 2: Filter** | try/catch around `smartFilter()` | Falls back to rendering ALL routes (line 224) | 🟢 — Correct safe fallback |
| **Stage 3: Render** | `Promise.allSettled` per batch + per-task error catch | Failed tasks produce empty-buffer ScreenshotResult (line 143) | 🟢 — One page crash never kills run |
| **Stage 4: Compare** | Per-screenshot try/catch inside loop | Failed comparisons produce `status: 'error'` DiffResult (line 332) | 🟢 — Graceful degradation |
| **Stage 5: AI Analyze** | Per-diff try/catch + `retry()` with 3 retries + exponential backoff | Failed AI analysis is logged and skipped — diff keeps pixel-only result (line 389-393) | 🟢 — AI is fully optional |
| **Stage 6: Report** | try/catch around `reporter.onComplete()` | Logged but pipeline still returns result (line 422) | 🟢 — Report failure doesn't lose data |
| **Config Load** | Zod validation with human-readable error paths | Throws with formatted issue list (line 306-312) | 🟢 — Actionable errors |
| **Git Storage Init** | Detects shallow clones, missing repos, missing branches | Auto-creates orphan branch, fetches with depth=1 (line 140-152) | 🟢 — Handles CI edge cases |
| **Browser Launch** | Detects OOM via exit code 137 | Continues — tasks for that engine produce error results (line 112-118) | 🟡 — No auto-reduction of workers |
| **Fatal CLI Error** | `handleFatalError()` with contextual hints | Hints for ECONNREFUSED, missing config, missing Playwright (line 353-365) | 🟢 — Excellent DX |

**Critical Gap:** 🔴 **P2 — Storage init failure in pipeline (line 286-289) logs a warning but then the comparison loop still calls `storage.readBaseline()` which will throw `ensureInitialized()` on every screenshot.** The `try` block at line 283 catches the init error, but the loop at line 292 continues using the same `storage` instance. Since `init()` failed, `this.initialized` is still `false`, and every `readBaseline()` call will throw "GitOrphanStorage not initialized" — which IS caught per-screenshot (line 325), so every diff becomes `status: 'error'`. **Functionally safe but produces confusing N identical error messages instead of one clean "all screenshots treated as new."**

---

# Section 3 — Security

| Finding | Severity | Decision |
|---------|----------|----------|
| **Secret redaction in ALL log output** — `logger.ts` passes every message through `redact()` before `console.error()` (line 48) | 🟢 | P1 — Defense in depth |
| **Config secret detection** — `detectSecrets()` in `config.ts` scans all string values for hardcoded API keys before validation (line 171-195) | 🟢 | P1 — Shift-left security |
| **Redact patterns comprehensive** — Covers OpenAI, Anthropic, GitHub (PAT/server/OAuth/fine-grained), GitLab, AWS, Slack, Stripe, Vercel, xAI, Bearer tokens, generic key=value patterns | 🟢 | P1 — Thorough |
| **AI API keys from env vars only** — `getApiKey()` in `ai-vision.ts` reads `FRONTGUARD_OPENAI_KEY`/`FRONTGUARD_ANTHROPIC_KEY` from `process.env` (line 104-117) | 🟢 | P1 — Correct pattern |
| 🔴 **Crawler `isExcluded()` uses `new RegExp(pattern)` with user-supplied patterns (line 107)** — If a user provides a malicious regex pattern in config `discover.exclude`, this could cause ReDoS (catastrophic backtracking). Config is trusted input so risk is LOW but it's still unbounded regex compilation | 🟡 | P3 — Add regex timeout or use `re2` |
| 🔴 **Git command injection surface** — `git()` helper uses string interpolation `execSync(\`git ${args}\`)` (line 59). The `args` are internally constructed from route paths after `sanitizeRoutePath()` removes `<>:"|?*` but NOT backticks, semicolons, or `$()`. If a route path is `/; rm -rf /`, `sanitizeRoutePath` strips the leading `/` producing `; rm -rf /` which becomes `git show frontguard-baselines:baselines/; rm -rf //1440/chromium.png` | 🔴 | P2 — **Must sanitize or use array-based exec** |
| **GitHub token used in-memory only** — `postComment()` reads `process.env.GITHUB_TOKEN` and passes in header, never written to disk | 🟢 | P1 — Correct |
| **Auth storageState path is user-controlled** — `config.auth.storageState` is passed directly to Playwright `browser.newContext()`. Zod schema only validates it's an optional string, no path traversal check | 🟡 | P3 — Trust boundary is config file |
| **HTML report XSS protection** — `escapeHtml()` in `html.ts` escapes `& < > "` (line 139-145). Missing single-quote escape (`'` → `&#39;`) but all values are in double-quoted attributes | 🟢 | P5 — Adequate for current usage |
| **Raw AI response stored in `AIAnalysis.rawResponse`** — If AI echoes back image content or secrets, this gets embedded in reports | 🟡 | P3 — Should redact rawResponse before storage |

---

# Section 4 — Edge Cases

| Edge Case | Handled? | Location | Severity |
|-----------|----------|----------|----------|
| Zero routes discovered | ✅ Falls back to `['/']` | pipeline.ts:182-188 | 🟢 |
| Empty screenshot buffer (render failure) | ✅ Produces error ScreenshotResult with `Buffer.alloc(0)` | playwright.ts:143-153 | 🟢 |
| Dimension mismatch between baseline and current | ✅ Pads both to max dimensions | pixel.ts:79-94 | 🟢 |
| Byte-identical images (fast path) | ✅ Skips pixelmatch entirely | pixel.ts:40-51 | 🟢 |
| Corrupt PNG buffer | ✅ Returns error DiffResult | pixel.ts:57-73 | 🟢 |
| AI returns non-JSON response | ✅ Strips markdown code blocks, extracts JSON object | ai-vision.ts:341-367 | 🟢 |
| AI returns confidence 0-100 instead of 0-1 | ✅ Auto-normalizes if > 1 | ai-vision.ts:405-408 | 🟢 |
| Shallow git clone in CI | ✅ Fetches branch with depth=1 | git-orphan.ts:140-152 | 🟢 |
| Git repo not initialized | ✅ Clear error message | git-orphan.ts:132-136 | 🟢 |
| Concurrent git writes (index.lock) | ✅ Detects lock, retries once | git-orphan.ts:429-437 | 🟡 — Only 2 attempts |
| Preview URL not ready yet | ✅ Polls up to 150s (10×15s) | preview-url.ts:153-188 | 🟢 |
| GitHub PR comment too large (>65KB) | ✅ Truncates to header+summary | github-pr.ts:263-276 | 🟢 |
| Hash-based routing (SPA) | ⚠️ Partially — `canonicalize()` strips hash by default | crawler.ts:52-68 | 🟡 — No hash-route detection heuristic |
| Route path is `/` (root) | ✅ Mapped to `_root` in storage | git-orphan.ts:30 | 🟢 |
| `config.baseUrl` has trailing slash | ❌ Not normalized — `${config.baseUrl}${task.route.path}` produces `http://localhost:3000//about` | playwright.ts:226 | 🟡 — Double-slash, most servers handle it |
| Workers set to 0 or negative | ✅ Zod enforces `.positive()` | config.ts:104-108 | 🟢 |
| All browsers fail to launch | ✅ All tasks produce error results | playwright.ts:109-118 | 🟢 |
| No git remote configured | ✅ `findDefaultBranch()` handles gracefully | git-orphan.ts:493-498 | 🟢 |
| `discover.startUrl` validation requires full URL | 🔴 `z.string().url()` rejects relative paths like `/` | config.ts:24 | 🟡 — Pipeline code uses `/` as default, but Zod would reject it if passed through config |

---

# Section 5 — Code Quality

| Finding | Severity | Decision |
|---------|----------|----------|
| **Consistent error message formatting** — Every catch block uses `err instanceof Error ? err.message : String(err)` pattern across all 22 files | 🟢 | P5 — Explicit |
| **JSDoc on every exported function** — Module-level `@module` tags, function-level docs with `@param`, `@returns`, `@throws`, `@example` | 🟢 | P1 — Production quality |
| **Section separators** — Consistent `// ----` dividers with section labels in every file | 🟢 | P5 — Readable |
| **Dead code: `createOrphanViaWorktree` is misnamed** — The method (line 306-350) does NOT use worktree; it does `checkout --orphan`, `rm -rf .`, commit, checkout back. The actual worktree logic is in `writeToOrphanBranch` (line 394). The `supportsWorktree()` gate routes to this misnamed method | 🟡 | P5 — Naming confusion |
| **Unused variable in `createOrphanViaWorktree`** — `reflog` result at line 331 is assigned but `originalRef` is immediately overwritten by `findDefaultBranch()` on line 333 | 🟡 | P3 — Dead code |
| **Duplicate threshold logic** — `compareScreenshot()` in pixel.ts (line 130) and pipeline.ts (line 312) BOTH check `diffPercentage > threshold`. The pipeline re-checks and may override pixel.ts's status. This creates ambiguity about which is the source of truth | 🟡 | P5 — Single source of truth needed |
| **`buildResult` warnings filter** — Line 541-543: `d.status === 'changed' && d.diffPercentage > 0` means a dimension-mismatch page with 0% pixel diff but status='changed' is NOT counted as a warning. Correct but non-obvious | 🟢 | P5 — Document intent |
| **Type safety** — `contextOptions` typed as `Record<string, unknown>` (playwright.ts:198, crawler.ts:182) instead of Playwright's proper types | 🟡 | P3 — Loses type safety at boundaries |
| **`config` parameter reassignment** — pipeline.ts:113 does `config = { ...config, baseUrl: previewUrl }` mutating function parameter binding. Config is effectively mutable through the pipeline | 🟡 | P5 — Should be `const effectiveConfig` |
| **No barrel exports** — Library `main` points to `./dist/core/pipeline.js` which only exports `runPipeline` and `updateBaselines`. Types, reporters, and storage are not re-exported | 🟡 | P3 — Library consumers can't access sub-modules cleanly |

---

# Section 6 — Test Coverage

| Module | Test File | Tests Exist | Key Gaps | Severity |
|--------|-----------|-------------|----------|----------|
| `core/config.ts` | `test/core/config.test.ts` | ✅ | Schema validation, defaults, secret detection, framework detection | 🟢 |
| `diff/pixel.ts` | `test/diff/pixel.test.ts` | ✅ | compareScreenshot, dimension mismatch, empty buffers, fast path | 🟢 |
| `utils/redact.ts` | `test/utils/redact.test.ts` | ✅ | All secret patterns, edge cases | 🟢 |
| `utils/retry.ts` | `test/utils/retry.test.ts` | ✅ | Retry mechanics, backoff, isRetryable | 🟢 |
| `graph/parser.ts` | `test/graph/parser.test.ts` | ✅ | Dependency parsing | 🟢 |
| `discovery/filesystem.ts` | `test/discovery/filesystem.test.ts` | ✅ | File-based route discovery | 🟢 |
| `core/pipeline.ts` | `test/e2e/pipeline.test.ts` | ✅ | End-to-end pipeline flow | 🟢 |
| **`diff/ai-vision.ts`** | ❌ None | ❌ | AI provider calls, response parsing, retry logic, error classification | 🔴 — 462 LoC untested |
| **`render/playwright.ts`** | ❌ None | ❌ | Browser launch, batch processing, OOM detection, smart render, cropping | 🔴 — 346 LoC untested |
| **`storage/git-orphan.ts`** | ❌ None | ❌ | Orphan branch creation, worktree writes, concurrent lock handling, shallow clone | 🔴 — 520 LoC untested |
| **`discovery/crawler.ts`** | ❌ None | ❌ | BFS crawl, canonicalization, API route filtering, cycle detection | 🔴 — 371 LoC untested |
| **`report/console.ts`** | ❌ None | ❌ | Progress bars, route tables, summary formatting | 🟡 — Output formatting |
| **`report/github-pr.ts`** | ❌ None | ❌ | Markdown generation, comment truncation, GitHub API integration | 🟡 — 403 LoC |
| **`report/html.ts`** | ❌ None | ❌ | HTML generation, base64 embedding, CSS/JS inline | 🟡 — 512 LoC |
| **`graph/filter.ts`** | ❌ None | ❌ | Smart filter orchestration, fallback logic | 🟡 — Tested indirectly via e2e |
| **`cli/index.ts`** | ❌ None | ❌ | CLI arg parsing, config merging, exit codes | 🟡 — 383 LoC |
| **`utils/preview-url.ts`** | ❌ None | ❌ | Platform detection, URL normalization, polling | 🟡 — 188 LoC |

**Test Files:** 7 test files covering 6 modules + 1 e2e test  
**Source Files:** 22 source files  
**Estimated Coverage:** ~30-35% by line count (tested: ~2,100 LoC of 6,874)  
**Verdict:** 🔴 **P2 — The four most complex and side-effect-heavy modules (git-orphan, playwright, crawler, ai-vision) have ZERO unit tests. These are the modules most likely to break in production.**

---

# Section 7 — Performance

| Finding | Severity | Decision |
|---------|----------|----------|
| **Browser reuse** — All browsers launched once and shared across tasks (playwright.ts:96-119). Avoids O(n) launch overhead | 🟢 | P1 — Correct |
| **Batched parallelism** — `Promise.allSettled` with configurable worker pool (default 4, max 16) | 🟢 | P3 — Good default |
| **Byte-identical fast path** — `Buffer.compare()` before PNG decode in pixel.ts:40 skips pixelmatch entirely | 🟢 | P1 — O(1) best case |
| **Lazy Playwright import** — Crawler does `await import('playwright')` to avoid loading when unused (crawler.ts:175) | 🟢 | P3 — Faster startup for non-crawl runs |
| 🔴 **Sequential AI analysis** — AI calls are made one-at-a-time in a `for` loop (pipeline.ts:364). With 3 images × base64 per call and 60s timeout, 20 diffs = potentially 20 minutes | 🔴 | P2 — **Should batch/parallelize AI calls** |
| 🟡 **Sequential baseline reads** — `storage.readBaseline()` calls are in a `for` loop (pipeline.ts:292). Each does `git show` subprocess. 100 screenshots = 100 `execSync` calls | 🟡 | P3 — Batch with `git show` multi-path or read all at once |
| 🟡 **Git worktree per write** — Each `writeBaseline()` creates a temp worktree, commits, and cleans up (git-orphan.ts:394-467). For `updateBaselines` with 50 screenshots, that's 50 worktree create/destroy cycles | 🟡 | P2 — Should batch writes into a single worktree session |
| **DOM snapshot capture** — `page.content()` on every screenshot (playwright.ts:266). Not currently used downstream by any consumer | 🟡 | P3 — Wasted work unless planned |
| **HTML report base64 encoding** — All images embedded as data URIs (html.ts:147-149). A 50-route run with 3 viewports = 150 screenshots × ~500KB = ~75MB HTML file | 🟡 | P3 — Add threshold to switch to external files |
| **pixelmatch `threshold: 0.1`** hardcoded (pixel.ts:109) — Different from config threshold. This is pixelmatch's per-pixel sensitivity, not the overall diff threshold. Correct but could confuse maintainers | 🟢 | P5 — Add comment |

---

# Section 8 — Observability

| Finding | Severity | Decision |
|---------|----------|----------|
| **Structured logger with levels** — debug/info/warn/error with chalk formatting. All output to stderr (correct for CLI tools) | 🟢 | P1 — Clean |
| **Secret redaction on ALL log output** — Every `logger.*()` call passes through `redact()` | 🟢 | P1 — Security-first logging |
| **Per-stage timing breakdown** — `RunTiming` captures discovery/render/compare/ai/total in milliseconds | 🟢 | P1 — Actionable metrics |
| **Progress reporting** — `reporter.onStageProgress()` with current/total counts for render, compare, analyze stages | 🟢 | P1 — Good UX |
| **Console spinner** — `ora` spinner during each stage with progress bar visualization | 🟢 | P3 — Nice DX |
| ❌ **No structured/JSON logging option** — All logs are human-readable chalk-formatted. No way to pipe to log aggregators in CI | 🟡 | P3 — Add `--log-format json` |
| ❌ **No run ID or trace ID** — Pipeline runs have no unique identifier. Hard to correlate logs across stages in CI | 🟡 | P3 — Add `runId` to RunResult |
| ❌ **No metric emission** — No OpenTelemetry, no StatsD, no custom metrics. Can't track screenshot count, diff %, or AI cost over time | 🟡 | P3 — Not needed for v0.1 |
| ✅ **Debug mode** — `FRONTGUARD_DEBUG=1` or `--debug` flag enables full stack traces | 🟢 | P5 — Explicit |
| ✅ **Console errors captured** — Browser console errors collected per-page in `ScreenshotResult.consoleErrors` | 🟢 | P3 — Useful for debugging render failures |

---

# Section 9 — Deployment & CI

| Finding | Severity | Decision |
|---------|----------|----------|
| **Preview URL auto-detection for 8 platforms** — Vercel, Netlify, Cloudflare Pages, Railway, Render, AWS Amplify, Surge + explicit `FRONTGUARD_URL` | 🟢 | P1 — Excellent CI coverage |
| **GitHub Actions native** — Auto-detects `GITHUB_REPOSITORY`, `GITHUB_REF`, `GITHUB_TOKEN` for PR comments | 🟢 | P1 — Zero-config CI |
| **Shallow clone handling** — Fetches orphan branch with `--depth=1` in CI shallow clones | 🟢 | P1 — Handles GitHub Actions default |
| **Exit codes** — 0=pass, 1=regressions, 2=tool error (cli/index.ts:109-118). CI can gate on these | 🟢 | P1 — Correct semantics |
| **`engines: { "node": ">=18" }`** — Enforces minimum Node version | 🟢 | P3 — Appropriate |
| ❌ **No GitHub Action or reusable workflow** — Users must write their own CI config | 🟡 | P3 — Add `frontguard/action@v1` |
| ❌ **No `--ci` flag** — No way to disable interactive features (spinners, progress bars) automatically | 🟡 | P3 — Should detect `CI=true` env var |
| **`waitForUrl` blocks up to 150s** — In CI, this could cause timeout if deployment is slow | 🟡 | P3 — Make configurable via env var |
| ❌ **No Dockerfile** — Can't run in container-based CI without Playwright install step | 🟡 | P3 — Add Dockerfile with browsers pre-installed |
| **Binary entry point** — `"bin": { "frontguard": "./dist/cli/index.js" }` — correct for npx usage | 🟢 | P1 |

---

# Section 10 — Future-Proofing

| Decision | Reversibility (1-10) | Lock-in Risk | Notes |
|----------|----------------------|--------------|-------|
| **Git orphan branch for baselines** | 8/10 | Low | `BaselineStorage` interface allows swapping to S3/R2. Data is standard PNGs. Migration = copy files |
| **Playwright for rendering** | 6/10 | Medium | Deeply integrated — browser engine map, context creation, page manipulation. Switching to Puppeteer would touch render + discovery |
| **pixelmatch for diffing** | 9/10 | Very Low | Isolated in `diff/pixel.ts`, 221 LoC. Could swap to `looks-same` or SSIM in one file |
| **Zod for config validation** | 8/10 | Low | Contained in `config.ts`. Schema is ~130 lines. Any validator would work |
| **Commander for CLI** | 8/10 | Low | Only in `cli/index.ts`. Could switch to `yargs`, `citty`, etc. |
| **OpenAI/Anthropic for AI** | 7/10 | Low-Medium | Provider abstraction in `ai-vision.ts` with `callOpenAI`/`callAnthropic`. Adding a third provider = one new function + config enum |
| **chalk/ora for output** | 9/10 | Very Low | Cosmetic only. Console reporter is one of 4 reporters |
| **TypeScript ESM** | 5/10 | Medium | `"type": "module"` with `.js` extensions in imports. CJS consumers need wrapper. Hard to reverse |
| **Single-file HTML report** | 7/10 | Low | Self-contained, no external deps. Could add external file mode. Base64 images are the constraint |
| **Reporter interface contract** | 9/10 | Very Low | Clean interface with 5 callbacks. Any new reporter implements it independently |

---

# Section 11 — Design Review

**What's Excellent:**

1. **Error boundary architecture** — Every pipeline stage has a try/catch with a meaningful fallback. This is the single most important quality for a CI tool. You can throw it at any project and it won't crash.

2. **Secret handling** — Triple-layer defense: config-time detection (`detectSecrets`), runtime redaction (`redact()` in logger), and env-var-only API keys. This is better than most production tools.

3. **Discovery cascade** — Config routes → Crawl → Filesystem → Crawl from `/` → Fall back to `['/']`. A user with zero config still gets a useful run.

4. **AI analysis design** — Optional, retried, failure-tolerant, and it can downgrade a regression to a warning if it classifies a change as intentional with ≥80% confidence. This is the killer feature that differentiates from Percy/Chromatic.

5. **CLI DX** — `frontguard init` detects frameworks (Next.js, Remix, Nuxt, SvelteKit, etc.), generates typed config, updates `.gitignore`, and prints next steps. `handleFatalError()` provides contextual hints. Exit codes are semantically correct.

**What Needs Work:**

1. 🔴 **Command injection via route paths in git operations** — `sanitizeRoutePath` strips `<>:"|?*` but not shell metacharacters. Route paths flow from user config or crawled URLs into `git show ${branch}:${path}` via string interpolation into `execSync()`. Must either use `execFileSync` (array args) or a more aggressive sanitizer.

2. 🔴 **Sequential AI calls** — A run with 20 changed pages takes 20 serial API calls with up to 60s timeout each. This could extend a 2-minute CI run to 22 minutes. Needs `Promise.allSettled` with concurrency limit.

3. 🔴 **Test coverage for critical modules** — The four most complex and side-effect-heavy modules (git-orphan, playwright, crawler, ai-vision) have zero tests. These are exactly the modules that break when Node versions change, git versions change, or API contracts change.

4. 🟡 **Git worktree thrashing** — `updateBaselines` with 50 screenshots creates/destroys 50 temporary worktrees. Should batch all writes into a single worktree session.

5. 🟡 **HTML report size** — Base64-embedded images mean the report grows linearly with screenshots. 50 routes × 3 viewports × 500KB ≈ 75MB HTML file. Need a threshold to switch to external image files.

6. 🟡 **`createOrphanViaWorktree` doesn't use worktree** — Despite its name, it uses `checkout --orphan` which modifies the working tree. The actual worktree-based approach is only in `writeToOrphanBranch`. The `supportsWorktree()` gate is misleading — both paths use `checkout --orphan`.

---

# Error Registry

| Error Code | Origin | Message Pattern | User Action | Severity |
|------------|--------|-----------------|-------------|----------|
| `ERR_NO_CONFIG` | config.ts:293 | "No Frontguard config found" | Run `frontguard init` | 🟡 |
| `ERR_INVALID_CONFIG` | config.ts:312 | "Invalid Frontguard config: ..." | Fix config per Zod error messages | 🟡 |
| `ERR_CONFIG_NOT_FOUND` | config.ts:259 | "Config file not found: {path}" | Check --config path | 🟡 |
| `ERR_NO_GIT_REPO` | git-orphan.ts:133 | "frontguard requires a git repository" | Run `git init` | 🔴 |
| `ERR_NO_BASE_URL` | cli/index.ts:314 | "No base URL specified" | Use --url or config | 🟡 |
| `ERR_URL_UNREACHABLE` | crawler.ts:224 | "Cannot reach base URL ..." + suggestions | Start dev server, check port | 🔴 |
| `ERR_ZERO_ROUTES` | crawler.ts:349 | "Zero routes discovered..." + 4 causes | Add routes to config | 🟡 |
| `ERR_AI_NO_KEY` | ai-vision.ts:109 | "No API key found. Set {envVar}" | Set env var | 🟡 |
| `ERR_AI_AUTH` | ai-vision.ts:435 | "Authentication failed for {provider}" | Check API key | 🔴 |
| `ERR_AI_MODEL` | ai-vision.ts:439 | "Model not found on {provider}" | Fix model name in config | 🟡 |
| `ERR_AI_RATE_LIMIT` | ai-vision.ts:441 | "Rate limited by {provider}" | Auto-retried | 🟡 |
| `ERR_AI_PARSE` | ai-vision.ts:362 | "Failed to parse AI response as JSON" | Check model compatibility | 🟡 |
| `ERR_BROWSER_LAUNCH` | playwright.ts:115 | "Failed to launch {engine}" | `npx playwright install` | 🔴 |
| `ERR_OOM` | playwright.ts:286 | "Out-of-memory (OOM) while rendering" | Reduce workers/maxHeight | 🔴 |
| `ERR_GIT_PERMISSION` | git-orphan.ts:441 | "Permission denied writing to git orphan branch" | `chmod -R u+w` | 🔴 |
| `ERR_STORAGE_INIT` | git-orphan.ts:513 | "GitOrphanStorage not initialized" | Internal — call init() first | 🔴 |
| `ERR_GH_403` | github-pr.ts:386 | "GitHub API permission denied (403)" | Check token permissions | 🟡 |
| `ERR_GH_429` | github-pr.ts:396 | "GitHub API rate limit exceeded" | Wait and retry | 🟡 |
| `ERR_PLAYWRIGHT_MISSING` | cli/index.ts:362 | "browserType.launch" (detected in hint) | `npx playwright install` | 🔴 |

---

# Failure Modes

| Mode | Trigger | Impact | Mitigation | Likelihood |
|------|---------|--------|------------|------------|
| **Total render failure** | All browsers fail to launch (missing Playwright install) | Exit code 2, empty report | `handleFatalError` hints | Medium in CI |
| **Silent bad results** | Preview URL detected but serves wrong app (e.g., previous deploy) | False positives/negatives | `waitForUrl` checks HTTP status, but not content | Low |
| **Git branch corruption** | `createOrphanViaWorktree` crashes mid-checkout, can't switch back | Working tree left on orphan branch | `findDefaultBranch()` recovery + error rethrow | Very Low |
| **CI timeout** | 150s URL wait + 20×60s sequential AI calls = 1350s | CI job killed | Make waits configurable | Medium |
| **Memory exhaustion** | 50 routes × 3 viewports × full-page screenshots held in memory | Node OOM | Screenshots are processed per-batch, but all results accumulated | Low |
| **Stale baselines** | Team forgets to update baselines after intentional redesign | Every run shows regressions | AI analysis can downgrade, `update-baselines` command exists | Medium |
| **Report file too large** | 75MB+ HTML file with base64 images | Slow to open, crashes browsers | No current mitigation | Medium |
| **Concurrent CI runs** | Two PRs trigger baseline writes simultaneously | git index.lock contention | 2 retries with 500ms wait | Low-Medium |
| **Orphan branch divergence** | Baseline branch drifts from main (deleted routes accumulate) | Disk/git bloat | No pruning mechanism exists | Medium over time |
| **AI hallucination** | AI classifies regression as intentional → downgraded to warning | Missed regression ships | 80% confidence threshold + pixel diff still shown | Low |

---

# Decision Audit Trail

| # | Decision | Rationale | Alternatives Considered | Risk |
|---|----------|-----------|------------------------|------|
| D1 | Git orphan branch for baselines | Zero-dependency, works in any git repo, no external service | S3 bucket, LFS, separate repo | Lock-in: Low (interface abstraction) |
| D2 | Playwright over Puppeteer | Multi-browser (Chromium, Firefox, WebKit), auth storageState, networkidle wait | Puppeteer (Chromium only), Selenium | Lock-in: Medium (deep integration) |
| D3 | pixelmatch for pixel diff | Fast, pure JS, well-maintained, perceptual comparison | looks-same, SSIM, structural diff | Lock-in: Very Low (isolated module) |
| D4 | BFS crawl for route discovery | Finds all reachable pages, respects depth/count limits | Sitemap parsing, static analysis only, framework-specific | Covers most cases |
| D5 | AI as optional overlay | Non-blocking, retried, degrades to pixel-only | AI as primary diff method, no AI option | Correct — AI is supplementary |
| D6 | Single-file HTML report | No server needed, works offline, email-able | Multi-file with assets, hosted dashboard, PDF | Size grows linearly |
| D7 | Zod for config validation | Type-safe, excellent error messages, default values | Joi, Ajv, manual validation | Standard choice |
| D8 | ESM-only package | Modern, tree-shakable, matches ecosystem direction | Dual CJS/ESM, CJS-only | Excludes older toolchains |
| D9 | process.exit() in CLI | Standard for CLIs, clean exit codes | Throw to caller, let Node exit naturally | Can prevent cleanup in edge cases |
| D10 | execSync for git operations | Simple, synchronous, no library dependency | isomorphic-git, simple-git, child_process.spawn | Blocking I/O in async pipeline |

---

# Completion Summary

| Metric | Value |
|--------|-------|
| **Files Reviewed** | 22 source files + 7 test files + package.json |
| **Total Source LoC** | 6,874 |
| **Total Test LoC** | ~700 (estimated) |
| **Estimated Test Coverage** | 30-35% by LoC |
| **🔴 Critical Findings** | 3 |
| **🟡 Warning Findings** | 18 |
| **🟢 Good Findings** | 42 |
| **Architecture Quality** | Strong — clean pipeline, good interfaces, excellent error boundaries |
| **Security Quality** | Strong — triple-layer secret protection, one command injection gap |
| **DX Quality** | Excellent — framework detection, contextual error hints, progress bars |
| **Production Readiness** | **Not yet** — needs command injection fix, test coverage for critical modules, AI parallelization |

**Top 3 Actions for v0.1.0 Release:**

1. 🔴 **Fix command injection** — Replace `execSync(\`git ${args}\`)` with `execFileSync('git', argsArray)` in git-orphan.ts. **Effort: 2 hours.**
2. 🔴 **Parallelize AI calls** — Replace sequential `for` loop with `Promise.allSettled` + concurrency limit (e.g., p-limit). **Effort: 1 hour.**
3. 🔴 **Add tests for git-orphan, playwright, crawler, ai-vision** — These are the most failure-prone modules. Mock-based unit tests for each. **Effort: 2-3 days.**

---

*Review generated by Autoplan CEO Review — P1=completeness, P3=pragmatic, P5=explicit over clever, P6=bias toward action*
