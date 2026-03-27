# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-01

### Added

- **CLI** — `frontguard init` and `frontguard run` commands with proper flow control (no `process.exit()`, return exit codes)
- **Route discovery** — auto-crawl, filesystem detection (Next.js, Nuxt, SvelteKit, Astro, Remix), and manual configuration
- **Multi-browser capture** — Chromium, Firefox, and WebKit via Playwright with configurable viewport height
- **Visual comparison** — pixel-level diffing via pixelmatch with configurable thresholds, standardized 0–100 diff percentage
- **AI analysis** — BYOK support for OpenAI and Anthropic vision models with unified 0–1 confidence scale
- **Smart rendering** — dependency graph for selective page re-rendering with batched `Promise.allSettled` concurrency
- **Git baselines** — orphan branch storage for baseline screenshots with worktree-based implementation
- **GitHub Action** — `ravidsrk/frontguard@v1` for CI integration
- **Preview URL detection** — auto-detect Vercel, Netlify, Cloudflare Pages, Railway, and Render
- **PR comments** — automatic diff reports posted to pull requests (broken image placeholders fixed)
- **Multiple viewports** — responsive regression testing at configurable sizes
- **Animation handling** — automatic CSS injection to disable transitions
- **Auth support** — cookie-based and header-based authentication for protected pages
- **Ignore regions** — mask dynamic content via CSS selectors or pixel coordinates
- **Plugin architecture** — 9 lifecycle hooks (`onInit` through `onCleanup`) with error isolation and ordering
- **Figma plugin** — design-to-code comparison with Figma API integration, design token extraction
- **Performance budgets plugin** — bundle size checks, LCP/FID/CLS thresholds, budget violation reporting
- **Monitoring plugin** — production visual monitoring with uptime checks, latency tracking, alerting
- **Validation framework** — synthetic (10 cases) and real-world PR validation scripts for AI accuracy benchmarking
- **Documentation site** — VitePress with 10 pages covering setup, configuration, plugins, and API

### Security

- **Shell injection prevention** — all `execSync`/`execFile` calls use parameterized arguments, no string interpolation
- **Path traversal guards** — route paths and filenames sanitized before filesystem access
- **API key redaction** — `redact()` utility strips keys from logs, URLs, and nested objects (12 tests)
- **XSS protection** — `escapeHtml()` applied consistently to all user content in HTML reports
- **No module-level side effects** — CLI wrapped in `main()` function, `program.parseAsync()` called from bin entry only

### Performance & Memory

- **Injectable storage** — `BaselineStorage` accepted via config parameter for pipeline stage isolation
- **Concurrent comparison** — batched `Promise.allSettled` with configurable concurrency for pixel diff stage
- **Concurrent AI analysis** — `Promise.allSettled` with concurrency limit (3) for AI analysis stage
- **Buffer release** — screenshot buffers released after HTML report writes, not held for pipeline lifetime
- **Browser pool reuse** — cached Playwright browser launches across rendering calls
- **Playwright lazy import** — module-level cache variable for crawler's Playwright import
- **AI image downscaling** — `downscaleForAI()` resizes screenshots to ≤800px wide before API calls

### Testing

- **319 tests** across 24 test files covering 25/26 source files
- **AI vision tests** — 31 tests with mocked fetch for API calls, retries, JSON parsing, error handling
- **Crawler tests** — 27 tests for BFS crawl, canonicalization, depth/route limits, filtering
- **Playwright tests** — 20 tests for screenshot capture, viewport handling, ignore rules
- **Plugin tests** — 62 tests across 3 plugins (perf-budgets 19, figma 17, monitor 11, core 15)
- **Reporter tests** — 48 tests across 4 reporters (console 15, html 12, github-pr 12, json 9)
- **Storage tests** — 17 tests for git-orphan init, read/write, worktree cleanup, sanitization
- **Utility tests** — 43 tests across 4 utils (redact 12, preview-url 12, logger 12, retry 7)
- **E2E pipeline tests** — 5 integration tests for full discover → render → diff → report pipeline

### Fixed

- **Dirty working tree guard** — `git status --porcelain` check before orphan branch creation
- **Worktree implementation** — `createOrphanViaWorktree()` rewritten to use `git worktree add/remove` properly
- **Dead code removal** — dead `reflog` try/catch removed from git-orphan
- **Config schema** — `discover.startUrl` changed to `z.string().min(1)` to accept paths
- **Remote existence check** — `git remote get-url origin` fast-check before diff operations
- **Route deduplication** — extracted `discoverOrFallback()` shared function
- **HTML report images** — eliminated base64 embedding, images written as separate PNGs with relative refs
