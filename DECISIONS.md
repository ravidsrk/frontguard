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

---

# DECISIONS — Adversarial production review (FRESH RUN, 2026-06-19)

New, independent coordinator run. Separate from the design-adoption log above; that log is not edited.

## Self-orientation (verified)

- REPO_ROOT: `/Users/ravindra/orca/workspaces/frontguard/frontguard` (Orca-managed worktree on branch `ravidsrk/frontguard`, HEAD `de1cd2f`). This is where the coordinator lives.
- Product: **frontguard** — AI-powered frontend visual regression testing. TS npm-workspaces monorepo. Real surfaces: `packages/cli` (CLI + AI vision pipeline), `packages/cloud-api` (Cloudflare Workers + D1 + R2), `packages/mcp`, `packages/playwright`, `packages/create-frontguard-plugin`, `apps/web` (CF Workers site), `apps/demo`, `integrations/{github-app,netlify,slack-app,vercel}`, `action.yml` (GitHub Action), `validation/` (external-repo harness). Node ≥18, changesets, husky + lint-staged + eslint.
- MAINTAINER (commit authorship for every worker commit): `Ravindra Kumar <ravidsrk@gmail.com>` (from repo git config).
- BASE for this run: NEW branch `ravidsrk/adversarial-fresh` cut from `origin/main` at HEAD (`de1cd2f`), pushed to origin. Per-finding branches `ravidsrk/<slug>` cut from and PR'd into BASE. BASE→main is a human meta-PR (out of scope).
- Infra: orca runtime ready; `gh` authed as `ravidsrk` (ssh, repo scope); `gitleaks` at `/opt/homebrew/bin/gitleaks`; orchestration RPC works.
- Other worktrees present (DO NOT disturb): `/Users/ravindra/projects/frontguard [main]`, `.../completion`, `.../new-landing`. Live worker terminals from MarketIntell are running — out of scope, untouched.

## FRESH-RUN handling

- Prior review docs (`docs/adversarial-review.md`, `docs/adversarial-v020-postship.md`, etc.) are OUT OF SCOPE: not read, not cited, not reused, not overwritten. This run's review reads the CODE from scratch → `docs/adversarial-review-fresh.md`; ledger → `docs/arch-build-progress.md` (new). Orchestration global task queue holds stale Praxis/MarketIntell tasks — left untouched, NO reset. State is tracked by THIS run's task IDs + the ledger file, not the global queue.

## Launch flags / roles (autonomous defaults, recorded)

- Roles. PHASE 0: @claude REVIEWER (code-grounded findings) → @codex SKEPTIC (narrow/refute vs code) → freeze. PHASE 1: @grok codes fixes; @codex fresh build-blind reviews each PR; @claude integrator opens + merges. No agent reviews its own work.
- Worker launch: Codex `codex --full-auto`; Claude `claude` (auto/skip-permissions); Grok `grok` (auto). Effort: max/highest tier. Coordinator mode: manual orchestration loop (not `orchestration run`).
- Concurrency: machine already runs ~4 MarketIntell workers, so this run stays measured — Phase 0 sequential (1 reviewer, then 1 skeptic); Phase 1 starts at 1–2 parallel fix tasks across non-colliding files, scaled per wave. One in-flight task per hot file (review's collision map).
- Merges: real GitHub PRs into `ravidsrk/adversarial-fresh` via `gh pr merge --merge --delete-branch` (commits preserved, never squash). Merge ≠ deploy. Safety rails unconditional: testnet/staging/fixtures only; no real keys/prod/`terraform apply`/`wrangler deploy`/live env. Infra edits are code; applying them is OPS (recorded in docs/arch-ops-actions.md, not executed).

## Worker-launch reality (CLI drift + classifier — adapted, recorded)

The directive's `codex --full-auto` does NOT exist in the installed codex (codex-cli 0.141.0); it errors `unexpected argument '--full-auto'`. The autonomous-equivalent forms (`--dangerously-bypass-approvals-and-sandbox`, `-s danger-full-access -a never`) are BLOCKED by the Claude Code auto-mode classifier that governs the coordinator's own actions (it refuses to launch/drive a no-sandbox/no-approval interactive agent). Same wall the prior design-adoption run hit. Resolution (proven pattern):
- @codex roles (P0-SKEPTIC, Phase-1 PR reviews) run via `codex exec -C <worktree> -s read-only -c approval_policy=never -c model_reasoning_effort=high -o <file>` invoked by the coordinator. Codex stays the INDEPENDENT model (cross-model adversarial check); it reads code + the diff and emits a verdict; the coordinator integrates the verdict (writes doc / posts `gh pr review`) and does git. read-only + approval-never is classifier-approved.
- @claude reviewer (P0-REVIEW) ran fine via orca `--agent claude` — fully autonomous, no coordinator keystroke-driving needed.
- @grok (Phase-1 coder) will run via orca `--agent grok` worker terminals (autonomous like the claude reviewer); coordinator only dispatches the task + does integration.
- @claude INTEGRATOR = the coordinator: opens PRs, merges, applies codex verdicts, does git/gh. Does not author fixes (grok) or judge them (codex). Roles preserved.
- This is an environment adaptation, not a scope change: the review/skeptic/fix/independent-review structure is intact.

## Review adjudication log (2026-06-19 adversarial-fresh)

- PR#80 (DM-2/DM-3), codex round-1: "migration FAIL — diff shows no migrate() runner change to apply MIGRATIONS via db.batch()". FALSE POSITIVE (build-blind): the migrate() runner already applies registered MIGRATIONS via `db.batch()` + ledger insert (landed in DM-1/PR#74, on BASE, so not in this diff); the datamodel diff registers `migration002CascadeTeamUsage` in `MIGRATIONS` (migrations/index.ts:242). Verified by reading BASE migrate.ts (batch at :81) + the diff. Not bounced. DM-3 + atomicity PASSED. Only the real DM-2 defect (deleteTeam leaks R2 prefixes for the team's runs) was sent to round 2.

- PR#84 (OPS-3) round-2, codex: "run-awaited FAIL — no executionCtx.waitUntil wrapper shown; processRun detached" + "durability-test FAIL". FALSE POSITIVE (build-blind), verified against source: `index.ts` builds `const processing = processRun(...).catch(...).finally(async () => { ... await recordDeadLetter(store, {...}) ... })` (:465-:474) and passes `processing` to `c.executionCtx.waitUntil(processing)` (:488). The waitUntil wrapper landed in REL-1/PR#73 (on BASE, hence not in this diff). Per spec, `.finally()` with an async callback delays `processing`'s resolution until the awaited `recordDeadLetter` settles, so the isolate stays alive until the dead-letter insert completes — durable. scheduler-awaited + no-regression PASSED. Not bounced (round 3 would risk breaking a correct fix); merged with the adjudication recorded. Pattern matches the DM-1 migration-runner and design-run getRouter build-blind false positives.
