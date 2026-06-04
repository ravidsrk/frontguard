# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Run-over-run performance regressions** — the perf-budgets plugin can now
  persist each run's metrics (`trackRegressions`) and flag any metric (LCP, CLS,
  TTFB, page weight) that degraded beyond `regressionThreshold` since the last
  run. Regressions surface on `RunResult.perf[].regressions`, inline with the
  visual diff and in a summary table across console/HTML/PR reports.
- **Accessibility-aware AI analysis** — when the accessibility plugin is active,
  axe-core violations for a route × viewport are fused into the AI analysis
  prompt so the model can correlate a visual change with a known a11y issue
  (e.g. a contrast regression that is also a visual change).

## [0.2.0] - 2026-06-03

The "earn trust" release. The core engine is joined by an AI auto-fix moat, a
cloud platform, production monitoring, and a full integration surface.

### Added

- **`frontguard doctor`** — environment diagnostics for sources of
  non-determinism (Node, Playwright/Chromium versions, browser availability,
  config validity, git state)
- **`frontguard monitor`** — live production URL monitoring with `--once`,
  `--watch`/`--interval` daemon polling, `--history` inspection, and webhook alerts
- **Per-route overrides** — `routes` entries may be objects with per-route
  `threshold`, `ignore`, and `viewport`
- **PR thumbnail grid** — PR comments embed before/after/diff thumbnails, backed
  by a 4-backend image-upload layer (Cloudflare R2, AWS S3, GitHub Actions
  artifacts, local) configured via `imageUpload`
- **AI fix generation + sandbox verification** — `generateFixes` produces minimal
  CSS patches; `verifyFixes` applies them in a sandbox (`fixSandbox: 'local' | 'daytona'`),
  re-renders, and re-compares against baseline, marking verified fixes distinctly
- **Fix-pattern database** — `better-sqlite3`-backed store with `accept-fix`,
  `reject-fix`, and `export-patterns` commands; the pipeline reuses patterns
  accepted ≥3 times before calling the AI
- **Accessibility audits** — axe-core plugin running in the same render pass,
  reporting WCAG violations (contrast, alt text, target size, focus, heading
  order) in console, HTML, and PR reports; optional `failOnViolation`
- **Performance budgets + visual correlation** — perf-budgets plugin collects
  LCP/CLS/TTFB/page-weight/requests; budget violations are surfaced on
  `RunResult.perf` and **correlated inline with the visual diff for the same route**
- **Third-party script monitoring** — new plugin inventories `<script src>`
  origins per page and reports third-party origins added/removed since the
  previous run (`RunResult.thirdPartyScripts`)
- **PagerDuty alerts** — cloud monitors deliver to PagerDuty (Events API v2)
  alongside Slack and email, with fingerprint-based deduplication and snooze
- **Cloud platform** (`packages/cloud-api`) — Hono service with run submission,
  status, reports, baseline approval, usage metering; Cloudflare D1 persistence
  and R2 screenshot storage; GitHub OAuth + hashed API keys + rate limiting
- **Production monitoring scheduler** — Cloudflare Workers Cron trigger runs due
  monitors on cadence, retries, prunes history per plan, and meters usage
- **Teams & billing** — multi-tenant teams with roles, invitations, baseline
  approvals, and an activity feed; Stripe billing with per-plan limits/gates
- **Integrations** — real Vercel OAuth app (webhook-driven preview runs), Netlify
  Build Plugin, and GitHub App (signature verification, Check Runs, install flow)
- **Judge mode** — model-as-judge verdicts on a run
- **Docs** — new guides for AI fixes, accessibility, performance budgets,
  third-party scripts, production monitoring, and the cloud API; configuration
  reference extended with per-route overrides and image upload

### Changed

- **Documentation site** migrated from VitePress to Fumadocs (Next.js + MDX)
- **Reporters** (console, HTML, PR, JSON) now render accessibility, performance,
  and third-party-script sections in addition to visual diffs
- Version bumped to **0.2.0**

### Fixed

- **`freezeTime`** now actually freezes the clock during rendering

## [0.1.0] - 2026-01-01

### Added

- **CLI** — `frontguard init` and `frontguard run` commands with proper flow control (no `process.exit()`, return exit codes)
- **Route discovery** — auto-crawl, filesystem detection (Next.js, Nuxt, SvelteKit, Astro, Remix), and manual configuration
- **Multi-browser capture** — Chromium, Firefox, and WebKit via Playwright with configurable viewport height
- **Visual comparison** — pixel-level diffing via pixelmatch with configurable thresholds, standardized 0–100 diff percentage
- **AI analysis** — BYOK support for OpenAI and Anthropic vision models with unified 0–1 confidence scale
- **Smart rendering** — dependency graph for selective page re-rendering with batched `Promise.allSettled` concurrency
- **Git baselines** — orphan branch storage for baseline screenshots with worktree-based implementation
- **GitHub Action** — `frontguard@v1` for CI integration
- **Preview URL detection** — auto-detect Vercel, Netlify, Cloudflare Pages, Railway, and Render
- **PR comments** — automatic diff reports posted to pull requests (broken image placeholders fixed)
- **Multiple viewports** — responsive regression testing at configurable sizes
- **Animation handling** — automatic CSS injection to disable transitions
- **Auth support** — cookie-based and header-based authentication for protected pages
- **Ignore regions** — mask dynamic content via CSS selectors or pixel coordinates
- **Plugin architecture** — 6 lifecycle hooks (`beforeDiscover`, `afterDiscover`, `afterRender`, `afterCompare`, `afterRun`, `onError`) with error isolation and ordering
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

- **395 tests** across 26 test files covering 27 source files
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
