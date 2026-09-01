# SHIPLOG — Frontguard completion run

Append-only. A session with zero context resumes from the pointer at the bottom.

---

## Run 20260901-1658 · MODE=drive

**Baseline:** `5f0e141a65651fa34823866c2ee715c913dc2c45` (main, clean)
**Audit branch:** `ravidsrk/p0-completion-audit`
**Fresh run** — no prior `docs/completion/SHIPLOG.md` existed, so R4 resume did not apply.
Note: a *different* prior audit exists in-repo (`docs/` launch audit, commit 5e19c9c, and the merged
`audit/launch-finish-2026-08` branch). It is not this pipeline's state; Phase 2 Track A reconciles it.

---

### PHASE 0 — BASELINE FREEZE · COMPLETE

- Toolchain recorded (R1). `greptile` 3.4.2 present → R11 is a real local gate, not manual fallback.
- Baseline git/PR/issue/branch state recorded in `STATUS.md`.
- Cold start executed and captured:
  - `npm ci` exit 0 (21s) → `evidence/P0-coldstart-01-install.txt`
  - `npm run build` exit 0 (12.5s) → `evidence/P0-coldstart-02-build.txt`
  - `npm test` **exit 1** → `evidence/P0-coldstart-03-test.txt`
  - CI state of the same commit → `evidence/P0-coldstart-04-ci-baseline.md`
- **Headline: `main` is red in CI** (`lint`, `build`, `test (22)`, `e2e` all failing on `5f0e141`).
  Introduced by the merge of `audit/launch-finish-2026-08`. Last green CI: 4 days earlier, PR #197.
- Assumptions logged: A-01 (npm), A-02 (no per-task worktrees), A-03 (product identity),
  A-04 (domain = devtool-oss, pending Phase 2 confirmation).
- **Exit criteria met:** baseline recorded; cold-start result captured.
- **Second look:** initial baseline framed the breakage as local test-only; re-reading adversarially
  prompted pulling CI for the same SHA, which revealed `lint` and `build` failures that do **not**
  reproduce locally. Baseline rewritten around the CI verdict. This also raised the local/CI parity
  gap as a finding in its own right (F-4-02).
- Evidence added: 4 files.

---

**RESUME POINTER: `PHASE_1`**

### PHASE 1 — 360° AUDIT · COMPLETE

Method: 8 parallel investigators (7 general + 1 security specialist) covering all 17 angles, each
hard-capped at score 1 because static reading cannot demonstrate behaviour (R13). The parent then
ran every dynamic proof and raised scores only where evidence justified it.

- **Completion score: 36.5/105 = 35%.** Angles ≥2: 1, 2, 5, 13. All others 1. None N/A.
- **CF-01 proven end-to-end** (happy + failure): init → update-baselines → run(match, exit 0) →
  mutate CSS → run(regression, exit 1, 4.97% pixels). The core product works.
- **Method error caught and corrected:** the agent shell exports `CI=true`, so every Phase 0
  "local" measurement was actually CI behaviour. True local is 4 failures, not 5; parity gap is
  4-vs-10, wider than recorded. Re-measured before scoring.
- **Security's two unknowns resolved by parent proof:** git-history secret scan CLEAN across all
  refs (the only matches are the product's own redaction regexes); netlify tarball concern REFUTED
  (`lib/core.js` is tracked). Production dep tree: 0 vulnerabilities.
- **Causal chain identified:** main red → Deploy Web cancelled → production stale → `/privacy` and
  `/terms` 404 while `/pricing` serves 200. One root cause, and it orders the plan.
- Red-suite verdicts fixed: 2 CODE bugs (exit 1 vs contract 2), 2 STALE tests (storageConstructor
  signature), 1 TEST-isolation issue (fail-closed is intended).
- Assumption added: A-05 (Appendix B weights sum to 105, not the declared 100; normalising to 105).
- **Exit criteria met:** no angle unscored; every score ≥2 has executed evidence; second look logged.
- Evidence added: 9 files.

---

**RESUME POINTER: `PHASE_2`**

### PHASE 2 — DEEP RESEARCH · COMPLETE

45 items across 4 track files, every one carrying an explicit plan effect. Confidentiality
firewall respected: all external queries were category-only; per-track query logs present.

- **Track A** found the blocker on freezing anything: three dated done-bars coexist, and the
  oldest (`product-completion-plan.md:690-716`, 2026-06-14, nine flows incl. live cloud/GitHub
  App/MCP/self-host) still calls itself frozen. Newest and actually followed is the 2026-09-01
  CLI-only public contract.
- **Track B1** reclassified two apparent S0s: Cloudflare **D1 Time Travel** and
  **`wrangler rollback`** already exist and are simply unused, so "no backups, no rollback" is a
  config/runbook gap, not a build. Also: **Node 20 is EOL** (engines and CI matrix both wrong),
  and the vitest 4.1.11 bump is a **security** fix mis-read as cosmetic.
- **Track B2** confirmed git-orphan baseline storage is a legitimate OSS pattern and that
  flaky-render mitigation is already implemented; found one launch-shaped hole
  (`actions/checkout` `fetch-depth: 1` misses the baseline ref) and that npm now prefers OIDC
  trusted publishing over long-lived tokens.
- **Track B3** (run by Main, firewall-sensitive) closed the telemetry question favourably:
  opt-in, off by default, honours `DO_NOT_TRACK`, sends no URLs/paths/screenshots/keys — stricter
  than GDPR requires. The gap is published **disclosure**, not legality. A-04 confirmed: no live
  money path, so the payments/VDA/PCI areas of Appendix D are N/A with checkable reasons.
- **Exit criteria met:** every Track B item has a fetched URL + date + paraphrase and an explicit
  plan effect; firewall logs present.
- **Second look:** the first synthesis inherited Phase 1's framing that telemetry was a privacy
  problem and backups/rollback were missing capabilities. Both were wrong in the product's favour
  and were corrected before reaching the gap register — which would otherwise have created three
  phantom engineering tasks. The inverse also fired: the "cosmetic" vitest patch is a security fix.

### PHASE 3 — DEFINITION & GAP REGISTER · COMPLETE

- `DEFINITION.md` **FROZEN** at `360c8f4`. It opens by explicitly superseding Bar 1, so no future
  session re-inherits a nine-flow platform scope. Complete = an excellent local-and-CI visual
  regression CLI (CF-01…CF-04), not a hosted platform.
- Launch gate is mechanical, 10 conditions. Notable: the required alert is "`main` went red" —
  the exact blindness that let this baseline rot unnoticed for four hours.
- Deviations logged pre-freeze: A-06 (angles 6/7 target ≥2, because both are dominated by the
  out-of-scope cloud-api; the restore and rollback proofs are demanded directly by the gate
  instead), A-07 (angle 12 via the CF-04 honesty clause).
- `GAPS.md`: 44 gaps. **28 FINISH** (9 S0, 13 S1, 6 promoted S2/S3), 14 DEFER, 2 ACCEPT.
  No ACCEPT at S0. Nothing CUT — the hosted platform is unreachable rather than half-exposed, so
  a deployment gate in the definition handles it better than deleting code.
- **Second look:** initially marked the hosted run-status bug (runs reporting `completed` without
  comparing) as CUT, which would have meant deleting working code for an unreachable surface.
  Changed to DEFER behind an explicit named deployment-gate condition — same safety, no
  destruction.

### PHASE 4 — PLAN · COMPLETE

- 30 tasks, 18 S / 12 M, **no L**. Every task names the evidence file that will exist when done.
- Longest chains: T-06 → T-28 (Node engines must precede the `lint-staged` 17 major, which needs
  Node ≥22.22.1) and P1 → T-15 → T-20 (CI comparison evidence needs a green pipeline).
- 5 Human Actions filed; **3 gate launch** (H-01 D1 retention, H-02 rollback rehearsal, H-03 alert
  channel). All three sit in P4 and block none of P1/P2/P3/P5/P6, so the agent can drive to the
  gate edge unattended. Expected terminal verdict absent human input: **CONDITIONAL GO**.
- No `TARGET_DATE`, so ordering is by dependency and no dates are invented.

---

**RESUME POINTER: `P1/T-01`**

### PHASE 5 — EXECUTION · P1 GREEN BASELINE · COMPLETE

**`main` is green.** CI success on `e5295de` (PR #209, merged with a merge commit, branch deleted).
All 10 tasks done. Completion 35% -> 40%.

Structural deviation, logged as **A-08**: R10 wants one task per branch merged when CI is green, but
`main` had six independent red causes, so no single-task PR could ever be green — R10 and R9's
green-state invariant were in direct conflict. P1 landed as one integration branch with each task
as its own commit, which is the only ordering that satisfies R9. Later phases return to
one-task-per-PR now that `main` is green.

Per-task outcomes, and three places the audit's own verdicts were wrong:

- **T-01 (G-02) — the CLI was never broken.** The two "CLI exits 1, contract says 2" failures were
  a test harness pointing at `packages/cli/node_modules/tsx/dist/cli.mjs`, which npm workspaces
  hoists to the root. `node` given a missing file exits 1 with MODULE_NOT_FOUND and the harness
  recorded that as the CLI's exit code. Verified directly: source *and* built bundle both exit 2.
  The Phase 1 verdict of "CODE bug" was wrong; it was the harness.
- **T-02 (G-03)** — stale `storageConstructor` assertions corrected against the real signature
  (`git-orphan.ts:127`) and call sites (`pipeline.ts:527,1037`). The compare assertion stays an
  exact single-argument match, so it still fails if update-mode options are threaded through.
- **T-03 (G-06)** — the e2e image-name expectation used the pipeline's *temp-file* naming; report
  images are named by the HTML reporter (`html.ts:274`), which has carried a route-index prefix
  since 5b9ff3e. The assertion was added in 89616a3 against the wrong scheme and never passed.
- **T-04 (G-05) — two guards were contradicting each other.** `sync-version` coupled
  `frontguard-example.yml` to `VERSION` (0.2.3) while `launch-examples.test.ts` requires copy-ready
  examples to pin the *published* release (0.2.2). Unsatisfiable. The fixture runs the published
  CLI from npm so it must pin a version that exists on the registry; decoupled from `VERSION`.
- **T-05 (G-04) — the bundle gate measured the wrong artifact.** It gated the 188KB library entry
  while the 330KB bin users install was unmeasured. Both now gated; library ceiling 180KB -> 200KB
  (all deps already external, so those bytes are 36 first-party modules — the same budget was
  already raised 160 -> 180 in v0.2).
- **T-06 (G-09)** — EOL Node 20 dropped; matrix `[22, 24]`, `engines >=22`. Greptile raised a
  P1 that this rejects Node 20 consumers under `engine-strict` with no Node-22-only runtime need.
  Correct. Not reverted (advertising untested support is worse) but declared as a deliberate minor
  changeset for the three published packages.
- **T-07 (G-13) — parity closed, with a negative control.** Four "remote branch adoption" tests
  committed into freshly cloned repos that inherit no git identity; a dev machine has a global one,
  a runner does not. Identity is now set via the environment. Proof: revert the fix and point
  `GIT_CONFIG_GLOBAL/SYSTEM` at `/dev/null` and exactly those four fail locally; with it, 36/36.
  CI's environment is now reproducible on a laptop. Also raised the `launch-examples` tsc timeout
  from vitest's 5s default to 60s (it takes ~10s on a runner).
- **T-08 (G-24)** — lint-staged extended to `cloud-api`; typecheck added to `packages/playwright`.
  The `apps/demo` typecheck was added and then **reverted**: its `tsconfig.json` is Next-generated
  and gitignored (`.gitignore:52`), so it cannot exist in a fresh clone. My own regression, caught
  by CI, fixed in the same branch.
- **T-09 (G-23)** — removed unused `react-router-dom`. Full tree: 2 moderate -> **0 vulnerabilities**.
- **T-10 (G-26)** — deleted both fully-merged remote branches (0 unique commits each). Worktree
  deregistered; its 490MB directory of stale build artifacts left on disk for the owner (verified
  to hold nothing unique: clean `git status`, no commits absent from main).

**Exit criteria: 3 of 4 met.** CI green on main ✓, cold start passes ✓, branch list clean ✓.
**Not met: `Deploy Web` still has not run.** Its trigger is path-filtered to `apps/web/**` and
`scripts/sync-openapi.mjs`; the P1 merge touched neither. Production remains stale, so `/privacy`,
`/terms` and `/status` still 404 (G-07). This needs an `apps/web` change to merge (T-14 or T-27),
which deploys via the repo's own automation — or an explicit owner decision to dispatch it.
Deliberately not dispatched: R15 forbids the agent performing a production deploy.

**Second look:** the branch initially shipped an `apps/demo` typecheck that passed locally and
broke CI — the exact class of defect this phase existed to eliminate, introduced by the fix for it.
Caught, reverted, and the reason recorded. It is also why T-07's fix carries a negative control
rather than just a green run: "it passes now" was precisely the evidence that failed here.

- Evidence added: 1 file (`P1-exit-green-main.txt`).

---

**RESUME POINTER: `P2/T-11`**
