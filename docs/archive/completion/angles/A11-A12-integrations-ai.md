# A11–A12 — Integrations and AI layer

Static-only audit. Scores capped at 1 (code exists; no live provider/marketplace/DNS observation).

## Angle 11 — Third-party integrations

**Score: 1/4 · RAG: R**
**Score justification:** Four `integrations/*` workspaces, GitHub Action, Figma plugin, Stripe/Resend/PagerDuty/OTEL/Daytona/Cloudflare, and npm publish surfaces all exist in source with HMAC fail-closed handlers and READMEs that admit marketplace listings are “in review.” None of the live provider accounts, DNS hosts, or marketplace URLs were probed.
**Dynamic proof needed to justify a higher score:**
```
npm view @frontguard/netlify-plugin version
host api.frontguard.dev; host github-app.frontguard.dev; host slack.frontguard.dev; host telemetry.frontguard.dev
curl -sfI https://github.com/marketplace/frontguard; curl -sfI https://vercel.com/integrations/frontguard
# human: confirm GitHub App, Slack app, Vercel integration, Netlify plugin listing, Cloudflare zone, Stripe, Resend, Daytona orgs exist
```

### Provider inventory

| Provider | Where configured | Env / secrets | Account owner | Quota | Failure handling | Webhook verify | Sandbox vs prod |
|---|---|---|---|---|---|---|---|
| OpenAI (vision) | CLI `ai.provider:'openai'`; Playwright plugin; cloud compose (unused — see F-12-04) | CLI: `FRONTGUARD_OPENAI_KEY`. Playwright also `OPENAI_API_KEY`. Compose: `OPENAI_API_KEY` | Customer BYOK. No product key in repo | None in product; provider account limits | CLI retries 429/5xx ×3 then marks that diff `status:'error'` (`pipeline.ts:748-771`). Playwright swallows errors | n/a | None. No OpenAI org/project split documented |
| Anthropic (vision) | `ai.provider:'anthropic'` | `FRONTGUARD_ANTHROPIC_KEY`; Playwright also `ANTHROPIC_API_KEY` | Customer BYOK | Same | Same as OpenAI (`anthropic-version: 2023-06-01`) | n/a | None |
| GitHub | `integrations/github-app` Worker; root `action.yml`; cloud OAuth (`GITHUB_CLIENT_*`); PR reporter | `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `FRONTGUARD_CALLBACK_SECRET`, `GITHUB_TOKEN` | GitHub user `ravidsrk` (repo). App listing not live | Undocumented | Fail-closed if webhook secret missing (`handler.ts:138-139` → 500) | HMAC-SHA256 `x-hub-signature-256` (`webhook.ts:53-71`) | No GitHub App sandbox. Preview-URL cache is **in-memory per isolate** (`handler.ts:74`) |
| Slack | `integrations/slack-app` Worker | `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_SCOPES`, KV `SLACK_TEAMS` | Undocumented. HUMAN ACTION | Undocumented | Fail-closed missing signing secret (`handler.ts:94,124`). OAuth CSRF cookie (`handler.ts:220-225`) | HMAC-SHA256 `v0:` + 300s replay (`verify.ts:37-62`) | KV id is `REPLACE_WITH_KV_NAMESPACE_ID` (`wrangler.toml:19`). `app_mention` subscribed (`manifest.yml:50`) but events handler only acks (`handler.ts:113-114`) |
| Vercel | `integrations/vercel` Hono (`vercel.json`) | `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_REDIRECT_URI` | Undocumented. HUMAN ACTION | Undocumented | Fail-closed missing secret (`handler.ts:205-206`). Idempotency via KV 24h | HMAC-SHA1 `x-vercel-signature` (`webhook.ts:73-90`) | No sandbox integration. Custom-domain previews need KV install record |
| Netlify | `@frontguard/netlify-plugin` (`private: false`) | `FRONTGUARD_API_URL` (required), `FRONTGUARD_API_KEY`, optional `GITHUB_TOKEN`; Netlify `CONTEXT`/`DEPLOY_*` | Undocumented | n/a | Skip if no CONTEXT / no key / production unless `productionToo` | None — build plugin, not a webhook | Production deploys skipped by default (`manifest.yml:22-24`) |
| Figma | `packages/cli/src/plugins/figma.ts` | `FIGMA_ACCESS_TOKEN` or `FigmaConfig.accessToken` | Customer PAT. HUMAN ACTION to mint | Figma Images API | Plugin no-ops with warn if token missing (`figma.ts:237-241`) | n/a | None |
| npm registry | `publishConfig` on cli/playwright/mcp/netlify-plugin | `NPM_TOKEN` (release workflow) | `ravidsrk` / `ravidsrk@gmail.com` | n/a | n/a | n/a | Provenance enabled on public packages |
| Cloudflare | Workers + D1 + R2 + KV + DNS | wrangler secrets listed in each `wrangler.toml` | Undocumented CF account. HUMAN ACTION | CF plan limits | Placeholders `REPLACE_WITH_D1_DATABASE_ID` (`cloud-api/wrangler.toml:23`) | n/a | `ENVIRONMENT=production` in cloud-api wrangler; `wrangler dev` is the only documented local path |
| Daytona | CLI sandbox + cloud runner | `DAYTONA_API_KEY` | Undocumented. HUMAN ACTION | Compute billed to that org | CLI falls back to local sandbox (`verify-fix.ts:90-101`) | n/a | Snapshot name `frontguard-playwright-v1` (`daytona-runner.ts:98`) — publish is a separate script |
| Stripe | `packages/cloud-api/src/routes/billing.ts` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | Undocumented. HUMAN ACTION | n/a | Webhook 503 if secret unset (`billing.ts:92-95`) | Stripe-Signature | Tests use `sk_test`; no live/test key policy in wrangler |
| Resend | alerts + team invites | `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Undocumented | n/a | Skip `{ok:false}` if unset | n/a | None |
| PagerDuty | monitor `alerts.pagerduty` routing key | customer routing key in monitor record | Customer | n/a | HTTP status captured (`alerts/index.ts:230-238`) | n/a | None |
| OTLP | cloud-api `otel/` | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Operator | n/a | No-op if unset | n/a | None |
| CLI telemetry | `packages/cli/src/utils/telemetry.ts` | `FRONTGUARD_TELEMETRY=1`, `FRONTGUARD_TELEMETRY_ENDPOINT`, `DO_NOT_TRACK` | Default `https://telemetry.frontguard.dev/v1/events` (`telemetry.ts:19`) | n/a | 1.5s timeout, silent fail | n/a | **Disabled by default.** Hosted collector not verified here |
| S3 / R2 upload | `imageUpload` config | `FRONTGUARD_S3_ACCESS_KEY`, `FRONTGUARD_S3_SECRET_KEY` | Operator | n/a | Pipeline warns, continues (`pipeline.ts:928`) | n/a | None |
| Gemini | docker-compose / `FORWARDED_ENV_VARS` only | `FRONTGUARD_GEMINI_KEY` | n/a | n/a | **No provider implementation** (`aiConfigSchema` is `openai\|anthropic` only) | n/a | Dead env |

Also: GitHub Action (`action.yml:157-159`) forwards `FRONTGUARD_*_KEY` into CI; Action also sniffs Vercel/Netlify/Cloudflare Pages/Railway/Render preview URLs.

### Four `integrations/` workspaces — publishable / deployable

| Workspace | npm | Deploy | External registration (HUMAN ACTION) |
|---|---|---|---|
| `github-app` (`private: true`, v0.1.0) | No | Cloudflare Worker `wrangler.toml` → `github-app.frontguard.dev` | **1.** GitHub → New GitHub App from `integrations/github-app/manifest.yml` (hook URL must match Worker). **2.** `wrangler secret put` the six secrets in `wrangler.toml:32-40`. **3.** GitHub Marketplace listing — README says **in review**, no live URL (`publish-surface.test.ts` forbids `github.com/marketplace/frontguard`). **4.** Cloudflare custom domain + zone `frontguard.dev`. |
| `slack-app` (`private: true`, v0.2.1) | No | CF Worker | **1.** `wrangler kv:namespace create SLACK_TEAMS` and paste id over `REPLACE_WITH_KV_NAMESPACE_ID`. **2.** https://api.slack.com/apps → Create from `manifest.yml`. **3.** Put signing secret / client id / secret / redirect URI. **4.** Slack App Directory: `api.slack.com/apps/<APP_ID>/distribute` + public distribution review (README: 5–10 business days). |
| `vercel` (`private: true`, v0.1.0) | No | `vercel.json` Edge **or** a Worker (no wrangler.toml in-tree) | **1.** Vercel Integration Console (`vercel.com/dashboard/integrations/console`) — YAML is paste-ready, **not auto-ingested** (`manifest.yml:8-9`). **2.** Set `VERCEL_*` + `FRONTGUARD_*` env. **3.** Bind KV named `KV`. **4.** Marketplace listing **in review** (README). |
| `netlify` (`private: false`, v0.2.3) | **Yes** (`publishConfig.access: public`, provenance) | n/a — runs inside Netlify builds | **1.** `npm publish` `@frontguard/netlify-plugin`. **2.** Submit Netlify Build Plugins directory with `manifest.yml`. README: listing **in review**; until then install via `netlify.toml` only. |

### Findings

- **F-11-01** — All four marketplace listings are documented as “in review”; publish-surface tests **forbid** live marketplace URLs. A stranger cannot one-click install GitHub/Slack/Vercel/Netlify. Location: `integrations/*/README.md`, `*/test/publish-surface.*`. Impact: distribution of the integration line is blocked on human marketplace submissions.
- **F-11-02** — No documented owner/org for Slack, Vercel, Netlify, Cloudflare, Stripe, Resend, Daytona, or OpenAI/Anthropic product accounts — only GitHub `ravidsrk` / `ravidsrk@gmail.com`. Location: package.json `author`; DECISIONS.md GitHub identity. Impact: bus-factor and “who clicks Create App” are undefined.
- **F-11-03** — Slack KV and cloud D1 still ship placeholder IDs (`REPLACE_WITH_KV_NAMESPACE_ID`, `REPLACE_WITH_D1_DATABASE_ID`). Location: `integrations/slack-app/wrangler.toml:19`, `packages/cloud-api/wrangler.toml:23`. Impact: `wrangler deploy` cannot succeed until a human creates those resources.
- **F-11-04** — GitHub App `contents: write` + bootstrap PR on install (`handler.ts:146-184`, `manifest.yml:32`). Preview-URL cache is process-local (`handler.ts:74`). Impact: install can open PRs in customer repos; Check Runs stall across Worker isolates.
- **F-11-05** — `FRONTGUARD_GEMINI_KEY` is forwarded in Docker (`packages/cli/src/render/docker.ts:52`) but there is no Gemini provider. Impact: documented-looking env that does nothing.
- **F-11-06** — Cloud compose documents `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (`packages/cloud-api/docker-compose.yml:50-51`) while CLI runtime reads `FRONTGUARD_*_KEY` and `ProcessorEnv` only has `DAYTONA_API_KEY` (`processor.ts:14-16,49-57`). Impact: self-host compose AI keys cannot reach the sandbox.

### Notes

Netlify is the only integration that is actually npm-publishable. The other three are deployable Workers/Edge apps, not packages. No Sentry/Bugsnag/PostHog SDK in `packages/` or `integrations/`. Error tracking is logs + optional OTLP.

---

## Angle 12 — AI / LLM layer

**Score: 1/4 · RAG: R**
**Score justification:** Vision/fix/judge code, mocked unit tests, and a metrics module exist. The published validation run explicitly disabled AI. No live quality measurement, no pinned OpenAI snapshot, no screenshot PII redaction, no token spend cap.
**Dynamic proof needed to justify a higher score:**
```
# AI quality (needs a real key; do not commit output with secrets)
FRONTGUARD_OPENAI_KEY=… npx tsx packages/cli/scripts/validate-ai.ts
# Confirm validation artifact still says AI disabled:
rg -n "AI provider" validation/results-v0.2.md
# MCP tool catalog (after build; parent-owned):
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node packages/mcp/dist/index.js
```

### Provider / model pinning

- Providers: **OpenAI** (`https://api.openai.com/v1/chat/completions`) and **Anthropic** (`https://api.anthropic.com/v1/messages`). Schema: `provider: z.enum(["openai","anthropic"])` + required `model: z.string().min(1)` (`config.ts:47-49`). AI is **optional**; `frontguard init` scaffold omits `ai` (`config.ts:638-651`).
- **Not pinned to a snapshot for OpenAI.** Docs/examples/tests use floating `gpt-4o` (`README.md:149-150`, `types.ts:142`). Playwright default if `model` omitted: **`gpt-4o-mini`** (`packages/playwright/src/ai.ts:52`) — a **different** floating alias than the CLI examples.
- Anthropic examples/defaults: **`claude-sonnet-4-20250514`** (date-pinned) (`playwright/src/ai.ts:102`, tests).
- Cloud Daytona runner *can* inject `FRONTGUARD_OPENAI_KEY` (`daytona-runner.ts:120`) but `processRun` **never passes `openaiKey`** (`processor.ts:49-57`). Cloud AI path is unwired.

### Prompt versioning

Prompts are **inline string literals**, not versioned files, not hashed.

Representative: `packages/cli/src/diff/ai-vision.ts:56-85` (`SYSTEM_PROMPT` — classify `regression|intentional|content_update`). Also `FIX_SYSTEM_PROMPT` (`ai-fix.ts:33-54`), `HEURISTIC_PROMPT` / `FIGMA_PROMPT` (`model-judge.ts:33-78`), Playwright `SYSTEM_PROMPT` (`playwright/src/ai.ts:8-15`) with a **divergent** label set (`layout_shift|style_change`, severity `high|medium|low`).

Payload: downscaled PNGs (max width 800) + route/viewport/browser + pixel % + optional axe-core ids + optional git diff **capped at 4000 chars** (`ai-fix.ts:191-193`). No page HTML dump. `rawResponse` is kept on the in-memory `AIAnalysis` object (`ai-vision.ts:532`) but **JSON reports omit it** (`report/json.ts:141-148`).

### Eval / accuracy

**Confirmed reading of `validation/results-v0.2.md`:** run date 2026-06-20, CLI 0.2.0. **AI provider: none** — “no `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` configured” (line 33; those names are **not** what `ai-vision.ts:213` reads). Launch gate “Overall AI classification accuracy ≥ 70%” is **⏳ pending**. Limitations §: “AI classification accuracy. Requires … to exercise the vision model … only the live measurement is gated on credentials.” Pixel-only FP **0.0%** on 2/5 repos was measured; **true-positive rate was not**. Landing copy is supposed to withhold an AI accuracy number.

`src/diff/validation-metrics.ts` + `test/diff/validation-metrics.test.ts` compute confusion/F1 against labels; they do **not** call a model. `packages/cli/scripts/validate-ai.ts` is a synthetic 10-case harness. Checked-in `packages/cli/validation-results/synthetic-openai-*.json` show **50 / 50 / 60 / 70 / 100%** classification accuracy on those 10 cases — not CI-gated, not a frozen eval set, not the v0.2 external-repo run. `ai-vision.test.ts` mocks `fetch`; **no test asserts classification quality**.

### Guardrails

| Control | Status |
|---|---|
| Output schema | CLI parser validates classification/severity; invalid throws (`ai-vision.ts:489-509`). Playwright `JSON.parse` with no enum check |
| PII redaction **before** provider | **Absent.** `redact()` is for logs/keys (`utils/redact.ts`), not screenshot pixels or git-diff content. `docs/retention.md:38` states cloud does not do ingest-time PII redaction |
| Provider error fallback | Per-diff `error` if AI fails; stage catch logs and continues (`pipeline.ts:782-785`). No pixel-only reclassification fallback. Playwright returns `undefined` |
| Cost caps | **None** on CLI tokens. Batch size 5 (`pipeline.ts:60`). Cloud `evaluateSpendCap` is **screenshot/plan usage**, not LLM spend (`billing/spend-cap.ts`) |
| Retention of prompts/responses | Local reports store explanation/suggestedFix, not raw prompts. Cloud stores run JSON + R2 screenshots; no prompt log module |
| Tool-call sandboxing | Vision models return JSON only — **no tools**. AI CSS patches are not `eval`’d; verification injects `<style>` in a sandbox (`sandbox/local.ts` path) |

### MCP tool surface (`packages/mcp`)

stdio MCP server `@frontguard/mcp@0.2.3`. Four tools (`src/index.ts:56-102`):

| Tool | Effect |
|---|---|
| `list_regressions` | Read: GET `/v1/runs` |
| `recent_runs` | Read: GET `/v1/runs` |
| `get_suggested_fix` | Read: GET `/v1/runs/:id` |
| `accept_baseline` | **Write:** `POST /v1/baselines/:runId/approve` after `confirm_all_regressions_reviewed: true`. Records whole-run approval; **does not promote screenshots** (`accept-baseline.ts:1-4,45-51`) |

Auth: lazy `FRONTGUARD_API_KEY` + `FRONTGUARD_API_URL` on each tool call (`auth.ts:51-60`). No hosted default. **No filesystem, no shell, no arbitrary HTTP.** Sandbox = “whatever the cloud API key can do.” The MCP process itself is unsandboxed stdio in the user’s editor; the tool *surface* is cloud-API-scoped, not local FS. `get_suggested_fix` returns `fix: null` when the run has no `suggestedFix` (cloud path historically dropped this; processor now tries to plumb it — `processor.ts:71-74` — still unverified live).

### Findings

- **F-12-01** — v0.2 validation **did not measure AI**. `validation/results-v0.2.md:8,33,139,186-191`. Impact: “AI classification” is a product claim without a published accuracy number.
- **F-12-02** — OpenAI model is a floating alias (`gpt-4o` / Playwright `gpt-4o-mini`); prompts are unversioned literals. Location: `types.ts:142`, `playwright/src/ai.ts:52`. Impact: classifications can drift under the same config.
- **F-12-03** — Screenshots (and optional git diffs) go to OpenAI/Anthropic with **no PII/secret scrub of image or patch content**. Location: `ai-vision.ts:165-188`, `ai-fix.ts:191-193`, `retention.md:18-19,38`. Impact: BYOK still sends customer UI pixels to a third party.
- **F-12-04** — Cloud `processRun` never sets `openaiKey`; compose keys use the wrong names. Location: `processor.ts:14-16,49-57`, `docker-compose.yml:50-51`. Impact: hosted/self-host cloud runs cannot enable vision even when keys are present.
- **F-12-05** — Playwright AI taxonomy disagrees with CLI (`layout_shift` / `style_change`; silent failure). Location: `playwright/src/ai.ts:8-34`. Impact: two products, two classifiers.
- **F-12-06** — MCP `accept_baseline` is a mutating tool gated only by the API key in the editor env. Not FS/shell, but it can approve a run. Location: `tools/accept-baseline.ts:41-51`.

### Notes

CLI doctor now reads `FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY` (`doctor.ts:228-250`) — same names as `getApiKey`. `FRONTGUARD_GEMINI_KEY` remains a dangling forward. No eval CI job. Spend-cap emails (80%/95%) are plan-screenshot usage via Resend, not LLM cost.
