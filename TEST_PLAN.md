# Frontguard Test Plan

All modules needing tests, specific test cases per module, in priority order.

---

# Priority 1 — Critical (Zero tests, complex logic, data-loss risk)

## 1. `storage/git-orphan.ts`

**Why:** Handles filesystem mutations via git. Can destroy user data. Zero tests.

| # | Test Case | Type |
|---|-----------|------|
| 1 | `init()` throws descriptive error when not in a git repo | unit |
| 2 | `init()` creates orphan branch with empty manifest on first run | integration |
| 3 | `init()` is idempotent — second call is a no-op | integration |
| 4 | `init()` handles shallow clones (fetch fails gracefully) | unit |
| 5 | `readBaseline()` returns null when no baseline exists | integration |
| 6 | `readBaseline()` returns correct PNG buffer for stored baseline | integration |
| 7 | `readBaseline()` throws if called before `init()` | unit |
| 8 | `writeBaseline()` stores and round-trips a PNG buffer | integration |
| 9 | `writeBaseline()` creates nested directories for deep route paths | integration |
| 10 | `writeBaseline()` retries once on index.lock conflict | unit (mock execSync) |
| 11 | `writeBaseline()` throws descriptive error on EACCES | unit (mock execSync) |
| 12 | `writeToOrphanBranch()` cleans up worktree even on failure | integration |
| 13 | `readManifest()` returns null when no manifest exists | integration |
| 14 | `writeManifest()` round-trips a BaselineManifest | integration |
| 15 | `hasBaselines()` returns false for empty orphan branch | integration |
| 16 | `hasBaselines()` returns true after writing a baseline | integration |
| 17 | `sanitizeRoutePath()` converts `/` to `_root` | unit |
| 18 | `sanitizeRoutePath()` strips leading/trailing slashes | unit |
| 19 | `sanitizeRoutePath()` replaces unsafe path characters | unit |
| 20 | `createOrphanBranch()` does NOT destroy uncommitted changes | **critical** integration |

**Test infrastructure needed:** Temp git repos with `git init`, helper to create commits.

## 2. `diff/ai-vision.ts`

**Why:** External API integration with retries, JSON parsing, validation. Zero tests.

| # | Test Case | Type |
|---|-----------|------|
| 1 | `analyzeWithAI()` throws when API key env var is missing | unit |
| 2 | `analyzeWithAI()` throws when baseline image is missing | unit |
| 3 | `callOpenAI()` sends correct request structure (mock fetch) | unit |
| 4 | `callAnthropic()` sends correct request structure (mock fetch) | unit |
| 5 | `callOpenAI()` handles 401 with descriptive error | unit |
| 6 | `callOpenAI()` handles 429 with retryable AIAnalysisError | unit |
| 7 | `callOpenAI()` handles 500 with retryable AIAnalysisError | unit |
| 8 | `callOpenAI()` handles timeout (AbortController) | unit |
| 9 | `callAnthropic()` handles empty content response | unit |
| 10 | `parseAIResponse()` parses valid JSON response | unit |
| 11 | `parseAIResponse()` strips markdown code block wrapping | unit |
| 12 | `parseAIResponse()` extracts JSON from mixed text response | unit |
| 13 | `parseAIResponse()` throws on completely invalid JSON | unit |
| 14 | `parseAIResponse()` throws on invalid classification value | unit |
| 15 | `parseAIResponse()` throws on invalid severity value | unit |
| 16 | `parseAIResponse()` normalizes confidence from 0–100 to 0–1 | unit |
| 17 | `parseAIResponse()` defaults confidence to 0.5 on NaN | unit |
| 18 | `parseAIResponse()` clamps confidence to 0–1 range | unit |
| 19 | Retry: succeeds after 429 then 200 | unit (mock fetch) |
| 20 | Retry: does NOT retry on 401 (non-retryable) | unit (mock fetch) |

**Test infrastructure needed:** Mock `fetch` globally, mock `process.env` for API keys.

## 3. `discovery/crawler.ts`

**Why:** Playwright-based crawling with BFS, filtering, canonicalization. Zero tests.

| # | Test Case | Type |
|---|-----------|------|
| 1 | `discoverRoutes()` returns empty when no discover options | unit |
| 2 | `discoverRoutes()` throws on invalid baseUrl | unit |
| 3 | `discoverRoutes()` throws when base URL is unreachable | integration |
| 4 | `discoverRoutes()` discovers links from a simple HTML page | integration |
| 5 | `discoverRoutes()` respects maxDepth limit | integration |
| 6 | `discoverRoutes()` respects maxRoutes limit | integration |
| 7 | `discoverRoutes()` deduplicates URLs via canonicalization | integration |
| 8 | `discoverRoutes()` skips API routes (`/api/*`, `/_next/*`) | unit (`isApiRoute`) |
| 9 | `discoverRoutes()` skips non-page files (`.pdf`, `.jpg`, etc.) | unit (`isNonPageFile`) |
| 10 | `discoverRoutes()` respects user exclude patterns | unit (`isExcluded`) |
| 11 | `canonicalize()` strips query params and hash | unit |
| 12 | `canonicalize()` normalizes trailing slashes | unit |
| 13 | `canonicalize()` handles malformed URLs gracefully | unit |
| 14 | `isExcluded()` handles regex patterns | unit |
| 15 | `isExcluded()` handles glob patterns with `*` | unit |

**Test infrastructure needed:** Local HTTP server (like e2e/pipeline.test.ts pattern).

---

# Priority 2 — High (Zero tests, important for correctness)

## 4. `graph/filter.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | Returns all routes when `smartRender` is false | unit |
| 2 | Returns all routes when no routes provided | unit |
| 3 | Returns all routes when `getChangedFiles()` throws | unit (mock resolver) |
| 4 | Returns all routes when `getChangedFiles()` returns empty | unit (mock resolver) |
| 5 | Returns all routes when `mapRoutesToFiles()` finds no entry files | unit (mock resolver) |
| 6 | Returns all routes when `buildDependencyGraph()` throws | unit (mock parser) |
| 7 | Correctly filters to affected routes only | integration |
| 8 | Returns all routes on 0 affected (safety fallback) | unit (mock resolver) |
| 9 | Includes reason string explaining filtering decision | unit |

## 5. `graph/resolver.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | `detectFramework()` detects Next.js App Router | unit |
| 2 | `detectFramework()` detects Next.js Pages Router | unit |
| 3 | `detectFramework()` detects Remix | unit |
| 4 | `detectFramework()` detects SvelteKit | unit |
| 5 | `detectFramework()` returns `['generic']` for unknown projects | unit |
| 6 | `getRouteCandidates()` generates correct paths for Next.js App Router | unit |
| 7 | `getRouteCandidates()` generates correct paths for Remix flat routes | unit |
| 8 | `mapRoutesToFiles()` returns existing files only | integration |
| 9 | `getChangedFiles()` returns absolute paths of changed files | integration |
| 10 | `getChangedFiles()` falls through strategies when earlier ones return empty | unit (mock execSync) |
| 11 | `isGlobalImpactFile()` matches known config files | unit |
| 12 | `isGlobalImpactFile()` matches `*.config.*` wildcard | unit |
| 13 | `filterAffectedRoutes()` returns all routes on global impact file change | unit |
| 14 | `filterAffectedRoutes()` returns only affected routes via transitive deps | unit |
| 15 | `filterAffectedRoutes()` includes routes with no file mapping (safety fallback) | unit |
| 16 | `buildReverseGraph()` correctly inverts forward edges | unit |
| 17 | `getTransitiveDependents()` handles multi-level chains | unit |

## 6. `cli/index.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | `buildConfig()` applies default config when no config file and `--url` is provided | unit |
| 2 | `buildConfig()` merges CLI `--routes` over config file routes | unit |
| 3 | `buildConfig()` merges CLI `--viewports` with correct parsing | unit |
| 4 | `buildConfig()` merges CLI `--browsers` | unit |
| 5 | `buildConfig()` converts percentage threshold > 1 to fraction | unit |
| 6 | `buildConfig()` throws when no baseUrl is available | unit |
| 7 | `createReporter()` returns JSONReporter for 'json' | unit |
| 8 | `createReporter()` returns ConsoleReporter for 'console' and default | unit |
| 9 | `handleFatalError()` includes actionable hints for ECONNREFUSED | unit |
| 10 | `handleFatalError()` includes hint for missing config | unit |
| 11 | `handleFatalError()` includes hint for missing Playwright browsers | unit |

**Note:** Tests require refactoring CLI to not have module-level side effects.

## 7. `utils/preview-url.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | `detectPreviewUrl()` returns null when no env vars set | unit |
| 2 | `detectPreviewUrl()` detects VERCEL_URL with https prefix | unit |
| 3 | `detectPreviewUrl()` detects NETLIFY DEPLOY_PRIME_URL | unit |
| 4 | `detectPreviewUrl()` detects FRONTGUARD_URL as highest priority | unit |
| 5 | `detectPreviewUrl()` strips trailing slashes | unit |
| 6 | `waitForUrl()` returns true on 200 response | unit (mock fetch) |
| 7 | `waitForUrl()` retries on connection error | unit (mock fetch) |
| 8 | `waitForUrl()` returns false after max attempts | unit (mock fetch) |

---

# Priority 3 — Medium (Would improve confidence)

## 8. `render/playwright.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | `renderPages()` returns empty array for empty task list | unit |
| 2 | `renderPages()` produces error result when browser fails to launch | unit (mock playwright) |
| 3 | `renderPages()` captures console errors from pages | integration |
| 4 | `renderPages()` applies ignore rules (hides elements) | integration |
| 5 | `renderPages()` applies maxHeight cropping | integration |
| 6 | `cropToMaxHeight()` returns original buffer when image is shorter | unit |
| 7 | `cropToMaxHeight()` crops correctly at exact height | unit |
| 8 | `cropToMaxHeight()` returns original on corrupt PNG (no crash) | unit |

## 9. `core/config.ts` (expand existing)

| # | Test Case | Type |
|---|-----------|------|
| 1 | `loadConfig()` loads JSON config from explicit path | integration |
| 2 | `loadConfig()` auto-discovers `frontguard.config.json` | integration |
| 3 | `loadConfig()` loads from package.json "frontguard" key | integration |
| 4 | `loadConfig()` throws when no config found anywhere | integration |
| 5 | `generateDefaultConfig()` produces valid TS output | unit |
| 6 | `generateDefaultConfig()` produces valid JSON output | unit |
| 7 | `generateDefaultConfig()` includes framework-specific comments | unit |

## 10. Report Modules (`console`, `json`, `html`, `github-pr`)

| # | Test Case | Type |
|---|-----------|------|
| 1 | `ConsoleReporter.onComplete()` prints route table without throwing | unit |
| 2 | `JSONReporter.onComplete()` outputs valid JSON to stdout | unit |
| 3 | `HTMLReporter.generateReport()` returns valid HTML string | unit |
| 4 | `HTMLReporter.writeReport()` creates file in output directory | integration |
| 5 | `GitHubPRReporter.generateComment()` produces valid markdown | unit |
| 6 | `GitHubPRReporter.generateComment()` truncates at MAX_COMMENT_SIZE | unit |
| 7 | `GitHubPRReporter` auto-detects owner/repo from GITHUB_REPOSITORY | unit |
| 8 | `GitHubPRReporter` auto-detects PR number from GITHUB_REF | unit |

## 11. `utils/logger.ts`

| # | Test Case | Type |
|---|-----------|------|
| 1 | `setLogLevel('debug')` enables debug output | unit |
| 2 | `setLogLevel('error')` suppresses info/warn/debug | unit |
| 3 | Logger redacts secrets in output | unit |
| 4 | Logger handles Error objects with stack traces | unit |

## 12. `discovery/filesystem.ts` (expand existing)

| # | Test Case | Type |
|---|-----------|------|
| 1 | Discovers Remix flat routes (`about.tsx` → `/about`) | unit |
| 2 | Discovers SvelteKit routes (`+page.svelte`) | unit |
| 3 | Discovers Nuxt routes (`.vue` files) | unit |
| 4 | Handles nested route groups (Next.js `(marketing)/page.tsx`) | unit |

---

# Test Infrastructure Needs

1. **Git test helper:** Create temp repos with `git init`, commits, branches for `storage/git-orphan` tests
2. **Fetch mock:** Global `fetch` mock for `diff/ai-vision` and `utils/preview-url` tests
3. **CLI test harness:** Refactor `cli/index.ts` to export `buildConfig`, `createReporter`, and `handleFatalError` without module-level side effects (or use child_process to test CLI)
4. **Playwright mock:** Mock Playwright browser for unit tests of `render/playwright.ts` (separate from E2E)

**Total test cases identified: 131**
- Priority 1 (Critical): 55 cases across 3 modules
- Priority 2 (High): 46 cases across 4 modules
- Priority 3 (Medium): 30 cases across 5 modules
