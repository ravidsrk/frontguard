# Frontguard v0.2.0 — Adversarial Remediation Progress

*Live ledger for the autonomous remediation of the 49 confirmed findings from
the v0.2.0 post-ship adversarial dossier. The coordinator's external brain
— state lives in this file, not in memory. Re-read first action every turn.*

**Source of truth (workers read this for the recommendations):**
`.frontguard-audit/adversarial-v020-postship.md` (gitignored — quotes live
secrets / forging recipes; the public/redacted version on main is
`docs/adversarial-v020-postship.md`).

**Coordinator branch base:** `origin/main`. Branch prefix: `ravidsrk/`.
**Merge policy:** `gh pr merge --merge --delete-branch` — merge commits,
NEVER squash. All commits preserved. Author: `ravidsrk <ravidsrk@gmail.com>`.

## Finding close-index (49)

Status legend: `OPEN` / `CLOSED via PR#n` / `CODE_CLOSED via PR#n (OPS: <action>)`.

### P0 (22)
- [ ] install-1  OPEN  — C1 ts-config-loader
- [ ] install-2  OPEN  — C13 init-gitignore
- [ ] install-4  OPEN  — C4 docker-render
- [ ] claim-4    OPEN  — C3 hosts/DNS code-side
- [ ] claim-5    OPEN  — C14 marketing-claims
- [ ] cloud-1    OPEN  — C7 cloud-api data model
- [ ] cloud-4    OPEN  — C5 session-secret
- [ ] sec-1      OPEN  — C5 session-secret
- [ ] int-1      OPEN  — C9 slack-result-shape
- [ ] int-3      OPEN  — C8 github-action-ref
- [ ] sb-1       OPEN  — C10 storybook
- [ ] sb-2       OPEN  — C1 ts-config-loader
- [ ] sb-3       OPEN  — C10 storybook
- [ ] docker-1   OPEN  — C4 docker-render
- [ ] docker-3   OPEN  — C4 docker-render
- [ ] docs-1     OPEN  — C2 bin/package-name
- [ ] docs-2     OPEN  — C3 hosts/DNS code-side
- [ ] docs-3     OPEN  — C4 docker-render
- [ ] docs-4     OPEN  — C15 docs-hygiene-residual
- [ ] docs-5     OPEN  — C8 github-action-ref
- [ ] docs-6     OPEN  — C8 github-action-ref
- [ ] dist-3     OPEN  — C3 hosts/DNS code-side

### P1 (15)
- [ ] install-6  OPEN  — C3 hosts/DNS code-side
- [ ] install-7  OPEN  — C2 bin/package-name
- [ ] claim-6    OPEN  — C3 hosts/DNS code-side
- [ ] cloud-9    OPEN  — C7 cloud-api data model
- [ ] sec-2      OPEN  — C6 ssrf-guard
- [ ] supply-2   OPEN  — C11 supply-chain
- [ ] supply-6   OPEN  — C11 supply-chain
- [ ] ci-3       OPEN  — C2 bin/package-name
- [ ] int-7      OPEN  — C6 ssrf-guard
- [ ] mcp-1      OPEN  — C7 cloud-api data model
- [ ] mcp-2      OPEN  — C7 cloud-api data model
- [ ] mcp-3      OPEN  — C12 mcp-correctness
- [ ] mcp-6      OPEN  — C12 mcp-correctness
- [ ] mcp-7      OPEN  — C7 cloud-api data model
- [ ] docs-8     OPEN  — C15 docs-hygiene-residual

### P2 (12)
- [ ] install-9   OPEN  — C3 hosts/DNS code-side
- [ ] install-13  OPEN  — C11 supply-chain
- [ ] claim-7     OPEN  — C14 marketing-claims
- [ ] claim-9     OPEN  — C14 marketing-claims
- [ ] mcp-8       OPEN  — C12 mcp-correctness
- [ ] mcp-9       OPEN  — C7 cloud-api data model
- [ ] mcp-10      OPEN  — C12 mcp-correctness
- [ ] val-5       OPEN  — C16 validation-methodology
- [ ] docs-7      OPEN  — C15 docs-hygiene-residual
- [ ] docs-9      OPEN  — C15 docs-hygiene-residual
- [ ] docs-10     OPEN  — C2 bin/package-name
- [ ] dist-11     OPEN  — C14 marketing-claims

## Task rows

*(Populated by T2 PLAN and updated by the convergence loop.)*

| TASK | CLUSTER | CLOSES | BUILT | PR_OPEN | REVIEWED | MERGED | EVID | OPS | PR# | WT | WORKER | NOTE |
|------|---------|--------|-------|---------|----------|--------|------|-----|-----|----|--------|------|

## OPS actions (recorded, not executed)

*The coordinator does NOT execute these — they require infra credentials.
Each is tagged with the findings it blocks from full closure.*

- [ ] _populated by T2 / convergence loop_

## Cluster map (16)

Foundation (bias first; dependents inherit):
- **C1** ts-config-loader — install-1, sb-2 — `packages/cli/src/core/config.ts`, `cli/init.ts`
- **C2** bin/package-name — docs-1, ci-3, install-7, docs-10 — `apps/docs/**`, `README.md`, `packages/cli/README.md`, `scripts/build-daytona-snapshot.ts`
- **C3** hosts/DNS code-side — claim-4, dist-3, docs-2, install-6, claim-6, install-9 — `apps/landing/**`, `apps/docs/**`, `README.md`, `integrations/**`, `packages/cli` (telemetry)
- **C7** cloud-api data model — cloud-1, cloud-9, mcp-1, mcp-2, mcp-7, mcp-9 — `packages/cloud-api/src/**`, `packages/mcp/src/**`

Independent (parallelize across isolated worktrees):
- **C4** docker-render — install-4, docker-1, docker-3, docs-3
- **C5** session-secret — sec-1, cloud-4
- **C6** ssrf-guard — sec-2, int-7
- **C8** github-action-ref — int-3, docs-5, docs-6
- **C9** slack-result-shape — int-1
- **C10** storybook — sb-1, sb-3
- **C11** supply-chain — supply-2, supply-6, install-13
- **C12** mcp-correctness — mcp-3, mcp-6, mcp-8, mcp-10
- **C13** init-gitignore — install-2
- **C14** marketing-claims — claim-5, claim-7, claim-9, dist-11
- **C15** docs-hygiene-residual — docs-4, docs-7, docs-8, docs-9
- **C16** validation-methodology — val-5

## Out of scope (recorded per directive)

- All 15 coverage-gap entries (`gap-1` … `gap-15` in the dossier) — explicitly
  "we did not look there" rather than findings; not closed by this remediation.
- All 112 refuted candidate findings — did not survive two-lens verification.

## Next-wave selector

*(Updated each coordinator turn by re-reading this file + `orca orchestration task-list --json`.)*

Initial: T1 (research) and T2 (plan) dispatched. After T2 freezes scope,
saturate FOUNDATION clusters first (C1, C2, C3, C7) — partition C7
internally (cloud-1 must land before its dependents). Then parallel
INDEPENDENT clusters subject to the collision list (see directive).
