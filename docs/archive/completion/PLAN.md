# Completion Plan

Dependency-ordered. Every task closes ≥1 gap and names the evidence file that will exist when it
is done. Sizes: S ≤2h · M ≤1d. No L tasks (R: must be split).

**The critical path is P1.** `main` is red, which blocks every merge, the production deploy, and
all 11 dependabot PRs. Nothing else can land until it is green, so P1 is not merely "first" — it
is the precondition for the rest of the plan existing.

---

## P1 — Green baseline

**Entry:** `main` red at `5f0e141`. **Exit:** CI green on `main` (`lint`, `build`, `test`, `e2e`,
`audit`, `docs-links` all passing, `Deploy Web` completing); cold start passes from lockfile;
branch list clean.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-01** | G-02 | Fix the CLI exit-code contract: invalid-config and post-config-load failure must exit **2**, not 1. Add the failing test first | S | — |
| **T-02** | G-03 | Update the two stale `storageConstructor` assertions to the real `(cwd, {mode})` signature. Verify against production source, do not weaken the assertion | S | — |
| **T-03** | G-06 | Fix `baseline-lifecycle.e2e.test.ts` deep-equal failure | M | — |
| **T-04** | G-05 | Fix `sync-version:check`: reconcile the 0.2.0/0.2.2/0.2.3 three-way drift and the `frontguard-example.yml` 4-vs-2 match count | S | — |
| **T-05** | G-04 | Resolve the bundle budget breach (188,160 vs 180,000). Decide split-vs-budget on evidence — all deps are already external, so this is first-party growth, not a leaked dependency | M | — |
| **T-06** | G-09 | Drop EOL Node 20: `engines.node` → `>=22`, CI matrix → `[22, 24]` | S | — |
| **T-07** | G-13 | Close the local/CI parity gap so `npm test` locally runs what CI enforces (4 vs 10) | M | T-01…T-03 |
| **T-08** | G-24 | Extend lint-staged beyond 2 of 11 workspaces; add typecheck to the 2 workspaces lacking it | S | — |
| **T-09** | G-23 | Remove the unused `react-router-dom` root devDependency (imported nowhere; carries the only 2 advisories) | S | — |
| **T-10** | G-26 | Delete the merged `audit/launch-finish-2026-08` remote branch and its worktree; delete the abandoned `cursor/complete-identified-items-124b` | S | after green |

## P2 — Safety and honesty of the record

**Exit:** no stale done-bar; env contract documented; latent injection hazard closed.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-11** | G-18 | Annotate `product-completion-plan.md:690-716` in place as **superseded** by `DEFINITION.md`, with the date and reason | S | — |
| **T-12** | G-12 | Add `.env.example` covering every env var the code actually reads, across cloud-api and all four integrations | S | — |
| **T-13** | G-25 | Convert `gitDiff()` from `execSync(\`git ${args}\`)` to `execFileSync` with an argv array | S | — |
| **T-14** | G-19 | Add CSP, HSTS, and `X-Frame-Options` to `apps/web` as real HTTP headers; remove the ignored `httpEquiv` nosniff meta | S | — |

## P3 — Critical flows

**Exit:** CF-01…CF-04 each carry happy-path and failure-path evidence.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-15** | G-08 | Fix the documented CI path: `actions/checkout` needs the baseline ref (`fetch-depth: 0` or an explicit ref fetch). Prove with a real workflow run | M | P1 |
| **T-16** | G-14 | Rewrite the README Quick Start so it actually reaches a first comparison: install form, Playwright browsers, git/origin prerequisite, `init` flags | M | — |
| **T-17** | G-20 | Confirm pixel-diff remains authoritative over AI classification so a crawled page cannot clear its own regression; delimit untrusted segments in the prompt | M | — |
| **T-18** | G-22 | CF-04 honesty: either measure AI classification accuracy or reduce public claims to what is demonstrable | M | — |
| **T-19** | — | Capture CF-02 failure-path evidence: `doctor` against a deliberately broken environment | S | P1 |
| **T-20** | — | Capture CF-03 evidence: CI comparison green on unchanged, **red on a deliberately regressed commit** | M | T-15 |

## P4 — Operability

**Exit:** a restore performed, a rollback rehearsed, an alert proven to fire, a runbook written.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-21** | G-17 | Alert when `main` goes red — the exact blindness that let this baseline rot unnoticed for 4h. Prove it fires | S | P1 |
| **T-22** | G-15 | Enable and document D1 Time Travel; perform a real restore into a scratch target and capture the transcript | M | — |
| **T-23** | G-16 | Rehearse `wrangler rollback` and capture the transcript | S | — |
| **T-24** | G-27 | Write the runbook + incident process + account/key recovery inventory (bus factor 1) | M | T-21…T-23 |

## P5 — Compliance and legal surfaces

**Exit:** legal pages resolve; telemetry disclosed where a user will actually see it.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-25** | G-07 | Verify `/privacy`, `/terms`, `/status` resolve in production once `Deploy Web` runs again | S | P1 |
| **T-26** | G-11 | Publish the telemetry disclosure: name `FRONTGUARD_TELEMETRY`, `--no-telemetry`, `DO_NOT_TRACK`, the endpoint, the field list, retention; add a README section; wire the orphaned `showFirstRunNotice` or delete it | S | — |

## P6 — Launch surfaces

**Exit:** the live site tells the truth.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-27** | G-10 | Remove or correct the $29 trial and its dead `app.frontguard.dev` link; reconcile pricing copy with the fact that no hosted plan exists | S | — |

## P7 — Launch rehearsal

**Exit:** gate evaluated.

| id | gaps | task | size | depends |
|---|---|---|---|---|
| **T-28** | G-28 | Drain the 11 dependabot PRs in dependency order. **`lint-staged` 17 requires Node ≥22.22.1, so T-06 must land first.** Prioritise vitest 4.1.11 — it is a security bump, not cosmetic | M | P1, T-06 |
| **T-29** | — | Stranger Test: fresh clone → first comparison in ≤15 min using the README alone | M | T-16 |
| **T-30** | — | Evaluate the launch gate mechanically against `DEFINITION.md` §2 | S | all |

---

## Summary

| Phase | Tasks | S | M |
|---|---|---|---|
| P1 Green baseline | 10 | 7 | 3 |
| P2 Safety & record | 4 | 4 | 0 |
| P3 Critical flows | 6 | 1 | 5 |
| P4 Operability | 4 | 2 | 2 |
| P5 Compliance | 2 | 2 | 0 |
| P6 Launch surfaces | 1 | 1 | 0 |
| P7 Rehearsal | 3 | 1 | 2 |
| **Total** | **30** | **18** | **12** |

**Longest dependency chain:** T-06 → T-28 (Node engines must precede the lint-staged major), and
P1 → T-15 → T-20 (CI comparison evidence needs a green pipeline first).

**No `TARGET_DATE` set**, so this is ordered by dependency, not calendar. No dates are invented.

---

## Human Actions gating launch

Recorded in `HUMAN_ACTIONS.md`. Summary: the Cloudflare-side operations (D1 Time Travel retention
setting, a production rollback rehearsal, alert delivery configuration) touch a live account and
fall under R15, as does any npm credential change. Everything else in this plan is agent-side.
