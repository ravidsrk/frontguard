# Frontguard Web Surfaces Inventory (the redesign "floor")

Brutally honest inventory of the EXISTING Frontguard web surfaces, captured from the worktree at `/Users/ravindra/orca/workspaces/frontguard/completion`. This is the floor: every route, page, component, real content value, and build/deploy wire that a redesign must replace without dropping anything.

Two web apps:
- `apps/landing` — React 19 + Vite 8 SPA prerendered to static HTML by `vite-react-ssg` (NOT a plain SPA). Tailwind v4.
- `apps/docs` — Next.js 16 docs site built on Fumadocs 16, static-exported (`output: 'export'`).

Note on the task brief vs reality: the brief described `apps/landing/src/pages/` (Home/Brand/Changelog), a flat `src/components/` with Nav/Hero/etc., and `index.css` + `index-amber.css`. That structure is stale. The real app uses `src/routes/`, a `src/components/ui/` kit, a single `src/index.css` (no `index-amber.css`), and `vite-react-ssg`. The actual structure is documented below.

---

## 1. Landing app (`apps/landing`)

Framework: React 19, Vite 8, `vite-react-ssg@0.9.1-beta.1`, Tailwind v4 (`@tailwindcss/vite`). Self-hosted fonts via `@fontsource` (Space Grotesk + JetBrains Mono). Route table in `src/App.tsx`; SSG entry in `src/main.tsx`. Build prerenders every route to `dist/<route>/index.html` (`ssgOptions.dirStyle: 'nested'`).

### 1.1 Routes

| Route | Source (lazy) | Layout | What it renders | SSG path(s) |
|----------------|---------------------------------|----------------|--------------------------------------------------------------|--------------------------|
| `/` | `src/routes/landing/index.tsx` | MarketingLayout | 13-section home page (Hero…CTA) | `/index.html` |
| `/pricing` | `src/routes/pricing.tsx` | MarketingLayout | Hero, 3 tiers, compare-plans matrix, 8-Q FAQ, CTA + FAQPage JSON-LD | `/pricing/index.html` |
| `/comparisons` | `src/routes/comparisons.tsx` | MarketingLayout | Hero, 15-row × 6-vendor matrix, 4 head-to-head cards, migration, CTA | `/comparisons/index.html`|
| `/changelog` | `src/routes/changelog.tsx` | MarketingLayout | Release timeline (Unreleased, 0.2.0, 0.1.0) | `/changelog/index.html` |
| `/brand` | `src/routes/brand.tsx` | MarketingLayout | Brand system: mark, color tokens, type, voice, messaging | `/brand/index.html` |
| `/docs` | `src/routes/docs-home.tsx` | DocsLayout | Internal docs index (3-col shell) | `/docs/index.html` |
| `/docs/:page` | `src/routes/docs-page.tsx` | DocsLayout | Internal docs article; 12 prerendered slugs via `getStaticPaths` | `/docs/<slug>/index.html` |

Layout nesting (`src/App.tsx`): `RootLayout` (StrictMode + skip-link + ErrorBoundary) wraps two shells, `MarketingLayout` (Nav + Footer) for the 5 marketing routes and `DocsLayout` (256px sidebar + content + ToC) for `/docs` and `/docs/:page`.

Important: there is a SECOND, separate internal docs system inside the landing app (`src/routes/docs/`, driven by `src/lib/docs.ts` + `src/routes/docs/content.tsx`, 1187 lines, 12 articles) that is DISTINCT from the standalone `apps/docs` Fumadocs site. The landing's footer/nav link to BOTH the internal `/docs` and the external `docs.frontguard.dev`. See Broken/placeholder notes.

Internal docs slugs (from `src/lib/docs.ts`, 6 sections / 12 pages): `introduction`, `installation`, `quick-start`, `cli`, `configuration`, `playwright`, `github-actions`, `ai-analysis`, `ai-fixes`, `custom-plugins`, `self-hosting`, `validation`.

### 1.2 Component / file inventory

Layouts (`src/layouts/`):

| File | Renders / does | Hardcoded content |
|---------------------|------------------------------------------------------------|----------------------------------------------|
| `RootLayout.tsx` | App root: StrictMode + skip-link + ErrorBoundary + `<Outlet/>` | Skip link `"Skip to main content"` → `#main-content` |
| `MarketingLayout.tsx` | Sticky `Nav` + `<main id="main-content">` + `Footer` | none |
| `DocsLayout.tsx` | 3-col docs shell, 256px sidebar (mobile drawer), built from `DOCS_NAV` | sidebar links `/docs/${slug}` |

UI kit (`src/components/ui/`, barrel `index.ts`):

| File | Renders / does | Key props | Hardcoded content |
|---------------------|------------------------------------------------------|------------------------------------------|------------------------------------------------|
| `Nav.tsx` | Sticky translucent marketing header; logo + `NAV_LINKS` + GitHubStars + mobile hamburger | none | aria `"Frontguard home"`, `"Main navigation"` |
| `Footer.tsx` | Footer: brand blurb + GitHub/X icons + 4 columns (`FOOTER_COLUMNS`) + sub-bar | none | blurb `"Catch the regression, not the noise. AI-powered visual regression testing for teams who ship fast. Open source under the MIT License."`; sub-bar `"© {year} Frontguard · MIT License"`, `"Built for teams who ship fast."` |
| `GitHubStars.tsx` | Live star button; fetches real count, falls back to `★ Star` | `variant?`, `className?` | API `https://api.github.com/repos/ravidsrk/frontguard`; links `REPO_URL`; reads `stargazers_count`; `data-testid="star-count"` |
| `TopBar.tsx` | Docs top bar: wordmark + `docs` label + decorative search (`⌘K`) + links + GitHubStars | `onToggleSidebar?` | search placeholder `"Search docs"` (decorative, non-functional); links `home`/`pricing`/`github` |
| `Logo.tsx` | CSS-only 5-point shield `Mark` + `frontguard` wordmark; 3 lockups | `variant`, `height`, `cursor`, `seamColor` | wordmark `frontguard` (lowercase); clip `polygon(0% 0%,100% 0%,100% 62%,50% 100%,0% 62%)`; `data-testid="brand-mark"` |
| `Badge.tsx` | Mono uppercase pill, 5 tones, optional pulsing dot | `tone`, `dot`, `pulse` | (caller-supplied) |
| `Button.tsx` | CTA; `<a>` when `href`, else `<button>` | `variant`, `size`, `href`, `external` | none |
| `Card.tsx` | Base panel; hover-lift / amber top accent / strong border | `hoverLift`, `accentTop`, `strongBorder`, `as` | none |
| `CodeBlock.tsx` | Terminal card: 3-dot header + filename + mono `<pre>` | `filename?`, `elevated?` | shadow `0 24px 60px rgba(0,0,0,0.5)` |
| `CopyCommand.tsx` | `$ command` row + copy button (clipboard + execCommand fallback) | `command`, `prompt?`, `aria-label?` | button `copy` / `copied ✓` |
| `ComparisonTable.tsx`| Data-driven matrix (glyph/text cells), highlight column | `columns`, `rows`, `highlightColumn?`, `caption?` | glyphs `✓`/`◐`/`✕` (sr: full/partial/none) |
| `Container.tsx` | Centered max-width wrapper | `width?` (wide/matrix/brand/faq/changelog/docs), `as?` | widths 1200/1100/1080/900/860/1400px |
| `FaqItem.tsx` | Native `<details>` accordion, `+`→`×` marker | `question`, `defaultOpen?` | marker `+` |
| `Kicker.tsx` | Uppercase mono section label | `tone?` | none |
| `Pager.tsx` | Docs prev/next pager, disabled when no `to` | `prev?`, `next?` | arrows `←`/`→`, `Previous`/`Next` |
| `PricingCard.tsx` | Pricing tier card: label/price/CTA/feature list; featured = amber + badge | `label`,`price`,`per?`,`tagline`,`cta`,`features[]`,`accent?`,`featured?` | featured badge `"most popular"`; check `✓` |
| `SectionHeader.tsx` | Kicker + heading + optional lead (every marketing section) | `kicker?`,`title`,`lead?`,`center?`,`as?` | none |
| `StatGrid.tsx` | N-up stat grid with hairline gridlines | `stats`, `columns?` | none |
| `StatusGlyph.tsx` | Maps status → glyph + color | `status`, `label?` | via `status.ts` |
| `status.ts` | Status vocabulary | type `Status` | `pass ✓`, `warning ⚠`, `regression ✘`, `new ★` |
| `Timeline.tsx` | Changelog timeline: sticky version-meta col + grouped color-coded changes | `releases` | group labels `ADDED`/`CHANGED`/`SECURITY`/`TESTING`/`FIXED` |
| `VerdictCard.tsx` | AI verdict card tinted by status + confidence chip + fix line | `status`,`verdict`,`confidence?`,`fix?` | `"{n}% confidence"` |

Other components:

| File | Renders / does | Notes |
|--------------------|-----------------------------------------------|---------------------------------------------------------------|
| `Seo.tsx` | Per-route `<Head>` (title, description, canonical, OG, Twitter) | `SITE = 'https://frontguard.dev'`; NO default `og:image`/title/description — caller supplies all text. og:image is set globally in `index.html`, not here. |
| `ErrorBoundary.tsx`| Class error boundary, reload fallback | console tag `'[Frontguard] Render error:'`; copy `"Something went wrong"` / `"Refresh page"` |

Home-page sections (`src/routes/landing/sections/`): `Hero`, `ProblemStrip`, `Pillars`, `TwoWaysIn` (+ `InstallTabs`), `Pipeline`, `AiExample`, `Features`, `ConfigBlock`, `ComparisonSummary`, `Plugins`, `Honest`, `Validation`, `Cta`. Helpers: `CodeCopyBlock` (copy terminal card), `Reveal` (scroll-fade wrapper, reduced-motion aware). Render order is enumerated in §A1.

Route sub-modules: `comparisons/{data.ts, ComparisonMatrix.tsx}`, `changelog/{releases.ts, ReleaseTimeline.tsx}`, `brand/content.ts`, `docs/{content.tsx, DocsPager, DocsToc, DocsPageShell, primitives.tsx, shell-types.ts}`, `landing/{data.ts, validation-data.ts, useHashRedirect.ts}`.

Shared lib/hooks: `lib/site.ts` (cross-route link source of truth — see §A8), `lib/docs.ts` (internal docs nav/slugs), `lib/responsive.ts` (Tailwind responsive constants), `hooks/useInView.ts` (IntersectionObserver scroll-reveal), `hooks/usePrefersReducedMotion.ts` (SSR-safe reduced-motion).

Tests: 15 test files under `src/test/` (vitest + jsdom) covering routes, landing, pricing, comparisons, changelog, brand, docs, logo, github-stars, copy-command, kit, reduced-motion, seo-assets, readme-comparison-table, ssg-output. A rename/redesign will break the content-assertion tests.

---

## 2. Docs app (`apps/docs`)

Framework: Fumadocs (`fumadocs-core` / `fumadocs-ui` ^16.7.9, `fumadocs-mdx` ^14.2.11) on Next.js 16 App Router, React 19, Tailwind v4. Content authored in MDX under `content/docs/**`. Output: static export (`next.config.mjs` → `output: 'export'`, wrapped with `createMDX()`). Dev runs on port 3001 (`next dev --turbopack --port 3001`).

Wiring:
- `source.config.ts` → `defineDocs({ dir: 'content/docs' })`.
- `lib/source.ts` → Fumadocs `loader` with `baseUrl: '/docs'`.
- `app/page.tsx` → `redirect('/docs')`. The docs site has NO marketing landing page of its own; `content/docs/index.mdx` is the effective landing.
- `app/docs/layout.tsx` → Fumadocs `DocsLayout` (notebook), nav title `frontguard` (cyan mono), header links Website + GitHub.
- `app/docs/[[...slug]]/page.tsx` → catch-all renders `DocsPage`/`DocsTitle`/`DocsBody`; `generateStaticParams` from `source.generateParams()`.
- `app/not-found.tsx` → custom 404 with hardcoded cyan `#22d3ee`.
- Fonts: Plus Jakarta Sans + JetBrains Mono via raw `<link>` + inline `<body>` style (NOT `next/font`).

Theme note: docs accent is cyan (`#22d3ee` / `text-cyan-400`), hardcoded inline in `not-found.tsx` and `app/docs/layout.tsx`. This is a DIFFERENT brand from the landing app's amber (`#e8862e`). The two surfaces are visually unaligned today.

### 2.1 Navigation tree (from meta.json files)

Root `content/docs/meta.json` title `"Docs"`, pages: `---Getting Started---`, `index`, `installation`, `quick-start`, `---Reference---`, `cli`, `playwright`, `---Guides---`, `ci-cd`, `guides`, `---Integrations---`, `integrations`, `---Comparisons---`, `comparisons`, `---Deployment & Sandboxing---`, `self-host`, `sandbox`, `cross-os-rendering`, `distribution`, `---Trust---`, `results`.

Sub-metas: `cli` `["index","commands","configuration"]`; `playwright` `["index","setup","api"]`; `ci-cd` `["index","github-actions"]`; `guides` `["---Features---","ai-analysis","ai-fixes","accessibility","performance-budgets","third-party-scripts","production-monitoring","cloud-api","---Extending---","custom-plugins","create-plugin","github-actions","---Migration---","migrate-from-backstopjs","migrate-from-lost-pixel"]`; `integrations` `["mcp","storybook","netlify","slack","vercel","github"]`; `comparisons` `["frontguard-vs-argos","frontguard-vs-percy","frontguard-vs-chromatic"]`.

### 2.2 Article list (37 MDX articles, all have valid frontmatter title + description)

Root / Getting Started / Deployment / Trust:

| Slug | Title | Summary |
|---------------------|---------------------------|-----------------------------------------------------------------|
| `index` | Getting Started | Pitch, pipeline diagram, features, packages (effective docs landing) |
| `installation` | Installation | Install CLI + Playwright plugin, browsers, AI/GitHub env vars |
| `quick-start` | Quick Start | 5-step: init, dev server, baselines, detect, update |
| `self-host` | Self-Host | Self-host the cloud via docker-compose; secrets, storage, deploys |
| `sandbox` | Fix-verification sandbox | How AI fixes re-render/verify; local vs Daytona backend |
| `cross-os-rendering`| Cross-OS rendering | Why screenshots differ across OS; pinned `--docker` renderer |
| `distribution` | Where to find Frontguard | npm + every marketplace surface; release cadence |
| `results` | Validation results | Honest harness vs 5 OSS apps: methodology, reproduction, limits |

CLI / Playwright / CI-CD:

| Slug | Title | Summary |
|-------------------------|--------------------|-----------------------------------------------------------------|
| `cli/index` | CLI Overview | Architecture, discover→report pipeline, sample console output |
| `cli/commands` | CLI Commands | Full ref: run/init/update-baselines/doctor/monitor/fix-pattern/plugin |
| `cli/configuration` | Configuration | Complete `frontguard.config.ts` reference |
| `playwright/index` | Playwright Plugin | Intro to `@frontguard/playwright` + `visualTest()` |
| `playwright/setup` | Setup & Installation | Install/config: masking, thresholds, time-freezing, AI |
| `playwright/api` | API Reference | `visualTest()` API: `VisualTestOptions`/`VisualTestResult` |
| `ci-cd/index` | CI/CD Overview | CI providers, preview-URL detection, exit codes, PR comments |
| `ci-cd/github-actions` | GitHub Actions | Official action: inputs/outputs/workflow examples/secrets |

Guides:

| Slug | Title | Summary |
|---------------------------------|---------------------------------|-----------------------------------------------------------------|
| `guides/ai-analysis` | AI Analysis | Enable OpenAI/Anthropic vision; cost tips, BYOK |
| `guides/ai-fixes` | AI Fixes & Fix-Pattern Database | Generate CSS fixes, verify in sandbox, local SQLite pattern DB |
| `guides/accessibility` | Accessibility Audits | axe-core WCAG audits in the render pass |
| `guides/performance-budgets` | Performance Budgets | Core Web Vitals during render, enforce budgets |
| `guides/third-party-scripts` | Third-Party Script Monitoring | Detect ad/analytics/widget script drift between runs |
| `guides/production-monitoring` | Production Monitoring | Watch live URLs on a schedule; threshold alerting, history |
| `guides/cloud-api` | Cloud API | Hosted layer: architecture, auth, endpoints, alerts, limits |
| `guides/custom-plugins` | Custom Plugins | Lifecycle hooks, `FrontguardPlugin` interface, execution order |
| `guides/create-plugin` | Create & Publish a Plugin | Scaffold/build/test/publish a plugin to npm |
| `guides/github-actions` | GitHub Actions | Wire into PR CI; regression comments (DUPLICATE title — see notes) |
| `guides/migrate-from-backstopjs`| Migrate from BackstopJS | Map backstop.json → config; checklist, converter script |
| `guides/migrate-from-lost-pixel`| Migrate from Lost Pixel | Migrate off archived Lost Pixel; field mapping |

Integrations / Comparisons:

| Slug | Title | Summary |
|--------------------------------------|---------------------------|-----------------------------------------------------------------|
| `integrations/mcp` | MCP server | `@frontguard/mcp` exposing 4 tools to in-IDE agents |
| `integrations/storybook` | Storybook | Discovery adapter capturing every story (play()-aware) |
| `integrations/netlify` | Netlify | Build Plugin on deploy previews; PR comments |
| `integrations/slack` | Slack | `/frontguard` slash command; results posted to channel |
| `integrations/vercel` | Vercel | Preview-deploy integration; 4-layer webhook security |
| `integrations/github` | GitHub App | Check runs on PRs, preview detection, bootstrap PRs |
| `comparisons/frontguard-vs-argos` | Frontguard vs Argos | vs Argos: AI, Playwright traces, pricing, migration recipe |
| `comparisons/frontguard-vs-percy` | Frontguard vs Percy | vs Percy: pricing cliffs, CI model, AI, migration |
| `comparisons/frontguard-vs-chromatic`| Frontguard vs Chromatic | vs Chromatic: Storybook coupling, pricing, AI, migration |

### 2.3 `content/stats.json`

`apps/docs/content/stats.json` holds derived metrics (`"source": "derived-from-source"`): `version 0.2.0`, `tests 44`, `sourceFiles 48`, `plugins 5`, `bundleSize {tarballKB:386, unpackedKB:1523}`, plus pre-formatted `display` strings (`"44 tests"`, `"48 source files"`, `"5 built-in plugins"`, `"v0.2.0"`, `"386KB"`).

Caveat: the root `build:docs` script (`npm run stats && npm run build`) regenerates this via `scripts/stats.ts`. But the docs APP package.json has NO `stats` script and NO source file references `stats.json` — the numbers in MDX (e.g. cli/index, results) are hand-written. Treat `stats.json` as a CI-generated artifact not actually wired into rendering.

---

## 3. Build / deploy / CI

### 3.1 npm scripts (root `package.json`)

Workspaces: `packages/*`, `apps/*`, `integrations/*`.

| Script | Command | Notes |
|----------------------|--------------------------------------------------|----------------------------------|
| `build` | `npm run build --workspaces --if-present` | builds all workspaces |
| `test` | `npm run test --workspaces --if-present` | |
| `dev:landing` | `npm run dev --workspace=apps/landing` | vite dev |
| `dev:docs` | `npm run dev --workspace=apps/docs` | next dev :3001 |
| `dev:api` | `npm run dev --workspace=packages/cloud-api` | |
| `build:cli` | `npm run build --workspace=packages/cli` | |
| `build:landing` | `npm run build --workspace=apps/landing` | → `tsc -b && vite-react-ssg build` → `apps/landing/dist` |
| `build:docs` | `npm run stats && npm run build --workspace=apps/docs` | regenerates stats.json, then `next build` → `apps/docs/out` |
| `stats` | `npx tsx scripts/stats.ts` | |
| `lint` / `typecheck` | `--workspaces --if-present` | landing has eslint; pre-commit via husky + lint-staged |
| `release` | `npm run build && changeset publish` | |

App build scripts: landing `tsc -b && vite-react-ssg build`; docs `next build`.

### 3.2 CI workflows (`.github/workflows/`)

| Workflow | Trigger | What it does |
|------------------------|------------------------------------|-----------------------------------------------------------------------------------|
| `ci.yml` | push/PR to main | Jobs: `test` (node 20 & 22 matrix; build + `playwright install chromium` + `npm test`), `e2e` (CLI e2e), `lint` (lint + typecheck), `docs-links` (`node apps/docs/scripts/check-doc-links.mjs`), `build` (build + CLI bundle-size gate ≤180KB). Does NOT separately build landing/docs beyond root `npm run build`. |
| `deploy-landing.yml` | push to main on `apps/landing/**`, or manual | `npm ci` → `build --workspace=apps/landing` → `cloudflare/wrangler-action@v3` `pages deploy apps/landing/dist --project-name=frontguard --branch=main` |
| `deploy-docs.yml` | push to main on `apps/docs/**`, or manual | `npm ci` → `build --workspace=apps/docs` → `pages deploy apps/docs/out --project-name=frontguard-docs --branch=main` |
| `release.yml` | tag `v*` or manual | npm publish via `scripts/release.sh` (provenance); emits marketplace submission checklist |
| `action-smoke.yml` | PR | Asserts repo-root + sub-path `action.yml` exist and resolve (int-3 guard); composite-action run is `continue-on-error` because the `frontguard` npm shim isn't published |
| `frontguard-example.yml`| manual only (disabled by default) | Reference example workflow for users; not active in this repo |

### 3.3 Deploy targets — IMPORTANT CONFLICT

The ACTIVE deploy path is Cloudflare Pages (the GitHub Actions above):
- Landing → Cloudflare Pages project `frontguard` (from `apps/landing/dist`). `public/_redirects` (`/*  /index.html  200`) is a Cloudflare/Netlify SPA-fallback file.
- Docs → Cloudflare Pages project `frontguard-docs` (from `apps/docs/out`).
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

But BOTH apps also ship a `fly.toml` (`apps/landing/fly.toml` app `frontguard`, port 8080; `apps/docs/fly.toml` app `frontguard-docs`, port 3000), each with an empty `[build]` block. There are NO Dockerfiles in either app root and NO workflow that runs `fly deploy`. The fly configs are vestigial/aspirational — they reference internal ports for a server runtime that the static-export builds (`dist/`, `out/`) don't use. A redesign should decide: keep Cloudflare Pages and delete the fly.toml files, or wire fly. As-is, fly.toml is dead config.

No `vercel.json`, `netlify.toml`, or `wrangler.toml`/`wrangler.jsonc` exists; deploy is entirely via the wrangler-action `pages deploy` command line.

---

## 4. Assets to preserve

Landing `apps/landing/public/`:

| Asset | Status | Notes |
|-------------------------------------|-----------------|-------------------------------------------------|
| `favicon.svg`, `favicon.ico` | USED | referenced in `index.html` |
| `logo-16/32/48/64/128/180/192.png` + `.webp`, `logo.png` + `.webp` | USED (subset) | favicon set; `logo-16/32/180` wired in `index.html`. Generated by `scripts/generate-brand-assets.mjs` (one-off, sharp + png-to-ico; not a project dep) |
| `og-image.png` (1200×630, 46KB) | USED | hardcoded in `index.html` (`og:image`, `twitter:image`) |
| `sitemap.xml` | USED | see §5 for stale-slug issues |
| `robots.txt` | USED | `Allow: /` + sitemap pointer |
| `_redirects` | USED | SPA fallback for Cloudflare Pages |
| `404.html` | USED | brand-matched amber 404 (warm near-black canvas) |
| `llms.txt` (60 lines), `llms-full.txt` (248 lines) | USED (LLM SEO) | product summary for AI crawlers; carry over and keep in sync |
| `demo/frontguard-demo.gif` (1.3MB) | ORPHAN | NOT referenced anywhere in src/html/llms. The hero is a CSS terminal mock, not this gif. Dead weight unless redesign uses it. |

Landing `apps/landing/src/assets/`:

| Asset | Status |
|--------------------|-----------------------------------------------------|
| `hero.png` (45KB) | ORPHAN — never imported/rendered (hero is CSS) |
| `react.svg`, `vite.svg` | ORPHAN — default Vite scaffold leftovers, unused |

Brand source: the live shield mark and lockups are CSS/React (`ui/Logo.tsx`), not asset files. Brand color tokens live in `src/index.css` and are mirrored in `src/routes/brand/content.ts` (a drift fails a test). Repo-root `branding/` dir also exists (18 entries, not part of the web build).

Docs `apps/docs/public/`: contains only `.gitkeep`. Zero images, zero static assets in the docs site. Nothing to migrate on the docs image front.

Brand color tokens to preserve (from `brand/content.ts`, exact hex):
- Canvas/ink: canvas `#0d0c0b`, panel `#131210`, raised `#1f1c19`, border `#322d28`, ink-mid `#b8b0a6`, ink-hi `#f5f1ea`.
- Accent: Frontguard Amber `#E8862E` (oklch `oklch(0.72 0.18 50)`).
- Status: pass `#4fb477`, warning `#e8862e`, regression `#e5484d`, new `#5b8def`.
- Type: Space Grotesk (display/body), JetBrains Mono (code/labels).

---

## 5. Broken / stubbed / placeholder notes

1. Two competing docs systems. The landing app has its own internal docs (`/docs`, `/docs/:page`, 12 articles in `src/routes/docs/content.tsx`) AND links to the external Fumadocs site `docs.frontguard.dev` (37 articles). Slugs do not match between them (internal uses `cli`, `configuration`, `github-actions`, `self-hosting`, `validation`; the Fumadocs site uses `cli/commands`, `cli/configuration`, `ci-cd/github-actions`, `self-host`, `results`). The redesign must decide which is canonical. Maintaining both is the single biggest content-drift liability.

2. Sitemap stale/incorrect slugs (`apps/landing/public/sitemap.xml`). It lists external `docs.frontguard.dev` URLs that 404 against the actual Fumadocs routes: `/docs/comparison/percy`, `/docs/comparison/chromatic`, `/docs/comparison/argos` (real paths are `/docs/comparisons/frontguard-vs-*`), and `/docs/migrate/backstopjs`, `/docs/migrate/lost-pixel` (real paths `/docs/guides/migrate-from-*`). The internal `/docs/*` entries match the landing's own slugs but those differ from the external docs slugs too. Sitemap needs a rebuild against whichever docs system survives.

3. Broken in-app docs link. `apps/docs/content/docs/integrations/netlify.mdx:238` links to `/docs/integrations/github-app` which does not exist (real page is `/docs/integrations/github`). The `check:doc-links` CI guard does NOT catch internal route validity — it only checks action refs and a fixed dead-marketplace-URL list.

4. Action ref inconsistency — THREE different refs in the wild:
   - Landing InstallTabs, `index.html`, `llms.txt`/`llms-full.txt` show `uses: ravidsrk/frontguard@v1`.
   - Landing internal docs `src/routes/docs/content.tsx:737` shows `ravidsrk/frontguard@main`.
   - The docs CI guard (`check-doc-links.mjs`) enforces `@v0` as the ONLY canonical ref and forbids `@v1`/`@main` in `apps/docs` MDX.
   These should be unified. Per `action-smoke.yml`, `v0` is the OPS-managed marketplace tag.

5. Footer/nav links to external docs. `lib/site.ts` `NAV_LINKS` "docs" and footer "Documentation" point to internal `/docs`, while most other footer Docs/Compare links point to external `docs.frontguard.dev/...`. Mixed routing between the two docs surfaces.

6. SSG no-JS fallback in `index.html` is a parallel, divergent copy of the homepage. It is a deliberate accessibility/SEO mirror (lines ~99-335) but its CONTENT differs from the React app: it names competitor facts not in the React copy (Lost Pixel "archived on 2026-04-22", Figma acqui-hire, Chromatic Starter `$179/mo`, Argos `$510/mo vs Percy $8,999/mo`), and names lifecycle hooks differently (`onDiscover, onBeforeCapture, onAfterCapture, onBeforeDiff, onAfterDiff, onReport`) than the React `Plugins` section / `data.ts` (`beforeDiscover, afterDiscover, afterRender, afterCompare, afterRun, onError`). Two sources of truth for the same facts; a redesign must reconcile or regenerate the fallback.

7. Docs vs landing brand mismatch. Docs site accent is cyan `#22d3ee` (hardcoded inline in `not-found.tsx`, `app/docs/layout.tsx`); landing is amber `#e8862e`. The two surfaces are not visually unified.

8. Vestigial fly.toml. Both apps ship `fly.toml` with empty `[build]`, no Dockerfile, no deploy workflow — dead config (see §3.3).

9. Non-functional docs search. `ui/TopBar.tsx` renders a `⌘K` search affordance that is decorative (`aria-hidden`), no search backend.

10. Intentional, honest placeholders (NOT bugs — leave as-is): "Coming soon" markers in `distribution.mdx` for unreleased marketplace listings; "in review" notes in `github.mdx`/`slack.mdx`; unpublished infra hedges in `cross-os-rendering.mdx` (`frontguard/render` image), `self-host.mdx` (`ghcr.io/ravidsrk/frontguard-cloud-api`), `results.mdx` (AI accuracy "can't measure today"); example secret placeholders (`fg_live_xxx`, etc.). The product deliberately publishes real numbers and hedges unshipped surfaces.

11. Duplicate doc title. "GitHub Actions" exists at both `ci-cd/github-actions` and `guides/github-actions`.

---

## Appendix: real content values (the floor — exact, do not drop)

### A1. Home page (`/`) — section order
Hero → ProblemStrip → Pillars → TwoWaysIn (+InstallTabs) → Pipeline → AiExample → Features → ConfigBlock → ComparisonSummary → Plugins → Honest → Validation → Cta. (Header comment calls it 14 sections; 13 render + Nav/Footer from layout.)

SEO: title `Frontguard — Catch the regression, not the noise`; description `AI-powered visual regression testing. AI vision tells a real regression from an intentional change or content, so a red run means something again. Open-source CLI under MIT.`

### A2. Hero
- Badge: `open source · MIT · self-hostable`
- H1: `Catch the regression, not the noise.`
- Subhead: `Teams add visual regression tests — then mute the channel they post to, because ~40% of failures aren't real bugs. Frontguard uses AI vision to label every diff a regression, an intentional change, or content — so a red run means something again.`
- Install row: `npm install @frontguard/cli`
- CTAs: `Get started →` (`/docs`); GitHubStars ghost `Star`
- Terminal mock (`frontguard run`): discovers 47 routes, 12/47 affected, 12 routes × 3 viewports; rows `/` PASS, `/pricing` PASS, `/checkout` WARN, `/dashboard` REGRESSION, `/settings` NEW; footer `1 regression · 1 warning · 9 passed · 1 new`.
- AI card: `AI ANALYSIS — REGRESSION · 94% CONFIDENCE` — `"The sidebar overlaps main content on mobile. A flex-direction change in Dashboard.module.css:28 removed column stacking."`

### A3. Problem stats (`PROBLEM_STATS`)
- `~40%` of visual-diff runs fail for reasons that aren't real bugs
- `73%` of teams have lost faith in test automation to flake
- `<10%` of frontend teams run visual regression testing at all
- `$100M` a single mobile CSS bug cost on Prime Day

Kicker `// WHY TEAMS MUTE VISUAL TESTS`; heading `Everyone adds visual regression tests. Then everyone mutes the channel they post to.`

### A4. Pillars / Features / Pipeline
Pillars (`// HOW FRONTGUARD THINKS`, "Not just \"pixels differ.\" Detect, understand, fix."):
- `01 / DETECT` Find what changed — pixel + DOM + computed-style diff; multi-render consensus kills flaky noise.
- `02 / UNDERSTAND` Explain why it broke — AI vision classifies regression/intentional/content, maps to code, explains root cause.
- `03 / FIX` Verified, not guessed — generate, apply, re-render, compare; only provably-resolving fixes suggested.

Features (`// EVERYTHING IN THE BOX`, "CLI-first. Zero dashboards required."): Zero-config routes; Multi-browser (Chromium/Firefox/WebKit via Playwright); Smart rendering (dependency-graph); Git-native baselines (orphan branch); Preview deploys (Vercel/Netlify auto-detect); Per-route thresholds; Framework detection (Next.js/Remix/SvelteKit/Nuxt/Astro); Security hardened (shell-injection/path-traversal/key redaction); PR thumbnails (baseline/current/diff).

Pipeline (`// THE PIPELINE`, "Six stages, fully self-hostable.", "~90% of pages never hit the AI"): 01 Discover, 02 Filter, 03 Render, 04 Diff (pixelmatch then DOM+computed-style), 05 Analyze (AI vision), 06 Report (Console/JSON/HTML/PR comment).

### A5. AI example + Config + Plugins + Honest
AiExample (`// AI CLASSIFICATION`, "Kills the #1 pain of visual testing: false positives."): points — Severity and confidence scoring on every issue; Bring your own key — OpenAI or Anthropic; Runs locally first, AI activates only on real diffs. Verdicts: `/dashboard @ 375px` REGRESSION · 94% (fix: restore `flex-direction: column` at `<768px`); `/pricing @ 1440px` INTENTIONAL · 91%.

ConfigBlock (`frontguard.config.ts`): `baseUrl: 'http://localhost:3000'`, `discover {startUrl:'/', maxDepth:3, exclude:['/admin/*','/api/*']}`, `viewports:[375,768,1440]`, `browsers:['chromium']`, `threshold:0.1`, `ai:{provider:'openai', model:'gpt-4o'}`.

Plugins: "Extensible by design — 5 built-in plugins, 6 lifecycle hooks". Hooks: `beforeDiscover · afterDiscover · afterRender · afterCompare · afterRun · onError`. Plugins: Figma, Perf Budgets (LCP/CLS/TTFB), Accessibility (axe-core WCAG), 3rd-Party Scripts, Monitor.

Honest (`// NO MAGIC, JUST HONEST`, "We'll tell you what it isn't."):
- YOU BRING THE KEY — own OpenAI/Anthropic key, pay per judged diff; anti-flake gate keeps ~90% of pages off the model; screenshots never touch a server we run.
- YOU STAY IN THE LOOP — never silently auto-approves; every classification/fix is yours to accept/reject; feedback trains the local fix-pattern DB.
- NUMBERS, NOT CLAIMS — it's young; validates against real repos, publishes real false-positive rates.

### A6. Install commands (consolidated, exact)
- `npm install @frontguard/cli` (hero, InstallTabs CLI, pricing CTA, FAQ)
- `npx -p @frontguard/cli frontguard init`
- `npx -p @frontguard/cli frontguard run --url http://localhost:3000`
- `npx -p @frontguard/cli frontguard run \ --url http://localhost:3000` (TwoWaysIn standalone)
- `npm install -D @frontguard/cli @frontguard/playwright` (Playwright)
- `npx -p @frontguard/cli frontguard init --ci` (Cta)
- GitHub Action: `uses: ravidsrk/frontguard@v1` with `url`, env `FRONTGUARD_OPENAI_KEY`, `GITHUB_TOKEN`
- Playwright snippet: `import { expectVisual } from '@frontguard/playwright'; ... await expectVisual(page);` (note: home uses `expectVisual`, while docs/index.html no-JS fallback use `visualTest` — naming drift to reconcile)

Cta: headline `Ship with confidence.`; `Free forever. No per-screenshot pricing cliff, no dashboard lock-in. Install it and run your first check in two minutes.`; CTAs `Read the docs →`, `★ Star on GitHub`.

### A7. Validation (from `validation-data.ts`)
Run: date `2026-06-16`, CLI `0.2.0`, AI disabled. Top stats: `2 / 5` repos booted; `43` routes re-checked; `0` false positives on unchanged pages; `0%` pixel-diff FP rate. Aggregate: reposAttempted 5, booted 2, skipped 3, recheckRouteCount 43, recheckPositiveCount 0.
Booted repos: `chakra-ui-docs` (21 re-check pass, 0 FP, 0%); `tailwind-dashboard` (18, 0, 0%).
Skipped: `taxonomy` (next 13.3.2-canary failed under Node 22); `medusa-storefront` (needs Medusa backend + key); `nextra-docs` (monorepo pnpm dev binds no :3000 within 120s).
Gate: accuracy ≥ 70%, FP rate < 15%. Links: `validation/results-v0.2.md`, `validation/README.md`.

### A8. Site constants (`lib/site.ts`)
- `REPO = ravidsrk/frontguard`; `REPO_URL = https://github.com/ravidsrk/frontguard`
- `NPM_URL = https://www.npmjs.com/package/@frontguard/cli`
- `DOCS_EXTERNAL = https://docs.frontguard.dev`; `X_URL = https://x.com/ravidsrk`
- NAV_LINKS: `docs`→`/docs`, `pricing`→`/pricing`, `compare`→`/comparisons`, `changelog`→`/changelog`
- FOOTER_COLUMNS: Product (Pricing/Comparisons/Changelog/Brand), Docs (Documentation `/docs`, CLI reference/Playwright plugin/GitHub Actions/Self-host/MCP server → external), Compare (vs Percy/Chromatic/Argos → `/comparisons`; Migrate from BackstopJS/Lost Pixel → external), Project (GitHub/npm/Contributing/MIT License/Validation results).

### A9. Pricing (`/pricing`, inline in `pricing.tsx`, no separate data file)
SEO: `Pricing — Frontguard` / `The CLI is free forever under MIT. Pro hosted cloud at $29/mo. No per-screenshot pricing cliff, no dashboard lock-in.`
Hero: badge `the CLI is free forever · MIT`; H1 `Pricing that respects open source.`

Tiers:
- OPEN SOURCE — `$0` / forever. "The full CLI…". CTA `npm install @frontguard/cli` → `/#install`. Includes: Unlimited screenshots & routes; Multi-browser & multi-viewport; AI analysis (BYOK); AI fix generation + sandbox verification; Git-native baselines; GitHub Action + PR comments; All 5 plugins, self-hostable.
- PRO (featured, "most popular") — `$29` / month. CTA `Start 14-day trial` → `https://app.frontguard.dev/signup`. Plus: Hosted dashboard & report history; Managed baseline storage (R2); Slack & PagerDuty alerts; Cross-OS reference rendering; Priority support.
- TEAM — `Let's talk`. CTA `Contact us` → `mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard`. Plus: Teams, roles & invitations; Baseline approval workflows; Activity feed & audit log; Usage metering & seat billing; OpenTelemetry metrics export; SSO & dedicated support.
Note under tiers: "The hosted platform is itself open source — every Pro and Team feature can run on your own Cloudflare account."

Compare-plans matrix (Open Source | Pro | Team): CLI render/diff/report ✓✓✓; AI analysis (BYOK) ✓✓✓; AI fix gen & verification ✓✓✓; Hosted dashboard & history —✓✓; Managed baseline storage Git/R2/R2; Production monitoring scheduler CLI/—/✓; Slack/PagerDuty alerts Webhook/✓/✓; Teams, roles & approvals ——✓; SSO & audit log ——✓.

FAQ (8 Q&As, also FAQPage JSON-LD): install; cross-OS rendering (pinned Docker renderer, `--docker`); self-host the cloud (Hono on Cloudflare Workers + D1 + R2, `docker-compose up`, miniflare/SQLite/local-disk); env vars (`FRONTGUARD_OPENAI_KEY`/`FRONTGUARD_ANTHROPIC_KEY`, unprefixed `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `FRONTGUARD_API_URL`/`FRONTGUARD_API_KEY`); OpenAI vs Anthropic (Claude Sonnet default when both keys present, GPT-4o fallback); Storybook (`.storybook/main.ts` detection, play()-aware); MCP (`@frontguard/mcp` tools `list_regressions`/`get_suggested_fix`/`accept_baseline`/`recent_runs`); screenshot retention (R2, 30 days Pro, up to 1 year Enterprise).
CTA band: `Start free. Upgrade if you outgrow it.`; `npm install @frontguard/cli`.

### A10. Comparisons (`/comparisons`)
SEO: `Comparisons — Frontguard vs. everyone else` / `How Frontguard compares to Percy, Chromatic, BackstopJS, Lost Pixel, and Argos — capability by capability, with sources you can check.`
H1 `Frontguard vs. everyone else.`
Competitors (6 cols): Frontguard, Percy, Chromatic, BackstopJS, Lost Pixel, Argos.
Alternatives strip: Percy ↗ pricing cliff; Chromatic ◐ Storybook-locked; BackstopJS ✕ low activity; Lost Pixel ✕ archived.

Matrix (15 rows; order Frontguard/Percy/Chromatic/BackstopJS/Lost Pixel/Argos):
- Open source: ✓ MIT / ✕ / ◐ / ✓ / ◐ / ✓ MIT
- CLI-first: ✓/✕/✕/✓/✓/✓
- AI change classification: ✓/◐/✕/✕/✕/✕
- AI fix verification: ✓/✕/✕/✕/✕/✕
- Anti-flake rendering: ✓/◐/◐/✕/✕/◐
- Cross-OS render normalisation: ✓/✓/✓/✕/✕/✕
- Self-hostable: ✓/✕/✕/✓/◐/◐
- Storybook integration: ✓/✓/✓/✕/✓/✓
- MCP server for in-IDE agents: ✓/✕/◐/✕/✕/✕
- PR comment with thumbnail triplet: ✓/✓/✓/✕/◐/✓
- Enterprise SSO/SAML: ◐/✓/✓/✕/✕/✓
- Free tier: Forever / 5k/mo / 5k/mo / Free / ✕ / 5k/mo
- Pro entry: $29/mo / $199/mo / $179/mo / n/a / n/a / $100/mo
- Snapshot overage: Spend cap / Quote / $0.008 / n/a / n/a / $0.004
- Actively maintained: ✓ / ✓ / ✓ / ✕ quiet / ✕ / ✓
Footer note: "Every cell traces to documented vendor behaviour — see docs/research.md."

Head-to-head cards (vs Percy, Chromatic, BackstopJS, Lost Pixel/Argos) + migration cards (BackstopJS, Lost Pixel, Percy, Chromatic). Full claims captured in source `comparisons/data.ts`.

### A11. Changelog (`/changelog`, `changelog/releases.ts`)
- Unreleased (in progress, "on main"): "Storybook, OpenTelemetry & a native Slack app". ADDED: Storybook integration; OpenTelemetry export; Native Slack app; Run-over-run perf regressions; Accessibility-aware AI.
- 0.2.0 (LATEST, 2026-06-03): "The \"earn trust\" release". ADDED: `frontguard doctor`; `frontguard monitor`; AI fix generation + sandbox verification; Fix-pattern database (reuse patterns accepted ≥3 times); Accessibility & performance plugins; Cloud platform (Hono, D1+R2+GitHub OAuth); Teams & billing (Stripe); Integrations (Vercel OAuth, Netlify Build Plugin, GitHub App). CHANGED: docs migrated VitePress → Fumadocs; reporters render a11y/perf/3rd-party sections.
- 0.1.0 (INITIAL, 2026-01-01): "The core engine". ADDED: CLI; route discovery; multi-browser capture; pixelmatch diffing (0–100%); AI analysis (BYOK); Git baselines (orphan branch); plugin architecture (6 hooks + Figma/perf/monitor). SECURITY: hardened by default. TESTING: 395 tests across 26 test files.
(Note: changelog claims "395 tests" for 0.1.0; docs `stats.json` says 44 tests for 0.2.0 — different metrics/snapshots.)

### A12. Brand (`/brand`, `brand/content.ts`)
SEO `Brand — The Frontguard brand system`. H1 `The Frontguard brand system.` Sections: 01 The Mark (shield/seam/cursor; 3 lockups — primary, mono-light, mark), 02 Color (tokens in §4 above), 03 Typography (Space Grotesk + JetBrains Mono; type scale DISPLAY/52, HEADING/38, BODY/16, MONO/13), 04 Voice (Honest / Precise / Lowercase), 05 Messaging.
Primary tagline: `Catch the regression, not the noise.` No downloadable brand assets — mark/logos are live React components.

### A13. External references to preserve
`app.frontguard.dev/signup` (Pro trial), `hello@frontguard.dev` (Team contact), `docs.frontguard.dev` (external docs), `github.com/ravidsrk/frontguard`, `npmjs.com/package/@frontguard/cli`, `x.com/ravidsrk`, `api.github.com/repos/ravidsrk/frontguard` (live star count). Twitter card `@ravidsrk`; author `Ravindra Kumar`. SoftwareApplication JSON-LD in `index.html` with offers Free `$0` + Pro `$29`.
