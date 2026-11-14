# P0 baseline: CI state of `main` @ 5f0e141

Captured: 2026-09-01 (run 33481619449, "CI", 4h before audit)
Command: `gh run list --branch main` / `gh run view 33481619449 --log-failed`

## Verdict: main is RED in CI

| Job | Result | Cause |
|---|---|---|
| `lint` | failure | `sync-version:check`: `.github/workflows/frontguard-example.yml: generated workflow CLI version matched 4 time(s); expected 2` |
| `build` | failure | `Check bundle size`: `packages/cli/dist/index.js` = 188160 B > budget 180000 B (+4.5%) |
| `test (22)` | failure | 10 failed tests (see below) |
| `test (20)` | cancelled | fail-fast on matrix sibling |
| `e2e` | failure | `test/e2e/baseline-lifecycle.e2e.test.ts`: `AssertionError: expected [ …(3) ] to deeply equal [ …(3) ]` |
| `audit` | success | — |
| `docs-links` | success | — |
| `Deploy Web` | cancelled | gated on CI |

Last green CI on main: 4 days prior, PR #197.
Red was introduced by 5f0e141 `Merge branch 'audit/launch-finish-2026-08'`.

## Local reproduction (macOS arm64, node v24.20.0, npm 11.19.0)

`npm ci` exit 0 (21s) -> `npm run build` exit 0 (12.5s) -> `npm test` EXIT 1.
Only `@frontguard/cli` fails: 4 files / 5 tests. Other 10 workspaces: 1931 tests pass.

Local failures (subset of CI's 10):
1. `test/cli/index.test.ts > does not discard an invalid explicit config when --url is also present` — expected exitCode 2, got 1
2. `test/cli/index.test.ts > honors telemetry:false when a run fails after loading config` — expected exitCode 2, got 1
3. `test/core/pipeline-baseline-update.test.ts > returns and reports a machine-readable result for updated baselines` — storageConstructor called `(cwd, {mode:"update"})`, test asserts `(cwd, undefined, "update")`
4. `test/core/pipeline-ssim-config.test.ts > initializes comparison storage in compare mode` — storageConstructor called `(cwd, {mode:"compare"})`, test asserts `(cwd, undefined, "compare")`
5. `test/storage/git-orphan.test.ts > GitOrphanStorage maxBuffer (install-2) > does not create baseline state during comparison initialization` — `Error: CI comparison requires origin/frontguard-baselines; no "origin" remote is configured.` at src/storage/git-orphan.ts:245

CI-only additional failures (not reproduced locally): `git-orphan.test.ts` 5 failures (vs 1 local),
`scripts/test/launch-examples.test.ts` 1 failure, and one `Error: Test timed out in 5000ms`.
=> local/CI parity gap: the local suite is weaker than CI. Recorded as a finding.

Findings raised: F-4-01 (stale tests vs prod signature), F-4-02 (local/CI parity),
F-1-01 (main red at baseline), F-3-01 (bundle budget breach), F-14-01 (version sync drift).
