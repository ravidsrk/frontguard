# RESEARCH — Track A (internal archaeology)

Baseline `5f0e141`. Recorded 2026-09-01 from git objects and `gh` payloads. No web fetches.

## Velocity

| Period | Commits | What shipped |
|---|---:|---|
| 2026-03 | 23 | `6396cbb` M1 CLI scaffold (26th); day-2 cloud + Playwright package |
| 2026-04 | 16 | npm workspaces, Fumadocs, landing polish |
| 2026-05 | 73 | D1/OAuth store, GitHub App, Vercel, Netlify, Stripe |
| 2026-06 | 449 | Frozen completion plan → v0.2.0 (17th, 114 commits that day) → v0.2.2 (21st) |
| 2026-07 | 5 | Dependabot only |
| 2026-08 | 21 | Launch audit `5e19c9c` + CLI fail-closed / Action contract |
| 2026-09 | 4 | `d4fda31` OSS-beta contract, merged as `5f0e141` |

Peak week 2026-W25: 384 commits. After 2026-06-29 (38 commits, leftover close-out + `v0` tag) the repo is idle except audit/retraction.

### R-01 — Velocity collapse after v0.2.2
- **Track:** A
- **Query category / source:** `git log --format='%cs'` monthly/weekly; tag messages
- **Relied-on passage (paraphrased):** 591 commits total; 449 in June; July is five CI bumps; August–September are audit + contract-hardening, not a new product slice.
- **Plan effect:** confirms: engineering burst ended mid-June; current red main is a hangover, not an active build

### R-02 — Last coherent milestone is v0.2.0 (disproved)
- **Track:** A
- **Query category / source:** tags `v0.2.0` (2026-06-17), `v0.2.2` (2026-06-21); `docs/launch-audit-2026-08.md`
- **Relied-on passage (paraphrased):** v0.2.0 tag calls the product “complete, full-fledged” (CLI, cloud, four integrations, MCP, Storybook, Docker, self-host). v0.2.2 is a stack upgrade. The 2026-08-29 audit says that June “code complete, only OPS remains” conclusion is false.
- **Plan effect:** new_gap: there is no later product milestone to treat as Done; v0.2.0’s claim cannot be the Phase 3 bar

## Abandoned branches

### R-03 — `origin/cursor/complete-identified-items-124b` — DELETE
- **Track:** A
- **Query category / source:** `git rev-list --left-right --count origin/main...origin/cursor/...`; `gh pr view 171`
- **Relied-on passage (paraphrased):** Tip `8748dfb` 2026-06-29. 0 unique commits vs main, 29 behind. Merge-base *is* the tip. Merged 2026-06-30 as PR #171 (“Complete identified review items: agent surfaces, OPS prep, deps, v0 tag”).
- **Plan effect:** none — leftover remote; `git push origin --delete cursor/complete-identified-items-124b`. Nothing to salvage.

### R-04 — `audit/launch-finish-2026-08` — CLEANUP (already merged)
- **Track:** A
- **Query category / source:** `git merge-base --is-ancestor`; `git worktree list`
- **Relied-on passage (paraphrased):** Tip `d4fda31` is an ancestor of `origin/main` (`5f0e141` = merge of this branch). 0 unique commits, 1 behind (the merge commit). Worktree still mounted at `/Users/ravindra/projects/frontguard-launch-review`.
- **Plan effect:** none — `git worktree remove ../frontguard-launch-review`, then delete local + `origin/audit/launch-finish-2026-08`. Do not salvage; content is on main.

### R-05 — `frontguard-baselines` — KEEP
- **Track:** A
- **Query category / source:** local branch `git log -1`; rev-list vs main
- **Relied-on passage (paraphrased):** Orphan branch `ae6ae2e` 2026-08-29 “Initialize frontguard baselines”. Not on origin as a feature branch. 1 unique / 589 behind main by construction.
- **Plan effect:** none — product storage, not an abandoned topic branch

## Issues / PRs

### R-06 — Issue #157 is a standing audit inbox, not a product bug
- **Track:** A
- **Query category / source:** `gh issue view 157` (2026-09-01)
- **Relied-on passage (paraphrased):** Title “Weekly npm audit (production tree)”. Body: automated `npm audit --omit=dev --json` with comment diffs. Created 2026-06-22. Owner 2026-08: leave open, not closable. Latest comment 2026-08-31: 0 critical/high/moderate/low. Mid-spike 2026-07-27 (1 critical `tar`, 9 high) later cleared.
- **Plan effect:** confirms: production tree 0 vulns as of 2026-08-31; do not treat #157 as a completion blocker

### R-07 — Eleven open PRs, all Dependabot; merge order after main is green
- **Track:** A
- **Query category / source:** `gh pr list --state open`; diffs vs `origin/main`
- **Relied-on passage (paraphrased):** PRs 198–208. Workflows already use `actions/setup-node@v7` (PR #184 merged 2026-08-02); PR #198 only moves **published** `action.yml:71` from `@v4` → `@v7`. `@readme/openapi-parser` is a **dev** dep used by `apps/web/src/test/openapi.test.ts`. lint-staged is husky-only. MCP SDK is a **runtime** dep of published `@frontguard/mcp`.
- **Plan effect:** new_gap: nothing merges while main is red (lint `sync-version:check`, CLI `dist/index.js` > 180000, test/e2e). After green, order:

**Safe (patch/minor, do first):**
1. #199 `@types/node` 26.1.2 → 26.4.0
2. #204 `react-dom` 19.2.7 → 19.2.8 (+ `@types/react-dom`)
3. #203 `@cloudflare/vite-plugin` lockfile patch 1.54.1 → 1.54.2
4. #201 `@vitejs/plugin-react` 6.0.3 → 6.1.1
5. #208 `@axe-core/playwright` 4.12.1 → 4.13.0 (optional)
6. #205 + #206 `vitest` / `coverage-v8` 4.1.9 → 4.1.11 **together**
7. #207 `@modelcontextprotocol/sdk` 1.29.0 → 1.30.0 (run `packages/mcp` tests)

**Risky (majors, last):**
8. #200 `lint-staged` 16.4.0 → 17.4.1 (hook CLI)
9. #202 `@readme/openapi-parser` 6.3.1 → 8.0.1 (two majors; expect `openapi.test.ts` import breakage)
10. #198 `actions/setup-node` v4 → v7 **in `action.yml` only** — three-major jump on the consumer Action; still the right alignment with in-repo workflows, but land after Action smoke is green

## Prior plans vs reality — three conflicting done-bars

Planning corpus (do not re-execute): `docs/product-completion-plan.md`, `docs/launch-audit-2026-08.md` (`5e19c9c` 2026-08-29), `docs/launch-readiness.md` (explicitly superseded by that commit), `docs/ROADMAP.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/PRODUCT.md`, `docs/fix-plan.md`, `docs/{agent-ready,arch-build,adopt,parity,upgrade,production-close}-*`, `docs/adversarial-*.md`. `docs/README.md` lists 8 files; the tree has 40+.

### R-08 — Bar 1 (maximal): product-completion-plan §8 — 2026-06-14
- **Track:** A
- **Query category / source:** `docs/product-completion-plan.md:1-9,690-716`; first commit `1adaf17` 2026-06-14; last edit `f2761bc` 2026-06-20
- **Relied-on passage (paraphrased):** Header calls this “the frozen boundary.” §8 “complete and full-fledged” test (lines 690–716) requires nine flows: (1) truthful `frontguard.dev` + demo, (2) `npm install @frontguard/cli` + compiling `init`, (3) doctor sees `FRONTGUARD_OPENAI_KEY`, (4) `run` yields diff + AI + suggested fix, (5) **GitHub App PR comment with thumbnails and Accept posting to a live cloud-api**, (6) Storybook per-story screenshots, (7) Vercel/Netlify PR-comment with no further config, (8) **`@frontguard/mcp` answers “what regressions exist on this PR”**, (9) **`docs/self-host.mdx` brings cloud up on `localhost:8787` with the same dashboard flows.** “If any of those nine flows hits a dead end, broken state, or ‘coming soon,’ the product is not complete and the build is not done.”
- **Plan effect:** new_gap: this bar is still in-tree as frozen, and it is not true of 5f0e141

### R-09 — Bar 2 (audit): launch-audit NO-GO — 2026-08-29
- **Track:** A
- **Query category / source:** `docs/launch-audit-2026-08.md:1-41`; commit `5e19c9c`
- **Relied-on passage (paraphrased):** Lines 6–8: “NO-GO for a full product launch. Prepare a focused OSS public beta after the local two-run path and CI path pass the gates below. Do not launch the hosted product yet.” Lines 38–41: shortest credible launch is “Visual checks for real app routes, in your own CI” — local MIT CLI; BYOK AI remains beta until a labeled benchmark. Lines 43–47: June “code complete, only OPS remains” is disproved.
- **Plan effect:** confirms: hosted/MCP/GitHub App/self-host are not launchable; CLI two-run + CI is the actual remaining engineering bar from this audit

### R-10 — Bar 3 (public): README + `/status` CLI-only — 2026-09-01
- **Track:** A
- **Query category / source:** `README.md:29`; `apps/web/src/routes/status.tsx:19-29`; commit `d4fda31` (merged `5f0e141`)
- **Relied-on passage (paraphrased):** README:29: “The local CLI is the supported product path. Hosted, MCP, GitHub App, and Docker Compose onboarding remain pre-release; see the launch audit for the unresolved acceptance work.” status.tsx:19 title: “The CLI is public. Integrations remain pre-release.” status.tsx:28–29: cloud API source is included; “no live default hosted endpoint or generally available hosted onboarding.”
- **Plan effect:** confirms: public surfaces already retracted to CLI-only; `/status` did not exist before `d4fda31`

### R-11 — Which bar is newest, which is followed
- **Track:** A
- **Query category / source:** commit dates above; `docs/launch-readiness.md:3-8`; `docs/ROADMAP.md:5,229-239`
- **Relied-on passage (paraphrased):** Newest bar = README + `/status` (2026-09-01), which cites and implements the 2026-08-29 audit. `launch-readiness.md` banner (added `5e19c9c`) says it is superseded. ROADMAP.md:5 (2026-06-29) still says “Remaining work is OPS/distribution” and :239 “The code is ready. The next move is distribution” — a fourth stale voice, not a fifth DoD. **Followed in code/copy on main: Bar 3, backed by Bar 2. Not followed: Bar 1 (§8), despite still calling itself the frozen boundary.**
- **Plan effect:** new_gap: Phase 3 cannot freeze Definition of Complete until Bar 1 is explicitly superseded (or re-adopted). Recommend: **freeze Bar 3** (local CLI loop + honest pre-release labels). CF-01 already proves that loop. Re-opening §8’s live GitHub App / cloud / MCP / self-host as IN would recreate the June over-claim the August audit killed.

## Original vs current intent

### R-12 — Intent delta: local CLI → maximal platform → public retraction
- **Track:** A
- **Query category / source:** `git show 6396cbb:README.md`; commits below; current README
- **Relied-on passage (paraphrased):**
  - **Original (2026-03-26 `6396cbb`):** README title “AI-powered frontend visual regression testing”; quick start `npx frontguard init` / `run --url`; features: route discovery, multi-browser, BYOK AI, git-orphan baselines, Vercel/Netlify preview detection. Status: “Under active development — M1 (Core Rendering + Pixel Diff).” No cloud, no MCP, no billing, no Slack.
  - **Deliberate expansion (not accretion), week 1 through June:** `f8c4d70` 2026-03-27 “Phase 5 — Cloud tier”; `31987b7` same day Playwright package; May 29 `ba2e8dc` GitHub App + Vercel, `625abc3` Netlify, `80779f2` Stripe; June 4 `e93f4fe` Slack; June 15 `979b820` MCP; June 14 `1adaf17` freezes all of that as IN; June 17 `v0.2.0` declares it shipped.
  - **Current (2026-09-01 `d4fda31` / `5f0e141`):** same marketing one-liner, but the supported path is local CLI only; cloud/MCP/GitHub App/Compose are pre-release source. Scope in the *tree* still includes those packages; scope in the *promise* was retracted.
- **Plan effect:** new_gap: Phase 3 DoC should match original M1 loop (now proven as CF-01) plus the Sep 1 honesty contract — not the June nine-flow platform. The extra packages stay in-repo as evaluation source unless a later hosted DoD is re-frozen.
