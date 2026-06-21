# Agent-readiness audit

Read-only audit of Frontguard against the five agent-readiness layers, KIND=BOTH (WEB + MCP + API).

Scope of the three surfaces:

- WEB: `apps/web` (TanStack Router). Files in `apps/web/public/` are served at the site root, e.g. `apps/web/public/llms.txt` is served at `https://frontguard.dev/llms.txt`.
- MCP: `packages/mcp` (`@modelcontextprotocol/sdk`, stdio). Tools registered in `packages/mcp/src/index.ts`.
- API: `packages/cloud-api` (Hono Worker, deployed at `api.frontguard.dev` per `packages/cloud-api/wrangler.toml`). Routes in `packages/cloud-api/src/index.ts` and `src/routes/{auth,billing,dashboard,keys,monitors,screenshots,teams}.ts`.

Method: static read of the source. No endpoint was hit live (Node 26 in this worktree cannot full-install). Every "exists" and "missing" below cites a file path. Acceptance for each gap states what "validates and an agent can use it" means.

## Summary

Frontguard is further along than most pre-agent codebases. The MCP server is well-formed (four tools, titled and disambiguated, structured auth errors). The web SEO layer is strong (per-route canonical, Open Graph, Twitter, two JSON-LD blocks). The gaps cluster in two places: machine-readable contracts (no `openapi.json` anywhere; MCP tools emit JSON stringified into a text block rather than declared `structuredContent`) and agent discovery (`agents.md` and `.well-known/mcp.json` both absent).

Deliverables identified: 7. Genuinely-not-applicable checks: 3 (listed at the end).

Faithfulness note on access: the cloud-api is almost entirely gated. Only `GET /health` is open. `/auth/*`, `/dashboard/*`, `/v1/billing/*`, and `/v1/keys` are internal surfaces (browser OAuth, Stripe, session-cookie UI, key bootstrap). This audit documents that model as-is and never proposes widening read access or exposing internal routes.

| #   | Deliverable                                                     | Layer(s)   | Public path                                                                         | Source to derive from                                                                               | Acceptance                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `agents.md`                                                     | L1, L2, L5 | `apps/web/public/agents.md` -> `/agents.md`                                         | `README.md`, MCP tool defs in `packages/mcp/src/index.ts`, real `/v1/*` routes                      | Resolves at `/agents.md`; every task->tool/endpoint link resolves; an agent can complete the "what regressed on PR N, and the fix" task by following it                                                                                     |
| D2  | `.well-known/mcp.json`                                          | L1         | `apps/web/public/.well-known/mcp.json` -> `/.well-known/mcp.json`                   | `packages/mcp/src/index.ts` (name, version, four tools), npm package `@frontguard/mcp`              | Valid JSON; names the npm package and `api.frontguard.dev`; lists the four tool names; an agent can discover the server from the domain                                                                                                     |
| D3  | `openapi.json`                                                  | L3, L4     | `api.frontguard.dev/openapi.json` (and mirror at `apps/web/public/openapi.json`)    | `packages/cloud-api/src/index.ts` + `src/routes/*.ts` + the zod `runRequestSchema`                  | Validates as OpenAPI 3.1; paths/methods/status codes match the real Hono routes; `bearerAuth` scheme declared; internal `/auth`,`/dashboard`,`/v1/billing`,`/v1/keys` excluded or marked `x-internal`; error shape `{error,...}` documented |
| D4  | JSON-LD on the remaining web routes                             | L1, L2     | `apps/web/src/routes/{docs.tsx,comparisons.tsx,changelog.tsx,brand.tsx,docs/$.tsx}` | Existing `extraMeta`/`scripts` JSON-LD pattern in `index.tsx`/`pricing.tsx`, plus `docs-content.ts` | Each route emits schema.org JSON-LD (TechArticle / BreadcrumbList / Organization) that passes a structured-data validator                                                                                                                   |
| D5  | MCP `outputSchema` + `structuredContent`                        | L4         | `packages/mcp/src/index.ts`, `src/tools/*.ts`                                       | Existing TS result interfaces (`ListRegressionsResult`, `RegressionRow`, `CloudSuggestedFix`)       | Each `registerTool` declares an `outputSchema`; calls return `structuredContent` that validates against it; a client consumes typed results without parsing the text block                                                                  |
| D6  | Cross-link the agent surfaces from `llms.txt` / `llms-full.txt` | L1         | `apps/web/public/llms.txt`, `apps/web/public/llms-full.txt`                         | The new D1/D2/D3 paths                                                                              | `llms.txt` lists `/agents.md`, `/openapi.json`, `/.well-known/mcp.json`; the links resolve                                                                                                                                                  |
| D7  | Declare the hosted cloud-api base URL for MCP onboarding        | L1, L5     | `packages/mcp/README.md`, `/.well-known/mcp.json`, `/agents.md`                     | `packages/cloud-api/wrangler.toml` route `api.frontguard.dev/*`                                     | An agent configuring `@frontguard/mcp` can find `FRONTGUARD_API_URL=https://api.frontguard.dev` without guessing; the README placeholder `https://your-cloud-api.example.com` is replaced or augmented                                      |

## L1 Discovery

WEB, what exists:

- `apps/web/public/llms.txt` is present and is a concise routing index. It lists Home, Pricing, Comparisons, Changelog, Brand, Docs (states "37 articles at `/docs/<slug>`"), GitHub, npm, and validation results, each with a one-line description, then "What Frontguard Does", install snippets, author, and license. Accurate against the routes.
- `apps/web/public/llms-full.txt` is present (9 KB) with the long form: Key Pages, What it does, Installation, Configuration, Environment variables, Pricing, Comparison, CI/CD examples, MCP server, Self-host, FAQ, Links.
- `apps/web/public/sitemap.xml` is present with 43 URLs: 6 marketing routes plus 37 docs slugs. The 37 docs slugs were checked against the 37 `id` entries in `apps/web/src/lib/docs-content.ts` and match exactly, so every sitemap docs URL resolves through the `/docs/$` catch-all in `apps/web/src/routes/docs/$.tsx`. No dead links.
- `apps/web/public/robots.txt` is present, allows all, and points at the sitemap. Correct for a public marketing site.
- `<title>` / meta / canonical: handled per-route by `buildSeoHead` in `apps/web/src/lib/seo.ts` (title, description, canonical link, Open Graph, Twitter card). `__root.tsx` supplies charset, viewport, theme-color, author, keywords, referrer, and `X-Content-Type-Options`. Correct and present on every route.
- JSON-LD: `SoftwareApplication` with two `Offer` entries on `/` (`apps/web/src/routes/index.tsx`); `FAQPage` on `/pricing` (`apps/web/src/routes/pricing.tsx`).

WEB, gaps:

| Gap                                                                                         | Deliverable | Path                                        | Source                                             | Acceptance                                                                  |
| ------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| No `agents.md` for agent task routing                                                       | D1          | `apps/web/public/agents.md` -> `/agents.md` | `README.md`, MCP tools, `/v1/*` routes             | Resolves; task->tool links resolve; agent completes the representative task |
| No `.well-known/mcp.json` pointing at the MCP server                                        | D2          | `apps/web/public/.well-known/mcp.json`      | `packages/mcp/src/index.ts`, npm `@frontguard/mcp` | Valid JSON; names the server and `api.frontguard.dev`; lists the four tools |
| `llms.txt` does not point to the agent surfaces (`agents.md`, `openapi.json`, MCP manifest) | D6          | `apps/web/public/llms.txt`, `llms-full.txt` | the D1/D2/D3 paths                                 | The three links are present and resolve                                     |

MCP, what exists:

- The server sets `instructions` in `createServer()` (`packages/mcp/src/index.ts`) stating its purpose and giving per-tool guidance. The four tools each have a `title`, a `description`, and a zod `inputSchema` with `.describe()` on every field. So an in-IDE client's `tools/list` returns a clear, self-describing catalog.

MCP, gaps:

| Gap                                                                                                                                                                                                                                                   | Deliverable | Path                                                            | Source                      | Acceptance                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| No machine-readable discovery manifest; discovery is only the npm README + the `docs/integrations/mcp` article                                                                                                                                        | D2          | `apps/web/public/.well-known/mcp.json`                          | `packages/mcp/src/index.ts` | Valid JSON manifest mapping the published server to its four tools              |
| Hosted endpoint not declared for onboarding: `FRONTGUARD_API_URL` has no default (`packages/mcp/src/auth.ts`) and the README uses placeholder `https://your-cloud-api.example.com`, while the real endpoint is `api.frontguard.dev` (`wrangler.toml`) | D7          | `packages/mcp/README.md`, `/.well-known/mcp.json`, `/agents.md` | `wrangler.toml` route       | An agent finds `FRONTGUARD_API_URL=https://api.frontguard.dev` without guessing |

## L2 Identity

WEB / API, what exists:

- Machine-readable product description is solid: `llms.txt` plus the `SoftwareApplication` JSON-LD (`apps/web/src/routes/index.tsx`) declare the value proposition (AI visual regression testing), the offers (Free CLI $0 MIT, Pro $29), the license, the repo, and the author. `llms-full.txt` adds supported actions (install, configure, run, CI/CD, MCP, self-host) and limits (env vars, data retention).
- An "about" surface exists via `/` and `/brand` and the docs index article.

MCP, what exists:

- Each tool description disambiguates from its siblings. `accept_baseline` explicitly says "run-scoped, not per-diff" and requires `confirm_all_regressions_reviewed: true` after reviewing `list_regressions`; `get_suggested_fix` is keyed by the `diffId` that `list_regressions` returns; `recent_runs` is the history browser. The server `instructions` string states the purpose and the limits (review before accepting).

L2 gaps:

| Gap                                                                                                                                                       | Deliverable | Path                                                                                | Source                                                                                     | Acceptance                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| JSON-LD identity is only on `/` and `/pricing`; `/docs`, `/comparisons`, `/changelog`, `/brand`, and per-article `/docs/$` pages carry no structured data | D4          | `apps/web/src/routes/{docs.tsx,comparisons.tsx,changelog.tsx,brand.tsx,docs/$.tsx}` | the `index.tsx`/`pricing.tsx` JSON-LD pattern + `docs-content.ts`                          | Each route emits valid schema.org JSON-LD that passes a validator                            |
| No single agent-facing statement of "value prop + supported actions + auth/limits" in one place an agent reads first                                      | D1          | `apps/web/public/agents.md`                                                         | `README.md`, plans in `packages/cloud-api/src/billing/plans.ts`, limits in `src/limits.ts` | `agents.md` states value prop, the callable actions, and the auth/limit model; links resolve |

## L3 Auth and access

API, faithful route inventory (from `packages/cloud-api/src/index.ts` and the route files):

Public, no key:

- `GET /health` -> `{status, version}` (`src/index.ts`, mounted outside `/v1`).

Internal surfaces (browser OAuth, Stripe, session UI, key bootstrap) - not agent-facing, must not be exposed in an agent surface:

- `GET /auth/github`, `GET /auth/github/callback` (`src/routes/auth.ts`) - GitHub OAuth browser flow.
- `/dashboard`, `/dashboard/*` (`src/routes/dashboard.ts`, `sessionDashboardRoutes`) - session-cookie browser UI, guarded by `requireDashboardSecret` (fails closed in production without `DASHBOARD_SESSION_SECRET`).
- `POST /v1/billing/webhook` (Stripe signature, no bearer), `POST /v1/billing/checkout`, `GET /v1/billing/usage` (bearer) (`src/routes/billing.ts`).
- `GET/POST/DELETE /v1/keys` (`src/routes/keys.ts`) - bearer-authed key management/bootstrap.

Gated read/write, the agent and CI surface (all require `Authorization: Bearer <key>` via the `/v1/*` middleware in `src/index.ts`):

- `POST /v1/run` (write: submit a run; zod-validated; render-target SSRF guard; plan/quota reservation).
- `GET /v1/runs`, `GET /v1/runs/:id` (read), `DELETE /v1/runs/:id` (write).
- `GET /v1/reports/:id` (read, HTML).
- `POST /v1/baselines/:runId/approve` (write).
- `GET /v1/usage` (read).
- `/v1/screenshots/:runId`, `/v1/screenshots/:runId/:id/raw` (read; `ownsRun` guard).
- `/v1/monitors` CRUD plus `/:id/runs`, `/:id/test-alert`, `/:id/snooze` (read/write; per-user ownership check).
- `/v1/dashboard` (read, JSON for API-key callers).
- `/v1/teams` CRUD plus invitations, members, projects, baseline, activity, usage (read/write; capability checks via `requireCap`).

Auth and access facts that an agent needs and that exist in code but are undocumented for machines:

- Scheme: bearer token on all `/v1/*`; `401 {"error":"Missing API key"}` / `401 {"error":"Invalid API key"}`.
- Rate limits: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on every `/v1/*` response; `429 {"error":"Rate limit exceeded. Try again later."}` on exceed (`src/index.ts`, `src/rate-limit.ts`).
- Error shape: consistently `{error: string, ...extras}` with status codes 400 (validation, with `details` field errors), 402 (quota, with `limit`/`current`/`upgradeUrl`), 403 (team membership), 404, 429, 503 (misconfigured). CORS limited to `frontguard.dev` + localhost; global security headers.

API gaps:

| Gap                                                                                                                                      | Deliverable | Path                                                               | Source                                                | Acceptance                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `openapi.json`: the bearer scheme, rate-limit headers, and error shapes live only in code, so no machine can read the access contract | D3          | `api.frontguard.dev/openapi.json` + `apps/web/public/openapi.json` | `src/index.ts`, `src/routes/*.ts`, `runRequestSchema` | Validates as OpenAPI 3.1; `bearerAuth` declared; the gated `/v1/*` surface documented with status codes; internal routes excluded or `x-internal`; rate-limit headers and `{error}` shape captured |

MCP, what exists:

- Verification/auth is explicit and lazy: `requireAuth` (`packages/mcp/src/auth.ts`) reads `FRONTGUARD_API_KEY` and `FRONTGUARD_API_URL` from the environment. The server starts and lists tools without a key, then on the first tool call returns a structured error.
- Structured auth errors: `MissingApiKeyError` and `MissingApiUrlError` are surfaced as `isError: true` tool results with human-readable, actionable messages (the `toolError` path in `src/index.ts`); `CloudApiError` carries the HTTP status through.

MCP L3 gap: none beyond D7 (the hosted URL not being declared makes the auth flow harder to complete, not unsafe). OpenAPI security schemes do not apply to the stdio MCP transport (see NA list).

## L4 Integration

API:

- There is no `openapi.json` in the repo (`find -iname '*openapi*'` returns nothing; no `openapi` reference in `packages/cloud-api/src`). This is the central L4 gap. The spec must be generated from the real Hono routes, not hand-waved: the route inventory in L3 above is the source of truth. Deliverable D3.

MCP:

- Tools return structured objects (e.g. `ListRegressionsResult` with `count`, `runId`, `regressions[]` of typed `RegressionRow`; `CloudSuggestedFix` with `fixType`/`patch`/`confidence`). However `withCloudClient` in `src/index.ts` serializes them with `JSON.stringify(data, null, 2)` into a single `text` content block. No tool declares an `outputSchema`, and none returns `structuredContent` (`grep outputSchema|structuredContent` over `packages/mcp/src` returns nothing). So results are schema-shaped JSON but the contract is not declared, and a strict MCP client cannot validate them. Deliverable D5.
- The MCP-to-API mapping is faithful and worth recording in the manifest/agents.md: `recent_runs` -> `GET /v1/runs`; `list_regressions` -> `GET /v1/runs` (filter) or `GET /v1/runs/:id`; `get_suggested_fix` -> reads `suggestedFix` from `GET /v1/runs/:id`; `accept_baseline` -> `POST /v1/baselines/:runId/approve` (all via `packages/mcp/src/client/cloud.ts`).

| Gap                                                             | Deliverable | Path                                          | Source                            | Acceptance                                                                        |
| --------------------------------------------------------------- | ----------- | --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| No OpenAPI spec for the REST API                                | D3          | `api.frontguard.dev/openapi.json`             | `src/index.ts`, `src/routes/*.ts` | Validates; matches the real routes; endpoint responds with the documented shape   |
| MCP tools return JSON-in-text, not declared `structuredContent` | D5          | `packages/mcp/src/index.ts`, `src/tools/*.ts` | the existing TS result interfaces | `outputSchema` declared per tool; calls return `structuredContent` that validates |

## L5 UX

What exists:

- A representative end-to-end task is already completable through MCP today: "On PR 42, what regressed and how do I fix it?" -> `list_regressions({pr_id: 42})` -> `get_suggested_fix({diffId})` -> human review -> `accept_baseline({run_id, confirm_all_regressions_reviewed: true})`. The tools are callable and the descriptions route the agent correctly between them.
- Cheap-path-first guidance exists in spots: the product's "pixel gate before AI" is described in `llms.txt`, and the MCP `instructions` tell the agent to review every regression before `accept_baseline`.
- No dead links in the agent surface: `llms.txt` links resolve (marketing routes exist; the 37 docs slugs were verified against `docs-content.ts`).

Gaps:

| Gap                                                                                                                                                                               | Deliverable | Path                                                            | Source                        | Acceptance                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The representative task is not written down in one agent-facing routing doc; the read-before-write ordering (`recent_runs`/`list_regressions` then `accept_baseline`) is implicit | D1          | `apps/web/public/agents.md`                                     | MCP tool defs, `/v1/*` routes | `agents.md` maps task -> tool/endpoint, puts the cheap read path first, and links resolve; an agent completes the task by following it |
| Onboarding dead-end: an agent that installs `@frontguard/mcp` cannot reach the hosted cloud because the base URL is never stated where it looks                                   | D7          | `packages/mcp/README.md`, `/.well-known/mcp.json`, `/agents.md` | `wrangler.toml`               | The hosted `FRONTGUARD_API_URL` is discoverable; the representative task runs end to end against the hosted API                        |

## NA-excluded

- L3 auth/access for WEB: NA-excluded (apps/web is a static public marketing and docs site with no user auth; there is nothing to gate, and `robots.txt` `Allow: /` is correct for it).
- L3 OpenAPI security schemes for MCP: NA-excluded (the MCP server authenticates with an environment-variable API key over the stdio transport, not over HTTP; the REST-side bearer scheme is covered by D3, and the structured `MissingApiKeyError`/`MissingApiUrlError`/`CloudApiError` results already cover MCP auth signaling).
- L4 "manifest matches actual tools" as a code defect: NA-excluded (the live `tools/list` already matches `src/index.ts` exactly; keeping a future `.well-known/mcp.json` in sync is an authoring concern, folded into D2, not a current code gap).
