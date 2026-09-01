# A06–A07 — Data & Infrastructure (static)

Baseline: `5f0e141` on `ravidsrk/p0-completion-audit`. Scores capped at 1: no runtime observation.

## Angle 6 — Data

**Score: 1/4 · RAG: R**
**Score justification:** Schemas, a versioned D1 migrator, local SQLite, R2 blob keys, and `docs/retention.md` exist as source. Nothing was executed. Backups, restore, user export, and user-level erasure are absent. Deploy-time migration is not wired to the versioned runner.
**Dynamic proof needed to justify a higher score:**
```
# Collector liveness (read-only HTTP; no tree writes)
curl -sI --max-time 10 https://telemetry.frontguard.dev/v1/events
# Hosted API presence (pre-release cloud)
curl -sS --max-time 10 https://api.frontguard.dev/health
# Confirm no D1 backup artifacts (needs Cloudflare creds; expect empty/error)
npx wrangler d1 backup list frontguard --json
# Confirm R2 has no lifecycle/versioning (needs creds)
npx wrangler r2 bucket info frontguard-screenshots
# Migration unit tests (parent-owned; writes nothing if vitest is isolated)
# npm test --workspace=packages/cloud-api -- migrate.test.ts
```

### Findings

- **F-6-01** — Two SQLite-family datastores, neither production-backed from this checkout. (1) CLI optional `better-sqlite3` file `.frontguard/fix-patterns.db` (`packages/cli/src/storage/fix-patterns.ts:4-12,36-126`, dep `packages/cli/package.json:82`). Schema `fix_patterns`; `migrate()` is two unversioned `ALTER TABLE ADD COLUMN` swallows. (2) Cloud API **Cloudflare D1** (`packages/cloud-api/wrangler.toml:17-23` binding `DB`, database `frontguard`) plus **R2** `frontguard-screenshots` (`wrangler.toml:25-29`). `better-sqlite3` in cloud-api is a **devDependency** test shim only (`packages/cloud-api/package.json:45`, `packages/cloud-api/test/helpers/sqlite-d1.ts:1-11`). Worker runtime uses D1 or in-memory (`packages/cloud-api/src/db/factory.ts:71-73`). Impact: “datastore exists” is true in code; hosted D1 id is still `REPLACE_WITH_D1_DATABASE_ID`.

- **F-6-02** — Canonical D1 schema is documented in `packages/cloud-api/src/db/schema.sql:1-229` (users, api_keys, runs, screenshots metadata, usage, teams, invitations, monitors, masks, attachments, …). A versioned forward-only registry exists: `001`–`005` in `packages/cloud-api/src/db/migrations/index.ts:27-32`. `Migration` has `sql` only — **no down/reverse** (`packages/cloud-api/src/db/migrations/types.ts:8-15`). Atomic apply + `schema_migrations` ledger: `packages/cloud-api/src/db/migrate.ts`.

- **F-6-03** — Versioned `migrate()` is **not invoked from worker source**. Zero imports of `migrate` under `packages/cloud-api/src/index.ts`. Callers are tests only. Operator scripts apply **baseline `schema.sql` only**: `packages/cloud-api/package.json:31-32` (`db:migrate` / `db:migrate:local`), `packages/cloud-api/docker-entrypoint.sh:17-32` (one-shot marker `/data/.migrated`). Impact: live/self-host D1 can miss `002`–`005` (`github_login`, `version`, `expires_at`, `leased_until`, `team_usage`, `background_failures`, ON DELETE CASCADE). `D1Store.createUser` already writes `github_login` (`packages/cloud-api/src/db/d1-store.ts:126-129`) which is not in baseline `schema.sql:5-11` (added in `003`).

- **F-6-04** — **No backup mechanism. No restore procedure.** Grep of `.github/`, `scripts/`, `packages/cloud-api/` finds no `wrangler d1 backup`, no `[backups]`, no R2 object versioning, no scheduled export. `docs/retention.md:50-56` states recovery is not implemented and tells operators not to use pre-release cloud for regulated data. `docs/adversarial-v020-postship.md` gap-7 already named this. **Definitive: backups do not exist.**

- **F-6-05** — Retention is partial and documented as such. Plan windows 7 / 30 / 90 days (`packages/cloud-api/src/billing/plans.ts:42,56,70`) apply **only** to `monitor_runs` prune (`packages/cloud-api/src/scheduler.ts:297-305`, `d1-store.ts:691-694`). `docs/retention.md:43-45`: general runs, screenshots, team activity have **no** time-based enforcement. R2 `wrangler.toml` has no lifecycle rules.

- **F-6-06** — PII / data-flow inventory (static):

  | Flow | What | Where |
  |---|---|---|
  | CLI telemetry (opt-in) | `command`, `version`, `routes`, `regressions`, `aiProvider`, `antiFlake`, `ci`, `durationMs`, `errorType`, `ts` — no URLs/paths/screenshots/keys (`packages/cli/src/utils/telemetry.ts:7-10,25-44,133-145`). Default POST `https://telemetry.frontguard.dev/v1/events`. Disabled unless `FRONTGUARD_TELEMETRY=1` / `telemetry: true`; `--no-telemetry`, `FRONTGUARD_TELEMETRY=0`, `DO_NOT_TRACK=1` suppress. | Collector; `docs/telemetry.md:3` notes source IP is visible to the network. Collector liveness **unverified**. Docker image sets `FRONTGUARD_TELEMETRY=0` (`packages/cli/docker/Dockerfile:104`). |
  | Local screenshots | PNGs on git orphan branch `frontguard-baselines` (`packages/cli/src/storage/git-orphan.ts:1-6`); currents/diffs/HTML in `frontguard-report/`; CLI state + fix-pattern DB under `.frontguard/` (`docs/retention.md:11-16`). May capture **page content of the app under test** (user data, emails, tokens rendered in UI). | Operator disk / git remote if pushed. |
  | Optional CLI upload | Local `file://`, GitHub Actions artifacts, or S3/R2 (`packages/cli/src/storage/image-upload.ts:67-245`). | GitHub artifact retention or caller bucket. |
  | AI vision/fix/judge (opt-in) | Downscaled PNG **base64** + **route path / viewport / browser** to OpenAI or Anthropic (`packages/cli/src/diff/ai-vision.ts:165-167,280-281,392`; `ai-fix.ts:178-181`; `model-judge.ts:303-319`). Keys `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY`. | Third-party model APIs. Privacy page discloses this (`apps/web/src/routes/privacy.tsx:22-23`). |
  | Cloud users | `github_id`, `github_login`, `email`, `plan` (`schema.sql:5-11`; OAuth `read:user user:email` in `packages/cloud-api/src/auth/github.ts:31,66-94`). API keys stored as SHA-256 only (`packages/cloud-api/src/auth/keys.ts:4-6,33-36`). Session cookie `fg_session` = `userId.expiry.HMAC` (`packages/cloud-api/src/auth/session.ts:5-7,23-26`). | D1 `users` / `api_keys`; browser cookie. |
  | Cloud runs / screenshots | Run `config`/`results` JSON (may include GitHub owner/repo/PR/SHA — `d1-store.ts:90-93`); screenshot **bytes** in R2 key `{userId}/{runId}/…` (`packages/cloud-api/src/storage/screenshots.ts:38-41`); attachments: traces, DOM snapshots, console logs, video (`schema.sql:205-217`). Monitors store target `url` + `alerts` JSON (email/slack) (`schema.sql:131-141`). Invitations: email, github_login, **invite token** (`schema.sql:84-92`). Teams: Stripe customer/subscription ids (`schema.sql:65-71`). Activity `target`/`metadata` unredacted (`docs/retention.md:36-39`). | D1 + R2. |
  | Integration tokens | Slack bot `accessToken` persisted plaintext JSON in KV `SLACK_TEAMS` (`integrations/slack-app/src/storage.ts:28-54`). GitHub App installation tokens minted ephemerally, not stored (`integrations/github-app/src/github-api.ts:65-86`); App **private key** is a Worker secret. Netlify/Vercel consume `FRONTGUARD_API_KEY` / `GITHUB_TOKEN` from host env. | KV / Worker secrets / CI env. |
  | Cloud OTEL (optional) | `runId`, status, duration, counts, `ai.provider` (`packages/cloud-api/src/otel/index.ts:29-72`). | Operator OTLP collector. |

- **F-6-07** — **No user data export. No user-level deletion.** No `GET /v1/users/me/export`, no `DELETE /v1/users`. Implemented deletes: `DELETE /v1/runs/:id` (best-effort R2; `packages/cloud-api/src/index.ts:685-703`), `DELETE /v1/teams/:id` (purge blobs then DB; no 30-day window; `packages/cloud-api/src/routes/teams.ts:178-189`, `purge-team-blobs.ts:18-41`), keys, monitors, members. Team delete does **not** delete the `users` row (`d1-store.ts:808-815`). Failed R2 purge does not block DB delete (`docs/retention.md:48-49`). Local delete is manual filesystem/git (`docs/retention.md:23-29`) — no `frontguard reset`. Public `/privacy` (`apps/web/src/routes/privacy.tsx:26-29`) says there is no GA hosted cloud and points privacy questions at GitHub issues.

### Notes

- CLI local-first: cloud is not required for screenshots (`docs/retention.md:20-21`).
- `schema.ts` embeds `schema.sql` as a string for Workers (cannot import `.sql`).
- In-memory store is the fallback when D1 is unbound — data dies with the isolate (`factory.ts:7,71-73`).

## Angle 7 — Infrastructure & deployment

**Score: 1/4 · RAG: R**
**Score justification:** A production web deploy workflow, a gated npm/Docker release workflow, wrangler configs, and Dockerfiles exist on disk. Staging is not a real environment. Cloud-api/integrations cannot deploy from committed placeholders. No Worker/D1 rollback runbook. Nothing was deployed or published in this audit.
**Dynamic proof needed to justify a higher score:**
```
curl -sS --max-time 10 https://frontguard.dev/.deploy-version
curl -sS --max-time 10 https://frontguard.dev/status
curl -sS --max-time 10 https://api.frontguard.dev/health
# Expect 404 / NXDOMAIN / placeholder until OPS deploy
curl -sS --max-time 10 https://github-app.frontguard.dev/health || true
docker manifest inspect frontguard/render:0.2.3 || true
gh api repos/ravidsrk/frontguard/actions/workflows/ci.yml/runs?branch=main&event=push --jq '.workflow_runs[0].conclusion'
# Confirm GitHub environment "production" exists (web only)
gh api repos/ravidsrk/frontguard/environments
```

### Findings

- **F-7-01** — Environments: **local exists in source; staging does not; production is web-only in CI.** Local: `npm run dev:web` / `dev:api`, `packages/cloud-api/docker-compose.yml`, CLI `packages/cli/docker/docker-compose.yml`, InMemoryStore. Staging: named in human OPS queues (`docs/production-close-progress.md:146-148`, `docs/arch-ops-actions.md:9-15`) but **no** `wrangler.toml` `[env.staging]`, **no** GitHub Environment named staging, **no** staging URL. Production: GitHub Environment `production` → `https://frontguard.dev` (`.github/workflows/deploy-web.yml:20-22`). Cloud-api hardcodes `ENVIRONMENT = "production"` (`packages/cloud-api/wrangler.toml:35-39`) with placeholder D1 id. Parity: not applicable — there is no second environment to compare.

- **F-7-02** — IaC: **no Terraform / Pulumi / CDK** (zero `*.tf`). Committed deploy configs: `apps/web/wrangler.jsonc` (Worker `frontguard-web`, TanStack server-entry, `@cloudflare/vite-plugin` in `apps/web/vite.config.ts:2,13`); `packages/cloud-api/wrangler.toml`; `integrations/github-app/wrangler.toml`; `integrations/slack-app/wrangler.toml`; `integrations/vercel/vercel.json` (edge function, not a Vercel project for `apps/web`). **Actual public site path:** push to `main` touching `apps/web/**` → `.github/workflows/deploy-web.yml` → `npm ci` → `npm run build --workspace=apps/web` → `cloudflare/wrangler-action@v3` `command: deploy` `workingDirectory: apps/web` → probe `https://frontguard.dev/.deploy-version` equals `GITHUB_SHA`. Cloud-api / GitHub App / Slack are **not** in that workflow; `docs/ops-actions.md:94-104` still queues a **manual** `npm run deploy --workspace=packages/cloud-api`.

- **F-7-03** — GitHub Actions secrets referenced in `.github/workflows/*.yml` (complete inventory):

  | Secret | Workflow | Use |
  |---|---|---|
  | `CLOUDFLARE_API_TOKEN` | `deploy-web.yml:53` | Wrangler deploy of `apps/web` |
  | `CLOUDFLARE_ACCOUNT_ID` | `deploy-web.yml:54` | Wrangler account |
  | `NPM_TOKEN` | `release.yml:274` | `npm publish` via `scripts/release.sh --only-npm` |
  | `DOCKERHUB_USERNAME` | `release.yml:330` | Docker Hub login |
  | `DOCKERHUB_TOKEN` | `release.yml:331` | Docker Hub login |

  No other `secrets.*` in `.github/workflows`. `ci.yml`, `audit-weekly.yml`, `action-smoke.yml`, `frontguard-example.yml` use none. `release.yml:203` uses `github.token` (not a repo secret). Runtime Worker secrets are **not** GH Actions secrets; they are documented `wrangler secret put` names (cloud-api `wrangler.toml:41-58`; GitHub App `wrangler.toml:32-40`; Slack `wrangler.toml` comments + README). Self-host compose injects the same via env (`packages/cloud-api/docker-compose.yml:35-73`). Cloud-api compose default `DASHBOARD_SESSION_SECRET=change-me-in-production` (`docker-compose.yml:37`).

- **F-7-04** — Deploy path is **partially** documented (`docs/ops-actions.md`, `apps/web` `deploy` script) and **not stranger-operable**. `packages/cloud-api/src/ops/wrangler-guard.ts` **blocks** deploy while `REPLACE_WITH` remains; committed offenders: `packages/cloud-api/wrangler.toml:23`, `integrations/slack-app/wrangler.toml:19`. **Rollback: none written** for Workers, D1, or R2. `deploy-web.yml:11-13` concurrency `cancel-in-progress: false` only prevents overlapping deploys. No `wrangler rollback`, no previous-version pin, no D1 down-migration. `docs/launch-audit-2026-08.md:412` still lists “rollback/backup procedure” as future work. **Definitive: no infra rollback procedure exists.** (GitHub Release immutability in `release.yml` is an npm-tag lock, not a Worker rollback.)

- **F-7-05** — Build reproducibility is lockfile-based, not bit-identical. `package-lock.json` lockfileVersion 3 required by `scripts/release.sh:147-148`. `engines.node >=20` (`package.json:35-37`); CI Node 20/22. Renderer image pins `mcr.microsoft.com/playwright:v1.62.1-jammy` `--platform=linux/amd64` (`packages/cli/docker/Dockerfile:52`) and installs CLI from `npm pack` tarball, **not** `@latest`. Apt font packages are **not** snapshot-pinned (`Dockerfile:12-26`). No `SOURCE_DATE_EPOCH`. Containers: renderer (`packages/cli/docker/Dockerfile`) and self-host API (`packages/cloud-api/Dockerfile` + compose). Root `overrides` pin 30 packages (`package.json:38-68`). Dead script: `"release": "npm run build && changeset publish"` (`package.json:31`) but **`@changesets/cli` is not in the lockfile**; `.changeset/config.json` is leftover. Real path is tag + `scripts/release.sh`.

- **F-7-06** — npm publish path and gates (not changesets):
  1. Source `VERSION` (`VERSION` = `0.2.3`) must match every listed package.json + lockfile entry.
  2. Operator prepares dated `CHANGELOG.md` `## [0.2.3] - YYYY-MM-DD` listing each package (`scripts/release.sh:189-241`).
  3. Push **immutable tag** `v{VERSION}` whose commit is an ancestor of default branch (`release.yml:52-62`).
  4. **`workflow_dispatch` is validation-only — publication jobs disabled** (`release.yml:64-66,145-148`).
  5. **Gate: successful `ci.yml` push run on that SHA on the default branch** (`release.yml:73-103`). **A red CI cannot publish.** Current Phase-0 fact: `main` CI is red at baseline → this tag path is blocked until CI is green.
  6. `scripts/release.sh --dry-run --require-prepared` (shellcheck + version/lock/changelog/pack).
  7. Create GitHub Release; **must report `immutable: true`** (`release.yml:226-231`) or npm job is skipped (`release.yml:249`).
  8. `publish-npm`: `id-token: write` + `NPM_TOKEN`; `scripts/release.sh --only-npm` which re-validates tag/SHA/immutable (`scripts/release.sh:71-87,330-349`). Packages: `@frontguard/cli`, `@frontguard/playwright`, `@frontguard/mcp`, `create-frontguard-plugin`, `@frontguard/netlify-plugin`. Skip if version already on registry. `publishConfig.provenance: true` on cli/mcp/playwright → `--provenance`.
  9. Docker job **after** npm: push `frontguard/render:{version}` and `:latest` (`release.yml:294-342`). Marketplace listings are a **manual checklist**, not automated (`release.yml:281-292`).

### Notes

- `deploy-web.yml` does not `needs: CI`; a red `ci.yml` does not by itself stop a web deploy if `apps/web/**` changes land on `main`. npm/Docker **do** require green CI.
- Cloud-api package is `private` (`packages/cloud-api/package.json:4`) — not an npm artifact.
- `frontguard-example.yml` still pins published CLI **0.2.2** / Playwright 1.61.0 while source `VERSION` is 0.2.3 (CI lint already flags version-sync).
