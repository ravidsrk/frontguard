# Frontguard — Completion Status

> Driven by `/product-completion`. Working state; rewritten each phase.

```
VERDICT: PHASE 1 COMPLETE
COMPLETION: 35% (baseline 5f0e141)   GATE: not evaluated — Definition of Complete not yet frozen
CRITICAL FLOWS: 6 total · 1 verified · 3 partial · 0 cut · 2 unreachable
GAPS: enumerated in Phase 3 · angles scored below
TASKS: 0/0 · BLOCKED 0 · HUMAN ACTIONS gating launch: TBD (Phase 4)
NEXT: Phase 2 — deep research (internal archaeology + external verification)
```

---

## Baseline freeze (Phase 0)

| Field | Value |
|---|---|
| Product | Frontguard — AI-powered frontend visual regression testing (A-03) |
| Repo | `/Users/ravindra/projects/frontguard` · `git@github.com:ravidsrk/frontguard.git` |
| Baseline commit | `5f0e141` ("Merge branch 'audit/launch-finish-2026-08'", 2026-09-01) |
| Branch / tree | `main` · clean |
| Run id | 20260901-1658 · MODE=drive · audit branch `ravidsrk/p0-completion-audit` |

**Toolchain (R1).** Agentic, write access. `git` 2.55.0 · `node` v24.20.0 · `npm` 11.19.0 ·
`just` 1.58.0 · `mise` 2026.8.16 · `gh` 2.98.0 · **`greptile` 3.4.2 (R11 is a real gate)** · `rg` 15.1.0.
`pnpm` refuses this repo outright (`"workspaces" field ... is not supported`). See A-01.

**Layout.** npm-workspaces monorepo, 11 workspaces. `packages/{cli,cloud-api,create-frontguard-plugin,mcp,playwright}`,
`apps/{web,demo}`, `integrations/{github-app,netlify,slack-app,vercel}`. Published line 0.2.2, CLI 0.2.3,
`VERSION` 0.2.3. CI jobs: `lint`, `build`, `test (20|22)`, `e2e`, `audit`, `docs-links`, plus `Deploy Web`.

**Repo state.** 11 open PRs (all dependabot). 1 open issue (#157, weekly npm audit).
Stale: `audit/launch-finish-2026-08` (already merged), `cursor/complete-identified-items-124b`
(abandoned 2026-06-29), a worktree still mounted at `../frontguard-launch-review`.

### Cold start — FAIL

| Step | Result |
|---|---|
| `npm ci` | pass — exit 0, 21s, 784 pkgs (R12 breaker: 63s) |
| `npm run build` | pass — exit 0, 12.5s |
| `npm test` | **FAIL — exit 1**, `@frontguard/cli` only. Other 10 workspaces green (1931 tests pass). |
| Run product locally | **pass** — see CF-01 below |

### `main` is RED in CI

CI run 33481619449 on `5f0e141`: `lint` ✗ · `build` ✗ · `test (22)` ✗ · `e2e` ✗ ·
`test (20)` cancelled · `Deploy Web` cancelled. Last green: 4 days earlier (PR #197).
**The prior audit branch merged a red tree into `main`.** Distinct causes:

1. `lint` — `sync-version:check`: `frontguard-example.yml` matched CLI version 4×, expected 2
2. `build` — `dist/index.js` 188,160 B > 180,000 B budget (+4.5%)
3. `test (22)` — 10 failures, incl. one 5,000 ms timeout
4. `e2e` — `baseline-lifecycle.e2e.test.ts` deep-equal

---

## Phase 1 — 360° audit

Method: 8 parallel investigators covering all 17 angles, each capped at score 1 (static reading
cannot demonstrate behaviour — R13). The parent then executed the dynamic proofs and raised scores
only where evidence justified it. Per-angle detail in `angles/`; evidence in `evidence/`.

### Correction to the Phase 0 baseline (found by second look)

**The agent shell exports `CI=true`.** Every "local" run in Phase 0 therefore executed in CI mode
and did not represent a developer's machine. Re-measured with `CI` unset:

| Environment | CLI suite failures |
|---|---|
| Phase 0 "local" (`CI=true`, wrong) | 5 |
| **True developer-local (`CI` unset)** | **4** |
| GitHub Actions | **10** |

`git-orphan.test.ts` passes when `CI` is unset — it is environment-gated on `strictCIComparison`
(`packages/cli/src/storage/git-orphan.ts:243-247`), not a defect. The parity gap is therefore
**wider** than first recorded: 4 vs 10, and a contributor running `npm test` sees a different suite
than CI enforces. Evidence: `evidence/P1-a04-ci-env-correction.txt`.
Independently reproduced by the testing investigator.

### Critical flows

| id | flow | entry | state | evidence |
|---|---|---|---|---|
| CF-01 | Local visual regression loop | `frontguard init` → `update-baselines` → `run` | **verified** | `evidence/CF-01-local-regression-loop.txt` |
| CF-02 | Environment onboarding | `frontguard doctor` | **verified** | `evidence/P1-a02-cli-doctor.txt` |
| CF-03 | CI comparison against pushed baselines | GH Action / `run` with `origin` | partial | red e2e `baseline-lifecycle` |
| CF-04 | AI classification of a regression | `run` + provider key | partial | never accuracy-tested; validation ran AI **disabled** |
| CF-05 | Hosted run via cloud-api | `POST /v1/run` | **unreachable** | `api.frontguard.dev` does not resolve |
| CF-06 | One-click integration install | GitHub/Slack/Vercel/Netlify | **unreachable** | all four listings "in review" |

**CF-01 is proven working, happy path and failure path.** Against a real fixture site:
`init -y` → exit 0; `update-baselines` → exit 0, orphan-branch storage; `run` unchanged → exit 0,
"All pages match baselines"; mutate CSS → `run` → **exit 1, "REGRESSIONS (1)", 4.97% pixels changed**.
Exit-code semantics are correct (0 match / 1 regression / 2 error). The product's core value
proposition demonstrably works.

### Scores

| # | Angle | W | Score | RAG | Basis |
|---|---|---|---|---|---|
| 1 | Product & critical flows | 8 | **2** | A | Flows enumerable, CF-01 verified — but three *conflicting* definitions of done in-repo (F-1-02) |
| 2 | Functional completeness | 14 | **2** | A | Local CLI works end-to-end; hosted path can mark runs `completed` without comparing (F-2-07) |
| 3 | Code quality | 4 | 1 | R | Lint green locally, **red in CI**; god files (`pipeline.ts` 1328, web `index.tsx` 1811); 2 workspaces lack typecheck |
| 4 | Testing | 8 | 1 | R | Suite is red. 1931 pass, CLI fails 4 local / 10 CI. No coverage thresholds. Deterministic, not flaky |
| 5 | Security | 14 | **2** | A | Dense real controls; both unknowns resolved favourably by parent proof (below) |
| 6 | Data | 8 | 1 | R | **No backups, no restore.** `migrate()` never called at deploy; no export/erasure path |
| 7 | Infra & deploy | 6 | 1 | R | Deploy exists but production is stale; **no rollback**; D1/R2 unbacked |
| 8 | Reliability | 5 | 1 | R | Most outbound `fetch` have no timeout/retry/circuit breaker; no runbooks |
| 9 | Observability | 4 | 1 | R | **OTel pinned but never instrumented**; no request IDs, no error tracking, no alerts |
| 10 | Performance & cost | 5 | 1 | R | Bundle gate breached *and* aimed at the wrong artifact; **no AI spend cap** |
| 11 | Integrations | 5 | 1 | R | Handlers real and HMAC-verified; zero listings live; placeholder IDs |
| 12 | AI / LLM layer | 5 | 1 | R | Prompts inline+unversioned, model floating, **accuracy never measured**, hosted AI dead |
| 13 | UX & frontend | 5 | **2** | A | CLI UX verified genuinely good (help, `doctor`, `init`, error box); web unproven + stale |
| 14 | Documentation | 3 | 1 | R | README Quick Start will not reach a first comparison; three-way version drift |
| 15 | Legal & compliance | 5 | 1 | R | **`/privacy` and `/terms` 404 in production**; privacy omits CLI telemetry |
| 16 | GTM readiness | 4 | 1 | R | Landing+pricing live; advertises a $29 trial pointing at a host that does not resolve |
| 17 | Ownership & ops | 2 | 1 | R | Bus factor 1; no incident process; recovery undocumented |

**Completion score: 36.5 / 105 = 35%.**

> Appendix B declares "Weights (sum 100)" but the published weights actually sum to **105**
> (left column 71 + right column 34). Normalising against 105 rather than silently rescaling;
> logged as A-05 so the number is reproducible.

### Security — the two unknowns, resolved

The security investigator is read-only and flagged two things it could not test. Both were executed:

- **Git-history secret scan: CLEAN.** All refs, full history, eight credential patterns.
  Every hit is benign — and the `sk_live_`/`AKIA`/`github_pat_` matches are **the product's own
  redaction regexes**. `whsec_` hits are test fixtures. **No `.env` ever committed.**
- **Netlify published-tarball concern: REFUTED.** `lib/core.js` *is* git-tracked and not ignored;
  on-disk and tracked file sets are identical. The provenance attestation is honest.
- **Production dependency tree: 0 vulnerabilities.** The only 2 advisories (moderate) are
  `react-router`/`react-router-dom`, which is **imported nowhere** — an unused root devDependency.
  Fix is `npm uninstall react-router-dom`, not the semver-major bump `npm audit fix` proposes.

Genuinely strong: every inbound webhook fails closed with constant-time HMAC; every ID-bearing
cloud-api route re-checks ownership (no BOLA found across ~90 parameterised D1 statements); a real
SSRF guard defeating integer/mixed-radix IPv4 and IPv4-mapped IPv6; and a release pipeline where a
compromised PR cannot publish (tag must equal `VERSION`, commit must be an ancestor of the default
branch, a green `ci.yml` run on that exact SHA is required, release must be immutable).

Residual, all real: no `.env.example` anywhere; `/auth/*`, `/v1/keys/*`, `/v1/billing/*` mount
*before* the rate limiter; the limiter is a per-isolate `Map` so the advertised 100 req/min is not
enforced; 7-day session cookie with no logout or revocation; CORS reflects any `localhost:<port>`
with `credentials: true`; `apps/web` ships no CSP/HSTS/X-Frame-Options; unmitigated prompt
injection from crawled page paths into the verdict-deciding prompt.

### The load-bearing causal chain

`/privacy`, `/terms`, `/status` **404 in production** — yet the Phase 0 build emits
`privacy-*.js`, `terms-*.js`, `status-*.js`, and the routes exist at `apps/web/src/routes/`.

> **`main` is red → `Deploy Web` cancelled → production is stale → the live site advertises paid
> plans while its privacy policy and terms return 404.**

This is one root cause, not four problems. Fixing the red baseline republishes the legal pages.
It sets the phase order: P1 (green baseline) is a prerequisite for the legal exposure closing.
Evidence: `evidence/P1-a15-a16-live-surfaces.txt`.

### Red-suite verdicts (decides fix type)

| Failure | Verdict |
|---|---|
| `index.test.ts` invalid config + `--url` | **CODE** — exits 1, contract says 2 |
| `index.test.ts` telemetry:false | **CODE** — exits 1, contract says 2 |
| `pipeline-baseline-update` storageConstructor | **TEST stale** — prod is `(cwd,{mode})`, test asserts 3-arg |
| `pipeline-ssim-config` storageConstructor | **TEST stale** — prod is `new GitOrphanStorage(cwd)` |
| `git-orphan` compare-init no origin | **TEST isolation** — fail-closed is intended; passes with `CI` unset |

**Phase 1 exit: met.** No angle unscored; every score ≥2 carries executed evidence; second look logged.

**Second look:** the audit's own method was the thing that broke. Re-reading the Phase 0 numbers
adversarially exposed `CI=true` in the agent shell, which meant the recorded "local" baseline was
measuring CI behaviour. Corrected to 4-vs-10 and re-run with `CI` unset before any score was set;
the parity gap grew rather than shrank. Also caught the Appendix B weights summing to 105, not 100.
