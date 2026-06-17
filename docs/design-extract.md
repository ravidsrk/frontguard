# Frontguard landing design extract

This is the authoritative extract of the new Frontguard Claude Design. It is the visual and UX source of truth for the `apps/landing` rebuild (Vite + React 19 + Tailwind v4). Every token, screen, section, state, component, and asset the design specifies is captured here. Concrete values are given so the build can be ported without re-opening the design tool.

## Source and provenance

Design project: "Frontguard branding project" on claude.ai/design, owned by ravidsrk@gmail.com.

Share URL given for the task: `https://api.anthropic.com/v1/design/h/VkbdVOQA-U2IvqCAq-D93g?open_file=Landing.dc.html`. That share handle decodes to project UUID `5646dd54-e400-f94d-88be-a080abe0fdde`, which is not reachable as a download; the live project UUID is `1672c1a0-ad29-455b-8025-5d38a1d1728e`. The export was pulled file-by-file through the authenticated design API (`POST /v1/design/projects/{id}/files/get`) using the Claude Code OAuth token (`user:design:read` scope), since the `/download` and `h/` ZIP routes return 404/401 for this account. Plain `curl`, `WebFetch`, and a headless claude.ai session all fail (Cloudflare challenge / OAuth-only endpoint), so this is documented for whoever re-syncs later.

There is no README in the export. The design tool ships no separate instructions file. `Brand.dc.html` is the de-facto brand guide and was treated as authoritative for tokens, voice, and the mark. The exact authored source for all six pages plus the runtime is committed under `docs/design-extract/source/`, and full-page reference renders under `docs/design-extract/renders/`.

File format note: pages are `.dc.html` (Claude "Design Component" HTML). They use a small client runtime (`support.js`, the `dc-runtime`) that provides custom elements `x-dc`, `sc-for` (list repeat), `sc-if` (conditional), `{{ }}` bindings, and a `DCLogic` component class whose `renderVals()` returns the page data. All visual styling is inline `style="..."` plus one `<style>` block per page for hover/animation rules. The build should not port the runtime; it should reimplement these pages as React components and read the inline styles and the `renderVals()` data as the spec.

## Design language

Terminal-native, mono-forward identity for an open-source developer tool. Warm near-black canvas, warm-grey ink, a single amber accent, four signal colors borrowed from CLI output. Sharp corners everywhere (no border radius), 1px hairline borders, no rounded cards, no soft shadows except a few deep drop shadows behind "floating" panels. Lowercase wordmark and commands. The aesthetic reads as a CLI and a PR comment, not a SaaS dashboard.

Three product pillars the copy returns to: Detect, Understand, Fix. Positioning: catches the regression, not the noise (AI classifies each visual diff as regression / intentional / content). Trust framing: MIT, self-hostable, bring-your-own-key, real published numbers.

## Color tokens

Named neutrals (from the Brand page, "canvas and ink, warm neutrals"):

| token   | hex      | role                                          |
|---------|----------|-----------------------------------------------|
| canvas  | #0d0c0b  | page background (warm near-black)             |
| panel   | #131210  | cards, code blocks, raised surfaces           |
| raised  | #1f1c19  | buttons/inputs raised fill, ghost hover fill  |
| border  | #322d28  | default 1px border on inputs and key cards    |
| ink-mid | #b8b0a6  | body text                                     |
| ink-hi  | #f5f1ea  | headings, primary text, hover text            |

Brand accent (amber):

| token       | hex      | notes                                      |
|-------------|----------|--------------------------------------------|
| amber       | #e8862e  | the one brand color; oklch(0.72 0.18 50)   |
| amber-hover | #f59b45  | primary button hover                       |
| amber-tint  | #1a130b  | amber-tinted panel fill (badges, callouts) |
| amber-tint2 | #15110c  | Pro pricing card fill                      |
| amber-brd   | #3a2a18  | amber-tinted border                        |

Status palette ("the terminal language"):

| token      | glyph | hex      | tinted border | tinted bg |
|------------|-------|----------|---------------|-----------|
| pass       | ✓     | #4fb477  | #24472f       | #0e1410   |
| warning    | ⚠     | #e8862e  | (amber)       | (amber)   |
| regression | ✘     | #e5484d  | #4a2424       | #170f0e   |
| new        | ★     | #5b8def  | #24472f-blue  | (blue)    |

Extended neutral ramp observed in inline styles (darkest to lightest), use these for surfaces and text shades:

| hex      | role                                                        |
|----------|-------------------------------------------------------------|
| #100f0e  | alternate darker section background (problem / CTA bands)    |
| #121110  | terminal panel background (hero terminal, config block)     |
| #161412  | input/header strip background, table header, row hover fill |
| #211e1b  | hairline divider / faint border (lighter than #322d28)      |
| #2a2622  | card border (most cards use this, not #322d28)              |
| #54493f  | hover border (cards, buttons, FAQ, vs-cards)                |
| #564f48  | faint mono label text, terminal dots, idle nav border       |
| #6b645c  | faint footer/secondary text                                 |
| #7c746b  | muted label / "$" prompt color                              |
| #8c847a  | secondary body text, competitor table cells                 |
| #9b958c  | secondary text on light (mono-on-light lockup)              |
| #c8c0b6  | slightly brighter body text                                 |
| #d8d0c5  | bright body text (list items, table caps)                   |
| #e6e0d6  | terminal command text                                       |

Code-syntax palette (used in `<pre>` blocks on Landing, Pricing, Docs):

| hex      | token kind            |
|----------|-----------------------|
| #c678dd  | keyword (import/async)|
| #98c379  | string literal        |
| #4fb477  | success/added value   |
| #5b8def  | blue accent           |
| #e8862e  | number/amber emphasis |
| #564f48  | comment               |
| #b8b0a6  | default code text     |

Selection and scrollbar: `::selection { background:#e8862e; color:#0d0c0b }`. Custom scrollbar on scrollable pages: `width:9px` (and `height:9px` where horizontal), `::-webkit-scrollbar-thumb { background:#2a2622 }`, Docs adds `::-webkit-scrollbar-track { background:#0d0c0b }`.

## Typography

Two Google Fonts, loaded via `fonts.googleapis.com/css2`:

| family        | weights loaded      | use                                              |
|---------------|---------------------|--------------------------------------------------|
| Space Grotesk | 400, 500, 600, 700  | display and body (the default `font-family`)     |
| JetBrains Mono| 400, 500, 700       | all labels, nav, code, terminal, buttons, badges |

Exact link: `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap`.

Named type scale (Brand page specimen):

| label        | size | family        | example                                  |
|--------------|------|---------------|------------------------------------------|
| DISPLAY / 52 | 52px | Space Grotesk | "Ship with confidence"                   |
| HEADING / 38 | 38px | Space Grotesk | "Detect, understand, fix"                |
| BODY / 16    | 16px | Space Grotesk | running paragraph copy                   |
| MONO / 13    | 13px | JetBrains Mono| `$ npx frontguard run --url localhost:3000` |

The table above is the Brand page's nominal specimen; the DISPLAY/52 token is the Brand page's own large heading, not the Landing hero. The live page heroes are larger and differ per page. Exact authored heading values, verified against the source CSS (every page's `<h1>`/`<h2>`):

| heading                          | size | line-height | weight | letter-spacing |
|----------------------------------|------|-------------|--------|----------------|
| Landing hero h1                  | 58px | 1.02        | 700    | -0.035em       |
| Pricing hero h1                  | 54px | 1.04        | 700    | -0.035em       |
| Brand hero h1                    | 52px | 1.0         | 700    | -0.04em        |
| Comparisons hero h1              | 52px | 1.04        | 700    | -0.035em       |
| Changelog hero h1                | 48px | 1.04        | 700    | -0.035em       |
| Docs page h1                     | 42px | 1.05        | 700    | -0.035em       |
| Landing CTA h2                   | 44px | default     | 700    | -0.035em       |
| Pricing / Comparisons CTA h2     | 40px | default     | 700    | -0.035em       |
| Landing section h2               | 38px (36px on two: "Kills the #1 pain", "One file") | default | 700 | -0.03em |
| Comparisons "Head to head" h2    | 32px | default     | 700    | -0.03em        |
| Pricing / Comparisons sub h2     | 30px | default     | 700    | -0.03em        |
| Docs section h2                  | 24px (26px on some: "The pipeline", "frontguard run/monitor") | default | 600 | -0.02em |
| Changelog release title h2       | 24px | default     | 600    | -0.02em        |

Note the pricing tier price number is also 44px (weight 700, -0.03em).

Full size ramp used across pages (px): 58 (Landing hero), 54 (Pricing hero), 52 (Brand and Comparisons hero, Brand DISPLAY token), 48 (Changelog hero), 44 (Landing CTA h2, pricing price), 42 (Docs page h1), 40 (Pricing/Comparisons CTA h2), 38 (Landing section h2), 36 (two Landing sub-section h2), 32 (Comparisons "Head to head"), 30 (Pricing/Comparisons sub h2), 26 (some Docs h2), 24 (Docs/Changelog h2, problem statement), 22 (large card h3), 21 (pillar h3), 18 (lead paragraph), 17 (CTA paragraph), 16.5/16 (body, feature card h3), 15.5/15/14.5/14 (secondary body and list), 13.5/13 (small body, code), 12.5/12 (mono labels, terminal), 11/10.5 (tiny uppercase mono labels, badge).

Weights: 700 for hero and section h2 headings and the wordmark; 600 for Docs/Changelog h2 and card h3; 500 for emphasized mono labels and ghost buttons; 400 for body and most mono.

Letter-spacing: -0.035em on the page hero h1s and the two big CTA h2 (Brand hero is -0.04em), -0.03em on section h2, -0.02em on the wordmark and the smaller Docs/Changelog h2, -0.01em on mid headings, and positive tracking +0.04em / +0.06em / +0.08em on uppercase mono labels. Line-height on headings: Landing hero 1.02, Pricing/Comparisons/Changelog hero 1.04, Docs h1 1.05, Brand h1 1.0; body 1.45-1.6, default ~1.55.

Body defaults: `font-family:'Space Grotesk',sans-serif; color:#b8b0a6; background:#0d0c0b`. Headings recolor to `#f5f1ea`.

## Spacing, layout, grid

No CSS variables; spacing is literal px. Observed scale (px): 6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 52, 56, 64, 72, 84, 88, 90. It is effectively a 4px base with common steps at 8/12/16/20/24/28/32. Section vertical rhythm is ~84px top padding on Landing content sections; hero is 88px; CTA bands 90px.

Containers: `max-width:1200px; margin:0 auto; padding:0 28px` is the standard wrapper (28px horizontal gutter). Narrower wrappers: 1100px (Pricing compare-plans matrix), 1080px (Brand page), 900px (Pricing FAQ), 860px (Changelog timeline). Docs is the exception: a 1400px canvas with a fixed three-column app shell `grid-template-columns: 256px minmax(0,1fr) 224px` (sidebar / content / TOC).

Common grid patterns (all fixed, no fluid breakpoints):

| pattern                       | where                                            |
|-------------------------------|--------------------------------------------------|
| `1fr 1fr`                     | hero split, two-ways-in cards, AI-example split  |
| `repeat(3, 1fr)`              | three pillars, features grid, honest cards, tiers |
| `repeat(6, 1fr)`              | pipeline (6 stages), Brand neutral swatches      |
| `repeat(5, 1fr)`              | plugins row                                      |
| `repeat(4, 1fr)`              | comparisons alternatives strip                   |
| `1.6fr 1fr 1fr 1fr`           | pricing compare-plans matrix (cap + 3 plans)     |
| 7-col table                   | comparisons matrix (cap + Frontguard + Percy + Chromatic + BackstopJS + Lost Pixel + Argos) |
| `0.8fr 1.2fr`                 | comparisons migration row                        |
| `256px minmax(0,1fr) 224px`   | Docs app shell                                   |
| `168px 1fr`                   | changelog timeline row (sticky version meta / content), gap 0, 860px container |

Card grid gaps: 20px between cards; 1px gap with a `#211e1b` background to fake hairline dividers between grid cells (problem stats, features grid).

## Radius, borders, shadows

Radius: zero. Every box is a sharp rectangle. The only `border-radius` in the whole design is `50%` on the three macOS-style terminal dots and a few 6-7px status dots. The build must not introduce rounded corners.

Borders: 1px solid hairlines are the primary structural device. `#211e1b` for faint dividers, `#2a2622` for card borders, `#322d28` for input/strong borders, `#54493f` on hover. Status cards use tinted 1px borders (`#4a2424` red, `#24472f` green, `#3a2a18` amber). Tables draw rows with `border-top:1px solid #211e1b`. Plugins use a 2px amber top-border accent (`border-top:2px solid #e8862e`).

Shadows: used sparingly, only behind elevated panels. `box-shadow: 0 24px 60px rgba(0,0,0,0.5)` (hero terminal), `0 20px 50px rgba(0,0,0,0.4)` (config block), `0 16px 40px rgba(0,0,0,0.45)` (AI card). The hero also has a radial amber glow behind the terminal: `radial-gradient(60% 50% at 60% 40%, rgba(232,134,46,0.10), transparent 70%)`. No shadows on standard cards.

## Motion and transitions

Transitions are short and consistent: `.18s ease` on interactive fills/borders, `.15s ease` on swatch lift. Specific rules:

| selector            | transition / effect                                            |
|---------------------|----------------------------------------------------------------|
| `.fg-card-hover`    | `border-color .18s, transform .18s, background .18s`; hover lifts `translateY(-2px)` and sets border `#54493f` |
| `.fg-btn-primary`   | `background .18s`; hover `background:#f59b45`                   |
| `.fg-btn-ghost`     | `all .18s`; hover border `#54493f`, fill `#1f1c19`             |
| `.fg-cmp-row`       | `background .18s`; hover fill `#161412`                        |
| `.fg-faq`/`.fg-vs`  | `border-color .15s`; hover border `#54493f`                    |
| `.fg-swatch`        | `transform .15s`; hover `translateY(-3px)`                     |
| `.fg-link`/`.fg-navlink`/`.fg-sb-item`/`.fg-toc` | hover text -> `#f5f1ea` (or `#d8d0c5` for TOC) |

Keyframe animations (Landing/Brand):

| name      | definition                                              | use                                  |
|-----------|---------------------------------------------------------|--------------------------------------|
| fg-blink  | opacity 1 (0-49%) then 0 (50-100%), `1.1s step-end`     | the block cursor at end of wordmark / terminal output |
| fg-pulse  | opacity 0.5 <-> 1, `2s ease-in-out infinite`            | the "OPEN SOURCE" badge dot          |
| fg-scan   | `translateY(0)` to `translateY(340px)`                  | a scan-line effect (declared; subtle) |

Docs adds `scroll-behavior:smooth` on `html,body` for in-page TOC jumps.

## Iconography and the mark

No icon font, no SVG files. Icons are Unicode glyphs in JetBrains Mono: ✓ ⚠ ✘ ★ ◐ ✕ ↗ ⌘, plus emoji in the terminal mock (🔍 📊 🖥). The status glyph set maps to the status palette above.

The logo mark is drawn purely in CSS, not an image. It is a five-point shield via `clip-path: polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)` filled `#e8862e`, with a thin center seam (a second clipped span the width of 1.5-7px filled in the background color) splitting the shield into baseline-vs-current halves. The wordmark is lowercase `frontguard` in JetBrains Mono 700, often followed by a blinking amber block cursor. Three lockups are specified on the Brand page: primary (mark + wordmark + cursor on dark), mono on light (`#14110d` mark and ink on `#f5f1ea`), and mark-only app icon.

Important: this CSS amber shield is the new brand mark. The raster `logo.png` shipped in the export (and already in the repo) is the older cyan "FG" mark and does not match. See Asset manifest.

## Breakpoints and responsive behavior

There are zero `@media` queries in the entire export. Every page is authored at a fixed desktop canvas with fixed-px / `fr` grids and `max-width` wrappers. Authored preview canvas sizes:

| page         | canvas (w x h) |
|--------------|----------------|
| Landing      | 1200 x 2400    |
| Brand        | 1080 x 1700    |
| Pricing      | 1200 x 1700    |
| Comparisons  | 1200 x 1500    |
| Changelog    | 1200 x 1800    |
| Docs         | 1400 x 1500    |

Responsive collapse is the build's responsibility; the design does not specify it. Recommended rules to add (Tailwind v4 breakpoints, mobile-first):

- Nav: collapse the link row into a menu (hamburger) below ~768px; keep the Star button visible.
- Hero `1fr 1fr`: stack to single column below ~900px; terminal visual moves under the copy.
- `repeat(3,1fr)` pillars/features/tiers/honest: 3 -> 2 -> 1 columns at tablet -> mobile.
- `repeat(6,1fr)` pipeline and `repeat(5,1fr)` plugins: wrap to 2-3 columns, then 1.
- Tables (comparison, pricing matrix): allow horizontal scroll on mobile (the design already wraps some in `overflow-x:auto`), or restructure to stacked cards.
- Docs 3-column shell: drawer sidebar + hidden TOC on mobile, content full width.
- Fluid-down the hero h1 from 58px toward ~32-36px on mobile.

## Screen and section inventory

Six screens. Order, layout, content, and states below. Reference renders: `docs/design-extract/renders/{landing,brand,pricing,comparisons,changelog,docs}.png`. Exact source: `docs/design-extract/source/`.

### 1. Landing (Landing.dc.html)

Primary marketing page. Sticky translucent nav, then 14 content sections, then footer. Canvas 1200x2400.

1. Nav (sticky, `top:0`, z-50): `rgba(13,12,11,0.82)` + `backdrop-filter:blur(12px)`, bottom border `#211e1b`, 64px tall, 1200px wrapper. Left: CSS shield mark + lowercase `frontguard` (JetBrains Mono 700, 16px). Right: mono 13px links `features`, `docs`, `pricing`, `compare`, `changelog`, then amber `★ Star` primary button linking to the GitHub repo. Links default `#b8b0a6`, hover `#f5f1ea`.
2. Hero (`1fr 1fr`, 88px top padding). Left column: amber pill badge "OPEN SOURCE · MIT · SELF-HOSTABLE" with a pulsing dot; h1 58px "Catch the regression,<br>not the noise."; lead paragraph (18px) naming the ~40% false-positive problem and the regression/intentional/content classification; an install command row (`$ npm install @frontguard/cli`) with a copy button; two CTAs "Get started ->" (amber primary -> Docs) and "★ Star on GitHub" (ghost). Right column: a terminal mock card (`#121110`, deep shadow, amber radial glow behind) titled `frontguard run` with colored run output (discovering routes, 12/47 affected, per-route PASS/WARN/REGRESSION/NEW lines, summary), ending in a blinking cursor; overlapping below it an "AI ANALYSIS - REGRESSION · 94% CONFIDENCE" card explaining a flex-direction regression.
3. Problem strip (band `#100f0e`, top+bottom border, `1.1fr 1fr`). Left: mono kicker "// WHY TEAMS MUTE VISUAL TESTS", 24px statement, paragraph. Right: 2x2 stat grid (1px gridlines): ~40% false fails, 73% lost faith, <10% run visual regression, $100M Prime Day CSS bug.
4. Three pillars (`repeat(3,1fr)`, hover-lift cards): 01 / DETECT (green tag), 02 / UNDERSTAND (amber tag), 03 / FIX (blue tag), each with h3 + paragraph.
5. Two ways in (`1fr 1fr` cards): "Standalone CLI" (`@frontguard/cli`) with a code block showing `npx frontguard run --url`; "Playwright-native" (`@frontguard/playwright`) with an `expectVisual(page)` code block. Each card has a header strip and footnote.
6. How it works pipeline (`repeat(6,1fr)`, single 1px-bordered strip): six numbered stages from `renderVals.stages`: 01 Discover, 02 Filter, 03 Render, 04 Diff, 05 Analyze, 06 Report, each `num / title / desc`.
7. AI classification example (band `#100f0e`, `0.9fr 1.1fr`). Left: kicker, h2 36px "Kills the #1 pain of visual testing: false positives.", paragraph, green-check list (severity+confidence scoring, BYOK OpenAI/Anthropic, local-first). Right: two stacked verdict cards, one red REGRESSION 94% with a suggested fix, one green INTENTIONAL 91%.
8. Features grid (`repeat(3,1fr)`, 1px gridlines, hover rows): nine feature cells from `renderVals.features` (Zero-config routes, Multi-browser, Smart rendering, Git-native baselines, Preview deploys, Per-route thresholds, Framework detection, Security hardened, PR thumbnails), each `tag / title / desc`.
9. Config code (band `#100f0e`, `0.85fr 1.15fr`). Left: copy about per-route thresholds and `frontguard init` framework auto-detect. Right: a `frontguard.config.ts` terminal card with syntax-highlighted config (baseUrl, discover, viewports [375,768,1440], browsers, threshold, ai BYOK).
10. Comparison table: h2 38px "The only one with AI fix verification.", a 6-column table (CAPABILITY + Frontguard + Percy + Chromatic + BackstopJS + Lost Pixel) from `renderVals.comparison`, 7 rows, Frontguard column in green, rivals in muted grey, hover-row highlight.
11. Plugins: one bordered panel, h3 "Extensible by design - 5 built-in plugins, 6 lifecycle hooks", a mono list of the six hooks, then `repeat(5,1fr)` of plugin cards (Figma, Perf Budgets, Accessibility, 3rd-Party Scripts, Monitor) each with a 2px amber top border.
12. Honest ("// NO MAGIC, JUST HONEST"): h2 38px "We'll tell you what it isn't.", three hover-lift cards (YOU BRING THE KEY, YOU STAY IN THE LOOP, NUMBERS NOT CLAIMS).
13. CTA (band `#100f0e`, centered): large CSS shield (44x52), h2 44px "Ship with confidence.", paragraph, an `$ npx frontguard init --ci` copy row, "Read the docs ->" (amber) and "★ Star on GitHub" (ghost).
14. Footer (`1.6fr 1fr 1fr 1fr`): brand blurb column + PRODUCT / RESOURCES / COMMUNITY link columns; bottom sub-bar "© 2026 Frontguard · MIT License" and "Built for teams who ship fast."

States: copy buttons toggle label to "copied ✓" for 1600ms via `navigator.clipboard`. Hover states per the motion table. No loading/empty/error states (static marketing content). The terminal cursor and badge dot animate continuously.

### 2. Brand (Brand.dc.html)

The brand guide / design-system page. Canvas 1080x1700. Centered 1080px column.

Sections: header (wordmark + "BRAND SYSTEM · v1.0"), h1 52px "The Frontguard brand system.", intro. 01 / THE MARK: big amber shield on a dark panel beside three "construction notes" (the shield, the seam = baseline vs current, the cursor); then a lockups row of three (primary on dark, mono on light, mark-only app icon). 02 / COLOR: the six warm neutrals as swatches (`renderVals.neutrals`), a large amber accent block ("Frontguard Amber #E8862E / oklch(0.72 0.18 50)"), and the four-status palette (`renderVals.statuses`). 03 / TYPOGRAPHY: Space Grotesk and JetBrains Mono specimens (Aa + glyph sets + weight names), then the named type scale (DISPLAY/52, HEADING/38, BODY/16, MONO/13). 04 / VOICE: three cards HONEST, PRECISE, LOWERCASE. 05 / MESSAGING: PRIMARY TAGLINE "Catch the regression, not the noise.", THE ONE-LINER, and a SAY / DON'T two-column list (`renderVals.say` / `renderVals.dont`).

This page is the canonical token reference. The swatch cards hover-lift (`.fg-swatch`).

### 3. Pricing (Pricing.dc.html)

Canvas 1200x1700. Reuses the Landing nav.

Sections: centered hero (green pill "THE CLI IS FREE FOREVER · MIT", h1 54px "Pricing that respects open source.", lead). Pricing tiers (`repeat(3,1fr)`, `renderVals.tiers`): OPEN SOURCE ($0 / forever, grey accent, ghost CTA "npm install @frontguard/cli", 7 includes), PRO ($29 / month, amber accent, `featured:true` with a "MOST POPULAR" badge clipped to the top-right, primary CTA "Start 14-day trial", 6 extras), TEAM ("Let's talk", blue accent, ghost CTA "Contact us", 6 extras). Each tier card: accent label, price + per, tagline, CTA, divider, features label, check-list. Below the grid a centered note that the hosted platform is itself open source / self-hostable. Compare-plans matrix (`1.6fr 1fr 1fr 1fr`, header row `#161412`, `renderVals.matrix`, 9 rows) with per-cell colors (green check, grey dash, amber value like "R2", ink value like "Git"/"CLI"/"Webhook"). FAQ (`renderVals.faqs`, 5 items) as `.fg-faq` cards (hover border). CTA band ("Start free. Upgrade if you outgrow it.", install copy row, CTAs). Footer.

States: install copy button -> "copied ✓"; FAQ card hover; horizontal scroll on the matrix on narrow widths.

### 4. Comparisons (Comparisons.dc.html)

Canvas 1200x1500. Landing nav.

Hero h1 is 52px (1.04 / 700 / -0.035em), not the same as the Landing/Pricing hero.

Sections: hero "Frontguard vs. everyone else." with lead about validating against real repos. Alternatives strip (`renderVals.alternatives`, `repeat(4,1fr)`): Percy ("↗ $399/mo pricing cliff"), Chromatic ("◐ Storybook-locked"), BackstopJS ("✕ unmaintained", red), Lost Pixel ("✕ archived", red). Big matrix: a 7-column `<table>` with header row CAPABILITY + Frontguard + Percy + Chromatic + BackstopJS + Lost Pixel + Argos (six competitor/own columns bound to `row.v0`..`row.v5`, where v0 is Frontguard). `renderVals.matrix`, 9 rows. Cell legend printed below the table: ✓ full support, ◐ partial / limited, ✕ not available; the helper colors ✓ green `#4fb477`, ◐ amber `#e8862e`, ✕ grey `#6b645c`, other text `#a89f94`, and Frontguard's own ✓ (v0) green. The 9 rows, with values in column order [Frontguard, Percy, Chromatic, BackstopJS, Lost Pixel, Argos]:

| capability                | Frontguard | Percy     | Chromatic | BackstopJS | Lost Pixel | Argos    |
|---------------------------|------------|-----------|-----------|------------|------------|----------|
| Open source               | ✓ MIT      | ✕         | ◐         | ✓          | ◐          | ✓ MIT    |
| CLI-first                 | ✓          | ✕         | ✕         | ✓          | ✓          | ✓        |
| AI change classification  | ✓          | ✕         | ✕         | ✕          | ✕          | ✕        |
| AI fix verification       | ✓          | ✕         | ✕         | ✕          | ✕          | ✕        |
| Anti-flake rendering      | ✓          | ◐         | ◐         | ✕          | ✕          | ◐        |
| Self-hostable             | ✓          | ✕         | ✕         | ✓          | ◐          | ◐        |
| Free tier                 | Forever    | Trial     | Hobby     | Free       | ✕          | Hobby    |
| Pro entry                 | $29/mo     | ~$399/mo  | per-snap  | n/a        | n/a        | $100/mo  |
| Actively maintained       | ✓          | ✓         | ✓         | ✕ 6yr      | ✕          | ✓        |

Head-to-head cards (`renderVals.versus`, `1fr 1fr` grid, 4 cards: Percy, Chromatic, BackstopJS, Lost Pixel/Argos) each with "their strength" vs "ours" and a migration/comparison link; cards are `.fg-vs` (hover border). Migration row (`0.8fr 1.2fr`, `renderVals.migrations`: BackstopJS, Lost Pixel, Percy, Chromatic). CTA "See the difference yourself." Footer.

States: vs-card hover; table horizontal scroll on mobile.

### 5. Changelog (Changelog.dc.html)

Canvas 1200x1800. Landing nav.

Hero h1 is 48px (1.04 / 700 / -0.035em), the smallest of the page heroes.

Sections: hero "What's new in Frontguard". Timeline: an 860px-max-width section (`padding: 16px 28px 100px`) wrapping `renderVals.releases` (3 entries). Each release is a two-column grid `grid-template-columns: 168px 1fr` with `gap: 0` and a top hairline `border-top: 1px solid #211e1b`. Left column (168px) is the version meta, `position: sticky; top: 88px`: version number (JetBrains Mono 18px / 700, colored per release), a status tag chip (10.5px, tinted border+bg), and the date (12px `#6b645c`). Right column (1fr) is the content: release title h2 (24px / 600 / -0.02em), summary, then change groups; each change item is a nested `14px 1fr` grid (bullet + text). The three entries, `version meta (left) / content (right)`:

- Unreleased ("on main", amber "IN PROGRESS" tag): title "Storybook, OpenTelemetry & a native Slack app", ADDED group (Storybook integration, OpenTelemetry export, native Slack app, run-over-run perf regressions, accessibility-aware AI).
- 0.2.0 (2026-06-03, green "LATEST RELEASE"): "The 'earn trust' release", ADDED (doctor, monitor, AI fix generation + sandbox verification, fix-pattern database, a11y + perf plugins, cloud platform, teams & billing, integrations) and CHANGED (docs to Fumadocs, reporters).
- 0.1.0 (2026-01-01, grey "INITIAL RELEASE"): "The core engine", ADDED (CLI, route discovery, multi-browser capture, visual comparison, AI analysis, Git baselines, plugin architecture), SECURITY (hardened by default), TESTING (395 tests across 26 files).

Group labels are color-coded: ADDED green `#4fb477`, CHANGED blue `#5b8def`, SECURITY amber `#e8862e`, TESTING purple `#c678dd`. Each item is a bold lead term + description. Footer.

States: static; standard link hovers.

### 6. Docs (Docs.dc.html)

A client-side single-page docs app. Canvas 1400x1500. Three-column shell `256px / 1fr / 224px`.

- Top bar: `frontguard DOCS` wordmark, a "Search docs ⌘K" field (visual only), right links `home`, `pricing`, `github`, and a `★ Star` button.
- Left sidebar (`.fg-sb-item`): six nav groups from `renderVals.nav` driving twelve pages: Getting Started (Introduction, Installation, Quick start), Reference (CLI Commands, Configuration, Playwright plugin), CI / CD (GitHub Actions), Guides (AI Analysis, AI Fixes, Custom Plugins), Deployment (Self-hosting), Trust (Validation & results). Active item is amber with an amber left border; idle is `#8c847a` with `#211e1b` border.
- Main content: a breadcrumb (`section / page`), an h1, and the page body. Only the active page renders (`sc-if` on `isIntro`, `isInstall`, etc.); `this.go(id)` switches `state.page`. The Introduction page shows intro copy, DETECT / UNDERSTAND callout cards, a PREREQUISITES amber callout, and the six-stage pipeline list. Other pages carry code blocks (CLI, config, Playwright, CI YAML), guide prose, and a self-host / results page.
- Per-page right TOC (`.fg-toc`, `renderVals.tocMap`) listing in-page anchors, e.g. intro -> Overview / Detect-Understand / Prerequisites / The pipeline.
- Footer of content: prev / next pager (`renderVals.prevLabel` / `nextLabel`, disabled state at 0.4 opacity at the ends).

States and interactions:
- Active page: clicking any sidebar item calls `go(id)`, which sets the active nav styling, swaps the visible content block, updates the breadcrumb, the TOC, and the prev/next labels. This is real in-page state, the one genuinely interactive screen.
- Prev/next disabled (empty) state at first/last page renders at 0.4 opacity ("Overview" / "You're all caught up").
- Hover: sidebar items and TOC items brighten; cards (`.fg-card`) take a `#54493f` border.
- Smooth scroll for TOC anchor jumps.
- Search field is presentational in the design (no results state specified). The build should decide whether to wire it up; if static, render it as a non-functional affordance or implement client-side filtering.

## Component library plan

Reimplement as React 19 components styled with Tailwind v4. Define the tokens once (see below) and build a small shared kit. The existing `apps/landing/src/components` set (Nav, Hero, Problem, HowItWorks, Features, Comparison, Pricing, FAQ, Footer, QuickStart, Validation) maps closely to the Landing sections and should be restyled to this design rather than rebuilt from scratch.

Shared primitives (new shared kit, suggested `apps/landing/src/components/ui/`):

| component        | variants / props                                            | source sections                                  |
|------------------|-------------------------------------------------------------|--------------------------------------------------|
| Button           | primary (amber), ghost (bordered); sizes nav/md/lg; as link | nav Star, hero CTAs, tier CTAs, pager            |
| Badge / Pill     | amber, green, status-colored; optional pulsing dot          | hero badge, pricing pill, "MOST POPULAR", tags   |
| Card             | base panel; `hoverLift` variant; optional accent top-border | pillars, features, honest, plugins, vs-cards     |
| SectionHeader    | mono kicker (`// ...`) + h2 + optional lead paragraph       | every Landing/Pricing/Comparisons section        |
| Kicker / Label   | uppercase JetBrains Mono, tracked, muted                    | all section kickers, card tags                   |
| CodeBlock        | terminal-card header (3 dots + filename) + syntax `<pre>`   | hero terminal, two-ways-in, config, docs         |
| CopyCommand      | `$ ` prompt + command + copy button (-> "copied ✓")         | hero install, CTA init, pricing install          |
| StatusGlyph      | maps ✓/⚠/✘/★ to pass/warning/regression/new colors          | terminal output, verdict cards, tables           |
| VerdictCard      | tinted border+bg by status, confidence chip, body, fix line | hero AI card, AI-example cards                    |
| StatGrid         | 2x2 / N-up with 1px gridline fill                           | problem strip, features grid                      |
| ComparisonTable  | header row, capability col + value cols, per-cell color     | Landing comparison, Pricing matrix, Comparisons   |
| PricingCard      | accent, price, per, tagline, CTA, feature check-list, featured badge | pricing tiers                            |
| FaqItem          | question + answer, hover border (accordion-ready)           | pricing FAQ                                       |
| Logo / Mark      | CSS clip-path amber shield + seam; lockup variants; cursor  | nav, footer, CTA, Brand lockups                  |
| Nav / TopBar     | sticky translucent landing nav; docs top bar variant        | all pages                                         |
| Footer           | 4-column links + sub-bar                                    | Landing/Pricing/Comparisons/Changelog            |
| Timeline / Release | version meta column + grouped change list (color labels)   | changelog                                         |
| DocsShell        | sidebar nav + content + TOC; active-page state machine      | docs                                             |
| Pager            | prev/next with disabled end states                          | docs                                             |

Notes for the kit: the FaqItem renders open in the design (no accordion collapse is specified); if the build wants collapse, add it as an enhancement and keep the hover-border. The ComparisonTable is used three times with different column counts and cell vocabularies (✓ / ◐ / ✕ / text), so make columns and the cell-to-color mapping data-driven. The DocsShell is the only stateful page; model `activePage` as React state and derive breadcrumb, TOC, and pager from an ordered page list (mirror `renderVals.pages` and `tocMap`).

Suggested Tailwind v4 theme tokens (in `@theme`): name the colors above (`--color-canvas`, `--color-panel`, `--color-raised`, `--color-border`, `--color-ink-mid`, `--color-ink-hi`, `--color-amber`, `--color-amber-hover`, `--color-pass`, `--color-warning`, `--color-regression`, `--color-new`), set `--font-sans: 'Space Grotesk'` and `--font-mono: 'JetBrains Mono'`, set default `--radius` to 0, and add the three keyframes (fg-blink, fg-pulse, fg-scan).

## Asset manifest

The export contains two binary product assets plus a tool thumbnail and the runtime. Both product assets are already committed in the repo, byte-for-byte identical (md5 verified), so nothing needed copying. Paths where the build can use them:

| export path                | md5            | already in repo at                                         | status         |
|----------------------------|----------------|------------------------------------------------------------|----------------|
| branding/logo.png (512x512)| d0e049da...07  | apps/landing/public/logo.png ; branding/logo.png           | present, identical |
| demo/frontguard-demo.gif (1200x700) | 7051a62a...fb | apps/landing/public/demo/frontguard-demo.gif ; demo/frontguard-demo.gif | present, identical |
| .thumbnail (webp, 5.7KB)   | n/a            | not copied (Claude design-tool preview thumbnail, not a product asset) | skipped |
| support.js (dc-runtime)    | n/a            | docs/design-extract/source/support.js (reference only)     | not for build  |

Existing related raster assets already in `apps/landing/public/`: `logo.webp`, `logo-16/32/48/64/128/180/192` (png + webp), `favicon.ico`, `og-image.png`. The `branding/` directory mirrors the logo size set.

Fonts: no font files in the export. Both families load from Google Fonts at runtime (link given in Typography). The build can keep the CDN link or self-host Space Grotesk + JetBrains Mono.

The Landing design does not actually embed `frontguard-demo.gif`; the hero uses a CSS/HTML terminal mock, not the gif. The gif remains available for docs/README use.

## Migration flags for the build

These are gaps between the current `apps/landing` and the new design. Call them out so they are not missed:

- Fonts change. The current `apps/landing/index.html` loads Outfit + Plus Jakarta Sans + JetBrains Mono. The new design uses Space Grotesk + JetBrains Mono. Swap the Google Fonts link and the Tailwind font tokens.
- Brand color shift to amber. The new accent is amber `#e8862e`. Audit the current landing for any prior accent color and replace.
- Logo mismatch. The committed raster logo (`logo.png` and all `logo-*` sizes, `favicon.ico`, `og-image.png`) is the older cyan "FG" mark. The new brand mark is the amber CSS shield. Either regenerate the raster/favicon/OG assets in the amber shield form to match, or accept the inconsistency knowingly. The Brand page is explicit that the mark is a CSS polygon with no decorative SVG, so favicons should be re-rendered from that shape in amber.
- No responsive spec. The design is desktop-fixed with no `@media` queries. The build must add the responsive rules listed under Breakpoints.
- Five new pages. The current app is a single landing page. The design adds Pricing, Comparisons, Changelog, and a 12-page Docs app. Decide routing (the design links pages as flat `*.dc.html`; in React use a router with `/pricing`, `/compare`, `/changelog`, `/docs/*`).
- The Docs search box and FAQ accordion are presentational in the design; decide whether to wire them up.
