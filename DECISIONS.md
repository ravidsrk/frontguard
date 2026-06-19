# DECISIONS — Frontguard design adoption (TanStack)

Coordinator log for the autonomous design-adoption run. Append-only rationale.

## Setup facts (verified, not assumed)

- Repo: `/Users/ravindra/projects/frontguard`; coordinator runs in Orca worktree `completion` on branch `ravidsrk/completion`.
- Orca runtime: ready. Orchestration: working (stale Praxis tasks present, left untouched — no reset).
- GitHub: authenticated as `ravidsrk`, repo `github.com/ravidsrk/frontguard`.
- Worker CLIs present: `grok`, `codex`, `claude`.
- Design source: `DesignSync` built-in tool (NOT a `claude_design` MCP connector — that does not exist here). Project `1672c1a0-ad29-455b-8025-5d38a1d1728e` = "Frontguard branding project", type `PROJECT_TYPE_PROJECT`, owner Ravindra Kumar. Read access works after `/design-login` + account alignment.

## Directive corrections (the templated command was wrong about several things)

1. `__SOURCE_PATH__`/`__PRODUCT_NAME__`/`__POSITIONING__` arrived as literal unfilled placeholders. Resolved: source=`/Users/ravindra/projects/frontguard`, product=`frontguard`, positioning="AI-powered frontend visual regression testing for web teams" (from README; user did not override).
2. Directive assumed a `claude_design` MCP connector; reality is the built-in `DesignSync` tool. Design was initially 404 (wrong account); resolved by user.

## User-confirmed decisions (via AskUserQuestion)

- ADOPTION APPROACH: **Adopt the TanStack build.** Replace `apps/landing` (React/Vite SPA) and `apps/docs` (Next.js) with the design's TanStack Start + Cloudflare Workers implementation (`tanstack/` in the design project). Matches the design 1:1 and the user's CF/Workers stack defaults.
- MERGE POLICY: **Auto-merge to main.** Each PR that passes Codex review auto-merges to `main` (merge commit, commits preserved, branch deleted, worktree cleaned). User explicitly confirmed, satisfying the standing "confirm once before main" rule.
- DIRECTION (re-confirmed after probe): **Full TanStack migration.** Probe surfaced that the product already matches the design visually (landing is already amber/Space Grotesk/JetBrains Mono/shield/terminal) and the design build is content-LIGHTER than the product (12 design docs vs 37 real MDX articles; no tests/SEO in the design). User was shown this and still chose full migration: rebuild the site as the design's TanStack Start app on Cloudflare Workers, replacing apps/landing + apps/docs, PORTING the entire content floor (all 37 docs, 15 landing tests re-created, SEO/JSON-LD/sitemap/llms.txt, live GitHub stars, real marketing content) so nothing is lost. Aligns with the user's Workers-over-Pages stack default (current deploy is CF Pages; design moves to Workers).

## Coordinator execution decisions (autonomous, logged)

- DESIGN EXTRACTION: pull the design's `tanstack/` source verbatim via `DesignSync get_file` into the product as the new web app, rather than asking a worker to reimplement from a spec. Maximizes visual+feature fidelity and de-risks the relay.
- DECOMPOSITION: adoption target is ONE cohesive TanStack app, not 6 independent screens. Forcing per-screen parallel worktrees would just create merge conflicts in one app. So the build is structured as a small number of dependency-ordered, coherent PRs (foundation/app-scaffold first, then real-content fidelity per area, then old-app removal + CI/deploy), not artificial per-screen parallelism. Genuinely independent work (e.g. product probe vs design import) still runs in parallel.
- CONTENT FLOOR ("nothing lost"): the design's content is partly placeholder. Real product content (docs articles from `apps/docs`, changelog from `CHANGELOG.md`, pricing, comparisons, validation numbers) must be carried over so no existing capability/content is dropped.
- RELAY: @grok codes, @codex reviews the PR build-blind, @claude (coordinator) ships+merges+cleans. Reassign to coordinator only if a worker circuit-breaks (3 failures), as the directive permits.
- REVIEW MECHANISM: codex runs as `codex exec -s read-only -c approval_policy=never -c model_reasoning_effort=high` (sandboxed; the `--dangerously-bypass-approvals-and-sandbox` form was correctly blocked by the auto-mode classifier as unauthorized). Coordinator feeds codex the PR diff (lockfile excluded) + reference docs, codex returns a verdict, coordinator posts the `gh pr review`. Keeps cross-model independence without disabling the sandbox.

## Review adjudication log

- PR#64 (T-FOUNDATION), codex round-1 = FAIL. Sole blocking claim: `apps/web/src/router.tsx` exports `getRouter()` instead of the design extract's `createRouter()`, allegedly breaking the TanStack Start server-entry. INVESTIGATED and found to be a FALSE POSITIVE (build-blind reviewer reasoned from the stale 1.131 extract):
  1. Installed `@tanstack/react-start` is 1.168.26, not the extract's 1.131.7.
  2. Context7 (current official `react-start` docs) confirms the CURRENT convention IS `export function getRouter()` wrapping `createRouter` from `@tanstack/react-router` — exactly what grok wrote. `export function createRouter()` is the OLD 1.131 form.
  3. Runtime proof: coordinator ran `npm run dev`; workerd served SSR at HTTP 200 with the correct title, fonts, amber shield mark, nav, footer, and TanStack Start hydration markers. SSR via server-entry + getRouter works.
  Action: re-reviewed (round 2) with corrected facts + runtime evidence rather than bouncing correct code to grok (which would have broken the build against 1.168). Codex's valid secondary note (smoke test doesn't exercise the server-entry) is logged as a follow-up; coordinator's runtime SSR check compensates for foundation.
