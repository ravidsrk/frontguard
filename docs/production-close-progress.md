# Frontguard — Production Close Progress (Coordinator Ledger)

```
PHASE=FIXING
```

Live coordinator ledger for the **production-close run (2026-06-20)**. Transcribed by the
ingest worker from the frozen canonical inventory **`docs/production-pending.md`** (REVIEW_DOC,
compiled 2026-06-17 @ `b472457`) plus auxiliary acceptance specs in
`/Users/ravindra/orca/workspaces/frontguard/tang/.frontguard-audit/cluster-specs.json`.
Setup facts and decisions: see `DECISIONS.md` § "Production close run, 2026-06-20".

- **BASE:** `ravidsrk/production-close` @ `fb8b599` (origin). Per-cluster fix PRs cut from and merge into BASE.
- **MAINTAINER (every commit):** `ravidsrk <ravidsrk@gmail.com>`.
- **Merge policy:** `gh pr merge --merge --delete-branch` (commits preserved, never squash). Merge ≠ deploy.
- **Engineering gate:** `npm ci && npm run build && npm test` (root fans out via workspaces). Per-workspace scripts in `DECISIONS.md`.
- **Scope of THIS run:** code + docs fixes only. Every OPS / deploy / publish / DNS / tag / migrate item is **human-owned** and lives in the OPS queue below (mirrored in `docs/arch-ops-actions.md`); it is **NOT** a dispatchable fix task and is **NOT done**.
- **Do not re-fix:** REVIEW_DOC "What already landed" rows (install-2, claim-5, cloud-1/4, sec-1/2, int-1, docker-3, cloud-9, ci-3, mcp-1/2/7, install-7) are CLOSED. Where a CLOSED finding shares a cluster with OPEN ones, the cluster task only re-verifies it.

> **⚠ LAYOUT DRIFT (read before fixing).** cluster-specs `touches` were authored against an
> `apps/landing/**` + `apps/docs/content/docs/**.mdx` (fumadocs) layout. **Current BASE has
> `apps/web/**` only** (single TanStack app); `apps/landing` and `apps/docs/content` do **not**
> exist here. Live docs content is in `apps/web/src/lib/` + `apps/web/src/routes/`; the live
> pricing CTA is `apps/web/src/routes/pricing.tsx`. Stray `npx frontguard` snippets live in
> `docs/*.md`, `CONTRIBUTING.md`, `docs/launch/*`, `docs/design-extract/tanstack/**`, and test
> fixtures — **not** in `apps/docs/content`. Fixers must locate live equivalents; **REVIEW_DOC
> acceptance still governs**.

---

## Hot-file map (serialize: one in-flight task per hot file)

| Hot file / surface | Tasks that touch it | Serialization rule |
|--------------------|---------------------|--------------------|
| CLI config (`packages/cli/src/core/config.ts`, doctor) | C1 | sole owner |
| Storybook/render (`packages/cli/src/discovery/storybook.ts`, `render/playwright.ts`) | C10 | sole owner |
| MCP (`packages/mcp/src/**`) | C12 | sole owner |
| Supply-chain / root manifests (`package.json`, `package-lock.json`, `.github/`) | C11 | sole owner; **also coordinate the pre-existing coordinator lockfile edit** |
| Validation (`validation/**`, `packages/cli/src/diff/pixel.ts`) | C16 | isolated (indep) |
| Docs snippet sweep (root `README.md`, `CONTRIBUTING.md`, `docs/*`, `apps/web` docs) | C2 | run before C14/C15 |
| Docs hygiene (`apps/web` docs: self-host, sidebar, links) | C15 | after C2 + C4 |
| Cloud/API integration docs + `pricing.tsx` | C3 | **shares `pricing.tsx` with C14** → never run C3 ∥ C14 |
| Root README / marketing + `pricing.tsx` | C14 | after C2; **serialize with C3 on `pricing.tsx`** |
| Docker render + `cross-os-rendering` doc | C4 | run before C15 (shared cross-os doc) |
| Action / integration docs (`action.yml`, `integrations/github-app/**`, github-actions doc) | C8 | **shares slack/vercel integration docs with C3** → serialize with C3 |
| Slack-app source SSRF guard (`integrations/slack-app/src/**`) | INT7 | isolated (indep) |
| Ledgers/docs (`fix-progress.md`, `SECURITY.md`, `launch-readiness.md`) | A10DOC | FINAL, after all code merges |
| Versions/CHANGELOG (`VERSION`, workspace `package.json`, `CHANGELOG.md`) | A10REL | FINAL, after all code merges |

---

## CLOSE-INDEX — every IN finding from REVIEW_DOC

Legend: **OPEN** = reproduces / unaddressed · **PARTIAL** = improved, acceptance not met ·
**CODE_CLOSED** = code mitigated, OPS required for full closure. CLOSED / do-not-refix rows are
**excluded** (re-verified inside their cluster only).

### Wave A — code (A1–A10)

| Item | Finding(s) | Cluster | Status | Task row |
|------|-----------|---------|--------|----------|
| A1 TS config loader | install-1, sb-2 | C1 | CLOSED (PR#97) | `cli-config-loader` |
| A2 docs `npx` snippet sweep | docs-1, docs-10 (both CLOSED via PR#98) · re-verify ci-3, install-7 (CLOSED) | C2 | CLOSED (PR#98) | `docs-snippet-sweep` |
| A3 MCP `npx` silent fail | mcp-3 | C12 | OPEN | `mcp-fixes` |
| A4 Storybook integration | sb-1, sb-3 | C10 | CLOSED (PR#96) | `storybook-render` |
| A5 Storybook/self-host doc flags | docs-4, docs-7, docs-8, docs-9 · install-6, claim-6 (dead links) | C15 | OPEN | `docs-hygiene` |
| A6 MCP run-scoped approve | mcp-6 | C12 | OPEN | `mcp-fixes` |
| A7 Supply chain | supply-2, supply-6, install-13 | C11 | OPEN | `supply-chain` |
| A8 Validation methodology | val-5 | C16 | OPEN | `validation-methodology` |
| A9 Marketing / README claims | claim-7 (OPEN), claim-9 (PARTIAL), dist-11 (OPEN) · re-verify claim-5 (CLOSED) | C14 | OPEN | `marketing-claims` |
| A10 Process hygiene | fix-progress drift, SECURITY.md versions, launch-readiness banner, npm version staleness | — | OPEN | `a10-doc-reconcile`, `a10-release-prep`, `T_FINAL` |
| (A-misc) MCP re-verify | mcp-8 (OPEN), mcp-10 (OPEN) | C12 | OPEN | folded into `mcp-fixes` |
| (A-misc) MCP cloud browser | mcp-9 (OPEN, re-verify — cloud drops browser on results) | C12/C7 | OPEN | re-verify in `mcp-fixes` (note: C7 cloud already CLOSED mcp-1/2/7) |
| (A-misc) Slack SSRF | int-7 (CLOSED via PR#100) | C8-residual | CLOSED | `int7-slack-ssrf` |

### Wave B — code-side mitigations

| Item | Finding(s) | Cluster | Status | Task row |
|------|-----------|---------|--------|----------|
| B1 DNS code-side | claim-4, dist-3, docs-2, install-9 (code-side); install-6/claim-6 links | C3 | CODE_CLOSED via PR#95 (claim-4/dist-3/docs-2/install-9 — OPS O1 DNS + O2 deploy + waitlist standup remain); install-6/claim-6 links CLOSED | `b1-code-mitigations` |
| B5 Docker code/doc | docs-3 (CODE_CLOSED via PR#94 — OPS O9 docker publish remains); install-4, docker-1 (CODE_CLOSED — OPS O9 publish); docker-3 (re-verified CLOSED) | C4 | CODE_CLOSED (docs-3 closed via PR#94; OPS O9 remains) | `docker-doc-fix` |
| B6 Action ref code/doc | int-3, docs-5, docs-6 — code-side CODE_CLOSED via PR#99 (OPS O10 `v0` tag + O12 marketplace submissions remain human-owned) | C8 | CODE_CLOSED via PR#99 | `action-doc-residual` |

> Wave B **pure-OPS** items (B1 DNS records, B2 wrangler deploy, B3 D1 migrate, B4 staging verify,
> B5 docker push, B6 `v0` tag push, B7 npm republish, B8 marketplace submit) and the fresh-audit
> residual OPS are **not** code tasks — see the OPS / VERIFY_AT_SCALE queue below.

---

## TASK ROWS

Columns: `TASK <slug>` | `WAVE` | `CLUSTER` | `FILE` | `CLOSES=[ids]` | `CODED PR_OPEN REVIEWED MERGED ACCEPT` | `OPS` | `PR#` | `WT` | `WORKER` | `NOTE`.
All booleans start **✗** (`✓` when achieved). Dependency order: **P0** (C1, C2, C10, C3, C4) → **P1** (C12, C15, C11, C8, INT7) → **P2** (C16, C14) → **FINAL** (A10DOC, A10REL, T_FINAL). `T_FINAL` last.

| TASK | WAVE | CLUSTER | FILE | CLOSES | CODED | PR_OPEN | REVIEWED | MERGED | ACCEPT | OPS | PR# | WT | WORKER | NOTE |
|------|------|---------|------|--------|:-----:|:------:|:--------:|:------:|:------:|-----|-----|----|--------|------|
| cli-config-loader | A | C1 | hot | [install-1, sb-2] | ✓ | ✓ | ✓ | ✓ | ✓ | none | 97 | c1-cli-config-loader | grok | P0. Codex PASS (task_cd5e5e62030a); smoke-root/subpath green; Bugbot non-blocking. `task_edb4e160cc15` |
| docs-snippet-sweep | A | C2 | hot | [docs-1, docs-10] | ✓ | ✓ | ✓ | ✓ | ✓ | none | 98 | docs-snippet-sweep | grok | P0; dep C1. Codex PASS (task_2e3f80a26927); focused docs/template tests 21/21 + smoke-root/subpath green; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule. Acceptance grep: bare `npx frontguard` survives only in frozen audit/coordination text (historical audit docs intentionally unchanged). re-verify ci-3/install-7. `task_3bf74898dd24` |
| storybook-render | A | C10 | hot | [sb-1, sb-3] | ✓ | ✓ | ✓ | ✓ | ✓ | none | 96 | c10-storybook-render | grok | P0. Codex PASS (task_e7ec6ffb2267); 69/69 focused Storybook tests + build green; smoke-root/subpath green; Bugbot non-blocking. `task_1fe185564626` |
| b1-code-mitigations | B | C3 | hot | [claim-4, dist-3, docs-2, install-9, install-6, claim-6] | ✓ | ✓ | ✓ | ✓ | ✓ | DNS+waitlist (human) | 95 | c3-b1-code-mitigations | grok | P0 Wave-B code; shares pricing.tsx w/ C14. Codex PASS (task_033abbd0af4b); smoke-root/subpath green; Bugbot Low-Risk/non-blocking. GH formal approval blocked by same-account own-PR rule. CODE_CLOSED: claim-4/dist-3/docs-2/install-9 (OPS O1 DNS + O2 deploy + waitlist standup human-owned); install-6/claim-6 link fixes CLOSED. `task_bee2e61e7e8d` |
| docker-doc-fix | B | C4 | hot | [docs-3] | ✓ | ✓ | ✓ | ✓ | ✓ | docker push (human) | 94 | c4-docker-doc-fix | grok | P0 Wave-B code; before C15. install-4/docker-1 CODE_CLOSED. Codex PASS; OPS docker push human-owned (O9). `task_a2ed02297740` |
| mcp-fixes | A | C12 | hot | [mcp-3, mcp-6] | ✗ | ✗ | ✗ | ✗ | ✗ | none | — | — | — | P1; also re-verify mcp-8/mcp-9/mcp-10. `task_e0e99f241691` |
| docs-hygiene | A | C15 | hot | [docs-4, docs-7, docs-8, docs-9] | ✗ | ✗ | ✗ | ✗ | ✗ | none | — | — | — | P1; dep C2+C4. docs-5 residual now CODE_CLOSED via PR#99 (C8) — no longer in scope here. `task_9208764790fe` |
| supply-chain | A | C11 | hot | [supply-2, supply-6, install-13] | ✗ | ✗ | ✗ | ✗ | ✗ | enable Dependabot + republish (human) | — | — | — | P1; coordinate pre-existing lockfile edit. `task_711f52f57f99` |
| action-doc-residual | A/B | C8 | hot | [docs-5] | ✓ | ✓ | ✓ | ✓ | ✓ | v0 tag + marketplace (human) | 99 | action-doc-residual | grok | P1; int-3 CODE_CLOSED; docs-6 OPS (O12 marketplace); serialize w/ C3. Codex PASS (task_a68a39a04cc2); smoke-root/subpath green; check-doc-links 37/8; docs.test.tsx 20; github-app publish-surface 88; netlify 43; vercel 60; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule; no secrets/OPS. `task_65cfef634489` |
| int7-slack-ssrf | A | C8-res | indep | [int-7] | ✓ | ✓ | ✓ | ✓ | ✓ | none | 100 | int7-slack-ssrf | grok | P1; unclustered residual. Codex PASS (task_dd42f4692cd8); Slack typecheck + tests 8 files/76 tests; cloud-api render-target/sec-2 tests 2 files/13 tests; smoke-root/subpath green; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule; no secrets/OPS. `task_0ffae0841984` |
| validation-methodology | A | C16 | indep | [val-5] | ✗ | ✗ | ✗ | ✗ | ✗ | none | — | — | — | P2; isolated. `task_c7cd07c09f99` |
| marketing-claims | A | C14 | hot | [claim-7, claim-9, dist-11] | ✗ | ✗ | ✗ | ✗ | ✗ | redeploy site (human) | — | — | — | P2; dep C2; serialize w/ C3 on pricing.tsx. `task_23bde400428e` |
| a10-doc-reconcile | FINAL | — | hot | [fix-progress, SECURITY.md, launch-readiness] | ✗ | ✗ | ✗ | ✗ | ✗ | none | — | — | — | A10; dep all code tasks. `task_f7abe1998a35` |
| a10-release-prep | FINAL | — | hot | [VERSION, pkg-versions, CHANGELOG] | ✗ | ✗ | ✗ | ✗ | ✗ | npm republish 0.2.1 (human) | — | — | — | A10; prep only, NO publish/tag. dep all code tasks. `task_bcd083d3cac2` |
| T_FINAL | FINAL | — | indep | [acceptance-criteria gate] | ✗ | ✗ | ✗ | ✗ | ✗ | none | — | — | — | LAST; dep A10DOC+A10REL. flips launch-readiness verdict. `task_98c32be0124f` |

**Orca task IDs (for dispatch):**

| Task row | Orca task ID | Deps |
|----------|--------------|------|
| cli-config-loader (C1) | `task_edb4e160cc15` | — |
| docs-snippet-sweep (C2) | `task_3bf74898dd24` | C1 |
| storybook-render (C10) | `task_1fe185564626` | — |
| b1-code-mitigations (C3) | `task_bee2e61e7e8d` | — |
| docker-doc-fix (C4) | `task_a2ed02297740` | — |
| mcp-fixes (C12) | `task_e0e99f241691` | — |
| docs-hygiene (C15) | `task_9208764790fe` | C2, C4 |
| supply-chain (C11) | `task_711f52f57f99` | — |
| action-doc-residual (C8) | `task_65cfef634489` | — |
| int7-slack-ssrf (INT7) | `task_0ffae0841984` | — |
| validation-methodology (C16) | `task_c7cd07c09f99` | — |
| marketing-claims (C14) | `task_23bde400428e` | C2 |
| a10-doc-reconcile (A10DOC) | `task_f7abe1998a35` | all 12 code tasks |
| a10-release-prep (A10REL) | `task_bcd083d3cac2` | all 12 code tasks |
| T_FINAL (TFINAL) | `task_98c32be0124f` | A10DOC, A10REL |

---

## OPS / VERIFY_AT_SCALE queue (human-owned — NOT done)

Seeded from REVIEW_DOC Wave B, the fresh-architecture residual OPS table, and the verification
appendix. **None executed this run** (safety rails: no wrangler deploy, D1 migrate, DNS edit,
docker push, release.sh / npm publish, `v0`/`v0.2.1` tag push, live secrets, marketplace submit).
Live actions remain in `docs/arch-ops-actions.md`.

| # | OPS item | REVIEW_DOC | Unblocks / verifies | Owner | Done |
|---|----------|-----------|---------------------|-------|:----:|
| O1 | Move `frontguard.dev` zone to Cloudflare; create A/AAAA/CNAME for api/app/github-app/telemetry | B1 | claim-4, dist-3, docs-2, install-9, C3 | Human ops | ✗ |
| O2 | `wrangler deploy` cloud-api / github-app / slack-app; redeploy apps/web after doc fixes | B2 | Cloud API live; integrations | Human ops | ✗ |
| O3 | Set Worker secrets: `DASHBOARD_SESSION_SECRET` (≥32), `STRIPE_*`, `DAYTONA_API_KEY`, `GITHUB_*`, OAuth | B2 | Forged-cookie test; billing | Human ops | ✗ |
| O4 | Apply D1 migrations 001→005 to staging (verify idempotent re-run) then prod | B3 | DM-1/2/3, CONC-2, SEC-4, CONC-3, OPS-3 | Human ops | ✗ |
| O5 | VERIFY_AT_SCALE REL-1: multi-minute Daytona run reaches `completed`; results+reportHtml persist after 202 | B4 | REL-1 (CODE_CLOSED PR#73) | Human ops | ✗ |
| O6 | VERIFY_AT_SCALE SEC-2: pin renderer connection to validated IP (DNS-rebind) at Daytona/infra | B4 | SEC-2 (CODE_CLOSED PR#83) | Human ops | ✗ |
| O7 | VERIFY_AT_SCALE REL-3: deploy DO/KV distributed rate limiter; load-test under concurrency | B4 | REL-3 (CODE_CLOSED PR#85) | Human ops | ✗ |
| O8 | VERIFY_AT_SCALE CONC-1/COST-1: 100 parallel `/v1/run` → rejection at cap; atomic reservation holds | B4 | CONC-1/COST-1 (CLOSED PR#78) | Human ops | ✗ |
| O9 | `docker buildx build --platform linux/amd64 -t frontguard/render:0.2.1 -t :latest …` + `docker push`; smoke-pull; pin digest in docs | B5 | install-4, docker-1, docs-3 (truly closed) | Human ops | ✗ |
| O10 | Push lightweight git tag `v0` → stable commit (`git tag v0 <sha> && git push origin v0`) | B6 | int-3, docs-5 (Action ref resolves) | Human ops | ✗ |
| O11 | Bump to 0.2.1, run `scripts/release.sh` (or release workflow), publish `@frontguard/*`; verify `npm view @frontguard/cli@0.2.1` | B7 | npm staleness; supply-chain republish | Release eng | ✗ |
| O12 | Submit marketplace listings: GitHub, Vercel, Netlify, Slack; fix `frontguard.dev/api/install` 404 | B8 | docs-6 | Human ops | ✗ |
| O13 | SEC-6 / OPS-2: set `ENVIRONMENT=production` + real `DB`/bindings; replace placeholder wrangler IDs at deploy | Fresh OPS | SEC-6, OPS-2 (CLOSED) | Human ops | ✗ |
| O14 | OPS-3: wire dead-letter consumer / alerting for `background_failures` table | Fresh OPS | OPS-3 (CLOSED) | Human ops | ✗ |
| O15 | Enable Dependabot in repo settings (Security → Code security) so `.github/dependabot.yml` activates | A7/C11 | supply-6 | Human ops | ✗ |

**Acceptance probes (REVIEW_DOC verification appendix — run post-OPS):**
`curl -sf https://api.frontguard.dev/health` → 200 · `host api/app/github-app/telemetry.frontguard.dev` resolves ·
`npx -y @frontguard/mcp@0.2.1 | wc -l` > 0 · `npm view frontguard` (shim) or canonical `-p @frontguard/cli` ·
`npm audit --omit=dev` zero critical/high · Docker Hub `frontguard/render` 200.

---

## A10 reconciliation (process hygiene — handled by FINAL tasks)

Per REVIEW_DOC A10, the following must be reconciled after Wave A+B land:

1. **`docs/fix-progress.md`** — all 49 original findings still `OPEN` (ledger drift). Reconcile each row to its final CLOSED/CODE_CLOSED/OPEN status. → `a10-doc-reconcile` (`task_f7abe1998a35`).
2. **`SECURITY.md`** — Supported Versions lists only `0.1.x`; `VERSION` is `0.2.0` (→ `0.2.1`). Add the shipping release line. → `a10-doc-reconcile`.
3. **`docs/launch-readiness.md`** — still shows 2026-06-17 NO-GO banner; update to post-remediation verdict. → `a10-doc-reconcile` + `T_FINAL` sign-off.
4. **VERSION / workspace package versions / CHANGELOG release-prep procedure** — stage `0.2.1`, update `CHANGELOG.md`/changeset, document the `scripts/release.sh` + tag + publish handoff. **Prep only — no publish/tag (= OPS O10/O11).** → `a10-release-prep` (`task_bcd083d3cac2`).
5. **Final readiness** — re-run engineering gates, walk the REVIEW_DOC acceptance checklist, confirm OPS queue complete + human-owned, flip launch-readiness to honest verdict (OSS CLI shippable; cloud/SaaS gated on OPS). → `T_FINAL` (`task_98c32be0124f`), **last**.

---

## Maintenance

When a cluster PR merges: set its `MERGED ✓`, fill `PR#`/`WT`/`WORKER`, flip the CLOSE-INDEX
finding(s) to CLOSED (or CODE_CLOSED if OPS remains), and set `ACCEPT ✓` once the REVIEW_DOC
acceptance check passes. Keep this ledger in sync with `docs/production-pending.md` (canonical)
and, at FINAL, `docs/fix-progress.md`.

### Run changelog

| Date | Event |
|------|-------|
| 2026-06-20 | Ingest: transcribed REVIEW_DOC → CLOSE-INDEX + 15 task rows; created Orca task DAG; `PHASE=FIXING`. BASE `ravidsrk/production-close` @ `fb8b599`. |
| 2026-06-20 | Merged PR #94 (C4 `docker-doc-fix`, WT `c4-docker-doc-fix`, worker grok) into BASE via merge commit `2153095`. Codex PASS (task_7deeb65802cf); smoke-root/subpath green; Bugbot non-blocking. CLOSE-INDEX B5 docs-3 → CODE_CLOSED via PR#94; install-4/docker-1/docker-3 unchanged (OPS O9 docker publish human-owned). |
| 2026-06-20 | Merged PR #97 (C1 `cli-config-loader`, WT `c1-cli-config-loader`, worker grok) into BASE via merge commit `35c855c`. Codex PASS (task_cd5e5e62030a); smoke-root/subpath green; Bugbot non-blocking. CLOSE-INDEX A1 install-1/sb-2 → CLOSED via PR#97. |
| 2026-06-20 | Merged PR #95 (C3 `b1-code-mitigations`, WT `c3-b1-code-mitigations`, worker grok) into BASE via merge commit `d3d15b5`. Codex PASS (task_033abbd0af4b); smoke-root/subpath green; Bugbot Low-Risk/non-blocking; GH formal approval blocked by same-account own-PR rule. CLOSE-INDEX B1: claim-4/dist-3/docs-2/install-9 → CODE_CLOSED via PR#95 (OPS O1 DNS + O2 deploy + waitlist standup remain human-owned); install-6/claim-6 link fixes → CLOSED. Removed false `api.frontguard.dev` hosted defaults (mcp/netlify/slack/cli), Pro CTA → waitlist mailto, telemetry opt-in, README comparison links fixed; added publish-surface guard tests. |
| 2026-06-20 | Merged PR #96 (C10 `storybook-render`, WT `c10-storybook-render`, worker grok) into BASE via merge commit `e73d65e` (head `a10a73d`). Codex PASS (task_e7ec6ffb2267); 69/69 focused Storybook tests + build green; smoke-root/subpath green; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule. CLOSE-INDEX A4 sb-1/sb-3 → CLOSED via PR#96. |
| 2026-06-20 | Merged PR #98 (C2 `docs-snippet-sweep`, WT `docs-snippet-sweep`, worker grok) into BASE via merge commit `8d96da5` (head `a653bca`). Codex PASS (task_2e3f80a26927); focused docs/template tests 21/21 + smoke-root/subpath green; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule. Acceptance grep (`apps/web/src/lib/docs-content.ts`, root + cli `README.md`) → zero bare `npx frontguard`; remaining repo-wide hits are frozen audit/coordination text (`docs/adversarial-*.md`, `docs/fix-plan.md`, `docs/launch-readiness.md` finding quotes, `DECISIONS.md`) + the enforcement test — historical audit docs intentionally unchanged. CLOSE-INDEX A2 docs-1/docs-10 → CLOSED via PR#98. (Residual outside C2 scope flagged to coordinator: `packages/cloud-api/cloud-landing/index.html` bare snippet — cloud-product page, not docs sweep.) |
| 2026-06-20 | Merged PR #100 (INT7 `int7-slack-ssrf`, WT `int7-slack-ssrf`, worker grok) into BASE via merge commit `3da5ccf` (head `93d3bc7`). Codex PASS (task_dd42f4692cd8); Slack typecheck + tests 8 files/76 tests; cloud-api render-target/sec-2 tests 2 files/13 tests; smoke-root/subpath green; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule; no secrets/OPS. CLOSE-INDEX (A-misc) Slack SSRF int-7 → CLOSED via PR#100. |
| 2026-06-20 | Merged PR #99 (C8 `action-doc-residual`, WT `action-doc-residual`, worker grok) into BASE via merge commit `17c221a` (head `8cfab37`). Codex PASS (task_a68a39a04cc2); smoke-root/subpath green; check-doc-links 37/8; docs.test.tsx 20; github-app publish-surface 88; netlify 43; vercel 60; Bugbot non-blocking; GH formal approval blocked by same-account own-PR rule; no secrets/OPS. CLOSE-INDEX B6 int-3/docs-5/docs-6 code-side → CODE_CLOSED via PR#99 (OPS O10 `v0` tag + O12 marketplace submissions remain human-owned). A5/C15 docs-hygiene no longer carries docs-5 residual; docs-4/docs-7/docs-8/docs-9 unchanged (still OPEN). |
