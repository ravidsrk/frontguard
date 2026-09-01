# Gap Register

Every finding standing between the baseline (`5f0e141`, 35%) and `DEFINITION.md`.

**Decision rules applied.** S0 → FINISH or CUT, never DEFER/ACCEPT. S1 → FINISH by default; CUT if
the surface is not on a critical flow. S2/S3 → DEFER by default; FINISH only if ≤ S size and on a
critical flow.

**Severity.** S0 blocks a critical flow, or is a legal/security/data exposure making launch unsafe ·
S1 a stranger hits it in the first session, or operational blindness on a critical flow ·
S2 degrades with workaround · S3 polish.

---

## Above the cut line — FINISH (28)

### S0 — blocks a critical flow or makes launch unsafe (9)

| id | source | angle | flow | gap | rationale |
|---|---|---|---|---|---|
| G-01 | F-1-01 | 1,4 | all | **`main` is red in CI** — `lint`, `build`, `test (22)`, `e2e` all failing at baseline | Blocks every other merge, blocks the deploy, blocks all 11 dependabot PRs. Root of the causal chain |
| G-02 | F-4-02 | 4 | CF-01 | CLI exits **1** where the contract says **2** for invalid-config and telemetry-failure paths | CODE bug, not a stale test. Wrong exit codes break scripted/CI consumers |
| G-03 | F-4-03 | 4 | CF-01 | Two `storageConstructor` tests assert a 3-arg signature; production is `(cwd, {mode})` | Stale tests masking real coverage of the baseline path |
| G-04 | F-3-01 | 3,10 | — | Bundle budget breached: `dist/index.js` 188,160 B > 180,000 B | Hard CI gate; blocks `build` |
| G-05 | F-14-01 | 3,14 | — | `sync-version:check` fails: `frontguard-example.yml` matched 4×, expected 2. Three-way version drift 0.2.0/0.2.2/0.2.3 | Blocks `lint`; publishes contradictory versions |
| G-06 | F-4-04 | 4 | CF-03 | `baseline-lifecycle.e2e.test.ts` deep-equal failure | Blocks `e2e`; CF-03 is a definition flow |
| G-07 | F-15-01 | 7,15,16 | — | **`/privacy` and `/terms` 404 in production while `/pricing` serves 200** | Live legal exposure. Unblocked by G-01 (deploy is cancelled, not broken) |
| G-08 | R-B2-05 | 4,7 | CF-03 | `actions/checkout` default `fetch-depth: 1` does not fetch the baseline ref | A CI user following the documented path gets a broken comparison |
| G-09 | R-B1-01 | 3,7 | — | **Node 20 is EOL**; `engines.node: ">=20"` and CI matrix `[20,22]` are wrong | Shipping against an unsupported runtime; also blocks G-21 |

### S1 — stranger hits it, or operational blindness (13)

| id | source | angle | flow | gap | rationale |
|---|---|---|---|---|---|
| G-10 | F-16-01 | 16 | — | Live pricing advertises a **$29 trial** linking to `app.frontguard.dev`, which does not resolve | The site sells something that does not exist |
| G-11 | F-15-02 | 15 | — | Telemetry disclosure unpublished: policy omits opt-out switches/fields; READMEs silent; `showFirstRunNotice` has **no callers** | Transparency obligation (B3 R-02). Cheap; engineering already compliant |
| G-12 | F-5-01 | 5,14 | — | No `.env.example` anywhere; env contract exists only in a `wrangler.toml` comment and TS interfaces | Blocks "a stranger could run it from the docs alone" |
| G-13 | F-4-01 | 4 | — | Local/CI parity: 4 failures locally vs 10 in CI on the same suite | Contributors cannot reproduce CI; hid this breakage |
| G-14 | F-14-03 | 14 | CF-01 | README Quick Start will not reach a first comparison (npx vs local install, browsers, `init --ci`, unstated git/origin) | Directly fails the Stranger Test in the gate |
| G-15 | F-6-04 | 6 | — | No backup or restore. **D1 Time Travel exists and is unused** (B1 R-08/09) | Gate requires a performed restore. Config+runbook, not a build |
| G-16 | F-7-03 | 7 | — | No rollback. **`wrangler rollback` exists and is unused** (B1 R-10) | Gate requires a rehearsed rollback |
| G-17 | F-9-03 | 9 | all | **No alert fires when `main` goes red** | Exactly the blindness that let this baseline rot for 4h unnoticed. Gate item 6 |
| G-18 | R-A-08 | 1,14 | — | Bar 1 (`product-completion-plan.md:690-716`) never superseded; still self-describes as frozen | Future sessions re-inherit a nine-flow platform scope |
| G-19 | F-5-07 | 5,13 | — | `apps/web` ships no CSP, HSTS, or `X-Frame-Options`; `httpEquiv` nosniff is ignored by browsers | Live site, clickjackable, no XSS containment. cloud-api does this correctly already |
| G-20 | F-5-08 | 5,12 | CF-04 | Prompt injection: crawled page paths reach the verdict-deciding prompt undelimited | Must confirm pixel-diff remains authoritative so a page cannot clear its own regression |
| G-21 | R-B1-04 | 3 | — | vitest 4.1.9→4.1.11 is a **security** bump (GHSA Critical+Moderate), mis-read as cosmetic | Open PR #205/#206, mis-prioritised |
| G-22 | F-12-01 | 12 | CF-04 | AI classification marketed but **accuracy never measured** (`validation/results-v0.2.md` ran AI disabled) | CF-04 honesty clause: measure it or stop claiming it |

### S2/S3 promoted to FINISH — small and on a critical path (6)

| id | source | angle | gap | rationale for promotion |
|---|---|---|---|---|
| G-23 | F-5-15 | 5 | Unused `react-router-dom` devDep carries the only 2 advisories in the tree | S-size: `npm uninstall`. Takes full-tree advisories to zero |
| G-24 | F-3-03 | 3 | lint-staged covers only 2 of 11 workspaces; 2 workspaces lack typecheck | S-size, and it is the control that would have caught G-01 pre-merge |
| G-25 | F-5-09 | 5 | `gitDiff()` builds a shell string via `execSync(\`git ${args}\`)` | S-size one-line change to `execFileSync`; neighbouring code already does it right |
| G-26 | R-A-03/04 | 1 | Stale branches + a worktree still mounted on an already-merged audit branch | S-size; R10 requires total cleanup |
| G-27 | F-17-02 | 17 | No incident process, no recovery doc, bus factor 1 | S-size (the framework asks for three lines), and G-17 needs somewhere to point |
| G-28 | R-A-07 | 3 | 11 dependabot PRs blocked behind red `main`, with a real ordering constraint | Must drain after green; `lint-staged` 17 needs Node ≥22.22.1 so G-09 precedes it |

---

## Below the cut line

### DEFER — post-launch, issue filed (14)

| id | gap | why deferred |
|---|---|---|
| G-29 | `cloud-api` rate limiter mounted after `/auth`, `/v1/keys`, `/v1/billing`; per-isolate `Map` only | Behind the §4 deployment gate — not reachable in production |
| G-30 | 7-day session cookie, no logout or revocation; no CSRF on 18 dashboard POSTs | Same gate |
| G-31 | CORS reflects any `localhost:<port>` with `credentials: true` | Same gate |
| G-32 | `/v1/usage` returns hardcoded limits contradicting enforcement | Same gate |
| G-33 | `DELETE /v1/runs/:id` has no team path (fail-closed inconsistency) | Same gate |
| G-34 | Hosted run can report `completed` without comparing; `daytona-runner.ts:209` passes non-existent CLI flags | Same gate — and named explicitly as gate condition (c) |
| G-35 | `previewUrlCache` unbounded in the GitHub App worker | Integration not live |
| G-36 | Marketplace listings not live (4 platforms) | Third-party review; outside the product's control |
| G-37 | Most outbound `fetch` lack timeout/retry/circuit breaker | Real, but the CLI is short-lived and `pageTimeout` covers the page under test |
| G-38 | OpenTelemetry pinned in 30 overrides but never instrumented | Cleanup; the overrides may be load-bearing for resolution and need care |
| G-39 | God files: `pipeline.ts` 1328, web `index.tsx` 1811 | Refactor, explicitly out of scope in §4 |
| G-40 | No coverage thresholds enforced | Out of scope in §4 |
| G-41 | PNG baseline growth will bloat git history over time | Slow-moving; needs a documented pruning story, not a launch fix |
| G-42 | `apps/web` has no axe/keyboard/contrast proof | Out of scope in §4 |

### ACCEPT — risk accepted with expiry (2)

| id | gap | rationale | expiry |
|---|---|---|---|
| G-43 | No AI spend cap | AI is **BYOK** — the user supplies their own provider key, so spend is bounded by their own provider limits, not by this product. A cap would be a courtesy, not a control | 2027-03-01, revisit if a hosted AI path ever ships |
| G-44 | npm publishes with a long-lived `NPM_TOKEN` rather than OIDC trusted publishing | The existing pipeline already blocks a compromised PR from publishing (tag must equal `VERSION`, commit must be an ancestor of the default branch, green CI required on the exact SHA, release must be immutable). Migrating requires a credential change and a Human Action | 2027-03-01 |

*No `ACCEPT` sits at S0. Both are S2.*

---

## Cut line

**Above:** 28 FINISH gaps — 9 × S0, 13 × S1, 6 promoted S2/S3.
**Below:** 14 DEFER, 2 ACCEPT. Nothing CUT: no half-built surface needs deleting, because the
hosted platform is unreachable rather than half-exposed, and `DEFINITION.md` §4 handles it with a
deployment gate instead of code removal.

The plan in Phase 4 contains only the 28 above-the-line gaps plus the launch-gate proofs.
