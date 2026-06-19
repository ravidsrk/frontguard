# Design Spec — Frontguard TanStack design (source of truth)

Imported from Claude Design project `1672c1a0-ad29-455b-8025-5d38a1d1728e` ("Frontguard branding project"). The design author's complete implementation lives in the project's `tanstack/` tree and is extracted verbatim to `docs/design-extract/tanstack/` — that extracted source is the authoritative, byte-level target. This file is the index/summary; when in doubt, match the extracted source exactly.

## Stack (from the design)

- TanStack Start (TanStack Router + Vite SSR), React 19, file-based routing.
- Runtime/deploy: Cloudflare Workers via `@cloudflare/vite-plugin` + `wrangler.jsonc` (`main: @tanstack/react-start/server-entry`, `nodejs_compat`, observability on).
- App package name: `frontguard-web`. Vite dev on port 3000.
- Versions: `@tanstack/react-router`/`@tanstack/react-start` ^1.131.7, react ^19.1, `@cloudflare/vite-plugin` ^1.13.9, vite ^6.3.5, wrangler ^4.42, typescript ^5.8.3.
- routeTree.gen.ts is generated on first dev/build and git-ignored — never hand-edit.

## Design system

Terminal-native dark theme. Authoring: inline styles via `s('css-string')` helper (`src/lib/style.ts`) + shared hover/keyframe classes in `src/styles.css`. Color logic uses the `C` token map.

Palette (`C`, exact hex):
- Surfaces: bg `#0d0c0b`, panel `#131210`, panel2 `#121110`, panel3 `#161412`.
- Ink/body: ink `#f5f1ea`, body `#b8b0a6`, body2 `#c8c0b6`, body3 `#d8d0c5`.
- Mutes: mute `#8c847a`, mute2 `#7c746b`, mute3 `#6b645c`, mute4 `#564f48`.
- Lines: line `#211e1b`, line2 `#2a2622`, line3 `#322d28` (hover border `#54493f`).
- Accent: amber `#e8862e` (primary, oklch 0.72 0.18 50), amberHi `#f59b45` (hover).
- Status: green/pass `#4fb477`, blue/new `#5b8def`, red/regression `#e5484d`, purple `#c678dd`. (Brand status vocab: pass ✓ / warning ⚠ amber / regression ✘ red / new ★ blue.)

Type: `Space Grotesk` (display/body, weights 400;500;600;700), `JetBrains Mono` (the `MONO` const — code/labels/UI, 400;500;700). Loaded via Google Fonts `<link>` in `__root.tsx` (preconnect to googleapis/gstatic). `::selection` amber on bg.

Motion: keyframes `fg-blink` (cursor), `fg-scan` (terminal scanline), `fg-pulse`. Hover classes `fg-link`, `fg-navlink`, `fg-card-hover`, `fg-card`, `fg-btn-primary`, `fg-btn-ghost`, `fg-cmp-row`, `fg-faq`, `fg-vs`, `fg-sb-item`, `fg-toc`. `prefers-reduced-motion` disables all animation + smooth scroll. Custom thin scrollbar.

Logo mark (`Shield.tsx`): pure CSS, no SVG/image. Clip-path shield `polygon(0% 0%,100% 0%,100% 62%,50% 100%,0% 62%)` — amber fill + a thin centered seam span filled with the surface color (reads as a gap). Props `w=22,h=26,notch='#0d0c0b',line=1.5`, aria-hidden. `public/favicon.svg` reproduces the same mark as real SVG. `brand.tsx` has a local `Mark()` variant with a light-background lockup.

## Shared chrome

- `Nav.tsx`: sticky blurred dark bar, Shield + lowercase `frontguard` → `/`. Links (mono, lowercase): docs→/docs, pricing→/pricing, compare→/comparisons, changelog→/changelog. Amber `★ Star` → github.com/ravidsrk/frontguard. `active` prop highlights current. (Docs layout uses its OWN top bar, not this Nav.)
- `Footer.tsx`: brand column (Shield + frontguard + tagline) + PRODUCT / RESOURCES / COMMUNITY columns; bottom bar `© 2026 Frontguard · MIT License` / `Built for teams who ship fast.` (Marketing pages pricing/comparisons/changelog ship their own simpler inline footer; index uses shared Footer; brand has none.)

## Screens (routes)

| Route | File | Renders (design) |
|----------------|------------------------|------------------------------------------------------------------|
| `/` | routes/index.tsx | Hero (badge, h1, copy install box, CTAs, animated terminal mock, AI-analysis card) → Problem stats → 3 Pillars (DETECT/UNDERSTAND/FIX) → Two ways in (CLI vs Playwright) → 6-stage Pipeline → AI classification → 9-card Features → config mock → comparison summary table → Plugins strip → Honest cards → CTA. Shared Nav + Footer. |
| `/pricing` | routes/pricing.tsx | Header badge, 3 tiers (Open Source $0 / Pro $29 featured / Team Let's talk), compare-plans matrix, FAQ, CTA. Own inline footer. |
| `/comparisons` | routes/comparisons.tsx | Header, alternatives strip, big capability matrix (Frontguard/Percy/Chromatic/BackstopJS/Lost Pixel/Argos), head-to-head cards, migration. Own inline footer. |
| `/changelog` | routes/changelog.tsx | Release timeline (Unreleased / 0.2.0 latest / 0.1.0) with sticky version rail + grouped color-coded changes. Own inline footer. |
| `/brand` | routes/brand.tsx | 01 The Mark, 02 Color, 03 Typography, 04 Voice, 05 Messaging. Local Mark(). No footer. |
| `/docs` | routes/docs.tsx | Layout: own top bar (Shield + frontguard + DOCS + ⌘K search box + links), 3-col grid (256px sidebar from navGroups / fluid `<Outlet/>` / 224px right TOC + Star + Edit-this-page). |
| `/docs` (index)| routes/docs/index.tsx | beforeLoad redirect → `/docs/intro`. |
| `/docs/$slug` | routes/docs/$slug.tsx | Breadcrumb (section/label) → article body (dangerouslySetInnerHTML) → prev/next pager. 404 fallback if slug unknown. |

Docs content store (`lib/docs-content.ts`): `articles[]` (design ships 12) + `navGroups[]`. Article = {id,label,section,toc[],html}. Design's 12 slugs: intro, install, quick, cli, config, playwright, cicd, aiAnalysis, aiFixes, plugins, selfhost, results. Right-rail TOC is display-only in the design; ⌘K search is decorative.

## Adoption deltas vs the product (see docs/product-probe.md for the full floor)

The design is the SAME design language the product's landing already uses. The real work is structural + content-fidelity, NOT a visual overhaul:
- CONSOLIDATE: product has TWO docs systems (landing internal `/docs` + Fumadocs `apps/docs`); design has ONE (docs as TanStack routes). Collapse to one.
- UNIFY BRAND: product's docs are cyan `#22d3ee`; design is all amber. Unify to amber.
- CONTENT FLOOR ("nothing lost"): design ships 12 docs but the product has 37 real MDX articles — PORT ALL 37 into the design's docs structure (sidebar/TOC/prev-next/breadcrumb). Likewise carry the product's exact marketing content (15-row comparison matrix, 8-Q pricing FAQ + FAQPage JSON-LD, full changelog incl. 0.2.0/0.1.0 detail, validation numbers, brand tokens), SEO (Seo per route, SoftwareApplication JSON-LD, sitemap, robots, og-image, favicons, llms.txt/llms-full.txt, 404), and re-create equivalent tests (the product has 15 landing vitest files).
- INFRA: move from Cloudflare Pages (current) to Cloudflare Workers (design) — matches the user's Workers-over-Pages default. Delete vestigial fly.toml.
- FIX LIABILITIES the probe found: unify the GitHub action ref (three competing: @v1/@main/@v0 — canonical is `@v0` per CI guard), rebuild sitemap against the new routes, fix the broken netlify→github-app docs link, reconcile the no-JS fallback content drift, remove orphan assets (hero.png, react.svg, vite.svg, unused demo gif).
