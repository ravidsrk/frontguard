# Definition of Complete — Frontguard

**Status: FROZEN at Phase 3.** `frozen_at` is recorded in `status.json` at the commit that
introduced this file. After this point, R6 applies: no new features, screens, endpoints, options,
or integrations. The only admissible additions are S0/S1 gaps tied to a named critical flow below.
R13 applies: this definition may not be lowered, narrowed, or reinterpreted to make the gate pass.

---

## 0. Supersession notice — read this first

Three dated done-bars exist in this repository. This document **explicitly supersedes** the oldest,
which was never retracted and still describes itself as the frozen boundary:

| Bar | Source | Dated | Status |
|---|---|---|---|
| 1 | `docs/product-completion-plan.md:690-716` | 2026-06-14 | **SUPERSEDED by this document.** Its nine-flow scope — live GitHub App, hosted cloud API, MCP, self-host — is **not** the completion target. |
| 2 | `docs/launch-audit-2026-08.md:6-8` | 2026-08-29 | Consistent with this document (NO-GO, CLI/CI only). Retained as history. |
| 3 | `README.md:29`, `apps/web/src/routes/status.tsx:19` | 2026-09-01 | **The public contract. This document formalises it.** |

Frontguard is complete when it is an **excellent local-and-CI visual regression CLI**. It is not
incomplete for lacking a hosted platform it does not claim to offer. A task in P1 annotates Bar 1
in-place so no future session re-inherits it.

---

## 1. Critical flows and their acceptance evidence

Complete means all four of these are demonstrated working with captured evidence — happy path and
one realistic failure path each (R5).

| id | Flow | Entry | Acceptance evidence required |
|---|---|---|---|
| **CF-01** | Local visual regression loop | `frontguard init` → `update-baselines` → `run` | Transcript: baseline captured; unchanged run exits 0 "All pages match"; mutated page exits 1 with a diff percentage. **Already satisfied** — `evidence/CF-01-local-regression-loop.txt` |
| **CF-02** | Environment onboarding | `frontguard doctor` | Transcript of all checks on a clean machine, plus one deliberately broken environment producing actionable guidance |
| **CF-03** | CI comparison against pushed baselines | The documented GitHub Action path | A real workflow run: baselines pushed, comparison green on an unchanged commit, and **red on a deliberately regressed commit**. Must work with the documented `actions/checkout` configuration |
| **CF-04** | AI classification of a regression | `run` with a provider key | Either a captured run showing classification working end to end, **or** — if accuracy remains unmeasured — public claims reduced to what is demonstrable. Marketing an unmeasured capability is not complete |

**CF-02 note:** `doctor` currently passes (`evidence/P1-a02-cli-doctor.txt`) but has no
failure-path evidence. That is a required addition, not a formality: `doctor` is the onboarding
surface, and its value is entirely in what it says when something is *wrong*.

---

## 2. Launch gate (binding)

The gate is mechanical. Every line must be true, with evidence, before a GO verdict:

1. **Every S0 gap is closed.** No S0 may be `DEFER` or `ACCEPT` (R13).
2. **`main` is green in CI** — `lint`, `build`, `test (matrix)`, `e2e`, `audit`, `docs-links` all
   passing on the head commit, and `Deploy Web` completing rather than cancelling.
3. **Each of CF-01 … CF-04 has happy-path and failure-path evidence** in `evidence/`.
4. **Backup restored once**, from a real restore into a scratch target, with the transcript captured.
5. **Rollback rehearsed once**, actually performed, with the transcript captured.
6. **One alert proven to fire.** For this product the meaningful alert is *`main` went red* — the
   condition that started this audit and went unnoticed for four hours. Proof = the alert firing.
7. **Stranger Test passed**: clone → first successful visual comparison in ≤15 minutes using the
   README alone.
8. **The live site is truthful**: no advertised plan, price, or capability that does not exist and
   work. `/privacy` and `/terms` resolve.
9. **No `ACCEPT` at S0**, and every `ACCEPT` elsewhere carries a written rationale and an expiry date.
10. **Launch-gating Human Actions are enumerated** and either done or explicitly listed as the only
    outstanding items (which yields CONDITIONAL GO, not GO).

## 3. Minimum score per angle

Default from the framework: **≥3 on angles 1–9, ≥2 on angles 10–17.** Two deviations, logged:

- **Angle 6 (Data) target lowered to ≥2** and **angle 7 (Infra) to ≥2** — recorded as **A-06**.
  Reason: both angles are dominated by `cloud-api`, which this definition places out of scope
  (§4). Requiring ≥3 would force scoring an undeployed subsystem that the frozen definition says
  must not be deployed yet. The backup and rollback proofs are still required by the gate above —
  they are demanded directly rather than through an angle score.
- **Angle 12 (AI) target is ≥2** as published, but satisfied via CF-04's honesty clause: either
  measure accuracy or stop claiming it. Recorded as **A-07**.

## 4. Explicitly out of scope

Frozen so it cannot be re-litigated. None of the following counts against completion:

- **Hosted execution via `cloud-api` (CF-05).** Not deployed; `api.frontguard.dev` does not
  resolve. **Hard deployment gate:** `cloud-api` must not be deployed to production until (a) a
  user data erasure path exists, (b) a restore-tested backup exists, (c) the run-status
  correctness bug is fixed — a run must never report `completed` without having compared. Until
  then its security findings (rate-limit ordering, session revocation, CORS, `/v1/usage` limits,
  `DELETE` team scope) are deferred behind this gate, not ignored.
- **One-click marketplace installs (CF-06)** — GitHub App, Slack, Vercel, Netlify listings. All
  four are "in review" with third parties. Out of the product's control; not a completion blocker.
- **A hosted review/approval UI, S3-backed baseline storage.** Research confirms these are
  competitive differentiators, not table stakes, for an OSS tool in this category.
- **Billing.** No live money path exists. Deploying billing re-opens the Appendix D payments and
  PCI areas that are currently N/A, and would require its own compliance pass.
- **God-file refactors** (`pipeline.ts` 1328 lines, web `index.tsx` 1811), **coverage thresholds**,
  **OpenTelemetry instrumentation**, **PNG baseline history pruning**, **`apps/web` accessibility
  audit**. Real, filed as `post-launch`, none blocking.
- **npm trusted publishing (OIDC) migration.** The current pipeline is strong and safe; moving off
  `NPM_TOKEN` is a hardening improvement requiring a credential change, filed post-launch.

---

## 5. What "complete" therefore means, in one paragraph

A developer can `npm install` the CLI, run `doctor` and be told the truth about their environment,
`init` a config, capture baselines, and get a correct pass/fail on both an unchanged and a changed
page — locally and in CI, following only the README, in under fifteen minutes. `main` is green,
and stays green because a red `main` now pages someone. The published site tells the truth about
what the product does and what it collects, and its legal pages load. The hosted platform is
honestly absent rather than half-present. Nothing in the repository claims a different finish line.
