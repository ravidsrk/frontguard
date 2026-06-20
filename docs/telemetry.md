# Telemetry & Privacy

Frontguard collects **anonymous, opt-out** usage telemetry to understand which features are used and prioritise development. We take privacy seriously — telemetry is designed to be impossible to trace back to you or your project.

## What we collect

Each command sends a single small event containing **only** these fields:

| Field | Example | Why |
|-------|---------|-----|
| `command` | `run` | Which command was used |
| `version` | `0.2.0` | Frontguard version |
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
- ❌ Your identity, IP-derived location, or any persistent identifier
- ❌ Error messages (only the error class name)

## How to opt out

Any **one** of these disables telemetry completely:

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

## Guarantees

- **Non-blocking** — telemetry is fire-and-forget with a 1.5s timeout. It never slows down or fails your run.
- **Fails silently** — network errors are swallowed; the CLI behaves identically whether or not telemetry succeeds.
- **No payload on opt-out** — when disabled, nothing is sent and no network call is made.

## Self-hosting the collector

Point telemetry at your own endpoint:

```bash
export FRONTGUARD_TELEMETRY_ENDPOINT=https://my-collector.example.com/events
```

The payload is a JSON POST with the fields listed above.
