# Mechanical gate evaluation — run 20260916-complete-it

Evaluated 2026-09-16 against `docs/launch-verdict-2026-09-16/DEFINITION.md`
on `main` `b430890`. Does not reinterpret the frozen product definition
(R13). Frozen baseline preserved: prior run 45% / CONDITIONAL GO at
`cd5eed7` (`docs/completion/status.json`, `T-30-launch-gate.md`).

**Verdict: CONDITIONAL GO.** All agent-side work is done; the only opens rest
on the five named owner actions (H-01, H-02, H-03, H-04, H-07).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| C-1 | Every S0 closed, none DEFER/ACCEPT | **OPEN (owner: H-07)** | 8/9 S0s closed (T-30 roll-up still valid). G-07 open: `/privacy` `/terms` 404 on `frontguard.dev` (see C-8). T-25 blocked on H-07. |
| C-2 | `main` green; Deploy Web outcome recorded | **MET (partial recorded)** | CI run 35104071248 on `b430890`: lint, build, test (22,24), e2e, audit, docs-links all success. Deploy Web path-filtered skip on both run merges; last run failed (H-07). `evidence/ci-head.txt`. |
| C-3 | CF-01…CF-04 happy + failure evidence | **MET** | All six pointers verified present on disk 2026-09-16 (CF-01 loop, P1-a02 doctor, T-19 doctor-fail, T-20 cf03, T-18 cf04-honesty, ai-vision.test.ts). |
| C-4 | Backup restored once | **OPEN (owner: H-01)** | No transcript exists. T-22 blocked on H-01. |
| C-5 | Rollback rehearsed once | **OPEN (owner: H-02)** | No transcript exists. T-23 blocked on H-02. |
| C-6 | Alert proven to fire | **OPEN (owner: H-03)** | No firing proof exists. T-21 blocked on H-03. |
| C-7 | Stranger test ≤15 min, corroborated | **MET** | Isolated agent PASS at 157s/900s (743s spare). Headline claims corroborated via transcript + epoch arithmetic. 6 friction items fixed (PR #257), 4 filed (X-G1…X-G4), 2 already-fixed-in-source (close on publish). `evidence/stranger-test.md` + `stranger-transcript.txt`. |
| C-8 | Live site truthful; /privacy + /terms resolve | **OPEN (owner: H-07 + H-04)** | Live-probed 2026-09-16T13:28Z: `/` 200, `/pricing` 308→page still sells PRO $29 + 14-day trial, `/privacy` `/terms` `/status` 404; worker serves all 200 (deploy-version `5f447df`); api/app unresolving; npm 0.2.2. `evidence/prod-probe.txt`. |
| C-9 | ACCEPT hygiene | **MET** | GAPS.md: G-43, G-44 both S2 with rationale + 2027-03-01 expiry. No ACCEPT at S0. (This run's X-G1…X-G4 are FILED-post-launch with acceptance text, not ACCEPTs.) |
| C-10 | Human Actions enumerated | **MET (conditional driver)** | `evidence/conditions.md`: H-01, H-02, H-03, H-04, H-07 with exact steps; H-05 non-gating; publish-0.2.3 noted. |
| C-11 | Zero untracked work | **MET** | `evidence/reconciliation.md`: 2 merged with receipts (#252, #257), 7 held on H-07 with order, 2 held for migration work, #157 accepted standing tracker. |
| C-12 | Clean exit | **MET** | Zero run branches (`git branch` shows none of mine; local g-NN branches pre-date this run and are untouched); run scratch only under /tmp + this evidence dir; worktree clean after final PR merge. `evidence/cleanup.txt`. |

## S0 roll-up (unchanged from T-30 except head SHA)

G-01…G-06, G-08, G-09 closed. G-07 open on H-07.

## Score re-derivation (frozen baseline beside new values — no overwrite)

Prior: 45% CONDITIONAL GO at `cd5eed7`. This run adds: +1 dependency merge
(zod, no behavior change), +6 README friction fixes (docs-only), +1 fresh
stranger PASS with durable transcript, +4 filed gaps (1×S1, 1×S2, 2×S3).
No angle score changes: no S0 closed, no new measured capability, no
behavioral code change. Gate verdict unchanged: CONDITIONAL GO.

## What GO still requires (identical to T-30 §"What GO would still require")

1. H-01 → T-22 restore transcript. 2. H-02 → T-23 rollback transcript.
3. H-03 → T-21 alert-firing proof. 4. H-07 → routing + T-25 probes 200.
5. H-04 → T-27 pricing correction. 6. A succeeding Deploy Web run on the
worker that serves `frontguard.dev`.
Plus this run's addenda: publish 0.2.3 (closes F3/F5 skew); post-H-07 drain
the 7 held dependabot PRs (#255 first); post-launch X-G1…X-G4, #247, #256.
