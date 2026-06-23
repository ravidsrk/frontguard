# Frontguard v0.2.0 — Adversarial Remediation Progress

*Reconciled 2026-06-20 against the frozen REVIEW_DOC
[`docs/production-pending.md`](./production-pending.md) and
[`docs/production-close-progress.md`](./production-close-progress.md) on BASE
`ravidsrk/production-close` after PR #108 merge `29d6231` and final ledger close.
T_FINAL acceptance output: [`production-close-readiness.md`](./production-close-readiness.md)
(PR #108, merged).*

**Source of truth (workers read this for the recommendations):**
`.frontguard-audit/adversarial-v020-postship.md` (gitignored — quotes live
secrets / forging recipes; the public/redacted version on main is
`docs/adversarial-v020-postship.md`).

**Coordinator branch base:** `ravidsrk/production-close`. Branch prefix: `ravidsrk/`.
**Merge policy:** `gh pr merge --merge --delete-branch` — merge commits,
NEVER squash. All commits preserved. Author: `ravidsrk <ravidsrk@gmail.com>`.

## Scorecard (49 confirmed findings)

| Status | Count | Notes |
|--------|------:|-------|
| **CLOSED** | 36 | Code fix merged; repro no longer fails from code alone |
| **CODE_CLOSED** | 13 | Code mitigated; OPS still required for full closure |
| **OPEN** | 0 | All 49 confirmed findings addressed in code |

---

## Finding close-index (49)

Status legend: `OPEN` / `CLOSED via PR#n` / `CLOSED (main)` / `CODE_CLOSED via PR#n (OPS: <action>)`.

### P0 (22)

- [x] install-1  CLOSED via PR#97  — C1 ts-config-loader
- [x] install-2  CLOSED (main)  — C13 init-gitignore
- [x] install-4  CODE_CLOSED via PR#94 (OPS: O9 docker publish)  — C4 docker-render
- [x] claim-4    CODE_CLOSED via PR#95 (OPS: O1 DNS + O2 deploy)  — C3 hosts/DNS code-side
- [x] claim-5    CLOSED (main)  — C14 marketing-claims
- [x] cloud-1    CLOSED (main)  — C7 cloud-api data model
- [x] cloud-4    CLOSED (main)  — C5 session-secret
- [x] sec-1      CLOSED (main)  — C5 session-secret
- [x] int-1      CLOSED (main)  — C9 slack-result-shape
- [x] int-3      CODE_CLOSED via PR#99 (OPS: O10 `v0` tag)  — C8 github-action-ref
- [x] sb-1       CLOSED via PR#96  — C10 storybook
- [x] sb-2       CLOSED via PR#97  — C1 ts-config-loader
- [x] sb-3       CLOSED via PR#96  — C10 storybook
- [x] docker-1   CODE_CLOSED via PR#94 (OPS: O9 docker publish)  — C4 docker-render
- [x] docker-3   CLOSED (main)  — C4 docker-render
- [x] docs-1     CLOSED via PR#98  — C2 bin/package-name
- [x] docs-2     CODE_CLOSED via PR#95 (OPS: O1 DNS)  — C3 hosts/DNS code-side
- [x] docs-3     CODE_CLOSED via PR#94 (OPS: O9 docker publish)  — C4 docker-render
- [x] docs-4     CLOSED via PR#103  — C15 docs-hygiene-residual
- [x] docs-5     CODE_CLOSED via PR#99 (OPS: O10 `v0` tag)  — C8 github-action-ref
- [x] docs-6     CODE_CLOSED via PR#99 (OPS: O12 marketplace)  — C8 github-action-ref
- [x] dist-3     CODE_CLOSED via PR#95 (OPS: O1 DNS)  — C3 hosts/DNS code-side

### P1 (15)

- [x] install-6  CLOSED via PR#95  — C3 hosts/DNS code-side
- [x] install-7  CLOSED (main)  — C2 bin/package-name
- [x] claim-6    CLOSED via PR#95  — C3 hosts/DNS code-side
- [x] cloud-9    CLOSED (main)  — C7 cloud-api data model
- [x] sec-2      CLOSED (main)  — C6 ssrf-guard
- [x] supply-2   CLOSED via PR#101  — C11 supply-chain
- [x] supply-6   CODE_CLOSED via PR#101 (OPS: O15 Dependabot repo settings — human-owned, NOT done)  — C11 supply-chain
- [x] ci-3       CLOSED (main)  — C2 bin/package-name
- [x] int-7      CLOSED via PR#100  — C6 ssrf-guard (Slack-local)
- [x] mcp-1      CLOSED (main)  — C7 cloud-api data model
- [x] mcp-2      CLOSED (main)  — C7 cloud-api data model
- [x] mcp-3      CLOSED via PR#102  — C12 mcp-correctness
- [x] mcp-6      CLOSED via PR#102  — C12 mcp-correctness
- [x] mcp-7      CLOSED (main)  — C7 cloud-api data model
- [x] docs-8     CLOSED via PR#103  — C15 docs-hygiene-residual

### P2 (12)

- [x] install-9   CODE_CLOSED via PR#95 (OPS: O1 DNS / telemetry endpoint)  — C3 hosts/DNS code-side
- [x] install-13  CODE_CLOSED via PR#101 (OPS: O11 npm republish — human-owned, NOT done)  — C11 supply-chain
- [x] claim-7     CLOSED via PR#104  — C14 marketing-claims
- [x] claim-9     CLOSED via PR#104  — C14 marketing-claims
- [x] mcp-8       CLOSED via PR#102  — C12 mcp-correctness
- [x] mcp-9       CLOSED via PR#102  — C12 mcp-correctness
- [x] mcp-10      CLOSED via PR#102  — C12 mcp-correctness
- [x] val-5       CLOSED via PR#105  — C16 validation-methodology
- [x] docs-7      CLOSED via PR#103  — C15 docs-hygiene-residual
- [x] docs-9      CLOSED via PR#103  — C15 docs-hygiene-residual
- [x] docs-10     CLOSED via PR#98  — C2 bin/package-name
- [x] dist-11     CODE_CLOSED via PR#104 (OPS: redeploy `frontguard.dev` / apps-web)  — C14 marketing-claims

---

## Task rows

| TASK | CLUSTER | CLOSES | BUILT | PR_OPEN | REVIEWED | MERGED | EVID | OPS | PR# | WT | WORKER | NOTE |
|------|---------|--------|-------|---------|----------|--------|------|-----|-----|----|--------|------|
| cli-config-loader | C1 | install-1, sb-2 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 97 | c1-cli-config-loader | grok | P0 |
| docs-snippet-sweep | C2 | docs-1, docs-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 98 | docs-snippet-sweep | grok | P0; re-verify ci-3/install-7 CLOSED |
| storybook-render | C10 | sb-1, sb-3 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 96 | c10-storybook-render | grok | P0 |
| b1-code-mitigations | C3 | claim-4, dist-3, docs-2, install-9, install-6, claim-6 | ✓ | ✓ | ✓ | ✓ | ✓ | DNS+waitlist | 95 | c3-b1-code-mitigations | grok | P0 Wave-B; CODE_CLOSED DNS OPS |
| docker-doc-fix | C4 | docs-3 | ✓ | ✓ | ✓ | ✓ | ✓ | docker push | 94 | c4-docker-doc-fix | grok | P0 Wave-B; install-4/docker-1 CODE_CLOSED |
| mcp-fixes | C12 | mcp-3, mcp-6, mcp-8, mcp-9, mcp-10 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 102 | mcp-fixes | grok | P1 |
| docs-hygiene | C15 | docs-4, docs-7, docs-8, docs-9 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 103 | docs-hygiene | grok | P1 |
| supply-chain | C11 | supply-2, supply-6, install-13 | ✓ | ✓ | ✓ | ✓ | ✓ | Dependabot+republish (human) | 101 | supply-chain | grok | P1; supply-2 CLOSED; supply-6/install-13 CODE_CLOSED (OPS O15/O11 human-owned, NOT done) |
| action-doc-residual | C8 | int-3, docs-5, docs-6 | ✓ | ✓ | ✓ | ✓ | ✓ | v0 tag+marketplace | 99 | action-doc-residual | grok | P1; CODE_CLOSED |
| int7-slack-ssrf | C8-res | int-7 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 100 | int7-slack-ssrf | grok | P1 |
| validation-methodology | C16 | val-5 | ✓ | ✓ | ✓ | ✓ | ✓ | — | 105 | validation-methodology | grok | P2; CLOSED PR#105 |
| marketing-claims | C14 | claim-7, claim-9, dist-11 | ✓ | ✓ | ✓ | ✓ | ✓ | redeploy site | 104 | marketing-claims | grok | P2; dist-11 CODE_CLOSED |
| a10-doc-reconcile | — | fix-progress, SECURITY.md, launch-readiness | ✓ | ✓ | ✓ | ✓ | ✓ | — | 106 | a10-doc-reconcile | grok | FINAL; merged PR#106 |
| a10-release-prep | — | VERSION, CHANGELOG | ✓ | ✓ | ✓ | ✓ | ✓ | npm republish (human) | 107 | a10-release-prep | grok | FINAL; merged PR#107; O10/O11 NOT done |
| T_FINAL | — | acceptance gate | ✓ | ✓ | ✓ | ✓ | ✓ | — | 108 | t-final-readiness | grok | LAST; merged PR#108; Codex post-merge PASS |

---

## OPS actions (recorded, not executed)

*The coordinator does NOT execute these — they require infra credentials.
Each is tagged with the findings it blocks from full closure.*

- [ ] **O1** Move `frontguard.dev` zone to Cloudflare; A/AAAA/CNAME for api/app/github-app/telemetry — unblocks claim-4, dist-3, docs-2, install-9 (C3)
- [ ] **O2** `wrangler deploy` cloud-api / github-app / slack-app; redeploy apps/web — unblocks cloud/SaaS live
- [ ] **O3** Set Worker secrets (`DASHBOARD_SESSION_SECRET` ≥32, `STRIPE_*`, `DAYTONA_API_KEY`, `GITHUB_*`, OAuth)
- [ ] **O4** Apply D1 migrations 001→005 to staging then prod
- [ ] **O5–O8** VERIFY_AT_SCALE: REL-1 waitUntil, SEC-2 DNS-rebind pin, REL-3 distributed limiter, CONC-1/COST-1 caps
- [ ] **O9** `docker buildx build` + `docker push` `frontguard/render:0.2.1` — unblocks install-4, docker-1, docs-3
- [ ] **O10** Push git tag `v0` — unblocks int-3, docs-5
- [ ] **O11** Bump to 0.2.1, `scripts/release.sh`, publish `@frontguard/*` — unblocks npm consumers
- [ ] **O12** Submit marketplace listings (GitHub, Vercel, Netlify, Slack) — unblocks docs-6
- [ ] **O13–O15** Production bindings, dead-letter alerting, Dependabot repo settings — unblocks supply-6

Full queue: [`production-close-progress.md`](./production-close-progress.md) § OPS / VERIFY_AT_SCALE.

---

## Cluster map (16)

Foundation (bias first; dependents inherit):
- **C1** ts-config-loader — install-1, sb-2 — `packages/cli/src/core/config.ts`, `cli/init.ts` — **CLOSED PR#97**
- **C2** bin/package-name — docs-1, ci-3, install-7, docs-10 — `apps/web/**`, `README.md`, `packages/cli/README.md` — **CLOSED PR#98**
- **C3** hosts/DNS code-side — claim-4, dist-3, docs-2, install-6, claim-6, install-9 — **CODE_CLOSED PR#95** (OPS O1/O2)
- **C7** cloud-api data model — cloud-1, cloud-9, mcp-1, mcp-2, mcp-7, mcp-9 — **CLOSED (main)**

Independent (parallelize across isolated worktrees):
- **C4** docker-render — install-4, docker-1, docker-3, docs-3 — **CODE_CLOSED PR#94** (OPS O9)
- **C5** session-secret — sec-1, cloud-4 — **CLOSED (main)**
- **C6** ssrf-guard — sec-2, int-7 — **CLOSED (main + PR#100)**
- **C8** github-action-ref — int-3, docs-5, docs-6 — **CODE_CLOSED PR#99** (OPS O10/O12)
- **C9** slack-result-shape — int-1 — **CLOSED (main)**
- **C10** storybook — sb-1, sb-3 — **CLOSED PR#96**
- **C11** supply-chain — supply-2 (CLOSED), supply-6, install-13 (CODE_CLOSED — OPS O15/O11 human-owned, NOT done) — **CODE_CLOSED PR#101**
- **C12** mcp-correctness — mcp-3, mcp-6, mcp-8, mcp-10 — **CLOSED PR#102**
- **C13** init-gitignore — install-2 — **CLOSED (main)**
- **C14** marketing-claims — claim-5, claim-7, claim-9, dist-11 — **CODE_CLOSED PR#104** (OPS redeploy)
- **C15** docs-hygiene-residual — docs-4, docs-7, docs-8, docs-9 — **CLOSED PR#103**
- **C16** validation-methodology — val-5 — **CLOSED PR#105**

---

## Out of scope (recorded per directive)

- All 15 coverage-gap entries (`gap-1` … `gap-15` in the dossier) — explicitly
  "we did not look there" rather than findings; not closed by this remediation.
- All 112 refuted candidate findings — did not survive two-lens verification.

---

## Next-wave selector

Wave A+B + A10 + T_FINAL (#94–#108) merged. Remaining:

1. **OPS O1–O15** — human-owned; none executed (see `production-close-readiness.md`)
