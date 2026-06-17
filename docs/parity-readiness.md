# Frontguard parity readiness (T_FINAL)

This is the capstone verification of the `apps/landing` design-parity rebuild. It confirms that every floor capability from `docs/old-product-inventory.md` survives in the new six-route design system, that the frozen plan in `docs/parity-spec.md` is fully executed, and that the build, lint, and test contract is green. All parity work is already merged to `main`; this branch (`ravidsrk/parity-readiness`) adds only this verification document.

Verification was run on 2026-06-17 against the merged `main` tree, on Node 20.20.2 (npm 10.8.2), mirroring CI (`.github/workflows/ci.yml` and `deploy-landing.yml` both pin Node 20 and install via root `npm ci`).

## Verdict

PASS. The build prerenders all 18 pages (6 routes plus 12 docs sub-pages), lint is clean, the full test suite is green with zero skips and zero failures, and all 20 floor capabilities are confirmed present in source and in prerendered output. No real regression or parity gap was found. Residual risks are pre-existing and out of the landing scope; they are listed honestly below.

## Build, lint, test summary (real numbers)

Reproduction: `cd <repo root>`, Node 20.20.2, `npm ci` (root), then the three commands below from root.

| Step                                   | Command                                          | Result | Detail                                                                                   |
| -------------------------------------- | ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| Install                                | `npm ci`                                         | PASS   | 1125 packages, root prepare (husky) hook succeeded on the full workspace install         |
| Build + prerender                      | `npm run build --workspace=apps/landing`         | PASS   | `tsc -b` clean, `vite-react-ssg build` emitted 18 prerendered pages, exit 0              |
| Lint                                   | `npm run lint --workspace=apps/landing`          | PASS   | eslint exit 0, no warnings or errors                                                     |
| Test                                   | `npm test --workspace=apps/landing`              | PASS   | vitest 4.1.9: 14 files passed, 162 tests passed, 0 skipped, 0 failed, 2.31s              |
| Typecheck (part of build)              | `tsc -b` (strict)                                | PASS   | strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch                   |

Coverage: there is no coverage script in `apps/landing/package.json` (`test` is `vitest run`). Baseline is none/new, so there is no coverage to regress. The suite is behavior-first: 162 tests across 14 files exercise every route, the UI kit, GitHub stars fetch states, clipboard fallback, reduced-motion, SEO assets, and the prerender output itself.

Test files (14): `brand`, `changelog`, `comparisons`, `copy-command`, `docs`, `github-stars`, `kit`, `landing`, `logo`, `pricing`, `reduced-motion`, `routes`, `seo-assets`, `ssg-output`.

## Prerender verification (18 pages, each unique and real)

`vite-react-ssg` emitted real crawlable HTML for every route. There is no CSR-only fallback. The empty-shell check (`<div id="root"></div>`) found zero empty shells. All 18 pages carry a unique `<title>` and a unique `<link rel="canonical">` injected into the real `<head>` (the per-route SEO fix, PR #47 / commit f6f8334). Route-unique body markers were confirmed present in each prerendered page.

| Route / page                  | Prerendered file                       | Title                                            | Canonical                                  |
| ----------------------------- | -------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `/`                           | `dist/index.html`                      | Frontguard — Catch the regression, not the noise | https://frontguard.dev                     |
| `/pricing`                    | `dist/pricing/index.html`              | Pricing — Frontguard                             | https://frontguard.dev/pricing             |
| `/comparisons`                | `dist/comparisons/index.html`          | Comparisons — Frontguard vs. everyone else       | https://frontguard.dev/comparisons         |
| `/changelog`                  | `dist/changelog/index.html`            | Changelog — Frontguard                           | https://frontguard.dev/changelog           |
| `/brand`                      | `dist/brand/index.html`                | Brand — The Frontguard brand system              | https://frontguard.dev/brand               |
| `/docs`                       | `dist/docs/index.html`                 | Documentation — Frontguard                       | https://frontguard.dev/docs                |
| `/docs/introduction`          | `dist/docs/introduction/index.html`    | Introduction — Frontguard docs                   | https://frontguard.dev/docs/introduction   |
| `/docs/installation`          | `dist/docs/installation/index.html`    | Installation — Frontguard docs                   | https://frontguard.dev/docs/installation   |
| `/docs/quick-start`           | `dist/docs/quick-start/index.html`     | Quick start — Frontguard docs                    | https://frontguard.dev/docs/quick-start    |
| `/docs/cli`                   | `dist/docs/cli/index.html`             | CLI Commands — Frontguard docs                   | https://frontguard.dev/docs/cli            |
| `/docs/configuration`         | `dist/docs/configuration/index.html`   | Configuration — Frontguard docs                  | https://frontguard.dev/docs/configuration  |
| `/docs/playwright`            | `dist/docs/playwright/index.html`      | Playwright plugin — Frontguard docs              | https://frontguard.dev/docs/playwright     |
| `/docs/github-actions`        | `dist/docs/github-actions/index.html`  | GitHub Actions — Frontguard docs                 | https://frontguard.dev/docs/github-actions |
| `/docs/ai-analysis`           | `dist/docs/ai-analysis/index.html`     | AI Analysis — Frontguard docs                    | https://frontguard.dev/docs/ai-analysis    |
| `/docs/ai-fixes`              | `dist/docs/ai-fixes/index.html`        | AI Fixes — Frontguard docs                       | https://frontguard.dev/docs/ai-fixes       |
| `/docs/custom-plugins`        | `dist/docs/custom-plugins/index.html`  | Custom Plugins — Frontguard docs                 | https://frontguard.dev/docs/custom-plugins |
| `/docs/self-hosting`          | `dist/docs/self-hosting/index.html`    | Self-hosting — Frontguard docs                   | https://frontguard.dev/docs/self-hosting   |
| `/docs/validation`            | `dist/docs/validation/index.html`      | Validation & results — Frontguard docs           | https://frontguard.dev/docs/validation     |

Unique titles: 18 of 18. Unique canonicals: 18 of 18. Homepage carries the static no-JS `#root` mirror plus a `<noscript>` block (floor item 4). SEO assets are copied into `dist/` root: `robots.txt`, `sitemap.xml` (32 `<loc>` entries), `llms.txt`, `llms-full.txt`, `404.html` (reskinned, with heading and home link), and `_redirects` (`/* /index.html 200` SPA fallback).

## Section 7 nothing-lost checklist: all 20 floor capabilities carried

Each floor capability from `docs/parity-spec.md` section 7 is confirmed implemented on `main`, with a source citation. Verdicts come from reading the merged source and the prerendered output.

| #  | Floor capability                                              | Status | Carrying route / file (evidence)                                                                    |
| -- | ------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| 1  | All landing sections render in order with real copy           | DONE   | `routes/landing/index.tsx` (14 sections: Hero, ProblemStrip, Pillars, TwoWaysIn, Pipeline, AiExample, Features, ConfigBlock, ComparisonSummary, Plugins, Honest, Validation, Cta) |
| 2  | Stable anchor IDs + legacy-hash redirect shim                 | DONE   | section files (`#demo`,`#problem`,`#how-it-works`,`#features`,`#compare`,`#install`,`#validation`); `routes/landing/useHashRedirect.ts` maps `#pricing`/`#faq`/`#comparison` to routes; skip target `#main-content` in `RootLayout.tsx` |
| 3  | Hero inline demo (CSS terminal mock, GIF fallback) + `#demo`  | DONE   | `routes/landing/sections/Hero.tsx` (CSS terminal mock, `id="demo"`)                                 |
| 4  | Static SEO `#root` fallback + `<noscript>`                    | DONE   | `index.html` static mirror + `<noscript>`; per-route crawlable HTML via `vite-react-ssg`            |
| 5  | Smooth-scroll in-page nav                                     | DONE   | `index.css` `scroll-behavior: smooth`; Nav/Hero/Footer in-page links                                |
| 6  | Nav scroll-state + mobile hamburger (Escape-close, focus)     | DONE   | `components/ui/Nav.tsx` (scroll state, hamburger, Escape handler, focus restore)                    |
| 7  | Live GitHub stars fetch (never fabricate, AbortController)    | DONE   | `components/ui/GitHubStars.tsx` (fetch + AbortController; `★ Star` fallback, no fabricated count)    |
| 8  | QuickStart tabs (keyboard a11y) + clipboard execCommand fallback | DONE | `routes/landing/sections/InstallTabs.tsx` (tablist, arrow/Home/End keys) + `components/ui/CopyCommand.tsx` (clipboard + execCommand) |
| 9  | FAQ accordions (native `<details>`), all 8 questions          | DONE   | `routes/pricing.tsx` FAQS array (8 items) + `components/ui/FaqItem.tsx` (`<details>`/`<summary>`)    |
| 10 | Comparison responsive table to cards                          | DONE   | `routes/comparisons/ComparisonMatrix.tsx` (sticky first col, overflow-x) + landing 5-col summary    |
| 11 | Pricing CTAs to correct hrefs + external-link rel hygiene     | DONE   | `routes/pricing.tsx` (install anchor, signup new-tab, mailto) + `components/ui/Button.tsx` (rel/target) |
| 12 | Scroll-reveal via useInView, degrades under reduced-motion    | DONE   | `hooks/useInView.ts` + `hooks/usePrefersReducedMotion.ts` + `routes/landing/Reveal.tsx`             |
| 13 | ErrorBoundary wrapping the app with a usable fallback         | DONE   | `components/ErrorBoundary.tsx` wired in `layouts/RootLayout.tsx`                                     |
| 14 | A11y: skip link, focus-visible, ARIA, alt text, reduced-motion | DONE  | `RootLayout.tsx` skip link, `index.css` `*:focus-visible` amber + `motion-reduce`; 22 aria-labels in prerendered home |
| 15 | `<head>` title/desc/canonical/theme-color, OG + Twitter, favicons | DONE | `index.html` global head (theme-color `#0d0c0b`, OG/Twitter, favicons/apple-touch) + `components/Seo.tsx` per-route |
| 16 | Both JSON-LD blocks (SoftwareApplication + FAQPage 8 Qs), truthful | DONE | `index.html` SoftwareApplication (offers $0/$29, no fabricated rating) + `routes/pricing.tsx` FAQPage derived from the same 8-item FAQS array |
| 17 | `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `404.html` | DONE | `apps/landing/public/*`, all copied to `dist/` root and verified                                    |
| 18 | Validation numbers wired to harness, never fabricated         | DONE   | `routes/landing/validation-data.ts` (mirrors `validation/results-v0.2.md`, 2026-06-16 run; comment forbids hand-editing) |
| 19 | `npm run build` + `npm run lint` green under strict TS, plus `npm test` | DONE | `package.json` `build: tsc -b && vite-react-ssg build`, `lint: eslint .`; all green this run         |
| 20 | Cloudflare Pages deploy from `apps/landing/dist` (SSG/SPA fallback) | DONE | `vite.config.ts` ssg `dirStyle: nested`, `App.tsx` route table, `public/_redirects` SPA fallback     |

All 20 are carried. Cross-cutting helpers (GitHubStars, ErrorBoundary, useInView, skip link) are owned by t-foundation and consumed by the pages, so they are built once and cannot be dropped per-page.

## Section 3 treatment status: REDESIGN / GAP-FILL / NEW all done

| Item                                            | Treatment         | Status | Where                                                                 |
| ----------------------------------------------- | ----------------- | ------ | --------------------------------------------------------------------- |
| Nav (sticky, links repointed to routes)         | REDESIGN          | DONE   | shared `Nav` on all routes                                            |
| GitHubStars live count                          | GAP-FILL          | DONE   | `Nav` star button + hero/footer, AbortController, never fabricated    |
| Hero + inline demo                              | REDESIGN          | DONE   | `/` Hero, CSS terminal mock, `#demo` retained                         |
| Problem strip                                   | REDESIGN          | DONE   | `/` ProblemStrip (2x2 stat grid)                                      |
| HowItWorks / three pillars                      | REDESIGN          | DONE   | `/` Pillars (01 Detect / 02 Understand / 03 Fix)                      |
| Features grid                                   | REDESIGN+GAP-FILL | DONE   | `/` Features (carries the old 6 plus design extras)                   |
| Comparison (11 rows)                            | REDESIGN+GAP-FILL | DONE   | `/comparisons` full matrix + `/` 5-col summary                        |
| QuickStart / install (3 paths)                  | REDESIGN          | DONE   | `/` TwoWaysIn + InstallTabs, GitHub Action path preserved             |
| Validation (4 stats + repo table)               | GAP-FILL          | DONE   | `/` Validation, harness numbers wired                                 |
| Pricing (3 tiers)                               | REDESIGN          | DONE   | `/pricing` tiers, Pro featured "MOST POPULAR"                         |
| FAQ (8 questions + JSON-LD)                     | REDESIGN+GAP-FILL | DONE   | `/pricing` FAQ (all 8) + FAQPage JSON-LD                              |
| Footer (4 columns)                              | REDESIGN          | DONE   | shared `Footer`, all link columns + dynamic year                     |
| Two ways in / pipeline / AI example / config / plugins / honest / CTA band | NEW | DONE | `/` sections per `Landing.dc.html`                                    |
| Brand page                                      | NEW               | DONE   | `/brand` (5 numbered sections: THE MARK, COLOR, TYPOGRAPHY, VOICE, MESSAGING) |
| Comparisons page                                | NEW (page)        | DONE   | `/comparisons` (hero, alternatives, 7-col matrix, head-to-head, migration, CTA) |
| Changelog page                                  | NEW               | DONE   | `/changelog` (3 releases: Unreleased, 0.2.0, 0.1.0; ADDED/CHANGED/SECURITY/TESTING groups) |
| Docs surface                                    | NEW               | DONE   | `/docs` + 12 `/docs/:page` (three-column shell, sidebar, TOC, pager)  |

## Comparisons 11-row parity (no floor row dropped)

The `/comparisons` matrix renders 15 rows (11 floor capabilities plus 4 design-native rows) across 6 vendor columns (Frontguard, Percy, Chromatic, BackstopJS, Lost Pixel, Argos). Every floor row is present by label or renamed target, verified in `routes/comparisons/data.ts` and asserted per-row in `comparisons.test.tsx`.

| #  | Floor row (old)                  | Built `/comparisons` row     | Disposition |
| -- | -------------------------------- | ---------------------------- | ----------- |
| 1  | Free tier                        | Free tier                    | KEEP        |
| 2  | Paid entry tier                  | Pro entry                    | RENAME      |
| 3  | Snapshot overage                 | Snapshot overage             | GAP-FILL    |
| 4  | AI diff explanation              | AI change classification     | RENAME      |
| 5  | Sandbox-verified fixes           | AI fix verification          | RENAME      |
| 6  | Self-host                        | Self-hostable                | RENAME      |
| 7  | Storybook integration            | Storybook integration        | GAP-FILL    |
| 8  | MCP server for in-IDE agents     | MCP server for in-IDE agents | GAP-FILL    |
| 9  | PR comment with thumbnail triplet| PR comment thumbnail triplet | GAP-FILL    |
| 10 | Cross-OS render normalisation    | Cross-OS render normalisation| GAP-FILL    |
| 11 | Enterprise SSO/SAML              | Enterprise SSO/SAML          | GAP-FILL    |

Design-native rows kept (no floor origin): Open source, CLI-first, Anti-flake rendering, Actively maintained.

## SEO, structured data, crawlability

Per-route `<head>` metadata is unique and correct (the SEO fix that prompted PRs f6f8334 and #47): the prerender check above shows 18 unique titles and 18 unique canonicals, so no page self-canonicalizes to `/`. `sitemap.xml` lists all six primary routes plus the 12 docs sub-pages (and the external docs deep links), `robots.txt` points at the sitemap, and `llms.txt` / `llms-full.txt` enumerate all six routes. JSON-LD is truthful: SoftwareApplication carries only offers ($0 and $29) with no fabricated `aggregateRating`; FAQPage is derived from the same 8-item FAQS array that renders on the page, so structured data and on-page content stay aligned. No lorem, ipsum, TODO, FIXME, placeholder, or dead `href="#"` links were found; the only `example.com` hits are legitimate CLI/Docker documentation examples in `routes/docs/content.tsx`.

## Adjacent apps (classified KEEP, untouched)

Both adjacent apps are intact and were not modified by the parity build. A `git log` name-only scan over the full parity range (PRs #32 to #48) shows zero file changes under `apps/docs/` or `apps/demo/`.

| App         | Identity                                            | Classification        |
| ----------- | --------------------------------------------------- | --------------------- |
| `apps/docs` | `@frontguard/docs`, Next.js + Fumadocs 16.7.9, port 3001 | KEEP / reskin-deferred |
| `apps/demo` | `frontguard-demo`, Next.js 14                       | KEEP / out-of-scope    |

The design's Docs page was built fresh in `apps/landing` at `/docs` (decision 6); `apps/docs` stays live as the deep technical reference, so the floor's external doc deep links keep resolving.

## Residual risks (honest)

None of these is a landing parity regression. They are recorded so nothing is hidden.

1. Monorepo npm audit reports 45 advisories (1 low, 29 moderate, 13 high, 2 critical), almost entirely in transitive dev tooling (vite/vitest/eslint chains). The landing app ships static HTML with no server runtime, so these do not reach production traffic. Worth a follow-up `npm audit fix` sweep, not a launch blocker.

2. Root `prepare: husky` hook fails if you run `npm install` from inside `apps/landing` alone (`husky: command not found`), because workspace devDeps are not installed in that pass. The supported path, which CI uses, is `npm ci` at the repo root; that completes the husky hook cleanly. No code change needed, documented here to save the next person the confusion.

3. Pre-existing `packages/cli` CI items unrelated to landing: the CI bundle-size gate (budget 180KB on `packages/cli/dist/index.js`) and a `packages/cli` test. These belong to the CLI workspace, not `apps/landing`, and are out of scope for this parity build. Flagged, not introduced here.

4. Local Node 26 has a `better-sqlite3` native install issue in `packages/cloud-api`. CI and the landing deploy both pin Node 20, where the install succeeds; this verification was run on Node 20.20.2, so the issue did not arise. Use Node 20 for this repo.

## Merged PRs (the parity program)

Docs and plan:

| PR  | Title                                                        |
| --- | ------------------------------------------------------------ |
| #32 | docs: old-product inventory (apps/landing functional floor)  |
| #33 | docs: new design extraction (6-page design system)           |
| #34 | docs: frozen parity spec (T-MAP) — design to floor build plan |

Build (t-foundation gate, then the parallel route wave, then SEO finalize):

| PR  | Title                                                        |
| --- | ------------------------------------------------------------ |
| #35 | feat(landing): t-foundation — design system, UI kit, router+SSG scaffold, tests |
| #36 | feat(landing): /pricing page — tiers, compare matrix, FAQ    |
| #37 | feat(landing): /changelog page — release timeline            |
| #38 | feat(landing): /brand page — brand system                    |
| #39 | feat(landing): /comparisons page — capability matrix, no row dropped |
| #40 | feat(landing): /docs in-app docs surface                     |
| #46 | feat(landing): / landing page — 14 sections, full floor parity |
| #47 | feat(landing): SEO assets + per-route head metadata (finalize) |

Commits f6f8334 ("emit per-route SEO metadata into the prerendered `<head>`") and 81eaf30 ("add the six routes to SEO assets and reskin 404") landed the SEO fix verified above.
