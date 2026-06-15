# @frontguard/mcp

> Model Context Protocol server for [Frontguard](https://frontguard.dev). Lets in-IDE agents — Claude Code, Cursor, GitHub Copilot, and anything else that speaks MCP — answer questions like _"what regressed on PR 42?"_ or _"give me the suggested fix for diff D5"_ without leaving the editor.

[![npm](https://img.shields.io/npm/v/@frontguard/mcp.svg)](https://www.npmjs.com/package/@frontguard/mcp)

## Why

Frontguard already runs your visual-regression checks on every PR. The expensive part of that loop isn't the screenshots — it's the agent context-switch between "agent sees PR" and "agent reads the report and reasons about the fix." This MCP server collapses that loop: the agent calls `list_regressions(pr_id)` and gets structured JSON; it calls `get_suggested_fix(diff_id)` and gets the AI-generated patch, ready to apply.

## Install

```bash
npm install -g @frontguard/mcp
# or run on-demand
npx -y @frontguard/mcp
```

The server speaks JSON-RPC over **stdio** — your MCP client (the editor) launches it as a subprocess.

## Configure your editor

### Claude Code

Add an entry to `~/.claude/mcp.json` (or your project-scoped `.mcp.json`):

```json
{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_API_KEY": "fg_live_xxx"
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
      "env": { "FRONTGUARD_API_KEY": "fg_live_xxx" }
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
      "env": { "FRONTGUARD_API_KEY": "${env:FRONTGUARD_API_KEY}" }
    }
  }
}
```

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `list_regressions` | `pr_id` (number or run id), optional `repo` | regressions on the PR with stable `diffId`s |
| `get_suggested_fix` | `diff_id` from `list_regressions` | AI-generated patch (`fixType`, `patch`, `confidence`, `explanation`) |
| `accept_baseline` | `diff_id` or bare run id | confirms the run was promoted to the new baseline |
| `recent_runs` | optional `repo`, `branch`, `limit` | newest-first run summary list |

Every tool returns JSON in the MCP `text` content channel; agents parse it directly.

## Example agent prompts

- _"What regressed on PR 42 in acme/shop?"_ → calls `list_regressions({ pr_id: 42, repo: 'acme/shop' })`.
- _"Show me the suggested fix for the first one."_ → `get_suggested_fix({ diff_id })`.
- _"OK, apply that and accept the baseline."_ → agent writes the patch to your CSS, then calls `accept_baseline({ diff_id })`.

## Local-only mode

Point the server at a local `wrangler dev` instance of `@frontguard/cloud-api`:

```bash
export FRONTGUARD_API_URL=http://localhost:8787
export FRONTGUARD_API_KEY=fg_dev_localkey
npx @frontguard/mcp
```

The cloud client strips trailing slashes and validates that `FRONTGUARD_API_KEY` is non-empty on every tool call.

## Authentication

| Variable | Default | Required |
|----------|---------|----------|
| `FRONTGUARD_API_KEY` | _none_ | yes — per-tool-call |
| `FRONTGUARD_API_URL` | `https://api.frontguard.dev` | no |

The server starts on stdio even when the key is missing (so `tools/list` works); the missing-key error only surfaces when a tool is actually called.

## License

MIT © Ravindra Kumar
