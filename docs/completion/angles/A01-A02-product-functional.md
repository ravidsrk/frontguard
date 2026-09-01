# A01–A02 — Product definition & functional completeness

Static-only. Scores capped at 1. Observed-state labels are **unconfirmed** unless noted as parent-captured evidence.

---

## Angle 1 — Product definition & critical flows

**Score: 1/4 · RAG: R**
**Score justification:** A coherent local-CLI product is named in README, `/status`, and Commander registrations, but three written “done” bars disagree, and this agent did not execute any flow. Code existence is not proof.
**Dynamic proof needed to justify a higher score:** From repo root after a parent-owned build: `node packages/cli/dist/cli/index.js --help`; `… doctor`; against a reachable app (e.g. `apps/demo`): `… init --yes`; `… update-baselines --url <url>`; `… run --url <url> --output json`; then a second `run` after a visible CSS change. Record exit codes, whether `frontguard-baselines` exists locally, and whether `git push` is required. Do not treat parent `P1-a02-*.txt` as this angle’s score lift until those two-run artifacts exist.

### Findings

- **F-1-01** — **Who/what (supported path).** README:10–31 and `apps/web/src/routes/status.tsx:19-29` define Frontguard as an MIT local-first CLI for frontend teams: screenshot capture + pixel compare, optional BYOK vision, no hosted account. Audience: developers/CI. Homepage `https://frontguard.dev`. Published line 0.2.2; source CLI 0.2.3 (`packages/cli/package.json:3`).

- **F-1-02** — **Conflicting product definitions.** `docs/PRODUCT.md:32-37` still sells “Datadog + Sentry for frontend” with auto-fix. `docs/ROADMAP.md:5-6,229-239` (2026-06-29) claims the code-buildable backlog is empty and remaining work is OPS. `docs/launch-audit-2026-08.md:6-41` (2026-08-29) is **NO-GO** and narrows the promise to “visual checks for real app routes, in your own CI.” `docs/product-completion-plan.md:690-716` §8 still requires GitHub App + live cloud + MCP + self-host for “complete.” Impact: no single frozen product to complete against.

- **F-1-03** — **Critical flows derived from Commander + README Quick Start, not roadmap.** Registrations: `packages/cli/src/cli/index.ts:239-751`. Web is marketing/docs only (`apps/web/src/routes/{index,pricing,docs,comparisons,changelog,brand,privacy,terms,status}.tsx`).

| ID | Name | Entry | Exit condition | Money / user data | Observed state (static) |
|---|---|---|---|---|---|
| CF-01 | Init | `frontguard init` (`index.ts:394-422`) | Writes `frontguard.config.{ts,js,json}`; optional `.github/workflows/frontguard.yml`; exit 0 | Files only | **unconfirmed** |
| CF-02 | Doctor | `frontguard doctor` (`doctor.ts:411-418`) | Prints checks; exit 0 if no critical fail | None | **unconfirmed here**; parent capture `docs/completion/evidence/P1-a02-cli-doctor.txt` shows exit 0 in this checkout |
| CF-03 | Seed baselines | `frontguard update-baselines` (`index.ts:429-455`, `pipeline.ts:988-1104`) | Valid PNGs committed on orphan `frontguard-baselines`; user must `git push origin frontguard-baselines` (`pipeline.ts:1104`) | Screenshot binaries in git | **unconfirmed**; **no push in code** |
| CF-04 | Compare + report | `frontguard run` default (`index.ts:239-387`) | Console/JSON/HTML under `outputDir`; exit 0 pass / 1 regressions-or-new / 2 errors-or-empty (`exit-code.ts:3-13`) | Local images; optional `imageUpload` | **unconfirmed**; Phase 0: CLI tests + e2e `baseline-lifecycle` red |
| CF-05 | Optional AI classify | CF-04 + `ai` block + `FRONTGUARD_OPENAI_KEY`/`FRONTGUARD_ANTHROPIC_KEY` (`pipeline.ts:687-720`) | `diff.aiAnalysis` on changed pages; high-confidence `intentional` downgrades `regression`→`changed` (`pipeline.ts:722-732`) | **User pays provider**; screenshots leave the machine | **unconfirmed**; published validation had AI off (`README.md:24-25`) |
| CF-06 | CI Action | `uses: ravidsrk/frontguard@v0` (`action.yml:1-7`) or `init --ci` | Composite installs `@frontguard/cli@0.2.3`, runs `action-run.sh`, uploads report | `GITHUB_TOKEN`; optional AI keys | **unconfirmed**; `/status` says external smoke pending (`status.tsx:24-25`) |

Not critical (registered but not README quick-start): `monitor`, `accept-fix`/`reject-fix`/`export-patterns`, `plugin *`, `run --mode judge --experimental`, `run --docker`, `run --generate-fixes/--verify-fixes`.

- **F-1-04** — **Written definition of done exists, and it is not unique.** Primary frozen bar: `docs/product-completion-plan.md` §IN/§FIX/§8 (nine E2E tests including hosted). Narrower public bar: `apps/web/src/routes/status.tsx` + README “local CLI is the supported product path.” Launch bar: `docs/launch-audit-2026-08.md`. `DECISIONS.md` (root and `docs/`) are coordinator-run logs, not product DoD.

- **F-1-05** — **Scope lives in `docs/`, not the issue tracker.** GitHub: 1 open issue (`#157` weekly npm audit). 11 PRs, all dependabot. Product intent is scattered across `docs/product-completion-plan.md`, `docs/ROADMAP.md`, `docs/launch-audit-2026-08.md`, `docs/launch-readiness.md`, `docs/production-pending.md`, plus landing/pricing copy. No user-story backlog.

### Notes

Commander help (parent `P1-a02-cli-surface.txt`): `run`, `init`, `update-baselines`, `doctor`, `monitor`, `accept-fix`, `reject-fix`, `export-patterns`, `plugin`. Money on the supported path: $0 CLI; AI is BYOK. Hosted Stripe catalogue still encodes `$29`/`$99` (`packages/cloud-api/src/billing/plans.ts:49-66`) while `/pricing` is waitlist (`apps/web/src/routes/pricing.tsx:73-113`).

---

## Angle 2 — Functional completeness

**Score: 1/4 · RAG: R**
**Score justification:** Pipeline, storage, reporters, cloud-api, and four integrations are large real codebases, not empty folders. Several production paths still terminate in flags, fake results, or unpublished hosts. No flow was executed here.
**Dynamic proof needed to justify a higher score:** (1) `curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://api.frontguard.dev/health https://app.frontguard.dev/ https://telemetry.frontguard.dev/v1/events`. (2) `node packages/cli/dist/cli/index.js run --help` and confirm there is **no** `--reporter` and `--output` is `console|json` only — vs `packages/cloud-api/src/daytona-runner.ts:209`. (3) Two-run CF-03/CF-04 above. (4) Optional: `FRONTGUARD_OPENAI_KEY` set, one changed route, assert `aiAnalysis` present and a failed key yields `status: error` (`pipeline.ts:748-758`).

### Findings

- **F-2-01** — **TODO/FIXME/HACK/XXX count in product source: 0.** `packages/`, `apps/`, `integrations/`, `scripts/`, `action.yml`: no matches. Dead ends are behavioral, not comment stubs. Ambient type stub only: `packages/cli/src/types/axe-core-playwright.d.ts:3` (optional dep). Test-only mocks are out of scope.

- **F-2-02** — **Critical-path dead ends (CF-03/CF-04/CF-06).** `updateBaselines` commits via worktree (`git-orphan.ts:332-349`) and **never pushes**; init tells the user to push (`init.ts:396-397`). `run` does not persist new pages (`pipeline.ts:569-572` → `createNewPageResult`). Empty captures are now `status: 'error'` (`pipeline.ts:549-561`) + exit 2 if `summary.errors > 0` — this **contradicts** launch-audit L0-1 against current source; still unproven. `run --update-baselines` returns before JSON (`index.ts:281-286`) while the Action expects parseable JSON.

- **F-2-03** — **Feature flags / defaults.** Telemetry **off** unless `FRONTGUARD_TELEMETRY=1` or `telemetry: true` (`telemetry.ts:59-78`); endpoint hardcoded `https://telemetry.frontguard.dev/v1/events` (`telemetry.ts:19`). `generateFixes`/`verifyFixes` opt-in (`config.ts:261-265`, CLI `--generate-fixes/--verify-fixes`). Judge mode requires `--mode judge --experimental` (`index.ts:289-297`). `antiFlakeRenders` optional (default 1 in practice); `docs/ROADMAP.md:27` claiming default `3` is stale. Cloud processor real path gated on `DAYTONA_API_KEY` (`processor.ts:44-111`). Dashboard secret fail-closed in production (`cloud-api/src/index.ts:180-200`).

- **F-2-04** — **Mocks/fakes on NON-TEST paths.** Without Daytona, `processRun` **completes** with `status: 'new_baseline'` and `diffPercentage: 0` per route×viewport (`processor.ts:91-111`) — a fake successful run. Dev session secret `INSECURE_DEV_SESSION_SECRET_DO_NOT_USE_IN_PROD` (`auth/session.ts:42-43`); production refuses it. GitHub App preview URLs live in an in-process `Map` (`handler.ts:74-101`) — later `deployment_status` does **not** resume a Check Run left pending (`handler.ts:285-294` + README:7-10). Cloud-api uses in-memory store when D1 unbound (`index.ts:154-159` comment).

- **F-2-05** — **Hard-coded URLs / placeholders (not credentials).** `packages/cloud-api/wrangler.toml:13-23,35-39`: `api.frontguard.dev` + `database_id = "REPLACE_WITH_D1_DATABASE_ID"` (`ENVIRONMENT = "production"` already). `integrations/slack-app/wrangler.toml:19`: `REPLACE_WITH_KV_NAMESPACE_ID`. Deploy guard exists (`cloud-api/scripts/check-wrangler-placeholders.ts`) but the committed files still contain placeholders. Docker image `frontguard/render:${CLI_VERSION}` (`render/docker.ts:42`) is unpublished (`docker.ts:120-146`, `/status` Docker section). No live `sk-`/`ghp_` secrets in src (redaction patterns only).

- **F-2-06** — **“Coming soon” / not-implemented strings on shipped surfaces.** Pricing HOSTED/TEAM “PLANNED — NOT GENERALLY AVAILABLE” (`pricing.tsx:73-113`). MCP `accept_baseline`: “Screenshot promotion is not implemented” (`packages/mcp/src/index.ts:84-85`). GitHub App README:48-51: baseline refresh not implemented. `/status`: Action smoke pending; no hosted endpoint.

- **F-2-07** — **Cloud vs “local-first, no hosted account” — factual resolution.** README/status/pricing tell the truth: **CLI is the product; cloud is pre-release source.** `packages/cloud-api` is a real Hono Worker (`src/index.ts`: `/health`, `/v1/run`, `/v1/runs`, `/v1/baselines/:runId/approve`, billing, dashboard, monitors, teams) with tests — **not an empty scaffold**. It is **not reachable** as a product: wrangler still has `REPLACE_WITH_D1_DATABASE_ID`; launch-audit recorded `api.frontguard.dev` DNS missing (needs curl proof). Hosted execution is **mis-wired to the current CLI**: `daytona-runner.ts:209` runs `frontguard run --reporter json --reporter html --output ${outputDir}`; CLI `--output` is `console|json` only (`index.ts:247`) and has no `--reporter`. JSON parse then falls back to `[]` (`daytona-runner.ts:216-227`) and `processRun` still marks `completed` (`processor.ts:113`). `POST /v1/baselines/:runId/approve` sets `baselinesApproved: true` only (`index.ts:680-681`) — **no screenshot promotion**. Stripe `PLANS.pro.priceCents = 2900` (`plans.ts:49-60`) contradicts the waitlist pricing page. `Math.random()` diff shim is **gone** from `packages/cloud-api/src` (0 hits).

- **F-2-08** — **Four integrations: real handlers, not wired to a live product. FINISH-or-CUT:**

| Surface | What exists | Dead end | Rec |
|---|---|---|---|
| `packages/cloud-api` | Full Worker + D1/R2/Stripe/Daytona source | DNS/placeholders; fake no-Daytona results; CLI argv mismatch; approve ≠ promote | **CUT from GA.** Keep as eval source. If kept: FINISH argv contract + promotion + fail-closed without Daytona. |
| Daytona runner | `executeInSandbox` | `--reporter`/`--output dir` vs CLI | **CUT** with hosted, or **FINISH** to `frontguard run --output json` + parse stdout. |
| Baseline approve | MCP + API + dashboard | Flag only | **CUT** with hosted, or **FINISH** shared promotion module. |
| `run --mode judge` | Gated experimental | Not in quick start | **CUT from GA** (keep flag). |
| `--generate-fixes` / `--verify-fixes` / `accept-fix` | Code + optional `better-sqlite3` | README already “experimental” | **CUT from critical path.** |
| `--docker` / `frontguard/render` | Dockerfile + adapter | No published image | **CUT from GA** until registry + byte-equivalence. |
| `@frontguard/mcp` | 4 tools, no default URL (`auth.ts:32-59`) | Needs live API; `accept_baseline` does not promote | **CUT from GA.** |
| `integrations/github-app` | Webhook, Check Run, preview inference, bootstrap PR | Marketplace “in review”; in-memory cache; no Check Run resume; depends on cloud `POST /v1/run` | **CUT from GA.** Use composite Action. |
| `integrations/slack-app` | OAuth persist + `/frontguard status <url>` → cloud | KV placeholder; depends on cloud | **CUT from GA.** |
| `integrations/vercel` | HMAC webhook + OAuth install | Marketplace in review; `POST /v1/integrations/vercel/install` **does not exist** in cloud-api (0 hits); README:43-44 still calls it | **CUT from GA.** |
| `integrations/netlify` | `@frontguard/netlify-plugin` 0.2.3, `private: false`, `onSuccess` → `POST /v1/run` | Requires self-hosted API URL; marketplace in review; README still cites `app.frontguard.dev` (`README.md:203`) | **CUT hosted path.** Optional **FINISH**: shell out to local CLI instead of cloud. |
| `frontguard plugin install` | npm name mapping | No in-tree marketplace plugins | **CUT** until packages exist. |
| Storybook (`init --storybook`) | Discovery adapter exists | Not in README quick start | **FINISH** only if CF-04 against a fixture Storybook passes; else **CUT** from default init. |
| Stripe / hosted dashboard | Routes + plans | Waitlist; no DNS | **CUT** until a hosted DoD is re-frozen. |
| Telemetry collector | Client opt-in | Host likely unpublished | **CUT** or ship collector; default already off. |
| Cloud docker-compose | `packages/cloud-api/docker-compose.yml` | Build context `.` while package `build` calls root `scripts/sync-openapi.mjs` (launch-audit L0-8) | **CUT** as a verified quick start. |

- **F-2-09** — **Half-built CLI/web APIs.** `plugin` subcommands are wired (`index.ts:684-751`) but resolve `frontguard-plugin-*` on npm with no first-party packages in this repo. Web `/pricing` CTAs are mailto waitlist, not a checkout. Playwright public export is `visualTest` only (`packages/playwright/src/index.ts:1`); landing snippet matches (`index.tsx:296-301`) — `expectVisual` drift from older audits looks **closed on current landing**.

### Notes

`docs/ROADMAP.md:70` calling Vercel/Netlify/GitHub-App “real, functional” is source-true and product-false: they HTTP to a cloud that is not generally available and, in Daytona’s case, invokes CLI flags that do not exist. Phase 0 already shows CF-04’s test harness is red (5 local CLI failures including git-orphan `origin` remote; CI e2e baseline-lifecycle). Empty-buffer→error (`pipeline.ts:549-561`) and AI `allSettled` failure accounting (`pipeline.ts:748-775`) look like post-L0-1/L1-3 fixes; they do not raise this score.
