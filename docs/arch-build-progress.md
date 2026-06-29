# Arch Build Progress

> RUN COMPLETE (2026-06-20). PHASE=DONE. Review frozen; all 31 confirmed findings CLOSED (28) or CODE_CLOSED (3: REL-1, SEC-2, REL-3 — code merged, acceptance tail is OPS). T_FINAL verified on BASE `e911864`. Readiness: [`docs/arch-build-readiness.md`](./arch-build-readiness.md). OPS queue: [`docs/arch-ops-actions.md`](./arch-ops-actions.md). Downstream human gates (prod deploy, OPS applies) remain human-owned. Merge != deploy.

## PHASE

`PHASE=DONE`

## Scorecard (31 findings)

| Status | Count | Notes |
|--------|------:|-------|
| **CLOSED** | 28 | Code merged; repro no longer fails from code alone |
| **CODE_CLOSED** | 3 | REL-1, SEC-2, REL-3 — OPS verification pending |
| **OPEN** | 0 | All findings addressed in code |

## Merged PRs (#71–#87)

| PR# | Role |
|-----|------|
| #71 | Adversarial review (31 findings) |
| #72 | Skeptic confirmation (31/31 confirmed) |
| #73–#86 | Fix waves (P0 through P3) |
| #87 | T_FINAL readiness into BASE |

## CODE_CLOSED — OPS tail (not executed by swarm)

| ID | OPS remainder |
|----|---------------|
| REL-1 | Staging: confirm `waitUntil` survives full Daytona run |
| SEC-2 | Pin renderer IP post-SSRF check (DNS rebinding) |
| REL-3 | Deploy DO/KV distributed rate limiter under load |

Full procedures: [`docs/arch-ops-actions.md`](./arch-ops-actions.md).

## Related artifacts

| Doc | Role |
|-----|------|
| [`adversarial-review-fresh.md`](./adversarial-review-fresh.md) | Frozen review spec |
| [`arch-build-readiness.md`](./arch-build-readiness.md) | T_FINAL acceptance output |
| [`DECISIONS.md`](./DECISIONS.md) | Run decisions + worker-launch notes |

## Changelog

| Date | Change |
|------|--------|
| 2026-06-20 | T_FINAL: 31/31 code-closed; ledger frozen at PHASE=DONE |
| 2026-06-29 | Ledger reconciled — removed stale mid-run worker rows |
