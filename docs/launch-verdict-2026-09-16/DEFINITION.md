# complete-it run 2026-09-16 — frozen Definition of Complete

**Run id:** 20260916-complete-it · **Frozen:** 2026-09-16 on `main` `947f619` (clean).
**Prior state adopted, not rewritten:** `docs/completion/` (run 20260901-1658 +
20260914-resume) ended at `CONDITIONAL_GO` with five launch-gating Human Actions
(H-01, H-02, H-03, H-04, H-07). That pipeline's `DEFINITION.md` (frozen at
`360c8f4`) remains the product finish line; R13 applies — this run may not
lower, narrow, or reinterpret it.

## Exit criteria (mechanical — each names its evidence)

| # | Criterion | Threshold | Evidence artifact | If resting on owner action |
|---|---|---|---|---|
| C-1 | S0 closure | All 9 S0 gaps in `docs/completion/GAPS.md` closed, none DEFER/ACCEPT | `evidence/gate.md` §S0 roll-up | OPEN-with-owner (names H-NN) |
| C-2 | `main` green | `lint`, `build`, `test (22,24)`, `e2e`, `audit`, `docs-links` success on head SHA; Deploy Web outcome recorded (ran or path-filtered skip) | CI run URL + `evidence/ci-head.txt` | n/a (agent-verifiable) |
| C-3 | Critical-flow evidence | CF-01…CF-04 each have happy + failure evidence under `docs/completion/evidence/` | pointer list in `evidence/gate.md` | n/a |
| C-4 | Backup restored once | Real restore into scratch target, transcript captured | transcript file | OPEN-with-owner (H-01 → T-22) |
| C-5 | Rollback rehearsed once | Real rollback performed, transcript captured | transcript file | OPEN-with-owner (H-02 → T-23) |
| C-6 | Alert proven to fire | `main`-red alert observed firing | firing proof | OPEN-with-owner (H-03 → T-21) |
| C-7 | Stranger test | Fresh clone → first successful visual comparison ≤15 min on README alone, isolated agent, headline claims corroborated via second route | `evidence/stranger-test.md` + timings | n/a |
| C-8 | Live site truthful | No advertised plan/price/capability that does not exist and work; `/privacy` + `/terms` resolve (HTTP 200) on `frontguard.dev` | `evidence/prod-probe.txt` (live curl, not CI color) | OPEN-with-owner (H-07 → T-25, H-04 → T-27) |
| C-9 | ACCEPT hygiene | No ACCEPT at S0; every other ACCEPT has rationale + expiry | `docs/completion/GAPS.md` §ACCEPT | n/a |
| C-10 | Human Actions enumerated | Launch-gating owner actions listed with exact steps; only opens rest on them | `evidence/conditions.md` | CONDITIONAL GO driver |
| C-11 | Zero untracked work | Every open PR/issue maps to merged-with-receipt, deferral, accept, or triaged-and-closed with reachability argument | `evidence/reconciliation.md` | park with named ask |
| C-12 | Clean exit | No leftover branches (mine only), no scratch files, no stray processes; worktree clean | `git status` + `git branch` in `evidence/cleanup.txt` | n/a |

## Verdict function

- **GO** iff C-1…C-12 all MET.
- **CONDITIONAL GO** iff every non-MET criterion is OPEN-with-owner on a named action in `evidence/conditions.md` with exact steps.
- Else **NO-GO** with blocking evidence.

No vague bounds: every threshold above names a count, a command, or a file.
Frozen baseline preserved beside new values: prior completion 45% (`status.json`
run 20260914-resume, gate CONDITIONAL GO at `cd5eed7`); this run re-derives
against head `947f619` without overwriting that record.
