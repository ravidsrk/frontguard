# Frontguard End-to-End Launch Audit - August 2026

**Audited:** 2026-08-29  
**Repository snapshot:** `78a5562ac3dfca45472d84cd220e420c08dbc9ba`  
**Branch:** `audit/launch-finish-2026-08`  
**Verdict:** **NO-GO for a full product launch. Prepare a focused OSS public
beta after the local two-run path and CI path pass the gates below. Do not
launch the hosted product yet.**

This is a fresh audit of source, tests, CI logs, published artifacts, public
endpoints, and current competitor material. Earlier completion documents were
used as inventories, not as proof. The market refresh and its primary-source
ledger are in
[`research/launch-market-refresh-2026-08.md`](./research/launch-market-refresh-2026-08.md).

## Executive conclusion

Frontguard has substantial implementation and a real npm distribution, but its
public promise is wider than its demonstrated product. The central activation
loop is not currently trustworthy:

1. A failed browser capture can be classified as a new page and leave the run
   green.
2. The documented first run does not persist a baseline, so a later run may
   never compare anything.
3. The public GitHub Action failed in its latest smoke run, but the workflow
   stayed green because both Action invocations use `continue-on-error`.
4. Hosted execution calls CLI flags and reads files that the current CLI does
   not produce.
5. Hosted baseline approval changes a database flag but does not promote the
   accepted current screenshots into baseline records.
6. The current web build is on a Workers development domain while
   `frontguard.dev` serves stale claims, stale examples, and dead hosted CTAs.

The shortest credible launch is therefore not "AI-powered frontend reliability
platform." It is:

> **Visual checks for real app routes, in your own CI.** Frontguard discovers
> pages, captures Playwright baselines, and reports changed screenshots from a
> local MIT-licensed CLI. Optional BYOK model-assisted triage remains beta until
> it has a labeled benchmark.

## What changed from the June conclusion

The June readiness documents concluded that code was complete and only external
operations remained. This audit disproves that conclusion with current
end-to-end evidence.

| Prior conclusion | Current evidence | Result |
|---|---|---|
| OSS CLI is shippable | Empty render buffers can become successful `new` results; first-run baselines are not persisted | Reopened as engineering work |
| Action is functional | Latest smoke executed a broken Action twice and remained green | Reopened as engineering and test work |
| Cloud run path is code-complete | Daytona invokes unsupported `--reporter` flags and expects a directory from `--output` | Reopened as engineering work |
| Baseline approval works | Approval only sets `baselinesApproved`; current screenshots retain type `current` | Reopened as data-lifecycle work |
| Cloud needs only deployment | Multi-minute HTTP work uses a short-lived `waitUntil()` lifecycle; integrations lack a working project/baseline contract | Reopened as architecture work |
| Website deploy is complete | Current Worker and canonical domain serve different applications | Reopened as release/operations work |

## Current public reality

| Surface | State on 2026-08-29 | Launch decision |
|---|---|---|
| `@frontguard/cli@0.2.2` | Public on npm with provenance; current source is ahead of the published release | Hold until a new version passes the two-run matrix |
| `@frontguard/playwright@0.2.2` | Public, but the package exports `visualTest` while prominent public examples use `expectVisual` | Hold from launch headline |
| `ravidsrk/frontguard@v0` | Resolves, but real execution fails and the smoke masks the failure | No-go |
| Docker renderer | Source defaults to `frontguard/render:latest`; no public image was found | No-go |
| Self-host Cloud API | Package-local Docker context cannot run its root-relative build; production migration state is absent | No-go |
| Current website build | Reachable at `frontguard-web.ravidsrk.workers.dev` | Preview only |
| `frontguard.dev` | Reachable, but stale relative to `main`; key docs/discovery routes are missing | No-go as canonical launch surface |
| `api.frontguard.dev` / `app.frontguard.dev` | DNS unavailable | No-go |
| GitHub/Slack/Vercel/Netlify hosted flows | Source exists; no complete live install-to-result flow | No-go |
| GitHub Releases | Latest visible release is `v0.1.0` while npm is `0.2.2` | Stale |
| Adoption | 2 stars, 0 forks, 48 CLI downloads in the latest audited 30-day window | Pre-adoption; optimize for activation learning |

## Critical findings

### L0-1 - Render failures can pass as new pages

**Evidence**

- `packages/cli/src/render/playwright.ts:139-156` turns a rejected render task
  into a `ScreenshotResult` with `Buffer.alloc(0)` and a console error.
- `packages/cli/src/core/pipeline.ts:544-558` does not validate the screenshot
  before looking up a baseline. Without a baseline it calls
  `createNewPageResult()`.
- `packages/cli/src/cli/index.ts:361-370` exits successfully when no diff has
  `error` or `regression` status.
- The Action smoke log on run `33150972405` shows Chromium failed to launch and
  all three captures failed before baseline initialization failed for a separate
  reason.

**Customer impact:** a broken browser install, navigation failure, timeout, or
renderer outage can produce a green first run.

**Required acceptance:** a failed capture produces one route/browser/viewport
`error`, increments `summary.errors`, exits `2`, and is never persisted as a
baseline. A negative-control test must fail if empty-buffer validation is
removed.

### L0-2 - The baseline lifecycle does not complete the two-run loop

**Evidence**

- `packages/cli/src/core/pipeline.ts:555-558` labels missing baselines as `new`
  but does not write them.
- The only production write path is `updateBaselines()` at
  `packages/cli/src/core/pipeline.ts:940-1014`.
- `packages/cli/src/storage/git-orphan.ts:486-497` says "commit and push" but
  only stages and commits.
- The generated workflow at
  `packages/cli/src/templates/github-actions.ts:79-90` runs only `frontguard
  run`; it does not seed or push a baseline branch.
- `--update-baselines --output json` returns before a JSON completion event at
  `packages/cli/src/cli/index.ts:283-290`, while the Action requires parseable
  JSON.

**Customer impact:** CI can report every route as new forever while discarding
the screenshots on each ephemeral runner.

**Required acceptance:** document and test one unambiguous contract:

1. `update-baselines` captures only valid screenshots, writes a manifest,
   commits the orphan branch, and returns a machine-readable summary.
2. CI baseline update mode configures a scoped Git identity and explicitly
   pushes `frontguard-baselines`.
3. A normal run with no baseline gives an actionable non-success result or a
   clearly documented new-page state; it never claims comparison coverage.
4. A clean external repository proves baseline seed, persisted branch, known
   mutation, failed comparison, approval, and subsequent pass.

### L0-3 - The public Action is false-green and its interface is incomplete

**Evidence**

- `action.yml:86` installs CLI `0.2.2`, which uses Playwright browser build
  `1228`; `action.yml:99` runs a floating `npx playwright install`, which
  installed build `1234` in run `33150972405`.
- The run log then reports the expected `chromium_headless_shell-1228` binary
  missing.
- Baseline initialization also failed because the runner had no Git author
  identity.
- `.github/workflows/action-smoke.yml:48,91` masks both failures with
  `continue-on-error`.
- `action.yml:66-72` declares outputs without composite-action `value`
  mappings.
- `action.yml:51-56` declares AI inputs that are never included in the command
  or environment.
- A regression causes CLI exit `1`, but `action.yml:211-232` classifies every
  nonzero exit as `error` before the `fail` branch can run.

**Customer impact:** the published integration can be broken while all project
checks remain green, and consumers cannot reliably read its documented outputs.

**Required acceptance:** install browsers through the exact CLI dependency,
configure Git identity only for explicit baseline writes, map composite outputs,
preserve `pass`/`fail`/`error`, wire or remove AI inputs, remove failure masking,
and smoke the public `@v0` reference from an external repository.

### L0-4 - Hosted execution does not implement the current CLI contract

**Evidence**

- `packages/cloud-api/src/daytona-runner.ts:206-225` invokes
  `frontguard run --reporter json --reporter html --output <directory>`.
- The CLI supports only `--output <console|json>` at
  `packages/cli/src/cli/index.ts:246-255`; it has no `--reporter` option.
- JSON is emitted to stdout as an object with `summary` and `diffs` by
  `packages/cli/src/report/json.ts:40-43,85-122`.
- Daytona expects `output/results.json` containing an array, ignores the command
  exit status, and falls back to `[]`.
- `packages/cloud-api/src/processor.ts:60-76,113-114` maps that array and marks
  the run completed.

**Customer impact:** a hosted run can execute zero comparisons and still become
`completed`; downstream GitHub status can report success.

**Required acceptance:** a contract test must execute the actual built CLI
against the sandbox adapter, parse the versioned JSON schema, reject nonzero
exit/malformed/empty output, and verify report/image paths. Mocks returning an
invented array are not sufficient.

### L0-5 - Hosted approval does not promote accepted screenshots

**Evidence**

- `packages/cloud-api/src/index.ts:660-681`, dashboard bulk approval, and team
  review only set `baselinesApproved`.
- `packages/cloud-api/src/index.ts:498-503` restores only screenshot records
  whose type is `baseline`.
- Sandbox report images are persisted with their original `baseline`, `current`,
  or `diff` type by
  `packages/cloud-api/src/storage/persist-screenshots.ts:59-91`.
- For a first run there is no baseline image; for a changed run the accepted
  candidate is the `current` image. Neither path promotes it.
- Monitor processing already contains explicit current-to-baseline promotion in
  `packages/cloud-api/src/monitor-screenshots.ts`, showing the missing lifecycle.

**Customer impact:** dashboard and MCP can report successful approval while the
next run compares against no baseline or the old baseline.

**Required acceptance:** one shared promotion module must atomically map each
accepted route/viewport/browser current image to a baseline record, preserve the
prior baseline for audit/rollback, and make the next run restore the promoted
bytes. API, dashboard, team review, and MCP tests must cross the same interface.

### L0-6 - Hosted background work is not durable enough for its own timeout

**Evidence**

- Daytona execution permits five minutes at
  `packages/cloud-api/src/daytona-runner.ts:206-210`.
- HTTP submission places the full job in request `executionCtx.waitUntil()` at
  `packages/cloud-api/src/index.ts:517-553`.
- Slack similarly performs long polling inside request-lifetime background
  work.

**Customer impact:** the platform may cancel work before results, callbacks, or
dead-letter state are persisted.

**Required acceptance:** move multi-minute jobs to a durable queue/consumer with
idempotent attempts, leases, retries, and terminal-state persistence. Prove a
job longer than the request grace period reaches a terminal state exactly once.

### L0-7 - GitHub completion is not bound to the authenticated tenant

**Evidence**

- The run request accepts caller-provided repository, check-run, and
  installation identifiers.
- Completion uses those identifiers to mint an installation token and update a
  Check Run without proving the installation/repository/check belongs to the
  API-key owner.

**Customer impact:** an authenticated customer could use Frontguard as a
cross-tenant Check Run mutation deputy when identifiers are known.

**Required acceptance:** derive callback identity from a server-side installation
mapping, bind project/repository/installation/check in storage, reject mismatches,
and include a cross-tenant negative test.

### L0-8 - Hosted and self-host deployment paths are not reproducible

**Evidence**

- Cloudflare configs still contain placeholder datastore identifiers.
- The package migration command applies the base schema while runtime-required
  migrations are registered separately.
- `packages/cloud-api/docker-compose.yml` uses the package directory as build
  context, but the package build invokes root `scripts/sync-openapi.mjs`, which
  is outside that context.
- No current production migration ledger, image, or live health endpoint can be
  verified.

**Customer impact:** neither managed nor documented self-host users can reach a
known database-backed service from the advertised path.

**Required acceptance:** CI builds and starts the self-host image from a clean
checkout, applies the complete migration chain to an empty database, reaches
`/health`, submits a two-run fixture, and destroys the fixture cleanly. Managed
staging must prove the same migration ledger before production promotion.

### L0-9 - The canonical web and hosted conversion surfaces are absent or stale

**Evidence**

- `frontguard.dev` serves old copy with unsupported metrics, `expectVisual`,
  `@v1`, DOM/computed-style claims, and hosted trial language.
- The current Worker serves newer content at
  `frontguard-web.ravidsrk.workers.dev`.
- `api.frontguard.dev` and `app.frontguard.dev` do not resolve.
- The canonical site lacks current machine-discovery and several docs routes.

**Customer impact:** evaluators can disprove the product's trust claims before
installing it and paid-intent clicks end at DNS or stale routes.

**Required acceptance:** one canonical origin serves the audited commit; a
post-deploy job probes HTML, docs, sitemap, `agents.md`, OpenAPI, MCP discovery,
pricing CTA, and deployment SHA. Hosted CTAs remain waitlist/design-partner only
until live hosted acceptance passes.

## Required findings before promotion

These are below the critical path but still required for a credible launch:

| ID | Finding | Evidence / impact |
|---|---|---|
| L1-1 | HTML reports lose image buffers | Pipeline disposes buffers in `finally` before the CLI invokes its second HTML reporter; reporter write failures are swallowed |
| L1-2 | Default Action threshold is misleading | Action describes `0.1` as a percentage, while config treats it as fraction `0.1` = 10%; tests explicitly accept a 5% change |
| L1-3 | AI failures are hidden | Batched `Promise.allSettled()` outcomes are not inspected; stage reports all changes analyzed even when calls reject |
| L1-4 | Playwright adapter baselines collide | Key omits browser/project/platform and storage reads turn all errors into missing baselines |
| L1-5 | Demo is not executable proof | No active PR workflow, invalid AI config/secret name, placeholder screenshot, and dead CTAs |
| L1-6 | Public examples use nonexistent interfaces | Homepage uses `expectVisual`; package exports `visualTest`; several examples ignore the returned pass result |
| L1-7 | Marketing claims exceed implementation | DOM/computed-style diff, exact-code mapping, automatic anti-flake, verified-only fixes, and competitor claims are inaccurate |
| L1-8 | AI validation is absent | Published run had AI disabled, no seeded regressions, no recall, and only 2 of 5 repositories booted |
| L1-9 | Responsive and accessibility basics are incomplete | Fixed grids/nav/docs layout, non-interactive search affordance, and low-contrast text need browser and WCAG review |
| L1-10 | Release identity drifts | npm, tags, GitHub Releases, README, changelog, stats, source, and live site disagree |
| L1-11 | Hosted reports are not shareable | Authenticated relative URLs are posted to integrations that cannot attach bearer credentials |
| L1-12 | Paid monitoring reads the wrong plan owner | Billing updates team plan while monitor creation/scheduling checks user plan |
| L1-13 | Monitor input bypasses run SSRF controls | Stored monitor URLs and alert webhooks do not cross the same validated render-target interface |
| L1-14 | Monitor percentages use inconsistent units | Scheduler, reports, and alert renderers mix fraction and 0-100 percent values |
| L1-15 | Legal/support surfaces are missing | No current privacy, terms, service status, support, refund, or data-handling path for a hosted offer |

## End-to-end journey scorecard

### Local evaluator journey

| Step | Status | Exit evidence required |
|---|---|---|
| Install published package | Conditional | Clean Node 20/22/24 and macOS/Linux matrix |
| `init` | Unverified end to end | Generated config typechecks and starts the detected framework path |
| `doctor` | Partial | Runtime requirement matches package metadata and validates browser build |
| First capture | Fail | Valid captures persist through the documented command |
| Second unchanged run | Fail as a product flow | Reads the persisted baseline and proves zero change |
| Seeded visual regression | Unverified | Known 1-5% mutation fails at the declared threshold |
| HTML evidence | Fail | Before/current/diff images survive into the artifact |
| Baseline approval/update | Fail in CI | Accepted bytes persist and the next run passes |
| Optional AI triage | Unvalidated | Provider-specific labeled benchmark and explicit data disclosure |

### CI and integration journey

| Step | Status | Exit evidence required |
|---|---|---|
| Stable Action resolves | Pass | `v0` exists |
| Exact browser installs | Fail | CLI-owned Playwright installer downloads the matching build |
| Baseline branch persists | Fail | Explicit update workflow pushes and later PR fetches it |
| Regression fails check | Fail | `status=fail`, exit `1`, artifact retained |
| Tool error fails check | Fail | `status=error`, exit `2`, actionable log |
| Outputs usable by caller | Fail | Composite output values verified in consumer workflow |
| PR comment with images | Unwired | External PR proves comment and image authorization |
| Smoke gate catches breakage | Fail | No `continue-on-error`; negative control turns workflow red |

### Hosted journey

| Step | Status | Exit evidence required |
|---|---|---|
| Signup/auth/API key | Not live | Staging and production acceptance |
| Project/repository binding | Incomplete | All integrations resolve a stored project and tenant |
| Submit -> durable worker | Fail | Queue-backed execution beyond request lifetime |
| Real CLI result parse | Fail | Versioned CLI/runner contract test |
| Persist report/images | Fail | Authenticated, shareable integration link |
| Approve -> next baseline | Fail | Current bytes promoted atomically |
| GitHub/Slack/Vercel/Netlify | Not launchable | Public install-to-result tests |
| Billing/limits/retention/deletion | Unverified | Live plan and lifecycle acceptance |

## Launch boundary

### Launch now: nothing

Do not promote the current release. Keep npm packages available, but describe
them as pre-launch/early beta until the two-run path is proven.

### First launch: focused OSS public beta

**Included**

- Local CLI route discovery and explicit routes.
- Chromium by default; Firefox/WebKit only where the test matrix passes.
- Valid capture, baseline seed/update, second-run comparison, and HTML/JSON
  artifact.
- Git-backed baseline branch with an explicit, documented push step.
- Optional BYOK AI labeled beta with exact screenshot data flow.
- GitHub Action only after the external consumer smoke passes.

**Excluded from the headline**

- Hosted dashboard, team collaboration, billing, or managed baselines.
- Marketplace integrations.
- Managed monitoring.
- Docker byte-equivalence claims until a public pinned image and cross-host
  measurement exist.
- AI accuracy, false-positive reduction, exact-code attribution, and verified
  fix claims until measured.

### Later launch: private hosted alpha

Enter only after durable execution, tenant-bound integrations, baseline
promotion, migrations, authenticated report sharing, retention/deletion,
billing limits, legal/support, and staging acceptance are complete. Recruit
design partners before fixing a public `$29` price.

## Execution plan

### Wave 1 - Make the local two-run loop true

| Order | Slice | Acceptance |
|---:|---|---|
| 1 | Fail closed on invalid captures | Renderer/pipeline negative tests; errors never become new pages or baselines |
| 2 | Define baseline seed/update contract | Valid-only writes, JSON result, manifest, commit identity guidance, explicit push behavior |
| 3 | Preserve report evidence | HTML writer runs before disposal and propagates write errors; artifact contains real images |
| 4 | Correct threshold semantics | One unit everywhere; docs/action/config agree; seeded 1-5% mutation test |
| 5 | Prove clean two-run fixtures | Node/runtime and host matrix with unchanged and changed second runs |

### Wave 2 - Make CI and public truth match

| Order | Slice | Acceptance |
|---:|---|---|
| 6 | Repair Action interface | Exact browser build, output mappings, exit semantics, AI input decision, Git baseline flow |
| 7 | Replace false-green smoke | External `@v0` consumer and mandatory negative control |
| 8 | Rebuild the demo as proof | Forkable fixture, known regression, real report/screenshot, recorded successful PR |
| 9 | Reconcile claims and examples | Claim ledger is clean; Playwright API examples compile; hosted features visibly waitlisted |
| 10 | Fix responsive/a11y/SEO/legal basics | Mobile browser pass, bounded WCAG audit, canonical/404/sitemap/header/legal checks |
| 11 | Align release identity | New version, changelog, GitHub Release, npm provenance, immutable tag, advanced `v0` |
| 12 | Attach canonical domain | Post-deploy SHA and route probes pass on `frontguard.dev` |

### Wave 3 - Earn a hosted alpha

| Order | Slice | Acceptance |
|---:|---|---|
| 13 | Version CLI/runner result contract | Real built-CLI contract test; malformed/empty/nonzero runs fail |
| 14 | Move execution to durable jobs | Queue, idempotency, retries, leases, dead-letter consumer, long-run test |
| 15 | Bind integrations to tenant/project | Cross-tenant negative tests and stored installation mapping |
| 16 | Centralize baseline promotion | API/dashboard/team/MCP use one atomic promotion module |
| 17 | Reproduce deploy and migration | Clean self-host CI; staging migration ledger; rollback/backup procedure |
| 18 | Make reports safely shareable | Signed/session links with scoped expiry and image authorization |
| 19 | Close monitor/billing/security lifecycle | Team plan, SSRF, percent units, rate limit, deletion, retention |
| 20 | Live integration acceptance | GitHub, Slack, Vercel, and Netlify install-to-result fixtures |

## Objective go/no-go gates

| Gate | Required result |
|---|---|
| Capture safety | 100% of failed captures are errors; zero invalid baselines written |
| Clean activation | At least 90% success across the declared install -> init -> seed -> second run -> report matrix |
| CI truth | One external repository proves stable ref, persisted baseline, pass/fail/error outputs, artifact, and optional PR comment |
| Pixel reliability | Recheck error rate below 5%; false positives reported separately from errors |
| Public truth | Every externally visible product, API, price, competitor, and validation claim is sourced or labeled beta/inference |
| AI promotion | At least 100 labeled changed screenshots across at least 10 repos; accuracy at least 70% and FPR below 15%, by provider/model/date |
| Cross-host claim | Published macOS/Linux/container diff distribution; no equivalence claim without it |
| Retention | At least 5 of 10 observed design partners still run Frontguard in week 4 |
| Hosted promotion | Live health, auth, durable run, review, billing guardrails, retention/deletion, support, and incident tests all pass |

## Product and launch examples to copy

- **Playwright:** one runnable scaffold, examples that match exported interfaces,
  and snapshot behavior explained at the point of use.
- **Renovate:** a low-risk onboarding PR that previews the exact automation
  before activation.
- **Argos:** working free hosted entry, clear PR-review workflow, current pricing,
  and public MCP/integration documentation.
- **Chromatic:** live signup/demo plus privacy, terms, security, and status
  surfaces before asking teams to trust hosted data.
- **Biome:** migration tooling that imports incumbent configuration instead of
  forcing a blank-slate setup.

For sourced competitor pricing, capabilities, launch copy examples, and a
30/60/90-day adoption plan, see the market refresh.

## Success metrics

The north-star metric is **weekly activated repositories**, where activation
means at least one valid baseline run and one later comparison run. Downloads,
stars, and first runs are distribution signals, not product value.

Track:

- time to second run;
- valid captures / attempted captures;
- unchanged, changed, and error rates as separate denominators;
- week-1 and week-4 retained repositories;
- baseline update and approval success;
- Action pass/fail/error distribution;
- AI confusion matrix by provider/model;
- verified-fix yield, excluding unverified suggestions;
- support requests and setup failure category;
- hosted-job demand from retained users, not anonymous page views.

Telemetry must remain opt-in, avoid raw repository and route names by default,
and preserve a fully local path.

## Evidence checked

- Current source and tests across CLI, Playwright adapter, MCP, cloud API,
  integrations, web, demo, workflows, release scripts, migration code, and docs.
- GitHub CI, Action smoke, releases, open issues, tags, and package provenance.
- npm package availability and download API.
- `frontguard.dev`, the current Workers deployment, hosted DNS names, docs and
  machine-discovery routes.
- Official competitor docs, pricing, changelogs, status, repositories, and
  marketplace pages listed in the market refresh source ledger.

No deployment, publication, migration, DNS, production secret, marketplace, or
billing operation was performed during this audit.
