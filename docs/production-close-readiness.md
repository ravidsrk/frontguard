# Frontguard — Production Close Readiness (T_FINAL)

*Compiled 2026-06-20 for PR #108 (`ravidsrk/t-final-readiness`). This is the
T_FINAL output artifact. The frozen canonical inventory remains
[`docs/production-pending.md`](./production-pending.md) (REVIEW_DOC — do not
modify). Live coordinator ledger:
[`docs/production-close-progress.md`](./production-close-progress.md).*

**BASE:** `ravidsrk/production-close` includes PR #108 merge `29d6231`.
Engineering gates ran on `aad7733` (ledger-only delta after code-equivalent
merge `9a659e1` from PR #107).

**Engineering gates:** Full `npm ci && npm run build && npm test` green on
`aad7733` (2026-06-20). Gates first ran on code-equivalent `9a659e1`; re-checked
on `aad7733` — the only delta is ledger rows for A10DOC/A10REL merge markers (no
code change). `npm audit --omit=dev --audit-level=high` → 0 critical/high.

**Verdict (code-side):** **CONDITIONAL GO** — OSS CLI shippable in-repo; cloud /
SaaS / distribution remain OPS-gated. **No live OPS executed** (O1–O15 all
human-owned, NOT done).

---

## Scorecard (49 confirmed findings)

| Status | Count | Notes |
|--------|------:|-------|
| **CLOSED** | 36 | Code fix merged; repro no longer fails from code alone |
| **CODE_CLOSED** | 13 | Code mitigated; OPS still required for full closure |
| **OPEN** | 0 | All 49 confirmed findings addressed in code |

---

## Merged PRs (#94–#107) + T_FINAL

| PR# | Task | Cluster / wave | Findings closed | Status |
|-----|------|----------------|-----------------|--------|
| #94 | `docker-doc-fix` | B / C4 | docs-3; install-4, docker-1 CODE_CLOSED | MERGED |
| #95 | `b1-code-mitigations` | B / C3 | claim-4, dist-3, docs-2, install-9 CODE_CLOSED; install-6, claim-6 CLOSED | MERGED |
| #96 | `storybook-render` | A / C10 | sb-1, sb-3 | MERGED |
| #97 | `cli-config-loader` | A / C1 | install-1, sb-2 | MERGED |
| #98 | `docs-snippet-sweep` | A / C2 | docs-1, docs-10 | MERGED |
| #99 | `action-doc-residual` | B / C8 | int-3, docs-5, docs-6 CODE_CLOSED | MERGED |
| #100 | `int7-slack-ssrf` | A / INT7 | int-7 | MERGED |
| #101 | `supply-chain` | A / C11 | supply-2 CLOSED; supply-6, install-13 CODE_CLOSED | MERGED |
| #102 | `mcp-fixes` | A / C12 | mcp-3, mcp-6, mcp-8, mcp-9, mcp-10 | MERGED |
| #103 | `docs-hygiene` | A / C15 | docs-4, docs-7, docs-8, docs-9 | MERGED |
| #104 | `marketing-claims` | A / C14 | claim-7, claim-9 CLOSED; dist-11 CODE_CLOSED | MERGED |
| #105 | `validation-methodology` | A / C16 | val-5 | MERGED |
| #106 | `a10-doc-reconcile` | FINAL / A10DOC | fix-progress, SECURITY.md, launch-readiness | MERGED |
| #107 | `a10-release-prep` | FINAL / A10REL | VERSION, CHANGELOG, 0.2.1 prep | MERGED (`9a659e1`) |
| **#108** | **T_FINAL** | FINAL | acceptance gate + this doc | **MERGED (`29d6231`)** |

---

## Findings by wave

### Wave A — evaluator unblockers (code)

| Item | Finding(s) | Status | PR# | OPS remainder |
|------|-----------|--------|-----|---------------|
| A1 TS config loader | install-1, sb-2 | CLOSED | #97 | — |
| A2 docs `npx` snippet sweep | docs-1, docs-10 | CLOSED | #98 | — |
| A3 MCP `npx` silent fail | mcp-3 | CLOSED | #102 | — |
| A4 Storybook integration | sb-1, sb-3 | CLOSED | #96 | — |
| A5 Storybook/self-host doc flags | docs-4, docs-7, docs-8, docs-9 | CLOSED | #103 | — |
| A6 MCP run-scoped approve | mcp-6 | CLOSED | #102 | — |
| A7 Supply chain | supply-2, supply-6, install-13 | supply-2 CLOSED; supply-6, install-13 CODE_CLOSED | #101 | O15 Dependabot enable; O11 npm republish |
| A8 Validation methodology | val-5 | CLOSED | #105 | — |
| A9 Marketing / README claims | claim-7, claim-9, dist-11 | claim-7/9 CLOSED; dist-11 CODE_CLOSED | #104 | O2 redeploy `frontguard.dev` |
| A10 Process hygiene | fix-progress, SECURITY.md, launch-readiness, VERSION | CLOSED | #106, #107 | O10/O11 publish+tag (human-owned) |
| (A-misc) MCP re-verify | mcp-8, mcp-9, mcp-10 | CLOSED | #102 | — |
| (A-misc) Slack SSRF | int-7 | CLOSED | #100 | — |

### Wave B — SaaS code-side mitigations

| Item | Finding(s) | Status | PR# | OPS remainder |
|------|-----------|--------|-----|---------------|
| B1 DNS code-side | claim-4, dist-3, docs-2, install-9; install-6, claim-6 | CODE_CLOSED (links CLOSED) | #95 | O1 DNS + O2 deploy + waitlist standup |
| B5 Docker code/doc | docs-3; install-4, docker-1 | CODE_CLOSED | #94 | O9 docker publish |
| B6 Action ref code/doc | int-3, docs-5, docs-6 | CODE_CLOSED | #99 | O10 `v0` tag; O12 marketplace |

### Do-not-refix (CLOSED on `main` before this run)

install-2, claim-5, cloud-1, cloud-4, sec-1, sec-2, int-1, docker-3, cloud-9,
ci-3, mcp-1, mcp-2, mcp-7, install-7 — re-verified inside cluster tasks only.

---

## REVIEW_DOC acceptance criteria walk

Mapped from [`docs/production-pending.md`](./production-pending.md) §
Production-ready acceptance criteria. T_FINAL walked 2026-06-20 on BASE
`aad7733` (gates code-equivalent to `9a659e1`).

### OSS CLI (free tier)

| Gate | Status | Evidence / OPS |
|------|--------|----------------|
| `npm install @frontguard/cli@latest && npx frontguard init && npx frontguard doctor` | **CODE_CLOSED** (OPS O11) | Fix merged PR#97; registry still `0.2.0` until publish. Local `npm install ./packages/cli` + init + doctor passes. |
| `npx -p @frontguard/cli frontguard run --url <reachable>` | **CLOSED** in-repo | CLI pipeline green; full test suite passes. |
| `npm audit --omit=dev --audit-level=high` | **CLOSED** | 0 critical/high on BASE @ `aad7733`. |
| Docs quick-start matches README invocation | **CLOSED** | PR#98; enforcement tests green. |

### Cloud API (hosted)

| Gate | Status | Evidence / OPS |
|------|--------|----------------|
| `https://api.frontguard.dev/health` — 200 | **OPS** O1+O2 | NXDOMAIN; not deployed |
| D1 migrations 001–005 on prod | **OPS** O4 | — |
| `POST /v1/run` regression detection | **CLOSED** in code | PR#73 `restoreBaselines`; live verify = OPS O5 |
| `waitUntil` verified on staging (5+ min) | **VERIFY_AT_SCALE** OPS O5 | — |
| `DASHBOARD_SESSION_SECRET` set; forged cookie fails | **OPS** O3+O13 | — |
| SSRF `169.254.169.254` rejected | **CLOSED** in code | `render-target.ts`; DNS-rebind pin = OPS O6 |

### Integrations

| Gate | Status | Evidence / OPS |
|------|--------|----------------|
| GitHub App webhook at live URL | **OPS** O1+O2 | — |
| Slack `/frontguard status` correct count | **CLOSED** in code | PR#79; live = OPS O2 |
| `npx -y @frontguard/mcp` returns tools list | **CODE_CLOSED** (OPS O11) | Fix merged PR#102; registry publish pending |
| Netlify/Vercel plugins reach live API | **OPS** O1+O2 | API NXDOMAIN |

### Commercial / marketing

| Gate | Status | Evidence / OPS |
|------|--------|----------------|
| Pricing CTA resolves | **CODE_CLOSED** | PR#95 waitlist `mailto:`; live signup = OPS O12 |
| Pro tier features match `plans.ts` | **CLOSED** | PR#95 / earlier |
| No Schema.org ratings without real reviews | **CODE_CLOSED** | PR#104; live HTML stale until OPS O2 redeploy |
| `SECURITY.md` lists supported versions | **CLOSED** | PR#106: 0.2.x supported |

### Distribution

| Gate | Status | Evidence / OPS |
|------|--------|----------------|
| `frontguard/render:latest` pullable | **OPS** O9 | Docker Hub 404 |
| `ravidsrk/frontguard@v0` tag + Action smoke | **OPS** O10 | Code shim merged PR#99 |
| npm `@frontguard/*@0.2.1+` includes remediation | **OPS** O11 | Prep merged PR#107; not published |

---

## Human OPS / RELEASE queue (O1–O15) — NOT done

**None executed this run.** Safety rails: no wrangler deploy, D1 migrate, DNS
edit, docker push, `scripts/release.sh` / npm publish, git tag push, live secrets,
or marketplace submit. Full procedures in
[`docs/arch-ops-actions.md`](./arch-ops-actions.md).

| # | OPS item | Unblocks / verifies | Owner | Done |
|---|----------|---------------------|-------|:----:|
| O1 | Move `frontguard.dev` zone to Cloudflare; A/AAAA/CNAME for api/app/github-app/telemetry | claim-4, dist-3, docs-2, install-9 (C3) | Human ops | ✗ |
| O2 | `wrangler deploy` cloud-api / github-app / slack-app; redeploy apps/web | Cloud API live; integrations; dist-11 live HTML | Human ops | ✗ |
| O3 | Set Worker secrets: `DASHBOARD_SESSION_SECRET` (≥32), `STRIPE_*`, `DAYTONA_API_KEY`, `GITHUB_*`, OAuth | Forged-cookie test; billing | Human ops | ✗ |
| O4 | Apply D1 migrations 001→005 to staging then prod | DM-1/2/3, CONC-2, SEC-4, CONC-3, OPS-3 | Human ops | ✗ |
| O5 | VERIFY_AT_SCALE REL-1: multi-minute Daytona run completes; results persist | REL-1 (CODE_CLOSED PR#73) | Human ops | ✗ |
| O6 | VERIFY_AT_SCALE SEC-2: pin renderer IP post-SSRF (DNS-rebind) | SEC-2 (CODE_CLOSED PR#83) | Human ops | ✗ |
| O7 | VERIFY_AT_SCALE REL-3: deploy DO/KV distributed rate limiter | REL-3 (CODE_CLOSED PR#85) | Human ops | ✗ |
| O8 | VERIFY_AT_SCALE CONC-1/COST-1: 100 parallel `/v1/run` → rejection at cap | CONC-1/COST-1 (CLOSED PR#78) | Human ops | ✗ |
| O9 | `docker buildx build` + `docker push` `frontguard/render:0.2.1` | install-4, docker-1, docs-3 | Human ops | ✗ |
| O10 | Push git tag `v0` → stable commit | int-3, docs-5 (Action ref resolves) | Human ops | ✗ |
| O11 | Bump to 0.2.1, `scripts/release.sh`, publish `@frontguard/*` | npm staleness; supply-chain republish | Release eng | ✗ |
| O12 | Submit marketplace listings (GitHub, Vercel, Netlify, Slack) | docs-6 | Human ops | ✗ |
| O13 | Set `ENVIRONMENT=production` + real DB/bindings at deploy | SEC-6, OPS-2 (CLOSED) | Human ops | ✗ |
| O14 | Wire dead-letter consumer / alerting for `background_failures` | OPS-3 (CLOSED) | Human ops | ✗ |
| O15 | Enable Dependabot in repo settings | supply-6 | Human ops | ✗ |

---

## Decisions recorded

1. **REVIEW_DOC frozen:** `docs/production-pending.md` stays at the 2026-06-17
   inventory snapshot. T_FINAL output lives here and in mutable ledgers
   (`fix-progress.md`, `launch-readiness.md`, `production-close-progress.md`).
2. **CONDITIONAL GO scope:** In-repo OSS CLI/code is shippable; full production
   GO requires OPS O1–O15 completion. No live OPS claims before human execution.
3. **Gate SHA honesty:** Engineering gates ran on code-equivalent `9a659e1`
   (PR #107 merge). BASE `aad7733` adds only ledger rows from A10DOC/A10REL
   merge markers — gates re-checked green on `aad7733` with no code delta.
4. **Registry vs repo:** `@frontguard/cli@0.2.0` on npm lacks remediation
   commits. Recommend evaluators use local install or wait for OPS O11 publish
   of `0.2.1`.
5. **T_FINAL merge posture:** PR #108 records acceptance walk and flips
   launch-readiness to final CONDITIONAL GO. PR #108 merged via `29d6231`;
   the final coordinator ledger now records `PHASE=COMPLETE` and T_FINAL
   `MERGED ✓`.
6. **Layout drift:** cluster-specs `touches` reference `apps/landing` /
   `apps/docs/content` paths that no longer exist. Fixers located live
   equivalents under `apps/web/**`; REVIEW_DOC acceptance grep rules still govern.

---

## Related artifacts

| Doc | Role |
|-----|------|
| [`production-pending.md`](./production-pending.md) | Frozen REVIEW_DOC inventory (do not modify) |
| [`production-close-progress.md`](./production-close-progress.md) | Coordinator task ledger |
| [`fix-progress.md`](./fix-progress.md) | 49-finding close-index |
| [`launch-readiness.md`](./launch-readiness.md) | Go/no-go narrative |
| [`arch-ops-actions.md`](./arch-ops-actions.md) | OPS procedure detail |

---

## Changelog

| Date | Commit | Change |
|------|--------|--------|
| 2026-06-20 | PR #108 (`29d6231`) | T_FINAL output: acceptance walk, CONDITIONAL GO verdict, OPS queue O1–O15 documented as NOT done |
| 2026-06-23 | Final ledger close | Codex post-merge audit PASS; T_FINAL REVIEWED/MERGED/ACCEPT marked complete |
