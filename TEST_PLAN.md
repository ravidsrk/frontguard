# Frontguard Test Plan

**Current Status:** 395 tests across 26 test files covering 27 source files.

---

# Test Coverage Map

| Test File | Tests | Source File(s) | Coverage Area |
|-----------|-------|----------------|---------------|
| `test/diff/ai-vision.test.ts` | 31 | `src/diff/ai-vision.ts` | API calls (OpenAI/Anthropic), retries, JSON parsing, confidence normalization, error codes, timeouts |
| `test/discovery/crawler.test.ts` | 27 | `src/discovery/crawler.ts` | BFS crawl, canonicalization, depth/route limits, API filtering, deduplication, exclude patterns |
| `test/render/playwright.test.ts` | 20 | `src/render/playwright.ts` | Screenshot capture, viewport handling, maxHeight crop, ignore rules, console errors, browser failures |
| `test/plugins/perf-budgets.test.ts` | 19 | `src/plugins/perf-budgets.ts` | Bundle size checks, LCP/FID/CLS thresholds, budget violations, reporting |
| `test/storage/git-orphan.test.ts` | 17 | `src/storage/git-orphan.ts` | Init, read/write baselines, worktree cleanup, dirty tree guard, sanitization, manifest ops |
| `test/plugins/figma.test.ts` | 17 | `src/plugins/figma.ts` | Figma API integration, design token extraction, component mapping, sync |
| `test/report/console.test.ts` | 15 | `src/report/console.ts` | Route table formatting, status icons, color output, summary line |
| `test/core/plugins.test.ts` | 15 | `src/core/plugins.ts` | Plugin registration, lifecycle hooks, error isolation, ordering |
| `test/core/config.test.ts` | 14 | `src/core/config.ts` | Schema validation, loadConfig, generateDefaultConfig, CLI merging, threshold conversion |
| `test/utils/redact.test.ts` | 12 | `src/utils/redact.ts` | API key redaction, URL secrets, partial masking, nested objects |
| `test/utils/preview-url.test.ts` | 12 | `src/utils/preview-url.ts` | Vercel/Netlify/Cloudflare detection, URL polling, retries, trailing slash normalization |
| `test/utils/logger.test.ts` | 12 | `src/utils/logger.ts` | Log level gating, message formatting, redaction integration, Error objects |
| `test/report/html.test.ts` | 12 | `src/report/html.ts` | HTML generation, image file output, XSS escaping, output directory creation |
| `test/report/github-pr.test.ts` | 12 | `src/report/github-pr.ts` | Markdown generation, comment truncation, owner/repo detection, PR number parsing |
| `test/plugins/monitor.test.ts` | 11 | `src/plugins/monitor.ts` | Uptime checks, latency tracking, alerting thresholds, history |
| `test/graph/resolver.test.ts` | 11 | `src/graph/resolver.ts` | Framework detection (Next.js/Remix/SvelteKit), route candidates, changed files, global impact |
| `test/graph/filter.test.ts` | 11 | `src/graph/filter.ts` | Smart filtering, fallback behavior, affected route calculation, error recovery |
| `test/graph/parser.test.ts` | 10 | `src/graph/parser.ts` | Import parsing, dependency graph construction, circular dependency handling |
| `test/report/json.test.ts` | 9 | `src/report/json.ts` | JSON output format, schema compliance, stdout writing |
| `test/diff/pixel.test.ts` | 9 | `src/diff/pixel.ts` | Pixel comparison, threshold handling, dimension mismatch, empty buffers, fast path |
| `test/diff/ssim.test.ts` | 13 | `src/diff/ssim.ts` | Structural similarity comparison, perceptual diff, luminance/contrast/structure, noise tolerance |
| `test/utils/retry.test.ts` | 7 | `src/utils/retry.ts` | Exponential backoff, max attempts, retryable error detection, abort |
| `test/discovery/filesystem.test.ts` | 7 | `src/discovery/filesystem.ts` | Next.js/Remix/SvelteKit/Nuxt route extraction, nested groups |
| `test/core/pipeline.test.ts` | 50 | `src/core/pipeline.ts` | Plugin hooks, pipeline stages, discoverOrFallback, buffer release, concurrency, error boundaries |
| `test/e2e/pipeline.test.ts` | 5 | `src/core/pipeline.ts` | Full pipeline integration: discover → render → diff → report |
| `test/cli/index.test.ts` | 4 | `src/cli/index.ts` | Config building, reporter creation, fatal error hints |

**Total: 395 tests across 26 test files**

---

# Coverage by Module

| Module | Source Files | Test Files | Direct Coverage |
|--------|-------------|------------|-----------------|
| `cli/` | 1 | 1 | ✅ |
| `core/` | 4 | 3 | ✅ config, plugins, pipeline (+ E2E) |
| `diff/` | 3 | 3 | ✅ |
| `discovery/` | 2 | 2 | ✅ |
| `graph/` | 3 | 3 | ✅ |
| `plugins/` | 3 (+1 barrel) | 3 | ✅ |
| `render/` | 1 | 1 | ✅ |
| `report/` | 4 | 4 | ✅ |
| `storage/` | 1 | 1 | ✅ |
| `utils/` | 4 | 4 | ✅ |

**27/27 source files** have direct test coverage.

Files without tests that don't need them:
- `src/core/types.ts` — Type definitions only, no runtime logic
- `src/types/pixelmatch.d.ts` — TypeScript declaration file
- `src/plugins/index.ts` — Barrel re-export file

---

# Source File Inventory (27 files)

| # | Source File | Has Tests | Test File |
|---|------------|-----------|-----------|
| 1 | `src/cli/index.ts` | ✅ | `test/cli/index.test.ts` |
| 2 | `src/core/config.ts` | ✅ | `test/core/config.test.ts` |
| 3 | `src/core/pipeline.ts` | ✅ | `test/core/pipeline.test.ts` |
| 4 | `src/core/plugins.ts` | ✅ | `test/core/plugins.test.ts` |
| 5 | `src/core/types.ts` | — | Types only |
| 6 | `src/diff/ai-vision.ts` | ✅ | `test/diff/ai-vision.test.ts` |
| 7 | `src/diff/pixel.ts` | ✅ | `test/diff/pixel.test.ts` |
| 8 | `src/diff/ssim.ts` | ✅ | `test/diff/ssim.test.ts` |
| 9 | `src/discovery/crawler.ts` | ✅ | `test/discovery/crawler.test.ts` |
| 10 | `src/discovery/filesystem.ts` | ✅ | `test/discovery/filesystem.test.ts` |
| 11 | `src/graph/filter.ts` | ✅ | `test/graph/filter.test.ts` |
| 12 | `src/graph/parser.ts` | ✅ | `test/graph/parser.test.ts` |
| 13 | `src/graph/resolver.ts` | ✅ | `test/graph/resolver.test.ts` |
| 14 | `src/plugins/figma.ts` | ✅ | `test/plugins/figma.test.ts` |
| 15 | `src/plugins/index.ts` | — | Barrel export |
| 16 | `src/plugins/monitor.ts` | ✅ | `test/plugins/monitor.test.ts` |
| 17 | `src/plugins/perf-budgets.ts` | ✅ | `test/plugins/perf-budgets.test.ts` |
| 18 | `src/render/playwright.ts` | ✅ | `test/render/playwright.test.ts` |
| 19 | `src/report/console.ts` | ✅ | `test/report/console.test.ts` |
| 20 | `src/report/github-pr.ts` | ✅ | `test/report/github-pr.test.ts` |
| 21 | `src/report/html.ts` | ✅ | `test/report/html.test.ts` |
| 22 | `src/report/json.ts` | ✅ | `test/report/json.test.ts` |
| 23 | `src/storage/git-orphan.ts` | ✅ | `test/storage/git-orphan.test.ts` |
| 24 | `src/utils/logger.ts` | ✅ | `test/utils/logger.test.ts` |
| 25 | `src/utils/preview-url.ts` | ✅ | `test/utils/preview-url.test.ts` |
| 26 | `src/utils/redact.ts` | ✅ | `test/utils/redact.test.ts` |
| 27 | `src/utils/retry.ts` | ✅ | `test/utils/retry.test.ts` |

---

# Remaining Test Gaps

| Priority | Area | Description |
|----------|------|-------------|
| 🟢 Low | `cli/index.ts` | Only 4 tests — could expand to cover more CLI flag combinations and edge cases |
| 🟢 Low | E2E | Only 5 integration tests — could add multi-browser, multi-viewport, error recovery scenarios |

---

# Test Infrastructure

1. **Vitest** — Test runner with TypeScript support
2. **Git test helpers** — Temp repos with `git init` for `storage/git-orphan` tests
3. **Fetch mocking** — Global `fetch` mock for `diff/ai-vision` and `utils/preview-url` tests
4. **Playwright mocking** — Mock browser for `render/playwright.ts` unit tests
5. **Fixture app** — E2E test fixture in `e2e/` directory for pipeline integration tests
6. **Plugin test harness** — Mock pipeline context for plugin lifecycle testing
