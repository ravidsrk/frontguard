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

- T-FOUNDATION:  PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  PR#64 MERGED to main (999317a). REVIEWED: codex round-1 FAIL was a disproven false-positive (getRouter IS current convention; runtime SSR verified). Merged by user (manual) + all CI green (test 20/22, e2e, lint, docs-links, build). Extra commit 9f62a99 (Node-20 vite-plugin pin, author clean) included. Branch deleted. DONE.

### Build wave A (regrouped to 3 parallel workers for convergence — see DECISIONS.md)
- T-HOME:      PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — PR#65 MERGED (c6706a1). Codex PASS. Worktree removed. DONE.
- T-MARKETING: PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — PR#66 MERGED (0ea2726). Fix r2 verified (changelog A11 exact, /brand no Footer, render-based tests), build/typecheck/lint/test green. Worktree + branch removed. DONE. SEO OG/Twitter/canonical depth DEFERRED to T-SEO-ASSETS.
- T-DOCS:      PLANNED=t BUILT=t REVIEWED=t SHIPPED=t  — PR#67 MERGED (198914b). Fix r2 verified: 0 script/markdown/backtick artifacts across 764KB, marked v18 converter (devDep), nav aligned, build/test green. Worktree + branch removed. DONE.
  WAVE A COMPLETE: foundation+home+marketing+docs all on main. CI green through 0ea2726; docs-merge CI in_progress (combined build). Local sharp install quirk noted (env-only; CI builds clean).
  RELAY LESSON: after worker_done, must `task-update --status completed` the round-1 task to free the terminal before re-dispatching a fix (else "already has an active dispatch").
  CUTOVER NOTE: apps/web/scripts/generate-docs-content.mjs reads apps/docs (one-time import tool, NOT in build). T-DEPLOY-CI must remove/neutralize it when apps/docs is deleted so CI/regeneration doesn't break.
### Build wave B (after wave A merges)
- T-SEO-ASSETS:  PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — assets + sitemap rebuild + llms + 404 + tests. branch ravidsrk/web-seo-assets.
- T-DEPLOY-CI:   PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — cutover: deploy-web.yml (Workers), remove apps/landing+apps/docs, unify action ref, CI. branch ravidsrk/web-deploy-cutover. [dep: ALL]
- T_FINAL:       PLANNED=t BUILT=f REVIEWED=f SHIPPED=f  — verification → docs/adopt-readiness.md. branch ravidsrk/web-readiness. [dep: ALL]

## Live workers / worktrees / branches

Coordinator handle: term_bcfc5804-42a0-4c27-9091-0b50b1eda328.
WAVE A: all merged + worktrees/branches removed (foundation/home/marketing/docs).
WAVE B in progress:
- T-SEO-ASSETS: PLANNED=t BUILT=t REVIEWED=t SHIPPED=t — PR#68 MERGED (01388a8). Codex FAIL r1 (missing head tags) → fix r2 restored sized favicons/apple-touch/theme-color/author/keywords/referrer/X-Content-Type-Options + og:image dims; verified + green. Worktree+branch removed. DONE.
- T-DEPLOY-CI (cutover): PLANNED=t BUILT=t REVIEWED=t SHIPPED=t — PR#69 MERGED (33747dd). Codex PASS + thorough coordinator verification. apps/landing+apps/docs removed; Workers deploy wired; CI rewired; action refs @v0. Worktree+branch removed. DONE.
- T_FINAL: PLANNED=t BUILT=t REVIEWED=t SHIPPED=t — main CI (test 20&22/e2e/lint/docs-links/build) GREEN on 33747dd; all worktrees clean; no open PRs; docs/adopt-readiness.md written. DONE.

## TERMINAL — all rows PLANNED=t BUILT=t REVIEWED=t SHIPPED=t. adopt-readiness.md exists.
RESIDUAL (external, flagged in report + readiness): Deploy Web workflow fails on CLOUDFLARE_API_TOKEN lacking Workers Scripts:Edit (was Pages-scoped) — account owner must update the secret + re-run. Code/workflow correct.
- NOTE: user is hands-on (fixed Node-20 CI + manually merged PR#64). Re-fetch origin/main before each new worktree/merge; user may push.

## Next ready wave

- WAIT on wave A worker_done (loop 3). Per finisher: verify build → open PR → codex build-blind review → merge to main → cleanup. After all 3 merge: wave B (T-SEO-ASSETS), then T-DEPLOY-CI cutover, then T_FINAL.
