# Launch gate — 2026-10-19

Evaluated against `DEFINITION.md` §2 on `main` `fb6f336`.
The frozen definition was not narrowed. Angle scores were not recomputed (A-16).

**Verdict: GO** on the binding launch gate. The recorded scorecard stays at
45%. That figure is the 2026-09 audit, not a new measurement.

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Every S0 gap closed; none DEFER/ACCEPT | **PASS** | G-01..G-06, G-08, G-09 closed before T-30. G-07 closed: `/privacy`, `/terms`, and `/status` are HTTP 200 on `frontguard.dev`. |
| 2 | `main` green; Deploy Web completes | **PASS** | CI [39229749365](https://github.com/ravidsrk/frontguard/actions/runs/39229749365) on `fb6f336`: lint, build, test (22), test (24), e2e, audit, docs-links all success. Deploy Web [39229657033](https://github.com/ravidsrk/frontguard/actions/runs/39229657033) on `e0676af` succeeded. `fb6f336` does not change `apps/web`, so Deploy Web did not run again and was not cancelled. |
| 3 | CF-01…CF-04 happy and failure evidence | **PASS** | Unchanged since T-30. Files: `CF-01-local-regression-loop.txt`, `P1-a02-cli-doctor.txt`, `T-19-doctor-failure.txt`, `T-20-cf03-ci.txt`, `T-20-cf03-green.json`, `T-20-cf03-red.json`, `T-18-cf04-honesty.txt`. |
| 4 | Backup restored once | **PASS** | `T-22-d1-restore.txt`. Scratch database deleted afterwards. |
| 5 | Rollback rehearsed once | **PASS** | `T-23-rollback.txt`. Scratch worker deleted afterwards. `frontguard-web` was not rolled back. |
| 6 | Alert proven to fire | **PASS** | `T-21-actions-drill.txt`. Run 39229147720 opened and closed issue #280. A later green `main` run resolved with `did: none` (run 39229564474) because no red issue was open. |
| 7 | Stranger Test | **PASS** | `T-29-stranger-test.txt`. |
| 8 | Live site truthful; legal pages resolve | **PASS** | 2026-10-19 probe after the deploy: `https://frontguard.dev/.deploy-version` and `www` are `e0676af8aaf20109d81ce4594fcd40c795744317`. `/privacy`, `/terms`, `/status`, `/pricing` are HTTP 200. Pricing contains "not generally available" and does not contain `$29`. |
| 9 | No ACCEPT at S0; other ACCEPT has rationale and expiry | **PASS** | G-43 and G-44, both S2, expiry 2027-03-01. |
| 10 | Launch-gating Human Actions done or listed | **PASS** | H-01, H-02, H-03, H-04, H-07 done. H-05 open and does not gate. |

## Deploy Web transcript

Run 39229657033, `workflow_dispatch`, SHA `e0676af8aaf20109d81ce4594fcd40c795744317`, conclusion success.

    Expected deployed SHA: e0676af8aaf20109d81ce4594fcd40c795744317
    Canonical deployment is not at e0676af… yet (attempt 1/30, observed 'd1f1408…').
    Canonical deployed SHA: e0676af8aaf20109d81ce4594fcd40c795744317
    Probe /privacy -> HTTP 200
    Probe /terms -> HTTP 200
    Probe /status -> HTTP 200

The first probe still saw the previous worker SHA. The second saw the deploy.

## What this is not

Angle scores in `status.json` stay where A-16 left them. This file does not
raise them. H-05 (npm trusted publishing) stays open until 2027-03-01.
`cloud-api` was not deployed.
