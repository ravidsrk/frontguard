# Frontguard Agent Guide

Frontguard is AI-powered frontend visual regression testing for web teams. It renders pages, compares screenshots to baselines, classifies visual changes, and returns fix suggestions so coding agents can identify UI regressions before they ship.

> **Pre-release cloud status:** `api.frontguard.dev` is not a live default endpoint. The API and MCP surfaces below describe repository interfaces for development against a verified deployment. Cloud baseline approval currently records approval but does not promote screenshots, so do not use it as a baseline update workflow.

## How agents use Frontguard

Agents have two public integration paths (plus offline CLI reference via `frontguard guide [topic] --json`):

1. **MCP server:** run `@frontguard/mcp` in an editor or IDE agent that supports MCP. Supports local report mode (`FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json`) or a verified API deployment:

   ```bash
   FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json
   FRONTGUARD_API_URL=https://your-frontguard-api.example.com
   FRONTGUARD_API_KEY=<frontguard-api-key>
   ```

2. **REST API:** call your verified API deployment. Send `Authorization: Bearer <frontguard-api-key>` for the documented agent-facing `/v1` operations below. `GET /health` and `GET /openapi.json` are public.

## MCP tools and API routes

Six read tools are always registered. The two write tools, `promote_baseline` and `accept_baseline`, exist only when the server starts with `FRONTGUARD_MCP_WRITES=1`, and agents should not call them.

| MCP tool                   | API route / Local source                                             | Agent use                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recent_runs`              | `GET /v1/runs` or local report                                       | Browse recent runs the key can access or inspect the local report run summary.                                                                                                                                               |
| `list_regressions`         | `GET /v1/runs` (`GET /v1/runs/:id` for run ids) or local report      | Find the run for a PR number, a run id, or `"latest"` (the newest run) and return regression rows worst first, each with a `diffId` and a `clusterCount`. Pages hold 25 rows by default; pass `nextCursor` back as `cursor`. |
| `inspect_diff_cluster_dom` | `GET /v1/runs/:id` or local report                                   | Return a diff's cluster bounding boxes with recorded target selectors, plus its classification, explanation, and suggested fix.                                                                                              |
| `get_suggested_fix`        | `GET /v1/runs/:id` or local report                                   | Load the run behind a `diffId` and return the stored AI fix for that route, viewport, and browser. Fixes exist only when the run had an `ai` provider and `generateFixes: true`.                                             |
| `verify_css_patch`         | `GET /v1/runs/:id` or local report                                   | Statically check a candidate CSS patch: syntax, a deny list, and whether `target_selector` matches a selector recorded for the diff. It renders nothing; re-run `frontguard run` to confirm the pixels.                      |
| `list_horizontal_overflow` | `GET /v1/runs/:id` (`GET /v1/runs` without `run_id`) or local report | List visible unclipped boxes past the right edge, largest first, flagged rows only by default. Pages hold 25 rows by default. This does not change the pixel result.                                                         |
| `promote_baseline`         | `POST /v1/baselines/:runId/approve`                                  | Not registered unless `FRONTGUARD_MCP_WRITES=1`. Records whole-run approval through the same endpoint as `accept_baseline` and promotes no screenshots. Local-report mode refuses it and does not write baselines.           |
| `accept_baseline`          | `POST /v1/baselines/:runId/approve`                                  | Not registered unless `FRONTGUARD_MCP_WRITES=1`. Record run approval; screenshot promotion is not implemented yet.                                                                                                           |

Useful REST routes for agent workflows:

- `POST /v1/run` starts a visual regression run.
- `GET /v1/runs` lists accessible runs.
- `GET /v1/runs/:id` returns one run, including results and suggested fixes when available.
- `GET /v1/reports/:id` returns the completed HTML report.
- `POST /v1/baselines/:runId/approve` records whole-run approval but does not yet promote screenshots.
- `GET /v1/usage` returns current monthly run and screenshot usage.

## Authentication, limits, and errors

The agent-facing `/v1` reads and writes documented above require a Bearer API key. This is not a contract for every route in the repository: non-agent surfaces may use different authentication, and the billing webhook uses `Stripe-Signature` verification rather than Bearer auth. Rate-limited agent responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Error responses use a JSON object with an `error` string, and some validation or quota errors include extra fields such as `details`, `limit`, `current`, or `requested`.

## Representative task

For "on PR N, what regressed and how do we fix it?":

1. Call `list_regressions` with `{"pr_id": 42}`, using your PR number. Add `"repo": "owner/name"` when the same PR number exists in several repos, or call it with `{"pr_id": "latest"}` for the newest run. For local CLI workflow reference, run `frontguard guide --json`; it covers deterministic render flags `--freeze-time`, `--seed-random`, `--block-urls`, `--wait-for-stability`, `--redact-sensitive`, and multi-provider BYOK via `openai`, `anthropic`, `gemini`, or a custom OpenAI-compatible `baseUrl`.
2. For each returned `diffId`, call `inspect_diff_cluster_dom` and `get_suggested_fix`, then check candidate CSS patches with `verify_css_patch`. That check is static and renders nothing.
3. Review the route, viewport, browser, classification, report URL, and suggested patch before editing code. After applying a fix, re-run `frontguard run` to confirm the pixels.
4. Stop after the evidence above. Do not call `promote_baseline` or `accept_baseline`, and do not run an unconfirmed baseline write. A human reviews the report and runs `frontguard update-baselines --confirm-baselines`. `confirm_reviewed: true` is UX only and is not that review. Cloud `approveRun` is not a production path.

## Machine-readable companions

- `/openapi.json` — the OpenAPI 3.1 contract for the REST API.
- `/.well-known/mcp.json` — the MCP server discovery manifest.
