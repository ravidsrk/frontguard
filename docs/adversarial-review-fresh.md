# Frontguard — Code-Grounded Adversarial Architecture Review (P0-REVIEW)

Reviewer: fresh hostile architect. Every finding below was formed by reading the implementation
source, configs, and schemas directly. No prior review/design/architecture doc was opened or cited.
Each finding cites a public `path:line` you can open to falsify it. No secret values appear anywhere.

Surfaces read end-to-end: `packages/cloud-api` (Workers entry, auth, billing, webhooks, D1 store,
schema, scheduler, storage), `packages/cli` (render, sandbox, diff/AI, pipeline, report, storage),
`packages/mcp`, `packages/create-frontguard-plugin`, `integrations/{github-app,vercel,netlify,slack-app}`,
`action.yml` + `packages/cli/action.yml`, wrangler/JSONC configs, `.gitignore`, Dockerfiles.

Severity key: P0 = ship-blocker / exploitable / data-loss or core-flow-broken. P1 = serious.
P2 = should-fix. P3 = hardening / defense-in-depth.
LANE: CODE = mergeable and acceptance demonstrable locally. CODE+OPS = code mergeable but full
acceptance needs an ops apply / load / prod telemetry the swarm cannot run.

---

## 1) FINDINGS

### Reliability (REL)

#### REL-1 — Background run processing is fired without `waitUntil`; Workers may kill it before completion
- SEVERITY: P0
- PROBLEM: `POST /v1/run` kicks off `processRun(...)` as a detached promise and then immediately
  returns `202` (`packages/cloud-api/src/index.ts:372` then `:389`). The work that actually runs the
  Daytona sandbox, persists results, meters screenshots, completes the GitHub Check Run, and emits
  telemetry all lives in that promise's `.finally` (`:377`-`:387`). The Worker is exported as
  `fetch: app.fetch` (`:558`) and never passes the request's `executionCtx.waitUntil` to keep the
  promise alive. On Cloudflare Workers, async work that outlives the response is not guaranteed to run
  — the isolate can be frozen/terminated once the response is returned. A Daytona run takes minutes,
  far beyond any grace period, so in production runs will routinely be left stuck in `running`/`queued`
  with `results`/`reportHtml` never written. The `scheduled` cron handler already uses
  `ctx.waitUntil` (`:565`), proving the pattern is known but omitted on the hot path.
- FIX: In the `/v1/run` handler, capture `c.executionCtx` and wrap the processing promise:
  `c.executionCtx.waitUntil(processRun(...).catch(...).finally(...))`. Reuse the exact `waitUntil`
  pattern from the `scheduled` export (`index.ts:565`). Longer term move to a real queue
  (Cloudflare Queues) so a single isolate's lifetime isn't the durability boundary.
- ACCEPTANCE: Add a Vitest in `packages/cloud-api/test/` that drives `app.fetch` with a stub
  `executionCtx` whose `waitUntil` collects promises, asserts `processRun`'s promise was handed to
  `waitUntil`, and that after awaiting it `store.getRun(id).status === 'completed'`. CODE-demonstrable;
  full prod confirmation needs staging telemetry.
- LANE: CODE+OPS

#### REL-2 — Scheduled monitors never restore baselines, so monitoring can never detect a regression or alert
- SEVERITY: P1
- PROBLEM: `attemptCheck` builds a run and calls `processRun(run, env)` with no `onScreenshots` sink
  and no `baselineRestore` (`packages/cloud-api/src/scheduler.ts:49`-`:65`, call at `:63`). With no
  baseline restored, the sandbox/CLI emits `new_baseline` (status) and `diffPercentage: 0` for every
  route (`packages/cloud-api/src/processor.ts:91`-`:108`, and the Daytona path produces no regression
  without a seeded baseline). The alert filter then requires `r.status === 'regression' ||
  r.diffPercentage > threshold` (`scheduler.ts:88`-`:89`), both of which are always false. Net: the
  paid production-monitoring feature runs, meters usage, and updates `lastStatus`, but structurally
  cannot ever fire an alert.
- FIX: Mirror `/v1/run`'s baseline wiring (`index.ts:348`-`:368`): resolve the monitor's prior
  approved baseline screenshots and pass a `BaselineRestore` plus an `onScreenshots` sink into
  `processRun`. Persist each monitor run's screenshots (the `monitor_runs.screenshots` column already
  exists, `schema.sql:157`) so the next tick has a baseline. Reuse `persistScreenshots` and
  `getScreenshotStore`.
- ACCEPTANCE: Vitest in `packages/cloud-api/test/` using `InMemoryStore` + a stubbed processor that,
  given a `baselineRestore`, returns a `regression` result; assert `runMonitor` produces a non-empty
  `alerts` array and calls `dispatchAlertsWithState`. CODE-demonstrable.
- LANE: CODE

#### REL-3 — In-process rate-limit map is per-isolate and never evicts (ineffective limiter + unbounded memory)
- SEVERITY: P2
- PROBLEM: The limiter is a module-level `Map` (`packages/cloud-api/src/index.ts:43`) consulted in the
  `/v1/*` middleware (`:192`-`:214`). On Workers each isolate (per colo, ephemeral) has its own copy,
  so the "100 req/min per key" is enforced per-isolate, not globally — effective throughput is a large
  multiple of the intended cap and is non-deterministic. Expired entries are only rewritten lazily when
  that same key is seen again (`:198`-`:202`); keys that go quiet are never deleted, so the map grows
  unbounded with distinct keys for the isolate's lifetime.
- FIX: Move rate limiting to a durable, shared primitive — Cloudflare's native Rate Limiting binding,
  or a Durable Object / KV counter keyed by `hashKey(apiKey)` (reuse `auth/keys.ts:hashKey` so the raw
  key is never a map key). At minimum, sweep expired entries.
- ACCEPTANCE: Unit test asserting two requests routed through separate limiter instances are not
  co-counted (documents the per-isolate gap), plus a test that the chosen shared counter rejects the
  101st request within a window. CODE-demonstrable for the shared-counter path; true distribution is OPS.
- LANE: CODE+OPS

#### REL-4 — Scheduler runs monitors sequentially with per-run 5-minute sandboxes; a busy tick is silently truncated
- SEVERITY: P2
- PROBLEM: `runScheduledChecks` iterates due monitors in a `for` loop with `await runMonitor(...)`
  (`packages/cloud-api/src/scheduler.ts:175`-`:198`); each `runMonitor` runs a Daytona sandbox capped
  at 5 minutes (`daytona-runner.ts:198`). The cron fires every 15 minutes
  (`packages/cloud-api/wrangler.toml:33`). With more than ~2-3 due monitors per tick the handler exceeds
  the Worker's wall-clock budget and is killed; monitors late in the list are silently skipped and only
  picked up on a later tick (or never, under sustained load). There is no batching, no queue, and no
  visibility into the truncation.
- FIX: Bound concurrency and offload: enqueue each due monitor onto Cloudflare Queues and process in
  short consumer invocations, or cap monitors-per-tick and round-robin by `lastRunAt`. Emit a metric
  for `due` vs `processed` so truncation is observable (reuse `otel/index.ts`).
- ACCEPTANCE: Unit test that `runScheduledChecks` with N>cap due monitors processes only `cap` and logs
  the remainder; integration smoke deferred to OPS.
- LANE: CODE+OPS

#### REL-5 — Compare temp dir uses a predictable name and is not cleaned up on a mid-pipeline throw
- SEVERITY: P3
- PROBLEM: The compare stage creates `join(tmpdir(), 'frontguard-${Date.now()}')`
  (`packages/cli/src/core/pipeline.ts:518`) with `mkdirSync` (`:519`). The name is predictable
  (second-resolution, world-writable `/tmp`), so two runs in the same second collide and a local actor
  can pre-create/symlink the path. Cleanup happens inside the `try`; if the pipeline throws after the
  dir is created, the outer `finally` only tears down plugins, leaving a directory of full-page PNGs in
  `/tmp` on every failed run.
- FIX: Use `mkdtempSync(join(tmpdir(), 'frontguard-'))` (already used correctly in
  `packages/cli/src/storage/git-orphan.ts`) for an unpredictable unique dir, and move the `rmSync`
  cleanup into the outer `finally` so it runs on throw.
- ACCEPTANCE: Vitest that forces a throw during compare and asserts the temp dir no longer exists;
  plus a test that two concurrent pipelines get distinct temp dirs.
- LANE: CODE

#### REL-6 — Monitor `error` status never alerts; a fully-down target is silent
- SEVERITY: P3
- PROBLEM: `runMonitor` only builds alerts from regression results (`scheduler.ts:88`-`:97`); when the
  check throws (target returns 5xx / unreachable) the status is set to `error` with empty `alerts`
  (`:100`-`:104`), and `dispatchAlertsWithState` is only called when `alerts.length > 0` (`:130`). A
  production site going hard-down therefore produces no notification — the opposite of what a monitor
  is for.
- FIX: Treat repeated `error` status as an alert condition (with its own dedupe/snooze via the existing
  `monitor_alert_state` table and `dispatchAlertsWithState`).
- ACCEPTANCE: Unit test where `attemptCheck` always throws and the owner has monitoring; assert an
  error-class alert is dispatched after the retry budget is exhausted.
- LANE: CODE

### Concurrency (CONC)

#### CONC-1 — Monthly run-limit check is TOCTOU: read usage, check, then increment are not atomic
- SEVERITY: P1
- PROBLEM: `/v1/run` reads usage, runs `checkLimit`, and only later calls `incrementUsage`
  (`packages/cloud-api/src/index.ts:276`-`:288`, then `:310`). The increment itself is atomic
  (`d1-store.ts:277`-`:287`, `runs_count + excluded.runs_count`), but the *decision* is made against a
  stale read. Concurrent submissions all read the same `runsCount`, all pass the limit, then all
  increment — so a user near their cap can exceed the monthly run limit (and trigger that many Daytona
  sandboxes) by firing requests in parallel. Free-tier abuse and direct cost.
- FIX: Make the gate atomic: do a conditional increment in one statement
  (`INSERT ... ON CONFLICT DO UPDATE SET runs_count = runs_count + 1 WHERE runs_count < :limit`) and
  treat zero `changes` as "limit reached", or wrap read+check+increment in a D1 batch/transaction. Add a
  `tryReserveRun(userId, month, limit)` to the `Store` interface so both prod and memory stores share it.
- ACCEPTANCE: Vitest firing N parallel `tryReserveRun` calls against a limit of K and asserting exactly
  K succeed. CODE-demonstrable against `InMemoryStore` and the D1 statement.
- LANE: CODE

#### CONC-2 — `updateRun`/`updateMonitor`/`updateTeam` are read-modify-write with no locking → lost updates
- SEVERITY: P2
- PROBLEM: Each update reads the full row, merges in JS, and writes the whole row back
  (`d1-store.ts:221`-`:244` for runs; `:454`-`:476` monitors; `:570`-`:578` teams). Two writers that
  interleave (e.g. the `/v1/run` completion persist at `index.ts:381` and a concurrent
  `POST /v1/baselines/:runId/approve` at `index.ts:506`, both via `updateRun`) read the same pre-state
  and the later write silently discards the earlier one — completed results can clobber an approval, or
  vice versa. The config is serialized as a single JSON blob, so partial-column updates aren't possible.
- FIX: Write only the specific columns each caller changes (targeted `UPDATE ... SET col = ?`), or use a
  D1 transaction / optimistic-concurrency token (e.g. a `version` column bumped per write). For the
  approval flag specifically, `UPDATE runs SET baselines_approved = 1 WHERE id = ?` avoids the blob
  rewrite entirely.
- ACCEPTANCE: Vitest that interleaves an approval update and a status update on one run and asserts both
  effects survive.
- LANE: CODE

#### CONC-3 — Overlapping cron ticks can double-run a monitor (no lease on "due" rows)
- SEVERITY: P2
- PROBLEM: `listDueMonitors` selects on `enabled` and `isMonitorDue(lastRunAt)` (`d1-store.ts:481`-`:488`),
  and `lastRunAt` is only updated *after* the (multi-minute) run completes (`scheduler.ts:122`-`:125`).
  If a tick runs long enough to overlap the next scheduled tick, both observe the same monitor as due and
  execute it, double-spending the Daytona sandbox and double-metering usage (`scheduler.ts:128`). There is
  no claim/lease marking a monitor "in progress".
- FIX: Atomically claim due monitors before running (e.g. `UPDATE monitors SET last_run_at = :now WHERE id
  = :id AND (last_run_at IS NULL OR last_run_at < :cutoff)` and only run if `changes === 1`), so a second
  overlapping tick finds nothing to claim.
- ACCEPTANCE: Unit test simulating two `runScheduledChecks` over the same store and `now`, asserting each
  monitor executes at most once.
- LANE: CODE

### Security (SEC)

#### SEC-1 — GitHub Action interpolates untrusted inputs directly into shell `run:` blocks (command injection)
- SEVERITY: P1
- PROBLEM: The composite action splices `${{ inputs.* }}` straight into bash. Examples:
  `npx playwright install --with-deps ${{ inputs.browsers }}` (`action.yml:88`), and the
  arg-assembly + `frontguard run $ARGS` block consuming `inputs.url`/`routes`/`viewports`/`browsers`/
  `threshold`/`config` (`action.yml:134`-`:155`). GitHub expands `${{ }}` before the shell runs, so an
  input value such as `chromium; curl … | sh` executes arbitrary commands on the runner. The file at
  `packages/cli/action.yml` mirrors this byte-for-byte. Because this is the marketed entry point
  (`uses: ravidsrk/frontguard@v0`), any downstream workflow that wires attacker-influenced data (PR
  title, branch name, matrix value) into these inputs gets RCE on its runner with its
  `GITHUB_TOKEN`/`FRONTGUARD_*` secrets in scope.
- FIX: Pass every input via `env:` and reference quoted shell variables (the templating engine does not
  expand `$VAR`), e.g. `env: { IN_BROWSERS: ${{ inputs.browsers }} }` then `--browsers "$IN_BROWSERS"`.
  Validate `viewports`/`browsers`/`threshold` against a regex/allowlist. Apply identically to both copies
  (the `action-smoke.yml` workflow already guards drift).
- ACCEPTANCE: A test workflow / `act` run passing `browsers: "chromium; touch /tmp/pwned"` and asserting
  the file is NOT created; lint both manifests for `${{ inputs.` occurring inside a `run:` body.
- LANE: CODE

#### SEC-2 — No SSRF/URL validation on the core render entrypoint; the only guard (Vercel) is hostname-literal and DNS-bypassable
- SEVERITY: P2
- PROBLEM: `/v1/run` accepts any `url` that passes `z.string().url()` (`index.ts:48`-`:49`) and renders
  it in a sandbox via `executeInSandbox({ url: run.url, ... })` (`daytona-runner.ts:159`); there is no
  allow/deny list, scheme restriction beyond URL-parse, or private-range block. The github-app and
  slack paths forward URLs to the same endpoint with no SSRF check (`integrations/github-app/src/handler.ts:300`-`:319`;
  `integrations/slack-app/src/handler.ts:140`). Only the Vercel integration validates
  (`integrations/vercel/src/webhook.ts:175`-`:190` + `isPrivateOrLoopbackHost:127`-`:154`), and that
  check is on the hostname literal with no DNS resolution — its own comment notes "Production cloud-side
  fetchers are expected to do their own DNS-time SSRF guarding," which the cloud side does not do. A
  custom domain (or DNS rebind) pointing at `169.254.169.254`/`127.0.0.1` therefore passes. Blast radius
  is bounded because rendering happens inside an ephemeral Daytona sandbox isolated from Frontguard infra,
  but the renderer is still usable as an SSRF/scan proxy and can reach the sandbox's own metadata/network.
- FIX: Add a shared `assertSafeRenderTarget(url)` (https-only, reject private/loopback/link-local, reject
  non-default ports if desired) applied in `/v1/run` before queuing, and reuse it from every integration.
  Promote `isPrivateOrLoopbackHost` out of `vercel/webhook.ts` into a shared module so all paths share one
  guard; add DNS-time checks in the sandbox runner.
- ACCEPTANCE: Vitest that `/v1/run` with `url: http://169.254.169.254/…` and `http://localhost/…` returns
  400 before any sandbox call; reuse the existing `isPrivateOrLoopbackHost` test vectors.
- LANE: CODE

#### SEC-3 — Dashboard OAuth login mints a brand-new API key on every login and silently discards it
- SEVERITY: P2
- PROBLEM: `/auth/github/callback` always calls `generateApiKey()` + `store.createApiKey(...)`
  (`packages/cloud-api/src/routes/auth.ts:119`-`:126`). When the login was for the browser dashboard
  (`redirect` starts with `/dashboard`), the function sets the session cookie and redirects without ever
  returning the freshly-minted key (`:131`-`:143`) — the user never sees it, but a valid long-lived
  credential now exists in `api_keys` forever. Every dashboard login adds another orphaned key; there is
  no cap on key count and no UI surfaces these, so they accumulate as unrevocable-by-the-user credentials
  and widen the key-theft surface.
- FIX: Only mint a key when the caller actually needs one (the JSON/CLI bootstrap path), not on dashboard
  logins; or mint at most one "default" key per user (upsert/skip if one already exists). Session auth
  (`auth/session.ts`) is sufficient for the dashboard, so the key mint there is unnecessary.
- ACCEPTANCE: Vitest that two dashboard logins for the same GitHub user create at most one api_keys row.
- LANE: CODE

#### SEC-4 — Team invitation token is an unbound bearer with no invitee-identity check and no expiry
- SEVERITY: P2
- PROBLEM: `POST /v1/teams/invitations/accept` adds the *current authenticated caller* to the team using
  only the `token` (`packages/cloud-api/src/routes/teams.ts:219`-`:245`). The invitation may record an
  `email`/`githubLogin` of the intended invitee (`schema.sql:84`-`:93`), but acceptance never verifies
  the caller matches it. There is also no expiry column, and `acceptInvitation` only checks `acceptedAt`
  is null (`d1-store.ts:672`-`:677`). The token is a 128-bit UUID (`teams.ts:185`) so it is not
  guessable, but any user who obtains a leaked/forwarded token (email forward, log, screenshot) can join
  the team at the invited role indefinitely.
- FIX: Bind acceptance to identity — require the caller's resolved GitHub login/email to match the
  invitation, and add an `expires_at` column enforced in `acceptInvitation`. Reuse the role-merge logic
  already present (`teams.ts:227`-`:235`).
- ACCEPTANCE: Vitest that a different user than the invited identity gets 403, and an expired token gets
  404. (The expiry test depends on DM-1's migration path.)
- LANE: CODE

#### SEC-5 — Slack OAuth install callback performs no `state` CSRF verification
- SEVERITY: P3
- PROBLEM: The Slack callback exchanges `code` and persists the workspace install with no validation of an
  anti-CSRF `state` — `buildSlackAuthorizeUrl` merely echoes whatever `state` it is handed
  (`integrations/slack-app/src/oauth.ts:38`-`:46`) and the callback never stores or compares one
  (`integrations/slack-app/src/handler.ts:178`-`:209`). This diverges from the GitHub OAuth flow, which
  correctly sets a `httpOnly` state cookie and requires an exact match
  (`packages/cloud-api/src/routes/auth.ts:56`-`:65`, `:88`-`:94`). For an install flow the impact is
  limited, but it allows login-CSRF / unsolicited installs.
- FIX: Mirror the GitHub flow: generate `state`, store it in a short-lived `httpOnly` cookie, and reject
  the callback unless it matches.
- ACCEPTANCE: Vitest that a callback with a missing/mismatched state is rejected.
- LANE: CODE

#### SEC-6 — "Production" is inferred solely from the presence of a `DB` binding → fail-open to dev auth if misconfigured
- SEVERITY: P3
- PROBLEM: `isProduction(env) === !!env.DB` (`packages/cloud-api/src/db/factory.ts:72`-`:74`). The entire
  prod security posture hangs on this: when false, the `/v1/*` guard accepts ANY bearer token and maps it
  to a per-token demo user (`index.ts:176`-`:182`), and the session layer falls back to the published
  insecure dev secret (`auth/session.ts:78`-`:87`). A Worker deployed without the `DB` binding (or with it
  accidentally unbound) therefore silently runs in fully-open dev mode rather than failing closed.
- FIX: Gate production on an explicit signal (e.g. a `vars` flag `ENVIRONMENT=production` in
  `wrangler.toml`) and treat "production declared but `DB` missing" as a hard 503, the same fail-closed
  stance already used for `DASHBOARD_SESSION_SECRET` (`index.ts:143`-`:151`).
- ACCEPTANCE: Vitest that with `ENVIRONMENT=production` and no `DB` binding the app refuses requests
  instead of accepting arbitrary tokens.
- LANE: CODE

#### SEC-7 — Cloud report HTML interpolates a couple of result fields without escaping (defense-in-depth)
- SEVERITY: P3
- PROBLEM: `generateReportHtml` escapes the dangerous fields (`run.url`, `r.route`), but interpolates
  `r.status` (`packages/cloud-api/src/report-html.ts:12`) and `r.classification`
  (`report-html.ts:14`) unescaped into the served HTML. These are sourced from sandbox/AI output rather
  than a fixed enum at this layer, and the document is returned via `c.html(run.reportHtml)`
  (`index.ts:481`) to the owning user/team. Risk is low (values are normally enum-like and viewer is the
  owner) but it is an unnecessary unescaped sink.
- FIX: Wrap both in the existing `escapeHtml` helper (`report-html.ts:238`).
- ACCEPTANCE: Vitest passing a result with `classification: "<img src=x onerror=…>"` and asserting the
  rendered HTML contains the escaped form.
- LANE: CODE

### Data model (DM)

#### DM-1 — No migration system: schema is create-only (`CREATE TABLE IF NOT EXISTS`), so columns can never be added to live tables
- SEVERITY: P1
- PROBLEM: `migrate` simply replays `schema.sql` statement-by-statement (`packages/cloud-api/src/db/migrate.ts:41`-`:47`),
  and every statement is `CREATE TABLE/INDEX IF NOT EXISTS` (`schema.sql`). On an existing database the
  CREATEs are no-ops, so there is no path to add or alter a column. This is already shaping the design
  against itself: CI metadata is folded into the run `config` JSON blob "so no schema migration is
  required" (`d1-store.ts:74`-`:78`). Any future field (e.g. invitation `expires_at` for SEC-4, a
  per-row `version` for CONC-2, team-scoped usage for DM-3) is blocked. There is also no statement-level
  transaction, so a partial failure leaves a partially-applied schema.
- FIX: Introduce ordered, versioned migration files and a `schema_migrations` ledger table; run pending
  migrations transactionally. The existing `splitStatements` (`migrate.ts:23`) can be reused as the
  executor primitive.
- ACCEPTANCE: A migration test that applies v1, then a v2 `ALTER TABLE`, against a fresh in-memory
  D1-compatible db and asserts the new column exists and v2 is recorded as applied.
- LANE: CODE (FOUNDATION)

#### DM-2 — No cascade deletes: deleting runs/projects/teams orphans child rows and leaks R2 objects
- SEVERITY: P2
- PROBLEM: `deleteRun` removes only the `runs` row (`d1-store.ts:245`-`:248`); `screenshots`,
  `run_attachments`, `screenshot_decisions`, and `baseline_approvals` reference `run_id` with no
  `ON DELETE` clause (`schema.sql:42`-`:53`, `:194`-`:218`, `:107`-`:116`). `deleteTeam` deletes members,
  projects, and invitations but not the team's `runs` (which reference `team_projects(id)`) or
  `team_activity` (`d1-store.ts:579`-`:585`). If D1 foreign-key enforcement is on, `deleteRun` for a run
  that has screenshots fails (the route awaits it with no try/catch at `index.ts:517`, surfacing a 500);
  if enforcement is off, the child rows and their R2 blobs are orphaned (the R2 cleanup at `index.ts:519`-`:525`
  is best-effort and swallows errors). Either way storage and metadata leak over time.
- FIX: Declare `ON DELETE CASCADE` on child FKs (via DM-1's migration system) or explicitly delete child
  rows + R2 prefixes inside `deleteRun`/`deleteTeam`. Reuse `R2ScreenshotStore.deleteRun`
  (`storage/screenshots.ts:107`) and add prefix cleanup for attachments.
- ACCEPTANCE: Vitest that after `deleteRun` no `screenshots`/`attachments`/`decisions` rows for that run
  remain and the R2 prefix is emptied.
- LANE: CODE

#### DM-3 — Usage is metered per-user but plans are paid per-team → team quota is not a shared pool
- SEVERITY: P2
- PROBLEM: The `usage` table is keyed `(user_id, month)` (`schema.sql:56`-`:62`) and every meter call is
  per-user (`index.ts:310`, `:382`; `scheduler.ts:128`). Billing and plan limits, however, are team-scoped
  (`billing/routes` updates `teams.plan`; `index.ts:264`-`:275` resolves the plan from the team). So a
  team that pays for a higher plan does not get a shared monthly pool — each member is independently
  metered against, and limited by, their own per-user counter, and a member who omits `?teamId=` is gated
  by their personal `free` plan regardless of the team they belong to. `getTeamUsage` aggregates per-member
  usage (`d1-store.ts:774`-`:789`) but nothing enforces against that aggregate.
- FIX: Decide the quota unit explicitly. If team-pooled, meter and enforce against a team-scoped usage row
  (`(team_id, month)`), enforce in `/v1/run` using `getTeamUsage`, and require runs under a paid plan to
  carry a team scope. (Requires DM-1 for the new table.)
- ACCEPTANCE: Vitest where two members of one team submit runs and the combined count is enforced against
  the team plan limit.
- LANE: CODE

### Cost / abuse (COST)

#### COST-1 — `routes`/`viewports`/`browsers` arrays are unbounded → screenshot, AI-token, and sandbox-compute amplification
- SEVERITY: P1
- PROBLEM: The `/v1/run` schema caps individual viewport *values* (320-3840) but places no `.max()` on the
  `routes`, `viewports`, or `browsers` *array lengths* (`index.ts:50`-`:60`). The sandbox renders
  routes × viewports × browsers screenshots and (when AI is configured) sends each diff to a vision model;
  screenshots are metered only after the fact in `.finally` (`index.ts:380`-`:382`), so the submission-time
  limit check counts the run as "1" regardless of its true fan-out. One request can therefore demand
  thousands of renders, and combined with CONC-1 a user can launch many such runs in parallel — each
  spinning a 2-CPU/4-GiB Daytona sandbox (`daytona-runner.ts:119`-`:121`) — for an open-ended compute and
  token bill.
- FIX: Add `.max()` bounds on each array in `runRequestSchema` (e.g. routes ≤ 50, viewports ≤ 6,
  browsers ≤ 3) and enforce a per-user concurrent-run cap (a `running` count check before queuing). Meter
  an estimated screenshot count at submission so the plan check sees the true cost. Reuse `checkLimit`
  (`billing/plans.ts`).
- ACCEPTANCE: Vitest that a request with 1000 routes is rejected with 400, and that a per-user concurrency
  cap blocks the Nth simultaneous run.
- LANE: CODE

#### COST-2 — Stripe plan metadata is set on the Checkout Session, not the Subscription → cancellations/downgrades never propagate
- SEVERITY: P1
- PROBLEM: `createCheckoutSession` sets `metadata[plan]` and `metadata[team_id]` at the top level of the
  Checkout Session (`packages/cloud-api/src/billing/stripe.ts:46`-`:48`). In Stripe, top-level checkout
  metadata is not copied onto the resulting Subscription, so later `customer.subscription.updated` /
  `customer.subscription.deleted` events carry a Subscription object whose `metadata` is empty.
  `interpretStripeEvent` derives `teamId` from `obj.metadata?.team_id` for those events
  (`stripe.ts:154`-`:170`), yielding `undefined`, and the webhook only acts when both `teamId` and `plan`
  are present (`routes/billing.ts:98`-`:104`). Net: a customer who cancels or changes plan in the Stripe
  portal stays on whatever plan `checkout.session.completed` last set — the team keeps a paid plan after
  cancelling (revenue/entitlement integrity bug). There is also no event-id idempotency/ordering guard.
- FIX: Set `subscription_data[metadata][team_id]`/`[plan]` at checkout so the Subscription itself carries
  the linkage, and/or resolve the team by `stripe_customer_id`/`stripe_subscription_id` (already stored,
  `schema.sql:69`-`:70`) when metadata is absent. Add idempotency on the Stripe event id.
- ACCEPTANCE: Vitest feeding a signed `customer.subscription.deleted` event (subscription metadata empty,
  matching `stripeSubscriptionId`) and asserting the team is downgraded to `free`.
- LANE: CODE

#### COST-3 — Unbounded API-key minting per user
- SEVERITY: P3
- PROBLEM: `POST /v1/keys` creates a key with no per-user cap (`packages/cloud-api/src/routes/keys.ts:63`-`:86`),
  and (per SEC-3) every dashboard login mints another. A user (or a script holding one valid key) can
  create unlimited credentials, bloating `api_keys` and widening the revocation/theft surface.
- FIX: Enforce a sane per-user key cap in `POST /v1/keys` (count `listApiKeys` first) and fix SEC-3.
- ACCEPTANCE: Vitest that the (cap+1)th key creation returns 4xx.
- LANE: CODE

### Coupling (COU)

#### COU-1 — `action.yml` is duplicated byte-for-byte with `packages/cli/action.yml` and kept in sync only by a smoke test
- SEVERITY: P3
- PROBLEM: The root `action.yml` re-implements the entire composite action that also lives at
  `packages/cli/action.yml` (`action.yml:1`-`:21` documents the intentional duplication). Any fix — most
  importantly the SEC-1 injection remediation — must be made in two places, and drift is only caught
  reactively by `.github/workflows/action-smoke.yml`. This is fragile coupling around a security-sensitive
  file.
- FIX: Generate one manifest from the other at build time, or have the root shim delegate via a documented
  single source so the body exists once. At minimum, add a CI assertion that the two files are identical.
- ACCEPTANCE: A CI check that diffs the two manifests and fails on any divergence.
- LANE: CODE

### Dependency / version hygiene (DEP)

#### DEP-1 — `@frontguard/cli@latest` is installed at runtime in the Action, the root Dockerfile, and the cloud sandbox
- SEVERITY: P1
- PROBLEM: A pinned action ref / cloud deploy still pulls a floating CLI: `npm install -g
  @frontguard/cli@latest` appears in `action.yml:84`, `packages/cli/Dockerfile:6`, and
  `packages/cloud-api/src/daytona-runner.ts:150`. Builds are non-reproducible and a single bad or
  compromised `latest` publish immediately breaks (or backdoors) every consumer of the Action and every
  cloud run that falls back to the base-image install path. For a product whose value proposition is
  byte-stable rendering, this also means baselines can shift under users without any version change on
  their side.
- FIX: Pin the installed CLI to the matching released version (thread the action/sandbox version through),
  as `packages/cli/docker/Dockerfile:84`-`:90` already does by installing from a packed tarball rather than
  `latest`.
- ACCEPTANCE: Grep gate in CI rejecting `@frontguard/cli@latest`; verify the Action installs the version
  matching its ref.
- LANE: CODE

#### DEP-2 — Two Dockerfiles pin different Playwright versions (1.48 vs 1.59), mismatched against `package.json`
- SEVERITY: P2
- PROBLEM: `packages/cli/Dockerfile:1` uses `mcr.microsoft.com/playwright:v1.48.0-jammy` and then
  `npx playwright install --with-deps chromium firefox webkit` (`:9`), while the maintained image
  `packages/cli/docker/Dockerfile:48` pins `v1.59.0-jammy` and `package.json` requires `playwright:
  "^1.59.0"` (`packages/cli/package.json:73`). The root image therefore ships 1.48 base browsers, then a
  1.59 CLI downloads 1.59 browser builds on top — a driver/browser skew that produces inconsistent
  renders, defeating the reproducibility guarantee.
- FIX: Delete the root `packages/cli/Dockerfile` (the `docker/` image is the maintained one) or pin it to
  `v1.59.0-jammy` and install the CLI from a packed tarball (DEP-1).
- ACCEPTANCE: CI build of the chosen Dockerfile asserts `playwright --version` inside the image matches
  `package.json`.
- LANE: CODE

#### DEP-3 — Inconsistent Node engine floors across workspaces
- SEVERITY: P3
- PROBLEM: The root and several packages declare `node: ">=18"` (`package.json:34`,
  `packages/mcp/package.json:59`, `integrations/netlify/package.json:33`) while the CLI requires
  `node: ">=20"` (`packages/cli/package.json:64`) and the Action/sandbox run Node 20. A contributor on
  Node 18 can install the monorepo but the CLI's runtime assumptions (and `>=20`-only APIs) are unmet,
  producing confusing failures.
- FIX: Align the engine floor to the highest actually required (`>=20`) across the workspace, or scope the
  lower floor only to packages that truly support 18.
- ACCEPTANCE: `npm ci` on Node 18 surfaces a clear engine error rather than a late runtime crash.
- LANE: CODE

#### DEP-4 — Playwright pinned with a caret while rendering must be byte-stable
- SEVERITY: P3
- PROBLEM: `playwright: "^1.59.0"` (`packages/cli/package.json:73`) lets a minor/patch bump in fonts or
  the rendering engine land via lockfile refresh; for a visual-regression tool that silently invalidates
  every stored baseline (mass false positives) on an unrelated dependency update.
- FIX: Exact-pin Playwright (and document the deliberate, baseline-aware upgrade procedure), consistent
  with the pinned Docker base.
- ACCEPTANCE: `package.json` shows an exact version; an upgrade PR template notes baseline re-approval.
- LANE: CODE

### Operational (OPS)

#### OPS-1 — `.dev.vars` is not gitignored despite 4+ secret-bearing Workers using Wrangler
- SEVERITY: P2
- PROBLEM: `.gitignore` excludes `.env` / `.env.*` (`.gitignore:6`-`:7`) but not Cloudflare Wrangler's
  `.dev.vars` convention, which `cloud-api`, `github-app`, and `slack-app` Workers load local secrets
  from (`SLACK_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `GITHUB_APP_PRIVATE_KEY`, etc.). None is committed
  today, so this is latent — the first developer who runs `wrangler dev` with real values risks committing
  live secrets.
- FIX: Add `.dev.vars` and `**/.dev.vars` to `.gitignore`.
- ACCEPTANCE: `git check-ignore packages/cloud-api/.dev.vars` returns the path.
- LANE: CODE

#### OPS-2 — Committed placeholder binding IDs with no pre-deploy guard
- SEVERITY: P3
- PROBLEM: `packages/cloud-api/wrangler.toml:23` ships `database_id = "REPLACE_WITH_D1_DATABASE_ID"` and
  `integrations/slack-app/wrangler.toml` ships `id = "REPLACE_WITH_KV_NAMESPACE_ID"`. These are not
  secrets, but an un-edited `wrangler deploy` fails opaquely, and a wrong-but-real ID would bind
  production traffic to an unintended datastore. There is no CI guard asserting placeholders were replaced.
- FIX: Move IDs into per-environment blocks driven by `--var`/secrets, and add a pre-deploy check failing
  on any remaining `REPLACE_WITH`.
- ACCEPTANCE: CI step greps tracked wrangler configs for `REPLACE_WITH` and fails the deploy job.
- LANE: CODE+OPS

#### OPS-3 — Background run/scheduler failures have no dead-letter and near-zero visibility
- SEVERITY: P2
- PROBLEM: A failed `processRun` only mutates `run.error`/`run.status` in the detached promise
  (`index.ts:373`-`:376`) — which (per REL-1) may never persist — and the spend-cap failure path just
  `console.warn`s (`index.ts:319`-`:321`). The scheduler counts errors but raises nothing
  (`scheduler.ts:184`-`:187`), and per-baseline restore/persist failures are swallowed
  (`daytona-runner.ts:180`-`:182`, `processor.ts:80`-`:84`). There is no dead-letter queue, retry ledger,
  or alert, so silent failures are invisible until a user notices a stuck run.
- FIX: Persist terminal failure state durably (inside REL-1's `waitUntil`), record failed runs to a
  dead-letter table for retry, and emit failure metrics via the existing `otel` exporter
  (`otel/index.ts`).
- ACCEPTANCE: Vitest asserting a thrown `processRun` results in a persisted `failed` run with the error
  recorded; metric emission asserted via the OTLP stub.
- LANE: CODE+OPS

#### OPS-4 — Action writes multi-line JSON to `$GITHUB_OUTPUT` via `result=$(...)`, which is malformed and output-smugglable
- SEVERITY: P3
- PROBLEM: `echo "result=$(cat /tmp/frontguard-result.json)" >> $GITHUB_OUTPUT` (`action.yml:160`) writes
  multi-line content with the single-line `key=value` form; `$GITHUB_OUTPUT` requires a heredoc delimiter
  for multi-line values. Multi-line JSON breaks the output file and a crafted result containing a newline +
  `something=…` can inject additional step outputs. The preceding `2>&1` merge (`:155`) also pollutes the
  JSON with stderr, so `jq` (`:158`) can fail and leave `regressions` empty.
- FIX: Use the heredoc form (`result<<EOF` … `EOF`) for the JSON output, stop merging stderr into the
  result file, and default `REGRESSIONS` to 0 when `jq` fails.
- ACCEPTANCE: A workflow test passing a multi-line / newline-bearing result and asserting downstream steps
  read exactly the intended `result`/`regressions` outputs.
- LANE: CODE

---

## 2) DEPENDENCY-ORDERED RANKING

Land top-to-bottom. FOUNDATION items unblock dependents that inherit them.

P0
1. REL-1 (waitUntil) — FOUNDATION. Until background work survives, every downstream durability/visibility
   fix (OPS-3, REL-2 persistence, CONC-2 completion writes) is untestable in prod.

P1
2. DM-1 (migration system) — FOUNDATION. Required by SEC-4 (invitation expiry), CONC-2 (version column),
   DM-3 (team usage table), and any future column.
3. SEC-1 (Action shell injection) — independent; highest external blast radius.
4. DEP-1 (`@latest` pinning) — FOUNDATION for DEP-2; supply-chain.
5. CONC-1 (run-limit TOCTOU) — pairs with COST-1; land before COST-1's concurrency cap.
6. COST-1 (unbounded fan-out + concurrency) — depends on CONC-1's reservation primitive.
7. COST-2 (Stripe subscription metadata) — independent.
8. REL-2 (monitor baselines) — depends on REL-1 (persistence path) for the next-tick baseline to exist.

P2
9. CONC-2 (lost-update RMW) — uses DM-1 (version column) for the robust fix.
10. DM-2 (cascade deletes) — uses DM-1.
11. DM-3 (team usage pool) — uses DM-1.
12. SEC-2 (SSRF guard) — FOUNDATION for a shared `assertSafeRenderTarget` reused by all integrations.
13. SEC-3 (login key minting) — pairs with COST-3.
14. SEC-4 (invitation binding/expiry) — expiry depends on DM-1.
15. CONC-3 (cron lease) — independent.
16. REL-3 (rate limiter) — independent.
17. REL-4 (scheduler scaling) — independent.
18. DEP-2 (Dockerfile Playwright skew) — depends on DEP-1.
19. OPS-1 (.dev.vars), OPS-3 (dead-letter; depends on REL-1).

P3
20. REL-5, REL-6, SEC-5, SEC-6, SEC-7, COST-3 (pairs with SEC-3), COU-1, DEP-3, DEP-4, OPS-2, OPS-4.

---

## 3) HOT-FILE COLLISION MAP

Files touched by more than one finding. Serialize edits per file (one finding lands, rebase the next).

| File                                              | Finding IDs                                  | Action    |
|---------------------------------------------------|----------------------------------------------|-----------|
| packages/cloud-api/src/index.ts                   | REL-1, REL-3, CONC-1, COST-1, SEC-2, SEC-6, OPS-3 | serialize |
| packages/cloud-api/src/db/d1-store.ts             | CONC-1, CONC-2, DM-2, DM-3                    | serialize |
| packages/cloud-api/src/scheduler.ts               | REL-2, REL-4, REL-6, CONC-3                   | serialize |
| packages/cloud-api/src/db/schema.sql              | DM-1, DM-2, DM-3, SEC-4                       | serialize |
| packages/cloud-api/src/db/migrate.ts              | DM-1 (then enables DM-2/DM-3/SEC-4)          | serialize |
| action.yml + packages/cli/action.yml              | SEC-1, DEP-1, OPS-4, COU-1                    | serialize |
| packages/cloud-api/src/billing/stripe.ts          | COST-2                                        | single    |
| packages/cloud-api/src/routes/billing.ts          | COST-2                                        | single    |
| packages/cloud-api/src/routes/auth.ts             | SEC-3                                         | single    |
| packages/cloud-api/src/routes/keys.ts             | COST-3                                        | single    |
| packages/cloud-api/src/routes/teams.ts            | SEC-4                                         | single    |
| packages/cloud-api/src/daytona-runner.ts          | DEP-1, SEC-2                                  | serialize |
| packages/cloud-api/src/db/factory.ts              | SEC-6                                         | single    |
| packages/cloud-api/src/report-html.ts             | SEC-7                                         | single    |
| packages/cli/Dockerfile                           | DEP-1, DEP-2                                  | serialize |
| packages/cli/src/core/pipeline.ts                 | REL-5                                         | single    |
| .gitignore                                        | OPS-1                                         | single    |
| packages/cloud-api/wrangler.toml                  | OPS-2 (+ SEC-6 env flag)                      | serialize |

---

## 4) VALIDATED STRENGTHS / DO-NOT-TOUCH

Correct patterns to preserve. Do not refactor these while fixing around them.

- Webhook signature verification is uniformly correct across integrations: GitHub
  (`integrations/github-app/src/webhook.ts:53`-`:79`, fail-closed on missing secret at
  `handler.ts:138`-`:142`), Stripe (`billing/stripe.ts:71`-`:101`, timestamp tolerance + timing-safe),
  Slack (`integrations/slack-app/src/verify.ts:37`-`:63`, replay window), and Vercel
  (`integrations/vercel/src/webhook.ts:71`-`:96`). All use HMAC + constant-time compare and verify the raw
  body before parsing. Keep the verify-before-parse ordering.
- Dashboard session auth is well designed: HMAC-SHA256 stateless cookie, fails closed in production with a
  clear 503 when the secret is missing/too short, constant-time compare, and `userId` dot-escaping to keep
  the `userId.expiry.sig` format unforgeable (`packages/cloud-api/src/auth/session.ts:64`-`:171`,
  enforced at `index.ts:143`-`:153`). The OAuth `state` CSRF cookie flow (`routes/auth.ts:56`-`:94`) is the
  reference Slack should copy (SEC-5).
- API keys are high-entropy (192-bit) and stored only as SHA-256 hashes; lookup is by hash equality so
  there is no plaintext at rest and no string-compare timing surface (`auth/keys.ts:19`-`:39`,
  `d1-store.ts:137`-`:143`). The `fg_session` cookie and OAuth cookies set `httpOnly`/`SameSite=Lax`/
  `secure` in prod (`routes/auth.ts:59`-`:65`, `:135`-`:141`).
- Team RBAC is robust: capability checks via `requireCap`, strict outranking for role changes, no
  self-promotion, and last-owner protection (`packages/cloud-api/src/routes/teams.ts:66`-`:76`,
  `:247`-`:284`, `:303`-`:327`); invitation acceptance never downgrades an existing higher role
  (`:227`-`:235`). Multi-tenant R2 keys are namespaced per user
  (`storage/screenshots.ts:39`-`:59`) and screenshot serving enforces run ownership before streaming bytes
  (`routes/screenshots.ts:23`-`:69`). No IDOR found in the screenshot path.
- CLI shell safety: git operations use `execFileSync('git', argv, …)` with explicit timeouts and no shell
  (`packages/cli/src/storage/git-orphan.ts`), and the Daytona render path uploads AI-generated CSS to a
  file rather than interpolating it into the remote command (`daytona-runner.ts` baseline/seed helpers).
  AI-generated fix patches are never `eval`'d or written to the user's source tree — they flow only into
  reporters and, for verification, into a sandboxed headless page as a `<style>` tag
  (`packages/cli/src/sandbox/local.ts:58`-`:61`). Keep these boundaries.
- The Vercel integration's SSRF allowlist (`integrations/vercel/src/webhook.ts:127`-`:190`) is the right
  model and should be promoted to a shared util (SEC-2), not removed.
