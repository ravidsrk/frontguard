# Reconciliation — live PRs/issues (C-11), 2026-09-16

Rule: every open item maps to merged-with-receipt, deferral, accept, or
triaged-and-closed. No silent skips.

## PRs merged in this run (1)

| PR | Change | Receipt |
|---|---|---|
| #252 | zod 4.4.3→4.6.2 | Merge commit `623b51c`, branch deleted, zero review threads, CI green pre- and post-merge (run 35101634515). No `apps/web/**` touch → no Deploy Web. |

## PRs merged in this run — run's own (2)

| PR | Change | Receipt |
|---|---|---|
| #257 | Stranger-friction README fixes + durable transcript | Merge commit `b430890`, branches deleted, 1 greptile P2 fixed in `b738357` + replied in-thread (reply 4026687748), 11/11 checks green. No `apps/web/**` touch → no Deploy Web. |
| #258 | This run-record PR (self-entry) | Docs-only. Pre-merge: 11/11 checks green, greptile P1 answered in-thread (see termination rule in `gate.md`). Post-merge: merge SHA + CI run recorded in the closing LOG entry; branches deleted. No `apps/web/**` touch → no Deploy Web. |

## PRs held on H-07 — batch after canonical routing (7)

All CI-green individually, but each touches `apps/web/package.json`, so each
merge fires Deploy Web, whose probe step deterministically fails until H-07
(canonical `frontguard.dev` not routed to the worker). Merging now produces
red workflow runs and zero user-visible change. Owner action: after H-07,
merge in this order (security first), each with a merge commit:

1. #255 wrangler 4.127.1→4.131.1 — **first**: fixes the 4 high dev-tree
   advisories (wrangler range patched above 4.130.0).
2. #248 @types/node group 26.4.0→26.5.1 (patch).
3. #250 @tanstack/react-start 1.168.49→1.168.52 (patch).
4. #251 vite 8.2.2→8.3.0 (minor).
5. #253 globals 17.11.0→17.12.0 (minor).
6. #249 @readme/openapi-parser 8.0.1→9.0.0 (major, CI-green — review changelog).
7. #254 jsdom 29.1.1→30.0.1 (major, CI-green — review changelog).

Dependabot may rebase/conflict these in the meantime; re-verify green checks
at merge time. None blocks any gate item: production audit is 0 vulns with
or without them.

## PRs held for migration work (2, post-launch owner tasks)

- #247 playwright group (→1.63.0): CI `test (22)` FAILURE, confirmed still
  red after dependabot rebase (`1d522a9`). Two failures: (a) DEP-4 exact-pin
  test asserts playwright `1.62.1` — the bump requires a deliberate pin
  update + browser-build verification (render determinism); (b)
  launch-examples `@playwright/test` type resolution failure on that branch.
  Owner task: update pin + assertion together, verify `playwright install`
  resolves the matching build, re-run CI. Not a version bump.
- #256 vitest 4.1.11→5.0.0: CI `lint` FAILURE. Vitest 5 drops the implicit
  jest-dom matcher types (`toBeInTheDocument`, `toHaveTextContent`,
  `toHaveAttribute` — `error TS2339` across `apps/web/src/test/`). Owner
  task: vitest 5 migration (setup/types), then re-run. Not a version bump.

## Issues (1)

- #157 Weekly npm audit (production tree): standing tracker, owner-triaged
  keep-open 2026-08-28. Latest report 2026-09-14: 0 critical/high/moderate/low.
  Disposition: ACCEPT as process (not a defect), no expiry — it is the monitor.

## Result

Zero untracked work: 2 merged with receipts, 7 held-with-owner-action (H-07
batch), 2 held-with-owner-task (migration), 1 accepted standing tracker.
