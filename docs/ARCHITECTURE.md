# Architecture

Frontguard is a local visual regression CLI. It renders routes with Playwright, compares each
screenshot with a reviewed PNG baseline on a git orphan branch, and exits on the pixel result.
Model analysis is optional and advisory.

The repository is an npm workspaces monorepo (`packages/*`, `apps/*`, `integrations/*`). The
supported product path is the CLI, `@frontguard/cli`, and the GitHub Action that wraps it. The
cloud API is source in this repository and is not deployed, so the integrations that call it are
pre-release. See [ROADMAP.md](ROADMAP.md) for scope and the [docs index](README.md) for
everything else.

`scripts/test/docs-architecture.test.ts` checks this file. It fails when a workspace directory is
missing below, or when a backticked type name is not exported from a workspace `src/` tree.

## Package map

| Directory | npm package | Role | Status |
| --- | --- | --- | --- |
| `packages/cli` | `@frontguard/cli` | The engine: CLI commands, run pipeline, discovery, rendering, comparison, baselines, reports and plugins. Also the library entry (`dist/index.js`, `dist/plugins/index.js`) and the `frontguard-render` bin. | Published |
| `packages/playwright` | `@frontguard/playwright` | `visualTest` and `expectVisual` assertions for Playwright Test, with file-based baselines. No runtime dependency on the CLI: tsup bundles the CLI's shared AI module (`packages/cli/src/diff/ai-provider.ts`) into its `dist`. | Published |
| `packages/mcp` | `@frontguard/mcp` | stdio MCP server for editor agents. Reads a local CLI JSON report or the cloud API. | Published |
| `packages/create-frontguard-plugin` | `create-frontguard-plugin` | Scaffolds a plugin project (`npm create frontguard-plugin`). | Published |
| `packages/cloud-api` | `@frontguard/cloud-api` | Hono app for Cloudflare Workers with D1, R2, Stripe and Daytona. Runs the pinned CLI release in a sandbox. | Private, not deployed |
| `integrations/github-app` | `@frontguard/github-app` | Workers app: pull-request webhooks to Check Runs, preview-URL inference, bootstrap PR. | Private, pre-release |
| `integrations/netlify` | `@frontguard/netlify-plugin` | Netlify Build Plugin. Its `onSuccess` hook submits a run to the cloud API and, with a GitHub token, comments on the PR. Plain ESM JavaScript, no build step. | Published, needs a cloud API |
| `integrations/slack-app` | `@frontguard/slack-app` | Slack OAuth install and the `/frontguard` slash command. Installs live in KV. | Private, pre-release |
| `integrations/vercel` | `@frontguard/vercel-integration` | Vercel install flow and deployment webhook that forwards preview URLs to the cloud API. | Private, pre-release |
| `apps/web` | `frontguard-web` | frontguard.dev on TanStack Start and Cloudflare Workers: marketing pages, `/docs`, `llms.txt`, `agents.md`, `openapi.json`. Deployed by `.github/workflows/deploy-web.yml`. | Live |
| `apps/demo` | `frontguard-demo` | Small Next.js app with three routes to run the CLI against. A fixture, not a product. | Private |

Only two workspaces import another: `integrations/slack-app` and `integrations/vercel` import the
SSRF guard from `@frontguard/cloud-api/render-target`. The MCP server reads the CLI's JSON report
format rather than importing the CLI, and `packages/playwright` carries its own diff code. Its AI
classification compiles in the CLI's `diff/ai-provider.ts` at build time, so both packages send the
same prompt, schema and default models.

Outside the workspaces:

| Path | Contents |
| --- | --- |
| `action.yml`, `action-run.sh` | Repo-root composite Action. `packages/cli/scripts/sync-root-action.mjs` generates `action.yml` from `packages/cli/action.template.yml` and copies `packages/cli/action-run.sh`, so edit the `packages/cli` files. |
| `scripts/` | Repo scripts: `sync-version.ts`, `sync-openapi.mjs`, `release.sh`, `stats.ts`, `ci-failure-alert.mjs`. Tests for them and for repo structure live in `scripts/test/`. |
| `validation/` | Harness that runs the CLI against real open-source frontends, plus recorded results. |
| `skills/frontguard/` | Agent skill for Frontguard users, with task references. |
| `docs/` | Maintained docs, listed in the [docs index](README.md). Dated history is in `docs/archive/`. |
| `demo/`, `branding/` | Demo recording assets and logo files. |

## How a run flows

`frontguard run` builds a `FrontguardConfig` (`core/config.ts`, Zod-validated) and calls
`runPipeline` in `packages/cli/src/core/pipeline-run.ts`. Paths below are under
`packages/cli/src/`.

1. **Preview URL.** With no `baseUrl`, or a localhost default, `utils/preview-url.ts` looks for a
   CI preview deployment (Vercel, Netlify, Cloudflare Pages and others) and waits for it.
2. **Discover.** `beforeDiscover` hook, then `discoverAllRoutes` (`core/pipeline-discover.ts`):
   configured routes win; otherwise one story runner (Storybook, Ladle or Histoire); otherwise
   the crawler when `discover` is set; otherwise filesystem discovery, falling back to a crawl
   from `/`. Then the `afterDiscover` hook.
3. **Filter.** `smartFilter` (`graph/filter.ts`) maps changed files from git to affected routes
   through the import graph (`graph/parser.ts`, `graph/resolver.ts`). Anything it cannot trace
   renders every route.
4. **Render.** `beforeRender` hook, then `renderPages` (`render/playwright.ts`) captures each
   route × viewport × browser. Opt-in settings wait for two matching frames (`waitForStability`,
   `render/stability.ts`), take a consensus of several renders (`antiFlakeRenders`), or mask
   credential and card fields (`redactSensitive`, `render/redaction.ts`). Then the `afterRender`
   hook.
5. **Compare.** `GitOrphanStorage` (`storage/git-orphan.ts`) reads the baseline PNG, and
   `compareScreenshot` (`diff/pixel.ts`) runs pixelmatch. A borderline diff can pass on SSIM
   (`diff/ssim.ts`) unless a localized region changed sharply. Changed pixels are clustered into
   regions (`diff/regions.ts`). The renderer fingerprint is checked (`core/fingerprint.ts`). Then
   the `afterCompare` hook.
6. **Analyze (optional).** With `ai` configured, `analyzeWithAI` (`diff/ai-vision.ts`) attaches
   an `aiAnalysis` classification to each changed diff. The classification never turns a failing
   diff into a pass. A failed analysis call marks that diff as an error. Past `ai.maxCalls` a diff
   is marked `aiSkipped: 'budget'` instead and keeps its pixel status (`core/ai-usage.ts`).
7. **Fix (optional).** With `ai` and `generateFixes`, `generateFix` (`diff/ai-fix.ts`) proposes a
   CSS patch for each diff the model classified as a regression. With `verifyFixes`, `verifyFix`
   (`sandbox/verify-fix.ts`) re-renders the patch in a local or Daytona sandbox.
8. **Result and report.** `core/pipeline-result.ts` builds the `RunResult`,
   `storage/upload-stage.ts` optionally uploads thumbnails, the `afterRun` hook runs, and the
   reporter writes output (`report/`).

Exit codes come from `cli/exit-code.ts`: 0 when every shot passes; 1 for a pixel regression or a
new page without a baseline; 2 when nothing was compared, a shot errored, or a strict fingerprint
check failed.

Other entry points share these stages: `updateBaselines` (`core/pipeline-update.ts`) writes
baselines and needs `--confirm-baselines` (`cli/baseline-confirm.ts`); `frontguard review`
(`cli/review-command.ts`) accepts shots from a report without re-rendering; `frontguard
prune-baselines` plans and applies baseline pruning (`storage/prune-baselines.ts`);
`runJudgePipeline` (`core/pipeline-judge.ts`) is the experimental judge mode, whose notes never
set a regression.

## packages/cli

Every directory under `packages/cli/src/`:

| Directory | Responsibility | Key files and exports |
| --- | --- | --- |
| `cli/` | Commander entry and commands: `run`, `init`, `update-baselines`, `review`, `prune-baselines`, `ignores`, `doctor`, `monitor`, `accept-fix`, `reject-fix`, `export-patterns`, `plugin`, `guide`. Exit codes and threshold parsing. The `frontguard-render` wrapper for sandboxes. | `index.ts` (`main`, `buildConfig`), `init.ts`, `doctor.ts`, `review-command.ts`, `prune-baselines.ts`, `aged-ignores.ts`, `guide.ts`, `run.ts` (Docker re-exec), `render.ts`, `exit-code.ts`, `baseline-confirm.ts`, `threshold.ts`, `load-review.ts` |
| `core/` | Config loading and validation, shared types, the pipeline stages, plugin lifecycle and registry, renderer fingerprint. | `config.ts` (`loadConfig`, `defineConfig`), `types.ts` (`FrontguardConfig`, `Route`, `ScreenshotResult`, `DiffResult`, `RunResult`, `Reporter`, `BaselineStorage`, `AIConfig`), `pipeline.ts` (public re-exports), `pipeline-run.ts`, `pipeline-discover.ts`, `pipeline-update.ts`, `pipeline-judge.ts`, `pipeline-result.ts`, `pipeline-batch.ts`, `ai-usage.ts` (`AIUsageTracker`: per-call records and the `ai.maxCalls` budget), `pipeline-errors.ts` (`UnreachableBaseUrlError`), `plugins.ts` (`FrontguardPlugin`, `PluginContext`, `PluginManager`), `plugin-registry.ts`, `fingerprint.ts` |
| `diff/` | Pixel comparison, SSIM, region clustering, threshold maths, advisory model analysis, CSS fix generation, judge mode, validation metrics. | `pixel.ts` (`compareScreenshot`), `ssim.ts`, `regions.ts`, `threshold.ts`, `ai-provider.ts` (the one model transport: `DEFAULT_AI_MODELS`, request building, structured-output schemas, response parsing, retries, `AIAnalysisError`, the `FRONTGUARD_DEBUG_AI` dump), `ai-vision.ts` (`analyzeWithAI`), `ai-fix.ts` (`generateFix`), `model-judge.ts`, `validation-metrics.ts` |
| `discovery/` | Route discovery: crawler, filesystem routes, Storybook, Ladle and Histoire indexes, story matching, capture-runner checks. | `crawler.ts`, `filesystem.ts`, `storybook.ts`, `storybook-parameters.ts`, `ladle.ts`, `histoire.ts`, `index-json.ts`, `story-match.ts`, `story-url.ts`, `capture-runner.ts` |
| `graph/` | Import graph and git diff to choose affected routes. | `filter.ts` (`smartFilter`), `parser.ts` (`DependencyGraph`), `resolver.ts`, `diff-base.ts` (`FRONTGUARD_DIFF_BASE`) |
| `plugins/` | The six built-in plugins and the `@frontguard/cli/plugins` entry. | `accessibility.ts`, `figma.ts`, `monitor.ts`, `perf-budgets.ts`, `text-snapshot.ts`, `third-party-scripts.ts`, `index.ts` |
| `render/` | Playwright capture and everything that shapes a screenshot: frame stability, redaction, route actions, cropping, DOM boxes for attribution, horizontal-overflow probe, Docker renderer. | `playwright.ts` (`renderPages`), `stability.ts`, `redaction.ts`, `route-actions.ts`, `crop.ts`, `dom-elements.ts`, `horizontal-overflow.ts`, `overflow-probe.js` (loaded at runtime, copied into `dist/`), `docker.ts` (`DockerRunner`) |
| `report/` | Reporters: console, JSON, self-contained HTML, GitHub PR comment, fan-out. | `factory.ts` (`createReporter`), `console.ts` (`ConsoleReporter`), `json.ts` (`JSONReporter`), `html.ts` (`HTMLReporter`), `github-pr.ts` (`GitHubPRReporter`), `composite.ts` (`CompositeReporter`) |
| `sandbox/` | Applying a generated patch and re-rendering it to verify a fix. | `types.ts` (`Sandbox`), `local.ts` (`LocalSandbox`), `daytona.ts` (`DaytonaSandbox`, optional dependency), `verify-fix.ts` (`verifyFix`) |
| `storage/` | Orphan-branch baselines, pruning, PR-scoped selection spike, S3 layout spike, thumbnail upload, local fix-pattern database. | `git-orphan.ts` (`GitOrphanStorage`), `prune-baselines.ts`, `baseline-selection.ts`, `s3-baseline-layout.ts`, `image-upload.ts` (`ImageUploader`), `upload-stage.ts`, `fix-patterns.ts` (`FixPatternDB`) |
| `templates/` | Framework templates for `init` and the generated GitHub Actions workflow. | `index.ts` (`FRAMEWORK_TEMPLATES`), `github-actions.ts` |
| `types/` | Ambient declarations for pixelmatch and the optional axe-core Playwright package. | `pixelmatch.d.ts`, `axe-core-playwright.d.ts` |
| `utils/` | Logging, secret redaction, retries, preview-URL detection, opt-in telemetry, OTLP traces, environment checks. | `logger.ts`, `redact.ts`, `retry.ts`, `preview-url.ts`, `telemetry.ts`, `otel.ts`, `env.ts` |

`version.ts` holds `CLI_VERSION`. Outside `src/`: `test/` mirrors these directories, `test/e2e/`
runs with `vitest.e2e.config.ts`, `docker/` holds the pinned render image and Compose file,
`bin/frontguard-render` is the sandbox render binary, and `tsup.config.ts` builds the CLI bin, the
render bin and the two library entries.

## packages/cloud-api

Source only. `api.frontguard.dev` does not resolve, and the deployment gates are in
`packages/cloud-api/README.md`.

| Path under `src/` | Responsibility |
| --- | --- |
| `index.ts` | Hono app and the Workers `fetch` and `scheduled` exports. `/v1/run`, runs, reports, baseline approval, account erasure, usage, health and the OpenAPI document. |
| `routes/` | Route groups: GitHub OAuth, API keys, billing, dashboard, monitors, screenshots, teams, content-addressed blob storage. |
| `db/` | `Store` interface with `InMemoryStore` (dev and tests) and `D1Store`; monitors, teams, masks, attachments, background failures; `schema.sql` and ordered `migrations/` (`Migration`). |
| `storage/` | Screenshot blobs (`ScreenshotStore`, `R2ScreenshotStore`), persistence of run screenshots, team blob purge. |
| `auth/`, `security/` | OAuth, API-key hashing, session cookies, run access checks; the SSRF guard for render targets (`render-target.ts`, `SafeRenderTargetError`). |
| `billing/`, `alerts/`, `dashboard/`, `otel/`, `ops/`, `teams/` | Stripe plans and spend caps; Slack, email and PagerDuty alerts; server-rendered dashboard HTML; OTLP metrics; wrangler placeholder guard; invitation matching and email. |
| `processor.ts`, `daytona-runner.ts`, `scheduler.ts` | Run processing, running the pinned CLI in a Daytona sandbox, cron-driven monitor checks. |
| `review-policy.ts`, `rate-limit.ts`, `limits.ts`, `dead-letter.ts`, `github-callback.ts`, other top-level files | Multi-reviewer promotion gate spike, per-isolate rate limiting (`BoundedRateLimiter`), fan-out caps, dead-letter records, Check Run completion, shared helpers. |

`scripts/sync-openapi.mjs` copies `apps/web/public/openapi.json` onto `src/openapi.json`.

## packages/mcp

| Path under `src/` | Responsibility |
| --- | --- |
| `index.ts` | Server entry: protocol negotiation, tool registration. `promote_baseline` and `accept_baseline` register only with `FRONTGUARD_MCP_WRITES=1`. |
| `auth.ts` | Reads `FRONTGUARD_API_KEY` and `FRONTGUARD_API_URL` into `FrontguardAuth`. The server starts without them; cloud tools return a clear error. |
| `client/cloud.ts` | `CloudClient` for the cloud API, and the local-report client for `FRONTGUARD_LOCAL_REPORT`. |
| `tools/` | One file per tool: `list_regressions`, `inspect_diff_cluster_dom`, `get_suggested_fix`, `verify_css_patch`, `recent_runs`, `list_horizontal_overflow`, `promote_baseline`, `accept_baseline`. Shared helpers: `_paging.ts` (`limit` / `cursor` pages for the list tools), `_runs.ts` (newest run, `"latest"`), `_regression.ts`. |

## packages/playwright

| Path under `src/` | Responsibility |
| --- | --- |
| `visual-test.ts` | `visualTest` and `expectVisual`. |
| `diff.ts`, `ai.ts` | Pixel comparison, SSIM and clustering; optional model analysis through the CLI's shared `ai-provider.ts`, returning `aiError` when it fails. |
| `storage.ts` | File-based `BaselineStorage` (default `__visual_baselines__/`). |
| `text-snapshot.ts`, `types.ts`, `index.ts` | Text snapshots, `VisualTestOptions` and `VisualTestResult`, public exports. |

## packages/create-frontguard-plugin

`src/index.ts` parses arguments and writes the project; `src/templates.ts` holds pure file
templates (`PluginSpec`, `GeneratedFile`). `npm test` builds first, because the tests run the
compiled bin.

## integrations

| Directory | Files | Responsibility |
| --- | --- | --- |
| `integrations/github-app` | `src/handler.ts` (`GitHubAppEnv`), `src/webhook.ts`, `src/github-api.ts`, `src/preview-url.ts` | Webhook signature checks and decisions, app JWT and installation tokens, Check Runs, bootstrap PR, preview-URL inference from deployment and status events. |
| `integrations/netlify` | `index.js`, `lib/core.js` | `onSuccess` lifecycle wiring; pure run, poll and PR-comment logic in `lib/core.js`. |
| `integrations/slack-app` | `src/handler.ts` (`SlackAppEnv`), `src/events.ts`, `src/oauth.ts`, `src/runs.ts`, `src/slack-api.ts`, `src/storage.ts`, `src/verify.ts` | Signed request verification, slash-command decisions, OAuth install, cloud run submission and `response_url` delivery, KV installs. |
| `integrations/vercel` | `src/handler.ts` (`HandlerEnv`), `src/install.ts`, `src/webhook.ts` | Install and OAuth callback, signed deployment webhooks, preview-URL allow-listing, run triggering. |

## apps

| Directory | Layout |
| --- | --- |
| `apps/web` | `src/routes/` (file-based routes: home, docs, pricing, comparisons, changelog, brand, status, privacy, terms), `src/components/` and `src/components/home/`, `src/lib/docs-content.ts` (every `/docs` article, `Article`), `src/lib/seo.ts`, `src/lib/schema-org.ts`, `src/test/`, `public/` (`llms.txt`, `agents.md`, `openapi.json`, sitemap), `scripts/check-doc-links.mjs`, `scripts/generate-sitemap.mjs`. |
| `apps/demo` | `app/` with `/`, `/pricing` and `/about`, plus `frontguard.config.ts`. |

## Design decisions

**Baselines are PNG files on an orphan branch.** `GitOrphanStorage` writes
`baselines/<route>/<viewport>/<browser>.png` (named capture modes add a `<mode>/` segment) on
`frontguard-baselines`, and `manifest.json` records each image's SHA-256. Main never carries
binary history, and every baseline change is its own commit. Writes require
`--confirm-baselines`, a human opt-in that judge mode and model output cannot supply
(`cli/baseline-confirm.ts`). Details: [baselines.md](baselines.md).

**Pixels decide pass or fail.** pixelmatch, with the SSIM override for borderline diffs, is the
only gate. Model output is advisory: a page under test could carry prompt-injection text, so a
classification cannot turn a red run green. [judge-protocol.md](judge-protocol.md) covers the
experimental judge mode under the same rule.

**AI is optional and bring-your-own-key.** `AIConfig` selects OpenAI, Anthropic or Gemini, with a
custom `baseUrl` for compatible endpoints or proxies. Keys come from environment variables and are
redacted from logs and reports (`utils/redact.ts`). Without AI the CLI still discovers, renders,
compares and reports. Every model call goes through `diff/ai-provider.ts`: requests to the
providers' own APIs ask for schema-constrained JSON, `ai.maxCalls` caps calls per run, and the JSON
report's `aiUsage` records each call. `npm run eval:ai --workspace=packages/cli` scores a provider
and model.

**Plugins hook into seven lifecycle points.** `FrontguardPlugin` defines `beforeDiscover`,
`afterDiscover`, `beforeRender`, `afterRender`, `afterCompare`, `afterRun` and `onError`, plus
`setup` and `teardown`. `PluginManager` runs a hook across plugins in registration order and
passes each return value to the next plugin; teardown runs in reverse. Six plugins ship in
`src/plugins`: accessibility (axe-core), Figma comparison, production monitoring,
performance budgets, text snapshots and third-party script inventory. Others install from npm as
`frontguard-plugin-<name>` (`core/plugin-registry.ts`).

**Filesystem discovery covers four frameworks.** `discovery/filesystem.ts` reads Next.js (App
Router and Pages Router), Remix, SvelteKit and Nuxt route files and skips dynamic segments.
Anything else falls back to the crawler, a story index or configured routes. `frontguard init`
recognizes more frameworks by dependency (`templates/index.ts`), but only to prefill the dev
command and port.

**One stage failing does not stop the run.** Discovery falls back to `/`, the filter falls back
to every route, and a failed shot becomes an error result while the rest are compared. An
unreachable base URL is reported once (`UnreachableBaseUrlError`).

**Rendering can be pinned.** `--docker` re-runs the CLI inside the pinned `frontguard/render`
image (`render/docker.ts`), and the renderer fingerprint on each baseline flags captures from a
different browser or platform. `fingerprint: 'strict'` exits 2 on a mismatch.

## Security

- Secrets are redacted from logs, errors and reports (`utils/redact.ts`).
- With `redactSensitive`, password, card and one-time-code fields, and elements marked
  `data-frontguard-redact`, are masked before capture (`render/redaction.ts`).
- Untrusted page text sent to a model is fenced and labelled as data (`wrapUntrusted` in `diff/ai-provider.ts`).
- The cloud API and the Slack and Vercel integrations refuse private and loopback render targets
  (`packages/cloud-api/src/security/render-target.ts`).
