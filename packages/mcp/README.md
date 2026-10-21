# @frontguard/mcp

> Model Context Protocol server for [Frontguard](https://frontguard.dev). Lets in-IDE agents — Claude Code, Cursor, GitHub Copilot, and anything else that speaks MCP — answer questions like _"what regressed on PR 42?"_ or _"give me the suggested fix for diff D5"_ without leaving the editor.

[![npm](https://img.shields.io/npm/v/@frontguard/mcp.svg)](https://www.npmjs.com/package/@frontguard/mcp)

## Why

Frontguard runs your visual-regression checks locally or in CI. The expensive part of that loop isn't the screenshots — it's the agent context-switch between "agent sees diff" and "agent inspects the report, DOM cluster, and suggested fix." This MCP server collapses that loop with **7 tools** across **Local Report Mode** (zero Cloud API key required) and **Cloud API Mode**: the agent calls `list_regressions`, inspects spatial diff clusters and DOM nodes with `inspect_diff_cluster_dom`, retrieves patches via `get_suggested_fix`, validates candidate CSS via `verify_css_patch`, and records explicit approval metadata. Local screenshot baselines are updated through the CLI review workflow.

## Install

```bash
npm install -g @frontguard/mcp
# or run on-demand
npx -y @frontguard/mcp
```

The server speaks JSON-RPC over **stdio** — your MCP client (the editor) launches it as a subprocess.

## Configure your editor

### Local Report Mode (Zero Cloud API Key Required)

When `FRONTGUARD_LOCAL_REPORT` is set (or when `./frontguard-report/report.json` exists in the working directory and no `FRONTGUARD_API_URL` is configured), `@frontguard/mcp` reads your local CLI report without needing an API server or key. It cannot promote local baselines. Generate the file first from your project directory:

```bash
mkdir -p frontguard-report
npx -p @frontguard/cli frontguard run --output json > frontguard-report/report.json
```

Refresh it after each comparison. Exit 1 can produce a regression report; investigate exit 2 before using the report. Configure the editor to read that file:

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

### Claude Code (Cloud API Mode)

Add an entry to `~/.claude/mcp.json` (or your project-scoped `.mcp.json`):

```json
{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_API_KEY": "<frontguard-api-key>",
        "FRONTGUARD_API_URL": "https://your-frontguard-api.example.com"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_LOCAL_REPORT": "./frontguard-report/report.json",
        "FRONTGUARD_API_KEY": "<frontguard-api-key>",
        "FRONTGUARD_API_URL": "https://your-frontguard-api.example.com"
      }
    }
  }
}
```

### GitHub Copilot (VS Code)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "frontguard": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_LOCAL_REPORT": "./frontguard-report/report.json",
        "FRONTGUARD_API_KEY": "${env:FRONTGUARD_API_KEY}",
        "FRONTGUARD_API_URL": "${env:FRONTGUARD_API_URL}"
      }
    }
  }
}
```

## Tools (7 Tools)

| Tool | Input | Returns |
|------|-------|---------|
| `list_regressions` | `pr_id` (PR number or run ID from `recent_runs`), optional `repo` | regressions on the PR or local report with stable `diffId`s and cluster counts |
| `inspect_diff_cluster_dom` | `diff_id` from `list_regressions`, optional `cluster_id` | connected-component diff bounding boxes, Chroma/CW-SSIM scores, `targetSelector`, and intersecting DOM nodes |
| `get_suggested_fix` | `diff_id` from `list_regressions` | AI-generated patch (`fixType`, `patch`, `confidence`, `explanation`) |
| `verify_css_patch` | `diff_id`, `css_patch`, `target_selector` | validates candidate CSS syntax, safety, and target selector presence against the captured DOM snapshot |
| `promote_baseline` | `run_id`, `confirm_reviewed: true`, optional `routes` | records reviewed run approval in Cloud API mode; refuses local-report mode and does not promote cloud PNGs |
| `accept_baseline` | `run_id`, `confirm_all_regressions_reviewed: true` | records approval metadata for the **entire run** in the JSON report or Cloud API; screenshot promotion is not implemented |
| `recent_runs` | optional `repo`, `branch`, `limit` | newest-first run summary list from the Cloud API or local report |

Every tool returns JSON in the MCP `text` content channel; agents parse it directly.

Tool `annotations` (`title`, `readOnlyHint`, `destructiveHint`, `openWorldHint`) are untrusted hints and do not enforce anything. An untrusted server can lie. `promote_baseline` and `accept_baseline` also set `_meta["anthropic/requiresUserInteraction"]` so Claude Code prompts a person; that flag is a hint too. The control is [#287](https://github.com/ravidsrk/frontguard/issues/287): baseline writes stay off the agent's default path.

## Example agent prompts

- _"What regressed in my latest local run (or on PR 42 in acme/shop)?"_ → calls `list_regressions({ pr_id: 'run_local' })` or `list_regressions({ pr_id: 42, repo: 'acme/shop' })`.
- _"Inspect the DOM around the first diff cluster and show the suggested fix."_ → calls `inspect_diff_cluster_dom({ diff_id })` and `get_suggested_fix({ diff_id })`.
- _"Verify this candidate CSS patch against the diff cluster."_ → calls `verify_css_patch({ diff_id, css_patch, target_selector })`.
- _"Record approval for the reviewed cloud run."_ → calls `promote_baseline({ run_id, confirm_reviewed: true })` or `accept_baseline({ run_id, confirm_all_regressions_reviewed: true })`. These record approval metadata only; local report approval does not replace PNG baselines. A human uses the CLI `frontguard update-baselines` workflow for local baseline writes.

## Modes: Local Report Mode vs Cloud API Mode

### 1. Local Report Mode (`FRONTGUARD_LOCAL_REPORT`)

Run `@frontguard/mcp` with zero cloud dependencies by pointing `FRONTGUARD_LOCAL_REPORT` at a JSON report generated by `@frontguard/cli`, or rely on automatic local fallback when `./frontguard-report/report.json` exists in the current working directory:

```bash
mkdir -p frontguard-report
npx -p @frontguard/cli frontguard run --output json > frontguard-report/report.json
export FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json
npx -y @frontguard/mcp
```

### 2. Local / Self-Hosted Cloud API Mode (`FRONTGUARD_API_URL` + `FRONTGUARD_API_KEY`)

Point the server at a local `wrangler dev` or self-hosted instance of `@frontguard/cloud-api`:

```bash
export FRONTGUARD_API_URL=http://localhost:8787
export FRONTGUARD_API_KEY=fg_dev_localkey
npx -y @frontguard/mcp
```

The cloud client strips trailing slashes and validates that `FRONTGUARD_API_KEY` is non-empty on cloud tool calls.

## Authentication & Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FRONTGUARD_LOCAL_REPORT` | no (auto-detects `./frontguard-report/report.json`) | Path to local `report.json` for zero-key local mode |
| `FRONTGUARD_API_KEY` | yes (in Cloud API mode) | Bearer key validated on cloud API tool calls |
| `FRONTGUARD_API_URL` | yes (in Cloud API mode) | Self-hosted `cloud-api` base URL (e.g. `http://localhost:8787` for local dev) |

There is no hosted default. The server starts on stdio even when credentials are
missing (so `tools/list` works); if `./frontguard-report/report.json` exists, tools fall back to local report mode automatically.

On launch the binary writes `frontguard-mcp v<version> starting on stdio` to
stderr. If your editor shows no tools and no stderr line, check that `npx` can
resolve the bin (symlink/realpath issues) and file an issue with `which npx` and
your cwd.

### Local JSON-RPC smoke test (after `npm run build`)

```bash
mkdir -p /tmp/mcp-test
cat > /tmp/mcp-test/init.jsonl <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"local-test","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
cd /tmp/mcp-test && cat init.jsonl | node /path/to/frontguard/packages/mcp/dist/index.js
```

Stdout should contain JSON-RPC `result` frames (including all 7 tools). Stderr
should show `frontguard-mcp v… starting on stdio`. Published `npx -y
@frontguard/mcp@0.2.0` is the known before-state (empty stdout); verify against
your local `dist/index.js` build instead.

## License

MIT © Ravindra Kumar
