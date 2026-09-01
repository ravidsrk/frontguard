# Phase 2 — Deep Research (synthesis)

45 research items across four track files. Every item carries an explicit plan effect; items with
no effect are recorded as such so nothing is silently dropped.

| Track | File | Items |
|---|---|---|
| A — internal archaeology | `RESEARCH-trackA.md` | 12 |
| B1 — platform & dependency lifecycle | `RESEARCH-trackB1.md` | 10 |
| B2 — table-stakes & production-readiness | `RESEARCH-trackB2.md` | 18 |
| B3 — regulatory & data protection | `RESEARCH-trackB3.md` | 5 |

Confidentiality firewall (R8): every external query was by category. No product name, domain,
owner name, hostname, or verbatim code left the machine. Per-track query logs are in each file.

---

## Track C — Synthesis

### 1. The single blocker on freezing a Definition of Complete

**Three dated done-bars coexist in the repository, and one of them still calls itself frozen.**

| Bar | Source | Dated | Says "done" means |
|---|---|---|---|
| 1 | `docs/product-completion-plan.md:690-716` | 2026-06-14 | Nine flows, incl. **live** GitHub App, cloud API, MCP, self-host |
| 2 | `docs/launch-audit-2026-08.md:6-8` | 2026-08-29 | **NO-GO**; CLI/CI only |
| 3 | `README.md:29` + `apps/web/src/routes/status.tsx:19` | 2026-09-01 | Local CLI is the supported path |

Bar 3 is newest and is the public contract; Bar 2 backs it. Bar 1 is 2.5 months stale, was never
retracted, and still describes itself as the frozen boundary — which is why the repo *feels*
1/3 finished. It is being measured against a platform scope nobody is building.

**Effect on the plan:** `DEFINITION.md` must explicitly supersede Bar 1 in writing. Without that,
every future session re-inherits a nine-flow platform target and re-derives the same false gap.
This is recorded as the first entry in the frozen definition's out-of-scope list.

### 2. Two "missing capabilities" are actually unused platform primitives

Phase 1 scored data and infra at 1/4 partly on "no backups, no rollback". Research reclassifies
both — they are configuration and runbook gaps, not engineering projects:

- **D1 Time Travel** provides point-in-time recovery (7 days free tier / 30 days paid) already,
  and `wrangler d1 export` plus the REST API can push durable snapshots to R2 for retention
  beyond 30 days. (`RESEARCH-trackB1.md` R-08, R-09)
- **`wrangler rollback`** restores any of the last 100 Worker versions, code-only.
  (`RESEARCH-trackB1.md` R-10)

**Effect:** the backup-restore and rollback-rehearsal proofs the launch gate needs become small
tasks (enable, document, rehearse once, capture evidence) rather than a build. This is the single
biggest reduction in projected effort from Phase 2.

### 3. The dependency backlog has a hard ordering constraint and one hidden priority

- **Node 20 is EOL.** `engines.node: ">=20"` and the CI matrix `[20, 22]` are both wrong; the
  correct matrix is 22 + 24 (24 is Active LTS; 22 goes EOL 2027-04-30). (B1 R-01, R-02)
- **`lint-staged` 17 requires Node ≥22.22.1**, so PR #200 cannot merge until engines drop 20.
  A real dependency edge between two otherwise unrelated PRs. (B1 R-05)
- **The vitest 4.1.9 → 4.1.11 bump is a security fix** (GHSA Critical + Moderate), not the routine
  patch its title suggests. It should be prioritised above the cosmetic bumps. (B1 R-04)
- `@readme/openapi-parser` 7/8 changes SSRF and file-`$ref` defaults and drops orphaned `$id` —
  needs reading, not rubber-stamping. (B1 R-06)
- `playwright` 1.62.1 is current; the exact pin is correct for a screenshot tool and should stay.
  Any bump requires re-baselining. (B1 R-07)
- Nothing merges while `main` is red, which is why P1 gates the entire dependency backlog. (A R-07)

### 4. The product's category choices are sound; one real launch-shaped hole

- **Git-orphan-branch baseline storage is a recognised OSS pattern**, not an oddity. Competitive
  tools using S3 or a hosted UI are a *competitive* gap, explicitly **not** launch-blocking.
  (B2 R-01, R-02, R-03, R-11)
- **Flaky-render mitigation — the number-one source of false positives in this category — is
  already implemented**: CSS animation freezing, `fonts.ready`, mask/ignore regions, and
  `antiFlakeRenders`. Research confirms these are the standard mitigations. (B2 R-06 … R-10)
- **The hole: `actions/checkout` defaults to `fetch-depth: 1`, which does not fetch the extra
  baseline ref.** A CI user following the documented setup can hit a broken comparison through no
  fault of their own. This is launch-blocking and cheap to fix. (B2 R-05)
- Long-lived PNG baselines will bloat git history over time — real, but slow-moving; a documented
  pruning story, not a launch blocker. (B2 R-04)

### 5. Supply chain: the release pipeline is strong but one bar behind

Phase 1 found a release pipeline a compromised PR cannot abuse. Research adds that **npm now
recommends OIDC trusted publishing and discourages long-lived `NPM_TOKEN` secrets**; the current
`--provenance` + `id-token: write` + `NPM_TOKEN` combination is the previous recommended bar.
(B2 R-17, R-18) Actionable, and it removes a standing credential.

### 6. Compliance is narrower than Phase 1 implied

Full detail in `RESEARCH-trackB3.md`. In short: telemetry is **opt-in, off by default**, honours
`DO_NOT_TRACK`, and sends no URLs, paths, screenshots, or keys — a stricter posture than GDPR
requires, so the lawful-basis question is closed favourably. What is missing is **published
disclosure**: `/privacy` 404s, the policy never names the opt-out switches or field list, and
`showFirstRunNotice` has no callers. That is a docs+deploy task, not a privacy remediation, and
Phase 3 must not inflate it into a consent-management feature.

Assumption **A-04 is confirmed, not merely assumed**: there is no live money path, so the
payments, VDA, money-transmitter, and PCI areas of Appendix D are N/A with checkable reasons.
Latent exposure in `cloud-api` (screenshots, emails, Slack tokens in D1, no erasure path, no
backups) is handled by a **deployment gate** in the definition rather than an open-ended project.

### 7. Research-derived gaps promoted to Phase 3

| New gap | Source | Why it matters |
|---|---|---|
| Bar 1 never superseded | A R-08, R-11, R-12 | Blocks freezing any definition |
| Node 20 EOL in engines + CI matrix | B1 R-01, R-02 | Shipping against an unsupported runtime |
| vitest bump is a security fix | B1 R-04 | Mis-prioritised as cosmetic |
| lint-staged 17 blocked on engines | B1 R-05 | Ordering constraint, would fail confusingly |
| openapi-parser 7/8 default changes | B1 R-06 | SSRF-relevant behaviour change |
| D1 backups exist but unused | B1 R-08, R-09 | Turns an S0-looking gap into a config task |
| Workers rollback exists but unused | B1 R-10 | Same |
| `fetch-depth: 1` breaks CI baselines | B2 R-05 | Launch-blocking for the documented CI path |
| PNG baseline history bloat | B2 R-04 | Slow-moving; defer with a documented story |
| npm trusted publishing (OIDC) | B2 R-17, R-18 | Removes a long-lived credential |
| Telemetry disclosure not published | B3 R-02, R-03 | Transparency obligation, cheap fix |
| cloud-api deploy gate (erasure + backup) | B3 R-05 | Prevents a latent legal risk becoming active |

**Phase 2 exit: met.** All 45 items carry a plan effect; every external claim is bound to a fetched
URL with a date and a paraphrased passage; confidentiality firewall logs present in all track files.

**Second look:** the first synthesis carried Phase 1's framing that telemetry was a privacy
problem and that backups/rollback were missing features. Re-reading against the fetched sources,
both were wrong in the product's favour — telemetry is stricter than required, and Cloudflare
already provides the recovery primitives. Corrected before any of it reached the gap register,
which would otherwise have created three phantom engineering tasks. The inverse also happened: the
vitest patch bump, which looked cosmetic, is a security fix and moved up.
