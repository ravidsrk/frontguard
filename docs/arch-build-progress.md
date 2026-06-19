# Arch Build Progress

> RUN COMPLETE (2026-06-20). PHASE=DONE. Review frozen; all 31 confirmed findings CLOSED (28) or CODE_CLOSED (3: REL-1, SEC-2, REL-3 — code merged, acceptance tail is OPS). T_FINAL verified BASE e911864: cloud-api build/lint/typecheck PASS, vitest 447 pass / 21 pre-existing better-sqlite3 Node-26 failures (also on origin/main, not regressions), D1 migration chain 001->005 idempotent (7/7), monorepo build + action manifest green. 17 PRs merged into ravidsrk/adversarial-fresh (#71 review, #72 skeptic, #73-#86 fixes, #87 readiness). Readiness: docs/arch-build-readiness.md. OPS queue: docs/arch-ops-actions.md. Downstream human gates (BASE->main promotion, prod deploy, OPS applies) NOT done — human-owned. Merge != deploy.

# Arch Build Progress — Adversarial Fresh Run (2026-06-19)

EXTERNAL BRAIN for the coordinator. Reconstruct state from THIS FILE first, never memory.
A task advances only when its flags read true here.

## PHASE

`PHASE=DONE`

(REVIEW → REVIEW_FROZEN → FIXING → VERIFY → DONE)

## Run constants

- REPO_ROOT: `/Users/ravindra/orca/workspaces/frontguard/frontguard`
- BASE: `ravidsrk/adversarial-fresh` (local + origin synced after every merge via `git branch -f ravidsrk/adversarial-fresh origin/ravidsrk/adversarial-fresh`)
- MAINTAINER: `Ravindra Kumar <ravidsrk@gmail.com>`
- Review doc (FROZEN, §5 = fix spec): `docs/adversarial-review-fresh.md` on BASE · Decisions: `DECISIONS.md` (2026-06-19) · OPS queue: `docs/arch-ops-actions.md`
- Coordinator handle: `term_5cc503d0-94c9-473c-a50e-325aae6328cf`
- Worker launch: @grok via orca `--agent grok` worktree (autonomous); @codex review via `codex exec -s read-only -c approval_policy=never` (coordinator relays verdict → `gh pr review`); @claude integrator = coordinator (opens PR, merges). See DECISIONS.md "Worker-launch reality".
- Merge: `gh pr merge <n> --merge` into BASE (never squash). After each merge: sync local BASE ref + `git fetch`.

## Phase-0 (DONE)

| Task | Agent | Status |
|------|-------|--------|
| P0-REVIEW | @claude | DONE — PR#71 (c01b0ab). 31 findings. |
| P0-SKEPTIC | @codex | DONE — PR#72 (b04a4b3). All 31 CONFIRMED, 0 refuted. FROZEN. |

## FINDING CLOSE-INDEX (by dependency wave) — all OPEN

Severities (skeptic-final): P0×1, P1×7, P2×11, P3×12 = 31.

WAVE 1 — P0 + FOUNDATION + disjoint singles (max parallelism):
- REL-1  P0  — CODE_CLOSED via PR#73 (OPS: prod waitUntil staging-telemetry verify)  [merged → BASE 3cd8030]
- DM-1   P1  — CLOSED via PR#74 (FOUNDATION; D1 batch() atomicity; OPS: apply pending migrations to staging/prod D1)
- SEC-1  P1  — CLOSED via PR#75
- DEP-1  P1  — CLOSED via PR#75
- DEP-2  P2  — CLOSED via PR#75
- DEP-3  P3  — CLOSED via PR#75
- DEP-4  P3  — CLOSED via PR#75
- OPS-4  P3  — CLOSED via PR#75
- COU-1  P3  — CLOSED via PR#75
- OPS-1  P2  — CLOSED via PR#76
- SEC-7  P3  — CLOSED via PR#76
- SEC-5  P3  — CLOSED via PR#76
- REL-5  P3  — CLOSED via PR#76

WAVE 2 — depend on W1 foundations (REL-1, DM-1, DEP-1):
- CONC-1 P1  — CLOSED via PR#78
- COST-1 P1  — CLOSED via PR#78
- DM-2   P2  — CLOSED via PR#80
- DM-3   P2  — CLOSED via PR#80
- SEC-2  P2  — CODE_CLOSED via PR#83 (OPS: pin Daytona renderer DNS — rebinding)
- COST-2 P1  — CLOSED via PR#81
- REL-2  P1  — CLOSED via PR#79
- REL-4  P2  — CLOSED via PR#79
- REL-6  P3  — CLOSED via PR#79
- CONC-3 P2  — CLOSED via PR#84

WAVE 3 — depend on W2:
- CONC-2 P2  — CLOSED via PR#82
- SEC-4  P2  — CLOSED via PR#82
- REL-3  P2  — CODE_CLOSED via PR#85 (OPS: distributed DO/KV limiter)
- SEC-6  P3  — CLOSED via PR#85
- OPS-3  P2  — CLOSED via PR#86
- SEC-3  P3  — CLOSED via PR#77
- COST-3 P3  — CLOSED via PR#77
- OPS-2  P3  — CLOSED via PR#85

## TASK ROWS (Phase 1)

`TASK <slug> | WAVE | FILE-OWN | LANE | CLOSES | CODED PR_OPEN REVIEWED MERGED ACCEPT | OPS | PR# | WT | WORKER | NOTE`

- TASK fix-rel1 | WAVE=1 | FILE-OWN=cloud-api/src/index.ts | LANE=CODE+OPS | CLOSES=[REL-1] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t(code) | OPS=prod waitUntil staging-telemetry verify | PR#73 | WT=retired | WORKER=term_f726775c | NOTE=CODE_CLOSED; codex PASS; pipeline validated
- TASK fix-dm1 | WAVE=1 | FILE-OWN=cloud-api/src/db/{migrate.ts,schema.sql,migrations} | LANE=CODE | CLOSES=[DM-1] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=apply pending D1 migrations (staging/prod) | PR#74 | WT=retired | WORKER=term_49aa3f5c | NOTE=FOUNDATION CLOSED; codex r3 PASS after 2 fix rounds (D1 batch() atomicity, v1-baseline-only registry, rollback test). → BASE 3ce57be
- TASK fix-singles | WAVE=1 | FILE-OWN=.gitignore + report-html.ts/types.ts + slack-app + cli/pipeline.ts | LANE=CODE | CLOSES=[OPS-1,SEC-7,SEC-5,REL-5] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=none | PR#76 | WT=retired | WORKER=term_5ad3a624 | NOTE=codex PASS all 4; merged → BASE c066320
- TASK fix-action | WAVE=1 | FILE-OWN=action.yml+cli/action.yml+Dockerfile(s)+package.json+daytona-runner.ts(DEP-1) | LANE=CODE | CLOSES=[SEC-1,DEP-1,DEP-2,DEP-3,DEP-4,OPS-4,COU-1] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=none | PR#75 | WT=retired | WORKER=term_0d615336 | NOTE=7 findings CLOSED; codex r2 PASS after fixing OPS-4/run-failure-regression/pin-guard → BASE ea29937
- TASK fix-core1 | WAVE=2 | FILE-OWN=cloud-api/src/index.ts + d1-store.ts | LANE=CODE | CLOSES=[CONC-1,COST-1] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=load-verify cap/limit at scale | PR#78 | WT=retired | WORKER=term_3280b9b7 | NOTE=codex PASS; atomic reservation + caps → BASE 914fe8b
- TASK fix-sched | WAVE=2 | FILE-OWN=cloud-api/src/scheduler.ts + processor.ts | LANE=CODE | CLOSES=[REL-2,REL-4,REL-6] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=none | PR#79 | WT=fix-sched | WORKER=term_8f8d1651 | ROUND=2 task_105470ba0400 | NOTE=codex r1 FAIL (REL-2 lossy route↔R2-key mapping; REL-4 unfair overflow carry/starvation; REL-6 PASS) → round-2 fixing
- TASK fix-datamodel | WAVE=3 | FILE-OWN=schema.sql + d1-store.ts + migrations + billing.ts + DM-3-index.ts(/v1/run only) | LANE=CODE | CLOSES=[DM-2,DM-3] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=apply D1 v002 (staging) | PR#80 | WT=fix-datamodel | WORKER=term_c31146f7 | task_0f7771f52bcf | NOTE=cascade deletes + team-pooled usage; new v2/v3 migrations (CLOSED PR#80)
- TASK fix-dm2 | WAVE=3 | FILE-OWN=d1-store.ts + schema/migrations + teams.ts | LANE=CODE | CLOSES=[CONC-2,SEC-4] | CODED=f PR_OPEN=f REVIEWED=f MERGED=f ACCEPT=f | OPS=apply new D1 migration | PR#- | WT=fix-dm2 | WORKER=term_cf93b820 | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t (note: flags above stale) | NOTE=CONC-2+SEC-4 CLOSED; codex r2 PASS; clean auto-merge with COST-2 → BASE 14abcb0
- TASK fix-ssrf | WAVE=3 | FILE-OWN=index.ts(SSRF call) + daytona-runner.ts + new shared util + vercel | LANE=CODE | CLOSES=[SEC-2] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t(code) | OPS=DNS-rebinding renderer pin | PR#83 | WT=retired | WORKER=term_6b5f2038 | NOTE=CODE_CLOSED; codex r3 PASS (pure-TS edge-safe, mapped-IPv6/obfuscated blocked, DoH fail-closed); 3 fix rounds → BASE 594176a
- TASK fix-billing | WAVE=3 | FILE-OWN=stripe.ts + billing.ts | LANE=CODE | CLOSES=[COST-2] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=none | PR#81 | WT=retired | WORKER=term_57f7ae05 | NOTE=codex r2 PASS (robust team resolution); webhook intact → BASE ad7e57f
- TASK fix-authkeys | WAVE=2 | FILE-OWN=cloud-api/src/routes/auth.ts + keys.ts | LANE=CODE | CLOSES=[SEC-3,COST-3] | CODED=t PR_OPEN=t REVIEWED=t MERGED=t ACCEPT=t | OPS=none | PR#77 | WT=retired | WORKER=term_d3e58fa5 | NOTE=codex PASS; hashing intact → BASE 7d0e743

## HOT-FILE COLLISION MAP (serialize per file)

- `cloud-api/src/index.ts` → REL-1, REL-3, CONC-1, COST-1, SEC-2, SEC-6, OPS-3  (SERIALIZE)
- `cloud-api/src/db/d1-store.ts` → CONC-1, CONC-2, DM-2, DM-3, CONC-3, SEC-4  (SERIALIZE)
- `cloud-api/src/scheduler.ts` → REL-2, REL-4, REL-6, CONC-3  (SERIALIZE)
- `cloud-api/src/db/schema.sql` → DM-1, DM-2, DM-3, SEC-4  (SERIALIZE)
- `cloud-api/src/db/migrate.ts` → DM-1
- `action.yml` + `packages/cli/action.yml` → SEC-1, DEP-1, OPS-4, COU-1  (SERIALIZE → one action lane PR)
- `cloud-api/src/daytona-runner.ts` → DEP-1, SEC-2  (SERIALIZE)
- `packages/cli/Dockerfile` → DEP-1, DEP-2  (SERIALIZE → action lane)
- `cloud-api/wrangler.toml` → OPS-2, SEC-6  (SERIALIZE)
- `cloud-api/src/routes/billing.ts` → COST-2, DM-3  (SERIALIZE)
- singles: stripe.ts(COST-2), auth.ts(SEC-3), keys.ts(COST-3), teams.ts(SEC-4), factory.ts(SEC-6), report-html.ts(SEC-7), pipeline.ts(REL-5), .gitignore(OPS-1)

## OPS / VERIFY-AT-SCALE QUEUE (recorded, not executed)

_Populated as findings land. Mirrors docs/arch-ops-actions.md. Expected: D1 migration apply (DM-1), wrangler secret/binding setup (OPS-1/OPS-2/SEC-6), load-verify of cap/limit (COST-1/CONC-1), waitUntil prod-verify (REL-1)._

## RECORDED DECISIONS

See `DECISIONS.md` → "Adversarial production review (FRESH RUN, 2026-06-19)" + "Worker-launch reality".

## LIVE WORKERS / BRANCHES

- fix-ssrf @grok (term_6b5f2038-96f2-4753-a068-6c04b2bf2892) — SEC-2 (shared SSRF util; index.ts + daytona-runner + vercel) — CODING. PR not opened yet.

CLOSED 25/31. Remaining OPEN: SEC-2 (in-flight), CONC-3, REL-3, SEC-6, OPS-3, OPS-2.
BASE=14abcb0. Coordinator=term_5cc503d0-94c9-473c-a50e-325aae6328cf. Worker pattern: grok via orca --agent grok worktree off BASE; codex review via `codex exec -s read-only -c approval_policy=never -o <file>` (drain stale inbox before each check --wait; messages re-deliver until drained). Merge via gh pr merge --merge; sync local BASE after each (git branch -f ravidsrk/adversarial-fresh origin/...). Self-approve blocked → post codex verdict as PR comment.

## NEXT ACTION

1. SEC-2: open PR → codex review → merge (index.ts conflict possible with later index lane; SEC-2 is FOUNDATION-util, land first).
2. After SEC-2 merges → launch FINAL TAIL (2 lanes, disjoint):
   - fix-conc3: CONC-3 (cron lease; scheduler.ts + d1-store.ts) — scheduler+d1-store owner.
   - fix-index2: REL-3 + SEC-6 + OPS-3 + OPS-2 (index.ts rate-limit + prod-mode flag + dead-letter/visibility + wrangler placeholder guard) — owns index.ts + factory.ts + wrangler.toml + processor.ts. SERIALIZE internally; OPS-2 (wrangler) after SEC-6 (wrangler.toml). NOTE: OPS-3 touches scheduler.ts+processor.ts which CONC-3 also touches → if running both concurrently, keep fix-index2 OPS-3 OFF scheduler.ts (do dead-letter in index/processor) OR serialize fix-conc3 first then fix-index2. Safest: run fix-conc3 first (scheduler+d1-store), merge, then fix-index2.
3. T_FINAL (@grok): full cloud-api build+lint+test green on BASE (verify COST-2↔CONC-2 auto-merge is semantically sound), write docs/arch-build-readiness.md, ship as final PR into BASE. Then FINAL report.

OPS queue (docs/arch-ops-actions.md): apply D1 migrations v002+v003 (staging/prod); REL-1 waitUntil staging telemetry; COST-1/CONC-1 load-verify. All human-owned. BASE→main promotion = human meta-PR.

1. Await fix-dm1 r3 + fix-action r2 worker_done → re-review → merge (DM-1 is FOUNDATION; if r3 FAILs, mark BLOCKED + surface).
2. After DM-1 merges: launch WAVE 2. Serialize per hot file. Plan:
   - cloud-api index.ts chain (serial): CONC-1+COST-1 → SEC-2 → REL-3+SEC-6+OPS-3 (each after prior merges).
   - schema/d1-store chain (serial, after DM-1): DM-2+DM-3 → CONC-2 → SEC-4. (DM-2/DM-3 add real v2+ migrations via DM-1.)
   - scheduler chain (serial, after REL-1): REL-2+REL-4+REL-6+CONC-3 (one PR; scheduler.ts owner).
   - billing (after DM-3 billing.ts): COST-2.
   - singles parallel: SEC-3(auth.ts), COST-3(keys.ts), OPS-2(wrangler, after SEC-6).
3. Concurrency cap ~3 grok lanes; index.ts vs schema/d1-store vs scheduler are 3 disjoint serial chains → run as 3 parallel lanes.
