# Frontguard TODOs

All deferred work items from the engineering review, ordered by priority.

---

| # | Priority | Effort | Module | Description |
|---|----------|--------|--------|-------------|
| 1 | 🔴 Critical | Medium | `storage/git-orphan` | **Guard against dirty working tree.** `createOrphanViaWorktree()` runs `git checkout --orphan` + `git rm -rf .` in the main working tree — this destroys uncommitted changes. Add `git status --porcelain` check before orphan creation; abort with error if dirty. (Lines 306–350) |
| 2 | 🔴 Critical | Medium | `storage/git-orphan` | **Fix createOrphanViaWorktree() to actually use a worktree.** Current impl does `git checkout --orphan` in the main repo, not a worktree. Rewrite to: `git worktree add <tmpDir> --detach` → create orphan in tmpDir → `git worktree remove`. The `tmpDir` parameter exists but is unused. (Lines 306–350) |
| 3 | 🔴 Critical | Large | `storage/git-orphan` | **Add comprehensive tests.** Zero test coverage on the most dangerous module (git mutations, file I/O, error recovery). See TEST_PLAN.md Priority 1 §1. |
| 4 | 🔴 Critical | Large | `diff/ai-vision` | **Add comprehensive tests with mocked fetch.** Zero test coverage on external API integration. See TEST_PLAN.md Priority 1 §2. |
| 5 | 🔴 Critical | Large | `report/html` | **Eliminate base64 image embedding.** Current approach creates unbounded HTML files (300MB+ for large runs). Write images as separate PNG files in `outputDir/images/`, reference via relative `<img src>` paths. |
| 6 | 🟡 High | Medium | `storage/git-orphan` | **Replace execSync with async child_process.** All git operations use synchronous `execSync`, blocking the event loop. Replace with `execFile` (async) or `spawn` with promise wrappers. Affects `git()`, `gitBuffer()`, `gitCheck()`. |
| 7 | 🟡 High | Small | `storage/git-orphan` | **Remove dead code in createOrphanViaWorktree().** Lines 328–335: `reflog` variable assigned then unused; immediately falls through to `findDefaultBranch()`. Remove the try/catch block. |
| 8 | 🟡 High | Small | `core/pipeline` | **Make storage injectable.** `GitOrphanStorage` is hardcoded with `process.cwd()` on lines 282 and 473. Accept a `BaselineStorage` via config or parameter to enable testing and alternative backends. |
| 9 | 🟡 High | Medium | `core/pipeline` | **Add parallelism to compare stage.** Lines 292–337 compare screenshots sequentially in a `for` loop. Use batched `Promise.allSettled` (same pattern as render stage) with configurable concurrency. |
| 10 | 🟡 High | Medium | `core/pipeline` | **Add concurrency to AI analysis stage.** Lines 364–393 make AI API calls sequentially. 10 diffs × 10–30s each = minutes of serial waiting. Use `Promise.allSettled` with concurrency limit (e.g., 3). |
| 11 | 🟡 High | Small | `diff/ai-vision` | **Standardize confidence scale.** System prompt (line 26) says 0–100, `AIAnalysis.confidence` type says 0–1. Change prompt to 0–1 or change type to 0–100. Remove normalization code in `parseAIResponse()`. |
| 12 | 🟡 High | Small | `report/github-pr` | **Fix broken image placeholders.** Lines 155–158: image `src` is literal string `"baseline"` — never replaced with URLs. Either upload images to a storage service and insert URLs, or remove image placeholders. |
| 13 | 🟡 High | Medium | `cli/index` | **Remove module-level side effects.** Line 383 calls `program.parseAsync()` at import time. Wrap in a `main()` function exported separately, and call it only from the bin entry. Enables unit testing of `buildConfig`, `createReporter`, `handleFatalError`. |
| 14 | 🟡 High | Small | `cli/index` | **Replace process.exit() with proper flow control.** Lines 76, 112, 238: `process.exit()` in async handlers prevents cleanup (open browsers, worktrees, temp files). Return exit codes and let the top-level handler call `process.exit()` once. |
| 15 | 🟡 High | Medium | `core/pipeline` | **Stream/release screenshot buffers after comparison.** All `ScreenshotResult.buffer` + `DiffResult.baselineImage/currentImage/diffImage` held in memory for the entire run. Release buffers after they're consumed (or after HTML report writes them). |
| 16 | 🟡 High | Large | `discovery/crawler` | **Add unit and integration tests.** Zero coverage. BFS crawl, cycle detection, API filtering, canonicalization — all untested. See TEST_PLAN.md Priority 1 §3. |
| 17 | 🟡 High | Medium | `graph/filter`, `graph/resolver` | **Add unit tests.** Both modules have zero coverage despite complex logic (git diffing, transitive dependency analysis, multi-framework route mapping). See TEST_PLAN.md Priority 2 §4–5. |
| 18 | 🟡 Medium | Small | `diff/ai-vision` | **Downscale images before sending to AI.** Lines 71–73 base64-encode full-resolution PNGs. A 1440px-wide full-page screenshot can be 5MB+. Downscale to ~800px wide before encoding to reduce API costs and latency. |
| 19 | 🟡 Medium | Small | `core/config` | **Fix discover.startUrl schema.** `discoverSchema` (config.ts:24) requires `startUrl` to be a valid URL (`z.string().url()`), but pipeline.ts uses relative paths like `'/'`. Change to `z.string().min(1)` or add URL/path union. |
| 20 | 🟡 Medium | Small | `graph/resolver` | **Fast-check for remote existence before git diff.** `getChangedFiles()` (line 369) always attempts `git diff --name-only origin/main...HEAD` first, which takes 10s to timeout when no remote exists. Add `git remote get-url origin` check first. |
| 21 | 🟡 Medium | Small | `render/playwright` | **Make viewport height configurable.** Line 199 hardcodes `height: 720`. Some pages render differently at different viewport heights (e.g., fold-dependent lazy loading). Accept from config. |
| 22 | 🟡 Medium | Small | `discovery/crawler` | **Cache Playwright lazy import.** Line 175 calls `await import('playwright')` without caching. If `discoverRoutes` is called multiple times, the module is re-resolved. Store in module-level variable. |
| 23 | 🟡 Medium | Medium | `utils/preview-url` | **Add tests.** Zero coverage for platform detection and URL polling. See TEST_PLAN.md Priority 2 §7. |
| 24 | 🟡 Medium | Medium | `report/*` | **Add tests for all reporters.** Console, JSON, HTML, and GitHub PR reporters have zero test coverage. See TEST_PLAN.md Priority 3 §10. |
| 25 | 🟡 Medium | Small | `utils/logger` | **Add tests.** Zero coverage for log level gating, message formatting, and redaction integration. See TEST_PLAN.md Priority 3 §11. |
| 26 | 🟡 Medium | Small | `discovery/filesystem` | **Expand test coverage.** Existing tests cover Next.js only. Missing: Remix, SvelteKit, Nuxt detection and route extraction. See TEST_PLAN.md Priority 3 §12. |
| 27 | 🟢 Low | Small | `diff/pixel` | **Standardize diff percentage representation.** `diffPercentage` is 0–100 in `DiffResult` but `threshold` is 0–1 in config. Pipeline converts on line 312. Unify to one scale project-wide. |
| 28 | 🟢 Low | Small | `core/pipeline` | **Deduplicate route discovery logic.** `runPipeline()` (lines 137–183) and `updateBaselines()` (lines 448–463) duplicate the same route discovery cascade. Extract to a shared `discoverOrFallback()` function. |
| 29 | 🟢 Low | Small | `render/playwright` | **Cache browser launches across calls.** `renderPages()` launches and closes browsers each time. If called multiple times (e.g., update-baselines + run), browsers are launched twice. Consider a browser pool. |
| 30 | 🟢 Low | Small | `report/html` | **Add XSS protection for route paths.** `escapeHtml()` exists but is not applied consistently to all user-controlled content in the HTML template (e.g., config values in footer). |
| 31 | 🟢 Low | Small | `core/config` | **Test `loadConfig()` and `generateDefaultConfig()`.** Existing tests cover schema validation but not the file-loading or config-generation paths. |

---

**Summary:**
- 🔴 Critical: 5 items (git safety, tests for high-risk modules, memory)
- 🟡 High: 12 items (async git, injectable storage, parallelism, CLI testability)
- 🟡 Medium: 9 items (image optimization, schema fix, test coverage gaps)
- 🟢 Low: 5 items (deduplication, caching, minor improvements)
- **Total: 31 items**
