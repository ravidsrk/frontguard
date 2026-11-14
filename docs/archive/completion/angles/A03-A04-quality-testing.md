# A03–A04 — Code quality & testing

Static analysis only. Scores capped at 1 (rule: no 2+ without observing a run). Parent evidence cited: `docs/completion/evidence/P0-coldstart-03-test.txt`, `P0-coldstart-04-ci-baseline.md`, `P1-a04-ci-env-correction.txt`.

## Angle 3 — Code quality & architecture

**Score: 1/4 · RAG: R**
**Score justification:** Lint/typecheck configs and a real module graph exist, but this pass did not execute `npm run lint` / `npm run typecheck`, and `main` CI lint is already red on a sibling job (`sync-version:check`). Unverified.
**Dynamic proof needed to justify a higher score:** `npm run lint` and `npm run typecheck` from repo root on a green tree (today lint is red on version-sync, not ESLint). Optionally `npx madge --circular packages/*/src apps/*/src integrations/*/src`.

### Lint / typecheck inventory (11 workspaces)

| Workspace | `lint` script | eslint config | `typecheck` script | tsconfig |
|---|---|---|---|---|
| `packages/cli` | yes (`eslint src/`) | `packages/cli/eslint.config.js` | yes | yes (`strict`, tests excluded) |
| `packages/cloud-api` | yes (`eslint src/`) | `packages/cloud-api/eslint.config.js` (ignores `test/`) | yes | yes; **excludes** `src/snapshot-cli.ts` |
| `apps/web` | yes (`eslint .`) | `apps/web/eslint.config.js` | yes; **`pretypecheck`: `vite build`** | yes |
| `packages/mcp` | **none** | none | yes | yes |
| `packages/playwright` | **none** | none | **none** (tsconfig exists, `noEmit`) | yes |
| `packages/create-frontguard-plugin` | **none** | none | yes | yes |
| `apps/demo` | **none** | none | **none** | **none** |
| `integrations/github-app` | **none** | none | yes | yes |
| `integrations/netlify` | **none** | none | yes (`checkJs` on `lib/**/*.js`) | yes |
| `integrations/slack-app` | **none** | none | yes | yes |
| `integrations/vercel` | **none** | none | yes | yes |

Root `npm run lint` / `typecheck` are `--workspaces --if-present`, so playwright + demo never typecheck in CI lint job. Only three workspaces have ESLint.

Root `lint-staged` (`package.json:75-81`) + `.husky/pre-commit` (`npx lint-staged`):

- covered: `packages/cli/src/**/*.ts`, `apps/web/src/**/*.{ts,tsx}`
- **unlinted at commit time:** `packages/cli/test/**`, `packages/cloud-api/**` (has a lint script, not hooked), `packages/mcp`, `packages/playwright`, `packages/create-frontguard-plugin`, `apps/demo`, `apps/web` outside `src/`, all four `integrations/*`, `scripts/**`

### Findings

- **F-3-01** — Commit-time lint is two globs. Location: `package.json:75-81`. Impact: cloud-api, integrations, MCP, playwright, CLI tests, and scripts ship on `main` with no pre-commit ESLint.
- **F-3-02** — Playwright has a tsconfig and no `typecheck` script; demo has neither. Location: `packages/playwright/package.json` (scripts = build/test/prepublishOnly); `apps/demo/package.json` (next only). Impact: `npm run typecheck --workspaces --if-present` silently skips both.
- **F-3-03** — Ten largest first-party source files (wc -l, tests excluded): `apps/web/src/routes/index.tsx` 1811; `packages/cli/src/core/pipeline.ts` 1328; `packages/cloud-api/src/db/d1-store.ts` 1224; `packages/cloud-api/src/dashboard/render.ts` 1032; `packages/cli/src/report/html.ts` 864; `packages/cloud-api/src/db/store.ts` 817; `packages/cli/src/core/types.ts` 791; `packages/cli/src/storage/git-orphan.ts` 776; `packages/cli/src/cli/index.ts` 768; `packages/cloud-api/src/index.ts` 752. Impact: pipeline.ts is the CLI god-module (discover/render/diff/storage/AI/plugins/sandbox/graph all imported in one file).
- **F-3-04** — Duplicated pixel/SSIM engines. Location: `packages/cli/src/diff/pixel.ts` + `packages/cli/src/diff/ssim.ts` vs `packages/playwright/src/diff.ts` (`compareImages` / `computeSSIM`). Impact: published `@frontguard/playwright` can drift from CLI comparison semantics.
- **F-3-05** — Circular-dep *risk* is the pipeline hub, not a proven import cycle. `pipeline.ts` imports `plugins/figma.js`; figma does not import pipeline. No madge run. Impact: any new figma→pipeline import becomes a cycle in the CLI bundle.
- **F-3-06** — Root `overrides` (30 keys, `package.json:38-68`) pin OTel `2.9.0` / `0.220.0` (16 packages), `next@16.3.3`, plus `protobufjs`, `shell-quote`, `@grpc/grpc-js`, `fast-xml-builder`, `form-data`, `hono`, `react`/`react-dom`, `undici`, `ws`, `postcss`, `esbuild`. Cross-ref issue #157 (2026-07-27 comment listed high on `@opentelemetry/sdk-node`, `next`, `postcss`, `shell-quote`, `@daytona/sdk`; 2026-08-31 comment is 0 prod vulns). Impact: the block is a CVE/compat freeze, not a feature; CI `audit` job (`npm audit --omit=dev --audit-level=high`) is green while #157 stays open as a tracker.
- **F-3-07** — Critical deps mostly caret-ranged: `zod`, `hono`, `commander`, `pixelmatch`, `vitest`, `typescript` across workspaces. Playwright CLI dep is pinned `1.62.1`. `better-sqlite3` is `^11` (CLI optional) vs `^12` (cloud-api dev). Root `devDependencies.react-router-dom` (`package.json:73`) is unused by `apps/web` (TanStack Router) — leftover from `docs/parity-spec.md`.
- **F-3-08** — Dead/stale: `packages/cloud-api/src/snapshot-cli.ts` excluded from tsconfig (`tsconfig.json:25`); its header still says `cloud/api/src/snapshot-cli.ts`. `packages/cli/frontguard.config.ts` dogfoods routes (`/guide/getting-started`) that do not match current `apps/web` routes.
- **F-3-09** — README architecture tree (`README.md:222-247`) lists `cli/src/{cli,core,discovery,render,diff,storage,report,plugins,utils}` only. Actual extra dirs: `sandbox/`, `graph/`, `templates/`, `types/`. Quote mismatch: README does not mention `sandbox/` or `graph/` even though both are production path (`pipeline.ts` imports `smartFilter`, `verifyFix`).

### Notes

CLI/cloud-api ESLint is `typescript-eslint` recommended + `no-explicit-any: warn`. Web adds react-hooks/refresh. No repo-root ESLint. `ignoreDeprecations: "6.0"` is copy-pasted across CLI/MCP/playwright/cloud-api tsconfigs for tsup's injected `baseUrl`.

---

## Angle 4 — Testing

**Score: 1/4 · RAG: R**
**Score justification:** Large suite exists and parent observed it run, but it is red (4 true-local failures, 10 on GHA `test (22)`, e2e red). No coverage thresholds. Score cannot be 2 while the critical path is failing.
**Dynamic proof needed to justify a higher score:** `CI= npm test --workspace=@frontguard/cli`; `CI=true npm test --workspace=@frontguard/cli`; `npm run test:e2e --workspace=@frontguard/cli` (after `npx playwright install --with-deps chromium`); confirm zero failures. Coverage: `cd packages/cli && npx vitest run --coverage --exclude='test/e2e/**'` (today this would only *report*; nothing fails the build).

### Per-workspace inventory

Counts from `P0-coldstart-03-test.txt` (the run) plus glob for files. `apps/demo` has no `test` script.

| Workspace | Test files | Tests in P0 run | Kind |
|---|---:|---:|---|
| `packages/cli` `npm test` | 69 (CLI `test/**` minus e2e + `scripts/test/**`) | 975 (5 fail w/ `CI=true`) | unit + integration |
| `packages/cli` e2e | 4 (`test/e2e/**`) | 8 in GHA e2e job (1 fail) | e2e |
| `packages/cloud-api` | 45 | 478 | unit |
| `packages/create-frontguard-plugin` | 2 | 26 | unit |
| `packages/mcp` | 8 | 57 | unit |
| `packages/playwright` | 5 | 38 | unit |
| `apps/web` | 12 | 85 | unit (jsdom, `apps/web/vite.config.ts`) |
| `integrations/github-app` | 5 | 88 | unit |
| `integrations/netlify` | 3 | 43 | unit |
| `integrations/slack-app` | 8 | 76 | unit |
| `integrations/vercel` | 3 | 60 | unit |
| `apps/demo` | 0 | 0 | none |

CLI `package.json:25`: `vitest run --pool=forks --exclude='test/e2e/**'`. `vitest.config.ts` also excludes `test/e2e/**` and includes `../../scripts/test/**/*.test.ts`. No `coverage` key anywhere (CLI, MCP, create-plugin, web vite). `@vitest/coverage-v8` is a CLI devDependency only — **no threshold, no CI coverage job**.

E2E (`packages/cli/vitest.e2e.config.ts`): `include: test/e2e/**/*.test.ts`, timeout 60s, `fileParallelism: false` (ts-config-loader rebuilds `dist/` and races docker-pack). Needs: built CLI (`dist/cli/index.js`), Playwright Chromium, in-process HTTP fixture. **Not** a live Frontguard server. Docker is optional: `docker-build.test.ts` `describe.skipIf(!HAVE_DOCKER)` — GHA e2e has no dind, so that file skips.

### CI vs local (priority)

`.github/workflows/ci.yml`:

| Job | Trigger | Node | What |
|---|---|---|---|
| `test` | push/PR `main` | matrix **20, 22** | `npm ci` → `npm run build` → `npx playwright install --with-deps chromium` → `npm test` |
| `e2e` | same | 20 | build + chromium + `npm run test:e2e --workspace=packages/cli` |
| `lint` | same | 20 | lint + typecheck + `sync-version:check` + openapi diff |
| `build` | same | 20 | build + CLI `dist/index.js` ≤ 180000 bytes |
| `audit` | same | 20 | `npm audit --omit=dev --audit-level=high` |
| `docs-links` | same | 20 | `apps/web/scripts/check-doc-links.mjs` (no install) |

GHA always exports `CI=true`. `test (20)` cancelled fail-fast when `test (22)` failed.

**Parity gap (concrete):**

1. Agent/GHA shells export `CI=true`. `GitOrphanStorage.init` (`git-orphan.ts:240-247`) treats any truthy `CI` as `strictCIComparison` in compare mode and **throws if there is no `origin` remote**.
2. True developer-local (`CI=` unset, `P1-a04-ci-env-correction.txt`): **4 failures / 971 passed**. Phase 0's "5 local" included the origin throw because the audit shell had `CI=true`.
3. GHA `test (22)`: **10 failed / 965 passed** (same 975 CLI tests). Extra vs true-local:
   - `git-orphan` compare-init without origin (CI gate) — `test/storage/git-orphan.test.ts:199-213`
   - four `writeBaseline` tests on cloned repos (`:377`, `:393`, `:436`, `:476`) — `git commit` fails on ubuntu (`Failed to write baseline: git commit failed…`). Fixtures set `user.email` on the *source* repo, not the clone; GHA has no global git identity, macOS dev machines do.
   - `scripts/test/launch-examples.test.ts:161` — `Test timed out in 5000ms` type-checking markdown examples. CLI vitest config sets `timeout: 30000` but CI reports the **5s default**, so that timeout is not applied to this extra-root file (Vitest 4 `testTimeout` vs `timeout`, and/or files outside `packages/cli`).
4. E2e is a **separate job**, not part of the 10. `npm test` never runs `test/e2e/**`.
5. Playwright install in CI is *not* the extra-failure source: `pipeline-unreachable.test.ts` passed on GHA (8/8). It explains why some paths are exercised, not why 10 ≠ 4.

### Per-failure verdict (5 Phase-0 / 4 true-local)

| # | Test | Observed | Stale side | Verdict |
|---|---|---|---|---|
| 1 | `test/cli/index.test.ts:136` invalid config + `--url` | expected exit 2, got 1 | **CODE** | `loadConfig` throws `Invalid Frontguard config` (`config.ts:523`); `run` catch sets `exitCode = 2` (`cli/index.ts:375-377`). Process still exits 1. Global handlers force 1 (`unhandledRejection`/`uncaughtException`, `cli/index.ts:47-55`). Product contract in the test (and the catch) is 2. Fix CODE so validation failures cannot hit the process-level 1 path. (Helper footnote: this test uses `runCliAsync` reading `error.code`; the passing monitor-invalid-URL case uses sync `runCli` reading `error.status`.) |
| 2 | `test/cli/index.test.ts:186` `telemetry:false` + forced plugin `setup()` throw | expected 2, got 1 | **CODE** | Same process-exit-1 leak. Config `plugins: z.array(z.any())` keeps the throwing setup. Catch intends 2. |
| 3 | `test/core/pipeline-baseline-update.test.ts:129` | test `(cwd, undefined, 'update')`; prod `(cwd, { mode: 'update' })` | **TEST** | Prod: `new GitOrphanStorage(process.cwd(), { mode: 'update' })` (`pipeline.ts:1037`). Constructor is `(repoDir, options = {})` (`git-orphan.ts:127-133`). Update the assertion. |
| 4 | `test/core/pipeline-ssim-config.test.ts:101` | test `(cwd, undefined, 'compare')`; prod **`(cwd)` only** | **TEST** | Prod: `new GitOrphanStorage(process.cwd())` (`pipeline.ts:527`) — one arg; default mode `'compare'`. Phase 0's `{mode}` description matches update, not compare. |
| 5 | `test/storage/git-orphan.test.ts:202` compare init, no origin | `CI comparison requires origin/…; no "origin" remote` | **TEST** (isolation) | CODE at `git-orphan.ts:244-247` is the intended CI fail-closed gate. maxBuffer describe never `stubEnv('CI','false')` (remote-adoption describe does, line 242). Passes when `CI` is unset. Fix: stub `CI=false` or add an origin remote. |

GHA-only (not in the local 5): four clone `writeBaseline` git-identity failures (TEST fixtures incomplete for ubuntu) + launch-examples 5s timeout (TEST/config). E2e: `baseline-lifecycle.e2e.test.ts:188` `images.toEqual([baseline, current, diff])` — **deep-equal on filenames**; cannot see the actual array from truncated logs. Likely CODE emitting extra/renamed files vs a hardcoded TEST list; parent should print `images` to decide.

### Findings

- **F-4-01** — Local/CI parity: 4 vs 10 on the same 975 CLI tests. Location: `git-orphan.ts:240-247`; CI `ci.yml:10-30` (`CI=true`, ubuntu, no `git config user.email`); `vitest.config.ts` `timeout: 30000` vs launch-examples 5000ms. Impact: a contributor running `npm test` does not see the suite CI enforces. Highest-priority test finding.
- **F-4-02** — Two storageConstructor assertions still use a 3-arg signature the constructor never had. Location: `pipeline-baseline-update.test.ts:129`, `pipeline-ssim-config.test.ts:101` vs `git-orphan.ts:127-133`. Impact: red `main` on stale tests; fix is test-only.
- **F-4-03** — CLI tool-error contract (exit 2) is not what `runCliAsync` observes (exit 1). Location: `cli/index.ts:47-55` vs `:375-377`; tests at `index.test.ts:136` and `:186`. Impact: callers/CI cannot distinguish "new pages" (1) from "bad config" (2).
- **F-4-04** — No coverage thresholds anywhere; `@vitest/coverage-v8` unused. Location: `packages/cli/vitest.config.ts` (no `coverage` key); `ci.yml` test job has no `--coverage`. Impact: critical flows (pipeline, git-orphan, CLI exit codes) can rot without a gate. Unit tests exist for those flows but several are the red tests above; e2e of the baseline lifecycle is red.
- **F-4-05** — `apps/demo` has zero tests. Location: `apps/demo/package.json`. Impact: Next 16 demo (pinned in overrides) is untested.

### Notes

Critical-flow map (static): pipeline (`test/core/pipeline*.test.ts`), storage (`test/storage/git-orphan.test.ts`, red), pixel/ssim (`test/diff/`), CLI (`test/cli/`, red on exit codes), discovery (`test/discovery/`), AI (mocked `test/diff/ai-*.test.ts`). E2e lifecycle is the only built-binary round-trip and is red on GHA.

`index.test.ts:22-24` comment claims `NODE_ENV=test` "Prevent actual pipeline runs" — `packages/cli/src` has **zero** `NODE_ENV` reads. `packages/cli/frontguard.config.ts` is auto-loaded by any CLI invocation whose cwd is `packages/cli` (sync `runCli` has no cwd).
