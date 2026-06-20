# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet — open an issue or PR to land the first 0.3 work._

## [0.2.1] - 2026-06-20

Production-close remediation release. npm `v0.2.0` predated remediation PRs
#73–#104; this patch republishes the five public npm packages with every
code-side fix from the adversarial-fresh production-close wave. No breaking
API changes — semver patch.

### Fixed

- **CLI config loader (PR#97)** — `frontguard.config.ts` / `.js` / `.mjs` /
  `.cjs` resolution no longer fails on valid ESM/CJS configs; env opt-outs
  override `telemetry.enabled` in config.
- **MCP server (PR#102)** — realpath-safe entry guard; stderr startup banner
  (stdio JSON-RPC only on stdout); `list_regressions` excludes `status=new`;
  `accept_baseline` requires run-scoped review confirmation; docs corrected
  for `npx -y @frontguard/mcp` init flow.
- **Storybook renderer (PR#96)** — Storybook 8.6 `finished` phase treated as
  ready; parameter discovery and `play()` ready-wait hardened.
- **Supply chain (PR#101)** — migrated to `@daytona/sdk`; cleared
  critical/high `npm audit` findings; added CI audit gate and Dependabot
  config.
- **Slack integration (PR#100)** — defense-in-depth SSRF guard on slash-command
  run URLs.
- **Netlify plugin detection** — reads the real cloud-api result shape
  (`status === 'failed' | 'regression' | 'changed'`), not the non-existent
  `run.results.changed` field.

### Changed

- **Docs & install surfaces (PR#98, PR#99, PR#103)** — bare `npx frontguard`
  replaced with scoped `@frontguard/cli` invocations across live doc surfaces;
  GitHub Action / marketplace doc residuals closed; canonical URLs, README
  links, and regression guards added.
- **Hosted-default mitigations (PR#95)** — removed false `api.frontguard.dev`
  defaults from MCP/Netlify/Slack/CLI; Pro CTA → waitlist `mailto:`; telemetry
  opt-in by default.
- **Marketing claims (PR#104)** — corrected Schema.org structured data and
  README/landing claims (fabricated ratings/stats removed).

### Published packages

- `@frontguard/cli@0.2.1`
- `@frontguard/playwright@0.2.1`
- `@frontguard/mcp@0.2.1`
- `create-frontguard-plugin@0.2.1`
- `@frontguard/netlify-plugin@0.2.1`

## [0.2.0] - 2026-06-17

The "ship it in public" release. Everything around the engine — install path,
AI loop, cloud, four integrations, MCP server, Storybook support, Docker
cross-OS rendering, self-host story, validation harness — is now built to full
depth, tested, and published. Five npm packages went live at 0.2.0
(`@frontguard/cli`, `@frontguard/playwright`, `@frontguard/mcp`,
`@frontguard/netlify-plugin`, `create-frontguard-plugin`). Twenty PRs of
engineering work landed between 2026-06-14 and 2026-06-17 — full punch list
in [`docs/launch-readiness.md`](./docs/launch-readiness.md).

### Added

- **`@frontguard/mcp` — MCP server for in-IDE agents.** New workspace
  published as `@frontguard/mcp`. Four tools (`list_regressions`,
  `get_suggested_fix`, `accept_baseline`, `recent_runs`) over an stdio MCP
  transport. Per-editor `mcp.json` snippets for Claude Code, Cursor, Copilot
  in `apps/docs/content/docs/integrations/mcp.mdx`.
- **Storybook integration** (CLI) — new `storybook: { url, stories?, exclude? }`
  config block enumerates stories from a running Storybook (8.x via
  `/index.json`, 7.x via `/stories.json`) and renders each via
  `/iframe.html?id=<id>&viewMode=story`. The Playwright renderer is now
  `play()`-aware: it polls `window.__STORYBOOK_PREVIEW__.storyRenders` for
  `phase === 'completed'` (or the SB7 `storyRendered` channel event) before
  capturing, so a story's post-interaction state is what ends up in the
  baseline. Per-story overrides flow through `parameters.frontguard.{viewports,
  threshold, ignore, skip}`. `frontguard init` auto-detects
  `.storybook/main.*` and scaffolds a Storybook-aware config (use
  `--no-storybook` to opt out, `--storybook` / `--storybook-url` to force).
  Ships with a runnable Storybook 8 fixture at
  `packages/cli/__fixtures__/storybook/` (two component stories, one with a
  `play()` function) and a 500-line integration doc at
  `apps/docs/content/docs/integrations/storybook.mdx`.
- **Dockerised renderer for cross-OS byte-equivalent baselines** — pinned
  Chromium / Firefox / WebKit image at `packages/cli/docker/` + a
  `--docker` CLI flag + 274-line `apps/docs/content/docs/cross-os-rendering.mdx`.
  Solves the #1 reason teams abandon Playwright's built-in visual testing
  (host-OS rendering drift).
- **Daytona fix-verification snapshot** — `scripts/build-daytona-snapshot.ts`
  publishes the `frontguard-playwright-v1` Daytona snapshot built on the
  Docker image above, and `frontguard-render` is now a real bin shipped with
  `@frontguard/cli` that the sandbox shells to. `verifyFix` falls back to
  the local sandbox transparently when `DAYTONA_API_KEY` is unset.
- **OpenTelemetry export** (cloud-api) — run completions emit OTLP/HTTP metrics
  (`frontguard.runs`, `comparisons`, `regressions`, `warnings`, `run.duration`)
  to a configurable `OTEL_EXPORTER_OTLP_ENDPOINT`. Implemented as plain
  OTLP/HTTP over `fetch` (no `@opentelemetry/*` SDK) so it runs on Cloudflare
  Workers; no-op when unset, best-effort so it never breaks a run.
- **Native Slack app** (`integrations/slack-app`) — OAuth v2 install persists
  per-team bot tokens in Cloudflare Workers KV (no more "real deployment
  persists tokens" stub). `/frontguard status <url>` actually enqueues a run
  against the cloud-api and posts the result in-channel via `response_url`
  when complete. Slack manifest points at `slack.frontguard.dev`.
- **Real GitHub App preview-URL detection** — listens for `commit_status`
  (Vercel) and `deployment_status` (Netlify / Cloudflare Pages) events,
  forwards the actual preview deploy URL to the cloud-api instead of
  `pull_request.html_url`. Bootstrap PR config now imports from
  `@frontguard/cli`. CI examples reference the `@v1`-tagged action.
- **Vercel integration accepts custom-domain previews** — `*.vercel.app` lock
  removed; any preview hostname for a project the user has authorised via
  Vercel OAuth is accepted. SSRF defences (private/loopback/link-local/
  cloud-metadata IPs) are always on. `manifest.yml` ready for Vercel
  Integration Marketplace.
- **Run-over-run performance regressions** — the perf-budgets plugin can now
  persist each run's metrics (`trackRegressions`) and flag any metric (LCP,
  CLS, TTFB, page weight) that degraded beyond `regressionThreshold` since
  the last run. Regressions surface on `RunResult.perf[].regressions`, inline
  with the visual diff and in a summary table across console/HTML/PR reports.
- **Accessibility-aware AI analysis** — when the accessibility plugin is
  active, axe-core violations for a route × viewport are fused into the AI
  analysis prompt so the model can correlate a visual change with a known
  a11y issue.
- **Cloud dashboard polish** — per-monitor history view with sortable/
  filterable timeline; Argos-style flake-score badge (0–100); side-by-side
  baseline / current / diff viewer with pixel-overlay ↔ heatmap toggle and
  `A`/`R`/`I`/`←/→` keyboard shortcuts; bulk-approve gesture; drag-paint
  ignore-region masks; R2-backed trace / DOM / console attachments per
  regression; spend-cap header bar with 80% / 95% Resend alerts (idempotent
  per tier per month).
- **Self-host story** — multi-stage `packages/cloud-api/Dockerfile` +
  `docker-compose.yml` (Miniflare for Workers + SQLite for D1 +
  local-disk for R2); 472-line `apps/docs/content/docs/self-host.mdx`
  covering Fly.io / AWS / GCP / k8s recipes, HTTPS via Traefik, trade-offs
  vs hosted, privacy / data flows.
- **`scripts/release.sh` release orchestrator** — single source of truth for
  the release flow. Idempotent, `--dry-run` safe (no `NPM_TOKEN` required),
  forces scoped packages public after publish (overrides org defaults that
  silently restrict), emits the marketplace submission checklist as part of
  the run. `.github/workflows/release.yml` runs it on `v*` tag push with
  provenance signing in CI.
- **`vs Argos` comparison + Lost Pixel sunset migration** — 495-line
  `apps/docs/content/docs/comparisons/frontguard-vs-argos.mdx` sourced from
  the v0.2 competitive research (no-AI positioning, MIT licence, cost
  comparison at 5K / 35K / 100K snapshots, migration recipe). Lost Pixel
  migration guide rewritten for the 2026-04-22 Figma acqui-hire reality.

### Changed

- **Cloud-api unified.** The deployed `Math.random()` diff shim
  (`app/src/index.js`) is gone. The Hono source-of-truth at
  `packages/cloud-api/src/` is the only entry; Workers env bindings replace
  every `process.env` / `process.on`. `wrangler.toml` declares
  `api.frontguard.dev/*` so the worker binds the moment the domain moves to
  Cloudflare. `/health` sources its version from `package.json` (no more
  hardcoded `0.1.0`). Stripe webhook now refuses all events when
  `STRIPE_WEBHOOK_SECRET` is unset (returns 503) and verifies signatures
  when set — previously any unauthenticated POST could flip any team to
  `business`.
- **Single canonical npm package name everywhere.** `@frontguard/cli` is
  the published CLI; every install snippet (landing, docs, CI templates,
  generated `init` config, GitHub Action, Daytona snapshot builder, Netlify
  plugin README) now references it. Nine+ places previously referenced a
  non-existent bare `frontguard`.
- **Single env-var convention** — `FRONTGUARD_OPENAI_KEY` /
  `FRONTGUARD_ANTHROPIC_KEY`. Doctor and the runtime agree; CI templates
  emit the same. Previously the doctor checked `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` while `ai-vision.ts` read `FRONTGUARD_*_KEY`, so
  "AI configured" and "AI disabled" were both lying half the time.
- **Landing rebuilt** — positioning-led hero with inline live demo GIF,
  Problem / How-it-works / Features / vs Percy & Chromatic & Argos /
  QuickStart (3 tabs, all `@frontguard/cli`) / Validation / Pricing / 8Q FAQ
  / Footer. Stripped every fabricated stat (87%/94% accuracy,
  `aggregateRating`, "2,000 weekly downloads", made-up author bio,
  `@anthropicdev` X handle, `© 2025`).
- **Docs reconciled.** Every "N tests / N source files / N KB bundle"
  number now sources from `scripts/stats.ts` at build time (no more frozen
  numbers in prose). Canonical positioning sentence — "AI-powered frontend
  visual regression testing for web teams — detect, understand, and fix
  visual bugs before they ship to production." — appears verbatim in
  README + docs index + landing hero. Every plugin guide imports from
  `@frontguard/cli/plugins` with real export names.

### Fixed

- **Pipeline bails with one clear error when the base URL is unreachable.**
  Previously discovery would fail with ECONNREFUSED, fall back to `/`, and
  render anyway — producing four stacked ECONNREFUSEDs per run. Now bails
  with one clear `UnreachableBaseUrlError` and exit code 2.
- **Generated `init` config TypeScript-compiles on first build.** The
  generated `frontguard.config.ts` previously imported
  `FrontguardConfig` from a bare `frontguard` package that doesn't exist;
  now imports from `@frontguard/cli`.
- **Netlify plugin actually detects failing runs.** Previously inspected
  `run.results.changed` (a field the cloud-api never returns) so every
  build was marked green. Now reads the real shape
  (`run.results[].status === 'failed' | 'regression' | 'changed'`).
- **Demo GIF rendered.** The README/landing demo GIF is now a clean
  recording showing 7 green doctor checks, real `init` output, and a full
  `run` with AI classification + sandbox-verified fix. Previous GIF was
  unrendered ("the tape exists, the GIF doesn't") and the landing fell
  back to a static terminal mock.

### Validation

- **First real harness run on 2026-06-16** against 5 OSS targets. 2 booted
  end-to-end (tailwind-dashboard, chakra-ui-docs) with 43 recheck routes
  measured: **0 pixel-only false positives → 0.0% FP rate**, well inside
  the `< 15%` launch gate. 3 honest skip reasons documented in
  `validation/results/skip-notes.json`. AI accuracy still gated on an AI
  provider key being present in the run env. Methodology +
  reproduction recipe in [`validation/results-v0.2.md`](./validation/results-v0.2.md).

## [0.2.0-rc] - 2026-06-03

The "earn trust" release-candidate cut. Never published to npm; folded into
the 2026-06-17 `0.2.0` ship above. The work introduced in this draft:

- The core engine joined by an AI auto-fix moat, a cloud platform,
  production monitoring, and a full integration surface.

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
