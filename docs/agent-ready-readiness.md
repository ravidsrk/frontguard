# Agent-Ready Readiness (2026-06-21)

Run complete. KIND=BOTH (WEB + MCP + API). BASE = `ravidsrk/agent-ready`. Every deliverable was built (@codex), independently build-blind validated (fresh @claude), and merged CI-green. All 7 deliverables CLOSED; 3 checks NA-excluded.

## Deliverables — status + validation

| ID  | Layer    | Deliverable                                                 | PR        | Validation result                                                                                                                                                                                                                                 |
| --- | -------- | ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | L1/L2/L5 | `apps/web/public/agents.md` (agent task-routing guide)      | #144      | Resolves at /agents.md; names the 4 MCP tools + the gated /v1/\* surface + the MCP→API mapping + the representative task; declares FRONTGUARD_API_URL=https://api.frontguard.dev. Reviewer swept for internal routes — none exposed.              |
| D2  | L1       | `apps/web/public/.well-known/mcp.json` (+ README URL fix)   | #145      | Valid JSON; 4 tool names match `packages/mcp/src/index.ts` exactly (reviewer mutation-tested the sync guard); names @frontguard/mcp + api.frontguard.dev.                                                                                         |
| D3  | L3/L4    | `apps/web/public/openapi.json` (OpenAPI 3.1, cloud-api)     | #148      | Validates as OpenAPI 3.1.0 (@readme/openapi-parser); 29 paths, zero drift vs the real Hono routes; bearerAuth + error shape + 400/401/402/403/404/429/503 + X-RateLimit-\* headers; internal /auth,/v1/billing,/v1/keys,bare /dashboard EXCLUDED. |
| D4  | L1/L2    | JSON-LD on docs/comparisons/changelog/brand/docs-$ routes   | #146      | Valid schema.org (TechArticle/BreadcrumbList/CollectionPage/Organization) from real data via the existing seo-head pattern; each route's JSON-LD parses.                                                                                          |
| D5  | L4       | MCP `outputSchema` + `structuredContent` on the 4 tools     | #147      | Each tool declares a faithful outputSchema + returns structuredContent (back-compat text kept); SDK validates structuredContent against outputSchema; tests green on Node 26.                                                                     |
| D6  | L1       | Cross-link `llms.txt`/`llms-full.txt` to the agent surfaces | #149      | llms.txt links /agents.md, /openapi.json, /.well-known/mcp.json; all 3 targets exist (links resolve); no internal path leaked.                                                                                                                    |
| D7  | L1/L5    | Declare the hosted API URL for MCP onboarding               | #144/#145 | FRONTGUARD_API_URL=https://api.frontguard.dev in agents.md + mcp.json + packages/mcp/README.md (placeholder replaced).                                                                                                                            |

## NA-excluded (genuine, not faked)

- WEB L3 auth: apps/web is a static public marketing/docs site — nothing to gate (robots Allow:/ correct).
- MCP L3 OpenAPI security schemes: the MCP server authenticates via an env API key over stdio, not HTTP; the REST bearer scheme is D3; structured MissingApiKey/Url/CloudApiError already signal MCP auth.
- L4 "manifest matches tools" as a code defect: the live tools/list already matched src/index.ts; staying in sync is enforced by D2's test.

## End-to-end agent traversal (verified)

1. DISCOVER — `/llms.txt` links `/agents.md`, `/openapi.json`, `/.well-known/mcp.json` (3/3 present).
2. UNDERSTAND — `/agents.md` names the 4 tools (recent_runs, list_regressions, get_suggested_fix, accept_baseline) + `https://api.frontguard.dev`, and states reads+writes need a Bearer key.
3. AUTHENTICATE — `openapi.json` declares `bearerAuth`; `.well-known/mcp.json` lists the 4 tools + the env-key onboarding.
4. USE — `openapi.json` validates as OpenAPI 3.1.0 (real validator), 29 paths, **0 internal routes leaked**; the representative task (`list_regressions` → `get_suggested_fix` → review → `accept_baseline`) is documented and the tools return schema-conformant structuredContent.

## Self-assessment per layer

- L1 Discovery: STRONG — llms.txt/full + agents.md + .well-known/mcp.json + openapi.json + sitemap/robots + JSON-LD on every web route.
- L2 Identity: STRONG — machine-readable product description in llms.txt + JSON-LD; agents.md states value prop + actions + limits.
- L3 Auth & Access: GOOD — bearer scheme + rate-limit + error shapes documented in openapi; reads-open(only /health)/writes-gated faithful; internal surface excluded.
- L4 Integration: STRONG — valid OpenAPI matching the real routes; MCP tools return declared structuredContent.
- L5 UX: GOOD — agents.md routes task→tool/endpoint, cheap-path/review-first guidance, no dead links in the agent surface.

## Public-surface safety

Confirmed across every artifact: NO internal/admin path (/auth, the session /dashboard, /v1/billing, /v1/keys) and NO secret (placeholder keys only) is published. Reads-open/writes-gated is faithful to the real access model (only GET /health is unauthenticated).

## Human-owned follow-ups (NOT done)

- Deploy apps/web so the files are LIVE (only then do agents/ora see them); the openapi can also be served at `api.frontguard.dev/openapi.json` (a worker route) if desired.
- Promote BASE → main (the meta-PR). NOT done.
- Optionally scan the live site with ora.ai for the external agent-readiness score.
- Remove the temporary `ci.yml` trigger entry for `ravidsrk/agent-ready` at BASE→main (or keep it harmlessly).
