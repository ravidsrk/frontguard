# Agent-Ready Plan — frozen deliverables (2026-06-21)

From docs/agent-ready-audit.md. KIND=BOTH. BASE = ravidsrk/agent-ready. 7 deliverables (D1–D7) + 3 NA-excluded. Each PR: @codex build → fresh build-blind @claude review (validate independently) → merge → cleanup. Acceptance = the artifact VALIDATES and an agent can USE it (not "exists").

## WAVE 1 — independent files (parallel)

- **D1 agents.md** — `apps/web/public/agents.md` (→ `/agents.md`). L1/L2/L5. Derive from README + MCP tool defs + the real `/v1/*` routes. Agent task-routing guide: value prop, the callable surface (MCP tools + gated `/v1/*`), the auth/limit model, the MCP→API mapping (recent_runs→GET /v1/runs, list_regressions→GET /v1/runs, get_suggested_fix→GET /v1/runs/:id, accept_baseline→POST /v1/baselines/:runId/approve), and the representative task ("on PR N, what regressed and how to fix"). Folds in **D7**: `FRONTGUARD_API_URL=https://api.frontguard.dev`. ACCEPT: resolves at /agents.md; every task→tool/endpoint link resolves; no internal route (auth/billing/keys/dashboard) named as agent-facing.
- **D2 .well-known/mcp.json** — `apps/web/public/.well-known/mcp.json`. L1. Derive from `packages/mcp/src/index.ts` (name, version, the 4 tools) + npm `@frontguard/mcp` + `api.frontguard.dev`. Folds in **D7-README**: replace the `https://your-cloud-api.example.com` placeholder in `packages/mcp/README.md` with the real URL. ACCEPT: valid JSON; names the package + the 4 tool names + api.frontguard.dev; an agent discovers the server from the domain.
- **D3 openapi.json** — `apps/web/public/openapi.json` (mirror; served `api.frontguard.dev/openapi.json` is a human follow-up). L3/L4. Derive from the real Hono routes (`packages/cloud-api/src/index.ts` + `src/routes/*` + zod `runRequestSchema`). FAITHFUL: only the gated `/v1/*` agent/CI surface + `GET /health`; `bearerAuth` security scheme; rate-limit headers + `{error,...}` shape + status codes (400/401/402/403/404/429/503); internal `/auth`,`/dashboard`,`/v1/billing`,`/v1/keys` EXCLUDED (or `x-internal`). NO secrets, placeholder keys. ACCEPT: validates as OpenAPI 3.1 (real validator); paths/methods/codes match the real routes; no internal route exposed.
- **D4 JSON-LD on the remaining web routes** — `apps/web/src/routes/{docs.tsx,comparisons.tsx,changelog.tsx,brand.tsx,docs/$.tsx}`. L1/L2. Follow the existing `index.tsx`/`pricing.tsx` JSON-LD pattern + `docs-content.ts`. schema.org (TechArticle/BreadcrumbList/Organization). ACCEPT: each route emits valid JSON-LD that passes a structured-data validator.
- **D5 MCP outputSchema + structuredContent** — `packages/mcp/src/index.ts` (+ `src/tools/*`). L4. Derive from the existing result interfaces (ListRegressionsResult, RegressionRow, CloudSuggestedFix). Each `registerTool` declares an `outputSchema`; calls return `structuredContent` validating against it (keep the text block for back-compat). ACCEPT: a strict MCP client validates typed results; outputSchema matches the returned shape.

## WAVE 2 — cross-link (after D1/D2/D3 land)

- **D6 cross-link llms.txt** — `apps/web/public/llms.txt` + `llms-full.txt`. L1. Add links to `/agents.md`, `/openapi.json`, `/.well-known/mcp.json` (the D1/D2/D3 paths). ACCEPT: the 3 links present and resolve.

## NA-excluded (from audit — genuine, not faked)

- WEB L3 auth: NA — apps/web is a static public marketing/docs site, nothing to gate (robots Allow:/ correct).
- MCP L3 OpenAPI security schemes: NA — MCP authenticates via env API key over stdio, not HTTP; REST bearer is D3; structured MissingApiKey/Url/CloudApiError already signal MCP auth.
- L4 "manifest matches tools" as a code defect: NA — live tools/list already matches src/index.ts; keeping .well-known/mcp.json in sync is folded into D2.

## Hot files / serialization

Independent (parallel): D1, D2, D3, D4, D5 touch disjoint files. D6 depends on D1/D2/D3 paths → WAVE 2. The MCP tool registry (`packages/mcp/src/index.ts`, D5) and cloud-api routes (read by D3) are the only "hot" areas — but D3 only READS routes (writes a new file) and D5 is the sole writer of index.ts, so no in-flight conflict.

## T_FINAL — VERIFY

Validation suite (each artifact validates against its schema; llms.txt/agents.md links resolve; openapi matches real routes; MCP client lists+calls the 4 tools and gets schema-conformant structuredContent), the end-to-end agent traversal (find via llms.txt→agents.md→the right tool/endpoint→complete the representative task), public-surface-safety confirmation (no internal route/secret in any artifact). Output docs/agent-ready-readiness.md. Human-owned (NOT done): deploy the files (live for agents/ora), BASE→main, serving openapi.json at api.frontguard.dev.
