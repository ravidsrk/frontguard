# Adopt Readiness — Frontguard TanStack design adoption

Final verification for the full adoption of the Claude design across Frontguard. End state: the marketing site + docs are a single TanStack Start app (`apps/web`) on Cloudflare Workers, matching the design visually and feature-wise, with nothing lost from the old `apps/landing` + `apps/docs`.

Main at merge of the cutover: `33747dd`. All work merged via PRs; commits authored Ravindra Kumar <ravidsrk@gmail.com>, no agent trailers.

## Design-adoption matrix (complete)

| Design screen / capability | Product before | Class | Status |
|----------------------------|----------------|-------|--------|
| Design system (tokens, terminal-dark theme, Space Grotesk + JetBrains Mono, shield mark, Nav/Footer) | landing already on-brand | MATCH-RESKIN | DONE — `apps/web` foundation (PR #64) |
| Landing `/` (13 sections: hero/terminal mock, stats, pillars, two-ways-in, pipeline, AI example, features, config, comparison, plugins, honest, CTA) | had it (vite-react-ssg) | MATCH-RESKIN | DONE — PR #65, real content (probe A1-A8) |
| `/pricing` (3 tiers, compare matrix, 8-Q FAQ + FAQPage JSON-LD) | had it | MATCH-RESKIN | DONE — PR #66 |
| `/comparisons` (15-row × 6-vendor matrix, head-to-head, migration) | had it | MATCH-RESKIN | DONE — PR #66 |
| `/changelog` (Unreleased/0.2.0/0.1.0 timeline) | had it | MATCH-RESKIN | DONE — PR #66 |
| `/brand` (5 sections: mark/color/type/voice/messaging) | had it | MATCH-RESKIN | DONE — PR #66 (no footer, per design) |
| `/docs` + `/docs/$slug` (one docs system: sidebar/TOC/breadcrumb/pager/redirect/404) | TWO systems (landing internal + Fumadocs) | ENHANCE + CONSOLIDATE | DONE — PR #67, all 37 articles ported |
| SEO depth (per-route canonical/OG/Twitter), JSON-LD, sitemap, robots, llms.txt, favicons, og-image, 404 | on landing | MATCH-RESKIN | DONE — PR #68 (sitemap rebuilt: 6 routes + 37 slugs) |
| Deploy on Cloudflare Workers (was Pages) | CF Pages, 2 projects | BUILD-NEW | CODE DONE — PR #69; live deploy blocked on token (see residual risks) |
| Live GitHub stars, real content/assets everywhere | had it | MATCH-RESKIN | DONE |

Nothing dropped: every marketing fact (exact prices, 15-row matrix, 8-Q FAQ, full changelog, validation numbers, brand tokens), all 37 docs articles, SEO infra, and assets carried over. Old `apps/landing` + `apps/docs` removed in the cutover (PR #69); `apps/` now = `demo`, `web`.

## Test / build / CI summary

- GitHub CI on main (`33747dd`): PASS — jobs `test` (Node 20 & 22), `e2e`, `lint`, `docs-links`, `build` (incl. CLI bundle-size gate) all green.
- `apps/web` test files: smoke, home, pricing, comparisons, changelog, brand, docs, seo-assets — behavior-exercising (render via RouterProvider + route heads; content/SEO/sitemap assertions). Verified green per-branch and combined.
- Docs link checker (`apps/web/scripts/check-doc-links.mjs`, wired into CI): "37 article(s), internal links and action refs clean".
- Coverage: not regressed — the old landing's 15 vitest files are replaced by equivalent per-route suites for the new app; docs link integrity now also enforced in CI.

## Relay / process record

Per-task PLAN→CODE(@grok)→REVIEW(@codex, build-blind)→SHIP(@claude, merge+cleanup). Codex review caught real defects that build+tests passed over: a marketing changelog content drift + a design-fidelity footer, and broken docs MDX→HTML rendering (stray `<script>` + raw markdown). One Codex false-positive (foundation `getRouter` — current TanStack convention; disproven via current docs + a live SSR runtime check) was overridden with evidence. Every fix re-verified before merge.

## Merged PRs

- #63 — planning artifacts (design-spec, product-probe, gap-plan, extracted design source)
- #64 — `apps/web` TanStack foundation (chrome, tokens, fonts, router, Workers config)
- #65 — home route (real content + SoftwareApplication JSON-LD)
- #66 — pricing + comparisons + changelog + brand (real content + FAQPage JSON-LD)
- #67 — docs system + all 37 articles ported
- #68 — SEO + assets migration (sitemap, per-route OG/Twitter/canonical, llms, favicons, 404)
- #69 — cutover: remove `apps/landing` + `apps/docs`, Workers deploy, CI rewire, action refs → @v0

## Residual risks / action items

1. HIGH — Live Workers deploy requires `CLOUDFLARE_API_TOKEN` with **Workers Scripts:Edit** (was Pages-scoped). Re-run the `Deploy Web` workflow after updating the secret. PR #153 set `assets.run_worker_first=false` so `/agents.md`, `/openapi.json`, and `/.well-known/mcp.json` serve from `apps/web/public/` once deployed.
2. LOW — Doc-link checker coverage caveat (Codex): the CI checker may under-match escaped `href` in the JSON-stringified `docs-content.ts`; mitigated by app-level docs tests.
3. LOW — Post-deploy QA: confirm social-card previews (OG/Twitter) and agent surfaces on the live Workers URL.
4. INFO — Cloud-api now mirrors the OpenAPI contract at `GET /openapi.json` once `api.frontguard.dev` is deployed.

## Verdict

Design adoption is code-complete and merged on `main`. The remaining step is a successful Workers deploy (credential permission update + workflow re-run).

