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

| MCP tool                   | API route / Local source                      | Agent use                                                                                                    |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `recent_runs`              | `GET /v1/runs` or local report                | Browse recent runs the key can access or inspect the local report run summary.                               |
| `list_regressions`         | `GET /v1/runs` or local report                | Find the latest run for a PR or run id and return regression rows with `diffId`s and cluster counts.         |
| `inspect_diff_cluster_dom` | `GET /v1/runs/:id` or local report            | Inspect connected-component diff clusters, Chroma/CW-SSIM scores, and intersecting DOM nodes for a `diffId`. |
| `get_suggested_fix`        | `GET /v1/runs/:id` or local report            | Load the run behind a `diffId` and return the stored AI fix for that route, viewport, and browser.           |
| `verify_css_patch`         | `GET /v1/runs/:id` or local report            | Validate a candidate CSS patch and target selector against the diff cluster's captured DOM snapshot.         |
| `promote_baseline`         | Local baseline store (`frontguard-baselines`) | Promote a verified local screenshot into the local baseline store.                                           |
| `accept_baseline`          | `POST /v1/baselines/:runId/approve`           | Record run approval; screenshot promotion is not implemented yet.                                            |

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

1. Call `list_regressions` with `pr_id: N` and, when needed, `repo: "owner/name"` (or run `frontguard guide --json` for local CLI workflow reference).
2. For each returned `diffId`, call `inspect_diff_cluster_dom` and `get_suggested_fix`, then validate candidate CSS patches with `verify_css_patch`.
3. Review the route, viewport, browser, classification, report URL, and suggested patch before editing code.
4. For local runs, use `promote_baseline` or `frontguard update-baselines` after human review. Do not use `accept_baseline` to update production baselines until screenshot promotion is implemented; use the CLI or composite Action baseline workflow instead.

## Machine-readable companions

- `/openapi.json` — the OpenAPI 3.1 contract for the REST API.
- `/.well-known/mcp.json` — the MCP server discovery manifest.
