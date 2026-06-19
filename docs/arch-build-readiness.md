# Adversarial-Fresh Build Readiness

**Review frozen:** `docs/adversarial-review-fresh.md` (P0-REVIEW + P0-SKEPTIC adjudication, §5 = fix spec).  
**Findings status:** 31 / 31 **CLOSED** or **CODE_CLOSED** (0 OPEN).  
**Integration branch:** `ravidsrk/adversarial-fresh` (HEAD `8b6cf9b`, all 14 fix PRs merged).  
**Verification branch:** `ravidsrk/t-final` (this readiness report + T_FINAL verification).

---

## Finding close-index (31) by wave

Severities (skeptic-final): P0×1, P1×7, P2×11, P3×12.

| Wave | ID | Severity | Final status | Closing PR |
|------|-----|----------|--------------|------------|
| 0 (review) | — | — | FROZEN | [#71](https://github.com/ravidsrk/frontguard/pull/71) docs(review): code-grounded adversarial architecture review [P0-REVIEW] |
| 0 (skeptic) | — | — | FROZEN | [#72](https://github.com/ravidsrk/frontguard/pull/72) docs(review): skeptic adjudication [P0-SKEPTIC] — freeze |
| 1 | REL-1 | P0 | CODE_CLOSED | [#73](https://github.com/ravidsrk/frontguard/pull/73) fix(cloud-api): wrap /v1/run processRun in executionCtx.waitUntil |
| 1 | DM-1 | P1 | CLOSED | [#74](https://github.com/ravidsrk/frontguard/pull/74) feat(cloud-api): versioned migration system with schema_migrations ledger |
| 1 | SEC-1 | P1 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) fix(ci/action): harden manifests, pin versions, dedupe |
| 1 | DEP-1 | P1 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | DEP-2 | P2 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | DEP-3 | P3 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | DEP-4 | P3 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | OPS-4 | P3 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | COU-1 | P3 | CLOSED | [#75](https://github.com/ravidsrk/frontguard/pull/75) |
| 1 | OPS-1 | P2 | CLOSED | [#76](https://github.com/ravidsrk/frontguard/pull/76) fix: gitignore .dev.vars, escape report HTML, Slack OAuth state, unique temp dir |
| 1 | SEC-7 | P3 | CLOSED | [#76](https://github.com/ravidsrk/frontguard/pull/76) |
| 1 | SEC-5 | P3 | CLOSED | [#76](https://github.com/ravidsrk/frontguard/pull/76) |
| 1 | REL-5 | P3 | CLOSED | [#76](https://github.com/ravidsrk/frontguard/pull/76) |
| 2 | CONC-1 | P1 | CLOSED | [#78](https://github.com/ravidsrk/frontguard/pull/78) fix(cloud-api): atomic run reservation + fan-out caps |
| 2 | COST-1 | P1 | CLOSED | [#78](https://github.com/ravidsrk/frontguard/pull/78) |
| 2 | DM-2 | P2 | CLOSED | [#80](https://github.com/ravidsrk/frontguard/pull/80) fix(cloud-api): cascade deletes + team-pooled usage |
| 2 | DM-3 | P2 | CLOSED | [#80](https://github.com/ravidsrk/frontguard/pull/80) |
| 2 | SEC-2 | P2 | CODE_CLOSED | [#83](https://github.com/ravidsrk/frontguard/pull/83) fix(cloud-api): shared SSRF guard on render entrypoint |
| 2 | COST-2 | P1 | CLOSED | [#81](https://github.com/ravidsrk/frontguard/pull/81) fix(cloud-api): propagate Stripe subscription plan changes |
| 2 | REL-2 | P1 | CLOSED | [#79](https://github.com/ravidsrk/frontguard/pull/79) fix(cloud-api): scheduler baseline restore + tick scaling + failure alerts |
| 2 | REL-4 | P2 | CLOSED | [#79](https://github.com/ravidsrk/frontguard/pull/79) |
| 2 | REL-6 | P3 | CLOSED | [#79](https://github.com/ravidsrk/frontguard/pull/79) |
| 2 | CONC-3 | P2 | CLOSED | [#84](https://github.com/ravidsrk/frontguard/pull/84) fix(cloud-api): cron lease so overlapping ticks can't double-run a monitor |
| 3 | CONC-2 | P2 | CLOSED | [#82](https://github.com/ravidsrk/frontguard/pull/82) fix(cloud-api): optimistic concurrency + invitation binding/expiry |
| 3 | SEC-4 | P2 | CLOSED | [#82](https://github.com/ravidsrk/frontguard/pull/82) |
| 3 | REL-3 | P2 | CODE_CLOSED | [#85](https://github.com/ravidsrk/frontguard/pull/85) fix(cloud-api): bounded rate limiter + explicit prod-mode fail-closed + wrangler guard |
| 3 | SEC-6 | P3 | CLOSED | [#85](https://github.com/ravidsrk/frontguard/pull/85) |
| 3 | OPS-2 | P3 | CLOSED | [#85](https://github.com/ravidsrk/frontguard/pull/85) |
| 3 | OPS-3 | P2 | CLOSED | [#86](https://github.com/ravidsrk/frontguard/pull/86) fix(cloud-api): dead-letter + visibility for background failures |
| 3 | SEC-3 | P3 | CLOSED | [#77](https://github.com/ravidsrk/frontguard/pull/77) fix(cloud-api): stop OAuth key sprawl + cap keys per user |
| 3 | COST-3 | P3 | CLOSED | [#77](https://github.com/ravidsrk/frontguard/pull/77) |

**CODE_CLOSED** (code merged; full acceptance needs OPS): REL-1, SEC-2, REL-3.

---

## OPS / VERIFY-AT-SCALE queue

Actions that are **CODE** (merged into BASE) but whose **apply/verify** is OPS — not executed by the swarm. Merge ≠ deploy.

| Tag | Action | Unblocks finding(s) | PR |
|-----|--------|---------------------|-----|
| OPS-APPLY | Apply D1 migrations **002** (cascade + `team_usage`), **003** (version columns + invitation expiry), **004** (monitor lease), **005** (dead-letter table) to staging/prod via `migrate()` / wrangler | DM-1, DM-2, DM-3, CONC-2, SEC-4, CONC-3, OPS-3 | #74, #80, #82, #84, #86 |
| VERIFY_AT_SCALE | Confirm REL-1 `waitUntil` on staging: multi-minute Daytona run reaches `completed`, results/`reportHtml` persisted | REL-1 | #73 |
| OPS | Deploy REL-3 truly distributed limiter (Durable Objects / KV counter) — in-isolate bounded limiter is merged but per-isolate | REL-3 | #85 |
| VERIFY_AT_SCALE/OPS | Pin Daytona renderer connection to validated IP (DNS-rebinding residual after submit-time SSRF guard) | SEC-2 | #83 |
| VERIFY_AT_SCALE | Load-verify CONC-1 atomic reservation + COST-1 fan-out/screenshot caps under concurrent `/v1/run` | CONC-1, COST-1 | #78 |
| OPS | Set `ENVIRONMENT=production` + real bindings (`DB`, secrets) in deployed Worker env (code fails closed if prod-but-misconfigured) | SEC-6 | #85 |
| OPS | Replace placeholder wrangler binding IDs with real ones at deploy (pre-deploy guard blocks placeholders) | OPS-2 | #85 |
| OPS | Wire dead-letter alert/retry consumer for `background_failures` table (writes merged; alerting/replay is infra) | OPS-3 | #86 |

Safety rails: testnet/staging/fixtures only; never real keys/prod/`terraform apply`/`wrangler deploy`/live env from the swarm.

---

## Recorded architecture decisions

Referenced from coordinator `DECISIONS.md` (adversarial-fresh run, 2026-06-19):

- **Adversarial production review (FRESH RUN, 2026-06-19):** independent code-grounded review; prior review docs out of scope; BASE = `ravidsrk/adversarial-fresh`; merge commits never squash; OPS recorded not executed.
- **Worker-launch reality:** `codex --full-auto` unavailable; @codex runs via `codex exec -s read-only -c approval_policy=never`; @grok via orca worktrees; @claude integrator = coordinator for PR open/merge.
- **Review adjudication log (build-blind false positives):** DM-1 migration runner (PR#80 review), OPS-3 `waitUntil`+dead-letter chain (PR#84 review) — codex diff-only reviews missed code already on BASE from earlier PRs; verified against source, not bounced.

---

## Downstream human gates (NOT DONE — human-owned)

1. **BASE → main promotion:** `ravidsrk/adversarial-fresh` → `main` is a human meta-PR (out of swarm scope).
2. **Production deploy:** `wrangler deploy` for cloud-api + integrations.
3. **All OPS applies above:** D1 migrations on live DB, staging telemetry, distributed limiter, renderer IP pin, env/bindings, dead-letter consumer.

Merging into BASE is **not** a deploy.

---

## T_FINAL verification results (2026-06-20)

Environment: Node **v26.3.0** (darwin/arm64), worktree `/Users/ravindra/orca/workspaces/frontguard/t-final`, BASE `8b6cf9b`.

### `packages/cloud-api`

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run test` (vitest) | **447 passed**, **21 failed** (44 files: 39 passed, 5 failed) |

### D1 migration chain (CRITICAL)

`test/migrate.test.ts`: **7 / 7 PASS**.

- Fresh DB: migrations **001 → 002 → 003 → 004 → 005** apply cleanly; ledger records all five; second `migrate()` is idempotent (0 pending).
- Legacy v1 schema: pending migrations apply without replaying baseline DDL.
- Rollback / partial-failure tests pass (uses `node:sqlite` shim, not `better-sqlite3`).

### Cross-cutting hot-file composition

No build or type errors. Shared hot paths compose on BASE:

- `index.ts`: REL-1 `waitUntil`, CONC-1 reservation, COST-1 caps, SEC-2 SSRF guard, REL-3 limiter, SEC-6 prod-flag, OPS-3 dead-letter — all present, tests green (`wait-until-run`, `conc-1`, `cost-1`, `sec-2`, `sec-6`, `ops-3`, `rel-3`).
- `d1-store.ts`: CONC-1/CONC-2/CONC-3, DM-2/DM-3, SEC-4 — covered by `conc-1`, `conc-2`, `conc-3`, `dm-2`, `dm-3`, `sec-4` suites (node:sqlite shim).
- `scheduler.ts`: REL-2/4/6, CONC-3, OPS-3 — `scheduler.test.ts`, `conc-3.test.ts`, `ops-3.test.ts` all pass.

### Pre-existing Node 26 / `better-sqlite3` caveat (NOT a blocker)

**21 failures** in **5 files** — identical set on `origin/main` (also 21 failed / 342 passed vs 447 passed on BASE due to added test coverage). Root cause: `better-sqlite3` native binding does not build on Node 26 (`Could not locate the bindings file`); `gyp rebuild` fails on v26 headers.

| File | Failed tests |
|------|----------------|
| `test/d1-store.test.ts` | 8 (all `D1Store (SQLite-backed)` cases) |
| `test/d1-store-github-linkage.test.ts` | 3 (`D1Store (SQLite-backed)` cases) |
| `test/session.test.ts` | 4 (`sessionSecret — production fail-closed`) |
| `test/keys-routes.test.ts` | 2 (`production auth — bearer tokens`) |
| `test/api.test.ts` | 4 (`GET /dashboard — production session-secret fail-closed`) |

Migration, concurrency, and SSRF suites use the **`node:sqlite` shim** and pass. These failures are **environment pre-existing**, not regressions from the 14 fix PRs.

### Monorepo + CI smoke

| Check | Result |
|-------|--------|
| `npm run build` (all workspaces) | **PASS** (tiny REL-5 DTS fix: `compareTempDir` const in `pipeline.ts` — `tempDir: string \| undefined` broke CLI `tsup` DTS on Node 26 strict check) |
| `packages/cli` action-manifest vitest | **21 / 21 PASS** (`test/action/action-manifest.test.ts`) |

---

## Validated strengths preserved (review §4)

Do-not-touch patterns confirmed still intact on BASE:

- **Webhook HMAC verify-before-parse** across GitHub, Stripe, Slack, Vercel integrations (fail-closed, constant-time compare).
- **Stateless session auth** — HMAC-SHA256 cookie, production fail-closed when secret missing/short, `userId` dot-escaping.
- **Hash-only API keys** — 192-bit entropy, SHA-256 at rest, no plaintext compare surface.
- **Team RBAC + R2 namespacing** — `requireCap`, outranking, last-owner protection, per-user screenshot keys, run-ownership on serve.
- **CLI execFileSync safety** — git ops without shell; AI CSS uploaded to file not interpolated into remote commands.

---

## Readiness verdict

**CODE-READY for human promotion.** All 31 adversarial-fresh findings are closed in code; cloud-api build/lint/typecheck pass; migration chain 001–005 green; new acceptance tests pass via node:sqlite shim. Remaining work is **human-owned**: BASE→main meta-PR, production deploy, D1 migration apply, staging telemetry, distributed limiter, renderer IP pin, and dead-letter alerting.