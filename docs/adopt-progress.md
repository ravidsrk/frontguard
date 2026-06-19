# Adopt Progress — Frontguard TanStack design adoption

External brain / ledger. A task advances only when its flag reads true HERE.
Flags: PLANNED / BUILT / REVIEWED / SHIPPED. Terminal = all four true.

## Run state

- Coordinator: Orca worktree `completion`, branch `ravidsrk/completion`.
- Design: project `1672c1a0-ad29-455b-8025-5d38a1d1728e` (readable via DesignSync). Extracted verbatim to docs/design-extract/tanstack/.
- Approach: FULL TanStack migration → new `apps/web` on Cloudflare Workers; cut over (remove apps/landing + apps/docs); port entire content floor. Merge: auto-merge to main.
- Planning docs (frozen): docs/design-spec.md, docs/product-probe.md, docs/gap-plan.md.
- Phase: BUILD.

## Planning ledger

- T-IMPORT:  PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — design extracted → docs/design-extract/ + docs/design-spec.md. DONE.
- T-PROBE:   PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — product probed → docs/product-probe.md. DONE.
- T-PLAN:    PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — gap analysis → docs/gap-plan.md (FROZEN). DONE.

## Build ledger

- T-FOUNDATION:  PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — scaffold apps/web (foundation+chrome+tokens). branch ravidsrk/web-foundation. [gates all]
- T-HOME:        PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — / route, 13 sections + real content + SEO/JSON-LD + tests. branch ravidsrk/web-home. [dep: FOUNDATION]
- T-PRICING:     PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — /pricing, tiers+matrix+FAQ+JSON-LD+tests. branch ravidsrk/web-pricing. [dep: FOUNDATION; parallel]
- T-COMPARE:     PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — /comparisons, 15-row matrix+tests. branch ravidsrk/web-compare. [dep: FOUNDATION; parallel]
- T-CHANGELOG:   PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — /changelog timeline+tests. branch ravidsrk/web-changelog. [dep: FOUNDATION; parallel]
- T-BRAND:       PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — /brand 5 sections+tests. branch ravidsrk/web-brand. [dep: FOUNDATION; parallel]
- T-DOCS:        PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — /docs + $slug, PORT all 37 articles+tests. branch ravidsrk/web-docs. [dep: FOUNDATION; largest]
- T-SEO-ASSETS:  PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — assets+sitemap rebuild+llms+404+tests. branch ravidsrk/web-seo-assets. [dep: FOUNDATION]
- T-DEPLOY-CI:   PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — cutover: deploy-web.yml, remove old apps, unify action ref, CI. branch ravidsrk/web-deploy-cutover. [dep: ALL routes+docs+seo]
- T_FINAL:       PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — verification → docs/adopt-readiness.md. branch ravidsrk/web-readiness. [dep: ALL]

## Live workers / worktrees / branches

- (starting T-FOUNDATION)

## Next ready wave

- T-FOUNDATION (solo — gates everything). On SHIP, fan out T-HOME/PRICING/COMPARE/CHANGELOG/BRAND/DOCS/SEO-ASSETS in parallel.
