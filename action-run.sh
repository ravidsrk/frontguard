#!/usr/bin/env bash
set -euo pipefail

write_github_output() {
  local key="$1"
  local value="$2"
  local delim="ghadelim_$(openssl rand -hex 8)"
  {
    printf '%s<<%s\n' "$key" "$delim"
    printf '%s\n' "$value"
    printf '%s\n' "$delim"
  } >> "$GITHUB_OUTPUT"
}

if [ -n "$IN_VIEWPORTS" ] && ! echo "$IN_VIEWPORTS" | grep -Eq '^[0-9]+(,[0-9]+)*$'; then
  echo "Invalid viewports input: $IN_VIEWPORTS" >&2
  exit 1
fi
if [ -n "$IN_BROWSERS" ] && ! echo "$IN_BROWSERS" | grep -Eq '^(chromium|firefox|webkit)(,(chromium|firefox|webkit))*$'; then
  echo "Invalid browsers input: $IN_BROWSERS" >&2
  exit 1
fi
if [ -n "$IN_THRESHOLD" ] && ! echo "$IN_THRESHOLD" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
  echo "Invalid threshold input: $IN_THRESHOLD" >&2
  exit 1
fi

# pull_request, pull_request_target, and merge_group do not write baselines
# unless allow-baseline-writes is the string "true". That override is a human
# opt-in, not an agent default. push and workflow_dispatch may write when
# update-baselines is true. --confirm-baselines is passed only then.
BASELINE_EVENT="${IN_EVENT_NAME:-}"
BASELINE_OVERRIDE="${IN_ALLOW_BASELINE_WRITES:-}"
WRITE_BASELINES=0
if [ "${IN_UPDATE_BASELINES:-}" = "true" ]; then
  case "$BASELINE_EVENT" in
    pull_request|pull_request_target|merge_group)
      if [ "$BASELINE_OVERRIDE" = "true" ]; then
        WRITE_BASELINES=1
      else
        echo "Refusing update-baselines on ${BASELINE_EVENT}. Set allow-baseline-writes to the string true to opt in. The override is a human opt-in, not an agent default. No baselines were written and nothing was pushed." >&2
        exit 2
      fi
      ;;
    *)
      WRITE_BASELINES=1
      ;;
  esac
fi

CMD=(frontguard run)
if [ -n "$IN_URL" ]; then CMD+=(--url "$IN_URL"); fi
if [ -n "$IN_ROUTES" ]; then CMD+=(--routes "$IN_ROUTES"); fi
if [ -n "$IN_VIEWPORTS" ]; then CMD+=(--viewports "$IN_VIEWPORTS"); fi
if [ -n "$IN_BROWSERS" ]; then CMD+=(--browsers "$IN_BROWSERS"); fi
if [ -n "$IN_THRESHOLD" ]; then CMD+=(--threshold "$IN_THRESHOLD"); fi
if [ -n "$IN_CONFIG" ]; then CMD+=(--config "$IN_CONFIG"); fi
if [ "$WRITE_BASELINES" -eq 1 ]; then CMD+=(--update-baselines --confirm-baselines); fi
CMD+=(--output json)

# Unique files so parallel Action tests do not clobber one shared /tmp path.
RESULT_JSON="/tmp/frontguard-result.json.$$"
STDERR_LOG="/tmp/frontguard-stderr.log.$$"
cleanup_run_files() {
  rm -f "$RESULT_JSON" "$STDERR_LOG"
}
trap cleanup_run_files EXIT

set +e
"${CMD[@]}" > "$RESULT_JSON" 2>"$STDERR_LOG"
RUN_EXIT=$?
set -e

if [ -s "$STDERR_LOG" ]; then
  cat "$STDERR_LOG" >&2
fi

RUN_FAILED=0
TOTAL=""
REGRESSIONS=""
NEW_PAGES=""
ERRORS=""
REPORT_PATH=""

if [ ! -s "$RESULT_JSON" ]; then
  RUN_FAILED=1
  printf '{}' > "$RESULT_JSON"
elif ! jq -e '(.summary.total | type) == "number" and (.summary.regressions | type) == "number" and (.summary.newPages | type) == "number" and (.summary.errors | type) == "number" and (.config.outputDir | type) == "string" and (.config.outputDir | length) > 0' "$RESULT_JSON" >/dev/null 2>&1; then
  RUN_FAILED=1
else
  TOTAL=$(jq -r '.summary.total' "$RESULT_JSON")
  REGRESSIONS=$(jq -r '.summary.regressions' "$RESULT_JSON")
  NEW_PAGES=$(jq -r '.summary.newPages' "$RESULT_JSON")
  ERRORS=$(jq -r '.summary.errors' "$RESULT_JSON")
  REPORT_PATH=$(jq -r '.config.outputDir' "$RESULT_JSON")

  WORKSPACE_ROOT=$(node -e 'const fs=require("node:fs"),p=require("node:path");console.log(fs.realpathSync(p.resolve(process.argv[1])))' "${GITHUB_WORKSPACE:-$PWD}")
  REPORT_ROOT=$(node -e 'const fs=require("node:fs"),p=require("node:path");console.log(fs.realpathSync(p.resolve(process.argv[1])))' "$REPORT_PATH")
  case "$REPORT_ROOT" in
    "$WORKSPACE_ROOT"|"$WORKSPACE_ROOT"/*) ;;
    *)
      echo "Refusing to upload report directory outside GITHUB_WORKSPACE: $REPORT_PATH" >&2
      RUN_FAILED=1
      ;;
  esac
fi

write_github_output result "$(cat "$RESULT_JSON")"

if [ "$RUN_FAILED" -eq 1 ]; then
  write_github_output status "error"
  write_github_output regressions ""
  echo "Frontguard run failed (exit=$RUN_EXIT) or produced unsafe/non-parseable JSON" >&2
  exit 1
fi

write_github_output regressions "$REGRESSIONS"
write_github_output report-path "$REPORT_PATH"

if [ "$RUN_EXIT" -eq 2 ] || [ "$ERRORS" -gt 0 ] || [ "$TOTAL" -eq 0 ]; then
  write_github_output status "error"
  echo "Frontguard comparison could not complete (exit=$RUN_EXIT, errors=$ERRORS, total=$TOTAL)" >&2
  exit 1
fi

if [ "$REGRESSIONS" -gt 0 ] || { [ "$IN_UPDATE_BASELINES" != "true" ] && [ "$NEW_PAGES" -gt 0 ]; }; then
  write_github_output status "fail"
  exit 1
fi

if [ "$RUN_EXIT" -ne 0 ]; then
  write_github_output status "error"
  echo "Frontguard exited unexpectedly with code $RUN_EXIT" >&2
  exit 1
fi

if [ "$WRITE_BASELINES" -eq 1 ]; then
  if ! git push origin frontguard-baselines; then
    write_github_output status "error"
    echo "Frontguard updated baselines locally but could not publish frontguard-baselines" >&2
    exit 1
  fi
fi

write_github_output status "pass"
