# LOG — complete-it run 20260916-complete-it (append-only)

## 2026-09-16 — run opened on `main` `947f619` (clean, in sync with origin/main)
- Adopted prior pipeline state: CONDITIONAL GO, H-01/H-02/H-03/H-04/H-07 gating.
  No agent-side plan task unblocked (T-14/T-21..T-25/T-27 all H-blocked; T-28 done).
- New since T-30 gate (`cd5eed7`): 10 dependabot PRs #247–#256 (all opened
  2026-09-14 ~16:07–16:09Z, after the gate evaluation). These are the untracked
  work this run must disposition.
- Baseline facts: CI on HEAD green (run 34865512479); prod audit 0 vulns;
  full-tree audit 4 high, all dev-only (wrangler/miniflare/sharp chain);
  live probes match T-30 record (`/privacy` `/terms` `/status` 404 on
  frontguard.dev, 200 on workers.dev; api/app unresolving; npm 0.2.2).
- Deploy Web trigger: `apps/web/**` + `scripts/sync-openapi.mjs` only.
  8 of 10 PRs touch `apps/web/package.json` → each merge fires one deploy
  (worker-subdomain only; canonical untouched per G-07 root-cause evidence).

## 2026-09-16 — dependabot triage (X-2)
- 10 PRs reviewed on evidence (CI rollups + failure logs + file lists + audit).
- **Merged (1):** #252 zod 4.4.3→4.6.2 — all 10 CI checks green, zero review
  threads, no `apps/web/**` touch (no Deploy Web). Merged with merge commit
  `623b51c`, branch auto-deleted. Post-merge main CI pending.
- **Held on H-07 (7):** #248, #249, #250, #251, #253, #254, #255. All CI-green,
  but each touches `apps/web/package.json` → each merge fires Deploy Web,
  whose probe step fails until canonical routing (H-07) exists. Merging now
  buys red workflow runs and zero user-visible change (worker subdomain
  already current; canonical untouched). Batch after H-07. #255 first in
  that batch: it fixes the 4 high dev-tree advisories (wrangler >4.130).
- **Held for migration work (2):** #256 vitest 5 major breaks apps/web
  typecheck (jest-dom matchers gone from `Assertion` — lint log); #247
  playwright 1.63 breaks the DEP-4 exact-pin test (asserts 1.62.1) plus a
  launch-examples `@playwright/test` resolution failure. Both need
  coordinated code changes, not version bumps. Post-launch owner tasks.
- Production audit stays 0 vulns; full-tree 4 highs are dev-only.
- Post-merge CI on `623b51c` green: run 35101634515, 7/7 success.

## 2026-09-16 — stranger test (X-3) + friction fixes
- Isolated agent PASS: first comparison exit 0 at 157s/900s (743s spare);
  small mutation missed (threshold-as-configured), large mutation exit 1
  with 6 regressions. Headlines corroborated via transcript + epochs.
- F3/F5 verified already-fixed-in-source (0.2.2-vs-source skew); close on
  0.2.3 publish. Six README-class items fixed in both Quick Starts, PR #257
  merged as `b430890` (1 greptile P2 → durable transcript `b738357`, replied
  in-thread). Post-merge CI green: run 35104071248, 7/7 success.
- Product-class filed: X-G1 (S1 non-2xx warn), X-G2/X-G3 (S3 cosmetics),
  X-G4 (S2 verify regression-report images).

## 2026-09-16 — gate evaluation (X-4)
- Live probes 13:28Z: frontguard.dev unchanged (pricing sells $29+14-day,
  /privacy /terms /status 404); worker 200s; api/app unresolving; npm 0.2.2.
- Gate: C-2/C-3/C-7/C-9/C-10/C-11/C-12 MET; C-1/C-4/C-5/C-6/C-8 OPEN on
  H-01/H-02/H-03/H-04/H-07. Verdict CONDITIONAL GO (`evidence/gate.md`).
