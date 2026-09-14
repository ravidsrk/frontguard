# T-30 — Launch gate evaluation

Evaluated 2026-09-14 against `DEFINITION.md` §2 on `main` `cd5eed7`.
This does not reinterpret the frozen definition (R13). Unmet items stay unmet.

**Verdict: CONDITIONAL GO.** Agent-side plan work that is not blocked on a Human
Action is done. Five launch-gating Human Actions remain (H-01, H-02, H-03, H-04,
H-07). H-04 was filed as non-gating; this evaluation promotes it because
`DEFINITION.md` §2 item 8 cannot pass while the live page sells a \$29 plan.
That is the outcome item 10 names. It is not GO.

---

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Every S0 gap closed; none DEFER/ACCEPT | **OPEN** | 8 of 9 S0s finished in P1/P3. **G-07 still FINISH/open**: `/privacy` and `/terms` 404 on `frontguard.dev`. Not DEFER, not ACCEPT. Blocked on H-07. |
| 2 | `main` green (`lint`, `build`, `test` matrix, `e2e`, `audit`, `docs-links`); Deploy Web completes | **PARTIAL** | CI run [34861921137](https://github.com/ravidsrk/frontguard/actions/runs/34861921137) on `cd5eed7`: lint, build, audit, docs-links, test (22), test (24), e2e all success. Deploy Web **did not run** on this SHA (no `apps/web/**` change). Last Deploy Web run [34827322407](https://github.com/ravidsrk/frontguard/actions/runs/34827322407) **failed**. Canonical domain is not the worker (H-07). |
| 3 | CF-01…CF-04 happy + failure evidence in `evidence/` | **PASS** | CF-01 `CF-01-local-regression-loop.txt`. CF-02 happy `P1-a02-cli-doctor.txt`, fail `T-19-doctor-failure.txt`. CF-03 `T-20-cf03-ci.txt` + green/red JSON. CF-04 happy: honesty `T-18-cf04-honesty.txt`. CF-04 fail: pixel-diff still exits 1 when classification is present (`packages/cli/test/diff/ai-vision.test.ts` — "pixel comparison decides pass/fail"). |
| 4 | Backup restored once, transcript | **FAIL** | T-22 blocked on H-01. No restore transcript. |
| 5 | Rollback rehearsed once, transcript | **FAIL** | T-23 blocked on H-02. No rollback transcript. |
| 6 | Alert proven to fire (`main` went red) | **FAIL** | T-21 blocked on H-03. No firing proof. |
| 7 | Stranger Test ≤15 min from README | **PASS** | `T-29-stranger-test.txt`: 9s, `run` exit 0, 9/9 match. Cold Chromium download 45s on attempt 1. Limit 900s. |
| 8 | Live site truthful; `/privacy` and `/terms` resolve | **FAIL** | Fetched 2026-09-14: `/` 200 markets AI vision as the product; `/pricing` 200 (after 308) still sells **PRO $29 / month** and a 14-day trial; `/privacy` 404; `/terms` 404; `/status` 404. G-10 + G-07. T-25 blocked on H-07. T-27 blocked on H-04 and H-07. |
| 9 | No ACCEPT at S0; other ACCEPT has rationale + expiry | **PASS** | `GAPS.md`: G-43 (no AI spend cap, BYOK) expiry 2027-03-01; G-44 (long-lived `NPM_TOKEN`) expiry 2027-03-01. Both S2. |
| 10 | Launch-gating Human Actions enumerated; outstanding ones listed | **PASS** (this is why the verdict is conditional) | Open and **gating**: H-01, H-02, H-03, H-04, H-07. Open not gating: H-05 (OIDC). Done: H-06 (superseded by H-07). |

---

## S0 roll-up

| id | Status | Closed by |
|---|---|---|
| G-01 `main` red | closed | P1 `e5295de` / `P1-exit-green-main.txt` |
| G-02 exit-code contract | closed | T-01 |
| G-03 `storageConstructor` | closed | T-02 |
| G-04 bundle budget | closed | T-05 |
| G-05 version drift | closed | T-04 |
| G-06 e2e baseline-lifecycle | closed | T-03 |
| G-07 `/privacy` `/terms` 404 | **open** | T-25 blocked on H-07 |
| G-08 checkout misses baseline ref | closed | T-15 / `T-15-ci-baseline-fetch.txt` |
| G-09 Node 20 EOL | closed | T-06 |

---

## What GO would still require

1. H-01 → T-22 restore transcript.
2. H-02 → T-23 rollback transcript.
3. H-03 → T-21 alert-firing proof.
4. H-07 → `frontguard.dev` routed to `frontguard-web`; T-25 probes `/privacy` `/terms` `/status` 200.
5. H-04 → T-27 removes or relabels the $29 trial (item 8).
6. A Deploy Web run that **succeeds** on the worker that actually serves `frontguard.dev`.

Until those exist, the frozen gate is **CONDITIONAL GO**.
