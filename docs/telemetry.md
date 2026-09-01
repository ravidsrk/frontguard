# Telemetry & Privacy

Frontguard's anonymous usage telemetry is **disabled by default**. You can opt in to help prioritise development. The event payload contains no project URL, path, screenshot, config, secret, or persistent user identifier; as with any HTTP request, the receiving network service can observe connection metadata such as the source IP.

## What we collect

When enabled, each instrumented command sends at most one small event containing **only** these fields:

| Field | Example | Why |
|-------|---------|-----|
| `command` | `run` | Which command was used |
| `version` | `0.2.2` | Frontguard version |
| `routes` | `12` | Number of routes tested (count only) |
| `regressions` | `2` | Number of regressions found (count only) |
| `aiProvider` | `openai` / `anthropic` / `none` | Which AI backend, if any |
| `antiFlake` | `true` | Whether anti-flake rendering was on |
| `ci` | `github-actions` | Coarse CI environment label |
| `durationMs` | `4200` | Execution time |
| `errorType` | `TimeoutError` | Error class name (no message) on failure |
| `ts` | `1748000000000` | Timestamp |

## What we NEVER collect

- ❌ URLs or hostnames being tested
- ❌ File paths or directory names
- ❌ Config file contents
- ❌ Screenshots or image data
- ❌ API keys or any secrets
- ❌ Your identity, IP-derived location, or any persistent identifier in the event payload
- ❌ Error messages (only the error class name)

## How to opt in

Set either the environment variable or config field explicitly:

```bash
export FRONTGUARD_TELEMETRY=1
```

```ts
export default {
  // ...
  telemetry: true,
};
```

## How to disable it

Telemetry is already disabled when no opt-in is present. Any **one** of these
also disables it explicitly:

```bash
# Per-invocation flag
npx -p @frontguard/cli frontguard run --no-telemetry

# Environment variable
export FRONTGUARD_TELEMETRY=0

# Cross-tool standard (respected automatically)
export DO_NOT_TRACK=1
```

Or in `frontguard.config.ts`:

```ts
export default {
  // ...
  telemetry: false,
};
```

## Runtime behavior

- **Bounded** — when enabled, the CLI waits for the request for at most 1.5 seconds.
- **Fails silently** — network errors are swallowed and do not change the command result.
- **No payload on opt-out** — when disabled, nothing is sent and no network call is made.

## Self-hosting the collector

Point telemetry at your own endpoint:

```bash
export FRONTGUARD_TELEMETRY_ENDPOINT=https://my-collector.example.com/events
```

The payload is a JSON POST with the fields listed above.
