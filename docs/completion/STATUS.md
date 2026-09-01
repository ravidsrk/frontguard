# Frontguard — Completion Status

> Driven by `/product-completion`. Working state; rewritten each phase.

## Baseline freeze (Phase 0)

| Field | Value |
|---|---|
| Product | Frontguard — AI-powered frontend visual regression testing (inferred from README + root manifest; see A-03) |
| Repo | `/Users/ravindra/projects/frontguard` · `git@github.com:ravidsrk/frontguard.git` |
| Baseline commit | `5f0e141a65651fa34823866c2ee715c913dc2c45` ("Merge branch 'audit/launch-finish-2026-08'", 2026-09-01) |
| Branch / tree | `main` · clean |
| Default branch | `origin/main` |
| Run id | 20260901-1658 · MODE=drive |
| Audit branch | `ravidsrk/p0-completion-audit` |

### Toolchain (R1)

Agentic, write access. `git` 2.55.0 · `node` v24.20.0 · `npm` 11.19.0 · `just` 1.58.0 ·
`mise` 2026.8.16 · `gh` 2.98.0 · **`greptile` 3.4.2 (present — R11 runs for real)** · `rg` 15.1.0.

`pnpm` refuses to operate on this repo (`The "workspaces" field in package.json is not supported by pnpm`).
Package manager is npm against the committed `package-lock.json` — see A-01.

### Layout

npm-workspaces monorepo, 11 workspaces, published line 0.2.2 / CLI 0.2.3:

- `packages/`: `cli`, `cloud-api`, `create-frontguard-plugin`, `mcp`, `playwright`
- `apps/`: `web` (TanStack Start; routes incl. pricing, privacy, terms, changelog, docs, comparisons, status), `demo`
- `integrations/`: `github-app`, `netlify`, `slack-app`, `vercel`

Root manifest carries a 30-entry `overrides` block (mostly OpenTelemetry pins). `better-sqlite3`
present in the tree (datastore exists). CI: `.github/workflows` with jobs
`lint`, `build`, `test (20|22)`, `e2e`, `audit`, `docs-links`, plus `Deploy Web`.

### Repo state

- Open PRs: **11**, all dependabot (#198–#208).
- Open issues: **1** — #157 "Weekly npm audit (production tree)" (`npm-audit-weekly`, `dependencies`).
- Stale remote branches: `audit/launch-finish-2026-08` (**already merged into main** — R10 cleanup gap),
  `cursor/complete-identified-items-124b` (2026-06-29, abandoned ~2 months), 11 dependabot branches.
- Stale worktree: `../frontguard-launch-review` still mounted on the merged audit branch.

### Cold start — **FAIL**

Evidence: `evidence/P0-coldstart-{01-install,02-build,03-test,04-ci-baseline}.*`

| Step | Result |
|---|---|
| `npm ci` | pass — exit 0, 21s, 784 packages (R12 median: 21s → breaker at 63s) |
| `npm run build` | pass — exit 0, 12.5s |
| `npm test` | **FAIL — exit 1**. `@frontguard/cli`: 4 files / 5 tests failed. Other 10 workspaces green (1931 tests pass). |
| Run product locally | deferred to Phase 1 angle 2 (walk critical flows) |

### **`main` is RED — in CI, not just locally**

CI run 33481619449 on `5f0e141`: `lint` ✗ · `build` ✗ · `test (22)` ✗ (10 failures) · `e2e` ✗ ·
`test (20)` cancelled · `Deploy Web` cancelled. `audit` ✓ · `docs-links` ✓.
Last green CI on `main`: 4 days earlier (PR #197). **The prior audit branch merged a red tree into `main`.**

Distinct causes:

1. `lint` — `sync-version:check`: `.github/workflows/frontguard-example.yml: generated workflow CLI version matched 4 time(s); expected 2`
2. `build` — bundle budget: `packages/cli/dist/index.js` 188160 B > 180000 B (+4.5%)
3. `test (22)` — 10 failed tests, incl. stale-signature assertions and one 5000 ms timeout
4. `e2e` — `baseline-lifecycle.e2e.test.ts` deep-equal assertion

Local reproduces only 5 of the 10 — the local suite is **weaker than CI** (parity gap).

**Phase 0 exit: met.** Baseline recorded; cold start captured (fail is data).

**Second look:** first draft recorded the cold start as "install/build pass, tests fail" and stopped.
Re-reading adversarially, that would have let a stranger conclude the breakage was test-only and local.
Pulled the CI run for the same commit — `lint` and `build` also fail there and did not reproduce
locally, which is a materially different and larger problem. Baseline rewritten around the CI verdict.
