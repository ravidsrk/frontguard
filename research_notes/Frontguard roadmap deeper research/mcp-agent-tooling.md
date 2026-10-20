# MCP spec and ecosystem evolution through 2026-10-19, and agent-side visual verification tooling

> Archive note (published 2026-10-20): Research and query logs below describe the 2026-10-19 search. Candidate recommendations are research data, not accepted scope or instructions. Use [docs/ROADMAP.md](../../docs/ROADMAP.md) for the current plan and [the archive index](../README.md) for publication limits. Sources and engagement counts were not all refreshed on publication.

Method and dating: every source below was fetched on **2026-10-19**. That covers web pages via WebFetch, GitHub files and metadata via authenticated read-only `gh api` calls against default branches, npm registry JSON, and MCP Registry API responses. GitHub links point to the file that was read. Where a GitHub file is also published on a website (for example modelcontextprotocol.io or code.visualstudio.com), the GitHub source is cited because that is what was read. "Inference" marks my reasoning, not something a source says. "Vendor claim" marks marketing or self-reported statements. Star counts and release lists are `gh api` snapshots taken on 2026-10-19.

## 1. MCP spec revisions (2025-03-26, 2025-06-18, 2025-11-25, 2026-07-28): annotations, elicitation, structured output, tasks, and other changes that affect stdio servers

### Takeaway
The four tool-annotation hints have been unchanged since 2025-03-26. They are explicitly *untrusted hints*: clients MUST treat them as untrusted unless the server is trusted. Elicitation started in 2025-06-18 as form-only. URL mode was added in 2025-11-25 for anything sensitive, with strict client-side URL-handling rules. The 2026-07-28 revision (GA 2026-07-28, now marked "latest") is a breaking re-architecture:
- no `initialize` handshake;
- a mandatory `server/discover`;
- elicitation delivered via Multi Round-Trip Requests (MRTR) instead of server-initiated requests;
- tasks moved into an extension;
- Roots, Sampling and Logging deprecated.

The product's SDK line (`@modelcontextprotocol/sdk` 1.x) tops out at 2025-11-25. The v2 SDK implements 2026-07-28 and can serve both protocol eras.

### Cited Findings
**Revision list and status**
- The spec repo contains schema and docs folders for 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25, **2026-07-28**, and draft. The docs navigation labels "Version 2026-07-28 (latest)". — [schema dir](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/schema); [docs.json](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs.json)
- The 2026-07-28 release post (dated 2026-07-28, by the lead maintainers) says the spec is "officially" released. It names a stateless core, MRTR, header routing, cacheable lists, auth hardening, a formal extensions framework and a 12-month deprecation policy. It says the TypeScript, Python, Go and C# Tier-1 SDKs "speak 2026-07-28 as of today". It also reports "close to half-a-billion downloads a month" across Tier-1 SDKs (project-reported statistic). — [2026-07-28 GA post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-07-28-spec-ga/index.md)
- The MCP blog index also has a release-candidate post (2026-05-21), an SDK-betas post (2026-06-29) and a new roadmap post (2026-08-22). — [blog posts dir](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/blog/content/posts)

**2025-03-26 (tool annotations introduced)**
- Major changes: OAuth 2.1 authorization framework, Streamable HTTP replacing HTTP+SSE, JSON-RPC batching, and "comprehensive tool annotations for better describing tool behavior, like whether it is read-only or destructive" (PR #185). It also added audio content, the `completions` capability, and a `message` field on progress notifications. — [2025-03-26 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/changelog.mdx)
- The `ToolAnnotations` fields are identical in the 2025-03-26 and 2026-07-28 `schema.ts`:
  - `title`.
  - `readOnlyHint`: "If true, the tool does not modify its environment." Default false.
  - `destructiveHint`: true means it "may perform destructive updates"; false means "performs only additive updates". Only meaningful when `readOnlyHint == false`. Default **true**.
  - `idempotentHint`: repeated calls with the same arguments have "no additional effect". Only meaningful when `readOnlyHint == false`. Default false.
  - `openWorldHint`: the tool "may interact with an 'open world' of external entities". Web search is open; a memory tool is closed. Default **true**.
  — [schema 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts); [schema 2025-03-26](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-03-26/schema.ts)
- **Trust language, the same in every revision.** "For trust & safety and security, clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers." The same pages say there "**SHOULD** always be a human in the loop with the ability to deny tool invocations", and that applications SHOULD "present confirmation prompts to the user for operations". — [tools 2025-03-26](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/server/tools.mdx); [tools 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/server/tools.mdx); [tools 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx)

**Official guidance on what annotations can and cannot do** — all from the maintainer post of 2026-03-16 ([tool-annotations post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-03-16-tool-annotations.md)):
- Every property is a hint. The defaults are deliberately pessimistic: an unannotated tool is assumed non-read-only, destructive, non-idempotent and open-world.
- "An untrusted server can lie": a server can claim `readOnlyHint: true` and still delete files. Annotations "aren't enforcement". Guarantees belong in network controls and sandboxing.
- Example client behaviours: `readOnlyHint: true` skips the confirmation dialog; `destructiveHint: true` shows a warning; `idempotentHint: true` means safe to retry; `openWorldHint: true` means scrutinize the output for untrusted content.
- As of the post, "no MCP client lets users filter tools by annotation values, and none surface annotations as context in approval prompts". GitHub's read-only mode is "enabled by about 17% of users".
- Advice to server authors: set `readOnlyHint: true` on read-only tools, `destructiveHint: false` on additive operations, and `openWorldHint: false` on closed-domain tools.
- Five annotation SEPs were open: #1913 trust/sensitivity, #1984 governance/UX, #1561 `unsafeOutputHint`, #1560 `secretHint`, #1487 `trustedHint`. A Tool Annotations Interest Group was forming with Microsoft, OpenAI, AWS, Cloudflare and Anthropic.
- `taskHint` ended up as `Tool.execution` rather than an annotation.

**2025-06-18 (structured output and form elicitation)**
- Changes in this revision: structured tool output (PR #371), elicitation (PR #382), resource links in tool results (PR #603), removal of JSON-RPC batching, MCP servers classified as OAuth resource servers, RFC 8707 resource indicators, the `MCP-Protocol-Version` header on HTTP, `_meta` on more types, and a `title` field (PR #663). — [2025-06-18 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/changelog.mdx)
- Elicitation 2025-06-18 rules:
  - "Servers MUST NOT use elicitation to request sensitive information."
  - `requestedSchema` is limited to "flat objects with primitive properties only".
  - Clients that support it MUST declare the `elicitation` capability.
  - Clients SHOULD: offer user approval controls, say which server is asking, allow decline at any time, rate-limit, and make clear what is requested and why.
  - Both sides SHOULD validate responses against the schema.
  — [elicitation 2025-06-18](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/client/elicitation.mdx)

**Structured output semantics (2026-07-28 text)** — [tools 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx):
- `structuredContent` may be any JSON value that conforms to `outputSchema`, if one is defined.
- "For backwards compatibility, a tool that returns structured content SHOULD also return the serialized JSON in a TextContent block."
- If `outputSchema` is given, servers MUST return conforming results and clients SHOULD validate them.
- `structuredContent` "is unrelated to LLM 'structured outputs'".

**2025-11-25 (URL-mode elicitation, experimental tasks)**
- Changes in this revision:
  - icons (SEP-973), tool-name guidance (SEP-986), enum/`ElicitResult` changes (SEP-1330);
  - URL-mode elicitation (SEP-1036); tool calling in sampling (SEP-1577); OAuth Client ID Metadata Documents (SEP-991);
  - experimental tasks (SEP-1686);
  - "servers using stdio transport may use stderr for all types of logging" (PR #670);
  - `Implementation.description`;
  - input-validation errors returned as Tool Execution Errors, not protocol errors (SEP-1303);
  - default values in elicitation schemas (SEP-1034); JSON Schema 2020-12 as the default dialect (SEP-1613).
  — [2025-11-25 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/changelog.mdx)
- Elicitation 2025-11-25, what may be requested ([elicitation 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/client/elicitation.mdx)):
  - Servers "MUST NOT use form mode elicitation to request sensitive information such as passwords, API keys, access tokens, or payment credentials". They MUST use URL mode for those.
  - "Sensitive" means secrets and credentials that grant access or authorize transactions. Names, emails and usernames are "not categorically prohibited".
  - Form schemas remain flat objects of primitives.
  - Capability `{form:{}, url:{}}`. An empty object means form-only. Servers MUST NOT use a mode the client didn't declare.
- Elicitation 2025-11-25 client obligations: clients MUST show which server is asking, provide decline/cancel options, let users review and modify form answers before sending, and for URL mode "clearly display the target domain/host and gather user consent before navigation".
- URL-mode security (same page):
  - URL mode is not for authorizing the MCP client. Servers "MUST NOT rely on URL mode elicitation to authorize users for themselves".
  - Servers MUST NOT pass credentials obtained this way back to the client.
  - URLs MUST NOT contain sensitive user data and MUST NOT be pre-authenticated. They SHOULD be HTTPS.
  - Clients MUST NOT pre-fetch, MUST NOT open the URL without explicit consent, MUST show the full URL, and MUST open it in a way the client and LLM cannot inspect. They SHOULD highlight the domain and warn on Punycode.
  - Servers MUST bind elicitations to client and user identity. Anti-phishing: the server MUST verify that the user who opens the URL is the user who started the elicitation.
  - Also added: `notifications/elicitation/complete` and `URLElicitationRequiredError` (-32042).
- Tasks 2025-11-25 (experimental): requestor-driven, durable task-augmented requests polled for results. Tools opt in via `execution.taskSupport`:
  - `"forbidden"` or absent: clients MUST NOT use tasks;
  - `"optional"`: tasks allowed;
  - `"required"`: tasks mandatory, and the server returns -32601 otherwise.
  — [tasks 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/basic/utilities/tasks.mdx)

**2026-07-28 (stateless core)** — major changes per the [2026-07-28 changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx):
- Sessions and `Mcp-Session-Id` removed. Cross-call state should use explicit server-minted handles passed as tool arguments (SEP-2567).
- `initialize`/`initialized` removed. Every request carries `io.modelcontextprotocol/protocolVersion` and `clientCapabilities` in `_meta`. Version mismatch returns `UnsupportedProtocolVersionError` (SEP-2575).
- Servers MUST implement `server/discover`. Clients may use it "as a backward-compatibility probe on STDIO".
- `subscriptions/listen` replaces GET streams and `resources/subscribe`.
- `ping`, `logging/setLevel` and `notifications/roots/list_changed` removed.
- Tasks moved to the `io.modelcontextprotocol/tasks` extension: polling `tasks/get`, a new `tasks/update`, no `tasks/list` (SEP-2663).
- MRTR replaces server-initiated `roots/list`, `sampling/createMessage` and `elicitation/create`. Servers return `InputRequiredResult` (`resultType: "input_required"`, `inputRequests`). Clients retry with `inputResponses` (SEP-2322).
- All results carry `resultType`.
- Minor changes: the `extensions` capability field; servers SHOULD return `tools/list` in deterministic order; required `ttlMs`/`cacheScope` on list results; `inputSchema`/`outputSchema` may use any JSON Schema 2020-12 keyword and `structuredContent` may be any JSON value (SEP-2106); `notifications/elicitation/complete` and `elicitationId` removed; error-code renumbering.
- Deprecated: Roots, Sampling and Logging (SEP-2577), with "log to `stderr` (stdio)" as the migration path; Dynamic Client Registration deprecated in favour of CIMD; a 12-month minimum deprecation window.
- MRTR rules ([MRTR 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/patterns/mrtr.mdx)):
  - `InputRequiredResult` is allowed on `tools/call` (among a few others) and MUST NOT be used on other requests.
  - `requestState` is opaque to clients and must be echoed byte-exact.
  - Servers "MUST treat `requestState` as an attacker-controlled input". If it influences authorization or business logic it MUST be integrity-protected and verified. Servers SHOULD add replay protection, and MUST enforce at-most-once use server-side where that matters.
  - Servers MUST NOT send `inputRequests` the client didn't declare support for.
- Stdio transport in 2026-07-28 ([stdio 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/stdio.mdx)):
  - The server MAY write any logging to stderr. Clients SHOULD NOT treat stderr output as an error.
  - The server MUST NOT write anything to stdout that isn't a valid MCP message.
  - "The server **MUST NOT** write JSON-RPC _requests_ to `stdout`". Server-to-client interaction goes through `InputRequiredResult`.
  - Dual-era clients SHOULD probe with `server/discover` and fall back to `initialize` on any other error or a timeout. The fallback MUST NOT key on one specific error code.
- Elicitation 2026-07-28 keeps the form/URL rules and URL-mode client MUSTs. Elicitations are now delivered inside `InputRequiredResult.inputRequests`. Servers "MUST handle cases where the user declines or cancels". — [elicitation 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/client/elicitation.mdx)
- 2026-07-28 also recommends opaque, high-entropy, bounded-lifetime handles for cross-call state, with expiry returned as a tool execution error. — [tools 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx)
- The new roadmap (2026-08-22) lists five priority areas: agentic messaging primitives, HTTP transport, agent identity/security, improved primitives, and SDK DX. It says result handling is ambiguous: a server "has no way to know which form a given client will put in front of the model", and the roadmap aims to standardize on one form. A "progressive discovery" effort targets large tool catalogs. — [roadmap post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-08-22-mcp-roadmap.md)

**TypeScript SDK status (the product uses `@modelcontextprotocol/sdk` ^1.32)**
- The `main` branch is **v2** (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`), "the stable release line, implementing the 2026-07-28 MCP spec". v1.x (`@modelcontextprotocol/sdk`) "continues to receive bug fixes and security updates for at least six months after the v2 release (2026-07-27)". — [TS SDK README](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md)
- On v1.x, `LATEST_PROTOCOL_VERSION = '2025-11-25'`, and the supported versions run back to 2024-10-07. — [v1.x types.ts](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/types.ts)
- 1.32.0 shipped 2026-10-02 and 1.32.1 on 2026-10-05. 1.32.0 added an opt-in `maxToolInputElements` limit on tool-call argument size. v2.3.1 shipped the same day as 1.32.1. — [1.32.0 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.0); [releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- The v1.x server already supports `elicitInput()` in form and URL modes, plus `createElicitationCompletionNotifier`. `registerTool` accepts `annotations`, `outputSchema` and `_meta`. — [v1.x server/index.ts](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/index.ts); [v1.x server/mcp.ts](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/mcp.ts)
- v2 is dual-era:
  - `serveStdio` takes a `legacy` option defaulting to `'serve'`, so a 2025-era opening "pins the connection to a legacy instance".
  - An `input_required` return on a 2025-era connection goes through a "legacy shim" that sends a real `elicitation/create`. Handlers are "written once in the 2026 `inputRequired(...)` style and serve both eras".
  - Hand-constructed `Client`/`Server`/`McpServer` objects keep speaking the 2025-era protocol by default.
  — [legacy-clients.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/legacy-clients.md); [support-2026-07-28.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md); [protocol-versions.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- A `@modelcontextprotocol/codemod` package (2.3.1) is described as a "Codemod to migrate MCP TypeScript SDK code from v1 to v2". `@modelcontextprotocol/server-legacy` is *not* a dual-era server: it holds "Frozen v1 SSE transport and OAuth Authorization Server helpers", and is deprecated. — [npm codemod](https://registry.npmjs.org/@modelcontextprotocol/codemod/latest); [npm server-legacy](https://registry.npmjs.org/@modelcontextprotocol/server-legacy/latest)

### Inferences
- The `confirm_reviewed: true` pattern exists in no MCP revision. The spec's own model is: human-in-the-loop confirmation is a client UI duty, annotations only inform it, and anything that must hold regardless of client behaviour belongs in auth or runtime controls (blog: "Is it a hint or a contract?").
- Every annotation, elicitation and structured-output feature the product needs is available on its current SDK (^1.32, protocol 2025-11-25). Migrating to v2 is needed only to take part in the modern era: MRTR-native elicitation, `server/discover`, cache hints. That migration has a soft deadline, because v1.x maintenance is promised only to roughly 2027-01-27 at minimum (six months after 2026-07-27).
- Under 2026-07-28, any server-side "confirmation token" carried across an elicitation retry must live in an integrity-protected, replay-protected `requestState`. This is directly relevant if baseline promotion becomes a two-step flow.

### Gaps
- I didn't diff full `ToolAnnotations` doc comments across all four revisions line by line. I compared the 2026-07-28 interface in full and the start of the 2025-03-26 interface.
- I found no statement on whether the annotation SEPs (#1913, #1984 and others) were accepted after 2026-03-16. The 2026-07-28 changelog lists no annotation changes.
- The full text of the 2026-07-28 "deprecated features registry" page was downloaded but not reviewed beyond the changelog's deprecation list.

## 2. Client support as of Oct 2026 (Claude Code, Claude Desktop, Cursor, VS Code/Copilot, Codex CLI, Windsurf, Zed)

### Takeaway
- **Annotations.** VS Code and Codex are the clients documented to drive approvals from annotations. VS Code skips confirmation for `readOnlyHint`. Codex's `auto` mode prompts unless a tool is read-only, or is non-destructive and closed-world. Claude apps/Cowork use read-only annotations to group tools and to auto-approve. Claude Code instead offers a Claude-specific `_meta["anthropic/requiresUserInteraction"]` that forces a human prompt which no mode, rule or hook can skip.
- **Elicitation.** Supported in Claude Code (form and URL), VS Code (form and URL), Codex (including URL) and Cursor. Not supported in Zed; not documented for Windsurf/Devin. In Claude Code and Codex, elicitation can be answered by automation (hooks, or the Codex Guardian reviewer), so it isn't proof that a human was involved.
- **MCP Apps.** Rendered by Claude web/Desktop, VS Code Copilot, Cursor (2.6+), ChatGPT and Goose, among others. Not rendered by Claude Code (it hides `ui://` resources) or Zed.

### Cited Findings
**Claude Code (CLI)** — changelog line plus the npm publish date of that version:
- 1.0.44 (2025-07-07): "tool annotations and tool titles now display in /mcp view". — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md); [npm times](https://registry.npmjs.org/@anthropic-ai/claude-code)
- 2.0.21 (2025-10-16): "Support MCP `structuredContent` field in tool responses". 2.1.128 (2026-05-04): fixed images being dropped "when the server returns both structured content and content blocks". — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2.1.76 (2026-03-14): "Added MCP elicitation support — … interactive dialog (form fields or browser URL)", plus new `Elicitation`/`ElicitationResult` hooks. — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- 2.1.281 (2026-09-23): URL-mode elicitation on 2026-07-28 connections, and MCP Apps UI resources skipped in resource lists.
- 2.1.287 (2026-10-01): "URL prompts from MCP servers on the 2025-11-25 protocol". The fallback is `"bareElicitationCapability": true`.
- 2.1.292 (2026-10-06): "local (stdio) MCP server connections … negotiate protocol version 2026-07-28 by default on every install"; `MCP_PROTOCOL_NEGOTIATION=legacy` opts out.
- 2.1.238 (2026-08-20): fixed stdio servers getting `server/discover` before `initialize`. — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Docs on the v2 runtime: Claude Code "asks HTTP, stdio, and claude.ai connector servers whether they support the newer revision, and uses it with those that do. It connects to every other server as v1 does." — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- Docs on elicitation:
  - Form mode shows server-defined fields. URL mode asks whether to open a link and passes it to the OS URL handler; URLs over roughly 8,000 characters can only be declined.
  - "To auto-respond to elicitation requests without showing a dialog, use the `Elicitation` hook."
  - On 2026-07-28 connections Claude Code declares `elicitation: {form: {}, url: {}}`.
  - Conflict: the docs give "a username and password prompt" as a form-mode example, but the 2025-11-25 spec says servers MUST NOT request passwords via form mode.
  — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp); vs [elicitation 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-11-25/client/elicitation.mdx)
- **`_meta["anthropic/requiresUserInteraction"]: true`** (must be the JSON boolean `true`):
  - Claude Code shows the tool's permission prompt "on every call, even in `acceptEdits`, `auto`, and `bypassPermissions`", with no "don't ask again".
  - Allow rules don't skip it. `dontAsk` mode denies the call.
  - With `--permission-prompt-tool`, an `allow` is converted to a deny.
  - The Agent SDK `canUseTool` callback *can* approve, "because your SDK application is expected to show them to a user".
  - Remote Control withholds one-tap approval for such tools (v2.1.214+, published 2026-07-18).
  - The docs' stated use case: "a consent or access-grant step where auto-approval would mean no human ever agreed."
  — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- On the permissions page, hook `"allow"` decisions and mod `tool.check` approvals don't skip the prompt for `requiresUserInteraction` tools (the mod part requires v2.1.292+). The fetched page describes no handling of `readOnlyHint`/`destructiveHint` for MCP tools. MCP tool permissions are expressed as `mcp__<server>__<tool>` rules. A 2.1.246 (2026-08-25) fix removed the "don't ask again" option for these tools. — [Claude Code permissions](https://code.claude.com/docs/en/permissions); [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Other server-author knobs:
  - `_meta["anthropic/maxResultSizeChars"]` raises a tool's persist-to-disk threshold from 50,000 to up to 500,000 characters.
  - Images returned by tools are seen inline and also saved to files (v2.1.283+).
  - Tool descriptions and server instructions are cut at 4,096 characters, or 16,384 for tools loaded via tool search.
  - `_meta["anthropic/alwaysLoad"]` controls deferral.
  - Tool input schemas must be valid JSON Schema 2020-12, and top-level property names must be 1–64 characters long.
  — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- Claude Code MCP Apps handling: "MCP Apps UI resources … don't appear in the `@` suggestions or in the resource list tool's results". The page doesn't describe any rendering. — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

**Claude (web), Claude Desktop, Cowork**
- MCP Apps are supported in Claude web and Claude Desktop. — [extension client matrix (last updated 2026-09-28)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx); [MCP Apps launch post 2026-01-26](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-01-26-mcp-apps.md)
- Connector tool permissions are "Always allow, Needs approval, or Blocked". Owners set them org-wide, and permissions are "categorized by type (for example, read-only tools, write/delete tools)". The article doesn't say whether the grouping comes from annotations. — [Use connectors (support.claude.com)](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)
- Cowork: "Read-only tools are exempt only when the connector annotates them as read-only. Most custom connectors don't annotate their tools, so every tool on those connectors is gated." — [Cowork on Team/Enterprise](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans)
- The directory submission portal groups a server's tools "by whether their annotations declare them read-only or write". — [Submit a connector](https://claude.com/docs/connectors/building/submission)

**VS Code / GitHub Copilot** — release notes in microsoft/vscode-docs:
- 1.100 (2025-05-08): "tools marked with `readOnlyHint: true` … will be allowed to run without requiring user confirmation". — [v1_100](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_100.md)
- The current MCP developer guide: "The confirmation dialog will be shown for all tools that are not marked with the `readOnlyHint` annotation." Listed features include elicitation, sampling, roots, server instructions and MCP Apps. — [VS Code MCP dev guide](https://github.com/microsoft/vscode-docs/blob/main/api/extension-guides/ai/mcp.md)
- 1.102 (2025-07-09): elicitation support. — [v1_102](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_102.md)
- 1.103 (2025-08-07): "fully supports … `2025-06-18`, with support for `resource_link`s and structured output". — [v1_103](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_103.md)
- 1.105 (2025-10-09): a built-in MCP marketplace "powered by the GitHub MCP registry" (preview). — [v1_105](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_105.md)
- 1.106 (2025-11-12): "Post-approval" lets users review the data a tool pulled in before it is used, as a prompt-injection defence. It applies to "MCP tools that declare `openWorldHint`". The same release added registry and allowlist control through GitHub org policy. — [v1_106](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_106.md)
- 1.107 (2025-12-10): supports 2025-11-25, "URL mode elicitation", Tasks and enum enhancements. — [v1_107](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_107.md)
- 1.109 (2026-02-04): MCP Apps support. — [v1_109](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_109.md)
- 1.112 (2026-03-18): elicitation forms use the Ask Questions UI. — [v1_112](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_112.md)
- The user docs (updated 2026-10-14) say "MCP Apps appear inline when an MCP server supports them". Sandboxed servers' tool calls are auto-approved. — [VS Code MCP servers docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

**OpenAI Codex (CLI)**
- MCP server config: `default_tools_approval_mode` takes `auto`, `prompt`, `writes` or `approve`, with per-tool `tools.<tool>.approval_mode` overrides. "The `writes` mode prompts for tools that aren't marked read-only." The docs don't state the default. (developers.openai.com/codex/mcp now redirects 308 to learn.chatgpt.com.) — [Codex MCP docs](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- Source, at commit a083a1e49e (2026-10-16), `requires_mcp_tool_approval`:
  - in `auto` mode, approval is required if `destructiveHint == true`;
  - it is skipped if `readOnlyHint == true`;
  - otherwise it is required unless `destructiveHint == false` **and** `openWorldHint == false` (unset counts as true);
  - `prompt` always asks and `approve` never asks.
  — [mcp_tool_call.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/mcp_tool_call.rs); [config.schema.json](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)
- Elicitation: the app-server protocol defines `McpServerElicitationRequest`, and the granular approval config has an `mcp_elicitations` boolean ("Whether to allow MCP elicitation prompts"). Releases rust-v0.155 (2026-09-17) through 0.163 (2026-10-15) fix elicitation cancellation, add clickable URLs in elicitation prompts (0.162.0, 2026-10-08), and signal abandoned elicitations. — [config.schema.json](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json); [releases](https://github.com/openai/codex/releases); [PR #51611](https://github.com/openai/codex/pull/51611)
- **Guardian/auto-review.** `approvals_reviewer` can be `auto_review`, which "uses a carefully prompted subagent" to approve or deny requests, "MCP approval prompts" included. PR #51067 (merged 2026-10-05) feeds context to "Guardian MCP elicitation reviews", which can return "the denial to the parent model". — [config.schema.json](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json); [PR #51067](https://github.com/openai/codex/pull/51067)
- MCP Apps: the app-server now carries MCP App UI metadata (`resourceUri`, display mode inline/fullscreen) in tool-call events (PR #45805, merged 2026-09-15). — [PR #45805](https://github.com/openai/codex/pull/45805)

**Cursor**
- Docs list support for Tools, Prompts, Resources, Roots, Elicitation and Apps (extension). They don't say which elicitation modes.
  - "Cursor asks for approval before using MCP tools by default." In auto-run, "allowlisted MCP tools run immediately and everything else is routed through the classifier."
  - Annotations and structured output aren't mentioned.
  - Tool-returned images are attached to chat as base64.
  — [Cursor MCP docs](https://cursor.com/docs/context/mcp)
- MCP Apps arrived in Cursor 2.6, per a forum announcement dated 2026-03-03 ("render right in your agent chat", sandboxed iframe). — [Cursor 2.6: MCP Apps](https://forum.cursor.com/t/cursor-2-6-mcp-apps/153482)
- User bug reports (not confirmed by Cursor): elicitation not rendering in the Agents window (3.6.31) and hanging on Windows (3.10.20). — [forum: Agents window](https://forum.cursor.com/t/mcp-elicitation-does-not-render-in-the-cursor-agents-window-on-macos/162243); [forum: Windows hang](https://forum.cursor.com/t/mcp-elicitation-create-hangs-agent-on-windows-in-cursor-3-10-20-but-works-on-macos/165391)

**Windsurf (docs now under "Devin Desktop")**
- `docs.windsurf.com/windsurf/cascade/mcp` 307-redirects to `docs.devin.ai/desktop/cascade/mcp`, which calls the product "Devin Desktop" and Cascade a legacy agent. The page says:
  - "We currently support an MCP server's tools, resources, and prompts", over stdio, Streamable HTTP and SSE, with OAuth.
  - "Cascade does not have an MCP Marketplace or one-click install."
  - Cascade has a limit of 100 total tools.
  - Elicitation, annotations and Apps aren't mentioned.
  — [Devin Desktop Cascade MCP docs](https://docs.devin.ai/desktop/cascade/mcp)

**Zed**
- "Zed currently supports MCP's Tools and Prompts features." Zed invites contributions for "Discovery, Sampling, Elicitation, etc". Tool approval defaults to `"confirm"` for every tool action, MCP included, with per-tool rules `mcp:<server>:<tool>`. MCP servers ship as Zed extensions. The page was last touched 2026-09-19. — [Zed MCP docs](https://github.com/zed-industries/zed/blob/main/docs/src/ai/mcp.md)

**Cross-client MCP Apps matrix** (community-maintained, last updated 2026-09-28): Claude web, Claude Desktop, VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam, ChatGPT, Cursor, Archestra.AI, PostHog Code. — [client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx)

### Inferences
Summary matrix (✓ documented, ✗ documented absent, ? not found):

| Client | Elicitation | Annotations drive approval | Structured output | MCP Apps |
|---|---|---|---|---|
| Claude Code | ✓ form and URL | ? (displays them; own `_meta` force-prompt) | ✓ | ✗ (hides `ui://` resources) |
| Claude Desktop/web | ? | partial (read-only grouping; Cowork read-only exemption) | ? | ✓ |
| Cursor | ✓ (mode ?) | ? (allowlists plus classifier) | ? | ✓ (2.6+) |
| VS Code/Copilot | ✓ form and URL | ✓ (`readOnlyHint` skips confirm; `openWorldHint` post-approval) | ✓ | ✓ |
| Codex | ✓ (incl. URL) | ✓ (auto/writes modes) | ? | partial (app-server metadata) |
| Windsurf/Devin | ? | ? | ? | ? |
| Zed | ✗ | ✗ (confirm-all default) | ? | ✗ |

- Approval-relevant annotations reward correct annotation in VS Code, Codex and Cowork. An unannotated read-only tool causes prompt fatigue in Codex `auto` mode and is "gated" in Cowork.
- Three clients route human-in-the-loop decisions to automation by user configuration: the Claude Code Elicitation hook, the Codex Guardian, and the Cursor classifier. A server therefore can't treat "the client confirmed" or "an elicitation was accepted" as proof of a human decision. Only Claude Code's `requiresUserInteraction` is documented as resisting automation, and even it can be approved programmatically through the Agent SDK `canUseTool`.

### Gaps
- Claude Desktop/claude.ai elicitation support: no Anthropic source found. A third-party vendor page summarized in search results claims claude.ai and Cowork don't support it; I didn't fetch or verify it.
- Cursor: whether URL mode is supported, and whether annotations affect auto-run. Not in the docs.
- VS Code: whether it negotiates 2026-07-28 or MRTR. Not mentioned in release notes 1.100–1.142 (through 2026-10-14).
- Codex: the default value of `default_tools_approval_mode`, and whether the CLI TUI renders MCP Apps.
- Claude Code: whether `readOnlyHint` influences plan-mode or auto-mode classification of MCP tools. Not documented on the fetched pages.
- Windsurf/Devin Desktop: elicitation, annotations, Apps, and whether a newer non-Cascade agent supports more MCP features.

## 3. The official MCP Registry: status, listing an npm stdio server, publishing CLI, and downstream consumers

### Takeaway
The registry is still **preview**: "Breaking changes or data resets may occur before general availability". Its API has been frozen at v0.1 since 2025-10-24. Listing an npm stdio server takes four steps: add `mcpName` to `package.json`, publish to public npm, write a matching `server.json`, and run `mcp-publisher login` (GitHub OAuth device flow, GitHub Actions OIDC, or DNS/HTTP for a custom domain) followed by `mcp-publisher publish`. Downstream channels are uneven:
- GitHub's registry and VS Code pick up registry data, though GitHub's 2025 guidance still asked publishers to email for inclusion.
- Docker runs its own PR-reviewed catalog.
- Anthropic's directory doesn't take local servers except inside a plugin.

### Cited Findings
- Status: "The MCP Registry is currently in preview. Breaking changes or data resets may occur before general availability." The same note is on the About, Authentication, Aggregators and FAQ pages; About was last changed 2026-05-02. The registry is backed by "Anthropic, GitHub, PulseMCP, and Microsoft". It hosts metadata only, supports public packages only, and "does not support private servers". — [registry about](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/about.mdx); [registry FAQ](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/faq.mdx)
- Timeline: launched in preview 2025-09-08; "API freeze (v0.1)" announced 2025-10-24. The latest registry release was v1.8.1 (2026-08-06). — [registry README](https://github.com/modelcontextprotocol/registry/blob/main/README.md); [registry releases](https://github.com/modelcontextprotocol/registry/releases); [preview launch post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2025-09-08-mcp-registry-preview.md)
- npm specifics:
  - Only the public npm registry is supported.
  - `server.json` uses the `$schema` `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`, with `packages: [{registryType: "npm", identifier, version, transport: {type: "stdio"}}]`.
  - "The MCP Registry verifies ownership of npm packages by checking `mcpName` in `package.json`. The `mcpName` property **MUST** match the server name from `server.json`."
  — [package types](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/package-types.mdx)
- Publishing flow: publish to npm first, then install the `mcp-publisher` binary (GitHub release or Homebrew), then `mcp-publisher init` (generates `server.json`), then `mcp-publisher login github`, then `mcp-publisher publish`. With GitHub auth, `mcpName` "must start with `io.github.my-username/`". — [registry quickstart](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/quickstart.mdx)
- Namespace verification: — [registry authentication](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/authentication.mdx); [GitHub Actions guide](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/github-actions.mdx)
  - GitHub OAuth (device flow) gives `io.github.username/*` or `io.github.orgname/*`.
  - DNS TXT record (`v=MCPv1; k=ed25519; p=…`; key material can live in Google KMS or Azure Key Vault) gives `com.example/*`.
  - An HTTP file at `/.well-known/mcp-registry-auth` also gives `com.example/*`.
  - The GitHub Actions workflow uses OIDC (`id-token: write`) and is marked "recommended".
- Lifecycle: you can't delete or unpublish; version metadata "is immutable (similar to npm)". Custom metadata under `_meta.io.modelcontextprotocol.registry/publisher-provided` is capped at 4 KB. — [registry FAQ](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/faq.mdx)
- Consumption model:
  - Aggregators scrape the unauthenticated `GET /v0.1/servers`, which uses cursor pagination and supports a since-filter, "once per hour". The registry "does not provide uptime or data durability guarantees".
  - Host apps are expected to consume downstream registries that implement the OpenAPI spec, not the official registry directly.
  — [registry aggregators](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/registry-aggregators.mdx); [registry about](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/about.mdx)
- Live API check (2026-10-19): — [registry API: playwright](https://registry.modelcontextprotocol.io/v0.1/servers?search=playwright&limit=8&version=latest); [registry API: chrome-devtools](https://registry.modelcontextprotocol.io/v0.1/servers?search=chrome-devtools&limit=8&version=latest); [npm @playwright/mcp](https://registry.npmjs.org/@playwright/mcp/latest)
  - `io.github.microsoft/playwright-mcp` latest 0.0.82 (published 2026-09-18), while npm `@playwright/mcp` is 0.0.83, whose `mcpName` is `io.github.microsoft/playwright-mcp`.
  - `io.github.ChromeDevTools/chrome-devtools-mcp` 1.11.0 (2026-10-15).
  - Look-alike entries from other namespaces also appear, for example `io.github.secforge/chrome-devtools-mcp`, `io.github.Async23/chrome-devtools-mcp` and `io.github.dinesh-nalla-se/playwright-mcp`.
- **GitHub MCP Registry** (blog dated 2025-10-24): "downstream registries (like GitHub's) automatically pick up updates". The same post says that after publishing you should "email partnerships@github.com and request for your server to be included", and that self-publication was "Expected in the next couple months". — [GitHub blog how-to](https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/)
- VS Code's `@mcp` gallery and "Browse MCP Servers" use this registry; organizations can point VS Code at a custom registry through policy. — [v1_105](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_105.md); [v1_106](https://github.com/microsoft/vscode-docs/blob/main/release-notes/v1_106.md); [VS Code MCP servers docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
- **Docker MCP Catalog** is a separate, PR-reviewed registry. Submissions are a `servers/<name>/server.yaml`, produced by `task wizard` or `task create`, which builds the Dockerfile and checks that the server lists tools. Two options:
  - Docker-built images: "cryptographic signatures, provenance tracking, and Software Bills of Materials" (vendor claim).
  - Self-provided images.
  "Every pull request requires a review from the Docker team." Entries appear in hub.docker.com/mcp and the Docker Desktop MCP Toolkit. The fetched README and CONTRIBUTING lines don't mention ingesting the official registry. — [docker/mcp-registry README](https://github.com/docker/mcp-registry); [CONTRIBUTING](https://github.com/docker/mcp-registry/blob/main/CONTRIBUTING.md)
- **Anthropic Connectors Directory**:
  - Remote servers only: "A local server can't be submitted on its own; include it in a plugin instead". "Desktop extension listings in the directory are deprecated, and the directory no longer accepts local servers packaged as MCP Bundles (MCPB)."
  - Every connector tool must have "a `title` and the applicable `readOnlyHint` or `destructiveHint`".
  - Submissions are auto-scanned and listed as Community by default.
  - Plugins are submitted from GitHub repos and validated plus security-scanned per version.
  — [Submit a connector](https://claude.com/docs/connectors/building/submission); [Submit a plugin](https://claude.com/docs/plugins/submit)
- Cursor: "Browse official plugins in the Cursor Marketplace", with community MCP servers on cursor.directory. Marketplace plugins are "manually reviewed" and must be open source. — [Cursor MCP docs](https://cursor.com/docs/context/mcp); [Cursor plugins docs](https://cursor.com/docs/plugins)
- The roadmap mentions a Server Card Working Group working on `.well-known` metadata, so a server can be "discovered and reasoned over without connecting to it". — [roadmap post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-08-22-mcp-roadmap.md)

### Inferences
- Registry listing is cheap and permanent. Versions are immutable and can't be unpublished, so the first published `server.json` should be correct.
- Look-alike names show that namespace verification protects only the namespace, not the server name. Claiming `io.github.<owner>/…` early, and linking it from docs, helps users find the genuine entry.
- The Playwright entry lagging npm by a version suggests registry publishing should run in the same CI job as `npm publish`, as in the official Actions example.
- For Claude users, the registry is not the distribution path for a stdio server. A Claude Code plugin is.

### Gaps
- Whether GitHub's registry now lists self-published servers automatically, without the 2025 email step. Only the 2025 blog was fetched. The GitHub enterprise-allowlist bypass caveat seen in a search snippet wasn't verified on the GitHub Docs page.
- Whether the Docker catalog or Cursor's directory ingests the official registry.
- No registry GA announcement was found. The blog index through 2026-08-22 shows none.

## 4. MCP Apps (SEP-1865): status, spec location, rendering clients, and whether a visual diff viewer could render inside an agent client

### Takeaway
MCP Apps is an official, Final extension (`io.modelcontextprotocol/ui`) with a Stable spec version 2026-01-26 in the ext-apps repo. Hosts render sandboxed HTML views from `ui://` resources. A tool can be made **app-only** (`visibility: ["app"]`), which hides it from the model while the UI can still call it. A side-by-side/swipe diff viewer is technically a good fit: images are allowed via `data:` URIs by default, and there are inline/fullscreen/pip display modes. It would render in Claude Desktop/web, VS Code Copilot, Cursor, ChatGPT and Goose, but not in Claude Code's terminal or in Zed.

### Cited Findings
- SEP-1865 "MCP Apps: Interactive User Interfaces for MCP": Status **Final**, created 2025-11-21. — [SEP-1865](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp.md)
- Spec versions: 2026-01-26 "Stable" (`specification/2026-01-26/apps.mdx`) and "draft" in development. ext-apps v2.0.0 (2026-09-08) has peers `@modelcontextprotocol/client@^2.0.0` and `server@^2.0.0`. "The wire protocol is unchanged between `ext-apps` 1.x and 2.x". The last 1.x release was v1.7.5 (2026-07-23). Repo stars: 2,978. — [ext-apps README](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md); [ext-apps releases](https://github.com/modelcontextprotocol/ext-apps/releases)
- Mechanism:
  - A tool's `_meta.ui.resourceUri` points to a `ui://` resource.
  - The host preloads it, fetches it via `resources/read`, and renders it in a sandboxed iframe.
  - The app talks to the host over a postMessage JSON-RPC dialect (`ui/initialize`, …), can call server tools, and can update model context.
  — [Apps overview](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/apps/overview.mdx)
- Spec requirements: — [apps spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
  - URIs MUST use `ui://`; the mimeType MUST be `text/html;profile=mcp-app`.
  - The restrictive default CSP includes `img-src 'self' data:; media-src 'self' data:; connect-src 'none'`. Servers can declare `connectDomains` and `resourceDomains`. Hosts "MUST NOT allow undeclared domains".
  - **Visibility**: default `["model","app"]`. "Host MUST NOT include tools in the agent's tool list when their visibility does not include `"model"`", and MUST reject app calls to tools without `"app"`.
  - Display modes are `inline`, `fullscreen` and `pip`.
  - For app-sent messages, "Host MAY request user consent".
- Client support:
  - Overview page: Claude, Claude Desktop, VS Code GitHub Copilot, M365 Copilot, Goose, Postman, MCPJam, Archestra.AI.
  - Matrix adds ChatGPT, Cursor and PostHog Code.
  - The 2026-01-26 launch post said Claude (web and desktop), Goose and VS Code were available, and ChatGPT was "starting this week".
  — [Apps overview](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/apps/overview.mdx); [client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx); [launch post](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-01-26-mcp-apps.md)
- Stdio works: the ext-apps examples are published as `@modelcontextprotocol/server-<name>`, to "add … to an MCP client that supports stdio (Claude Desktop, VS Code, etc.)". — [ext-apps README](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md)
- The examples include a pdf-server, video-resource-server, cohort-heatmap and system-monitor, plus framework starters. ext-apps also ships agent skills (`create-mcp-app`, `add-app-to-server`, …) installable in Claude Code via `/plugin marketplace add modelcontextprotocol/ext-apps`. — [ext-apps README](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md)
- Anthropic's directory accepts MCP Apps only as remote servers, with 3–5 PNG carousel screenshots. — [Submit a connector](https://claude.com/docs/connectors/building/submission)
- Claude Code skips `ui://` / `text/html;profile=mcp-app` resources. — [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

### Inferences
- A diff viewer (side-by-side, swipe, onion-skin) is plain HTML/JS. Under the default CSP it could embed baseline and candidate screenshots as `data:` URIs with no CSP declarations at all.
- A "Promote" button could call an app-only `promote_baseline` that the agent can't see or invoke. That is a stronger separation than a self-asserted boolean, though still mediated by the same host process and session. It only works where Apps render, so coding-agent CLIs (Claude Code, Zed, likely the Codex TUI) need a fallback.
- On SDK v1 the server would pair with ext-apps 1.x; ext-apps 2.x requires SDK v2.

### Gaps
- No evidence on Apps rendering in the Claude desktop app's Code surface (as opposed to chat) or in the Codex CLI.
- Image-size limits in the Apps postMessage channel were not checked.
- No visual-testing vendor MCP App was found in this pass. I did not search exhaustively.

## 5. Browser and visual MCP servers used by coding agents, and Playwright's test agents

### Takeaway
Playwright MCP (38.4k stars) and Chrome DevTools MCP (53.8k stars, the more active of the two) both expose accessibility snapshots and screenshots. Chrome DevTools also exposes CSS cascade inspection and Lighthouse. **Neither offers baseline storage, image comparison or approval tools**, so they complement rather than compete with a visual-regression server. Playwright's healer agent edits tests, including "assertions and expected values", and is told not to ask the user. Its MCP test tools can't run `--update-snapshots`.

### Cited Findings
**microsoft/playwright-mcp**
- 38,361 stars; repo created 2025-03-21. 12 releases from v0.0.72 (2026-04-30) to v0.0.83 (2026-09-28), roughly two a month, still on 0.0.x. Ships `server.json`; npm `mcpName` is `io.github.microsoft/playwright-mcp`. — [repo](https://github.com/microsoft/playwright-mcp); [releases](https://github.com/microsoft/playwright-mcp/releases); [npm](https://registry.npmjs.org/@playwright/mcp/latest)
- Tools (README): — [README](https://github.com/microsoft/playwright-mcp/blob/main/README.md)
  - `browser_snapshot`: "Capture accessibility snapshot of the current page, this is better than screenshot". Options: `target`, `depth`, `boxes` (bounding boxes), `filename`. Marked read-only.
  - `browser_take_screenshot`: viewport, fullPage or element; png/jpeg/webp; `scale` css or device. "You can't perform actions based on the screenshot". Marked read-only.
  - `browser_annotate`: the user draws annotations; the tool "Returns the annotated screenshot, ARIA snapshot, and the list of annotations".
  - `--caps` opt-ins: vision (coordinate actions), pdf, devtools, config, network, storage, testing. The testing caps add `browser_verify_element_visible/list/text/value` and `browser_generate_locator`.
  - Each tool is marked "Read-only: true/false".
  - No compare, diff or baseline tool appears anywhere in the generated tool list.
- Positioning (vendor claim): "If you are using a **coding agent**, you might benefit from using the CLI+SKILLS instead." The README argues that coding agents "increasingly favor CLI–based workflows exposed as SKILLs over MCP because CLI invocations are more token-efficient", and that MCP is for "persistent state, rich introspection … self-healing tests". — [README](https://github.com/microsoft/playwright-mcp/blob/main/README.md)
- microsoft/playwright-cli: 14,368 stars, pushed 2026-10-14. Ships `skills/playwright-cli/SKILL.md`, installed via `playwright-cli install --skills`, for use by "Claude Code, GitHub Copilot, or any other coding agent". — [playwright-cli](https://github.com/microsoft/playwright-cli)

**ChromeDevTools/chrome-devtools-mcp**
- 53,827 stars; repo created 2025-09-11. 12 releases from v1.1.1 (2026-05-27) to v1.11.0 (2026-10-15), roughly every 1–2 weeks. A CLI is also provided. — [repo](https://github.com/ChromeDevTools/chrome-devtools-mcp); [releases](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases)
- Tools: — [tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)
  - `take_screenshot`: page or element, fullPage, png/jpeg/webp, quality.
  - `take_snapshot`: a11y-tree text with element uids. "Prefer taking a snapshot over taking a screenshot."
  - `get_css_styles`: matched rules, inline and inherited styles, custom properties, and `@layer`/`@media`/`@container`/`@scope` wrappers, with `[overloaded]` losing declarations and source lines.
  - `lighthouse_audit`: accessibility, SEO, best practices, "agentic browsing".
  - Performance trace tools, `emulate`, `resize_page`, `screencast_start/stop`.
  - `compare_heapsnapshots` is about memory, not visuals. No visual baseline or diff tool.

**Playwright Test Agents**
- Three agents: "planner explores the app and produces a Markdown test plan", "generator transforms the Markdown plan into the Playwright Test files", and "healer executes the test suite and automatically repairs failing tests". Install with `npx playwright init-agents --loop=vscode|claude|codex|opencode`; `codex` was added 2026-05-15. They were introduced with Playwright 1.56 (released 2025-10-06); the latest is v1.64.1 (2026-10-14). "Agent definitions are collections of instructions and MCP tools." — [test-agents doc](https://github.com/microsoft/playwright/blob/main/docs/src/test-agents-js.md); [v1.56.0](https://github.com/microsoft/playwright/releases/tag/v1.56.0)
- The healer can't take screenshots and can't update binary screenshot baselines through its tools. It can edit code.
  - Its tools are `search`, `edit`, console and network tools, `browser_evaluate`, `browser_generate_locator`, `browser_snapshot`, `test_debug`, `test_list` and `test_run`.
  - Its instructions include "Updating selectors", "Fixing assertions and expected values", and "Do not ask user questions, you are not interactive tool, do the most reasonable thing possible to pass the test". If it is confident the test is correct but failing, it marks the test `test.fixme()`.
  - `test_run` accepts only `locations` and `projects`, with no update-snapshots option, and is typed `readOnly`.
  — [healer agent](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/agents/playwright-test-healer.agent.md); [testTools.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/mcp/test/testTools.ts)

### Inferences
- "Fixing … expected values" without asking a human means the healer can edit in-code expectations to make a test pass. Inline ARIA snapshot strings are one such case. This is concrete, first-party evidence of the "editing agent blesses its own change" risk. It supports keeping baseline writes away from the editing agent.
- Chrome DevTools' `get_css_styles` covers much of what an agent needs to reason about a CSS fix. The product's value is the regression detection, clustering and baseline workflow, not raw browser access.

### Gaps
- No direct adoption telemetry such as installs per client; stars and release cadence are proxies. npm download counts were not pulled.
- I didn't check whether Playwright's generator emits `toHaveScreenshot` or `toMatchAriaSnapshot` assertions by default.

## 6. Agent Skills as an open standard, plugin/marketplace mechanisms, and whether testing tools ship skills or plugins in 2026

### Takeaway
SKILL.md is now a cross-vendor standard (agentskills.io, originally from Anthropic). It is supported by 46 listed clients, including Claude Code, Codex, Cursor, VS Code/Copilot and Gemini CLI. Packaging has converged on plugins that bundle skills and MCP servers. There is a separate vendor-neutral Agent Plugins 1.0 spec, governed by Amazon, Cursor, Microsoft, OpenAI and Vercel, alongside Claude Code's own `.claude-plugin` marketplaces. Testing vendors moved in 2026:
- Chromatic: a skills repository.
- Percy: an alpha Claude Code plugin with a review/gate loop.
- Chrome DevTools: one repo carrying six manifest formats.
- Playwright: steering coding agents to CLI+skills.

### Cited Findings
**Agent Skills**
- A skill is "a folder containing a `SKILL.md` file" with `name`/`description` metadata, using progressive disclosure (discovery, then activation, then execution). "Originally developed by Anthropic, released as an open standard". Repo created 2025-12-16; 26,294 stars. — [agentskills README](https://github.com/agentskills/agentskills/blob/main/README.md)
- Frontmatter fields: — [spec](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
  - `name`: required, ≤64 characters, lowercase and hyphens.
  - `description`: required, ≤1024 characters.
  - `license`, `compatibility` (≤500 characters) and `metadata`.
  - `allowed-tools` (experimental).
- The client showcase lists 46 products (data file last updated 2026-08-09). They include Claude Code, Claude, "ChatGPT & Codex", Cursor, GitHub Copilot, VS Code, Gemini CLI, Goose, OpenCode, Junie, Kiro, Roo Code, Factory, Amp and TRAE. Windsurf/Devin and Zed aren't listed, though Zed documents skills support. — [clients.jsx](https://github.com/agentskills/agentskills/blob/main/docs/snippets/clients.jsx); [Zed skills docs](https://github.com/zed-industries/zed/blob/main/docs/src/ai/skills.md)
- anthropics/skills (example skills) has 182,126 stars. — [anthropics/skills](https://github.com/anthropics/skills)
- **Skills over MCP** extension `io.modelcontextprotocol/skills` (SEP-2640 "Final"):
  - Servers declare `resources` plus the extension, and implement `skills/list`/`skills/get`. Files are served via `resources/read`.
  - Reading SKILL.md "does not itself activate a skill"; the host applies verification and approval.
  - Client support is listed only for ChatGPT (partial), fast-agent (partial), MCP Inspector (partial) and mcpc. — [Skills extension overview](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/skills/overview.mdx); [client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx)

**Plugin mechanisms**
- **Claude Code** — [Claude Code: create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces); [Claude Code MCP docs](https://code.claude.com/docs/en/mcp); [Submit a plugin](https://claude.com/docs/plugins/submit):
  - A marketplace is a repo with `.claude-plugin/marketplace.json` (`name`, `owner`, `plugins[]` of `{name, source}`).
  - Sources can be a relative path, `github`, `git-subdir`, `url`, `archive`, `npm` or `command`.
  - Users run `claude plugin marketplace add <owner>/<repo>`, then `claude plugin install <plugin>@<marketplace>`; `claude plugin validate` checks it.
  - `claude-plugins-official` is a reserved name.
  - Plugins can bundle MCP servers via `.mcp.json` or inline `mcpServers`. Plugin tools are named `mcp__plugin_<plugin>_<server>__<tool>`.
  - Directory listing goes through a GitHub-repo submission with per-version scans; listed plugins work in "chat, Cowork, and Claude Code".
- **Agent Plugins** (agent-plugins.org): — [agent-plugins.org](https://agent-plugins.org); [spec repo](https://github.com/agentplugins/agent-plugins-spec)
  - An "open, vendor-neutral standard for packaging … Agent Skills and MCP servers".
  - Layout: `plugin.json` with a `$schema` of `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, `skills/`, `mcp.json`, and reverse-domain client folders.
  - "1.0.0 is the current published release. … 1.1.0 is a working draft." The TSC has "Core Maintainers from Amazon, Cursor, Microsoft, OpenAI, and Vercel".
  - Repo created 2026-04-03; 1,393 stars.
- **Cursor** — [Cursor plugins docs](https://cursor.com/docs/plugins):
  - "Plugins package rules, skills, agents, commands, MCP servers, and hooks". Manifest is `.cursor-plugin/plugin.json`; `.cursor-plugin/marketplace.json` for multi-plugin repos.
  - "Every plugin is manually reviewed before it's listed"; plugins must be open source; submit via cursor.com/marketplace/publish.
  - Team marketplaces are available.
  - "Cursor supports the open Agent Plugins standard", using `${CURSOR_PLUGIN_ROOT}` instead of `${PLUGIN_ROOT}`.
- **Codex/ChatGPT**: plugins "bundle capabilities into reusable workflows in ChatGPT and Codex": skills, MCP servers, browser extensions and hooks. Codex uses `/plugins`, against "the same public plugin catalog" as ChatGPT, with submission via the OpenAI Platform. — [OpenAI plugins docs](https://learn.chatgpt.com/docs/plugins)
  - The manifest paths `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` were observed in Chromatic's repo; the official page I fetched didn't cover them. — [chromatic-skills tree](https://github.com/chromaui/chromatic-skills)
- **GitHub Copilot** (search-result level, not fetched): a GitHub changelog entry titled "Agent Plugins 1.0 in VS Code, Copilot CLI, and the Copilot app" (2026-08-12). Docs summarized in search results say Copilot CLI accepts Agent Plugins 1.0 plus a legacy format, and reads `marketplace.json` from `.github/plugin/` and `.claude-plugin/`. — [GitHub changelog 2026-08-12](https://github.blog/changelog/2026-08-12-agent-plugins-1-0-in-vs-code-copilot-cli-and-the-copilot-app/); [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
- The `skills` npm CLI (v1.7.2, "The open agent skills ecosystem", from vercel-labs/skills) installs skills with `npx skills add <owner>/<repo>[@skill]`. Chromatic uses it. — [npm skills](https://registry.npmjs.org/skills/latest); [chromatic-skills README](https://github.com/chromaui/chromatic-skills)

**Testing and visual tools shipping skills or plugins (2026)**
- **Chrome DevTools MCP**, one repo with:
  - `.claude-plugin/marketplace.json` plus `plugin.json`, with an MCP server pinned to `npx chrome-devtools-mcp@1.11.0`;
  - `.cursor-plugin/plugin.json`, `.github/plugin/plugin.json`, a root Agent Plugins `plugin.json`, `gemini-extension.json` and `server.json`;
  - 7 skills: a11y-debugging, chrome-devtools, chrome-devtools-cli, cookie-debugging, debug-optimize-lcp, memory-leak-debugging, troubleshooting.
  — [chrome-devtools-mcp repo](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- **Playwright**: the CLI+SKILLS path above.
- **Chromatic**: `chromaui/chromatic-skills` (created 2026-03-24, pushed 2026-10-15, 0 stars). More than 12 skills, including `diagnose-chromatic-baselines` ("Trace why an accepted visual change did not carry forward"), `chromatic-troubleshoot-diff`, `chromatic-setup-ci` and TurboSnap tools. "Built on the Agent Skills open standard". Includes a Codex plugin manifest. — [chromatic-skills](https://github.com/chromaui/chromatic-skills)
- **Percy (BrowserStack)**: `percy/percy-visual-testing-agent`, "[Alpha] Visual testing on autopilot for AI coding agents" (vendor framing). Created 2026-07-09. — [Percy plugin README](https://github.com/percy/percy-visual-testing-agent); [percy-gate SKILL.md](https://github.com/percy/percy-visual-testing-agent/blob/main/plugins/percy-visual-testing/skills/percy-gate/SKILL.md); [percy-review SKILL.md](https://github.com/percy/percy-visual-testing-agent/blob/main/plugins/percy-visual-testing/skills/percy-review/SKILL.md)
  - Install: Claude Code via `/plugin marketplace add percy/percy-visual-testing-agent`; Cursor, Codex, Antigravity and Gemini via a `curl … install.sh | bash` that copies skills and appends to `AGENTS.md`; Copilot slash commands with `--copilot`.
  - 11 skills, including `percy-visual-intent`, `percy-review` and `percy-gate`.
  - percy-gate: "In v1, **every reject decision is confirmed by the human**… v2 will auto-reject high-confidence cases." "Auto-approve is symmetric with auto-reject. Both require human confirmation in v1." It checks write credentials (`PERCY_USERNAME` + `PERCY_ACCESS_KEY` in env) before any approve/reject.
  - `percy-review` "does not approve or reject builds".
- **BrowserStack**: `browserstack-cursor-plugin` (created 2026-02-05) and `agent-skills` ("AI agent (onboarding) skills for Automate customers", created 2026-07-13). — [browserstack org repos](https://github.com/browserstack)
- **Applitools**: the `applitools/mcp` repo contains `server.json`; no SKILL.md or plugin manifests were found in its tree. The MCP server itself was covered in the earlier pass. — [applitools/mcp](https://github.com/applitools/mcp)
- **Argos / Happo / Lost Pixel**: no repos with skill, plugin, agent, MCP or AI in the name among each org's 100 most recently pushed repos. — [argos-ci org](https://github.com/argos-ci); [happo org](https://github.com/happo)

### Inferences
- The emerging distribution pattern is one GitHub repo carrying the MCP server (npm, pinned), a `server.json`, task-level SKILL.md files, and several plugin manifests. Chrome DevTools is the clearest template.
- Vendors use skills to encode *workflow policy*. Percy's gate loop and Chromatic's baseline-diagnosis playbooks are examples. Skills are a natural place for "never promote a baseline yourself; hand off to a human". That is guidance, not enforcement.
- Percy's agent holds write credentials in its environment and relies on in-chat confirmation. That is functionally the same trust model as `confirm_reviewed: true`, which suggests the market hasn't solved credential separation for agent-driven baseline approval.

### Gaps
- Codex manifest field reference: the official developer guide covering `.codex-plugin/plugin.json` wasn't reachable. One URL returned 404 and the main page defers to a guide I didn't fetch.
- Copilot plugin facts rest on search-result summaries of GitHub Docs and Changelog pages that I didn't open.
- Whether Claude Code reads Agent Plugins-format `plugin.json` (root manifest with `$schema`). Not found.
- Argos may ship skills inside an existing repo. The search covered repo names only.

## Roadmap implications

Each item is tagged. Evidence pointers refer to the sections above.

1. **[NEW] Declare tool annotations on every tool (small; SDK ^1.32 already supports `annotations`).**
   - Read-only tools (list regressions, inspect a diff cluster's DOM, suggest a CSS fix, list recent runs): `title`, `readOnlyHint: true`, `openWorldHint: false`.
   - Sandbox CSS-patch verification: `readOnlyHint: true` only if it leaves no persistent state; otherwise `destructiveHint: false, idempotentHint: true, openWorldHint: false`.
   - `accept_baseline` and `promote_baseline`: `readOnlyHint: false, destructiveHint: true, openWorldHint: false`, and `idempotentHint: true` only if re-accepting is a no-op.
   - Payoff:
     - VS Code skips confirmation for read-only tools.
     - Codex `auto`/`writes` modes auto-approve read-only tools and always prompt on destructive ones.
     - Cowork exempts only annotated read-only tools.
     - Anthropic's directory *requires* `title` plus `readOnlyHint`/`destructiveHint`.
   - Don't treat any annotation as a security control: the spec says annotations are untrusted, and the blog says "An untrusted server can lie". (§1, §2, §3)
2. **[EVIDENCE-FOR-EXISTING-ITEM: "Separate baseline writes from the agent that edited the UI"] Set `_meta["anthropic/requiresUserInteraction"]: true` on `promote_baseline` (and probably `accept_baseline`).** This is a few lines and Claude Code-only.
   - In Claude Code it forces a human prompt on every call, even in `auto`/`bypassPermissions`, with no "don't ask again".
   - Allow rules, hook "allow" and mod approvals don't skip it; `dontAsk` and `--permission-prompt-tool` deny.
   - Document the gaps: the Agent SDK `canUseTool` can approve programmatically, and other clients ignore the key. (§2)
3. **[EVIDENCE-FOR-EXISTING-ITEM] Replace the self-asserted `confirm_reviewed: true` with an out-of-band human approval as the authoritative gate.** Use URL-mode elicitation to an approval page where a human authenticates with a credential the agent never holds.
   - Spec obligations:
     - the URL must not carry secrets or be pre-authenticated;
     - the server must verify that the opener is the initiating user;
     - credentials must never go back to the client;
     - under 2026-07-28, any carried state goes in an integrity- and replay-protected `requestState`.
   - Client coverage:
     - Claude Code: URL mode on 2026-07-28 connections (2.1.281+) and 2025-11-25 connections (2.1.287+).
     - VS Code 1.107+.
     - Codex.
     - Cursor: mode unverified.
     - Zed: none.
   - Fallback for clients without URL mode: return an `isError` tool result telling the model a human must approve, with a link. Never promote on the boolean alone. (§1, §2)
4. **[EVIDENCE-FOR-EXISTING-ITEM] Don't use form elicitation or client-side confirmation as proof of human review.**
   - Claude Code's `Elicitation` hook can auto-respond without a dialog.
   - Codex's Guardian (`approvals_reviewer = auto_review`) reviews MCP approval prompts and elicitations with a subagent.
   - Cursor's auto-run routes non-allowlisted tools through a classifier.
   - Playwright's healer is told to fix "expected values" and "not ask user questions".
   - Percy's agent plugin keeps write credentials in the agent's environment.
   - Together these support making the baseline store itself enforce a separate credential or role. (§2, §5, §6)
5. **[NEW] Publish to the official MCP Registry (small).**
   - Add `mcpName: io.github.<owner>/<server>` (or a domain namespace) to `package.json`.
   - Commit `server.json` (npm `registryType`, `transport: stdio`).
   - Add `mcp-publisher` via GitHub Actions OIDC in the same job as `npm publish`, so versions don't drift the way Playwright's registry entry lags npm.
   - Caveats: preview status (possible data resets), immutable versions, no unpublish, and look-alike names in the registry. Claim the namespace and link it from the docs.
   - Optional follow-ups: request GitHub MCP Registry inclusion (the 2025 guidance was to email partnerships@github.com); Docker catalog only if a container image is worth maintaining. (§3)
6. **[NEW] Ship a multi-manifest plugin plus skills from the repo (medium).**
   - `.claude-plugin/marketplace.json` and `plugin.json`, with the stdio server pinned via `npx <pkg>@<version>`. This is the only path into Anthropic's directory for a local server.
   - A root Agent Plugins 1.0 `plugin.json` for VS Code, Copilot CLI and Cursor.
   - A `.cursor-plugin/plugin.json` for the Cursor Marketplace (manual review, open source required).
   - Optionally a Codex plugin manifest.
   - Example skills: triage visual regressions; fix CSS from a diff cluster and verify in the sandbox; baseline hygiene that explicitly hands promotion to a human.
   - Evidence: Chrome DevTools' six-format repo, Chromatic and Percy skill sets, and Playwright's CLI+skills push. (§3, §6)
7. **[NEW, schedule] Plan the move to SDK v2 / protocol 2026-07-28 before the v1.x support floor (≥ 2027-01-27).**
   - Use `@modelcontextprotocol/codemod`.
   - Serve via `serveStdio`, which serves legacy clients by default.
   - Write elicitation in the `inputRequired(...)` style; the legacy shim covers 2025-era clients.
   - Return `tools/list` in deterministic order.
   - Log only to stderr.
   - Claude Code already negotiates 2026-07-28 with stdio servers that support it and falls back otherwise, so there is no urgency. Not every client documents 2026-07-28 support (VS Code, Cursor, Zed unverified), which is why the dual-era posture matters. (§1, §2)
8. **[NEW, spike] Build an MCP App diff viewer with an app-only promote action.**
   - A `ui://` resource (`text/html;profile=mcp-app`) with side-by-side/swipe views, images as `data:` URIs (allowed by the default CSP), and fullscreen display mode.
   - Accept/promote as `visibility: ["app"]` tools, which hosts must hide from the model.
   - Renders in Claude Desktop/web, VS Code Copilot, Cursor 2.6+, ChatGPT and Goose. Not in Claude Code (hides `ui://`) or Zed, so keep #3 as the universal path.
   - Use ext-apps 1.x on SDK v1, or 2.x after v2.
   - The Anthropic directory lists Apps only for remote servers. (§4)
9. **[ALREADY-SHIPPED] `outputSchema` + `structuredContent`, with small follow-ups.**
   - Keep the serialized-JSON `TextContent` mirror (spec SHOULD).
   - Put screenshots in image content blocks alongside structured content. Claude Code fixed dropped images for that case in 2.1.128, and Cursor attaches base64 images.
   - Return input or precondition failures as `isError` tool results (SEP-1303).
   - Set `_meta["anthropic/maxResultSizeChars"]` (≤500k) or paginate large DOM-inspection outputs.
   - Keep tool descriptions and server instructions under 4,096 characters (Claude Code truncation).
   - 2026-07-28 allows any JSON value in `structuredContent`, so nothing breaks. (§1, §2)
10. **[DO-NOT-BUILD, for now]** Tasks: the experimental core feature was moved and redesigned into an extension in 2026-07-28, and the current tools are short-lived. Sampling, Roots and MCP logging: deprecated in 2026-07-28. Skills over MCP: Final, but client support is partial; distribute skills as files via plugins instead. (§1, §6)
11. **[NEW, positioning/docs] Present the server as a complement to Playwright MCP and Chrome DevTools MCP**, neither of which has baseline, diff or approval tools. Document co-installation, for example Chrome DevTools `get_css_styles` for cascade context during CSS fixes. Consider a token-light CLI+skill path alongside MCP, given Playwright's vendor claim that coding agents favour CLI+skills for token efficiency. (§5)

## Query log

All outbound search queries, verbatim:

**WebSearch**
1. `GitHub MCP Registry publish server listing`
2. `Docker MCP Catalog submit server`
3. `Cursor changelog MCP elicitation`
4. `Chromatic agent skill Claude Code plugin`
5. `Anthropic connectors directory submission tool annotations required`
6. `Cursor MCP Apps support release`
7. `GitHub MCP registry servers self-publish OSS registry` (allowed_domains: docs.github.com, github.blog)
8. `Claude Desktop MCP elicitation support connectors`
9. `Claude connectors tool permissions read-only tools always allow needs approval` (allowed_domains: support.claude.com, claude.com, docs.claude.com)
10. `Copilot CLI plugins plugin.json marketplace MCP servers skills` (allowed_domains: docs.github.com, github.blog)

**GitHub code search (`gh api search/code`)**
11. `read_only_hint repo:openai/codex`
12. `destructive_hint repo:openai/codex`
13. `elicitation repo:openai/codex path:docs` (no results)

**MCP Registry API search**
14. `https://registry.modelcontextprotocol.io/v0.1/servers?search=playwright&limit=8&version=latest`
15. `https://registry.modelcontextprotocol.io/v0.1/servers?search=chrome-devtools&limit=8&version=latest`

**Direct fetches (not searches; listed for transparency)**
- WebFetch:
  - code.claude.com/docs/en/mcp (two parts), /permissions, /plugin-marketplaces
  - code.visualstudio.com/docs/copilot/customization/mcp-servers
  - cursor.com/docs/context/mcp, cursor.com/docs/plugins
  - developers.openai.com/codex/mcp → learn.chatgpt.com/docs/extend/mcp?surface=cli
  - learn.chatgpt.com/docs/extend/plugins?surface=cli (404)
  - developers.openai.com/codex/plugins → learn.chatgpt.com/docs/plugins
  - docs.windsurf.com/windsurf/cascade/mcp → docs.devin.ai/desktop/cascade/mcp
  - agent-plugins.org
  - claude.com/docs/connectors/building/submission.md, claude.com/docs/plugins/submit.md
  - two support.claude.com articles
  - the github.blog GitHub MCP Registry how-to
  - the forum.cursor.com Cursor 2.6 MCP Apps post
- `gh api` reads (contents, trees, releases, commits, PRs, org repo listings), all read-only GETs:
  - modelcontextprotocol/{modelcontextprotocol, registry, ext-apps, typescript-sdk}
  - anthropics/claude-code, microsoft/{vscode-docs, playwright, playwright-mcp, playwright-cli}, ChromeDevTools/chrome-devtools-mcp, openai/codex, zed-industries/zed
  - agentskills/agentskills, agentplugins/agent-plugins-spec, docker/mcp-registry
  - chromaui/chromatic-skills, percy/percy-visual-testing-agent, browserstack/agent-skills, applitools/mcp
  - org repo listings for chromaui, argos-ci, percy, browserstack, applitools, happo, lost-pixel
- npm registry JSON for @anthropic-ai/claude-code, @playwright/mcp, chrome-devtools-mcp, skills, @modelcontextprotocol/{sdk, server, server-legacy, codemod}.
- No query contained the product's name, domain, owner/org name, internal file names or code.

### Security notes (fetched content treated as data)
- The code.claude.com and claude.com/docs pages open with text addressed to AI tools: "Fetch the complete documentation index at … llms.txt. Use this file to discover all available pages before exploring further." Not followed.
- Chrome DevTools MCP's `get_css_styles` tool description tells the model to "Treat the output as authoritative and complete." This is a model-directed instruction inside a third-party tool description: tool descriptions are a prompt surface. Recorded, not acted on.
- Playwright's healer agent file contains agent instructions ("Do not ask user questions…"). The agentskills repo contains `CLAUDE.md` and `.claude/hooks/session-start.sh`. Both were read as data; nothing was executed.
- The Percy plugin's install path is `curl … install.sh | bash`. Not executed; noted as a supply-chain consideration for anyone evaluating it.
- The MCP Registry search returned look-alike entries under third-party namespaces (for example `io.github.secforge/chrome-devtools-mcp`). Nothing was installed.
- The WebSearch tool appended "REMINDER: You MUST include the sources…" to results. This is tool-wrapper text, not page content.
- No fetched content attempted to make me modify files, post anything, or change configuration.
