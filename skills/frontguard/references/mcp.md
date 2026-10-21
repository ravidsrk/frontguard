# MCP Visual Cortex (`@frontguard/mcp`)

`@frontguard/mcp` exposes 7 MCP tools that give AI coding agents a closed-loop visual verification and CSS repair workflow.

## Operating Modes

1. **Local Report Mode (Zero Cloud Account Required)**:
   - Set `FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json` (or run in a directory containing `./frontguard-report/report.json` without `FRONTGUARD_API_KEY`).
2. **Cloud API Mode**:
   - Set `FRONTGUARD_API_KEY=fg_...` (and optional `FRONTGUARD_API_URL`).

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

| Tool Name | Purpose |
| --- | --- |
| `list_regressions` | List failing and warning visual diffs for a run ID, PR number, or `latest` |
| `get_diff_details` | Fetch full metadata, AI explanation, and screenshot URLs for a `<runId>:<route>@<viewport>` diff |
| `inspect_diff_cluster_dom` | Inspect localized `DiffCluster` bounding boxes (`x, y, width, height`), grounded CSS target selectors, and AI suggested fixes |
| `verify_css_patch` | Validate a candidate CSS patch (`target_selector`, `css_patch`) for balanced braces, selector alignment, and dangerous rules (`@import`, external `url()`, root `display: none !important`) |
| `accept_suggestion` | Record acceptance of an AI-suggested fix |
| `promote_baseline` | Not an agent step. Unregistered unless `FRONTGUARD_MCP_WRITES=1`. Local-report mode refuses it and does not write `frontguard-baselines`. `confirm_reviewed: true` is UX only, not a human review. |
| `run_visual_check` | Trigger a new Frontguard visual check against a target URL |

## Recommended Agent Loop

1. Run `list_regressions` with `{ "pr_or_run_id": "latest" }`.
2. For each regression, call `inspect_diff_cluster_dom` with `{ "diff_id": "<diffId>" }` to inspect cluster coordinates and target selectors.
3. Propose a minimal CSS/layout fix and validate it with `verify_css_patch` before editing source files.
4. Re-run `npx frontguard run` to confirm `diffPercentage` drops below threshold.
5. Stop. Do not call `promote_baseline` or run an unconfirmed `update-baselines`. If the visual change is an intentional product update, tell a human to run `npx frontguard update-baselines --confirm-baselines`. Cloud `approveRun` is not a production path.
