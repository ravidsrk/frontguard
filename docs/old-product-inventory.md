# Old-product inventory: apps/landing (T-A2)

This is the functional floor for the Frontguard landing page as it ships today. It catalogs every section, interactive element, asset, SEO surface, and wired-in data source in `apps/landing` so that nothing is silently lost when the page is reskinned. Anything listed under "The floor" must still work after the reskin, or its removal must be a deliberate, recorded decision.

Audited at branch `ravidsrk/old-product-inventory` (off `origin/main`). Docs only: no source was changed. Section ordering and copy below are quoted verbatim from the source files, including em dashes that exist in the product copy.

## Scope and entry points

Target app: `apps/landing`. Vite + React 19 + Tailwind v4, single-page marketing site for frontguard.dev.

Render path:

- `apps/landing/index.html` — HTML shell. Holds all `<head>` meta/OG/JSON-LD, a full static SEO fallback inside `#root`, a `<noscript>` block, then loads `/src/main.tsx`.
- `src/main.tsx` — mounts React in `StrictMode`, wraps `<App />` in `<ErrorBoundary>`, renders into `#root` (replacing the SEO fallback).
- `src/App.tsx` — composition root. Renders the skip link, `<Nav />`, `<main id="main-content">`, and `<Footer />`.

Section order rendered by `App.tsx`:

1. Nav (fixed header, eager)
2. Hero (eager, wrapped in `<div id="demo">`, contains the inline demo)
3. Problem (lazy)
4. HowItWorks (lazy)
5. Features (lazy)
6. Comparison (lazy)
7. QuickStart (lazy, `id="install"`)
8. Validation (lazy)
9. Pricing (lazy)
10. FAQ (lazy)
11. Footer (lazy, outside `<main>`)

Lazy/Suspense detail: `Nav` and `Hero` are static imports (above the fold). Everything from `Problem` through `FAQ` is `React.lazy` under one `<Suspense>` inside `<main>`; `Footer` is `React.lazy` under a second `<Suspense>` outside `<main>`. The Suspense fallback is `SectionSkeleton` — a centered spinning ring (`min-h-[40vh]`, `border-t-accent animate-spin`).

## Tech stack, build, deploy

| Concern        | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Framework      | React 19.2 + react-dom 19.2, TypeScript ~5.9, Vite ^8                                           |
| Styling        | Tailwind v4 via `@tailwindcss/vite`; single `src/index.css` with `@import "tailwindcss"`       |
| Plugins        | `@vitejs/plugin-react`, `@tailwindcss/vite` (see `vite.config.ts`)                              |
| Lint           | ESLint 9 flat config (`eslint.config.js`): js recommended, typescript-eslint, react-hooks, react-refresh; ignores `dist` |
| TS build       | `tsc -b` over `tsconfig.app.json` (strict, noUnusedLocals/Params, ES2023, DOM libs) + `tsconfig.node.json` |
| Package name   | `@frontguard/landing`, private, version `0.0.0`, MIT                                           |
| Fonts          | Google Fonts: Outfit (display), Plus Jakarta Sans (body), JetBrains Mono (mono); preconnect + two stylesheet links in `index.html` |

Commands that must keep passing (the task's hard requirement):

| Command                                            | Where        | What it does                                      |
| -------------------------------------------------- | ------------ | ------------------------------------------------- |
| `npm run dev`                                       | apps/landing | `vite` dev server                                 |
| `npm run build`                                     | apps/landing | `tsc -b && vite build` (typecheck then bundle)    |
| `npm run lint`                                      | apps/landing | `eslint .`                                         |
| `npm run preview`                                   | apps/landing | `vite preview` of the built `dist`                |
| `npm run dev:landing`                               | repo root    | `npm run dev --workspace=apps/landing`            |
| `npm run build:landing`                             | repo root    | `npm run build --workspace=apps/landing`          |

No test framework is wired for the landing. `apps/landing/package.json` has no `test` script, so the root `npm test` (`npm run test --workspaces --if-present`) skips it. Root CI (`.github/workflows/ci.yml`) runs `npm run build`, `npm run lint`, `npm run typecheck`, and `npm test` across workspaces — the landing participates in build/lint/typecheck only. The landing build must therefore stay green under `tsc -b` (strict mode) and `eslint .`.

Deploy: `.github/workflows/deploy-landing.yml` triggers on push to `main` touching `apps/landing/**` (or manual dispatch). It runs `npm ci`, `npm run build --workspace=apps/landing`, then `cloudflare/wrangler-action@v3` → `pages deploy apps/landing/dist --project-name=frontguard --branch=main`. The active production target is Cloudflare Pages. A `fly.toml` also exists in `apps/landing` (app `frontguard`, region `iad`, internal port 8080, force_https, 256mb shared VM) but no workflow references it; treat it as a legacy/alternate config, not the live path. Public homepage in root `package.json` is `https://frontguard.dev`.

## Design tokens (src/index.css `@theme`)

These CSS variables back every component via `var(--…)`. The reskin will likely redefine them; listing so the contract is explicit.

| Token                       | Value                              | Use                                  |
| --------------------------- | ---------------------------------- | ------------------------------------ |
| `--color-bg`                | `#06080c`                          | page background, also `theme-color`  |
| `--color-bg-elevated`       | `#0c1018`                          | terminal/code surfaces, tab bar      |
| `--color-bg-card`           | `#111827`                          | cards                                |
| `--color-bg-card-hover`     | `#1a2332`                          | card hover                           |
| `--color-border`            | `#1e293b`                          | borders, section dividers            |
| `--color-border-bright`     | `#334155`                          | hover/active borders                 |
| `--color-accent`            | `#22d3ee` (cyan)                   | brand accent, links, focus ring      |
| `--color-accent-dim`        | `#0891b2`                          | —                                    |
| `--color-accent-glow`       | `rgba(34,211,238,0.15)`            | —                                    |
| `--color-cta`               | `#f97316` (orange)                 | Install/primary CTAs                 |
| `--color-cta-hover`         | `#fb923c`                          | CTA hover                            |
| `--color-danger`            | `#ef4444`                          | regression red                       |
| `--color-success`           | `#22c55e`                          | pass green                           |
| `--color-text`              | `#f1f5f9`                          | primary text                         |
| `--color-text-secondary`    | `#cbd5e1`                          | body                                 |
| `--color-text-muted`        | `#94a3b8`                          | muted                                |
| `--color-text-dim`          | `#768BA2`                          | eyebrows, footers                    |
| `--font-display`            | `"Outfit", system-ui, sans-serif` | headings                             |
| `--font-body`               | `"Plus Jakarta Sans", system-ui`  | body                                 |
| `--font-mono`               | `"JetBrains Mono", "Fira Code"`   | code, eyebrows, logo wordmark        |

Global CSS behaviors in `index.css` that the reskin should consciously keep or replace:

- `html { scroll-behavior: smooth; overflow-x: hidden }` — smooth anchor scrolling for all `#…` nav links.
- Grain overlay: `body::before` fixed full-screen SVG fractal-noise at `opacity: 0.03`, `z-index: 9999`, `pointer-events: none`.
- Custom 6px webkit scrollbar; cyan `::selection`; global `*:focus-visible` cyan outline (2px, offset 2px).
- Keyframes: `fadeUp`, `fadeIn`, `fadeInLeft`, `fadeInRight`, `fadeInFromRight` with matching `.animate-*` classes (all start at `opacity: 0`).
- `.comparison-row` hover highlight (cyan tint on the Frontguard column).
- `.pricing-popular` animated rotating gradient border (mask-composite) for the highlighted Pro card, 4s loop.
- `@media (prefers-reduced-motion: reduce)` neutralizes all animation/transition durations and disables smooth scroll. This is an accessibility floor.

## Per-component status table

Status legend: Live = renders real product content; all sections are live (none are placeholder). "Data source" notes where copy/data lives.

| Component         | File                        | Renders                                                                 | Data source                                  | States handled                                                                 |
| ----------------- | --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Nav               | `components/Nav.tsx`        | Fixed top header: logo+wordmark, 5 desktop links, GitHubStars, Install CTA, mobile hamburger + menu | inline `navLinks` array                      | scrolled (bg/blur after 20px), mobileOpen (toggle), Escape-to-close, focus-first-link, responsive (lg breakpoint), hover |
| GitHubStars       | `components/GitHubStars.tsx`| "Star on GitHub" link with live star count badge                        | GitHub REST API `repos/ravidsrk/frontguard`  | loading/null (label only), success (formatted count, `k` over 1000), error/offline (silent fallback to label), abort on unmount, hover |
| Hero              | `components/Hero.tsx`       | Left: badge, h1, two paragraphs, Install + See it work + GitHubStars. Right: demo panel (GIF or terminal mock) | inline `terminalLines` array; GIF path const | demoAvailable (GIF) vs onError fallback to animated terminal mock; staggered fade animations; responsive grid (5/7 cols at lg) |
| Problem           | `components/Problem.tsx`    | 3 failure-mode cards with eyebrow/title/body/source                     | inline `failures` array (3)                  | useInView fade-up (once), staggered delays, hover border, opacity-0 before in-view |
| HowItWorks        | `components/HowItWorks.tsx` | 3 pillar cards (Detect/Understand/Fix) each with an inline code/illustration | inline `pillars` array (3) + 3 illo components | useInView fade-up, staggered, hover border                                     |
| Features          | `components/Features.tsx`   | 6 feature cards, each with a syntax-tinted code snippet                 | inline `features` array (6)                  | useInView fade-up, staggered, hover border+bg; responsive 1/2/3 cols           |
| Comparison        | `components/Comparison.tsx` | Feature matrix vs Percy/Chromatic/Argos: desktop sticky table + mobile cards | inline `rows` (11) + `competitors` (4)       | useInView fade-up; responsive table↔cards at md; sticky first column; row hover highlight; horizontal scroll |
| QuickStart        | `components/QuickStart.tsx` | Tabbed install (CLI / Playwright plugin / GitHub Action) with copy buttons | inline `tabs` array (3)                       | active tab, full ARIA tablist + arrow/Home/End keyboard nav, copy-to-clipboard with 2s "Copied" + execCommand fallback, useInView |
| Validation        | `components/Validation.tsx` | 4 headline stats + a 5-repo results table + methodology links          | inline `data` object, generated from validation harness | useInView; conditional skip rows; AI "Pending"/"Measured"; pct() formatting; horizontal scroll |
| Pricing           | `components/Pricing.tsx`    | 3 tiers (Free CLI / Pro / Enterprise) with feature checklists + CTAs    | inline `tiers` array (3)                      | useInView; highlighted Pro card with animated gradient border + "Most teams pick this" badge; hover; external/mailto CTA handling |
| FAQ               | `components/FAQ.tsx`        | 8 questions as native `<details>` accordions                            | inline `faqs` array (8)                       | open/closed (native), chevron rotate on open, useInView, hover                 |
| Footer            | `components/Footer.tsx`     | Logo + tagline + GitHub/X social, 4 link columns, copyright bar         | inline `footerColumns` array (4)             | dynamic copyright year `new Date().getFullYear()`; external link handling; responsive grid |
| ErrorBoundary     | `components/ErrorBoundary.tsx` | Class component; catches render errors                               | n/a                                          | hasError → "Something went wrong" + Refresh Page button; logs to console; optional `fallback` prop |
| useInView         | `hooks/useInView.ts`        | IntersectionObserver hook returning `{ref, inView}`                     | n/a                                          | default `rootMargin: -80px`, fires once by default then disconnects            |
| App / SectionSkeleton | `App.tsx`               | Skip link, layout, Suspense fallback spinner                            | n/a                                          | Suspense loading spinner                                                       |

## Verbatim section content

### Nav

Logo links to `/`, shows `/logo-48.png` (28×28, `aria-hidden`) plus wordmark `frontguard` in mono cyan. Desktop nav links (`navLinks`):

- How it works → `#how-it-works`
- Features → `#features`
- Compare → `#comparison`
- Pricing → `#pricing`
- Docs → `https://docs.frontguard.dev` (opens new tab)

Plus `<GitHubStars />` and an Install button → `#install`. Mobile (under `lg`): hamburger button toggles a collapsible menu containing the same links, GitHubStars (full width), and Install. ARIA: `aria-label`, `aria-expanded`, `aria-controls="mobile-menu"`; Escape closes and returns focus to the button; first link focused on open. Header gains border + `bg/95 backdrop-blur` after 20px scroll.

### Hero

Badge: "Open source · MIT · BYO AI key" (with a green dot).

H1: "Visual bugs ship past every other test. Frontguard catches them." ("Frontguard catches them." in cyan.)

Paragraph 1: "AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production."

Paragraph 2: "Anti-flake consensus, AI classification, sandbox-verified fixes. Runs in your CI on your own OpenAI or Anthropic key — screenshots never touch a Frontguard server."

CTAs: Install (→ `#install`, with arrow icon), See it work (→ `#demo`), GitHubStars.

Demo panel: window chrome (red/yellow/green dots + `frontguard run` label). Primary content is `/demo/frontguard-demo.gif` (alt text describes a /checkout regression, AI explanation, sandbox-verified CSS fix; `loading="eager"`, 1200×700). On image `onError`, falls back to an animated terminal mock built from `terminalLines` (14 lines), color-coded by type (command/success/warning/danger/ai/fix/patchRemove/patchAdd), each line fading in on a stagger (`500 + i*60` ms). The terminal mock content:

```
$ npx frontguard run --url https://myapp.com

✔ Discovering routes — 8 route(s) found
✔ Rendering — 24 screenshots · 3 viewports · 3 browsers
✔ Anti-flake consensus — 2/3 captures match (drop 1 flake)
✘ Comparing — 1 regression detected

  /checkout @ 375px chromium — 4.2% diff
  AI: submit button overflows the flex container; padding
       jumped from 16px → 24px in Button.module.css:42.

  Suggested fix (sandbox-verified):
  - padding: 24px;
  + padding: 16px;
```

### Problem (`#problem`)

Eyebrow: "Why pixel diffs alone fail". Heading: "The visual-regression space, mid-2026." Sub: "Three concrete failure modes a paying team hits when they reach for an existing tool. Every claim cites a source — no invented stats."

Three cards:

1. "01 — The OSS exit" / "Lost Pixel sunset; the OSS path narrowed." Source: `lost-pixel.com · github.com/lost-pixel/lost-pixel (archived 2026-04-22)`.
2. "02 — Playwright cross-OS flake" / "Playwright's own docs warn rendering differs by OS." Source: `playwright.dev/docs/test-snapshots`.
3. "03 — The Percy / Chromatic cliff" / "Cross the free tier; price jumps an order of magnitude." Source: `chromatic.com/pricing · argos-ci.com/pricing`. (Body cites $179/mo Chromatic Starter; $510/mo vs $8,999/mo Argos vs Percy at 100K snapshots.)

### HowItWorks (`#how-it-works`)

Eyebrow "How it works". Heading: "Detect. Understand. Fix." ("Fix." cyan.) Three pillars, each with a small inline illustration:

1. 01 Detect — "Anti-flake consensus + SSIM." Illustration `ConsensusIllo` (run1/run2 match, run3 flake struck through).
2. 02 Understand — "AI classifies what changed." Illustration `ClassifyIllo` (JSON: category "layout", confidence 0.91, cause "padding 16→24px in Button.module.css:42").
3. 03 Fix — "Sandbox-verified patch." Illustration `PatchIllo` (diff `- padding: 24px` / `+ padding: 16px`, "re-render: ✔ diff cleared").

### Features (`#features`)

Eyebrow "What's in the box". Heading: "Six features built for the problems pixel diffs can't solve." Six cards, each with a fake-file code snippet:

1. Anti-flake consensus — "Three captures, majority wins." (`frontguard.config.ts`)
2. AI classification — "Tells you why, not just where." (`regression-report.md`)
3. Sandbox-verified fixes — "We don't ship a fix unless we tried it." (`Button.module.css`)
4. Plugin architecture — "6 lifecycle hooks, real plugins included." (`plugins.ts`; lists onDiscover/onBeforeCapture/onAfterCapture/onBeforeDiff/onAfterDiff/onReport)
5. CI-native — "GitHub Action + PR comment, no signup." (`.github/workflows/visual.yml`)
6. Self-hostable — "MIT. The cloud is optional." (`docker-compose.yml`)

### Comparison (`#comparison`)

Eyebrow "Vs Percy / Chromatic / Argos". Heading: "How Frontguard stacks up." Sub cites `docs/research.md` for sources (link to GitHub blob). The React `Comparison` component (`rows` array) renders 11 rows × 4 vendors (Frontguard highlighted): Free tier, Paid entry tier, Snapshot overage, AI diff explanation, Sandbox-verified fixes, Self-host, Storybook integration, MCP server for in-IDE agents, PR comment with thumbnail triplet, Cross-OS render normalisation, Enterprise SSO/SAML. Desktop = sticky-header/sticky-first-column scrollable `<table>` with `<caption class="sr-only">`; mobile = stacked `<dl>` cards.

Row-count discrepancy with the static fallback: the `index.html` SEO-fallback comparison table is shorter — it has 9 `<tr>` data rows, not 11. It omits "PR comment with thumbnail triplet" and "Enterprise SSO/SAML", and labels two rows differently ("Paid entry" vs "Paid entry tier", "MCP server" vs "MCP server for in-IDE agents"). So crawlers/no-JS see 9 of the 11 comparison rows. This is a floor item to flag: the reskin should either keep both representations or consciously reconcile them, not silently inherit the shorter fallback.

### QuickStart (`#install`)

Eyebrow "Quick start". Heading: "Install in 30 seconds, three ways." Sub: "One CLI package, three integration paths. Pick the one that matches your stack." Three tabs:

- CLI: `npm install @frontguard/cli` / `npx frontguard init` / `npx frontguard run --url http://localhost:3000`
- Playwright plugin: `npm install -D @frontguard/cli @frontguard/playwright` + a `tests/checkout.spec.ts` using `visualTest`
- GitHub Action: `.github/workflows/visual.yml` snippet pinned to `ravidsrk/frontguard@v1`

Each tab's code block has its own copy button. Footer link: "Full reference in the documentation" → `https://docs.frontguard.dev`.

### Validation (`#validation`)

Eyebrow "Validation results". Heading: "We point Frontguard at real open-source frontends — and publish what we measured." Methodology paragraph cites run date `2026-06-16` and CLI `0.2.0`. Four stat tiles + a results table over 5 repos + a methodology footnote linking `validation/results-v0.2.md` and `validation/repos.json`. (Numbers in the data-source section below.)

### Pricing (`#pricing`)

Eyebrow "Pricing". Heading: "Free CLI forever. Cloud when you need a team." Three tiers:

- Free CLI — $0 forever. CTA "Install the CLI" → `#install`. 6 features.
- Pro — $29 per user / month (highlighted, "Most teams pick this"). CTA "Start free trial" → `https://app.frontguard.dev/signup`. 6 features.
- Enterprise — Custom annual. CTA "Talk to us" → `mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard`. 6 features.

### FAQ (`#faq`)

Eyebrow "FAQ". Heading: "Eight questions, eight straight answers." Eight `<details>` accordions:

1. How do I install Frontguard?
2. How does Frontguard handle cross-OS rendering differences?
3. Can I self-host the cloud?
4. What environment variables does Frontguard read?
5. OpenAI or Anthropic — which should I use?
6. Does Frontguard work with Storybook?
7. Is there an MCP server for in-IDE agents?
8. What's the data retention policy for screenshots? (answer links `docs/retention.md`)

Relationship to the `index.html` FAQPage JSON-LD: the JSON-LD lists the same 8 questions in the same order, but it is not a verbatim copy. Question 8's wording differs — JSON-LD says "What is the data retention policy for screenshots?" while the React component says "What's the data retention policy for screenshots?". The JSON-LD answers are condensed paraphrases of the React answers: they drop the inline doc link (`docs/retention.md`), the `DELETE /v1/teams/:id/data` example, and several parentheticals (e.g. "your key, your account"; "Anthropic's"/"OpenAI's"; the a11y-fused-prompt note), and the install answer is reworded ("Run npm install … to install the engine, then …" vs "npm install … installs the engine. Run …"). Note: the source comment above that JSON-LD block claims the answers "mirror the React FAQ component verbatim" — that comment overstates it; the two are aligned in substance and topic order but not verbatim. The same condensed answers and the "What is" wording also appear in the static SEO-fallback `<section id="faq">`. Reskin should keep the question set and substance aligned across React, JSON-LD, and the fallback.

### Footer

Logo + wordmark + tagline "AI-powered frontend visual regression testing for web teams. Open source under the MIT License." Social: GitHub (`github.com/ravidsrk`) and X (`x.com/ravidsrk`). Four link columns:

- Product: Features, Comparison, Pricing, FAQ (in-page anchors)
- Docs: Documentation, CLI reference, Playwright plugin, GitHub Actions, Self-host, MCP server, GitHub, Contributing (all external)
- Compare: vs Percy, vs Chromatic, vs Argos, Migrate from BackstopJS, Migrate from Lost Pixel (all external docs)
- Project: GitHub, Changelog, Contributing, MIT License, Validation results (all external)

Bottom bar: `© {current year} Frontguard. Open source under the MIT License.` and "Built by @ravidsrk. No fabricated stats on this page — sources in docs/research.md."

## Interactive element catalog

| Element                        | Where                | Behavior / target                                                                                  |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------- |
| Skip to main content link      | App.tsx              | `sr-only` until focused; jumps to `#main-content`. Accessibility floor.                            |
| Smooth-scroll anchor nav        | Nav, Hero, Pricing, Footer | All in-page `#…` links rely on `html { scroll-behavior: smooth }`. Targets: `#how-it-works`, `#features`, `#comparison`, `#install`, `#pricing`, `#faq`, `#demo`, `#problem`, `#validation`. |
| Nav scroll state               | Nav.tsx              | `scroll` listener (passive) flips `scrolled` at >20px → adds border + translucent blurred bg.       |
| Mobile menu                    | Nav.tsx              | Hamburger toggles menu; Escape closes + restores focus; first link auto-focused; closes on link tap. |
| GitHub stars fetch             | GitHubStars.tsx      | `fetch('https://api.github.com/repos/ravidsrk/frontguard')`; reads `stargazers_count`; AbortController on unmount; never shows a fake number. |
| Hero demo image fallback        | Hero.tsx             | `<img onError>` swaps GIF for animated terminal mock so the panel is never empty.                  |
| Hero CTAs                      | Hero.tsx             | Install → `#install`; See it work → `#demo`; GitHubStars → repo (new tab).                          |
| Scroll-reveal animations       | all section components | `useInView` (IntersectionObserver, `-80px` margin, once) toggles `animate-fade-up` vs `opacity-0`, with per-card staggered `animationDelay`. |
| Comparison responsive swap      | Comparison.tsx       | `<table>` on `md+` (sticky header + first col, hover row highlight, horizontal scroll); `<dl>` cards below md. |
| QuickStart tabs                | QuickStart.tsx       | `role="tablist"`; click + ArrowLeft/ArrowRight/Home/End keyboard nav; roving `tabindex`; `aria-selected`/`aria-controls`; panels use `hidden`. |
| Copy-to-clipboard              | QuickStart.tsx       | `navigator.clipboard.writeText`; on failure, hidden-textarea + `document.execCommand('copy')` fallback; "Copied" for 2s; `aria-live="polite"`. |
| FAQ accordions                 | FAQ.tsx              | Native `<details>/<summary>`; chevron rotates 180° on open; webkit marker hidden.                  |
| Pricing CTAs                   | Pricing.tsx          | Free → `#install`; Pro → external signup (new tab); Enterprise → `mailto:`. `http`/`mailto` get `target=_blank rel=noopener noreferrer`. |
| Pricing highlighted card        | Pricing.tsx + CSS    | Animated rotating gradient border + "Most teams pick this" badge on Pro.                            |
| External link hygiene          | Nav, Footer, Pricing, etc. | Every `http(s)` link opens in a new tab with `rel="noopener noreferrer"`.                      |
| ErrorBoundary                  | main.tsx             | Catches render errors anywhere under `<App />`; shows fallback + Refresh button; `console.error` with component stack. |
| Reduced-motion support          | index.css            | `prefers-reduced-motion: reduce` kills animations/transitions and smooth scroll.                   |

External link inventory (all `target=_blank rel=noopener noreferrer` unless noted):

- GitHub repo: `https://github.com/ravidsrk/frontguard` (Nav stars, Hero stars, Footer ×2)
- npm CLI: `https://www.npmjs.com/package/@frontguard/cli` (SEO/llms only on page; not in React nav)
- Docs root: `https://docs.frontguard.dev` (Nav, QuickStart, Footer)
- Docs deep links (Footer): `/docs/cli`, `/docs/playwright`, `/docs/ci-cd/github-actions`, `/docs/self-host`, `/docs/integrations/mcp`, `/docs/comparison/{percy,chromatic,argos}`, `/docs/migrate/{backstopjs,lost-pixel}`
- App signup: `https://app.frontguard.dev/signup` (Pricing Pro)
- Enterprise mail: `mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard` (Pricing)
- Author socials: `https://github.com/ravidsrk`, `https://x.com/ravidsrk` (Footer)
- GitHub blobs: `docs/research.md` (Comparison + Footer), `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `validation/results-v0.2.md`, `validation/repos.json`, `docs/retention.md` (FAQ)

## Asset catalog

Referenced assets (must remain available at these paths or be re-pointed):

| Asset                          | Path                                   | Referenced from                                  |
| ------------------------------ | -------------------------------------- | ------------------------------------------------ |
| Demo GIF                       | `public/demo/frontguard-demo.gif` (744 KB) | Hero.tsx (`DEMO_GIF = '/demo/frontguard-demo.gif'`) |
| Logo 48                        | `public/logo-48.png`                   | Nav.tsx, Footer.tsx (`/logo-48.png`)             |
| Favicon                        | `public/favicon.ico`                   | index.html `<link rel="icon">`                   |
| Logo 32 / 16                   | `public/logo-32.png`, `public/logo-16.png` | index.html PNG favicons                       |
| Apple touch icon               | `public/logo-180.png`                  | index.html `apple-touch-icon`                    |
| OG image                       | `public/og-image.png` (1200×630)       | index.html `og:image` + `twitter:image`          |
| robots.txt                     | `public/robots.txt`                    | served at `/robots.txt`; points to sitemap       |
| sitemap.xml                    | `public/sitemap.xml`                   | referenced by robots.txt; 15 URLs (frontguard.dev + docs pages, lastmod 2026-06-14) |
| llms.txt / llms-full.txt       | `public/llms.txt`, `public/llms-full.txt` | served at root for LLM crawlers                |
| 404.html                       | `public/404.html`                      | Cloudflare Pages 404 fallback                    |

Present-but-unreferenced assets (kept in repo; reskin can prune or repurpose, but confirm before deleting):

- `public/` logo variants not wired anywhere: `logo-64.{png,webp}`, `logo-128.{png,webp}`, `logo-192.{png,webp}`, `logo.{png,webp}`, and all `.webp` variants of the used sizes (`logo-16/32/48/180.webp`). Only the `.png` at 16/32/48/180 and `og-image.png`/`favicon.ico` are referenced. There is no `manifest.json`/PWA manifest, so `logo-192` is currently orphaned.
- `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg` — leftover Vite scaffold assets, imported by nothing. `apps/landing/README.md` is the stock Vite+React template readme, not product docs.

## SEO and meta catalog (index.html)

`<head>`:

- `<title>`: "Frontguard — AI-powered visual regression testing"
- `description`: "AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production. Open source CLI under MIT, Pro cloud at $29/mo."
- `theme-color`: `#06080c`
- Favicons: `.ico` + 32/16 PNG + 180 apple-touch-icon
- Open Graph: `og:type=website`, `og:title`, `og:description`, `og:url=https://frontguard.dev`, `og:image=https://frontguard.dev/og-image.png` (1200×630), `og:site_name=Frontguard`
- Twitter: `summary_large_image`, `twitter:site/creator=@ravidsrk`, title, description, image
- `author=Ravindra Kumar`; `keywords` (visual regression testing, AI visual testing, Playwright, Storybook, etc.)
- `<link rel="canonical" href="https://frontguard.dev">`
- Security: `X-Content-Type-Options: nosniff`, `referrer: strict-origin-when-cross-origin`
- Fonts: preconnect to googleapis/gstatic + two stylesheet links (Outfit; Plus Jakarta Sans + JetBrains Mono)

Structured data (two JSON-LD blocks):

- `SoftwareApplication` — DeveloperApplication/Testing Tool; url, MIT license, npm downloadUrl, author (Ravindra Kumar / github.com/ravidsrk), codeRepository, and two `offers` (Free CLI $0, Pro $29). Comment explicitly notes: no fabricated review-rating block until real measured numbers exist.
- `FAQPage` — the same 8 questions as the React FAQ, in the same order, but the `acceptedAnswer.text` values are condensed paraphrases (not verbatim) and question 8 reads "What is …" vs the React "What's …". The block's own source comment claims the answers "mirror the React FAQ component verbatim"; that overstates it (see the FAQ section above for the exact differences). Keep the question set and substance aligned on reskin.

SEO fallback inside `#root`: a self-styled static HTML version of the page that includes every section (nav, hero, problem, how-it-works, features, comparison table, install code blocks, validation, pricing grid, FAQ, footer + sitemap). It mirrors the sections, but not always row-for-row or word-for-word: the comparison table carries 9 of the 11 React rows (see Comparison section), and the FAQ uses the condensed JSON-LD-style answers. React overwrites it on mount. It uses inline `<style>` with the same palette. This is the crawler-visible content and the no-JS experience baseline. There is also a `<noscript>` block with a minimal links list.

Note: the SEO fallback's Validation section names the five validation repos by their upstream GitHub identity ("shadcn-ui taxonomy, shadcn-ui next-template, chakra-ui-docs, medusajs storefront, and shuding nextra") and says accuracy is gated on ">= 70% / FPR < 15%" with "no accuracy number ships until that run lands". The live React `Validation` component instead shows the measured pixel-only run (see below) and uses the friendly repo names. Both describe the same five repos; the fallback copy is the older "coming soon" framing. Reskin should reconcile the fallback to match the live component.

## Data-source notes (real numbers wired in)

These are the only places real, non-decorative data flows in. Preserve the wiring.

GitHub stars (GitHubStars.tsx): live fetch of `stargazers_count` from `https://api.github.com/repos/ravidsrk/frontguard`. Formatted as `n.toLocaleString()` under 1000, `X.Xk` at/above 1000. No number is ever fabricated; loading/error states show only the "Star on GitHub" label. Repo constant `REPO = 'ravidsrk/frontguard'`.

Validation numbers (Validation.tsx): the `data` object is hardcoded in the component but generated from the validation harness. Header comment: "Generated from validation/results-v0.2.md — re-run `node validation/aggregate-results.mjs --landing` after a fresh harness to refresh these numbers. Source of truth: validation/results/*.json." Current values:

- runDate `2026-06-16`, cliVersion `0.2.0`, aiEnabled `false`
- aggregate: reposAttempted 5, reposBooted 2, reposSkipped 3, recheckRouteCount 43, recheckPositiveCount 0, pixelFalsePositiveRate 0
- Stat tiles: "0.0%" pixel false-positive rate; "2/5" repos booted end-to-end; "43" route×viewport×browser checks; AI accuracy "Pending" (aiEnabled false)
- Per-repo table:
  - `tailwind-dashboard` (Tailwind dashboard) — booted yes, recheck pass 18, FP 0
  - `chakra-ui-docs` (Component library docs) — booted yes, recheck pass 21, FP 0
  - `taxonomy` (Next.js app) — skipped: "next 13.3.2-canary dev server crashed on Node 22"
  - `medusa-storefront` (E-commerce storefront) — skipped: "requires a running Medusa backend + publishable API key"
  - `nextra-docs` (Docs site) — skipped: "monorepo dev server did not bind a port within 120 s"

Supporting validation files that exist in-repo and back these numbers: `validation/results-v0.2.md`, `validation/repos.json` (5 repos: shadcn-ui/taxonomy, shadcn-ui/next-template, chakra-ui/chakra-ui-docs, medusajs/nextjs-starter-medusa, shuding/nextra), `validation/aggregate-results.mjs`, `validation/results/` (per-repo JSON), `validation/run-external.sh`, `validation/README.md`. The methodology link `validation/results-v0.2.md` is reachable from both the Validation section and the Footer.

Other "real" content that is copy, not live data, but cites sources: Problem cards (Lost Pixel archived 2026-04-22; Playwright OS-render note; Chromatic $179/mo; Argos $510 vs Percy $8,999 at 100K snapshots), the full Comparison matrix, and pricing ($0 / $29 / Custom). These all trace to `docs/research.md` per the on-page attributions. No invented review/rating data anywhere.

## The floor: capabilities that must survive the reskin

Structure and content:

1. All eleven sections render, in order, with their real copy: Nav, Hero (+ inline demo), Problem, HowItWorks, Features, Comparison, QuickStart/Install, Validation, Pricing, FAQ, Footer.
2. Section anchor IDs stay stable so existing links keep working: `#main-content`, `#demo`, `#problem`, `#how-it-works`, `#features`, `#comparison`, `#install`, `#validation`, `#pricing`, `#faq`.
3. The Hero inline demo (GIF with terminal-mock fallback) and the `#demo` target remain.
4. The static SEO fallback in `index.html` keeps a static version of every section for crawlers and no-JS, and the `<noscript>` block stays. (It is not row-for-row identical to React today — the fallback comparison table has 9 of 11 rows and the FAQ uses condensed answers; preserve at least this coverage, and ideally reconcile the gaps.)

Interactivity:

5. Smooth-scroll in-page navigation from Nav/Hero/Pricing/Footer.
6. Nav scroll-state styling, mobile hamburger menu with Escape-close and focus management.
7. Live GitHub stars fetch with the "never fabricate, fall back to label" behavior and AbortController cleanup.
8. QuickStart tab switcher with full keyboard support and copy-to-clipboard (incl. execCommand fallback and "Copied" feedback).
9. FAQ accordions (native `<details>` is fine to keep).
10. Comparison desktop-table / mobile-card responsive swap with sticky header/first column.
11. Pricing CTAs to the correct hrefs (install anchor, external signup, mailto enterprise) and external-link `rel` hygiene.
12. Scroll-reveal animations driven by `useInView` (or an equivalent), degrading under `prefers-reduced-motion`.
13. ErrorBoundary wrapping the app with a usable fallback.

Accessibility:

14. Skip-to-content link, `*:focus-visible` outline, ARIA on nav/tabs/accordions/comparison caption, alt text on the demo image, `prefers-reduced-motion` honored.

SEO/meta:

15. `<head>` title/description/canonical/theme-color, Open Graph + Twitter cards (incl. `og-image.png` 1200×630), favicons/apple-touch-icon.
16. Both JSON-LD blocks (`SoftwareApplication` offers, `FAQPage` covering the same 8 FAQ questions), kept truthful and aligned in substance with on-page content (the FAQPage answers are condensed paraphrases today, not verbatim).
17. `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, `404.html` continue to be served.

Data integrity:

18. Validation numbers stay wired to the harness (`validation/aggregate-results.mjs --landing` regeneration path) and never get replaced with fabricated values; the "no fabricated stats / sources in docs/research.md" stance is preserved.

Build/deploy:

19. `npm run build` (`tsc -b && vite build`) and `npm run lint` (`eslint .`) in `apps/landing` stay green under strict TS; root `dev:landing` / `build:landing` keep working.
20. The Cloudflare Pages deploy (`apps/landing/dist`) keeps producing a deployable static build.

## Known issues / cleanup opportunities (mention only, not in scope to fix)

- `apps/landing/README.md` is the stock Vite template readme, not product documentation.
- `src/assets/{hero.png,react.svg,vite.svg}` are unused scaffold leftovers.
- Many `public/logo-*` variants (all `.webp`, plus `logo-64/128/192/logo.png`) are unreferenced; `logo-192` implies a PWA manifest that does not exist.
- `fly.toml` is present but no workflow deploys via Fly; the live path is Cloudflare Pages.
- The SEO-fallback Validation copy ("coming soon", gated thresholds) lags the live React Validation component (which shows the measured pixel-only run). Reconcile during the reskin.
- The `index.html` SEO-fallback comparison table has 9 data rows vs the React component's 11 (missing "PR comment with thumbnail triplet" and "Enterprise SSO/SAML"); crawlers/no-JS see the shorter table.
- The FAQPage JSON-LD answers are condensed paraphrases of the React FAQ, and question 8 differs in wording ("What is" vs "What's"), yet the JSON-LD's own source comment claims they "mirror the React FAQ component verbatim". Aligned in substance, not verbatim.
