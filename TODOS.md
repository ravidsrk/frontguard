# Frontguard TODOs

All 31 original engineering review items have been addressed. This document tracks what was completed and identifies future enhancements.

---

# ✅ Completed Items (31/31)

## 🔴 Critical — All Resolved

| # | Module | Description | Commit |
|---|--------|-------------|--------|
| 1 | `storage/git-orphan` | Guard against dirty working tree — `git status --porcelain` check added before orphan creation | `dce1f3d` |
| 2 | `storage/git-orphan` | Fix `createOrphanViaWorktree()` to use actual worktree — rewrote to use `git worktree add/remove` properly | `dce1f3d` |
| 3 | `storage/git-orphan` | Add comprehensive tests — 17 tests covering init, read/write baselines, worktree cleanup, sanitization | `494e703` |
| 4 | `diff/ai-vision` | Add tests with mocked fetch — 31 tests covering API calls, retries, parsing, error handling | `494e703` |
| 5 | `report/html` | Eliminate base64 image embedding — images written as separate PNGs in `outputDir/images/` with relative `<img>` refs | `dce1f3d` |

## 🟡 High — All Resolved

| # | Module | Description | Commit |
|---|--------|-------------|--------|
| 6 | `storage/git-orphan` | Replace `execSync` with async `child_process` — converted to `execFile` with promise wrappers | `dce1f3d` |
| 7 | `storage/git-orphan` | Remove dead code in `createOrphanViaWorktree()` — dead `reflog` try/catch removed | `dce1f3d` |
| 8 | `core/pipeline` | Make storage injectable — `BaselineStorage` accepted via config parameter | `dce1f3d` |
| 9 | `core/pipeline` | Add parallelism to compare stage — batched `Promise.allSettled` with configurable concurrency | `dce1f3d` |
| 10 | `core/pipeline` | Add concurrency to AI analysis stage — `Promise.allSettled` with concurrency limit (3) | `dce1f3d` |
| 11 | `diff/ai-vision` | Standardize confidence scale — unified to 0–1 in both prompt and type | `422d97b` |
| 12 | `report/github-pr` | Fix broken image placeholders — images uploaded or placeholders removed | `dce1f3d` |
| 13 | `cli/index` | Remove module-level side effects — wrapped in `main()` function, `program.parseAsync()` called from bin entry only | `dce1f3d` |
| 14 | `cli/index` | Replace `process.exit()` with proper flow control — return exit codes, single top-level exit | `dce1f3d` |
| 15 | `core/pipeline` | Stream/release screenshot buffers after comparison — buffers released after HTML report writes | `dce1f3d` |
| 16 | `discovery/crawler` | Add tests — 27 tests covering BFS crawl, canonicalization, filtering, depth/route limits | `494e703` |
| 17 | `graph/filter`, `graph/resolver` | Add unit tests — 11 tests each covering filtering, framework detection, dependency analysis | `494e703` |

## 🟡 Medium — All Resolved

| # | Module | Description | Commit |
|---|--------|-------------|--------|
| 18 | `diff/ai-vision` | Downscale images before sending to AI — `downscaleForAI()` resizes to ≤800px wide | `422d97b` |
| 19 | `core/config` | Fix `discover.startUrl` schema — changed to `z.string().min(1)` to accept paths | `dce1f3d` |
| 20 | `graph/resolver` | Fast-check for remote existence — `git remote get-url origin` check before diff | `dce1f3d` |
| 21 | `render/playwright` | Make viewport height configurable — accepted from config | `dce1f3d` |
| 22 | `discovery/crawler` | Cache Playwright lazy import — module-level cache variable | `dce1f3d` |
| 23 | `utils/preview-url` | Add tests — 12 tests covering platform detection and URL polling | `494e703` |
| 24 | `report/*` | Add tests for all reporters — console (15), json (9), html (12), github-pr (12) | `494e703` |
| 25 | `utils/logger` | Add tests — 12 tests for log level gating, formatting, redaction | `494e703` |
| 26 | `discovery/filesystem` | Expand test coverage — Remix, SvelteKit, Nuxt detection added | `494e703` |

## 🟢 Low — All Resolved

| # | Module | Description | Commit |
|---|--------|-------------|--------|
| 27 | `diff/pixel` | Standardize diff percentage — unified to 0–100 project-wide | `dce1f3d` |
| 28 | `core/pipeline` | Deduplicate route discovery — extracted `discoverOrFallback()` shared function | `dce1f3d` |
| 29 | `render/playwright` | Cache browser launches — browser pool reuse across calls | `dce1f3d` |
| 30 | `report/html` | Add XSS protection — `escapeHtml()` applied consistently to all user content | `dce1f3d` |
| 31 | `core/config` | Test `loadConfig()` and `generateDefaultConfig()` — 14 config tests covering load + generation paths | `494e703` |

---

# Future Enhancements

These are forward-looking improvements from PLAN.md Phases 4–5. Not bugs — product evolution.

## Phase 4: Monetization

| Priority | Area | Description |
|----------|------|-------------|
| 🔴 High | Cloud | Managed screenshot infrastructure — no Playwright in user CI |
| 🔴 High | Cloud | Hosted HTML reports with shareable URLs |
| 🟡 Medium | Cloud | Team management, notification preferences, SSO |
| 🟡 Medium | Cloud | Historical trend dashboard |
| 🟡 Medium | Revenue | Tiered pricing (OSS free / Pro $29 / Team $99 / Enterprise custom) |

## Phase 5: Product Expansion

| Priority | Area | Description |
|----------|------|-------------|
| 🔴 High | Figma | Figma integration GA — webhook for auto-comparison on design changes |
| 🔴 High | Monitoring | Production monitoring GA — scheduled cron-style visual checks |
| 🟡 Medium | Figma | Design drift dashboard — how far has code drifted from design |
| 🟡 Medium | Monitoring | Alerting integrations (PagerDuty, OpsGenie, Slack) |
| 🟡 Medium | DX | VS Code extension — live preview of visual changes as you code |
| 🟡 Medium | DX | Inline diff annotations in editor, one-click baseline update |
| 🟢 Low | Integrations | Storybook integration (component-level visual testing) |
| 🟢 Low | Integrations | Playwright component testing integration |
| 🟢 Low | Integrations | React Native / mobile web support |

## Engineering Debt (Low Priority)

| Priority | Area | Description |
|----------|------|-------------|
| 🟡 Medium | `core/pipeline` | Direct unit tests for `pipeline.ts` — currently covered only by E2E tests |
| 🟡 Medium | Plugins | Plugin marketplace / dynamic loading — currently plugins are bundled |
| 🟡 Medium | AI | Multi-model consensus — run 2+ AI providers and compare classifications |
| 🟡 Medium | Performance | Incremental baselines — only re-render pages with changed dependencies |
| 🟢 Low | Report | PDF export — generate PDF reports alongside HTML |
| 🟢 Low | Storage | S3/GCS backend — alternative to git orphan branch for large teams |
| 🟢 Low | CI | GitLab CI / Bitbucket Pipelines templates |

---

**Status:** All 31 original review items complete. 319 tests across 24 test files. 25/26 source files have direct test coverage (only `pipeline.ts` relies on E2E coverage).
