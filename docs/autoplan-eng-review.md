# Frontguard Engineering Review

Generated from source analysis of `/workspace/frontguard/src/` and `/workspace/frontguard/test/`.

---

# Architecture

```
                              ┌──────────────┐
                              │  cli/index   │
                              │  (commander) │
                              └──────┬───────┘
                                     │
                   ┌─────────────────▼──────────────────┐
                   │          core/pipeline              │
                   │  discover→filter→render→compare→    │
                   │  analyze→report                     │
                   └──┬──┬──┬──┬──┬──┬──┬───────────────┘
                      │  │  │  │  │  │  │
         ┌────────────┘  │  │  │  │  │  └────────────────────┐
         │               │  │  │  │  │                       │
         ▼               ▼  │  ▼  │  ▼                       ▼
  ┌──────────────┐ ┌────────┤ ┌───┤ ┌──────────────┐  ┌───────────┐
  │  discovery/  │ │ graph/ │ │   │ │   diff/       │  │  report/  │
  │  crawler     │ │ filter │ │   │ │  pixel        │  │  console  │
  │  filesystem  │ │ parser │ │   │ │  ai-vision    │  │  json     │
  └──────┬───────┘ │resolver│ │   │ └──────┬────────┘  │  html     │
         │         └────────┘ │   │        │           │  github-pr│
         │                    │   │        │           └───────────┘
         │              ┌─────┘   └─────┐  │
         │              ▼               ▼  │
         │       ┌────────────┐ ┌────────────────┐
         │       │  render/   │ │   storage/     │
         │       │ playwright │ │   git-orphan   │
         │       └────────────┘ └────────────────┘
         │
         └──────────────────┐
                            ▼
                    ┌───────────────┐
                    │    utils/     │
                    │  logger       │
                    │  retry        │
                    │  redact       │
                    │  preview-url  │
                    └───────────────┘

  core/types.ts ← imported by ALL modules (type-only)
  core/config.ts ← imported by cli/index.ts
```

**Module count:** 21 source files, 7 test files, 1 test helper, 3 fixture HTML files.

**Key dependency relationships:**
- `pipeline.ts` imports from 9 modules — it is the central orchestrator
- `cli/index.ts` imports from `core/pipeline`, `core/config`, all reporters, `utils/logger`
- `utils/logger` → `utils/redact` (all log output is redacted)
- `render/playwright.ts` is the only module that imports Playwright
- `discovery/crawler.ts` lazy-imports Playwright at runtime (line 175)

---

# Code Quality

**🔴 Critical Issues**

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 1 | `storage/git-orphan.ts` | 306–350 | `createOrphanViaWorktree()` is misnamed — it does `git checkout --orphan` in the **main working tree**, not a worktree. The `tmpDir` parameter is unused. If this runs while the user has uncommitted changes, `git rm -rf .` will destroy them. |
| 2 | `storage/git-orphan.ts` | 328–335 | Dead code: `reflog` is assigned then immediately falls through to `findDefaultBranch()`. The variable `originalRef` in the outer `createOrphanBranch()` scope (line 281) is also captured but unused by this method. |
| 3 | `core/pipeline.ts` | 282, 473 | `GitOrphanStorage` is instantiated with hardcoded `process.cwd()` — not injectable. Makes unit testing the pipeline impossible without filesystem side effects. Duplicated in both `runPipeline` and `updateBaselines`. |
| 4 | `cli/index.ts` | 383 | `program.parseAsync(process.argv).catch(handleFatalError)` executes at import time — importing this module has side effects. This prevents unit testing the CLI. |
| 5 | `report/html.ts` | 147–150, 182–208 | All images embedded as base64 data URIs. A run with 50 routes × 3 viewports = 150 screenshots at ~2MB each = **300MB HTML file**. No streaming, no external image files. |

**🟡 Moderate Issues**

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 6 | `diff/ai-vision.ts` | 26 vs `core/types.ts` 223 | System prompt asks for confidence 0–100, but `AIAnalysis.confidence` is typed as 0–1. The `parseAIResponse` function (line 400–408) normalizes, but the mismatch invites bugs. |
| 7 | `core/pipeline.ts` | 312 | `diff.diffPercentage > config.threshold * 100` — threshold is 0–1, diffPercentage is 0–100. Math is correct but the dual representation across the codebase is error-prone. Should standardize on one. |
| 8 | `storage/git-orphan.ts` | 57–69, 75–81, 86–97 | All git operations use synchronous `execSync`. Blocks the event loop for every read/write. In large repos, `git show` for binary blobs can take seconds. |
| 9 | `cli/index.ts` | 76, 112, 238 | `process.exit()` calls in async handlers prevent cleanup (open browsers, worktrees). Should propagate exit codes via return/throw. |
| 10 | `graph/resolver.ts` | 369 | `getChangedFiles` always tries `git diff --name-only origin/main...HEAD` first. Fails in repos without `origin/main`, wasting 10s (timeout). No fast check for remote existence. |
| 11 | `render/playwright.ts` | 199 | Viewport height hardcoded to 720px. Not configurable. Could cause layout issues for pages that render differently at different heights. |
| 12 | `discovery/crawler.ts` | 175 | Lazy `import('playwright')` is not cached — if `discoverRoutes` is called multiple times, Playwright module is re-resolved each time. |

**🟢 Low Issues**

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 13 | `core/config.ts` | 24 | `discoverSchema` requires `startUrl` to be a valid URL (`z.string().url()`), but in pipeline.ts line 147, `config.discover.startUrl` is used as a relative path (`'/'`). Schema validation would reject relative paths. |
| 14 | `core/pipeline.ts` | 107 | `DEFAULT_URL_PATTERNS` checks only `startsWith` — doesn't handle `http://localhost:PORT` correctly (e.g., `http://localhost:3000/path` would match). Intentional but could surprise users who set a real localhost URL. |
| 15 | `diff/ai-vision.ts` | 71–73 | Three base64 strings from potentially large PNG buffers held in memory simultaneously (~3x the buffer size due to base64 overhead). No size limit or downscaling. |
| 16 | `report/github-pr.ts` | 157 | Image placeholders are literal strings `![baseline](baseline)` — never replaced with actual URLs. PR comments would show broken images. |

---

# Test Coverage

| Module | Path | Has Unit Test | Has E2E Test | Coverage Notes |
|--------|------|:------------:|:------------:|----------------|
| core/pipeline | `src/core/pipeline.ts` | ❌ | ✅ partial | E2E tests cover render+diff flow but not discovery, filter, AI, or error paths |
| core/types | `src/core/types.ts` | N/A | N/A | Type-only module, no runtime code |
| core/config | `src/core/config.ts` | ✅ | — | Schema validation, detectSecrets, detectFramework tested. `loadConfig` untested. `generateDefaultConfig` untested. |
| storage/git-orphan | `src/storage/git-orphan.ts` | ❌ | ❌ | **Zero tests.** Complex git operations, worktree management, error recovery — all untested. |
| render/playwright | `src/render/playwright.ts` | ❌ | ✅ | E2E tests exercise happy path. No tests for: OOM handling, browser launch failure, animation freezing, ignore rules, maxHeight cropping. |
| diff/pixel | `src/diff/pixel.ts` | ✅ | ✅ | Well tested: identical, different, dimension mismatch, empty buffers, corrupt PNG, threshold, metadata. |
| diff/ai-vision | `src/diff/ai-vision.ts` | ❌ | ❌ | **Zero tests.** API calls, response parsing, error handling, retry logic — all untested. |
| discovery/crawler | `src/discovery/crawler.ts` | ❌ | ❌ | **Zero tests.** BFS crawl, cycle detection, API filtering, canonicalization, auth — all untested. |
| discovery/filesystem | `src/discovery/filesystem.ts` | ✅ | — | Good coverage: Next.js App/Pages, dynamic segments, internal files, src/ variants. Missing: Remix, SvelteKit, Nuxt. |
| graph/filter | `src/graph/filter.ts` | ❌ | ❌ | **Zero tests.** All fallback paths untested. |
| graph/parser | `src/graph/parser.ts` | ✅ | — | ESM, CSS, require, bare specifiers, circular deps, index resolution tested. Dynamic imports untested. |
| graph/resolver | `src/graph/resolver.ts` | ❌ | ❌ | **Zero tests.** Route-to-file mapping, git change detection, transitive analysis — all untested. |
| utils/logger | `src/utils/logger.ts` | ❌ | ❌ | No tests for log levels, formatting, redaction integration. |
| utils/retry | `src/utils/retry.ts` | ✅ | — | Good coverage: success, retry+succeed, exhaustion, non-retryable, createRetrier. |
| utils/redact | `src/utils/redact.ts` | ✅ | — | Good coverage: OpenAI, Anthropic, GitHub, Bearer tokens, multi-secret, edge cases. |
| utils/preview-url | `src/utils/preview-url.ts` | ❌ | ❌ | No tests for platform detection or URL waiting. |
| report/console | `src/report/console.ts` | ❌ | ❌ | No tests. |
| report/json | `src/report/json.ts` | ❌ | ❌ | No tests. |
| report/html | `src/report/html.ts` | ❌ | ❌ | No tests. |
| report/github-pr | `src/report/github-pr.ts` | ❌ | ❌ | No tests. |
| cli/index | `src/cli/index.ts` | ❌ | ❌ | No tests. |

**Summary: 7/21 modules have tests. 14/21 have zero test coverage.**

---

# Performance

**Memory Concerns**

| Location | Issue | Severity |
|----------|-------|----------|
| `pipeline.ts` — `screenshots[]` array | All screenshot buffers (PNG) held in memory simultaneously. 50 routes × 3 viewports × 1440px wide = potentially 750MB+ of PNG buffers. | 🔴 High |
| `report/html.ts` — `bufferToDataUri()` | All images base64-encoded into a single string. Base64 is 33% larger than binary. Final HTML string could exceed 1GB for large runs. | 🔴 High |
| `diff/ai-vision.ts` — `callOpenAI`/`callAnthropic` | Three full-page screenshots (baseline + current + diff) base64-encoded per API call. No downscaling. ~15–30MB per call in request body. | 🟡 Medium |
| `pipeline.ts` — `diffs[]` array | Diffs carry `baselineImage`, `currentImage`, and `diffImage` buffers. Triple storage of every screenshot. | 🟡 Medium |

**Concurrency Concerns**

| Location | Issue | Severity |
|----------|-------|----------|
| `storage/git-orphan.ts` — all `execSync` calls | Synchronous git operations block the Node.js event loop. Every `readBaseline`/`writeBaseline` stalls all other work. | 🔴 High |
| `pipeline.ts:292–337` — compare stage | Screenshots compared sequentially in a `for` loop. No parallelism. Could use `Promise.allSettled` batching like render stage. | 🟡 Medium |
| `pipeline.ts:364–393` — AI analysis stage | AI API calls made sequentially. Each call takes 5–30s. 10 changed diffs = 50–300s of serial waiting. Should batch with concurrency limit. | 🟡 Medium |
| `render/playwright.ts:98–119` — browser launch | Browsers launched sequentially. With 3 engines, this adds 3–9s of sequential startup. | 🟢 Low |

**Latency Concerns**

| Location | Issue | Severity |
|----------|-------|----------|
| `utils/preview-url.ts:157–188` — `waitForUrl` | Default: 10 attempts × 15s interval = **150s max block** before pipeline starts. | 🟡 Medium |
| `graph/resolver.ts:369` — `getChangedFiles` | First strategy (`origin/main...HEAD`) has 10s timeout. Always attempted even when no remote exists. | 🟡 Medium |
| `storage/git-orphan.ts:63` — `git()` helper | 30s timeout per git command. Write operations chain multiple commands (worktree add → write → git add → commit → worktree remove). | 🟢 Low |

---

# Failure Modes

| Module | Failure | has_test | has_handler | silent? |
|--------|---------|:--------:|:-----------:|:-------:|
| `storage/git-orphan` | Not a git repo | ❌ | ✅ throws with instructions | No |
| `storage/git-orphan` | Shallow clone, branch not on remote | ❌ | ✅ catch, create locally | **Yes** — `catch {}` on line 149 swallows error |
| `storage/git-orphan` | `git rm -rf .` during orphan creation destroys uncommitted work | ❌ | ❌ no guard | **Yes** — silent data loss |
| `storage/git-orphan` | Permission denied (EACCES) | ❌ | ✅ descriptive error | No |
| `storage/git-orphan` | Concurrent lock (`index.lock`) | ❌ | ✅ retry once | No |
| `storage/git-orphan` | Worktree cleanup fails | ❌ | ✅ manual rmSync fallback | **Yes** — inner catch swallowed |
| `render/playwright` | Browser fails to launch | ❌ | ✅ continues, tasks error | No |
| `render/playwright` | OOM (exit 137) during render | ❌ | ✅ descriptive error | No |
| `render/playwright` | Page navigation timeout | ✅ e2e | ✅ caught per-task | No |
| `render/playwright` | Browser context creation fails | ❌ | ✅ throw per-task | No |
| `diff/ai-vision` | Missing API key | ❌ | ✅ AIAnalysisError | No |
| `diff/ai-vision` | Rate limited (429) | ❌ | ✅ retry 3× | No |
| `diff/ai-vision` | Malformed JSON response | ❌ | ✅ AIAnalysisError | No |
| `diff/ai-vision` | Timeout (60s) | ❌ | ✅ AbortController | No |
| `diff/ai-vision` | Invalid classification in response | ❌ | ✅ validation error | No |
| `diff/ai-vision` | Missing baseline/current image | ❌ | ✅ early throw | No |
| `core/pipeline` | Discovery fails entirely | ❌ | ✅ fallback to `/` | No |
| `core/pipeline` | Zero routes discovered | ❌ | ✅ fallback to `/` | No |
| `core/pipeline` | Render stage fails entirely | ❌ | ✅ returns empty result | No |
| `core/pipeline` | Storage init fails | ❌ | ✅ warns, treats all as new | No |
| `core/pipeline` | Reporter throws | ❌ | ✅ caught, logged | No |
| `graph/filter` | Git not available | ❌ | ✅ falls back to all routes | No |
| `graph/filter` | Dependency graph build fails | ❌ | ✅ falls back to all routes | No |
| `graph/resolver` | No `origin/main` remote | ❌ | ✅ tries 3 more strategies | **Yes** — silently retries |
| `discovery/crawler` | Base URL unreachable | ❌ | ✅ descriptive error | No |
| `discovery/crawler` | Page throws during crawl | ❌ | ✅ caught per-page | **Yes** — `catch {}` continues |
| `cli/index` | Config file not found | ✅ | ✅ error with instructions | No |
| `cli/index` | Invalid config values | ✅ | ✅ Zod error details | No |
| `report/html` | Cannot write to outputDir | ❌ | ✅ caught, logged | No |
| `report/github-pr` | No GITHUB_TOKEN | ❌ | ✅ descriptive error | No |
| `report/github-pr` | PR number not detected | ❌ | ✅ 0, will fail API call | **Yes** — error swallowed in onComplete |
| `utils/preview-url` | URL never becomes ready | ❌ | ✅ returns false, pipeline continues | No |

**Silent failure count: 6 out of 31 identified failure modes are silently swallowed.**

---

# Completion Summary

| Area | Status | Score |
|------|--------|:-----:|
| **Type Safety** | Strict TS, Zod validation for config, typed interfaces for all data | ✅ Strong |
| **Error Handling** | Pipeline stages have error boundaries; per-page failures don't kill runs | ✅ Strong |
| **Secret Safety** | `redact()` in all log paths, `detectSecrets()` in config, env-var-only API keys | ✅ Strong |
| **Test Coverage** | 7/21 modules tested. Critical modules (git-orphan, ai-vision, crawler) have zero tests | 🔴 Weak |
| **Memory Management** | All screenshots + diffs held in memory. HTML report embeds all as base64. No streaming. | 🔴 Weak |
| **Concurrency** | Render uses batched `Promise.allSettled`. Compare + AI stages are sequential. Git ops block event loop. | 🟡 Moderate |
| **CI Integration** | Preview URL detection, GitHub PR reporter, exit codes. PR reporter has broken image links. | 🟡 Moderate |
| **Documentation** | Every module has JSDoc module docs. Every public function has JSDoc. Types are well-documented. | ✅ Strong |
| **Dependency Management** | 7 runtime deps, all well-known. No unnecessary deps. Lazy Playwright import in crawler. | ✅ Strong |
| **Extensibility** | Reporter/Storage interfaces allow alternative implementations. Config is schema-validated. | ✅ Strong |
| **Git Safety** | `createOrphanViaWorktree` can destroy uncommitted changes. No dirty-tree guard. | 🔴 Critical |
| **CLI Design** | Module-level side effects prevent testability. `process.exit()` in async handlers. | 🟡 Moderate |
