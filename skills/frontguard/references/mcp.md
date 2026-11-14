# MCP Visual Cortex (`@frontguard/mcp`)

`@frontguard/mcp` registers six read tools that give AI coding agents a closed-loop visual inspection and CSS repair workflow. Two write tools, `promote_baseline` and `accept_baseline`, exist only when the server starts with `FRONTGUARD_MCP_WRITES=1`. Agents do not call them: stop at evidence and leave the baseline decision to a human.

## Operating Modes

1. **Local Report Mode (Zero Cloud Account Required)**:
   - Set `FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json`, or run in a directory containing `./frontguard-report/report.json` with `FRONTGUARD_API_KEY` unset.
   - The report is one run. Its id is `run_local` unless the report sets `id`, and `pr_id: "latest"` always reads it.
2. **Cloud API Mode**:
   - Set `FRONTGUARD_API_URL` (required; there is no hosted default) and `FRONTGUARD_API_KEY=fg_...`.

## MCP Server Configuration (`.mcp.json` / Claude Code / Cursor)

```json
{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_LOCAL_REPORT": "./frontguard-report/report.json"
      }
    }
  }
}
```

## Available Tools

| Tool | Inputs | Returns |
| --- | --- | --- |
| `list_regressions` | `pr_id` (PR number, run id, or `"latest"`); optional `repo`, `limit` (default 25, max 200), `cursor` | Regression rows, worst first: `diffId`, route, viewport, status, `diffPercentage`, `hasSuggestedFix`, `clusterCount`. Run fields (`runId`, `reportUrl`, PR, repo, commit) appear once at the top, with `total`, `count`, and `nextCursor` |
| `inspect_diff_cluster_dom` | `diff_id` from `list_regressions`; optional `cluster_id` | Cluster bounding boxes (`x, y, width, height`) with recorded target selectors, plus the diff's classification, explanation, and suggested fix |
| `get_suggested_fix` | `diff_id` | The stored AI patch, or `fix: null` with a reason. Fixes exist only when the run had an `ai` provider and `generateFixes: true` |
| `verify_css_patch` | `diff_id`, `target_selector`, `css_patch` | A static check: brace balance and declaration syntax, a deny list (`@import`, external `url()`, root `display: none`), and whether `target_selector` matches a selector recorded for the diff. It renders nothing: `staticCheck: "pass"` comes with `rendered: false` |
| `recent_runs` | optional `repo`, `branch`, `limit` (default 10, max 50) | Newest-first run summaries with `runId` and `regressionsCount` |
| `list_horizontal_overflow` | optional `run_id` (newest run when omitted), `flagged_only` (default true), `limit`, `cursor` | Visible unclipped boxes past the right edge, largest `overflowPx` first. It does not change the pixel result |
| `promote_baseline` | `run_id`, `confirm_reviewed: true`; optional `routes` | Not an agent step. Unregistered unless `FRONTGUARD_MCP_WRITES=1`. Records whole-run approval through the same endpoint as `accept_baseline` and promotes no screenshots. Local-report mode refuses it and does not write `frontguard-baselines`. `confirm_reviewed: true` is UX only, not a human review |
| `accept_baseline` | `run_id`, `confirm_all_regressions_reviewed: true` | Not an agent step. Unregistered unless `FRONTGUARD_MCP_WRITES=1`. Records whole-run approval metadata; screenshot promotion is not implemented |

The two list tools page: pass `nextCursor` back as `cursor` until it is null. Every tool returns `structuredContent` and the same object as compact JSON text.

## Recommended Agent Loop

1. Call `list_regressions` with `{"pr_id": "latest"}`. Rows come worst first. If `nextCursor` is not null and you need more rows, call it again with `{"pr_id": "latest", "cursor": "<nextCursor>"}`.
2. For each regression, call `inspect_diff_cluster_dom` with `{"diff_id": "<diffId>"}` to inspect cluster coordinates and target selectors, and `get_suggested_fix` with `{"diff_id": "<diffId>"}` to read a stored AI patch if the row has `hasSuggestedFix: true`.
3. Propose a minimal CSS/layout fix and check it with `verify_css_patch` before editing source files, e.g. `{"diff_id": "<diffId>", "target_selector": ".pricing-card", "css_patch": ".pricing-card { min-width: 0; }"}`. A `staticCheck` of `fail` comes with a `nextStep` that says what to refine.
4. `verify_css_patch` renders nothing. Apply the fix and re-run `npx frontguard run` to confirm `diffPercentage` drops below threshold.
5. Stop. Do not call `promote_baseline` or `accept_baseline`, and do not run an unconfirmed `update-baselines`. If the visual change is an intentional product update, tell a human to run `npx frontguard update-baselines --confirm-baselines`. Cloud `approveRun` is not a production path.
