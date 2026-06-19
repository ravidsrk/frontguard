# Gap Plan — Frontguard full TanStack migration (FROZEN)

Frozen after T-PLAN. Every build task conforms to this; reviewers grade against it. New gaps → new ledger rows, never edits here.

Inputs: `docs/design-spec.md` (design system + screens), `docs/design-extract/tanstack/` (authoritative design source, verbatim), `docs/product-probe.md` (the floor — exact real content, tests, SEO, CI).

Decision (user-confirmed twice): rebuild the site as the design's TanStack Start app on Cloudflare Workers as a NEW workspace `apps/web`, then cut over (remove `apps/landing` + `apps/docs`). Port the entire content floor so nothing is lost. Auto-merge each reviewed PR to `main`.

## Classification (design item → product status → action)

| Design item | Product today | Class | Action |
|------------------------|----------------------------------------|-------------|--------|
| Design system/tokens/chrome (Nav/Footer/Shield/styles) | landing already amber/Space Grotesk/JetBrains/shield | MATCH-RESKIN | Re-implement in TanStack app from extracted source. |
| `/` Home | 13-section home (vite-react-ssg) | MATCH-RESKIN | Rebuild in TanStack with the design layout + the product's exact real content. |
| `/pricing` | pricing route, 3 tiers, 8-Q FAQ, JSON-LD | MATCH-RESKIN | Rebuild; carry exact tiers/matrix/FAQ + FAQPage JSON-LD. |
| `/comparisons` | 15-row × 6-vendor matrix | MATCH-RESKIN | Rebuild; carry full 15-row matrix + head-to-head + migration. |
| `/changelog` | release timeline | MATCH-RESKIN | Rebuild; carry Unreleased/0.2.0/0.1.0 detail. |
| `/brand` | brand system page | MATCH-RESKIN | Rebuild 5 sections. |
| `/docs` + `/docs/$slug` | TWO docs systems (landing internal 12 + Fumadocs 37) | ENHANCE+CONSOLIDATE | One TanStack docs system; PORT ALL 37 Fumadocs articles into design's docs structure. |
| SEO/JSON-LD/sitemap/robots/llms/og/favicons/404 | present on landing | MATCH-RESKIN | Re-create in TanStack app; rebuild sitemap against new routes. |
| Deploy on Cloudflare Workers | currently CF Pages (2 projects) | BUILD-NEW | New `deploy-web.yml` → `wrangler deploy`; retire pages workflows. |
| Live GitHub stars | GitHubStars.tsx | MATCH-RESKIN | Re-implement star fetch in Nav/CTA. |
| Tests (15 landing vitest files) | present | ENHANCE | Re-create equivalent vitest coverage for the new app. |

Nothing in the product is dropped: every marketing fact, all 37 docs, SEO, tests, assets carry over.

## Build tasks + acceptance criteria

Each task = one branch `ravidsrk/<slug>` = one PR = relay (grok codes → codex reviews → claude ships, auto-merge). Workers MUST read design-spec.md, product-probe.md, the extracted source under docs/design-extract/tanstack/, and the real content from apps/landing + apps/docs. Git author for all commits: Ravindra Kumar <ravidsrk@gmail.com>, no trailers.

- **T-FOUNDATION** (`web-foundation`) [gates all]. Scaffold `apps/web` TanStack Start app from the extracted foundation: package.json (name `frontguard-web`, integrated into the npm workspace — root already globs `apps/*`), vite.config.ts, wrangler.jsonc, tsconfig.json, src/styles.css, src/lib/style.ts, src/router.tsx, src/routes/__root.tsx (fonts + base head/SEO), src/components/Nav.tsx + Footer.tsx + Shield.tsx, public/favicon.svg, a placeholder `/` route. Add root scripts `dev:web`/`build:web`; ensure `npm install` resolves the new workspace. Add a smoke vitest. ACCEPTANCE: `npm run build --workspace=apps/web` succeeds (routeTree generates), typecheck + lint clean, dev server renders the shell with real Nav/Footer/tokens/fonts, smoke test green. Do NOT touch apps/landing or apps/docs yet.
- **T-HOME** (`web-home`) [dep: FOUNDATION]. `/` route, all 13 sections (Hero…CTA) from the design, populated with the product's EXACT content (probe §A1-A8): hero copy/badge/install, terminal mock values, problem stats, pillars, two-ways-in, pipeline, AI example, 9 features, config block, comparison summary, plugins (6 hooks: beforeDiscover/afterDiscover/afterRender/afterCompare/afterRun/onError + 5 plugins), honest cards, CTA. Per-route SEO + SoftwareApplication JSON-LD. Port the landing home tests. ACCEPTANCE: visual match to design index.tsx, every real content value present, SEO/JSON-LD correct, build+lint+typecheck+tests green.
- **T-PRICING** (`web-pricing`) [dep: FOUNDATION; parallel]. `/pricing`: 3 tiers exact ($0 forever / $29 Pro featured / Let's talk Team) with exact feature lists + CTAs/links (probe §A9), compare-plans matrix, 8-Q FAQ + FAQPage JSON-LD. Tests. ACCEPTANCE: design layout + all real values + JSON-LD + green.
- **T-COMPARE** (`web-compare`) [dep: FOUNDATION; parallel]. `/comparisons`: full 15-row × 6-vendor matrix (probe §A10, exact glyphs/prices), alternatives strip, head-to-head + migration cards. Tests. ACCEPTANCE: all 15 rows + 6 vendors exact, design layout, green.
- **T-CHANGELOG** (`web-changelog`) [dep: FOUNDATION; parallel]. `/changelog`: timeline Unreleased/0.2.0/0.1.0 with exact ADDED/CHANGED/SECURITY/TESTING groups (probe §A11). Tests. ACCEPTANCE: all releases/items exact, design timeline, green.
- **T-BRAND** (`web-brand`) [dep: FOUNDATION; parallel]. `/brand`: 5 sections (Mark/Color/Type/Voice/Messaging) with exact tokens + type scale (probe §A12). Tests. ACCEPTANCE: design layout + tokens exact, green.
- **T-DOCS** (`web-docs`) [dep: FOUNDATION; largest]. One docs system: docs layout (sidebar from navGroups, right TOC, prev/next, breadcrumb, top bar) + `/docs/$slug` + `/docs`→intro redirect. PORT ALL 37 Fumadocs articles (probe §2.2) into the article store, preserving titles/sections/nav order/content; map to the design's section grouping. Keep the design's per-article TOC + prev/next. Note: content rendered via dangerouslySetInnerHTML is STATIC/author-controlled (acceptable); reviewer confirms no user input reaches it. Carry over docs intentional placeholders (probe §5.10). Tests (article presence, nav, redirect, 404). ACCEPTANCE: all 37 articles reachable + correct, sidebar/TOC/pager/breadcrumb work, no broken internal links, green.
- **T-SEO-ASSETS** (`web-seo-assets`) [dep: FOUNDATION; ideally after routes exist]. Carry favicons/logos, og-image, robots, 404 (amber), llms.txt + llms-full.txt (kept in sync), Cloudflare `_redirects`/Workers routing equivalent; REBUILD sitemap.xml against the new route set (fix the stale slugs from probe §5.2). Tests (seo-assets presence). ACCEPTANCE: all assets served, sitemap valid against real routes, green.
- **T-DEPLOY-CI** (`web-deploy-cutover`) [dep: ALL routes + DOCS + SEO done]. The cutover: add `.github/workflows/deploy-web.yml` (`wrangler deploy` to Workers, project frontguard-web; secrets CLOUDFLARE_API_TOKEN/ACCOUNT_ID); retire deploy-landing.yml + deploy-docs.yml; update ci.yml (build/typecheck/lint/test the new app; repoint or update docs-links + bundle checks); update root package.json (remove dev:landing/dev:docs/build:landing/build:docs, keep dev:web/build:web, fix build:docs stats wiring); REMOVE apps/landing + apps/docs; delete vestigial fly.toml; unify the GitHub action ref to `@v0` everywhere; update README + repo links. ACCEPTANCE: repo builds with only apps/web, full `npm test` green, CI workflows valid, no dangling refs to removed apps, deploy workflow wired to Workers.
- **T_FINAL** (`web-readiness`) [dep: ALL]. Verification: full build/lint/typecheck/test green; walk every route across breakpoints; confirm all 37 docs + all marketing content present; zero regressions vs floor; no placeholders/dead links/console errors; all worktrees cleaned. Output docs/adopt-readiness.md (adoption matrix, test/coverage summary, residual risks, merged PRs). Ship as final PR.

## Dependency graph + parallelization

```
T-FOUNDATION ──┬─ T-HOME        ┐
               ├─ T-PRICING     │  (independent route files, disjoint —
               ├─ T-COMPARE     │   run in PARALLEL isolated worktrees
               ├─ T-CHANGELOG   │   after FOUNDATION merges to main)
               ├─ T-BRAND       │
               ├─ T-DOCS        │
               └─ T-SEO-ASSETS  ┘
                        │
                 T-DEPLOY-CI  (cutover — needs ALL above merged)
                        │
                   T_FINAL
```

- FOUNDATION is the only hard serialization point at the top (it creates the app skeleton + shared chrome every route imports).
- After FOUNDATION merges, the 6 route tasks + SEO are mutually independent (each adds its own file(s) under apps/web; routeTree.gen.ts is generated + gitignored, no conflict) → parallel isolated worktrees, parallel PRs, depth ≤2.
- DEPLOY-CI is the cutover and MUST be last among build tasks (it deletes the old apps; only safe once the new app is complete).
- Max depth 3 (FOUNDATION → routes → DEPLOY-CI → FINAL counts FINAL as verification). Circuit breaker: 3 code→review rounds/task.
