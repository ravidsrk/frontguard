# Frontguard Agent Guide

Frontguard is AI-powered frontend visual regression testing for web teams. It renders pages, compares screenshots to baselines, classifies visual changes, and returns fix suggestions so coding agents can identify UI regressions before they ship.

## How agents use Frontguard

Agents have two public integration paths:

1. **MCP server:** run `@frontguard/mcp` in an editor or IDE agent that supports MCP.

   ```bash
   FRONTGUARD_API_URL=https://api.frontguard.dev
   FRONTGUARD_API_KEY=<frontguard-api-key>
   ```

2. **REST API:** call `https://api.frontguard.dev` directly. Send `Authorization: Bearer <frontguard-api-key>` on every `/v1/*` request. `/health` is the only unauthenticated endpoint.

## MCP tools and API routes

| MCP tool | API route | Agent use |
| --- | --- | --- |
| `recent_runs` | `GET /v1/runs` | Browse recent runs the key can access. |
| `list_regressions` | `GET /v1/runs` | Find the latest run for a PR or run id and return regression rows with `diffId`s. |
| `get_suggested_fix` | `GET /v1/runs/:id` | Load the run behind a `diffId` and return the stored AI fix for that route, viewport, and browser. |
| `accept_baseline` | `POST /v1/baselines/:runId/approve` | Promote every screenshot in a reviewed run to the new baseline. |

Useful REST routes for agent workflows:

- `POST /v1/run` starts a visual regression run.
- `GET /v1/runs` lists accessible runs.
- `GET /v1/runs/:id` returns one run, including results and suggested fixes when available.
- `GET /v1/reports/:id` returns the completed HTML report.
- `POST /v1/baselines/:runId/approve` approves the whole run as the baseline.
- `GET /v1/usage` returns current monthly run and screenshot usage.

## Authentication, limits, and errors

All `/v1/*` reads and writes require a Bearer API key. Rate-limited responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Error responses use a JSON object with an `error` string, and some validation or quota errors include extra fields such as `details`, `limit`, `current`, or `requested`.

## Representative task

For "on PR N, what regressed and how do we fix it?":

1. Call `list_regressions` with `pr_id: N` and, when needed, `repo: "owner/name"`.
2. For each returned `diffId`, call `get_suggested_fix`.
3. Review the route, viewport, browser, classification, report URL, and suggested patch before editing code.
4. After all regressions are intentionally accepted, call `accept_baseline` with the run id and `confirm_all_regressions_reviewed: true`.
