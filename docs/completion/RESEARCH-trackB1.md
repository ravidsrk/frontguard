# Track B1 — platform and dependency lifecycle

Fetched 2026-09-01. Category queries only. Cite only fetched URLs.

---

### R-01 — Node 20 is EOL
- **Track:** B
- **Query category / source:** Node.js official releases table + Release WG schedule
- **URL:** https://nodejs.org/en/about/previous-releases (fetched 2026-09-01)
- **URL:** https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (fetched 2026-09-01)
- **URL:** https://github.com/nodejs/Release (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** The nodejs.org table marks v20 Iron as Status EOL (last updated 2026-03-24). The Release WG README lists 20.x as End-of-Life on 2026-04-30. `schedule.json` has v20 `end: 2026-04-30`. Production apps should use Active LTS or Maintenance LTS only.
- **Plan effect:** new_gap: `engines.node: >=20` and every workflow still on Node 20 (CI lint/build/e2e/audit, release, example) advertise and run an EOL runtime. Drop 20 from the supported floor.

### R-02 — Node 22 Maintenance LTS, 24 is already Active LTS
- **Track:** B
- **Query category / source:** Node.js Release WG schedule
- **URL:** https://github.com/nodejs/Release (fetched 2026-09-01)
- **URL:** https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Live lines: 22.x Jod **Maintenance LTS** (maintenance 2025-10-21, EOL **2027-04-30**); 24.x Krypton **Active LTS** (LTS start 2025-10-28, maintenance 2026-10-20, EOL **2028-04-30**); 26.x Current. nodejs.org also lists v22 and v24 as LTS and v26 Current.
- **Plan effect:** new_gap: CI matrix `[20, 22]` is wrong. Correct matrix is **22 + 24**. Set `engines.node` to `>=22` (optionally `^22 || ^24`). Local Node 24 is the current Active LTS, not a preview.

### R-03 — actions/setup-node v4 → v7 breaking changes
- **Track:** B
- **Query category / source:** setup-node GitHub releases + current README
- **URL:** https://github.com/actions/setup-node/releases/tag/v5.0.0 (fetched 2026-09-01)
- **URL:** https://github.com/actions/setup-node/releases/tag/v6.0.0 (fetched 2026-09-01)
- **URL:** https://github.com/actions/setup-node/releases/tag/v7.0.0 (fetched 2026-09-01)
- **URL:** https://github.com/actions/setup-node (fetched 2026-09-01)
- **Relied-on passage (paraphrased):**
  - **v5:** Auto-cache when `package.json` has a valid `packageManager` (disable with `package-manager-cache: false`). Action runtime moved Node 20 → **Node 24**; self-hosted runners need **actions/runner ≥ v2.327.1**.
  - **v6:** Automatic caching **npm-only**; Yarn/pnpm must set `cache:` explicitly. `always-auth` input **removed**.
  - **v7:** Internals migrated to ESM; README says no input/output/behavior change except the dummy `NODE_AUTH_TOKEN` fallback is **gone**. If `registry-url` is set without `NODE_AUTH_TOKEN`, Yarn Classic / old npm may fail; npm Trusted Publishing (OIDC) is unaffected. New outputs: `cache-primary-key`, `cache-matched-key`.
- **What a repo must change to adopt v7:** (1) `uses: actions/setup-node@v7`. (2) GitHub-hosted `ubuntu-latest` is fine; pin self-hosted runner ≥ 2.327.1. (3) Keep explicit `cache: npm` (already done here — v5/v6 auto-cache is a no-op). (4) Delete any `always-auth`. (5) Jobs with `registry-url` must supply `NODE_AUTH_TOKEN` **or** use OIDC trusted publishing — do not rely on the dummy token. (6) Yarn/pnpm: set `cache:` yourself.
- **Plan effect:** none for the action major on this branch (workflows already `@v7` with `cache: npm`). new_gap on the **Node version those jobs install**: they still request 20 after the action itself requires a Node-24 runner. Release jobs that set `registry-url` without `NODE_AUTH_TOKEN` should confirm they use OIDC/`NPM_TOKEN` only.

### R-04 — Vitest 4.1.9 → 4.1.11 is a security patch, not a no-op
- **Track:** B
- **Query category / source:** Vitest GitHub releases + security advisories
- **URL:** https://github.com/vitest-dev/vitest/releases/tag/v4.1.10 (fetched 2026-09-01)
- **URL:** https://github.com/vitest-dev/vitest/releases/tag/v4.1.11 (fetched 2026-09-01)
- **URL:** https://github.com/vitest-dev/vitest/security/advisories/GHSA-p63j-vcc4-9vmv (fetched 2026-09-01)
- **URL:** https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9 (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** 4.1.10 backports a browser-mode fs-access check (GHSA-p63j-vcc4-9vmv, **Critical**, CVE-2026-73653; patched **4.1.10**; affected `<=4.1.9`). 4.1.11 backports mocker redirect allowlisting (GHSA-82fw-gwwq-j7x9, **Moderate**; affected `>=2.1.0 <4.1.11`; patched **4.1.11**) plus a revived global concurrency limit and browser iframe/GC fixes. 4.1.11 is the latest 4.x tag (5.x is still RC).
- **Plan effect:** new_gap: take **4.1.11** (and matching `@vitest/coverage-v8`) as a **security** bump, not a “safe cosmetic patch.” Browser-mode GHSA matters if the API is exposed; mocker GHSA is in `@vitest/mocker` used by vitest itself. Concurrency-limit revive can change suite timing — re-run tests after the bump.

### R-05 — lint-staged 16 → 17 breaking changes
- **Track:** B
- **Query category / source:** lint-staged MIGRATION.md + CHANGELOG
- **URL:** https://raw.githubusercontent.com/lint-staged/lint-staged/master/MIGRATION.md (fetched 2026-09-01)
- **URL:** https://raw.githubusercontent.com/lint-staged/lint-staged/master/CHANGELOG.md (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** v17 drops Node 20; oldest supported is **22.22.1**. `yaml` is optional — YAML configs need `npm i -D yaml`; extensionless `.lintstagedrc` is treated as YAML. Git must be **≥ 2.32.0**. 17.0.x also changed how task edits are staged (`git update-index` then reverted to `git add` in 17.0.6 for large-repo perf) and how implicit `git commit -a` / pathspec commits behave.
- **Plan effect:** new_gap: **do not land lint-staged 17 until `engines`/CI leave Node 20** (R-01). After that it is a small consumer bump: this repo uses a `package.json` `lint-staged` object (not YAML) and husky `npx lint-staged`, so no `yaml` install. Confirm GitHub-hosted runner Git ≥ 2.32 (true on current images).

### R-06 — `@readme/openapi-parser` 6.3.1 → 8.0.1 (two majors)
- **Track:** B
- **Query category / source:** parser CHANGELOG in readmeio/oas + npm package.json
- **URL:** https://raw.githubusercontent.com/readmeio/oas/main/packages/parser/CHANGELOG.md (fetched 2026-09-01)
- **URL:** https://unpkg.com/@readme/openapi-parser@8.0.1/package.json (fetched 2026-09-01)
- **URL:** https://unpkg.com/@readme/openapi-parser@8.0.0/README.md (fetched 2026-09-01)
- **Could not fetch:** GitHub release tags `@readme/openapi-parser@7.0.0` / `@8.0.0` (HTTP 404). Relied on CHANGELOG.md instead.
- **Relied-on passage (paraphrased):** **7.0.0** blocks OpenAPI URL retrievals that would hit private IPs. **7.0.1** disables filesystem `$ref` resolution (incl. `file://`) **by default**; `resolve.file: true` opts back in. **8.0.0** drops orphaned `$id` keywords when bundling/dereferencing/validating (fixes spurious missing-`$ref` errors; can change inlined-schema identity). 8.0.1 is a webhook `servers` URL rewrite patch. Package is ESM (`type: module`) with named exports `validate` / `dereference` / `bundle` / `parse`.
- **Plan effect:** new_gap: treat as a **behavior** bump, not mechanical. If any caller resolves `file://` or local `$ref`s, pass `resolve.file: true`. If specs are fetched from RFC1918 hosts, 7.x will refuse (intended). If tests assert `$id` on bundled output, they will fail. 8.0.1 after 8.0.0 is a safe patch.

### R-07 — Playwright 1.62.1 is current; exact pin still justified
- **Track:** B
- **Query category / source:** Playwright docs + npm
- **URL:** https://playwright.dev/docs/release-notes (fetched 2026-09-01)
- **URL:** https://www.npmjs.com/package/playwright (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Official notes head at **Version 1.62**. npm **Latest: 1.62.1**. 1.62 ships Chromium 151 / Firefox 153 / WebKit 26.5; **Debian 11 is no longer supported**. New APIs (WebP screenshots, AbortSignal, component-testing stories) are opt-in. No security advisory in the fetched notes.
- **Plan effect:** none for “must upgrade now” — the exact pin **is** today’s current release. confirms: exact pin remains the right policy for a screenshot tool (browser builds change rendering). Cadence: stay exact-pinned; bump **only** with a re-baseline of all golden screenshots when (a) a Playwright/Chromium advisory lands, or (b) a browser-compat need appears. Do not float `^`. After a bump, `npx playwright install --with-deps` in CI must match.

### R-08 — D1 Time Travel is always-on PITR (not a missing product feature)
- **Track:** B
- **Query category / source:** Cloudflare D1 Time Travel + limits
- **URL:** https://developers.cloudflare.com/d1/reference/time-travel/ (fetched 2026-09-01)
- **URL:** https://developers.cloudflare.com/d1/platform/limits/ (fetched 2026-09-01)
- **URL:** https://developers.cloudflare.com/d1/reference/backups/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** Time Travel is D1’s backup/PITR: restore to any minute in the last **30 days (Workers Paid) / 7 days (Workers Free)**. Always on; no extra cost; Wrangler ≥ 3.4.0; `wrangler d1 time-travel info|restore`. Restore is **destructive in-place**. Max 10 restores / 10 minutes / database. Production DBs (`version: production`) use Time Travel; alpha snapshot backups (`wrangler d1 backup *`) were planned for removal 2025-07-01.
- **Plan effect:** confirms Phase 1 “no backups”: the **platform already provides 7–30 day PITR**. This is a **config/runbook gap**, not a missing Cloudflare primitive. new_gap: document `d1 info` → confirm `version: production`, and a restore runbook. Time Travel is **not** long-term backup (bookmarks >30 days are invalid).

### R-09 — `wrangler d1 export` and R2 export exist for durable backups
- **Track:** B
- **Query category / source:** D1 import/export + wrangler d1 + Workflows example
- **URL:** https://developers.cloudflare.com/d1/best-practices/import-export-data/ (fetched 2026-09-01)
- **URL:** https://developers.cloudflare.com/workers/wrangler/commands/d1/ (fetched 2026-09-01)
- **URL:** https://developers.cloudflare.com/workflows/examples/backup-d1/ (fetched 2026-09-01)
- **Could not fetch:** https://developers.cloudflare.com/d1/best-practices/import-export/ (HTTP 404). Correct path is `import-export-data`.
- **Relied-on passage (paraphrased):** `npx wrangler d1 export <db> --remote --output=./database.sql` dumps schema+data; `--table`, `--no-data`, `--no-schema` variants exist. Export **blocks other DB requests**. For retention **>30 days**, Cloudflare’s example posts to `/d1/database/{id}/export` and stores the SQL dump in **R2** on a cron Workflow.
- **Plan effect:** new_gap: “no backups” beyond Time Travel is **not using** `wrangler d1 export` / REST export→R2. Add a scheduled export to R2 (or any object store) if hosted D1 ever holds customer data. Until then, Time Travel is the only safety net and it expires.

### R-10 — Workers rollback is a platform primitive this repo is not using
- **Track:** B
- **Query category / source:** Cloudflare Workers versions/deployments/rollbacks
- **URL:** https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/ (fetched 2026-09-01)
- **URL:** https://developers.cloudflare.com/workers/versions-and-deployments/ (fetched 2026-09-01)
- **Relied-on passage (paraphrased):** `wrangler rollback` / dashboard Deployments → Rollback immediately creates a new deployment of a prior **version** (last **100** versions). Rollback does **not** revert KV/R2/D1/DO **data**. Blocked if Durable Object class lifecycle changed, or if the old version binds a KV/R2/queue that no longer exists. Default `wrangler deploy` couples version+deployment in one step.
- **Plan effect:** confirms Phase 1 “no rollback”: **Workers code rollback exists and is unused** — a **config/ops gap**, not a missing platform feature. new_gap: add `wrangler rollback` (or dashboard) to the incident runbook; do **not** treat it as a D1 undo (use Time Travel / export for data). Gradual deployments are available but optional.

---

## Verdicts the plan must use

| Question | Answer |
|---|---|
| Node 20? | **EOL** (scheduled 2026-04-30; website Status EOL). |
| Node 22 EOL? | **2027-04-30** (Maintenance LTS now). |
| Node 24 LTS? | **Yes — Active LTS** since 2025-10-28. |
| CI / engines? | Matrix should be **22+24**; `engines` **`>=22`**. |
| setup-node v7? | Adopt `@v7`; watch runner Node-24, npm-only auto-cache, removed dummy `NODE_AUTH_TOKEN`. This branch already on v7. |
| Vitest 4.1.11? | **Take it** — two GHSAs (Critical in 4.1.10, Moderate in 4.1.11). |
| D1 backup? | Time Travel **always on** (7/30d) + `wrangler d1 export` + REST→R2. Unused. |
| Workers rollback? | `wrangler rollback` / dashboard, last 100 versions. Unused. Code-only, not data. |
