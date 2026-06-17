# Frontguard parity spec (T-MAP)

This is the frozen parity spec for the `apps/landing` rebuild. It cross-maps the new Frontguard design (`docs/design-extract.md` + `docs/design-extract/source/*.dc.html`, the visual/UX source of truth) against the existing `apps/landing` audit (`docs/old-product-inventory.md`, the functional floor) into one complete plan that defines the entire build. After this document is committed, it is frozen: every downstream task conforms to it. If a downstream task needs to deviate, it amends this file first.

Two inputs, two roles:

- Design extract = what the rebuild must look like and how it must behave (the visual contract). Six pages: Landing, Brand, Pricing, Comparisons, Changelog, Docs.
- Old-product inventory = what the rebuild must not lose (the functional floor). Eleven sections, the live-data wiring, the SEO surface, the a11y baseline, and the green-build requirement.

Where the two disagree, the reconciliations in this document win, and each is recorded as a deliberate decision.

## 1. Scope and target architecture

### 1.1 What is in scope

The build target is `apps/landing` only. It is rebuilt from a single-page SPA into a multi-page site in the new design language, preserving every functional-floor capability. All six design pages are built inside `apps/landing`. `apps/docs` and `apps/demo` are classified (section 6) and kept functionally as-is this cycle.

### 1.2 Target architecture: multi-page `apps/landing`

The new design is six pages; the old landing is one page. Decision: `apps/landing` becomes a multi-page React site with client-side routing.

Route map (design page to route):

| Route          | Design page          | Purpose                                                      |
| -------------- | -------------------- | ----------------------------------------------------------- |
| `/`            | Landing.dc.html      | Primary marketing page (14 sections + footer)               |
| `/pricing`     | Pricing.dc.html      | Tiers, compare matrix, FAQ, CTA                              |
| `/comparisons` | Comparisons.dc.html  | Alternatives, full matrix, head-to-head, migration          |
| `/changelog`   | Changelog.dc.html    | Release timeline                                             |
| `/brand`       | Brand.dc.html        | Brand system / living styleguide                            |
| `/docs`        | Docs.dc.html         | In-brand docs surface (sidebar + content + TOC), `/docs/:page` |

Nav-link reconciliation: the design's Landing nav links read `features`, `docs`, `pricing`, `compare`, `changelog`. Targets after the route split:

- `features` -> in-page anchor `/#features` (Features section stays on the Landing page).
- `docs` -> `/docs` (in-app docs route, section 6 decision).
- `pricing` -> `/pricing`.
- `compare` -> `/comparisons`.
- `changelog` -> `/changelog`.

### 1.3 Routing approach: react-router-dom

Decision: add `react-router-dom` (v7, current standard; the `BrowserRouter` API is v6-compatible). Justification, stdlib/existing-deps-first:

- No existing dependency does routing. React 19 + Vite ship no router. So a dependency is required.
- The two real options are `react-router-dom` and Vite MPA (multiple `.html` entry points). react-router-dom wins: it is the de-facto React router, supports nested routes (`/docs/:page` for the Docs shell's twelve sub-pages), per-route lazy loading (preserves the existing `React.lazy` code-splitting posture), and a single in-app shell (shared Nav/Footer mount once, no full-page reloads between marketing pages). Vite MPA would duplicate the shell per page, lose SPA navigation, and complicate the shared component kit.
- One dependency, widely maintained, no transitive bloat of concern.

Routing shape: a `BrowserRouter` in `main.tsx`, a route table in `App.tsx` mapping the six routes to lazily-imported page components, a shared layout (Nav + `<Outlet/>` + Footer) for the five marketing pages, and a separate layout for `/docs` (the three-column docs shell with its own top bar). The Docs page models `activePage` via the URL (`/docs/:page`) so deep links and the prev/next pager are real navigation, not just React state.

### 1.4 Per-route SEO and the no-JS floor

The floor requires strong SEO (title/description/canonical/OG/Twitter/JSON-LD) and a static no-JS fallback. A client-rendered SPA would regress that for the five new routes. Decisions:

- Per-route head tags: use React 19 native document metadata (render `<title>`, `<meta>`, `<link rel="canonical">` inside each page component; React 19 hoists them to `<head>`). No `react-helmet` dependency.
- Crawler/no-JS parity for all routes: add build-time prerendering so each route emits static HTML. Recommended: `vite-react-ssg` (built for react-router + Vite SSG) evaluated in T-FOUNDATION. If prerender is deferred, the homepage keeps its existing rich `#root` static fallback (floor preserved) and the new routes are CSR with React 19 metadata; this SEO tradeoff for the new routes must be recorded, not silent. Recommendation: do the prerender so `/pricing`, `/comparisons`, `/changelog`, `/brand`, `/docs` are crawlable at parity with `/`.
- SPA deep-link serving: Cloudflare Pages must serve `index.html` for unknown deep paths so `/pricing` etc. resolve on hard refresh. Add a `public/_redirects` (`/*  /index.html  200`) or rely on Pages SPA fallback; the existing `404.html` is reskinned but the SPA fallback is the primary mechanism. (With SSG, real per-route HTML exists and this is only a backstop.)

### 1.5 Build, deploy, and green-build contract (unchanged floor)

These must stay green and are a hard requirement (floor items 19-20):

- `apps/landing`: `npm run build` (`tsc -b && vite build`, strict TS), `npm run lint` (`eslint .`), plus the new `npm test` (section 2.5).
- Root: `npm run dev:landing`, `npm run build:landing`, and `npm test` (which now picks up the landing's new `test` script via `--workspaces --if-present`).
- Deploy: Cloudflare Pages from `apps/landing/dist` (`.github/workflows/deploy-landing.yml`), branch `main`. `fly.toml` stays legacy/unused.

## 2. T-FOUNDATION

T-FOUNDATION is the single gating task. Every screen/area task depends on it and starts only after it lands. It establishes tokens, the shared component kit, routing, the brand mark, fonts, test infrastructure, and the responsive + a11y systems. It also scaffolds every route as a stub so screen tasks edit only their own page file (no router-file contention).

### 2.1 Design tokens (from the extract)

Color (replace the entire current cyan/slate `@theme`):

| Token                 | Value                | Role                                          |
| --------------------- | -------------------- | --------------------------------------------- |
| `--color-canvas`      | `#0d0c0b`            | page background (warm near-black)             |
| `--color-panel`       | `#131210`            | cards, code blocks, raised surfaces           |
| `--color-raised`      | `#1f1c19`            | raised button/input fill, ghost hover         |
| `--color-border`      | `#322d28`            | strong 1px border (inputs, key cards)         |
| `--color-border-card` | `#2a2622`            | default card border (most cards)              |
| `--color-border-faint`| `#211e1b`            | hairline dividers, grid-gap fill              |
| `--color-border-hover`| `#54493f`            | hover border (cards, buttons, faq, vs)        |
| `--color-ink-mid`     | `#b8b0a6`            | body text                                     |
| `--color-ink-hi`      | `#f5f1ea`            | headings, primary/hover text                  |
| `--color-amber`       | `#e8862e`            | the one brand accent; `oklch(0.72 0.18 50)`   |
| `--color-amber-hover` | `#f59b45`            | primary button hover                          |
| `--color-amber-tint`  | `#1a130b`            | amber-tinted panel (badges, callouts)         |
| `--color-amber-tint2` | `#15110c`            | Pro pricing card fill                         |
| `--color-amber-brd`   | `#3a2a18`            | amber-tinted border                           |
| `--color-pass`        | `#4fb477`            | status pass (glyph ✓)                          |
| `--color-warning`     | `#e8862e`            | status warning (glyph ⚠, = amber)             |
| `--color-regression`  | `#e5484d`            | status regression (glyph ✘)                   |
| `--color-new`         | `#5b8def`            | status new / blue accent (glyph ★)            |

Plus the extended neutral ramp (`#100f0e`, `#121110`, `#161412`, `#564f48`, `#6b645c`, `#7c746b`, `#8c847a`, `#9b958c`, `#c8c0b6`, `#d8d0c5`, `#e6e0d6`) and the code-syntax palette (`#c678dd` keyword, `#98c379` string, `#4fb477` added, `#5b8def` blue, `#e8862e` number, `#564f48` comment, `#b8b0a6` default) as named utilities for code blocks. Status tinted borders/bg: pass `#24472f`/`#0e1410`, regression `#4a2424`/`#170f0e`, amber `#3a2a18`/`#1a130b`.

Type: `--font-sans: 'Space Grotesk', sans-serif`; `--font-mono: 'JetBrains Mono', monospace`. Body default `font-sans / #b8b0a6 / #0d0c0b`. Heading scale (px, from the extract's verified table): heroes 58/54/52/48/42, CTA h2 44/40, section h2 38/36, sub h2 30/32, card/Docs h2 24/26, h3 22/21, lead 18/17, body 16.5/16/15.5/15/14.5/14, small/code 13.5/13/12.5/12, tiny mono 11/10.5. Weights 700 (heroes, section h2, wordmark), 600 (Docs/Changelog h2, card h3), 500 (emphasized mono, ghost buttons), 400 (body/most mono). Letter-spacing -0.035em hero h1 + big CTA h2 (-0.04em Brand hero), -0.03em section h2, -0.02em wordmark + small h2, positive +0.04/+0.06/+0.08em on uppercase mono labels. Line-height: hero 1.02-1.05, body 1.45-1.6.

Spacing: 4px base; literal-px scale (6,8,9,10,11,12,14,16,18,20,22,24,26,28,32,36,40,44,48,52,56,64,72,84,88,90). Section rhythm ~84px top padding (hero 88, CTA bands 90). Containers: standard `max-width:1200px; padding:0 28px`; narrower wrappers 1100 (pricing matrix), 1080 (Brand), 900 (pricing FAQ), 860 (changelog); Docs is `1400px` with a `256px minmax(0,1fr) 224px` grid.

Radius: zero everywhere. The only `border-radius` is `50%` on the three terminal dots and a few 6-7px status dots. No rounded corners anywhere else; no rounded cards.

Shadows: only behind elevated panels. Hero terminal `0 24px 60px rgba(0,0,0,0.5)`; config block `0 20px 50px rgba(0,0,0,0.4)`; AI card `0 16px 40px rgba(0,0,0,0.45)`. Hero radial amber glow `radial-gradient(60% 50% at 60% 40%, rgba(232,134,46,0.10), transparent 70%)`. No shadows on standard cards.

Motion: `.18s ease` on interactive fills/borders, `.15s ease` on swatch lift. Hover-lift cards `translateY(-2px)` + border `#54493f`; swatch `translateY(-3px)`; primary button -> `#f59b45`; ghost -> border `#54493f` + fill `#1f1c19`; comparison/faq/vs row hover fills/borders per the extract. Keyframes: `fg-blink` (1.1s step-end cursor), `fg-pulse` (2s badge dot), `fg-scan` (declared scan-line). `scroll-behavior:smooth` on the Docs route. Selection `::selection { background:#e8862e; color:#0d0c0b }`. Scrollbar 9px, thumb `#2a2622`, Docs track `#0d0c0b`.

### 2.2 Tailwind v4 theme wiring

Rewrite `apps/landing/src/index.css` `@theme`: replace all cyan/slate `--color-*` and the Outfit/Plus-Jakarta `--font-*` with the tokens in 2.1 (`--color-canvas`, `--color-panel`, `--color-raised`, `--color-border`, `--color-ink-mid`, `--color-ink-hi`, `--color-amber`, `--color-amber-hover`, `--color-pass`, `--color-warning`, `--color-regression`, `--color-new`, etc.), set `--font-sans: 'Space Grotesk'`, `--font-mono: 'JetBrains Mono'`, default radius 0, and add `fg-blink`/`fg-pulse`/`fg-scan` keyframes. Remove the cyan grain overlay, the cyan comparison-row tint, and the `pricing-popular` rotating gradient border (replaced by the design's clipped "MOST POPULAR" badge). Keep and re-color: custom scrollbar (9px), `::selection`, `*:focus-visible` outline (now amber), and the `prefers-reduced-motion` block (a11y floor; must be retained verbatim in intent).

### 2.3 Brand mark, fonts, favicon/OG

- Brand mark: the CSS amber shield, `clip-path: polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)` filled `#e8862e`, with a thin center seam (a second clipped span 1.5-7px wide filled in the background color) splitting baseline-vs-current halves; lowercase `frontguard` wordmark in JetBrains Mono 700, optional blinking amber block cursor. Three lockups (primary on dark, mono on light `#14110d`/`#f5f1ea`, mark-only icon). This replaces the old cyan "FG" raster logo. Built as the `Logo`/`Mark` kit component (2.4).
- Fonts: swap `apps/landing/index.html` Google Fonts links from Outfit + Plus Jakarta Sans + JetBrains Mono to `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap` (keep preconnect). Self-hosting is allowed but the CDN link is the default.
- Favicon / apple-touch / OG raster: the committed `logo.png`, `logo-16/32/48/64/128/180/192.{png,webp}`, `favicon.ico`, and `og-image.png` are the OLD cyan mark. Regenerate them from the amber shield shape so the browser tab, apple-touch, and social cards match the new brand. `theme-color` changes `#06080c` -> `#0d0c0b`. This is part of T-FOUNDATION because every page references these.

### 2.4 Shared component library (`src/components/ui/`)

Build the kit once; all pages consume it. The existing `components/*` (Nav, Hero, Problem, HowItWorks, Features, Comparison, Pricing, FAQ, Footer, QuickStart, Validation) are restyled to the new design (REDESIGN) rather than rebuilt from zero, but their primitives are factored into this kit:

| Component        | Variants / props                                              | Used by                                            |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Button          | primary (amber) / ghost (bordered); sizes nav/md/lg; `as` link | nav Star, hero CTAs, tier CTAs, pager, CTA bands   |
| Badge / Pill    | amber / green / status-colored; optional pulsing dot          | hero badge, pricing pill, "MOST POPULAR", tags     |
| Card            | base panel; `hoverLift`; optional accent top-border (2px amber)| pillars, features, honest, plugins, vs-cards       |
| SectionHeader   | mono kicker (`// ...`) + h2 + optional lead                   | every marketing section                            |
| Kicker / Label  | uppercase JetBrains Mono, tracked, muted                      | section kickers, card tags                         |
| CodeBlock       | terminal header (3 dots + filename) + syntax `<pre>`          | hero terminal, two-ways-in, config, docs           |
| CopyCommand     | `$ ` prompt + command + copy button (-> "copied ✓")           | hero install, CTA init, pricing install            |
| StatusGlyph     | ✓/⚠/✘/★ -> pass/warning/regression/new colors                | terminal output, verdict cards, tables             |
| VerdictCard     | tinted border+bg by status, confidence chip, body, fix line  | hero AI card, AI-example cards                      |
| StatGrid        | 2x2 / N-up with 1px gridline fill                            | problem strip, features grid                        |
| ComparisonTable | data-driven columns + cell-to-color map (✓/◐/✕/text)         | landing comparison, pricing matrix, comparisons     |
| PricingCard     | accent, price, per, tagline, CTA, check-list, `featured` badge| pricing tiers                                      |
| FaqItem         | question + answer; hover border; optional accordion collapse  | pricing FAQ                                        |
| Logo / Mark     | CSS clip-path amber shield + seam; lockups; cursor           | nav, footer, CTA, Brand                             |
| Nav / TopBar    | sticky translucent marketing nav; docs top-bar variant       | all pages                                          |
| Footer          | 4-column links + sub-bar                                     | marketing pages                                    |
| Timeline        | version-meta column + grouped color-coded change list         | changelog                                          |
| DocsShell       | sidebar nav + content + TOC; active-page state from URL       | docs                                               |
| Pager           | prev/next with disabled end states (0.4 opacity)             | docs                                               |

Data-driven rules: `ComparisonTable` is used three times with different column counts (5-col landing, 4-col pricing matrix, 7-col comparisons) and cell vocabularies, so columns and the cell-color mapping are props, not hardcoded. `FaqItem` renders open in the design; native `<details>` is acceptable to keep the floor accordion (floor item 9), with the design's hover-border applied. `DocsShell` derives breadcrumb, TOC, and pager from an ordered page list mirroring `renderVals.pages`/`tocMap`.

### 2.5 Test setup (vitest + Testing Library + jsdom)

No test framework exists in `apps/landing` today. T-FOUNDATION wires one and proves it green:

- devDependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- `vite.config.ts`: add a `test` block (`environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`, `css: true`). (Use the `vitest/config` `defineConfig` so the `test` key typechecks.)
- `src/test/setup.ts`: `import '@testing-library/jest-dom'`.
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. The root `npm test` (`--workspaces --if-present`) now runs it; root CI (`.github/workflows/ci.yml`) already invokes `npm test`, so the landing's tests start running in CI automatically.
- Sample passing test: `src/test/smoke.test.tsx` renders a trivial component (e.g. the `Logo` mark) and asserts it is in the document. This is the gate proof: T-FOUNDATION is not done until `npm test` passes.

Per-task tests in screen tasks build on this harness (section 5 acceptance criteria require real tests per item).

### 2.6 Routing scaffold, responsive system, a11y baseline

- Routing scaffold: install react-router-dom, add `BrowserRouter` in `main.tsx` (keeping `StrictMode` + `ErrorBoundary` wrap), build the route table + the two layouts (marketing shell, docs shell) in `App.tsx`, and create stub page components for all six routes so screen tasks edit only their own file. Preserve the skip link and `<main id="main-content">`.
- Responsive system (the design is desktop-fixed with zero `@media`; the build owns responsive): define the canonical breakpoints and collapse rules once as shared utilities/components so every page applies them consistently. Rules (from the extract, mobile-first Tailwind v4): nav collapses to a hamburger below ~768px (Star button stays visible); hero `1fr 1fr` stacks below ~900px (terminal under copy); `repeat(3,1fr)` grids go 3->2->1; `repeat(6,1fr)` pipeline and `repeat(5,1fr)` plugins wrap to 2-3 then 1; tables get `overflow-x:auto` or stack to cards on mobile; the Docs three-column shell becomes a drawer sidebar + hidden TOC with full-width content on mobile; hero h1 fluid-scales from 58px toward ~32-36px on mobile.
- A11y baseline (floor item 14): skip-to-content link, amber `*:focus-visible` outline, ARIA on nav/tabs/accordions/comparison caption, alt text on imagery, and `prefers-reduced-motion` honored. The reduced-motion media query must neutralize the new `fg-blink`/`fg-pulse`/`fg-scan` animations too.

T-FOUNDATION done = tokens + theme + kit + brand mark + fonts + favicon/OG regen + router scaffold + responsive utils + a11y baseline + green `npm test` (sample) + green `tsc -b` + green `eslint .`.

## 3. Parity matrix

Treatment legend: REDESIGN = design covers an existing floor capability, rebuild it in the new design. GAP-FILL = floor has it, design is silent, so design-and-build it in the new visual language to full depth. NEW = design introduces it, build it. (Combined REDESIGN+GAP-FILL = design covers it but at less depth than the floor; rebuild in the new design AND restore the floor's depth.)

### 3.1 Floor sections (must survive)

| Floor capability (old)                   | Treatment          | Target route / section                          | Notes                                                                                          |
| ---------------------------------------- | ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Nav (fixed header, links, stars, CTA)    | REDESIGN           | shared `Nav` (all routes)                       | New sticky translucent nav; links re-pointed to routes (1.2); keep scroll-state, mobile menu, Escape-close, focus mgmt |
| GitHubStars (live count fetch)           | GAP-FILL           | shared `Nav` Star button + hero/footer          | Design shows static `★ Star`; wire the live `stargazers_count` fetch + never-fabricate + AbortController behind it |
| Hero (+ inline demo, `#demo`)            | REDESIGN           | `/` Hero                                        | New copy/layout + CSS terminal mock (design uses HTML terminal, not the GIF); keep `#demo` target and GIF-with-terminal-fallback option |
| Problem (3 failure-mode cards)           | REDESIGN           | `/` Problem strip                              | Design problem strip = statement + 2x2 stat grid; fold the 3 sourced failure modes' substance in; keep source citations |
| HowItWorks (Detect/Understand/Fix)       | REDESIGN           | `/` Three pillars                              | Same Detect/Understand/Fix pillars in new card style                                            |
| Features (6 cards)                       | REDESIGN+GAP-FILL  | `/` Features grid                              | Design grid = 9 cells; old = 6. Carry all old 6 substance + design's extras; keep code-snippet flavor |
| Comparison (11 rows x Percy/Chromatic/Argos) | REDESIGN+GAP-FILL | `/` comparison (summary) + `/comparisons` (full) | Design landing table = 5-col/7-row; `/comparisons` = 7-col/9-row. Restore the floor's 11-row depth on `/comparisons` (add "PR comment with thumbnail triplet", "Enterprise SSO/SAML", "MCP server"); landing keeps a summary |
| QuickStart / Install (3 tabs, copy)      | REDESIGN           | `/` Two-ways-in + install rows                 | Design = "Standalone CLI" + "Playwright-native" cards + `CopyCommand` rows; preserve the GitHub-Action third path (fold into two-ways-in or a third card) + tab-grade keyboard a11y + clipboard + execCommand fallback |
| Validation (4 stats + 5-repo table)      | GAP-FILL           | `/` Validation section                         | Design is silent on Validation; design-and-build it in the new language; keep the harness-wired numbers and methodology links exactly |
| Pricing (3 tiers)                        | REDESIGN           | `/pricing` tiers (+ landing pricing CTA)       | Free CLI / Pro / Team; design Pro `featured` "MOST POPULAR"; keep CTAs (install anchor, external signup, mailto) + rel hygiene; pricing leaves the landing page (recorded, 4.2) |
| FAQ (8 questions + JSON-LD)              | REDESIGN+GAP-FILL  | `/pricing` FAQ section                         | Design pricing FAQ = 5 items; old = 8. Carry all 8 questions; keep FAQPage JSON-LD aligned; `#faq` becomes `/pricing#faq` (4.2) |
| Footer (4 columns + sub-bar)            | REDESIGN           | shared `Footer`                                | New 4-column footer; keep all link columns, socials, dynamic year, external-link hygiene; route internal links to new pages |
| ErrorBoundary                            | REDESIGN (port)    | `main.tsx` wrap                                | Keep as-is, restyle the fallback to new tokens                                                  |
| useInView (scroll reveal)               | REDESIGN (port)    | shared hook                                     | Keep IntersectionObserver reveal; new keyframes; must degrade under `prefers-reduced-motion`    |
| Skip link + a11y baseline               | REDESIGN (port)    | T-FOUNDATION + every page                      | Floor item 14                                                                                  |

### 3.2 Floor SEO / data / build surface (must survive)

| Floor capability                                   | Treatment | Carried by                          | Notes                                                                                   |
| -------------------------------------------------- | --------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `<head>` title/desc/canonical/theme-color/OG/Twitter/favicons | REDESIGN  | T-FOUNDATION (head) + per-route meta | Global head in `index.html` (foundation); per-route title/desc/canonical via React 19 metadata; `theme-color` -> `#0d0c0b` |
| SoftwareApplication JSON-LD                        | REDESIGN  | T-FOUNDATION head                   | Keep offers ($0 / $29), no fabricated ratings                                            |
| FAQPage JSON-LD (8 Qs)                             | REDESIGN+GAP-FILL | `/pricing` (with the FAQ UI) | Move with the FAQ; reconcile to stay aligned in substance with on-page answers; fix the stale "mirror verbatim" comment |
| Static no-JS `#root` fallback (homepage)          | REDESIGN  | T-LANDING (index.html `#root`)      | Reskin the homepage static mirror; reconcile the 9-vs-11 comparison rows and condensed-FAQ gaps |
| Per-route crawlability                             | NEW       | T-FOUNDATION (SSG) + T-SEO-ASSETS   | Prerender the five new routes (1.4); otherwise record the CSR tradeoff                   |
| `robots.txt` / `sitemap.xml` / `llms.txt` / `llms-full.txt` / `404.html` | REDESIGN+GAP-FILL | T-SEO-ASSETS | Add the new routes to sitemap + llms; reskin `404.html`; keep all served at root |
| Validation numbers wired to harness               | GAP-FILL  | T-LANDING (Validation)              | Keep the `validation/aggregate-results.mjs --landing` regeneration path; never fabricate |
| Green build/lint/test + Cloudflare deploy         | REDESIGN  | T-FOUNDATION + every task           | Floor items 19-20; add `npm test` to the contract                                       |

### 3.3 Design pages / sections (the visual target)

| Design page / section                  | Treatment | Target                       | Notes                                                                                  |
| -------------------------------------- | --------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| Landing: Nav                           | REDESIGN  | shared `Nav`                 | see 3.1                                                                                |
| Landing: Hero + terminal + AI card     | REDESIGN  | `/` Hero                     | CSS terminal mock + overlapping AI-analysis verdict card                               |
| Landing: Problem strip (stat grid)     | REDESIGN  | `/` Problem                  | 2x2 stat grid with 1px gridlines                                                       |
| Landing: Three pillars                  | REDESIGN  | `/` HowItWorks               | 01 Detect / 02 Understand / 03 Fix                                                     |
| Landing: Two ways in                    | NEW       | `/` (absorbs QuickStart)     | Standalone CLI + Playwright-native cards                                               |
| Landing: How-it-works pipeline (6 stage)| NEW       | `/` pipeline                 | `repeat(6,1fr)` Discover/Filter/Render/Diff/Analyze/Report                             |
| Landing: AI classification example      | NEW       | `/` AI-example               | "Kills the #1 pain" + two verdict cards (REGRESSION 94% / INTENTIONAL 91%)             |
| Landing: Features grid (9)              | REDESIGN+GAP-FILL | `/` Features          | see 3.1                                                                                |
| Landing: Config code section            | NEW       | `/` config                   | `frontguard.config.ts` syntax-highlighted block                                       |
| Landing: Comparison table (5-col)       | REDESIGN  | `/` comparison summary       | links to `/comparisons`                                                                |
| Landing: Plugins panel                  | NEW       | `/` plugins                  | 6 hooks + 5 plugin cards (2px amber top-border)                                        |
| Landing: Honest section                 | NEW       | `/` honest                   | YOU BRING THE KEY / YOU STAY IN THE LOOP / NUMBERS NOT CLAIMS                          |
| Landing: CTA band                       | REDESIGN  | `/` CTA                      | big shield + init copy row + CTAs                                                      |
| Brand page (full)                       | NEW       | `/brand`                     | living styleguide / token reference; lower priority but in the 6-page set             |
| Pricing: hero + tiers + matrix + FAQ + CTA | REDESIGN+NEW | `/pricing`              | tiers REDESIGN; compare matrix NEW; FAQ REDESIGN+GAP-FILL                              |
| Comparisons: hero + alternatives + matrix + head-to-head + migration + CTA | NEW (page) | `/comparisons` | absorbs floor Comparison at full depth                                                |
| Changelog: timeline (3 releases)        | NEW       | `/changelog`                 | sourced from root `CHANGELOG.md`; footer "Changelog" link becomes internal            |
| Docs: shell + sidebar + content + TOC + pager + search | NEW | `/docs`, `/docs/:page` | in-brand docs surface; coexists with apps/docs (section 6)                            |

## 4. Recorded reconciliation decisions

These are the deliberate deviations where design and floor disagreed. Frozen.

1. Single page -> six routes. `apps/landing` becomes a multi-page react-router-dom site (1.2-1.3).
2. Pricing and FAQ leave the Landing page. The design's Landing has no pricing or FAQ section; both live on `/pricing`. Consequence: the floor's `#pricing` and `#faq` in-page anchors become `/pricing` and `/pricing#faq`. Backward-compat for old inbound hash links (`frontguard.dev/#pricing`, `/#faq`): add a small hash-redirect shim on `/` that maps legacy hashes to the new routes. Recorded; not silent. The Landing keeps a pricing CTA/link, not a full pricing grid.
3. `#comparison` -> `/comparisons`. The full comparison is a standalone page; the Landing keeps a 5-column summary table that links to it. Old `/#comparison` hash gets the same redirect shim.
4. Comparison depth. Restore the floor's 11 rows on `/comparisons` (design shows 9). Add the missing "PR comment with thumbnail triplet", "Enterprise SSO/SAML", and "MCP server" rows. The competitor set expands to include Argos (design's 7th column) on `/comparisons`; the Landing summary keeps the 5-column set.
5. FAQ depth. Carry all 8 floor questions on `/pricing` (design shows 5). Keep the FAQPage JSON-LD aligned in substance and fix the stale source comment that claims verbatim mirroring (it is a paraphrase today).
6. Docs duality. Build the design's Docs page in `apps/landing` at `/docs` as the new-brand docs surface; keep `apps/docs` (Fumadocs) live as the deep technical reference (section 6).
7. Demo asset. The design hero uses a CSS terminal mock, not `frontguard-demo.gif`. Keep the GIF available (docs/README) and keep the floor's GIF-with-terminal-fallback option behind the hero if the team wants the GIF; default to the design's CSS mock. The `#demo` anchor stays.
8. Brand raster assets. Regenerate favicon / apple-touch / OG / `logo-*` from the amber shield (old cyan mark retired). Recorded in T-FOUNDATION.
9. Per-route SEO via prerender. Recommended `vite-react-ssg`; if deferred, new routes are CSR (homepage keeps its static fallback) and the tradeoff is recorded (1.4).
10. Validation stays. Design is silent; it is GAP-FILLED onto `/` with its real harness wiring intact (no fabricated numbers).

## 5. Build task list (ordered, with acceptance criteria)

All screen/area tasks are gated on T-FOUNDATION. T-FOUNDATION scaffolds every route stub, the shared kit, and `index.html` `<head>`, so the screen tasks below touch disjoint files and run in parallel. The two index.html owners are split cleanly: T-FOUNDATION owns `<head>` (done first); T-LANDING owns the `#root` static fallback body; no task three-way-edits `index.html`.

Slugs and grouping (for the ledger):

- Serial gate (must finish before any other task starts): `t-foundation`.
- Parallel wave (start together after `t-foundation`; disjoint files): `t-landing`, `t-pricing`, `t-comparisons`, `t-changelog`, `t-docs`, `t-brand`.
- Serial finalize (after the parallel wave; needs all routes + final content): `t-seo-assets`.

File-overlap notes that justify the grouping: each page task owns `src/routes/<page>/*` and its own page component; all consume `src/components/ui/*` read-only (built in foundation). `t-landing` additionally owns the `index.html` `#root` fallback. `t-seo-assets` owns `public/*` (sitemap/robots/llms/404) and verifies per-route metadata, so it must run after the routes and after `t-landing`'s fallback exist.

Per-item acceptance criteria below = design fidelity (cite source page) + functional parity (cite floor items) + real tests + all states + responsive + a11y.

### t-foundation (serial gate)

- Fidelity: tokens, type scale, spacing, radius-0, shadows, motion, brand mark, lockups, and fonts match `docs/design-extract.md` sections "Color/Typography/Spacing/Radius/Motion/Iconography" and the Brand page (`Brand.dc.html`).
- Parity: preserves the build/lint contract (floor 19), the a11y baseline + `prefers-reduced-motion` (floor 14), `ErrorBoundary` + `useInView` ported (floor 12-13), and re-points nav/footer links to routes without losing any (floor 1-2).
- Tests: `npm test` green with the sample smoke test rendering the `Logo` mark; kit primitives (`Button`, `Badge`, `CopyCommand`, `StatusGlyph`) have render/variant tests.
- States: kit components expose hover/disabled/active/`featured` variants; `CopyCommand` toggles "copied ✓" (1600ms); reduced-motion neutralizes `fg-blink`/`fg-pulse`/`fg-scan`.
- Responsive: breakpoint utilities + collapse rules (2.6) defined and unit-coverable; nav hamburger threshold ~768px.
- A11y: skip link, amber `*:focus-visible`, ARIA scaffolding in `Nav`, regenerated favicon/OG.
- Done when: `tsc -b`, `eslint .`, and `npm test` all pass; all six route stubs render; brand mark + fonts visibly applied.

### t-landing (parallel wave) — `/`

- Fidelity: all 14 Landing sections per `Landing.dc.html` / `renders/landing.png` (nav, hero+terminal+AI card, problem strip, three pillars, two-ways-in, 6-stage pipeline, AI example, 9-cell features, config block, 5-col comparison summary, plugins, honest, CTA, footer).
- Parity: floor sections Hero(+`#demo`), Problem, HowItWorks, Features (all 6 substance), QuickStart/install (3 paths incl. GitHub Action, keyboard a11y, clipboard + execCommand), Validation (GAP-FILL, harness numbers + methodology links wired), GitHubStars live fetch in nav/hero, all in-page anchors (`#features` etc.), scroll-reveal. Owns and reconciles the `index.html` `#root` static fallback (9->11 comparison rows; condensed-FAQ note) and the `#demo`/legacy-hash redirect shim (decisions 2-3,7).
- Tests: render tests for each section; GitHubStars (loading/success/error/abort) mocked; copy-to-clipboard (success + execCommand fallback); Validation number formatting + skip-row rendering.
- States: hero demo CSS-mock (and optional GIF onError fallback); GitHubStars loading/success/error; Validation measured/pending/skipped rows; copy "copied ✓"; empty/edge handled; terminal cursor + badge dot animate.
- Responsive: hero stacks <900px, pillars/features 3->2->1, pipeline/plugins wrap, comparison summary scrolls/stacks, hero h1 fluid to ~32-36px.
- A11y: skip target `#main-content`, ARIA on the install tabs/copy (`aria-live`), comparison `<caption class="sr-only">`, alt text on imagery, reduced-motion.

### t-pricing (parallel wave) — `/pricing`

- Fidelity: hero (green "CLI IS FREE FOREVER" pill, h1 54px), 3 tiers (`renderVals.tiers`: Open Source $0 / Pro $29 `featured` "MOST POPULAR" / Team), compare-plans matrix (`1.6fr 1fr 1fr 1fr`, 9 rows), FAQ cards, CTA band, footer, per `Pricing.dc.html` / `renders/pricing.png`.
- Parity: floor Pricing (3 tiers, correct CTAs: install anchor, external signup new-tab, `mailto:` enterprise, rel hygiene); floor FAQ all 8 questions (REDESIGN+GAP-FILL, decision 5) with FAQPage JSON-LD on this route aligned in substance; `#faq` anchor as `/pricing#faq`.
- Tests: tier CTA hrefs + `rel="noopener noreferrer"` + `target=_blank` for http/mailto; FAQ renders all 8; matrix cell-color mapping; install `CopyCommand`.
- States: Pro `featured` badge; FAQ hover border (+ optional collapse); install "copied ✓"; matrix horizontal scroll on narrow.
- Responsive: tiers 3->1; matrix `overflow-x:auto` or stacked cards; FAQ full width.
- A11y: FAQ as `<details>` or ARIA accordion; CTA buttons labelled; focus-visible.

### t-comparisons (parallel wave) — `/comparisons`

- Fidelity: hero (h1 52px), alternatives strip (`repeat(4,1fr)`: Percy/Chromatic/BackstopJS/Lost Pixel), 7-col matrix (CAPABILITY + Frontguard + Percy + Chromatic + BackstopJS + Lost Pixel + Argos) with the legend (✓ green / ◐ amber / ✕ grey), head-to-head `.fg-vs` cards, migration row (`0.8fr 1.2fr`), CTA, per `Comparisons.dc.html` / `renders/comparisons.png`.
- Parity: absorbs floor Comparison at full depth (decision 4): all 11 rows incl. "PR comment with thumbnail triplet", "Enterprise SSO/SAML", "MCP server"; Frontguard column highlighted; sources traceable to `docs/research.md`.
- Tests: matrix row count (>=11) + per-cell color mapping; vs-card hover; legend present.
- States: vs-card hover border; matrix horizontal scroll on mobile; row hover highlight.
- Responsive: alternatives 4->2->1; matrix scroll/stack; vs-cards 2->1.
- A11y: table `<caption class="sr-only">`, scope on header cells, legend readable by SR.

### t-changelog (parallel wave) — `/changelog`

- Fidelity: hero (h1 48px), 860px timeline, each release `168px 1fr` grid with sticky version meta (version no., status chip, date) + content (title h2 24px, summary, color-coded change groups: ADDED green / CHANGED blue / SECURITY amber / TESTING purple), 3 entries (Unreleased, 0.2.0, 0.1.0) per `Changelog.dc.html` / `renders/changelog.png`.
- Parity: replaces the footer's external `CHANGELOG.md` link with the internal `/changelog` route (decision keeps the link working); content sourced from root `CHANGELOG.md` truthfully.
- Tests: renders 3 releases with correct status tags + group colors; sticky-meta structure present.
- States: static; link hovers; sticky version meta on scroll.
- Responsive: `168px 1fr` collapses to stacked single column on mobile (meta above content).
- A11y: semantic headings per release, time elements for dates, focus-visible.

### t-docs (parallel wave) — `/docs`, `/docs/:page`

- Fidelity: three-column shell (`256px 1fr 224px`), top bar (`frontguard DOCS`, search `⌘K` affordance, home/pricing/github + Star), left sidebar (6 groups, 12 pages from `renderVals.nav`), main content (breadcrumb + h1 42px + body, Introduction page with DETECT/UNDERSTAND callouts + PREREQUISITES amber callout + pipeline list), per-page right TOC, prev/next pager, per `Docs.dc.html` / `renders/docs.png`.
- Parity: this is the in-app docs surface (decision 6). Does not remove `apps/docs`; nav "docs" points here. The 12 pages carry the design's content (CLI, config, Playwright, CI YAML, guides, self-host, validation/results).
- Tests: `go(id)`/route change swaps active page, breadcrumb, TOC, and pager labels; pager disabled at ends (0.4 opacity); active sidebar item styling.
- States: active page (URL-driven), pager disabled end states, hover brighten on sidebar/TOC/cards, smooth scroll for TOC anchors, search affordance (presentational by default; client-side filter optional, recorded if wired).
- Responsive: sidebar -> drawer, TOC hidden, content full width on mobile.
- A11y: sidebar as nav landmark, `aria-current` on active page, TOC links labelled, keyboard-navigable pager, smooth-scroll respects reduced-motion.

### t-brand (parallel wave) — `/brand`

- Fidelity: brand system page per `Brand.dc.html` / `renders/brand.png`: header, h1 52px, 01 THE MARK (shield + construction notes + 3 lockups), 02 COLOR (6 neutral swatches + amber block + 4 statuses), 03 TYPOGRAPHY (Space Grotesk + JetBrains Mono specimens + named scale), 04 VOICE (HONEST/PRECISE/LOWERCASE), 05 MESSAGING (tagline + one-liner + SAY/DON'T).
- Parity: no floor capability is unique to this page; it is NEW. It doubles as the living token reference, validating T-FOUNDATION tokens render correctly.
- Tests: renders all five numbered sections; swatches reflect the foundation tokens; lockup variants render.
- States: `.fg-swatch` hover-lift (`translateY(-3px)`).
- Responsive: swatch/lockup grids collapse; specimens reflow.
- A11y: semantic section headings, color swatches expose hex as text (not color-only), focus-visible.

### t-seo-assets (serial finalize) — `public/*` + cross-route SEO

- Fidelity: reskin `404.html` to the new tokens/brand mark.
- Parity: add all six routes to `sitemap.xml` (with `lastmod`) and to `llms.txt` / `llms-full.txt`; keep `robots.txt` pointing at the sitemap; verify per-route React 19 metadata (title/desc/canonical/OG) on all five new routes; confirm SoftwareApplication JSON-LD (head) and FAQPage JSON-LD (`/pricing`) are present and truthful; verify the prerender/SSG output (or record the CSR tradeoff) so `/pricing`, `/comparisons`, `/changelog`, `/brand`, `/docs` are crawlable; confirm the homepage `#root` fallback (owned by t-landing) is consistent. Floor items 15-17.
- Tests: a build-output check (or unit test of the metadata components) asserting each route emits a unique title + canonical; sitemap contains all routes.
- States: n/a (static assets) beyond 404 render.
- Responsive: 404 page responsive.
- A11y: 404 page has a heading + home link, focus-visible.

## 6. Adjacent-app scope decisions (nothing silently dropped)

- `apps/docs` (`@frontguard/docs`, Next.js + Fumadocs, deploys to docs.frontguard.dev, dev port 3001): KEEP-AS-IS this cycle. It is the system of record for deep documentation (twelve+ real MDX pages with search), far beyond the design's 12-page visual mock. The design's Docs page is built in `apps/landing` at `/docs` as the new-brand docs surface (decision 6); `apps/docs` stays live and functional so the floor's external doc deep links (`/docs/cli`, `/docs/playwright`, `/docs/ci-cd/github-actions`, `/docs/self-host`, `/docs/integrations/mcp`, `/docs/comparison/*`, `/docs/migrate/*`) keep resolving. Follow-up (not in this parity build, flagged so it is not lost): either reskin Fumadocs to the new tokens or consolidate the two docs surfaces. Classification: KEEP / reskin-deferred.
- `apps/demo` (`frontguard-demo`, Next.js): KEEP-AS-IS. It is a demo target application, not part of the marketing design, and has no design coverage. Out of scope to rebuild. The `frontguard-demo.gif` asset it relates to stays available for docs/README; the design hero uses a CSS terminal mock (decision 7). Classification: KEEP / out-of-scope.

Neither app is touched by the parity build; both are recorded here so the build cannot silently drop them.

## 7. "Nothing lost" checklist (floor -> carrying task)

Each of the inventory's ~20 floor capabilities mapped to the task that carries it. If a row has no task, the build is incomplete.

| #  | Floor capability                                                                 | Carrying task                          |
| -- | -------------------------------------------------------------------------------- | -------------------------------------- |
| 1  | All eleven sections render in order with real copy                                | t-landing (+ t-pricing for Pricing/FAQ) |
| 2  | Stable anchor IDs (`#main-content`,`#demo`,`#problem`,`#how-it-works`,`#features`,`#comparison`,`#install`,`#validation`,`#pricing`,`#faq`) | t-foundation (skip target) + t-landing (on-page anchors + legacy-hash redirect shim) + t-pricing (`/pricing#faq`) + t-comparisons (`/comparisons`) |
| 3  | Hero inline demo (GIF + terminal fallback) and `#demo` target                    | t-landing                              |
| 4  | Static SEO `#root` fallback + `<noscript>` for crawlers/no-JS                     | t-landing (homepage fallback) + t-seo-assets (per-route crawlability) |
| 5  | Smooth-scroll in-page nav (Nav/Hero/Pricing/Footer)                              | t-foundation (Nav) + t-landing + t-pricing |
| 6  | Nav scroll-state + mobile hamburger (Escape-close, focus mgmt)                   | t-foundation (Nav)                     |
| 7  | Live GitHub stars fetch (never fabricate, AbortController)                       | t-foundation (Nav button) + t-landing (hero/footer usage) |
| 8  | QuickStart tabs (keyboard a11y) + copy-to-clipboard (execCommand fallback)        | t-landing                              |
| 9  | FAQ accordions (native `<details>` OK)                                           | t-pricing                              |
| 10 | Comparison responsive table<->cards, sticky header/first col                     | t-comparisons (full) + t-landing (summary) |
| 11 | Pricing CTAs to correct hrefs + external-link rel hygiene                         | t-pricing                              |
| 12 | Scroll-reveal animations via `useInView`, degrade under reduced-motion            | t-foundation (hook + reduced-motion) + every page |
| 13 | ErrorBoundary wrapping the app with usable fallback                               | t-foundation (`main.tsx`)              |
| 14 | A11y: skip link, focus-visible, ARIA, alt text, reduced-motion                    | t-foundation (baseline) + every page   |
| 15 | `<head>` title/desc/canonical/theme-color, OG + Twitter, favicons/apple-touch     | t-foundation (head + favicon/OG regen) + t-seo-assets (per-route verify) |
| 16 | Both JSON-LD blocks (SoftwareApplication, FAQPage 8 Qs) truthful + aligned        | t-foundation (SoftwareApplication) + t-pricing (FAQPage) + t-seo-assets (verify) |
| 17 | `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `404.html` served      | t-seo-assets                           |
| 18 | Validation numbers wired to harness; never fabricated; sources stance kept        | t-landing                              |
| 19 | `npm run build` + `npm run lint` green under strict TS; root dev:/build:landing    | t-foundation + every task (+ new `npm test`) |
| 20 | Cloudflare Pages deploy from `apps/landing/dist` keeps producing a static build   | t-foundation (router/SSG/SPA fallback) + t-seo-assets |

All 20 floor capabilities are carried. Cross-cutting helpers (GitHubStars, ErrorBoundary, useInView, skip link) are owned by t-foundation and consumed by the pages, so they are built once and cannot be dropped per-page.

## 8. Summary for the coordinator

One ledger row per slug:

- `t-foundation` (serial gate; blocks everything): tokens + Tailwind theme + shared UI kit + brand mark/fonts/favicon-OG regen + react-router-dom scaffold + responsive utils + a11y baseline + vitest/RTL/jsdom with a passing sample test + `index.html` `<head>`.
- Parallel wave (after t-foundation; disjoint files): `t-landing` (`/`, owns `index.html` `#root` fallback + Validation GAP-FILL), `t-pricing` (`/pricing`, FAQ 8-Q GAP-FILL + FAQPage JSON-LD), `t-comparisons` (`/comparisons`, 11-row GAP-FILL), `t-changelog` (`/changelog`), `t-docs` (`/docs`), `t-brand` (`/brand`).
- Serial finalize (after the wave): `t-seo-assets` (`public/*` sitemap/robots/llms/404 + cross-route metadata + prerender verification).

Out of scope, classified KEEP: `apps/docs` (Fumadocs, reskin deferred), `apps/demo` (Next.js demo target).
